"""Tests cho đăng ký / đăng nhập / duyệt thành viên (omnivoice/server/auth.py + routes).

Dùng fakeredis (Redis trong bộ nhớ, cùng API redis.asyncio) thay cho Redis thật.
Số vòng PBKDF2 được hạ xuống để bộ test chạy nhanh.
"""
from __future__ import annotations

import asyncio
import urllib.parse
from unittest.mock import AsyncMock, MagicMock

import fakeredis
import httpx
import pytest
from fastapi.testclient import TestClient

import omnivoice.server.auth as A
from omnivoice.server.app import create_app


@pytest.fixture(autouse=True)
def fast_hash(monkeypatch):
    monkeypatch.setattr(A, "PBKDF2_ITERATIONS", 1000)


@pytest.fixture
def redis():
    return fakeredis.FakeAsyncRedis(decode_responses=True)


def run(coro):
    return asyncio.run(coro)


def make_auth(monkeypatch, **env) -> A.Auth:
    base = {
        "GOOGLE_CLIENT_ID": "gid", "GOOGLE_CLIENT_SECRET": "gsecret",
        "VONIA_PUBLIC_URL": "https://app.example.com",
        "VONIA_SESSION_SECRET": "test-secret", "VONIA_ALLOWED_DOMAIN": "",
        "VONIA_ADMIN_EMAILS": "", "VONIA_AUTH": "on", "VONIA_API_KEYS": "",
    }
    base.update(env)
    for k, v in base.items():
        monkeypatch.setenv(k, v)
    return A.Auth()


GOOD_PW = "mat-khau-du-dai-123"


# ── Mật khẩu ──────────────────────────────────────────────────────────────────

def test_hash_roundtrip_and_format():
    h = A.hash_password(GOOD_PW)
    assert h.startswith("pbkdf2-sha256$1000$")
    assert A.verify_password(h, GOOD_PW)
    assert not A.verify_password(h, GOOD_PW + "x")


def test_verify_rejects_garbage():
    assert not A.verify_password("", "x")
    assert not A.verify_password("bcrypt$1$aa$bb", "x")
    assert not A.verify_password("pbkdf2-sha256$abc$aa$bb", "x")


def test_needs_rehash_on_fewer_iterations(monkeypatch):
    h = A.hash_password(GOOD_PW)
    assert not A.needs_rehash(h)
    monkeypatch.setattr(A, "PBKDF2_ITERATIONS", 2000)
    assert A.needs_rehash(h)


def test_sstc_hash_format_compatible():
    """Băm từ SSTC-HUB-APP (Go, base64 chuẩn không đệm) đọc được ở Vonia."""
    import base64, hashlib
    salt = b"0123456789abcdef"
    dk = hashlib.pbkdf2_hmac("sha256", b"hello-world-pw", salt, 1000, 32)
    stored = "pbkdf2-sha256$1000${}${}".format(
        base64.b64encode(salt).decode().rstrip("="), base64.b64encode(dk).decode().rstrip("="))
    assert A.verify_password(stored, "hello-world-pw")


@pytest.mark.parametrize("pw,ok", [
    ("short", False), ("x" * 129, False), (" " * 12, False),
    ("alice@example.com", False), ("alice-long-name", True), (GOOD_PW, True),
])
def test_password_policy(pw, ok):
    assert (A.check_new_password(pw, "alice@example.com") == "") is ok


def test_in_domain_requires_single_at():
    assert A.in_domain("a@sstc.vn", "sstc.vn")
    assert not A.in_domain("ke@evil.com@sstc.vn", "sstc.vn")
    assert not A.in_domain("a@evil.vn", "sstc.vn")


# ── Người đầu tiên là Admin, người sau chờ duyệt ─────────────────────────────

def test_first_registrant_is_active_admin(monkeypatch, redis):
    auth = make_auth(monkeypatch)
    store = auth.store(redis)
    first = run(auth.register_password(store, "Boss@Example.com", "Boss", GOOD_PW))
    assert first.email == "boss@example.com"
    assert first.is_admin and first.active and first.approved_by == "bootstrap"

    second = run(auth.register_password(store, "member@example.com", "Mem", GOOD_PW))
    assert not second.is_admin and second.status == A.STATUS_PENDING


