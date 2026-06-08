"""SePay payment-gateway client (Cổng thanh toán SePay).

There is no official Python SDK — only PHP and Node.js. This module mirrors the
Node SDK (``sepay-pg-node`` v1.0.0) exactly so signatures validate on SePay's
side. The pieces we need:

* **Checkout** — build the signed hidden-form fields the browser POSTs to
  ``{checkout_base}/init`` to reach SePay's hosted payment page.
* **IPN** — verify the ``X-Secret-Key`` header SePay sends to our callback.
* **Order query** — server-to-server REST lookup (Basic auth) as an IPN fallback.

Credentials come from the environment (loaded from ``.env`` by ``serve.py``):
``merchant_id`` / ``secret_key`` (the names SePay's dashboard hands out), and
``SEPAY_ENV`` (``sandbox`` | ``production``). ``VONIA_PUBLIC_URL`` is the
public origin used to build the success/error/cancel callback URLs.

Docs: https://developer.sepay.vn/vi/cong-thanh-toan/bat-dau
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Dict, Optional

# Fields SePay signs, copied verbatim from the Node SDK's signFields() allowlist.
# NOTE: the SDK signs fields in the *insertion order of the form-fields object*
# filtered to this set (not this list's order). We build the fields dict in the
# same order the SDK produces, so iterating it (insertion order) and filtering by
# this set reproduces the SDK's signing string byte-for-byte. ``custom_data`` is
# deliberately absent here, so it is never signed (matches the SDK).
_SIGN_ALLOWLIST = {
    "merchant", "env", "operation", "payment_method", "order_amount",
    "currency", "order_invoice_number", "order_description", "customer_id",
    "agreement_id", "agreement_name", "agreement_type",
    "agreement_payment_frequency", "agreement_amount_per_payment",
    "success_url", "error_url", "cancel_url", "order_id",
}

VALID_PAYMENT_METHODS = {"CARD", "BANK_TRANSFER", "NAPAS_BANK_TRANSFER"}

# Subscription plan catalog. ``amount`` is in VND (integer); ``days`` is how long
# a successful payment extends the subscription. The 100.000đ / 30-day Studio
# plan matches the price already shown in the Settings → License UI.
PLANS: Dict[str, dict] = {
    "studio_monthly": {
        "id": "studio_monthly", "name": "Studio", "amount": 100000,
        "currency": "VND", "days": 30,
        "desc_vi": "Gói Studio · 30 ngày", "desc_en": "Studio plan · 30 days",
    },
    "studio_yearly": {
        "id": "studio_yearly", "name": "Studio (năm)", "amount": 1000000,
        "currency": "VND", "days": 365,
        "desc_vi": "Gói Studio · 12 tháng (tiết kiệm 2 tháng)",
        "desc_en": "Studio plan · 12 months (save 2 months)",
    },
}


class SePayClient:
    def __init__(
        self,
        merchant_id: str,
        secret_key: str,
        env: str = "sandbox",
        public_url: str = "",
    ):
        self.merchant_id = (merchant_id or "").strip()
        self.secret_key = (secret_key or "").strip()
        self.env = "production" if env == "production" else "sandbox"
        self.public_url = (public_url or "").rstrip("/")
        if self.env == "production":
            self.api_base = "https://pgapi.sepay.vn/v1"
            self.checkout_base = "https://pay.sepay.vn/v1/checkout"
        else:
            self.api_base = "https://pgapi-sandbox.sepay.vn/v1"
            self.checkout_base = "https://pay-sandbox.sepay.vn/v1/checkout"

    @property
    def configured(self) -> bool:
        return bool(self.merchant_id and self.secret_key)

    @property
    def checkout_url(self) -> str:
        return f"{self.checkout_base}/init"

    # ------------------------------------------------------------- signing
    def sign_fields(self, fields: Dict[str, object]) -> str:
        """HMAC-SHA256(secret_key) over allowlisted fields joined as
        ``key=value`` with ``,``, base64-encoded — mirrors the Node SDK."""
        parts = []
        for key, val in fields.items():  # dict preserves insertion order
            if key not in _SIGN_ALLOWLIST or val is None:
                continue
            parts.append(f"{key}={val}")
        digest = hmac.new(self.secret_key.encode(), ",".join(parts).encode("utf-8"),
                          hashlib.sha256).digest()
        return base64.b64encode(digest).decode("ascii")

    def build_checkout_fields(
        self,
        *,
        invoice_number: str,
        amount: int,
        currency: str = "VND",
        payment_method: str = "BANK_TRANSFER",
        order_description: Optional[str] = None,
        customer_id: Optional[str] = None,
        custom_data: Optional[str] = None,
    ) -> Dict[str, str]:
        """Return the full set of hidden-form fields (incl. ``signature``) the
        browser POSTs to ``checkout_url``. Key insertion order matches the SDK
        so the signature validates."""
        if payment_method not in VALID_PAYMENT_METHODS:
            payment_method = "BANK_TRANSFER"
        fields: Dict[str, object] = {}
        fields["operation"] = "PURCHASE"
        fields["payment_method"] = payment_method
        fields["order_invoice_number"] = invoice_number
        fields["order_amount"] = str(int(amount))
        fields["currency"] = currency
        if order_description:
            fields["order_description"] = order_description
        if customer_id:
            fields["customer_id"] = customer_id
        if self.public_url:
            fields["success_url"] = f"{self.public_url}/?payment=success&inv={invoice_number}"
            fields["error_url"] = f"{self.public_url}/?payment=error&inv={invoice_number}"
            fields["cancel_url"] = f"{self.public_url}/?payment=cancel&inv={invoice_number}"
        if custom_data:
            fields["custom_data"] = custom_data
        fields["merchant"] = self.merchant_id  # appended last, like the SDK
        fields["signature"] = self.sign_fields(fields)
        # Stringify everything for the HTML form.
        return {k: str(v) for k, v in fields.items()}

    # ----------------------------------------------------------------- IPN
    def verify_ipn(self, secret_header: Optional[str]) -> bool:
        """SePay sends ``X-Secret-Key: <secret_key>`` on the IPN callback when
        the merchant's IPN auth type is SECRET_KEY. Constant-time compare."""
        if not secret_header or not self.secret_key:
            return False
        return hmac.compare_digest(secret_header.strip(), self.secret_key)

    # --------------------------------------------------------- order query
    def query_order(self, invoice_number: str, timeout: float = 8.0) -> Optional[dict]:
        """Server-to-server lookup: GET /order/detail/{invoice} with Basic auth.
        Returns the parsed JSON ``data`` (or None on any error) — used as a
        best-effort fallback when the IPN hasn't arrived yet."""
        if not self.configured:
            return None
        url = f"{self.api_base}/order/detail/{urllib.parse.quote(invoice_number)}"
        token = base64.b64encode(f"{self.merchant_id}:{self.secret_key}".encode()).decode()
        req = urllib.request.Request(url, headers={
            "Authorization": f"Basic {token}",
            "Content-Type": "application/json",
            # SePay's API sits behind Cloudflare, which 403s the default
            # "Python-urllib/x.y" agent (error 1010). Send an explicit UA.
            "User-Agent": "Vonia-SePay/1.0",
        })
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, ValueError, TimeoutError, OSError):
            return None
        return body.get("data", body) if isinstance(body, dict) else None


