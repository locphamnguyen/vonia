"""Billing store for Vonia SePay integration — Redis-backed async version.

Two concerns:
* **Orders** — one record per checkout attempt (``pending`` → ``paid`` /
  ``cancelled`` / ``error``). Key: ``vonia:order:{invoice_number}``.
* **Subscriptions** — keyed by ``customer_id``. Key: ``vonia:sub:{customer_id}``.

mark_paid is idempotent via WATCH/MULTI/EXEC: a second call for an already-paid
order returns the record unchanged, so duplicate IPNs don't grant extra days.
"""
from __future__ import annotations

import json
import math
import secrets
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import redis.asyncio as aioredis
from redis.exceptions import WatchError


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def _parse(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def new_invoice_number(plan_id: str) -> str:
    """Unique, human-readable order id, e.g. ``VONIA-STUDIO-MONTHLY-1A2B3C4D``."""
    stamp = _now().strftime("%y%m%d%H%M%S")
    rand = secrets.token_hex(3).upper()
    slug = plan_id.upper().replace("_", "-")
    return f"VONIA-{slug}-{stamp}-{rand}"


def new_payment_code(prefix: str = "DH") -> str:
    """Short payment code for VietQR/webhook flow, e.g. ``DH48217390``.
    Format = <prefix> + 8 digits matching SePay's default payment-code pattern."""
    digits = "".join(secrets.choice("0123456789") for _ in range(8))
    return f"{prefix.upper()}{digits}"


@dataclass
class OrderRecord:
    invoice_number: str
    plan_id: str
    amount: int
    currency: str
    payment_method: str
    customer_id: str
    provider: str = "gateway"  # gateway (hosted redirect) | bank (VietQR/webhook)
    status: str = "pending"    # pending | paid | cancelled | error
    created: str = field(default_factory=lambda: _iso(_now()))
    paid_at: Optional[str] = None
    sepay_order_id: Optional[str] = None
    sepay_transaction_id: Optional[str] = None
    description: Optional[str] = None

    def public(self) -> dict:
        return asdict(self)


class BillingStore:
    def __init__(self, redis_url: str = "redis://localhost:30379") -> None:
        self._redis = aioredis.from_url(redis_url, decode_responses=True)

    # ----- helpers -----

    def _order_key(self, invoice_number: str) -> str:
        return f"vonia:order:{invoice_number}"

    def _sub_key(self, customer_id: str) -> str:
        return f"vonia:sub:{customer_id}"

    def _default_sub(self) -> dict:
        return {"plan_id": None, "status": "trial", "expires_at": None,
                "updated_at": _iso(_now())}

    def _rec_from_raw(self, raw: str) -> Optional[OrderRecord]:
        try:
            return OrderRecord(**json.loads(raw))
        except (TypeError, KeyError, ValueError):
            return None

    # ----- orders -----

    async def create_order(self, rec: OrderRecord) -> OrderRecord:
        await self._redis.set(self._order_key(rec.invoice_number), json.dumps(asdict(rec)))
        return rec

    async def get_order(self, invoice_number: str) -> Optional[OrderRecord]:
        raw = await self._redis.get(self._order_key(invoice_number))
        return self._rec_from_raw(raw) if raw else None

    async def list_orders(self, customer_id: Optional[str] = None) -> List[OrderRecord]:
        orders: List[OrderRecord] = []
        async for key in self._redis.scan_iter("vonia:order:*"):
            raw = await self._redis.get(key)
            if raw:
                rec = self._rec_from_raw(raw)
                if rec:
                    orders.append(rec)
        if customer_id is not None:
            orders = [o for o in orders if o.customer_id == customer_id]
        return sorted(orders, key=lambda r: r.created, reverse=True)

    async def set_status(
        self,
        invoice_number: str,
        status: str,
        sepay_order_id: Optional[str] = None,
        sepay_transaction_id: Optional[str] = None,
    ) -> Optional[OrderRecord]:
        rec = await self.get_order(invoice_number)
        if rec is None:
            return None
        rec.status = status
        if sepay_order_id:
            rec.sepay_order_id = sepay_order_id
        if sepay_transaction_id:
            rec.sepay_transaction_id = sepay_transaction_id
        await self._redis.set(self._order_key(invoice_number), json.dumps(asdict(rec)))
        return rec

    async def mark_paid(
        self,
        invoice_number: str,
        plan_days: int,
        sepay_order_id: Optional[str] = None,
        sepay_transaction_id: Optional[str] = None,
    ) -> Optional[OrderRecord]:
        """Flip order to paid and extend subscription. Idempotent via WATCH."""
        key = self._order_key(invoice_number)
        rec: Optional[OrderRecord] = None

        async with self._redis.pipeline() as pipe:
            while True:
                try:
                    await pipe.watch(key)
                    raw = await pipe.get(key)
                    if not raw:
                        await pipe.reset()
                        return None
                    rec = self._rec_from_raw(raw)
                    if rec is None:
                        await pipe.reset()
                        return None
                    if rec.status == "paid":
                        await pipe.reset()
                        return rec  # already applied — idempotent
                    rec.status = "paid"
                    rec.paid_at = _iso(_now())
                    if sepay_order_id:
                        rec.sepay_order_id = sepay_order_id
                    if sepay_transaction_id:
                        rec.sepay_transaction_id = sepay_transaction_id
                    pipe.multi()
                    pipe.set(key, json.dumps(asdict(rec)))
                    await pipe.execute()
                    break
                except WatchError:
                    continue

        if rec is not None:
            await self._extend_subscription(rec.customer_id, rec.plan_id, plan_days)
        return rec

    # ----- subscriptions -----

    async def get_subscription(self, customer_id: str) -> dict:
        raw = await self._redis.get(self._sub_key(customer_id))
        if raw:
            try:
                sub = json.loads(raw)
            except ValueError:
                sub = self._default_sub()
        else:
            sub = self._default_sub()
        exp = _parse(sub.get("expires_at"))
        active = bool(exp and exp > _now())
        sub["active"] = active
        sub["days_left"] = math.ceil((exp - _now()).total_seconds() / 86400) if active else 0
        return sub

    async def _extend_subscription(self, customer_id: str, plan_id: str, days: int) -> dict:
        raw = await self._redis.get(self._sub_key(customer_id))
        if raw:
            try:
                sub = json.loads(raw)
            except ValueError:
                sub = self._default_sub()
        else:
            sub = self._default_sub()
        base = _parse(sub.get("expires_at"))
        start = base if (base and base > _now()) else _now()
        sub.update({
            "plan_id": plan_id,
            "status": "active",
            "expires_at": _iso(start + timedelta(days=days)),
            "updated_at": _iso(_now()),
        })
        await self._redis.set(self._sub_key(customer_id), json.dumps(sub))
        return sub
