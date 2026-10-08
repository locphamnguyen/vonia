"""FastAPI application for the OmniVoice API server.

Exposes a rich custom REST surface (/tts, /tts/upload, /v1/voices...) plus an
OpenAI-compatible /v1/audio/speech endpoint. Build with ``create_app(engine)``.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import urllib.parse
from contextlib import asynccontextmanager
from typing import Optional

import httpx
import redis.asyncio as aioredis
from fastapi import FastAPI, File, Form, Query, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from omnivoice.models.omnivoice import OmniVoiceGenerationConfig

from .auth import (
    BOOTSTRAP_KEY, COOKIE, ERR_GOOGLE_DENIED, ERR_LOGIN_INVALID, ERR_PENDING,
    PUBLIC_PATHS, REASONS, SESSION_TTL, STATE_COOKIE, STATUS_PENDING, STATUSES,
    Auth, AuthError, User, UserStore, admin_update, api_key_from_headers,
)
from .auth_pages import login_page, pending_page, register_page
from . import phone_home
from .billing import BillingStore, OrderRecord, new_invoice_number, new_payment_code
from .engine import Engine, QueueFullError
from .normalize import NormalizerError
from .presets import PRESETS
from .schemas import (
    CheckoutRequest, CheckoutResponse, ErrorResponse, QrRequest, QrResponse,
    SpeechRequest, SttResponse, TTSRequest, VoiceList, VoicePublic, VramConfig,
)
from .sepay import PLANS, bank_config_from_env, client_from_env
from .voices import VoiceExistsError, VoiceNotFoundError


log = logging.getLogger(__name__)


def _err(status: int, message: str, type_: str = "error") -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"message": message, "type": type_}})


def _audio_response(data: bytes, content_type: str, as_json: bool, fmt: str) -> Response:
    if as_json:
        return JSONResponse({"audio_base64": base64.b64encode(data).decode("ascii"),
                             "format": fmt, "content_type": content_type})
    return Response(content=data, media_type=content_type)


# ── Thân yêu cầu của các route xác thực / quản trị ─────────────────────────
class LoginBody(BaseModel):
    email: str = ""
    password: str = ""


class RegisterBody(BaseModel):
    email: str = ""
    full_name: str = ""
    password: str = ""


class AdminAction(BaseModel):
    action: str


class ApiKeyCreate(BaseModel):
    name: str = ""


def create_app(engine: Engine, web_dir: Optional[str] = None) -> FastAPI:

    # ── Lifespan: khởi tạo Redis + httpx client ──────────────────────────────
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        redis_url = os.environ.get("REDIS_URL", "redis://localhost:30379")
        app.state.redis = aioredis.from_url(redis_url, decode_responses=True)
        app.state.http = httpx.AsyncClient(timeout=15.0)
        log.info("Redis connected: %s", redis_url)

        if engine.supports_idle_offload:
            app.state.idle_task = asyncio.create_task(engine.idle_monitor())
        # Gọi-về trang trung tâm + dải thông báo (phone_home.py).
        app.state.phone_home_task = (
            asyncio.create_task(phone_home.phone_home_loop(app.state.http, app.state.redis))
            if phone_home.should_start() else None
        )

        yield

        # Dừng vòng gọi-về TRƯỚC khi đóng http/redis mà nó đang dùng.
        ph_task = getattr(app.state, "phone_home_task", None)
        if ph_task is not None:
            ph_task.cancel()
            try:
                await ph_task
            except asyncio.CancelledError:
                pass
        await app.state.redis.aclose()
        await app.state.http.aclose()
        task = getattr(app.state, "idle_task", None)
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    app = FastAPI(
        title="OmniVoice API", version="1.0",
        description="Zero-shot multilingual TTS — voice cloning, voice design, auto voice.",
        lifespan=lifespan,
    )

    # ── CORS ─────────────────────────────────────────────────────────────────
    _origins_env = os.environ.get("VONIA_CORS_ORIGINS", "*").strip()
    allow_origins = ["*"] if _origins_env == "*" else [
        o.strip() for o in _origins_env.split(",") if o.strip()
    ]
    app.add_middleware(CORSMiddleware, allow_origins=allow_origins,
                       allow_methods=["*"], allow_headers=["*"])

    # ── Body size guard ───────────────────────────────────────────────────────
    max_upload = int(os.environ.get("VONIA_MAX_UPLOAD_MB", "25")) * 1024 * 1024

    @app.middleware("http")
    async def _limit_body(request: Request, call_next):
        if request.method in ("POST", "PUT", "PATCH"):
            cl = request.headers.get("content-length")
            if cl and cl.isdigit() and int(cl) > max_upload:
                return _err(413, f"Payload too large (limit {max_upload // 2**20} MB).",
                            "payload_too_large")
        return await call_next(request)

    # ── Auth ──────────────────────────────────────────────────────────────────
    auth = Auth()
    if not auth.enabled:
        log.warning("VONIA_AUTH=off — cổng đăng nhập ĐANG TẮT (chỉ dùng khi phát triển).")
    elif not auth.google_enabled:
        log.info("Google OAuth chưa cấu hình — chỉ đăng nhập bằng email/mật khẩu.")

    def _wants_html(request: Request) -> bool:
        return "text/html" in request.headers.get("accept", "")

    def _store(request: Request) -> UserStore:
        return auth.store(request.app.state.redis)

    @app.middleware("http")
    async def _gate(request: Request, call_next):
        if not auth.enabled or request.method == "OPTIONS":
            return await call_next(request)
        if request.url.path in PUBLIC_PATHS or request.url.path.startswith("/auth/"):
            return await call_next(request)

        # API key (server-to-server) — bỏ qua đăng nhập nếu key hợp lệ. Không gán
        # request.state.user: key gọi được API tạo giọng, nhưng không quản trị
        # và không tạo được key mới.
        x_api_key = request.headers.get("x-api-key")
        authorization = request.headers.get("authorization")
        if auth.check_api_key(x_api_key, authorization):
            request.state.session = {"email": "api-key", "sub": "api-key"}
            return await call_next(request)
        candidate = api_key_from_headers(x_api_key, authorization)
        if candidate:
            owner = await _store(request).resolve_api_key(candidate)
            if owner is not None:
                request.state.session = {"email": owner.email, "sub": owner.email}
                return await call_next(request)

        resolved = await _store(request).resolve_session(request.cookies.get(COOKIE))
        if resolved and resolved[1]:
            user = resolved[0]
            request.state.user = user
            request.state.session = {"email": user.email, "sub": user.email}
            return await call_next(request)

        # Không có phiên, hoặc tài khoản vừa bị khoá → xoá cookie hỏng.
        if _wants_html(request):
            if resolved:  # phiên trỏ tới tài khoản không còn kích hoạt
                resp = RedirectResponse("/auth/pending", status_code=303)
            else:
                resp = HTMLResponse(login_page(auth.google_enabled), status_code=200)
        elif resolved:
            resp = _err(403, "Tài khoản chưa được kích hoạt.", ERR_PENDING)
        else:
            resp = _err(401, "Authentication required.", "unauthorized")
        if request.cookies.get(COOKIE):
            resp.delete_cookie(COOKIE, path="/")
        return resp

    # ── Billing ───────────────────────────────────────────────────────────────
    billing = BillingStore(
        redis_url=os.environ.get("REDIS_URL", "redis://localhost:30379")
    )
    sepay = client_from_env()
    bank = bank_config_from_env()
    # Thanh toán SePay đang TẮT mặc định (Vonia không bán gói nữa). Đặt
    # VONIA_PAYMENTS=on để bật lại các route /payment/* (web: PAYMENTS_ENABLED).
    payments_enabled = (os.environ.get("VONIA_PAYMENTS") or "off").strip().lower() in (
        "on", "1", "true", "yes")

    if not payments_enabled:
        log.info("Payments disabled (VONIA_PAYMENTS=off) — /payment/* returns 404.")

        @app.middleware("http")
        async def _payments_off(request: Request, call_next):
            path = request.url.path
            if path == "/payment" or path.startswith("/payment/"):
                return _err(404, "Not found.", "not_found")
            return await call_next(request)
    else:
        if sepay.configured:
            log.info("SePay payment gateway enabled (env=%s, merchant=%s).",
                     sepay.env, sepay.merchant_id)
        else:
            log.warning("SePay gateway NOT configured (merchant_id/secret_key).")
        if bank.configured:
            log.info("SePay VietQR/webhook enabled (bank=%s, acc=%s).",
                     bank.bank_code, bank.bank_account)
        else:
            log.warning("SePay VietQR NOT configured.")

    def _customer_id(request: Request) -> str:
        session = getattr(request.state, "session", None)
        if session:
            return session.get("email") or "default"
        return "default"

    # ── Error handlers ────────────────────────────────────────────────────────
    @app.exception_handler(NormalizerError)
    async def _h_norm(_: Request, exc: NormalizerError):
        return _err(400, str(exc), "normalizer_error")

    @app.exception_handler(VoiceNotFoundError)
    async def _h_vnf(_: Request, exc: VoiceNotFoundError):
        return _err(404, f"Voice not found: {exc}", "voice_not_found")

    @app.exception_handler(VoiceExistsError)
    async def _h_vex(_: Request, exc: VoiceExistsError):
        return _err(409, f"Voice already exists: {exc} (use overwrite=true)", "voice_exists")

    @app.exception_handler(QueueFullError)
    async def _h_busy(_: Request, exc: QueueFullError):
        return _err(503, str(exc), "queue_full")

    @app.exception_handler(ValueError)
    async def _h_val(_: Request, exc: ValueError):
        return _err(400, str(exc), "invalid_request")

    # ── Auth routes ───────────────────────────────────────────────────────────

    def _secure(request: Request) -> bool:
        return (request.headers.get("x-forwarded-proto", "").startswith("https")
                or request.url.scheme == "https")

    def _set_session_cookie(request: Request, resp: Response, token: str) -> None:
        # HttpOnly: JS không đọc được. Lax (không Strict): lượt gọi về từ Google
        # là điều hướng cấp cao nhất từ tên miền khác, Strict sẽ chặn cookie.
        resp.set_cookie(COOKIE, token, httponly=True, samesite="lax",
                        secure=_secure(request), max_age=SESSION_TTL, path="/")

    def _auth_err(exc: AuthError) -> JSONResponse:
        body: dict = {"message": exc.message, "type": exc.code}
        if exc.fields:
            body["fields"] = exc.fields
        return JSONResponse(status_code=exc.status, content={"error": body})

    def _to_login(reason: str) -> RedirectResponse:
        # URL đích dựng từ hằng số, không từ yêu cầu → không có open redirect.
        resp = RedirectResponse(
            "/auth/pending" if reason == "cho_duyet"
            else "/auth/login?" + urllib.parse.urlencode({"loi": reason}),
            status_code=303)
        resp.delete_cookie(STATE_COOKIE, path="/auth/callback")
        return resp

    async def _current_user(request: Request) -> Optional[User]:
        resolved = await _store(request).resolve_session(request.cookies.get(COOKIE))
        return resolved[0] if resolved and resolved[1] else None

    @app.get("/auth/login")
    async def auth_login_page(request: Request, loi: Optional[str] = Query(None)):
        """Trang đăng nhập (email/mật khẩu + nút Google)."""
        if await _current_user(request):
            return RedirectResponse("/", status_code=303)
        return HTMLResponse(login_page(auth.google_enabled, loi))

    @app.get("/auth/register")
    async def auth_register_page(request: Request):
        if await _current_user(request):
            return RedirectResponse("/", status_code=303)
        first = not await request.app.state.redis.exists(BOOTSTRAP_KEY)
        return HTMLResponse(register_page(auth.google_enabled, first_user=bool(first)))

    @app.get("/auth/pending")
    async def auth_pending_page():
        return HTMLResponse(pending_page())

    @app.post("/auth/login")
    async def auth_login(request: Request, body: LoginBody):
        """Đăng nhập bằng email + mật khẩu → đặt cookie phiên."""
        store = _store(request)
        try:
            user = await auth.login_password(store, body.email, body.password)
        except AuthError as exc:
            if exc.code == ERR_PENDING:
                return JSONResponse(status_code=403, content={
                    "error": {"message": exc.message, "type": exc.code},
                    "redirect": "/auth/pending"})
            return _auth_err(exc)
        token = await store.create_session(user.email)
        resp = JSONResponse({"user": user.public(), "redirect": "/"})
        _set_session_cookie(request, resp, token)
        log.info("Password login: %s", user.email)
        return resp

    @app.post("/auth/register")
    async def auth_register(request: Request, body: RegisterBody):
        """Đăng ký bằng email + mật khẩu.

        Người đầu tiên → Quản trị viên, đăng nhập luôn. Người sau → chờ duyệt;
        email trùng nhận CÙNG câu trả lời (không dò được email đã đăng ký).
        """
        store = _store(request)
        try:
            user = await auth.register_password(store, body.email, body.full_name, body.password)
        except AuthError as exc:
            return _auth_err(exc)
        if user is not None and user.active:
            token = await store.create_session(user.email)
            resp = JSONResponse({"user": user.public(), "redirect": "/",
                                 "message": "Đã tạo tài khoản Quản trị viên."})
            _set_session_cookie(request, resp, token)
            log.info("Bootstrap admin registered: %s", user.email)
            return resp
        if user is not None:
            log.info("New registration pending approval: %s", user.email)
        return JSONResponse(status_code=202, content={
            "message": "Đã nhận yêu cầu đăng ký. Tài khoản sẽ dùng được sau khi "
                       "Quản trị viên duyệt."})

    @app.get("/auth/google")
    async def auth_google(request: Request):
        """Bắt đầu OAuth + PKCE, chuyển sang Google."""
        if not auth.google_enabled:
            return _to_login("google_chua_bat")
        url, state_cookie_val = auth.build_google_redirect()
        resp = RedirectResponse(url, status_code=303)
        resp.set_cookie(STATE_COOKIE, state_cookie_val, httponly=True, samesite="lax",
                        secure=_secure(request), max_age=600, path="/auth/callback")
        return resp

    @app.get("/auth/callback")
    async def auth_callback(
        request: Request,
        code: Optional[str] = Query(None),
        state: Optional[str] = Query(None),
        error: Optional[str] = Query(None),
    ):
        """Nhận lượt gọi về từ Google, áp luật duyệt, mở phiên."""
        if error:
            log.info("Google OAuth callback error: %s", error)
            return _to_login(REASONS[ERR_GOOGLE_DENIED])
        code_verifier = auth.verify_state_cookie(request.cookies.get(STATE_COOKIE), state or "")
        if not code or not code_verifier:
            log.warning("Google OAuth callback: missing code or state mismatch.")
            return _to_login(REASONS[ERR_LOGIN_INVALID])
        try:
            profile = await auth.fetch_google_profile(request.app.state.http, code, code_verifier)
        except (httpx.HTTPError, ValueError) as exc:
            log.error("Google OAuth exchange failed: %s", exc)
            return _to_login("he_thong")

        store = _store(request)
        try:
            user = await auth.login_google(store, profile)
        except AuthError as exc:
            log.info("Google login refused (%s): %s", exc.code, profile.get("email"))
            return _to_login(REASONS.get(exc.code, "he_thong"))

        token = await store.create_session(user.email)
        resp = RedirectResponse("/", status_code=303)
        _set_session_cookie(request, resp, token)
        resp.delete_cookie(STATE_COOKIE, path="/auth/callback")
        log.info("Google login: %s", user.email)
        return resp

    @app.get("/auth/me")
    async def auth_me(request: Request):
        """Người dùng hiện tại (route trong nhánh /auth/* nên tự đọc phiên)."""
        user = await _current_user(request)
        if not user:
            return _err(401, "Not authenticated.", "unauthorized")
        return {**user.public(), "sub": user.email}

    async def _logout(request: Request) -> None:
        await _store(request).revoke_session(request.cookies.get(COOKIE))

    @app.get("/logout")
    async def logout(request: Request):
        await _logout(request)
        resp = RedirectResponse("/auth/login", status_code=303)
        resp.delete_cookie(COOKIE, path="/")
        return resp

    @app.post("/auth/logout")
    async def logout_post(request: Request):
        await _logout(request)
        resp = Response(status_code=204)
        resp.delete_cookie(COOKIE, path="/")
        return resp

    # ── Quản trị thành viên (chỉ Quản trị viên) ───────────────────────────────

    def _admin(request: Request) -> Optional[User]:
        user = getattr(request.state, "user", None)
        return user if user is not None and user.is_admin else None

    @app.get("/admin/users")
    async def admin_list_users(request: Request, status: Optional[str] = Query(None)):
        if not _admin(request):
            return _err(403, "Chỉ Quản trị viên mới được thực hiện thao tác này.", "forbidden")
        if status is not None and status not in STATUSES:
            return _err(400, "Trạng thái không hợp lệ.", "invalid_request")
        users = await _store(request).list(status)
        users.sort(key=lambda u: (u.status != STATUS_PENDING, -u.created_at))
        return {"users": [u.public() for u in users],
                "pending": sum(1 for u in users if u.status == STATUS_PENDING)}

    @app.post("/admin/users/{email}")
    async def admin_user_action(request: Request, email: str, body: AdminAction):
        actor = _admin(request)
        if not actor:
            return _err(403, "Chỉ Quản trị viên mới được thực hiện thao tác này.", "forbidden")
        try:
            user = await admin_update(_store(request), actor, email, body.action)
        except AuthError as exc:
            return _auth_err(exc)
        log.info("Admin %s: %s → %s", actor.email, body.action, email)
        return {"user": user.public() if user else None}

    # ── API key của người dùng (chỉ quản lý được khi đăng nhập bằng phiên) ───────

    def _session_user(request: Request) -> Optional[User]:
        return getattr(request.state, "user", None)

    @app.get("/account/api-keys")
    async def list_api_keys(request: Request):
        user = _session_user(request)
        if not user:
            return _err(403, "Cần đăng nhập để quản lý API key.", "forbidden")
        return {"keys": await _store(request).list_api_keys(user.email)}

    @app.post("/account/api-keys")
    async def create_api_key(request: Request, body: ApiKeyCreate):
        user = _session_user(request)
        if not user:
            return _err(403, "Cần đăng nhập để quản lý API key.", "forbidden")
        try:
            raw, record = await _store(request).create_api_key(user, body.name)
        except AuthError as exc:
            return _auth_err(exc)
        log.info("API key %s created by %s", record["id"], user.email)
        return {"key": raw, "record": record}

    @app.delete("/account/api-keys/{key_id}")
    async def revoke_api_key(request: Request, key_id: str):
        user = _session_user(request)
        if not user:
            return _err(403, "Cần đăng nhập để quản lý API key.", "forbidden")
        if not await _store(request).revoke_api_key(user.email, key_id):
            return _err(404, "Không tìm thấy API key.", "not_found")
        log.info("API key %s revoked by %s", key_id, user.email)
        return Response(status_code=204)

    # ── System ────────────────────────────────────────────────────────────────
    @app.get("/v1/announcement")
    async def get_announcement():
        """Thông báo từ trang trung tâm đang cache (không gọi ra ngoài theo request)."""
        a = phone_home.current_announcement()
        return JSONResponse({"announcement": a.to_json() if a else None},
                            headers={"Cache-Control": "no-store"})

    @app.get("/health")
    async def health():
        return {"status": "ok", "model": engine.model_id, "device": engine.device,
                "sampling_rate": engine.sampling_rate, "queue_depth": engine.queue_depth,
                "max_concurrency": engine.max_concurrency, "vram": engine.vram(),
                "offloaded": engine.offloaded}

    @app.get("/v1/vram")
    async def vram_status():
        return engine.gpu_status()

    @app.post("/v1/vram")
    async def vram_set(req: VramConfig):
        engine.set_idle_minutes(req.idle_minutes)
        return engine.gpu_status()

    @app.get("/v1/info")
    async def info():
        defaults = OmniVoiceGenerationConfig()
        return {"model": engine.model_id, "sampling_rate": engine.sampling_rate,
                "response_formats": ["wav", "mp3", "pcm"],
                "normalizer": engine.normalizer.spec,
                "defaults": {k: getattr(defaults, k) for k in
                             ("num_step", "guidance_scale", "t_shift", "denoise",
                              "postprocess_output")}}

    @app.get("/v1/models")
    async def models():
        return {"object": "list", "data": [{"id": engine.model_id, "object": "model"}]}

    # ── TTS ───────────────────────────────────────────────────────────────────
    @app.post("/tts")
    async def tts(req: TTSRequest, json: bool = Query(False)):
        ref_bytes = base64.b64decode(req.ref_audio) if req.ref_audio else None
        audio = await engine.synthesize(
            text=req.text, language=req.language, voice_id=req.voice_id,
            ref_audio_bytes=ref_bytes, ref_text=req.ref_text, instruct=req.instruct,
            seed=req.seed, speed=req.speed, duration=req.duration, normalize=req.normalize,
            gen_kwargs=req.gen_config_kwargs(),
        )
        data, ctype = engine.encode(audio, req.response_format)
        return _audio_response(data, ctype, json, req.response_format)

    @app.post("/tts/upload")
    async def tts_upload(
        text: str = Form(...),
        file: Optional[UploadFile] = File(None),
        language: Optional[str] = Form(None),
        voice_id: Optional[str] = Form(None),
        ref_text: Optional[str] = Form(None),
        instruct: Optional[str] = Form(None),
        seed: Optional[int] = Form(None),
        speed: Optional[float] = Form(None),
        duration: Optional[float] = Form(None),
        normalize: bool = Form(False),
        num_step: Optional[int] = Form(None),
        guidance_scale: Optional[float] = Form(None),
        postprocess_output: Optional[bool] = Form(None),
        response_format: str = Form("wav"),
        json: bool = Query(False),
    ):
        ref_bytes = await file.read() if file is not None else None
        ext = os.path.splitext(file.filename)[1] if file and file.filename else ".wav"
        gen = {k: v for k, v in (("num_step", num_step), ("guidance_scale", guidance_scale),
                                 ("postprocess_output", postprocess_output)) if v is not None}
        audio = await engine.synthesize(
            text=text, language=language, voice_id=voice_id, ref_audio_bytes=ref_bytes,
            ref_audio_ext=ext, ref_text=ref_text, instruct=instruct, seed=seed, speed=speed,
            duration=duration, normalize=normalize, gen_kwargs=gen,
        )
        data, ctype = engine.encode(audio, response_format)
        return _audio_response(data, ctype, json, response_format)

    # ── Voice library ─────────────────────────────────────────────────────────
    @app.post("/v1/voices", response_model=VoicePublic)
    async def add_voice(
        name: str = Form(...),
        file: UploadFile = File(...),
        ref_text: Optional[str] = Form(None),
        overwrite: bool = Form(False),
    ):
        audio_bytes = await file.read()
        ext = os.path.splitext(file.filename)[1] if file.filename else ".wav"
        rec = await engine.register_voice(name, audio_bytes, ext=ext,
                                          ref_text=ref_text, overwrite=overwrite)
        return rec.public()

    @app.get("/v1/voices", response_model=VoiceList)
    async def list_voices():
        return {"voices": [r.public() for r in engine.voices.list_records()]}

    @app.get("/v1/voices/{voice_id}", response_model=VoicePublic)
    async def get_voice(voice_id: str):
        return engine.voices.get_record(voice_id).public()

    @app.delete("/v1/voices/{voice_id}")
    async def delete_voice(voice_id: str):
        engine.voices.delete(voice_id)
        return {"deleted": voice_id}

    # ── Presets / STT ─────────────────────────────────────────────────────────
    @app.get("/v1/presets")
    async def presets():
        return {"presets": PRESETS}

    @app.post("/v1/stt", response_model=SttResponse)
    async def stt(
        file: UploadFile = File(...),
        model: str = Form("turbo"),
        language: Optional[str] = Form(None),
    ):
        audio_bytes = await file.read()
        ext = os.path.splitext(file.filename)[1] if file.filename else ".wav"
        return await engine.transcribe(audio_bytes, model=model, language=language, ext=ext)

    # ── OpenAI-compatible ─────────────────────────────────────────────────────
    @app.post("/v1/audio/speech")
    async def speech(req: SpeechRequest):
        voice_id = None
        instruct = req.instruct
        if req.voice and req.voice not in (None, "", "auto"):
            if engine.voices.exists(req.voice):
                voice_id = req.voice
            elif not instruct:
                instruct = req.voice
        audio = await engine.synthesize(
            text=req.input, language=req.language, voice_id=voice_id,
            instruct=instruct, speed=req.speed, normalize=req.normalize,
        )
        data, ctype = engine.encode(audio, req.response_format)
        return Response(content=data, media_type=ctype)

    # ── Payments ──────────────────────────────────────────────────────────────
    @app.get("/payment/config")
    async def payment_config():
        return {
            "configured": bank.configured or sepay.configured,
            "method": "qr" if bank.configured else ("gateway" if sepay.configured else None),
            "qr_enabled": bank.configured,
            "gateway_enabled": sepay.configured,
            "env": sepay.env, "public_url": sepay.public_url, "currency": "VND",
        }

    @app.get("/payment/plans")
    async def payment_plans():
        return {"plans": list(PLANS.values())}

    @app.get("/payment/subscription")
    async def payment_subscription(request: Request):
        return await billing.get_subscription(_customer_id(request))

    @app.post("/payment/checkout", response_model=CheckoutResponse)
    async def payment_checkout(req: CheckoutRequest, request: Request):
        if not sepay.configured:
            return _err(503, "Payment gateway is not configured.", "sepay_unconfigured")
        plan = PLANS.get(req.plan_id)
        if not plan:
            return _err(400, f"Unknown plan: {req.plan_id}", "unknown_plan")
        customer = _customer_id(request)
        invoice = new_invoice_number(plan["id"])
        await billing.create_order(OrderRecord(
            invoice_number=invoice, plan_id=plan["id"], amount=plan["amount"],
            currency=plan["currency"], payment_method=req.payment_method,
            customer_id=customer, description=plan.get("desc_vi"),
        ))
        fields = sepay.build_checkout_fields(
            invoice_number=invoice, amount=plan["amount"], currency=plan["currency"],
            payment_method=req.payment_method, order_description=plan.get("desc_vi"),
            customer_id=customer,
            custom_data=json.dumps({"plan_id": plan["id"], "customer_id": customer}),
        )
        return {"checkout_url": sepay.checkout_url, "fields": fields, "invoice_number": invoice}

    @app.get("/payment/order/{invoice_number}")
    async def payment_order(invoice_number: str, request: Request):
        rec = await billing.get_order(invoice_number)
        if rec is None:
            return _err(404, f"Order not found: {invoice_number}", "order_not_found")
        if rec.status == "pending" and rec.provider == "gateway" and sepay.configured:
            data = sepay.query_order(invoice_number)
            status = (data or {}).get("order_status") if isinstance(data, dict) else None
            if status in ("CAPTURED", "COMPLETED", "PAID"):
                rec = await billing.mark_paid(
                    invoice_number, PLANS.get(rec.plan_id, {}).get("days", 0),
                    sepay_order_id=(data or {}).get("id"),
                ) or rec
        return rec.public()

    @app.post("/payment/ipn")
    async def payment_ipn(request: Request):
        if not sepay.verify_ipn(request.headers.get("x-secret-key")):
            log.warning("SePay IPN rejected: bad/missing X-Secret-Key.")
            return _err(401, "Invalid secret key.", "invalid_secret")
        try:
            data = await request.json()
        except Exception:  # noqa: BLE001
            return _err(400, "Invalid JSON body.", "invalid_body")

        ntype = data.get("notification_type")
        order = data.get("order") or {}
        txn = data.get("transaction") or {}
        invoice = order.get("order_invoice_number")
        log.info("SePay IPN: type=%s invoice=%s status=%s", ntype, invoice, order.get("order_status"))

        if ntype == "ORDER_PAID" and invoice:
            rec = await billing.get_order(invoice)
            if rec is None:
                log.warning("SePay IPN ORDER_PAID for unknown invoice %s", invoice)
                return {"success": True}
            try:
                paid = int(float(order.get("order_amount") or 0))
            except (TypeError, ValueError):
                paid = 0
            if paid and paid < rec.amount:
                log.warning("SePay IPN amount mismatch for %s: paid=%s expected=%s",
                            invoice, paid, rec.amount)
                return {"success": True}
            days = PLANS.get(rec.plan_id, {}).get("days", 0)
            await billing.mark_paid(invoice, days,
                                    sepay_order_id=order.get("id"),
                                    sepay_transaction_id=txn.get("id"))
        elif ntype == "TRANSACTION_VOID" and invoice:
            await billing.set_status(invoice, "cancelled")

        return {"success": True}

    @app.post("/payment/qr", response_model=QrResponse)
    async def payment_qr(req: QrRequest, request: Request):
        if not bank.configured:
            return _err(503, "VietQR is not configured.", "qr_unconfigured")
        plan = PLANS.get(req.plan_id)
        if not plan:
            return _err(400, f"Unknown plan: {req.plan_id}", "unknown_plan")
        customer = _customer_id(request)
        for _ in range(5):
            code = new_payment_code(bank.code_prefix)
            if await billing.get_order(code) is None:
                break
        await billing.create_order(OrderRecord(
            invoice_number=code, plan_id=plan["id"], amount=plan["amount"],
            currency=plan["currency"], payment_method="BANK_TRANSFER",
            customer_id=customer, provider="bank", description=plan.get("desc_vi"),
        ))
        qr_url = bank.vietqr_url(plan["amount"], des=code)
        return {
            "invoice_number": code, "amount": plan["amount"], "currency": plan["currency"],
            "qr_url": qr_url, "bank_account": bank.bank_account, "bank_code": bank.bank_code,
            "bank_name": bank.bank_name, "content": code, "plan_id": plan["id"],
        }

    @app.post("/payment/webhook")
    async def payment_webhook(request: Request):
        raw = await request.body()
        if not bank.verify_webhook(
            authorization=request.headers.get("authorization"),
            signature=request.headers.get("x-sepay-signature"),
            timestamp=request.headers.get("x-sepay-timestamp"),
            raw_body=raw,
        ):
            log.warning("SePay webhook rejected: failed auth.")
            return _err(401, "Unauthorized.", "unauthorized")
        try:
            data = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return _err(400, "Invalid JSON body.", "invalid_body")

        code = (data.get("code") or "").strip()
        transfer_type = data.get("transferType")
        try:
            amount_in = int(float(data.get("transferAmount") or 0))
        except (TypeError, ValueError):
            amount_in = 0
        tx_id = str(data.get("id") or "")
        log.info("SePay webhook: id=%s type=%s code=%s amount=%s",
                 tx_id, transfer_type, code, amount_in)

        if transfer_type == "in" and code:
            rec = await billing.get_order(code)
            if rec is None:
                log.info("SePay webhook: no order for code %s (ignored).", code)
                return {"success": True}
            if amount_in < rec.amount:
                log.warning("SePay webhook underpaid for %s: got=%s need=%s",
                            code, amount_in, rec.amount)
                return {"success": True}
            days = PLANS.get(rec.plan_id, {}).get("days", 0)
            await billing.mark_paid(code, days, sepay_transaction_id=tx_id)
        return {"success": True}

    # ── Static UI (mounted last) ───────────────────────────────────────────────
    if web_dir and os.path.isdir(web_dir):
        app.mount("/", StaticFiles(directory=web_dir, html=True), name="ui")

    return app