def test_first_google_user_is_active_admin(monkeypatch, redis):
    auth = make_auth(monkeypatch)
    store = auth.store(redis)
    u = run(auth.login_google(store, {"email": "g@gmail.com", "name": "G", "email_verified": True}))
    assert u.is_admin and u.active and u.providers == ["google"]
    with pytest.raises(A.AuthError) as ei:
        run(auth.login_google(store, {"email": "h@gmail.com", "name": "H", "email_verified": True}))
    assert ei.value.code == A.ERR_PENDING
    assert run(store.get("h@gmail.com")).status == A.STATUS_PENDING


def test_bootstrap_race_only_one_admin(monkeypatch, redis):
    auth = make_auth(monkeypatch)
    store = auth.store(redis)

    async def both():
        return await asyncio.gather(*[
            store.create(f"u{i}@x.com", "U", provider="password", email_verified=False)
            for i in range(10)])
    users = run(both())
    assert sum(1 for u in users if u.is_admin) == 1


def test_admin_emails_restricts_bootstrap(monkeypatch, redis):
    auth = make_auth(monkeypatch, VONIA_ADMIN_EMAILS="owner@x.com")
    store = auth.store(redis)
    stranger = run(auth.register_password(store, "stranger@x.com", "S", GOOD_PW))
    assert stranger.status == A.STATUS_PENDING and not stranger.is_admin
    owner = run(auth.register_password(store, "owner@x.com", "O", GOOD_PW))
    assert owner.is_admin and owner.active


def test_duplicate_registration_returns_none(monkeypatch, redis):
    auth = make_auth(monkeypatch)
    store = auth.store(redis)
    run(auth.register_password(store, "a@x.com", "A", GOOD_PW))
    assert run(auth.register_password(store, "a@x.com", "A2", GOOD_PW + "z")) is None


def test_register_validation(monkeypatch, redis):
    auth = make_auth(monkeypatch)
    with pytest.raises(A.AuthError) as ei:
        run(auth.register_password(auth.store(redis), "not-an-email", "", "short"))
    assert ei.value.status == 422
    assert set(ei.value.fields) == {"email", "full_name", "password"}


def test_register_domain_restriction(monkeypatch, redis):
    auth = make_auth(monkeypatch, VONIA_ALLOWED_DOMAIN="sstc.vn")
    with pytest.raises(A.AuthError) as ei:
        run(auth.register_password(auth.store(redis), "a@gmail.com", "A", GOOD_PW))
    assert ei.value.code == A.ERR_DOMAIN


# ── Đăng nhập mật khẩu ───────────────────────────────────────────────────────

def test_password_login_ok_and_wrong(monkeypatch, redis):
    auth = make_auth(monkeypatch)
    store = auth.store(redis)
    run(auth.register_password(store, "a@x.com", "A", GOOD_PW))
    assert run(auth.login_password(store, "A@X.com", GOOD_PW)).email == "a@x.com"
    with pytest.raises(A.AuthError) as ei:
        run(auth.login_password(store, "a@x.com", "wrong-password"))
    assert ei.value.code == A.ERR_BAD_CREDENTIALS


def test_password_login_unknown_email_same_error(monkeypatch, redis):
    auth = make_auth(monkeypatch)
    with pytest.raises(A.AuthError) as ei:
        run(auth.login_password(auth.store(redis), "ghost@x.com", GOOD_PW))
    assert ei.value.code == A.ERR_BAD_CREDENTIALS


def test_pending_user_blocked_only_after_correct_password(monkeypatch, redis):
    auth = make_auth(monkeypatch)
    store = auth.store(redis)
    run(auth.register_password(store, "admin@x.com", "A", GOOD_PW))
    run(auth.register_password(store, "p@x.com", "P", GOOD_PW))
    with pytest.raises(A.AuthError) as wrong:
        run(auth.login_password(store, "p@x.com", "wrong-password"))
    assert wrong.value.code == A.ERR_BAD_CREDENTIALS      # không lộ "chờ duyệt"
    with pytest.raises(A.AuthError) as right:
        run(auth.login_password(store, "p@x.com", GOOD_PW))
    assert right.value.code == A.ERR_PENDING


def test_lockout_after_five_failures(monkeypatch, redis):
    auth = make_auth(monkeypatch)
    store = auth.store(redis)
    run(auth.register_password(store, "a@x.com", "A", GOOD_PW))
    for _ in range(A.MAX_FAILED_LOGINS):
        with pytest.raises(A.AuthError):
            run(auth.login_password(store, "a@x.com", "wrong-password"))
    with pytest.raises(A.AuthError) as ei:
        run(auth.login_password(store, "a@x.com", GOOD_PW))    # đúng mật khẩu vẫn bị khoá
    assert ei.value.code == A.ERR_TOO_MANY and ei.value.status == 429


