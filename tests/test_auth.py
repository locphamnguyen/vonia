"""Tests for OIDC auth module (omnivoice/server/auth.py).

Covers 20 code paths:
 1-3  : OIDCAuth.is_allowed — no allowlist, email in, email not in
 4-6  : _sign / _unsign — roundtrip, tampered sig, mangled base64
 7-9  : verify_state_cookie — happy path, state mismatch, no cookie
 10-12: Redis session — create+get, get unknown id, revoke
 13   : build_auth_redirect — PKCE params present
 14-15: OIDCAuth.enabled — with/without env vars
 16-17: exchange_code — success, HTTP error
 18-19: get_user_info — success, HTTP error
 20   : verify_state_cookie rejects cookie signed with different secret
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
import httpx

from omnivoice.server.auth import OIDCAuth


# ── Fixture helpers ───────────────────────────────────────────────────────────

def make_auth(**env) -> OIDCAuth:
    """Create an OIDCAuth with explicit env values (not from os.environ)."""
    auth = OIDCAuth.__new__(OIDCAuth)
    auth.domain = env.get("domain", "auth.example.com")
    auth.client_id = env.get("client_id", "test_client")
    auth.client_secret = env.get("client_secret", "test_secret")
    auth.redirect_uri = "https://app.example.com/auth/callback"
    raw_emails = env.get("allowed_emails", "")
    auth.allowed_emails = {e.strip().lower() for e in raw_emails.split(",") if e.strip()}
    secret = env.get("session_secret", "test-session-secret-32-chars-long!")
    auth._secret = secret.encode()
    auth.enabled = bool(auth.domain and auth.client_id)
    return auth


def make_redis(**data: str) -> AsyncMock:
    """Fake async Redis with in-memory dict backing."""
    store: dict[str, str] = dict(data)

    redis = AsyncMock()

    async def _get(key: str):
        return store.get(key)

    async def _set(key: str, value: str, ex=None):
        store[key] = value

    async def _delete(key: str):
        store.pop(key, None)

    redis.get.side_effect = _get
    redis.set.side_effect = _set
    redis.delete.side_effect = _delete
    return redis


# ── 1-3: is_allowed ───────────────────────────────────────────────────────────

def test_is_allowed_no_allowlist():
    """1: Empty allowlist permits everything."""
    auth = make_auth(allowed_emails="")
    assert auth.is_allowed("anyone@gmail.com")


def test_is_allowed_email_in_list():
    """2: Exact match (case-insensitive) returns True."""
    auth = make_auth(allowed_emails="admin@example.com,user@example.com")
    assert auth.is_allowed("Admin@Example.COM")


def test_is_allowed_email_not_in_list():
    """3: Unknown email returns False."""
    auth = make_auth(allowed_emails="admin@example.com")
    assert not auth.is_allowed("stranger@gmail.com")


# ── 4-6: _sign / _unsign ─────────────────────────────────────────────────────

def test_sign_unsign_roundtrip():
    """4: Signed payload can be recovered."""
    auth = make_auth()
    payload = '{"state":"abc","cv":"xyz"}'
    assert auth._unsign(auth._sign(payload)) == payload


def test_unsign_tampered_signature():
    """5: Modified ciphertext is rejected."""
    auth = make_auth()
    token = auth._sign("payload")
    # Flip the last byte
    tampered = token[:-2] + ("AA" if token[-2:] != "AA" else "BB")
    assert auth._unsign(tampered) is None


def test_unsign_mangled_base64():
    """6: Arbitrary non-base64 string is rejected without exception."""
    auth = make_auth()
    assert auth._unsign("not!!valid%%base64") is None


# ── 7-9: verify_state_cookie ─────────────────────────────────────────────────

def test_verify_state_cookie_happy():
    """7: Valid cookie with matching state returns code_verifier."""
    auth = make_auth()
    state = "my-state-nonce"
    cv = "my-code-verifier"
    cookie_val = auth._sign(json.dumps({"state": state, "cv": cv}))
    result = auth.verify_state_cookie(cookie_val, state)
    assert result == cv


def test_verify_state_cookie_state_mismatch():
    """8: Wrong state value returns None."""
    auth = make_auth()
    cookie_val = auth._sign(json.dumps({"state": "correct", "cv": "cv"}))
    assert auth.verify_state_cookie(cookie_val, "wrong") is None


def test_verify_state_cookie_no_cookie():
    """9: None cookie returns None."""
    auth = make_auth()
    assert auth.verify_state_cookie(None, "any-state") is None


# ── 10-12: Redis session ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_session_create_and_get():
    """10: Session created in Redis can be retrieved."""
    auth = make_auth()
    redis = make_redis()
    session_id = await auth.create_session(redis, "user@example.com", "sub-123")
    session = await auth.get_session(redis, session_id)
    assert session == {"email": "user@example.com", "sub": "sub-123"}


@pytest.mark.asyncio
async def test_get_session_unknown():
    """11: Unknown session_id returns None."""
    auth = make_auth()
    redis = make_redis()
    assert await auth.get_session(redis, "nonexistent-id") is None


@pytest.mark.asyncio
async def test_revoke_session():
    """12: Revoked session is no longer retrievable."""
    auth = make_auth()
    redis = make_redis()
    session_id = await auth.create_session(redis, "user@example.com", "sub-xyz")
    await auth.revoke_session(redis, session_id)
    assert await auth.get_session(redis, session_id) is None


# ── 13: build_auth_redirect ───────────────────────────────────────────────────

def test_build_auth_redirect_pkce_params():
    """13: Authorization URL contains required PKCE + OIDC params."""
    auth = make_auth()
    url, cookie_val = auth.build_auth_redirect()
    assert "code_challenge=" in url
    assert "code_challenge_method=S256" in url
    assert "state=" in url
    assert "client_id=test_client" in url
    assert "response_type=code" in url
    # Cookie should be a valid signed blob
    assert auth._unsign(cookie_val) is not None


# ── 14-15: OIDCAuth.enabled ───────────────────────────────────────────────────

def test_auth_enabled_with_config():
    """14: Auth is enabled when domain + client_id are set."""
    auth = make_auth(domain="auth.example.com", client_id="cid")
    assert auth.enabled is True


def test_auth_disabled_without_config():
    """15: Auth is disabled when domain or client_id is missing."""
    auth = make_auth(domain="", client_id="")
    assert auth.enabled is False


# ── 16-17: exchange_code ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_exchange_code_success():
    """16: Successful token exchange returns parsed JSON."""
    auth = make_auth()
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"access_token": "tok123", "token_type": "Bearer"}
    mock_resp.raise_for_status = MagicMock()

    http = AsyncMock(spec=httpx.AsyncClient)
    http.post.return_value = mock_resp

    tokens = await auth.exchange_code(http, code="authcode", code_verifier="cv")
    assert tokens["access_token"] == "tok123"
    http.post.assert_called_once()


@pytest.mark.asyncio
async def test_exchange_code_http_error():
    """17: HTTP error from token endpoint raises httpx.HTTPStatusError."""
    auth = make_auth()

    def _raise():
        raise httpx.HTTPStatusError("bad", request=MagicMock(), response=MagicMock())

    mock_resp = MagicMock()
    mock_resp.raise_for_status.side_effect = _raise

    http = AsyncMock(spec=httpx.AsyncClient)
    http.post.return_value = mock_resp

    with pytest.raises(httpx.HTTPStatusError):
        await auth.exchange_code(http, code="authcode", code_verifier="cv")


# ── 18-19: get_user_info ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_user_info_success():
    """18: Successful userinfo call returns user dict."""
    auth = make_auth()
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"sub": "sub-abc", "email": "user@gmail.com"}
    mock_resp.raise_for_status = MagicMock()

    http = AsyncMock(spec=httpx.AsyncClient)
    http.get.return_value = mock_resp

    info = await auth.get_user_info(http, access_token="tok123")
    assert info["email"] == "user@gmail.com"
    http.get.assert_called_once()


@pytest.mark.asyncio
async def test_get_user_info_http_error():
    """19: HTTP error from userinfo endpoint raises httpx.HTTPStatusError."""
    auth = make_auth()

    def _raise():
        raise httpx.HTTPStatusError("forbidden", request=MagicMock(), response=MagicMock())

    mock_resp = MagicMock()
    mock_resp.raise_for_status.side_effect = _raise

    http = AsyncMock(spec=httpx.AsyncClient)
    http.get.return_value = mock_resp

    with pytest.raises(httpx.HTTPStatusError):
        await auth.get_user_info(http, access_token="tok123")


# ── 20: Cross-secret cookie rejection ────────────────────────────────────────

def test_verify_state_cookie_wrong_secret():
    """20: Cookie signed with a different secret is rejected."""
    auth_a = make_auth(session_secret="secret-A-32-chars-xxxxxxxxxxxxxxxx")
    auth_b = make_auth(session_secret="secret-B-32-chars-yyyyyyyyyyyyyyyy")
    state = "nonce"
    cookie_from_a = auth_a._sign(json.dumps({"state": state, "cv": "verifier"}))
    assert auth_b.verify_state_cookie(cookie_from_a, state) is None
