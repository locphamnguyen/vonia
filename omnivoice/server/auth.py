"""OIDC authentication via Zitadel for the Vonia MVP.

Login flow:
  1. GET /auth/login    — generate PKCE params, set signed state cookie,
                          redirect to Zitadel authorization endpoint.
  2. GET /auth/callback — validate state cookie, exchange code for tokens,
                          call userinfo, check allowlist, create Redis session,
                          set session cookie, redirect to /.
  3. GET /logout        — delete Redis session, clear cookie,
                          redirect to Zitadel end_session.

Session storage : Redis  key=vonia:session:{session_id}  TTL=7 days
State cookie    : HMAC-signed {state, code_verifier}  HttpOnly SameSite=lax max_age=300s
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import urllib.parse
from typing import Optional

import httpx

# ── Cookie names ────────────────────────────────────────────────────────────
COOKIE = "vonia_session"
STATE_COOKIE = "vonia_oauth_state"

# ── Session TTL ──────────────────────────────────────────────────────────────
SESSION_TTL = 7 * 24 * 3600  # 7 days

# ── Paths that bypass auth gate ──────────────────────────────────────────────
PUBLIC_PATHS = {
    "/auth/login",
    "/auth/callback",
    "/logout",
    "/health",
    "/payment/ipn",
    "/payment/webhook",
}


class OIDCAuth:
    def __init__(self) -> None:
        self.domain = (os.environ.get("ZITADEL_DOMAIN") or "").strip().rstrip("/")
        self.client_id = (os.environ.get("ZITADEL_CLIENT_ID") or "").strip()
        self.client_secret = (os.environ.get("ZITADEL_CLIENT_SECRET") or "").strip()
        public_url = (os.environ.get("VONIA_PUBLIC_URL") or "").rstrip("/")
        self.redirect_uri = f"{public_url}/auth/callback"
        raw = os.environ.get("VONIA_ALLOWED_EMAILS") or ""
        self.allowed_emails: set[str] = {
            e.strip().lower() for e in raw.split(",") if e.strip()
        }
        # Domain nội bộ Zitadel (admin/service account) luôn bị chặn kể cả ở
        # "open mode", để chúng không bị coi là user của app. Có thể bổ sung qua
        # VONIA_BLOCKED_DOMAINS (phân tách bởi dấu phẩy).
        raw_blocked = os.environ.get("VONIA_BLOCKED_DOMAINS") or ""
        self.blocked_domains: set[str] = {
            d.strip().lower() for d in raw_blocked.split(",") if d.strip()
        }
        if self.domain:
            self.blocked_domains.add(self.domain)
            self.blocked_domains.add(f"zitadel.{self.domain}")
        secret = os.environ.get("VONIA_SESSION_SECRET") or secrets.token_hex(32)
        self._secret = secret.encode()
        self.enabled = bool(self.domain and self.client_id)

    # ── OIDC endpoints ───────────────────────────────────────────────────────

    @property
    def _base(self) -> str:
        return f"https://{self.domain}"

    @property
    def auth_url(self) -> str:
        return f"{self._base}/oauth/v2/authorize"

    @property
    def token_url(self) -> str:
        return f"{self._base}/oauth/v2/token"

    @property
    def userinfo_url(self) -> str:
        return f"{self._base}/oidc/v1/userinfo"

    @property
    def end_session_url(self) -> str:
        return f"{self._base}/oidc/v1/end_session"

    def build_end_session_url(
        self, post_logout_uri: str, id_token: Optional[str] = None
    ) -> str:
        """RP-initiated logout URL.

        Zitadel chỉ honor `post_logout_redirect_uri` khi request kèm
        `id_token_hint` (hoặc `client_id`); thiếu thì nó dừng ở trang logout
        của Zitadel thay vì quay về app.
        """
        params = {
            "post_logout_redirect_uri": post_logout_uri,
            "client_id": self.client_id,
        }
        if id_token:
            params["id_token_hint"] = id_token
        return self.end_session_url + "?" + urllib.parse.urlencode(params)

    # ── PKCE + state cookie ──────────────────────────────────────────────────

    def build_auth_redirect(self) -> tuple[str, str]:
        """Return (authorization_url, signed_state_cookie_value).

        The state cookie bundles both `state` nonce and `code_verifier` so no
        server-side storage is needed between the redirect and the callback.
        """
        state = secrets.token_urlsafe(32)
        code_verifier = secrets.token_urlsafe(64)
        code_challenge = (
            base64.urlsafe_b64encode(
                hashlib.sha256(code_verifier.encode()).digest()
            )
            .rstrip(b"=")
            .decode()
        )
        params = {
            "response_type": "code",
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "scope": "openid profile email",
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
        url = self.auth_url + "?" + urllib.parse.urlencode(params)
        cookie_val = self._sign(json.dumps({"state": state, "cv": code_verifier}))
        return url, cookie_val

    def verify_state_cookie(
        self, cookie_val: Optional[str], returned_state: str
    ) -> Optional[str]:
        """Return code_verifier if state is valid, else None."""
        if not cookie_val:
            return None
        payload = self._unsign(cookie_val)
        if payload is None:
            return None
        try:
            data = json.loads(payload)
        except (ValueError, KeyError):
            return None
        if not hmac.compare_digest(data.get("state", ""), returned_state):
            return None
        return data.get("cv")

    # ── Token exchange + userinfo ────────────────────────────────────────────

    async def exchange_code(
        self, http: httpx.AsyncClient, code: str, code_verifier: str
    ) -> dict:
        """Exchange authorization code for tokens. Raises httpx.HTTPStatusError on failure."""
        resp = await http.post(
            self.token_url,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": self.redirect_uri,
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "code_verifier": code_verifier,
            },
        )
        resp.raise_for_status()
        return resp.json()

    async def get_user_info(
        self, http: httpx.AsyncClient, access_token: str
    ) -> dict:
        """Fetch user profile from Zitadel userinfo endpoint."""
        resp = await http.get(
            self.userinfo_url,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        return resp.json()

    def is_allowed(self, email: str) -> bool:
        """Quyết định email có được vào app không.

        - Email thuộc domain nội bộ Zitadel (admin/service) → luôn từ chối.
        - Nếu có VONIA_ALLOWED_EMAILS → chỉ các email trong danh sách (strict).
        - Nếu allowlist trống → "open mode": mọi tài khoản đăng nhập được đều
          cho qua (ai cũng dùng được phần mềm).
        """
        email = (email or "").strip().lower()
        if not email or "@" not in email:
            return False
        domain = email.rpartition("@")[2]
        if domain in self.blocked_domains:
            return False
        if self.allowed_emails:
            return email in self.allowed_emails
        return True  # open mode

    # ── Redis session ────────────────────────────────────────────────────────

    async def create_session(
        self, redis, email: str, sub: str, id_token: str = ""
    ) -> str:
        """Store session in Redis, return session_id to set as cookie value.

        id_token được lưu để dùng làm `id_token_hint` lúc logout (RP-initiated).
        """
        session_id = secrets.token_urlsafe(32)
        await redis.set(
            f"vonia:session:{session_id}",
            json.dumps({"email": email, "sub": sub, "id_token": id_token}),
            ex=SESSION_TTL,
        )
        return session_id

    async def get_session(self, redis, session_id: Optional[str]) -> Optional[dict]:
        """Return {email, sub} if session exists in Redis, else None."""
        if not session_id:
            return None
        raw = await redis.get(f"vonia:session:{session_id}")
        if not raw:
            return None
        try:
            return json.loads(raw)
        except ValueError:
            return None

    async def revoke_session(self, redis, session_id: Optional[str]) -> None:
        """Delete session from Redis (logout)."""
        if session_id:
            await redis.delete(f"vonia:session:{session_id}")

    # ── HMAC signing (state cookie) ──────────────────────────────────────────

    def _sign(self, payload: str) -> str:
        sig = hmac.new(self._secret, payload.encode(), hashlib.sha256).hexdigest()
        return base64.urlsafe_b64encode(f"{payload}||{sig}".encode()).decode()

    def _unsign(self, value: str) -> Optional[str]:
        try:
            raw = base64.urlsafe_b64decode(value.encode()).decode()
            payload, _, sig = raw.rpartition("||")
            expected = hmac.new(
                self._secret, payload.encode(), hashlib.sha256
            ).hexdigest()
            if not hmac.compare_digest(sig, expected):
                return None
            return payload
        except Exception:  # noqa: BLE001
            return None