# ── Google ────────────────────────────────────────────────────────────────────

def test_google_unverified_email_refused(monkeypatch, redis):
    auth = make_auth(monkeypatch)
    with pytest.raises(A.AuthError) as ei:
        run(auth.login_google(auth.store(redis), {"email": "a@x.com", "email_verified": False}))
    assert ei.value.code == A.ERR_EMAIL_UNVERIFIED


def test_google_login_drops_password_set_by_unverified_party(monkeypatch, redis):
    """Kẻ đăng ký trước email của người khác bằng mật khẩu → khi chủ thật vào bằng
    Google, mật khẩu kia bị huỷ."""
    auth = make_auth(monkeypatch)
    store = auth.store(redis)
    run(auth.register_password(store, "admin@x.com", "A", GOOD_PW))
    run(auth.register_password(store, "victim@gmail.com", "Squatter", GOOD_PW))
    with pytest.raises(A.AuthError):
        run(auth.login_google(store, {"email": "victim@gmail.com", "email_verified": True}))
    u = run(store.get("victim@gmail.com"))
    assert u.email_verified and u.password_hash == "" and u.providers == ["google"]


def test_build_google_redirect_and_state(monkeypatch):
    auth = make_auth(monkeypatch)
    url, cookie = auth.build_google_redirect()
    q = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(url).query))
    assert url.startswith(A.GOOGLE_AUTH_URL)
    assert q["client_id"] == "gid"
    assert q["redirect_uri"] == "https://app.example.com/auth/callback"
    assert q["code_challenge_method"] == "S256" and q["prompt"] == "select_account"
    assert auth.verify_state_cookie(cookie, q["state"])
    assert auth.verify_state_cookie(cookie, "other") is None
    assert auth.verify_state_cookie(None, q["state"]) is None
    other = make_auth(monkeypatch, VONIA_SESSION_SECRET="different")
    assert other.verify_state_cookie(cookie, q["state"]) is None


def test_fetch_google_profile(monkeypatch):
    auth = make_auth(monkeypatch)

    def handler(req: httpx.Request):
        if req.url.path.endswith("/token"):
            return httpx.Response(200, json={"access_token": "at"})
        assert req.headers["authorization"] == "Bearer at"
        return httpx.Response(200, json={"email": " A@Gmail.com ", "name": "A", "email_verified": True})

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            return await auth.fetch_google_profile(http, "code", "cv")
    assert run(go()) == {"email": "a@gmail.com", "name": "A", "email_verified": True}


def test_fetch_google_profile_http_error(monkeypatch):
    auth = make_auth(monkeypatch)

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(
                lambda r: httpx.Response(400, json={"error": "invalid_grant"}))) as http:
            await auth.fetch_google_profile(http, "code", "cv")
    with pytest.raises(httpx.HTTPStatusError):
        run(go())


# ── Phiên ─────────────────────────────────────────────────────────────────────

def test_session_resolve_and_disable(monkeypatch, redis):
    auth = make_auth(monkeypatch)
    store = auth.store(redis)
    run(auth.register_password(store, "a@x.com", "A", GOOD_PW))
    token = run(store.create_session("a@x.com"))
    user, ok = run(store.resolve_session(token))
    assert ok and user.email == "a@x.com"
    assert not any(token in k for k in run(redis.keys("*")))   # chỉ lưu băm

    u = run(store.get("a@x.com")); u.status = A.STATUS_DISABLED; run(store.save(u))
    user, ok = run(store.resolve_session(token))
    assert not ok
    assert run(store.resolve_session(token)) is None          # phiên đã bị xoá


# ── Quản trị ─────────────────────────────────────────────────────────────────