# ===================================================================
# SePay Webhooks (bank-transfer / VietQR) — the in-app QR flow.
#
# A separate SePay product from the hosted gateway above. Instead of redirecting,
# we render a VietQR image (qr.sepay.vn) inside the app pointing at our linked
# bank account, with the order's *payment code* embedded in the transfer content.
# When the customer transfers, SePay detects the incoming transaction and POSTs a
# webhook to us; we match by `code`. Test mode (my.sepay.vn) lets us simulate
# transactions without real money. Docs:
#   https://developer.sepay.vn/vi/sepay-webhooks
#   https://developer.sepay.vn/vi/tien-ich-khac/tao-qr-code
# ===================================================================

_QR_BASE = "https://qr.sepay.vn/img"


@dataclass
class SePayBankConfig:
    """Bank-transfer/VietQR + webhook settings (from env)."""
    bank_account: str = ""   # account number (or VA) money is sent to
    bank_code: str = ""      # bank code, e.g. "MBBank" (qr.sepay.vn/banks.json)
    bank_name: str = ""      # account holder name (display only)
    code_prefix: str = "DH"  # payment-code prefix; must match dashboard pattern
    webhook_api_key: str = ""    # if webhook auth = API Key
    webhook_secret: str = ""     # if webhook auth = HMAC-SHA256

    @property
    def configured(self) -> bool:
        return bool(self.bank_account and self.bank_code)

    def vietqr_url(self, amount: int, des: str, template: str = "qronly") -> str:
        """Dynamic VietQR image URL to embed as <img>. `des` must carry the
        payment code so SePay can extract it into the webhook `code` field."""
        params = {
            "acc": self.bank_account,
            "bank": self.bank_code,
            "amount": str(int(amount)),
            "des": des,
            "template": template,
        }
        return f"{_QR_BASE}?{urllib.parse.urlencode(params)}"

    def verify_webhook(self, *, authorization: Optional[str], signature: Optional[str],
                       timestamp: Optional[str], raw_body: bytes) -> bool:
        """Authenticate an incoming webhook. Supports both schemes SePay offers:
        API Key (``Authorization: Apikey <key>``) and HMAC-SHA256
        (``X-SePay-Signature: sha256=<hex>`` over ``{ts}.{rawbody}``, ±5 min).
        If neither credential is configured, accept (None-auth, test only)."""
        if self.webhook_api_key:
            if not authorization or not authorization.startswith("Apikey "):
                return False
            return hmac.compare_digest(authorization[7:].strip(), self.webhook_api_key)
        if self.webhook_secret:
            if not signature or not signature.startswith("sha256="):
                return False
            try:
                ts = int(timestamp or 0)
            except (TypeError, ValueError):
                return False
            if abs(time.time() - ts) > 300:   # replay window
                return False
            expected = "sha256=" + hmac.new(
                self.webhook_secret.encode(), f"{ts}.".encode() + raw_body,
                hashlib.sha256).hexdigest()
            return hmac.compare_digest(expected, signature)
        return True  # no auth configured — test/none mode


