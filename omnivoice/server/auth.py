"""Đăng ký / đăng nhập cho Vonia — Google OAuth + email/mật khẩu, có duyệt thành viên.

Port từ module auth của SSTC-HUB-APP (Go, `backend/internal/modules/auth`),
giữ nguyên các quyết định nghiệp vụ, đổi kho lưu từ Postgres sang Redis (Vonia
đã dùng Redis cho phiên + billing):

  * Hai đường vào: "Tiếp tục với Google" (OAuth 2.0 + PKCE, gọi thẳng Google)
    và email + mật khẩu (PBKDF2-SHA256, cùng định dạng băm với SSTC).
  * **Người đăng ký ĐẦU TIÊN là Quản trị viên toàn quyền, kích hoạt ngay**, không
    cần duyệt. Mọi người đăng ký sau ở trạng thái `pending` cho tới khi Quản trị
    viên duyệt.
  * Tài khoản chưa duyệt HOẶC bị khoá nhận CÙNG một mã lỗi (`ACCOUNT_PENDING`) —
    phân biệt hai ca là tiết lộ email nào đã có tài khoản.
  * Đăng ký trùng email trả CÙNG một câu như đăng ký mới (chống dò tài khoản).
  * Sai mật khẩu 5 lần → khoá đăng nhập bằng mật khẩu 15 phút cho email đó.
  * Phiên có trạng thái (Redis), token lưu dạng băm SHA-256, 30 ngày trượt.
    Mỗi yêu cầu đều đọc lại hồ sơ người dùng, nên khoá tài khoản là văng ra ngay.

Khoá Redis:
  vonia:user:{email}        JSON hồ sơ người dùng
  vonia:users               ZSET email theo thời điểm tạo
  vonia:bootstrap_admin     email của Quản trị viên đầu tiên (SET NX — chống đua)
  vonia:sess:{sha256}       JSON {email, seen}  TTL 30 ngày, gia hạn mỗi giờ
  vonia:loginfail:{email}   bộ đếm sai mật khẩu, TTL 15 phút
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
import unicodedata
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from typing import Optional

import httpx

# ── Cookie ───────────────────────────────────────────────────────────────────
COOKIE = "vonia_session"
STATE_COOKIE = "vonia_oauth_state"

# ── Phiên ────────────────────────────────────────────────────────────────────
SESSION_TTL = 30 * 24 * 3600      # 30 ngày kể từ lần dùng cuối
SESSION_REFRESH = 3600            # chỉ ghi lại hạn khi phiên "cũ" quá 1 giờ

# ── Đường không qua cổng đăng nhập (ngoài nhánh /auth/*) ─────────────────────
PUBLIC_PATHS = {
    "/logout",
    "/health",
    "/payment/ipn",
    "/payment/webhook",
}

# ── Trạng thái tài khoản ─────────────────────────────────────────────────────
STATUS_ACTIVE = "active"
STATUS_PENDING = "pending"
STATUS_DISABLED = "disabled"
STATUSES = (STATUS_ACTIVE, STATUS_PENDING, STATUS_DISABLED)

# ── Mã lỗi — HỢP ĐỒNG với trang đăng nhập (tham số ?loi=) ────────────────────
ERR_PENDING = "ACCOUNT_PENDING"
ERR_EMAIL_UNVERIFIED = "EMAIL_UNVERIFIED"
ERR_EMAIL_MISSING = "EMAIL_MISSING"
ERR_DOMAIN = "DOMAIN_NOT_ALLOWED"
ERR_BAD_CREDENTIALS = "BAD_CREDENTIALS"
ERR_TOO_MANY = "TOO_MANY_ATTEMPTS"
ERR_GOOGLE_DENIED = "GOOGLE_DENIED"
ERR_LOGIN_INVALID = "LOGIN_REQUEST_INVALID"
ERR_INVALID = "INVALID"

# Mã lỗi → giá trị `?loi=` trên trang đăng nhập. Mã lạ → "he_thong".
REASONS = {
    ERR_PENDING: "cho_duyet",
    ERR_EMAIL_UNVERIFIED: "chua_xac_minh",
    ERR_EMAIL_MISSING: "thieu_email",
    ERR_DOMAIN: "sai_mien",
    ERR_GOOGLE_DENIED: "google_tu_choi",
    ERR_LOGIN_INVALID: "phien_dang_nhap_hong",
}

# ── Mật khẩu ─────────────────────────────────────────────────────────────────
PBKDF2_ITERATIONS = 600_000
SALT_LEN = 16
HASH_LEN = 32
HASH_SCHEME = "pbkdf2-sha256"
PASSWORD_MIN = 10
PASSWORD_MAX = 128

MAX_FAILED_LOGINS = 5
LOCKOUT_SECONDS = 15 * 60


class AuthError(Exception):
    """Lỗi nghiệp vụ của luồng xác thực — tầng HTTP dịch sang status + mã."""

    def __init__(self, status: int, code: str, message: str,
                 fields: Optional[dict[str, str]] = None) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.fields = fields or {}


# ═════════════════════════════════════════════════════════════════════════════
# Mật khẩu — PBKDF2-SHA256, định dạng `pbkdf2-sha256$<vòng>$<muối>$<băm>`
# (base64 chuẩn không đệm), trùng với SSTC-HUB-APP để chuyển dữ liệu được.
# ═════════════════════════════════════════════════════════════════════════════

def _b64(b: bytes) -> str:
    return base64.b64encode(b).decode().rstrip("=")


def _unb64(s: str) -> bytes:
    return base64.b64decode(s + "=" * (-len(s) % 4))


def hash_password(password: str, iterations: Optional[int] = None) -> str:
    iterations = iterations or PBKDF2_ITERATIONS
    salt = secrets.token_bytes(SALT_LEN)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations, HASH_LEN)
    return f"{HASH_SCHEME}${iterations}${_b64(salt)}${_b64(dk)}"


def verify_password(stored: str, password: str) -> bool:
    parts = (stored or "").split("$")
    if len(parts) != 4 or parts[0] != HASH_SCHEME:
        return False
    try:
        iterations = int(parts[1])
        salt = _unb64(parts[2])
        expected = _unb64(parts[3])
    except (ValueError, TypeError):
        return False
    if iterations < 1:
        return False
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations, len(expected))
    return hmac.compare_digest(dk, expected)


def needs_rehash(stored: str) -> bool:
    parts = (stored or "").split("$")
    if len(parts) != 4 or parts[0] != HASH_SCHEME:
        return True
    try:
        return int(parts[1]) < PBKDF2_ITERATIONS
    except ValueError:
        return True


def check_new_password(password: str, email: str = "") -> str:
    """Trả câu lỗi nếu mật khẩu không đạt, chuỗi rỗng nếu đạt."""
    n = len(password or "")
    if n < PASSWORD_MIN:
        return f"Mật khẩu phải có ít nhất {PASSWORD_MIN} ký tự."
    if n > PASSWORD_MAX:
        return f"Mật khẩu không được quá {PASSWORD_MAX} ký tự."
    if not password.strip():
        return "Mật khẩu không được chỉ gồm khoảng trắng."
    e = (email or "").strip().lower()
    if e:
        low = password.lower()
        if low == e or low == e.split("@", 1)[0]:
            return "Mật khẩu không được trùng địa chỉ email."
    return ""


def normalize_email(email: str) -> str:
    return unicodedata.normalize("NFC", (email or "").strip().lower())


def is_email(e: str) -> bool:
    """Kiểm tra hình thức tối thiểu: đúng một @, hai phía không rỗng, không khoảng trắng."""
    if not e or " " in e or e.count("@") != 1:
        return False
    local, _, domain = e.partition("@")
    return bool(local) and "." in domain and not domain.startswith(".") and not domain.endswith(".")


def in_domain(email: str, domain: str) -> bool:
    """So phần sau @ (đòi ĐÚNG MỘT @ — chặn `ke@evil.com@mien.vn`)."""
    if email.count("@") != 1:
        return False
    return email.partition("@")[2].lower() == domain.lower()


# Băm PBKDF2 600k vòng mất ~0,4 s CPU: chạy ngoài event loop và giới hạn số
# lượt đồng thời, để một loạt đăng nhập không làm treo cả máy chủ TTS.
# Executor riêng (không dùng default executor) để số luồng băm là trần cứng.
_HASH_POOL = ThreadPoolExecutor(max_workers=max(2, (os.cpu_count() or 2) // 2),
                                thread_name_prefix="vonia-pwhash")
_DUMMY_HASH: Optional[str] = None


async def _run_hash(fn, *args):
    return await asyncio.get_running_loop().run_in_executor(_HASH_POOL, fn, *args)


async def _dummy_verify(password: str) -> None:
    """Đối chiếu với một bản băm mồi — để email không tồn tại tốn CÙNG thời gian
    như sai mật khẩu (không dò được email nào có tài khoản qua thời gian trả lời)."""
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = await _run_hash(hash_password, secrets.token_urlsafe(16))
    await _run_hash(verify_password, _DUMMY_HASH, password)


# ═════════════════════════════════════════════════════════════════════════════
# Người dùng + phiên (Redis)
# ═════════════════════════════════════════════════════════════════════════════

@dataclass
class User:
    email: str
    full_name: str
    status: str = STATUS_PENDING
    is_admin: bool = False
    password_hash: str = ""
    providers: list[str] = field(default_factory=list)   # "password" | "google"
    email_verified: bool = False
    created_at: float = 0.0
    approved_by: str = ""
    approved_at: float = 0.0

    @property
    def active(self) -> bool:
        return self.status == STATUS_ACTIVE

    def public(self) -> dict:
        """Dữ liệu an toàn để trả cho giao diện (không có băm mật khẩu)."""
        return {
            "email": self.email,
            "full_name": self.full_name,
            "status": self.status,
            "is_admin": self.is_admin,
            "providers": list(self.providers),
            "email_verified": self.email_verified,
            "has_password": bool(self.password_hash),
            "created_at": self.created_at,
            "approved_by": self.approved_by,
            "approved_at": self.approved_at,
        }

    @classmethod
    def load(cls, raw: str) -> "User":
        data = json.loads(raw)
        known = {k: v for k, v in data.items() if k in cls.__dataclass_fields__}
        return cls(**known)

    def dump(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False)


def _user_key(email: str) -> str:
    return f"vonia:user:{email}"


def _sess_key(token: str) -> str:
    # Lưu BĂM của token, không lưu nguyên văn: lộ bản sao Redis không đồng nghĩa
    # lộ phiên đăng nhập của mọi người.
    return "vonia:sess:" + hashlib.sha256(token.encode()).hexdigest()


USERS_INDEX = "vonia:users"
BOOTSTRAP_KEY = "vonia:bootstrap_admin"


class UserStore:
    """Kho người dùng + phiên trên Redis (client `redis.asyncio`, decode_responses=True)."""

    def __init__(self, redis, admin_emails: Optional[set[str]] = None,
                 clock=time.time) -> None:
        self.r = redis
        # Nếu đặt VONIA_ADMIN_EMAILS: chỉ các email này mới có thể trở thành
        # Quản trị viên đầu tiên. Để trống = đúng nghĩa "ai đăng ký trước".
        self.admin_emails = admin_emails or set()
        self.now = clock

    # ── đọc ─────────────────────────────────────────────────────────────────

    async def get(self, email: str) -> Optional[User]:
        raw = await self.r.get(_user_key(email))
        return User.load(raw) if raw else None

    async def save(self, user: User) -> None:
        await self.r.set(_user_key(user.email), user.dump())

    async def list(self, status: Optional[str] = None) -> list[User]:
        emails = await self.r.zrange(USERS_INDEX, 0, -1)
        users: list[User] = []
        for e in emails:
            u = await self.get(e)
            if u and (status is None or u.status == status):
                users.append(u)
        return users

    async def count_admins(self) -> int:
        return sum(1 for u in await self.list() if u.is_admin and u.active)

    # ── tạo ─────────────────────────────────────────────────────────────────

    async def create(self, email: str, full_name: str, *, password_hash: str = "",
                     provider: str, email_verified: bool) -> Optional[User]:
        """Tạo tài khoản mới. Trả None nếu email đã có tài khoản.

        Người tạo ĐẦU TIÊN (thắng khoá `SET NX` bootstrap) thành Quản trị viên,
        kích hoạt ngay. Hai người đăng ký cùng lúc trên hệ thống trống thì chỉ
        một người thắng — Redis đảm bảo tính nguyên tử của SET NX.
        """
        now = self.now()
        user = User(
            email=email, full_name=full_name or email, status=STATUS_PENDING,
            password_hash=password_hash, providers=[provider],
            email_verified=email_verified, created_at=now,
        )
        created = await self.r.set(_user_key(email), user.dump(), nx=True)
        if not created:
            return None
        await self.r.zadd(USERS_INDEX, {email: now})

        eligible = not self.admin_emails or email in self.admin_emails
        if eligible and await self.r.set(BOOTSTRAP_KEY, email, nx=True):
            user.is_admin = True
            user.status = STATUS_ACTIVE
            user.approved_by = "bootstrap"
            user.approved_at = now
            await self.save(user)
        return user

    async def delete(self, email: str) -> None:
        await self.r.delete(_user_key(email))
        await self.r.zrem(USERS_INDEX, email)

    # ── khoá đăng nhập sau nhiều lần sai ────────────────────────────────────

    async def is_locked(self, email: str) -> bool:
        n = await self.r.get(f"vonia:loginfail:{email}")
        return bool(n) and int(n) >= MAX_FAILED_LOGINS

    async def record_failure(self, email: str) -> int:
        key = f"vonia:loginfail:{email}"
        n = await self.r.incr(key)
        if n == 1 or n == MAX_FAILED_LOGINS:
            # Đặt hạn lúc lượt đầu (cửa sổ đếm), và đặt lại lúc chạm ngưỡng
            # (khoá đủ 15 phút tính từ lần sai cuối).
            await self.r.expire(key, LOCKOUT_SECONDS)
        return int(n)

    async def clear_failures(self, email: str) -> None:
        await self.r.delete(f"vonia:loginfail:{email}")

    # ── phiên ───────────────────────────────────────────────────────────────

    async def create_session(self, email: str) -> str:
        # Token MỚI mỗi lần đăng nhập — chống cố định phiên (session fixation).
        token = secrets.token_urlsafe(32)
        await self.r.set(_sess_key(token),
                         json.dumps({"email": email, "seen": self.now()}),
                         ex=SESSION_TTL)
        return token

    async def resolve_session(self, token: Optional[str]) -> Optional[tuple[User, bool]]:
        """Đổi token lấy (user, còn_hiệu_lực).

        None = không có phiên. (user, False) = phiên trỏ tới tài khoản không còn
        kích hoạt (phiên đã bị xoá luôn). Đây là CỬA DUY NHẤT sinh danh tính từ
        cookie — khoá tài khoản chặn ở đây, không phải ở từng handler.
        """
        if not token:
            return None
        key = _sess_key(token)
        raw = await self.r.get(key)
        if not raw:
            return None
        try:
            data = json.loads(raw)
        except ValueError:
            await self.r.delete(key)
            return None
        user = await self.get(data.get("email", ""))
        if user is None:
            await self.r.delete(key)
            return None
        if not user.active:
            await self.r.delete(key)
            return user, False
        now = self.now()
        if now - float(data.get("seen") or 0) >= SESSION_REFRESH:
            data["seen"] = now
            await self.r.set(key, json.dumps(data), ex=SESSION_TTL)
        return user, True

    async def revoke_session(self, token: Optional[str]) -> None:
        if token:
            await self.r.delete(_sess_key(token))


# ═════════════════════════════════════════════════════════════════════════════
# Google OAuth 2.0 (Authorization Code + PKCE) — gọi thẳng Google
# ═════════════════════════════════════════════════════════════════════════════

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


class Auth:
    """Cấu hình + nghiệp vụ xác thực. Không biết gì về FastAPI."""

    def __init__(self) -> None:
        env = os.environ.get
        self.google_client_id = (env("GOOGLE_CLIENT_ID") or "").strip()
        self.google_client_secret = (env("GOOGLE_CLIENT_SECRET") or "").strip()
        public_url = (env("VONIA_PUBLIC_URL") or "").strip().rstrip("/")
        self.redirect_uri = f"{public_url}/auth/callback"
        # Rỗng = MỌI MIỀN (mặc định). Cửa chặn nằm ở bước duyệt, không ở miền.
        self.allowed_domain = (env("VONIA_ALLOWED_DOMAIN") or "").strip().lower().lstrip("@")
        self.admin_emails: set[str] = {
            normalize_email(e) for e in (env("VONIA_ADMIN_EMAILS") or "").split(",") if e.strip()
        }
        secret = env("VONIA_SESSION_SECRET") or secrets.token_hex(32)
        self._secret = secret.encode()
        # Tắt hẳn cổng đăng nhập (chỉ dùng khi chạy cục bộ để phát triển).
        self.enabled = (env("VONIA_AUTH") or "on").strip().lower() not in ("off", "0", "false", "no")
        # API keys cho gọi server-to-server (bỏ qua đăng nhập). Phân tách bằng
        # dấu phẩy trong VONIA_API_KEYS. Gửi `X-API-Key: <key>` hoặc Bearer.
        self.api_keys: set[str] = {
            k.strip() for k in (env("VONIA_API_KEYS") or "").split(",") if k.strip()
        }
        self.auth_url = GOOGLE_AUTH_URL
        self.token_url = GOOGLE_TOKEN_URL
        self.userinfo_url = GOOGLE_USERINFO_URL

    @property
    def google_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    def store(self, redis) -> UserStore:
        return UserStore(redis, self.admin_emails)

    def check_api_key(self, x_api_key: Optional[str], authorization: Optional[str]) -> bool:
        """True nếu request mang một API key hợp lệ (X-API-Key hoặc Bearer)."""
        if not self.api_keys:
            return False
        candidate = (x_api_key or "").strip()
        if not candidate and authorization:
            parts = authorization.strip().split(None, 1)
            if len(parts) == 2 and parts[0].lower() == "bearer":
                candidate = parts[1].strip()
        if not candidate:
            return False
        return any(hmac.compare_digest(candidate, k) for k in self.api_keys)

    def _check_domain(self, email: str, verb: str) -> None:
        if self.allowed_domain and not in_domain(email, self.allowed_domain):
            raise AuthError(403, ERR_DOMAIN,
                            f"Chỉ tài khoản @{self.allowed_domain} mới {verb} được.")

    # ── Email + mật khẩu ────────────────────────────────────────────────────

    async def register_password(self, store: UserStore, email: str, full_name: str,
                                password: str) -> Optional[User]:
        """Đăng ký bằng email + mật khẩu.

        Trả User nếu tạo mới, None nếu email đã có tài khoản. Tầng HTTP trả CÙNG
        một câu cho hai ca (trừ ca người đầu tiên được kích hoạt ngay) — để
        không ai dò được email nào đã đăng ký.
        """
        email = normalize_email(email)
        full_name = " ".join((full_name or "").split())
        errors: dict[str, str] = {}
        if not is_email(email):
            errors["email"] = "Địa chỉ email không hợp lệ."
        if not full_name:
            errors["full_name"] = "Họ tên không được để trống."
        elif len(full_name) > 120:
            errors["full_name"] = "Họ tên quá dài."
        why = check_new_password(password, email)
        if why:
            errors["password"] = why
        if errors:
            raise AuthError(422, ERR_INVALID, next(iter(errors.values())), errors)
        self._check_domain(email, "đăng ký")

        pw_hash = await _run_hash(hash_password, password)
        return await store.create(email, full_name, password_hash=pw_hash,
                                  provider="password", email_verified=False)

    async def login_password(self, store: UserStore, email: str, password: str) -> User:
        email = normalize_email(email)
        if await store.is_locked(email):
            raise AuthError(429, ERR_TOO_MANY,
                            "Đã thử sai quá nhiều lần. Vui lòng chờ ít phút rồi thử lại.")
        user = await store.get(email) if email else None
        if user is None or not user.password_hash:
            # Email không tồn tại / tài khoản chỉ vào bằng Google: CÙNG câu, CÙNG
            # thời gian với sai mật khẩu.
            await _dummy_verify(password or "")
            await store.record_failure(email)
            raise AuthError(401, ERR_BAD_CREDENTIALS, "Email hoặc mật khẩu không đúng.")
        if not await _run_hash(verify_password, user.password_hash, password or ""):
            await store.record_failure(email)
            raise AuthError(401, ERR_BAD_CREDENTIALS, "Email hoặc mật khẩu không đúng.")
        await store.clear_failures(email)

        # Kiểm trạng thái SAU khi đúng mật khẩu: người không biết mật khẩu
        # không được biết tài khoản đang chờ duyệt hay bị khoá.
        if not user.active:
            raise AuthError(403, ERR_PENDING,
                            "Tài khoản chưa được kích hoạt. Vui lòng liên hệ Quản trị viên.")
        if needs_rehash(user.password_hash):
            user.password_hash = await _run_hash(hash_password, password)
            await store.save(user)
        return user

    # ── Google ──────────────────────────────────────────────────────────────

    def build_google_redirect(self) -> tuple[str, str]:
        """Trả (URL sang Google, giá trị cookie state đã ký).

        Cookie gói cả `state` (chống CSRF) và `code_verifier` (PKCE), nên không
        cần lưu gì phía máy chủ giữa lượt chuyển hướng và lượt gọi về.
        """
        state = secrets.token_urlsafe(32)
        code_verifier = secrets.token_urlsafe(48)
        code_challenge = (
            base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode()).digest())
            .rstrip(b"=").decode()
        )
        params = {
            "client_id": self.google_client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            # Buộc chọn tài khoản — máy dùng chung không âm thầm đăng nhập lại
            # bằng tài khoản của người trước.
            "prompt": "select_account",
        }
        url = self.auth_url + "?" + urllib.parse.urlencode(params)
        cookie_val = self._sign(json.dumps({"state": state, "cv": code_verifier}))
        return url, cookie_val

    def verify_state_cookie(self, cookie_val: Optional[str], returned_state: str) -> Optional[str]:
        """Trả code_verifier nếu state khớp, ngược lại None."""
        if not cookie_val or not returned_state:
            return None
        payload = self._unsign(cookie_val)
        if payload is None:
            return None
        try:
            data = json.loads(payload)
        except ValueError:
            return None
        if not isinstance(data, dict):
            return None
        if not hmac.compare_digest(str(data.get("state", "")), returned_state):
            return None
        return data.get("cv")

    async def fetch_google_profile(self, http: httpx.AsyncClient, code: str,
                                   code_verifier: str) -> dict:
        """Đổi mã uỷ quyền lấy hồ sơ {email, name, email_verified}. Ném httpx.HTTPError khi hỏng."""
        resp = await http.post(self.token_url, data={
            "code": code,
            "client_id": self.google_client_id,
            "client_secret": self.google_client_secret,
            "redirect_uri": self.redirect_uri,
            "grant_type": "authorization_code",
            "code_verifier": code_verifier,
        })
        resp.raise_for_status()
        access_token = resp.json().get("access_token")
        if not access_token:
            raise httpx.HTTPError("token endpoint không trả access_token")
        resp = await http.get(self.userinfo_url,
                              headers={"Authorization": f"Bearer {access_token}"})
        resp.raise_for_status()
        info = resp.json()
        verified = info.get("email_verified")
        return {
            "email": normalize_email(info.get("email") or ""),
            "name": (info.get("name") or "").strip(),
            "email_verified": verified is True or str(verified).lower() == "true",
        }

    async def login_google(self, store: UserStore, profile: dict) -> User:
        """Áp luật ai-được-vào cho hồ sơ Google, tạo tài khoản chờ duyệt nếu mới."""
        email = profile.get("email") or ""
        if not profile.get("email_verified"):
            # Google có thể trả email CHƯA xác minh — nhận nó là nhận lời khai
            # chưa kiểm chứng về danh tính.
            raise AuthError(403, ERR_EMAIL_UNVERIFIED, "Địa chỉ email chưa được Google xác minh.")
        if not email:
            raise AuthError(403, ERR_EMAIL_MISSING, "Google không trả về địa chỉ email.")
        self._check_domain(email, "đăng nhập")

        user = await store.get(email)
        if user is None:
            user = await store.create(email, profile.get("name") or email,
                                      provider="google", email_verified=True)
            if user is None:            # vừa bị tạo song song — đọc lại
                user = await store.get(email)
        else:
            changed = False
            if not user.email_verified:
                # Google vừa chứng minh chủ sở hữu email. Mật khẩu (nếu có) được
                # đặt bởi một người CHƯA chứng minh sở hữu email này — có thể là
                # kẻ chiếm chỗ trước — nên huỷ nó đi.
                user.email_verified = True
                user.password_hash = ""
                if "password" in user.providers:
                    user.providers.remove("password")
                changed = True
            if "google" not in user.providers:
                user.providers.append("google")
                changed = True
            if changed:
                await store.save(user)
        assert user is not None
        if not user.active:
            raise AuthError(403, ERR_PENDING,
                            "Tài khoản chưa được kích hoạt. Vui lòng liên hệ Quản trị viên.")
        return user

    # ── HMAC ký cookie state ────────────────────────────────────────────────

    def _sign(self, payload: str) -> str:
        sig = hmac.new(self._secret, payload.encode(), hashlib.sha256).hexdigest()
        return base64.urlsafe_b64encode(f"{payload}||{sig}".encode()).decode()

    def _unsign(self, value: str) -> Optional[str]:
        try:
            raw = base64.urlsafe_b64decode(value.encode()).decode()
            payload, _, sig = raw.rpartition("||")
            expected = hmac.new(self._secret, payload.encode(), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(sig, expected):
                return None
            return payload
        except Exception:  # noqa: BLE001
            return None


# ═════════════════════════════════════════════════════════════════════════════
# Quản trị thành viên
# ═════════════════════════════════════════════════════════════════════════════

async def admin_update(store: UserStore, actor: User, email: str, action: str) -> Optional[User]:
    """Thực hiện một thao tác quản trị lên tài khoản `email`.

    action: approve | disable | make_admin | revoke_admin | delete.
    Trả User sau khi đổi (None nếu đã xoá). Ném AuthError nếu không hợp lệ.
    """
    email = normalize_email(email)
    target = await store.get(email)
    if target is None:
        raise AuthError(404, "USER_NOT_FOUND", "Không tìm thấy tài khoản.")
    self_action = target.email == actor.email

    if action in ("disable", "revoke_admin", "delete") and self_action:
        raise AuthError(409, "SELF_ACTION", "Không thể tự khoá, tự xoá hoặc tự gỡ quyền của chính mình.")
    if action in ("disable", "revoke_admin", "delete") and target.is_admin and target.active:
        if await store.count_admins() <= 1:
            raise AuthError(409, "LAST_ADMIN", "Hệ thống phải còn ít nhất một Quản trị viên.")

    now = store.now()
    if action == "approve":
        target.status = STATUS_ACTIVE
        target.approved_by = actor.email
        target.approved_at = now
    elif action == "disable":
        target.status = STATUS_DISABLED
    elif action == "make_admin":
        if not target.active:
            raise AuthError(409, "NOT_ACTIVE", "Hãy duyệt tài khoản trước khi cấp quyền Quản trị viên.")
        target.is_admin = True
    elif action == "revoke_admin":
        target.is_admin = False
    elif action == "delete":
        await store.delete(email)
        return None
    else:
        raise AuthError(400, "UNKNOWN_ACTION", "Thao tác không hợp lệ.")
    await store.save(target)
    return target