def test_admin_actions_and_guards(monkeypatch, redis):
    auth = make_auth(monkeypatch)
    store = auth.store(redis)
    admin = run(auth.register_password(store, "admin@x.com", "A", GOOD_PW))
    run(auth.register_password(store, "m@x.com", "M", GOOD_PW))

    with pytest.raises(A.AuthError) as ei:
        run(A.admin_update(store, admin, "m@x.com", "make_admin"))
    assert ei.value.code == "NOT_ACTIVE"

    m = run(A.admin_update(store, admin, "m@x.com", "approve"))
    assert m.active and m.approved_by == "admin@x.com"

    for action in ("disable", "revoke_admin", "delete"):
        with pytest.raises(A.AuthError) as ei:
            run(A.admin_update(store, admin, "admin@x.com", action))
        assert ei.value.code == "SELF_ACTION"

    run(A.admin_update(store, admin, "m@x.com", "make_admin"))
    run(A.admin_update(store, admin, "m@x.com", "revoke_admin"))
    assert run(A.admin_update(store, admin, "m@x.com", "disable")).status == A.STATUS_DISABLED
    assert run(A.admin_update(store, admin, "m@x.com", "delete")) is None
    assert run(store.get("m@x.com")) is None
    with pytest.raises(A.AuthError) as ei:
        run(A.admin_update(store, admin, "m@x.com", "approve"))
    assert ei.value.status == 404


def test_cannot_remove_last_admin(monkeypatch, redis):
    auth = make_auth(monkeypatch)
    store = auth.store(redis)
    a1 = run(auth.register_password(store, "a1@x.com", "A1", GOOD_PW))
    run(auth.register_password(store, "a2@x.com", "A2", GOOD_PW))
    run(A.admin_update(store, a1, "a2@x.com", "approve"))
    a2 = run(A.admin_update(store, a1, "a2@x.com", "make_admin"))
    run(A.admin_update(store, a2, "a1@x.com", "revoke_admin"))    # còn a2 → được
    a1 = run(store.get("a1@x.com"))
    with pytest.raises(A.AuthError) as ei:
        run(A.admin_update(store, a1, "a2@x.com", "disable"))     # a1 không còn là admin
    # admin_update không tự kiểm actor là admin (route làm việc đó), nhưng vẫn
    # chặn gỡ Quản trị viên cuối cùng.
    assert ei.value.code == "LAST_ADMIN"


# ── HTTP: cổng + routes ──────────────────────────────────────────────────────

@pytest.fixture
def client(monkeypatch, redis):
    make_auth(monkeypatch)
    app = create_app(MagicMock(), web_dir=None)
    # Lifespan không chạy nếu không dùng `with TestClient(...)` → gắn tay.
    app.state.redis = redis
    app.state.http = AsyncMock()
    return TestClient(app)


def _register(client, email, name="X", pw=GOOD_PW):
    return client.post("/auth/register", json={"email": email, "full_name": name, "password": pw})


def test_gate_login_page_for_unauth_html(client):
    r = client.get("/studio", headers={"accept": "text/html"})
    assert r.status_code == 200
    assert 'data-action="/auth/login"' in r.text and 'href="/auth/google"' in r.text


def test_gate_401_for_unauth_api(client):
    assert client.get("/v1/voices", headers={"accept": "application/json"}).status_code == 401


def test_google_button_hidden_when_unconfigured(monkeypatch, redis):
    make_auth(monkeypatch, GOOGLE_CLIENT_ID="", GOOGLE_CLIENT_SECRET="")
    app = create_app(MagicMock(), web_dir=None)
    app.state.redis = redis
    c = TestClient(app)
    r = c.get("/auth/login")
    assert r.status_code == 200 and "/auth/google" not in r.text
    r = c.get("/auth/google", follow_redirects=False)
    assert r.status_code == 303 and "loi=google_chua_bat" in r.headers["location"]


def test_register_page_announces_first_admin(client):
    assert "Quản trị viên" in client.get("/auth/register").text
    _register(client, "boss@x.com")
    client.cookies.clear()
    assert "sau khi Quản trị viên duyệt" in client.get("/auth/register").text