def bank_config_from_env() -> SePayBankConfig:
    return SePayBankConfig(
        bank_account=os.environ.get("SEPAY_BANK_ACCOUNT", "").strip(),
        bank_code=os.environ.get("SEPAY_BANK_CODE", "").strip(),
        bank_name=os.environ.get("SEPAY_BANK_NAME", "").strip(),
        code_prefix=(os.environ.get("SEPAY_CODE_PREFIX", "DH").strip() or "DH"),
        webhook_api_key=os.environ.get("SEPAY_WEBHOOK_API_KEY", "").strip(),
        webhook_secret=os.environ.get("SEPAY_WEBHOOK_SECRET", "").strip(),
    )


def client_from_env(public_url: str = "") -> SePayClient:
    """Build a SePayClient from environment variables. Accepts both the bare
    names SePay's dashboard uses (``merchant_id`` / ``secret_key``) and
    ``SEPAY_``-prefixed names, preferring the prefixed ones if set."""
    merchant_id = (os.environ.get("SEPAY_MERCHANT_ID")
                   or os.environ.get("merchant_id") or "")
    secret_key = (os.environ.get("SEPAY_SECRET_KEY")
                  or os.environ.get("secret_key") or "")
    env = (os.environ.get("SEPAY_ENV") or "sandbox").strip().lower()
    public = (public_url or os.environ.get("VONIA_PUBLIC_URL")
              or os.environ.get("VONIA_CORS_ORIGINS", "").split(",")[0] or "").strip()
    return SePayClient(merchant_id, secret_key, env=env, public_url=public)
