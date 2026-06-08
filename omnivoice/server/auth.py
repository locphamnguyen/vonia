"""Minimal session login for the Vonia MVP.

Credentials come from the environment (loaded from ``.env`` by ``serve.py``):
``VONIA_AUTH_USER`` / ``VONIA_AUTH_PASS``. When either is unset, auth is disabled
(local dev). A correct login sets a signed HttpOnly cookie; the app's middleware
gates every route except the login/logout endpoints. Programmatic clients
(webhooks) may instead send HTTP Basic auth with the same credentials.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets

COOKIE = "vonia_session"
# Paths reachable without a session: the login flow, and the SePay IPN callback
# (a server-to-server webhook authenticated by its own X-Secret-Key header, not
# by our session cookie — see sepay.SePayClient.verify_ipn).
PUBLIC_PATHS = {"/login", "/logout", "/payment/ipn", "/payment/webhook"}


class Auth:
    def __init__(self) -> None:
        self.user = (os.environ.get("VONIA_AUTH_USER") or "").strip()
        self.password = os.environ.get("VONIA_AUTH_PASS") or ""
        self.enabled = bool(self.user and self.password)
        # Per-deploy secret. Set VONIA_SESSION_SECRET to keep sessions valid
        # across restarts; otherwise a random one is used (restart = re-login).
        secret = os.environ.get("VONIA_SESSION_SECRET") or secrets.token_hex(32)
        self._secret = secret.encode()

    @property
    def token(self) -> str:
        """Opaque session value tied to the username + secret."""
        return hmac.new(self._secret, self.user.encode(), hashlib.sha256).hexdigest()

    def check_credentials(self, user: str, password: str) -> bool:
        if not self.enabled:
            return False
        return (hmac.compare_digest((user or "").strip(), self.user)
                and hmac.compare_digest(password or "", self.password))

    def valid_cookie(self, value: str | None) -> bool:
        return bool(value) and hmac.compare_digest(value, self.token)

    def check_basic(self, header: str | None) -> bool:
        """Accept `Authorization: Basic base64(user:pass)` for webhooks."""
        if not header or not header.startswith("Basic "):
            return False
        try:
            raw = base64.b64decode(header[6:]).decode("utf-8", "replace")
        except Exception:  # noqa: BLE001
            return False
        user, _, password = raw.partition(":")
        return self.check_credentials(user, password)