def test_http_full_flow(client):
    # 1. Người đầu tiên: admin, đăng nhập ngay.
    r = _register(client, "boss@x.com", "Boss")
    assert r.status_code == 200 and r.json()["user"]["is_admin"]
    assert "vonia_session" in r.cookies
    me = client.get("/auth/me").json()
    assert me["email"] == "boss@x.com" and me["is_admin"] and me["status"] == "active"
    boss_cookie = client.cookies.get("vonia_session")

    # 2. Người thứ hai: chờ duyệt, không có cookie.
    client.cookies.clear()
    r = _register(client, "mem@x.com", "Mem")
    assert r.status_code == 202 and "vonia_session" not in r.cookies
    # Đăng ký trùng → cùng câu, cùng status.
    r2 = _register(client, "mem@x.com", "Mem")
    assert r2.status_code == 202 and r2.json() == r.json()

    r = client.post("/auth/login", json={"email": "mem@x.com", "password": GOOD_PW})
    assert r.status_code == 403 and r.json()["redirect"] == "/auth/pending"

    # 3. Admin duyệt.
    client.cookies.set("vonia_session", boss_cookie)
    lst = client.get("/admin/users").json()
    assert lst["pending"] == 1 and lst["users"][0]["email"] == "mem@x.com"
    assert "password_hash" not in lst["users"][0]
    r = client.post("/admin/users/mem@x.com", json={"action": "approve"})
    assert r.status_code == 200 and r.json()["user"]["status"] == "active"

    # 4. Thành viên đăng nhập được, nhưng không vào được trang quản trị.
    client.cookies.clear()
    r = client.post("/auth/login", json={"email": "mem@x.com", "password": GOOD_PW})
    assert r.status_code == 200 and r.json()["redirect"] == "/"
    assert client.get("/admin/users").status_code == 403
    mem_cookie = client.cookies.get("vonia_session")

    # 5. Admin khoá → thành viên văng ra ngay ở yêu cầu kế tiếp.
    client.cookies.set("vonia_session", boss_cookie)
    client.post("/admin/users/mem@x.com", json={"action": "disable"})
    client.cookies.set("vonia_session", mem_cookie)
    r = client.get("/v1/presets", headers={"accept": "application/json"})
    assert r.status_code == 403

    # 6. Đăng xuất.
    client.cookies.set("vonia_session", boss_cookie)
    client.get("/logout", follow_redirects=False)
    client.cookies.set("vonia_session", boss_cookie)
    assert client.get("/auth/me").status_code == 401


def test_http_wrong_password_401(client):
    _register(client, "boss@x.com")
    client.cookies.clear()
    r = client.post("/auth/login", json={"email": "boss@x.com", "password": "nope-nope-nope"})
    assert r.status_code == 401 and r.json()["error"]["type"] == A.ERR_BAD_CREDENTIALS


def test_http_register_validation_422(client):
    r = client.post("/auth/register", json={"email": "bad", "full_name": "", "password": "x"})
    assert r.status_code == 422 and "fields" in r.json()["error"]


def test_register_rejects_non_json_body(client):
    """Form giả mạo từ trang khác (text/plain / form-urlencoded) không đi qua."""
    r = client.post("/auth/register", content="email=a@x.com",
                    headers={"content-type": "application/x-www-form-urlencoded"})
    assert r.status_code == 422


def test_google_start_sets_state_cookie(client):
    r = client.get("/auth/google", follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"].startswith(A.GOOGLE_AUTH_URL)
    assert "vonia_oauth_state" in r.headers["set-cookie"]


def test_google_callback_state_mismatch(client):
    r = client.get("/auth/callback?code=c&state=s", follow_redirects=False)
    assert r.status_code == 303 and "loi=phien_dang_nhap_hong" in r.headers["location"]


def test_google_callback_user_denied(client):
    r = client.get("/auth/callback?error=access_denied", follow_redirects=False)
    assert "loi=google_tu_choi" in r.headers["location"]


def _google_callback(client, monkeypatch, profile):
    r = client.get("/auth/google", follow_redirects=False)
    q = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(r.headers["location"]).query))
    monkeypatch.setattr(A.Auth, "fetch_google_profile", AsyncMock(return_value=profile))
    return client.get(f"/auth/callback?code=c&state={q['state']}", follow_redirects=False)


def test_google_callback_first_user_admin_then_pending(client, monkeypatch):
    r = _google_callback(client, monkeypatch,
                         {"email": "g@gmail.com", "name": "G", "email_verified": True})
    assert r.status_code == 303 and r.headers["location"] == "/"
    assert client.get("/auth/me").json()["is_admin"]

    client.cookies.clear()
    r = _google_callback(client, monkeypatch,
                         {"email": "n@gmail.com", "name": "N", "email_verified": True})
    assert r.headers["location"] == "/auth/pending"
    assert client.get("/auth/me").status_code == 401


def test_api_key_bypasses_gate_but_not_admin(monkeypatch, redis):
    make_auth(monkeypatch, VONIA_API_KEYS="k1")
    app = create_app(MagicMock(), web_dir=None)
    app.state.redis = redis
    c = TestClient(app)
    r = c.get("/no-such-path", headers={"x-api-key": "k1"})
    assert r.status_code == 404                       # qua cổng
    assert c.get("/admin/users", headers={"x-api-key": "k1"}).status_code == 403


