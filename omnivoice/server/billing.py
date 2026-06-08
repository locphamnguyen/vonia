"""Billing store for the Vonia SePay integration.

Persists payment **orders** and per-customer **subscriptions** to disk as JSON,
mirroring the storage pattern of :class:`VoiceLibrary` (atomic temp-file writes
under a threading lock). Two concerns live here:

* **Orders** — one record per checkout attempt (``pending`` → ``paid`` /
  ``cancelled`` / ``error``). Keyed by ``invoice_number`` (our
  ``order_invoice_number`` sent to SePay).
* **Subscriptions** — keyed by ``customer_id``. A paid order extends the
  customer's ``expires_at`` by the plan's day count. Today the app has one
  shared login, so there is effectively one customer; keying by customer_id now
  means the multi-user account system can drop in later without a migration.

Applying a paid order is **idempotent**: SePay may deliver the same IPN more than
once, so the subscription is only extended the first time an order flips to paid.
"""
from __future__ import annotations

import json
import math
import os
import secrets
import threading
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

_ORDERS_NAME = "orders.json"
_SUBS_NAME = "subscriptions.json"


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
    """Unique, human-readable order id, e.g. ``VONIA-STUDIO-MONTHLY-1A2B3C4D``.
    Used by the hosted-gateway flow."""
    stamp = _now().strftime("%y%m%d%H%M%S")
    rand = secrets.token_hex(3).upper()
    slug = plan_id.upper().replace("_", "-")
    return f"VONIA-{slug}-{stamp}-{rand}"


def new_payment_code(prefix: str = "DH") -> str:
    """Short payment code for the VietQR/webhook flow, e.g. ``DH48217390``.
    Format = <prefix> + 8 digits so SePay's default payment-code pattern
    (prefix + 6-8 numeric) extracts it from the transfer content. The 8 random
    digits give ~100M space; callers should still check the store for collisions."""
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
    status: str = "pending"  # pending | paid | cancelled | error
    created: str = field(default_factory=lambda: _iso(_now()))
    paid_at: Optional[str] = None
    sepay_order_id: Optional[str] = None
    sepay_transaction_id: Optional[str] = None
    description: Optional[str] = None

    def public(self) -> dict:
        return asdict(self)


class BillingStore:
    def __init__(self, billing_dir: str = "~/.cache/omnivoice/billing"):
        self.dir = os.path.abspath(os.path.expanduser(billing_dir))
        os.makedirs(self.dir, exist_ok=True)
        self._lock = threading.RLock()
        self._orders: Dict[str, OrderRecord] = {}
        self._subs: Dict[str, dict] = {}
        self._load()

    # ----- persistence -----
    def _path(self, name: str) -> str:
        return os.path.join(self.dir, name)

    def _load(self) -> None:
        try:
            with open(self._path(_ORDERS_NAME), encoding="utf-8") as f:
                for rec in json.load(f).get("orders", []):
                    try:
                        self._orders[rec["invoice_number"]] = OrderRecord(**rec)
                    except (TypeError, KeyError):
                        continue
        except (OSError, json.JSONDecodeError):
            pass
        try:
            with open(self._path(_SUBS_NAME), encoding="utf-8") as f:
                self._subs = json.load(f).get("subscriptions", {}) or {}
        except (OSError, json.JSONDecodeError):
            pass

    def _save_orders(self) -> None:
        tmp = self._path(_ORDERS_NAME) + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"orders": [asdict(r) for r in self._orders.values()]}, f,
                      ensure_ascii=False, indent=2)
        os.replace(tmp, self._path(_ORDERS_NAME))

    def _save_subs(self) -> None:
        tmp = self._path(_SUBS_NAME) + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"subscriptions": self._subs}, f, ensure_ascii=False, indent=2)
        os.replace(tmp, self._path(_SUBS_NAME))

    # ----- orders -----
    def create_order(self, rec: OrderRecord) -> OrderRecord:
        with self._lock:
            self._orders[rec.invoice_number] = rec
            self._save_orders()
        return rec

    def get_order(self, invoice_number: str) -> Optional[OrderRecord]:
        with self._lock:
            return self._orders.get(invoice_number)

    def list_orders(self, customer_id: Optional[str] = None) -> List[OrderRecord]:
        with self._lock:
            recs = list(self._orders.values())
        if customer_id is not None:
            recs = [r for r in recs if r.customer_id == customer_id]
        return sorted(recs, key=lambda r: r.created, reverse=True)

    def set_status(self, invoice_number: str, status: str,
                   sepay_order_id: Optional[str] = None,
                   sepay_transaction_id: Optional[str] = None) -> Optional[OrderRecord]:
        with self._lock:
            rec = self._orders.get(invoice_number)
            if rec is None:
                return None
            rec.status = status
            if sepay_order_id:
                rec.sepay_order_id = sepay_order_id
            if sepay_transaction_id:
                rec.sepay_transaction_id = sepay_transaction_id
            self._save_orders()
            return rec

    def mark_paid(self, invoice_number: str, plan_days: int,
                  sepay_order_id: Optional[str] = None,
                  sepay_transaction_id: Optional[str] = None) -> Optional[OrderRecord]:
        """Flip an order to paid and extend its customer's subscription.
        Idempotent: a second call for an already-paid order is a no-op (returns
        the record unchanged), so duplicate IPNs don't grant extra days."""
        with self._lock:
            rec = self._orders.get(invoice_number)
            if rec is None:
                return None
            if rec.status == "paid":
                return rec  # already applied — do not extend again
            rec.status = "paid"
            rec.paid_at = _iso(_now())
            if sepay_order_id:
                rec.sepay_order_id = sepay_order_id
            if sepay_transaction_id:
                rec.sepay_transaction_id = sepay_transaction_id
            self._extend_subscription_locked(rec.customer_id, rec.plan_id, plan_days)
            self._save_orders()
            return rec

    # ----- subscriptions -----
    def _default_sub(self) -> dict:
        return {"plan_id": None, "status": "trial", "expires_at": None,
                "updated_at": _iso(_now())}

    def get_subscription(self, customer_id: str) -> dict:
        with self._lock:
            sub = dict(self._subs.get(customer_id) or self._default_sub())
        # Derive a live `active` flag from expiry so callers don't recompute it.
        exp = _parse(sub.get("expires_at"))
        active = bool(exp and exp > _now())
        sub["active"] = active
        # Round up so a just-purchased 30-day plan reads "30 days", not "29".
        sub["days_left"] = math.ceil((exp - _now()).total_seconds() / 86400) if active else 0
        return sub

    def _extend_subscription_locked(self, customer_id: str, plan_id: str, days: int) -> dict:
        sub = self._subs.get(customer_id) or self._default_sub()
        base = _parse(sub.get("expires_at"))
        start = base if (base and base > _now()) else _now()
        sub.update({
            "plan_id": plan_id,
            "status": "active",
            "expires_at": _iso(start + timedelta(days=days)),
            "updated_at": _iso(_now()),
        })
        self._subs[customer_id] = sub
        self._save_subs()
        return sub