def test_user_api_key_lifecycle(client):
    _register(client, "boss@x.com")
    boss_cookie = client.cookies.get("vonia_session")

    r = client.post("/account/api-keys", json={"name": "n8n"})
    assert r.status_code == 200
    key, rec = r.json()["key"], r.json()["record"]
    assert key.startswith(A.API_KEY_PREFIX) and rec["name"] == "n8n"
    listed = client.get("/account/api-keys").json()["keys"]
    assert [k["id"] for k in listed] == [rec["id"]]
    assert key not in str(listed)                     # chỉ lưu băm, không trả lại key

    # Gọi được API bằng key (X-API-Key hoặc Bearer), không cần cookie.
    client.cookies.clear()
    assert client.get("/no-such-path", headers={"x-api-key": key}).status_code == 404
    assert client.get("/no-such-path",
                      headers={"authorization": f"Bearer {key}"}).status_code == 404
    assert client.get("/no-such-path", headers={"x-api-key": key + "x"}).status_code == 401
    # Key không quản trị được và không tự tạo được key mới.
    assert client.get("/admin/users", headers={"x-api-key": key}).status_code == 403
    assert client.post("/account/api-keys", json={},
                       headers={"x-api-key": key}).status_code == 403

    # Thu hồi → key ngừng chạy ngay.
    client.cookies.set("vonia_session", boss_cookie)
    assert client.delete(f"/account/api-keys/{rec['id']}").status_code == 204
    client.cookies.clear()
    assert client.get("/no-such-path", headers={"x-api-key": key}).status_code == 401


def test_user_api_key_stops_when_owner_disabled(client):
    _register(client, "boss@x.com")
    boss_cookie = client.cookies.get("vonia_session")
    client.cookies.clear()
    _register(client, "mem@x.com")
    client.cookies.set("vonia_session", boss_cookie)
    client.post("/admin/users/mem@x.com", json={"action": "approve"})
    client.cookies.clear()
    client.post("/auth/login", json={"email": "mem@x.com", "password": GOOD_PW})
    key = client.post("/account/api-keys", json={"name": "k"}).json()["key"]
    client.cookies.clear()
    assert client.get("/no-such-path", headers={"x-api-key": key}).status_code == 404

    client.cookies.set("vonia_session", boss_cookie)
    client.post("/admin/users/mem@x.com", json={"action": "disable"})
    client.cookies.clear()
    assert client.get("/no-such-path", headers={"x-api-key": key}).status_code == 401


def test_user_api_keys_are_per_owner(client):
    _register(client, "boss@x.com")
    rec = client.post("/account/api-keys", json={"name": "a"}).json()["record"]
    boss_cookie = client.cookies.get("vonia_session")
    client.cookies.clear()
    _register(client, "mem@x.com")
    client.cookies.set("vonia_session", boss_cookie)
    client.post("/admin/users/mem@x.com", json={"action": "approve"})
    client.cookies.clear()
    client.post("/auth/login", json={"email": "mem@x.com", "password": GOOD_PW})
    assert client.get("/account/api-keys").json()["keys"] == []
    assert client.delete(f"/account/api-keys/{rec['id']}").status_code == 404


def test_auth_off_disables_gate(monkeypatch, redis):
    make_auth(monkeypatch, VONIA_AUTH="off")
    app = create_app(MagicMock(), web_dir=None)
    app.state.redis = redis
    assert TestClient(app).get("/no-such-path").status_code == 404


# ── Thanh toán SePay tắt mặc định ─────────────────────────────────────────────

def test_payment_routes_hidden_by_default(monkeypatch, redis):
    make_auth(monkeypatch, VONIA_API_KEYS="k1")
    monkeypatch.delenv("VONIA_PAYMENTS", raising=False)
    app = create_app(MagicMock(), web_dir=None)
    app.state.redis = redis
    c = TestClient(app)
    for path in ("/payment/config", "/payment/plans"):
        assert c.get(path, headers={"x-api-key": "k1"}).status_code == 404
    assert c.post("/payment/webhook", content=b"{}").status_code == 404


def test_payment_routes_back_when_enabled(monkeypatch, redis):
    make_auth(monkeypatch, VONIA_API_KEYS="k1")
    monkeypatch.setenv("VONIA_PAYMENTS", "on")
    app = create_app(MagicMock(), web_dir=None)
    app.state.redis = redis
    r = TestClient(app).get("/payment/plans", headers={"x-api-key": "k1"})
    assert r.status_code == 200
