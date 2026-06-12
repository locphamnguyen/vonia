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
from contextlib import asynccontextmanager
from typing import Optional

import httpx
import redis.asyncio as aioredis
from fastapi import FastAPI, File, Form, Query, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from omnivoice.models.omnivoice import OmniVoiceGenerationConfig

from .auth import COOKIE, PUBLIC_PATHS, STATE_COOKIE, OIDCAuth
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


def _login_error_page() -> str:
    """Branded error page shown when OIDC login fails or email is not allowed."""
    return """<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lỗi đăng nhập · Vonia</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;
justify-content:center;font-family:system-ui,-apple-system,sans-serif;
background:radial-gradient(1200px 600px at 50% -10%,#0e2a33,#0a0f14 60%);color:#e6eef2}
.card{width:380px;padding:40px 32px;background:#10171d;border:1px solid #1d2a33;
border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.45);text-align:center}
.brand{display:flex;align-items:center;justify-content:center;gap:11px;margin-bottom:26px}
.mark{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;
background:linear-gradient(135deg,#22d3ee,#0891b2);
box-shadow:0 6px 18px -6px rgba(34,211,238,.6),inset 0 1px 0 rgba(255,255,255,.4)}
.mark svg{display:block}
.bname{font-weight:800;font-size:21px;letter-spacing:-.02em;line-height:1;text-align:left}
.bname .d{color:#22d3ee}
.bsub{font-size:9px;color:#5f7682;letter-spacing:.12em;text-transform:uppercase;
margin-top:4px;font-weight:600;text-align:left}
h1{font-size:18px;margin:0 0 10px}p{font-size:14px;color:#8aa0ad;margin:0 0 24px;line-height:1.5}
.btns{display:flex;flex-direction:column;gap:10px}
a{display:block;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none}
.primary{color:#022;background:linear-gradient(135deg,#22d3ee,#0891b2)}
.secondary{color:#cfe0e8;background:transparent;border:1px solid #283742}
.secondary:hover{background:#16212a}
</style></head><body><div class="card">
<div class="brand">
<span class="mark"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"
stroke="#022b32" stroke-width="2.4" stroke-linecap="round">
<path d="M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3"/></svg></span>
<span><div class="bname">Vonia<span class="d">.</span></div><div class="bsub">Voice Studio</div></span>
</div>
<h1>Không thể đăng nhập</h1>
<p>Tài khoản của bạn không được phép truy cập Vonia Voice Studio.</p>
<div class="btns">
<a class="primary" href="/auth/login">Thử lại</a>
<a class="secondary" href="/logout">Đăng xuất &amp; đổi tài khoản</a>
</div></div></body></html>"""


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

        yield

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
    auth = OIDCAuth()

    def _wants_html(request: Request) -> bool:
        return "text/html" in request.headers.get("accept", "")

    @app.middleware("http")
    async def _gate(request: Request, call_next):
        if not auth.enabled or request.method == "OPTIONS":
            return await call_next(request)
        if request.url.path in PUBLIC_PATHS or request.url.path.startswith("/auth/"):
            return await call_next(request)

        session_id = request.cookies.get(COOKIE)
        session = await auth.get_session(request.app.state.redis, session_id)
        if session:
            request.state.session = session
            return await call_next(request)

        if _wants_html(request):
            return RedirectResponse("/auth/login", status_code=303)
        return _err(401, "Authentication required.", "unauthorized")

    # ── Billing ───────────────────────────────────────────────────────────────
    billing = BillingStore(
        redis_url=os.environ.get("REDIS_URL", "redis://localhost:30379")
    )
    sepay = client_from_env()
    bank = bank_config_from_env()
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

    @app.get("/auth/login")
    async def auth_login(request: Request):
        """Khởi tạo PKCE flow, redirect sang Zitadel."""
        if not auth.enabled:
            return _err(503, "OIDC auth not configured.", "auth_unconfigured")
        # Nếu đã có session hợp lệ → về thẳng app
        session_id = request.cookies.get(COOKIE)
        if await auth.get_session(request.app.state.redis, session_id):
            return RedirectResponse("/", status_code=303)

        url, state_cookie_val = auth.build_auth_redirect()
        resp = RedirectResponse(url, status_code=303)
        secure = (request.headers.get("x-forwarded-proto", "").startswith("https")
                  or request.url.scheme == "https")
        resp.set_cookie(
            STATE_COOKIE, state_cookie_val,
            httponly=True, samesite="lax", secure=secure,
            max_age=300, path="/auth/callback",
        )
        return resp

    @app.get("/auth/callback")
    async def auth_callback(
        request: Request,
        code: Optional[str] = Query(None),
        state: Optional[str] = Query(None),
        error: Optional[str] = Query(None),
    ):
        """Nhận callback từ Zitadel, tạo session, redirect về app."""
        # Lỗi từ Zitadel (user cancel hoặc deny)
        if error:
            log.info("OIDC callback error: %s", error)
            resp = RedirectResponse("/auth/login?error=1", status_code=303)
            resp.delete_cookie(STATE_COOKIE, path="/auth/callback")
            return resp

        if not code or not state:
            return RedirectResponse("/auth/login?error=1", status_code=303)

        # Xác thực state cookie
        state_cookie_val = request.cookies.get(STATE_COOKIE)
        code_verifier = auth.verify_state_cookie(state_cookie_val, state)
        if not code_verifier:
            log.warning("OIDC callback: state mismatch or missing state cookie.")
            return RedirectResponse("/auth/login?error=1", status_code=303)

        # Đổi code lấy token
        try:
            tokens = await auth.exchange_code(request.app.state.http, code, code_verifier)
        except httpx.HTTPError as exc:
            log.error("OIDC token exchange failed: %s", exc)
            return RedirectResponse("/auth/login?error=1", status_code=303)

        # Lấy thông tin user
        try:
            user_info = await auth.get_user_info(
                request.app.state.http, tokens["access_token"]
            )
        except httpx.HTTPError as exc:
            log.error("OIDC userinfo failed: %s", exc)
            return RedirectResponse("/auth/login?error=1", status_code=303)

        email = (user_info.get("email") or "").strip().lower()
        sub = user_info.get("sub") or ""

        # Kiểm tra allowlist
        if not auth.is_allowed(email):
            log.warning("OIDC login rejected for email: %s", email)
            resp = RedirectResponse("/auth/login?forbidden=1", status_code=303)
            resp.delete_cookie(STATE_COOKIE, path="/auth/callback")
            return HTMLResponse(_login_error_page(), status_code=403)

        # Tạo session trong Redis (lưu id_token để logout RP-initiated)
        session_id = await auth.create_session(
            request.app.state.redis, email, sub, tokens.get("id_token", "")
        )

        secure = (request.headers.get("x-forwarded-proto", "").startswith("https")
                  or request.url.scheme == "https")
        resp = RedirectResponse("/", status_code=303)
        resp.set_cookie(
            COOKIE, session_id,
            httponly=True, samesite="lax", secure=secure,
            max_age=SESSION_TTL, path="/",
        )
        resp.delete_cookie(STATE_COOKIE, path="/auth/callback")
        log.info("OIDC login success: %s", email)
        return resp

    @app.get("/auth/me")
    async def auth_me(request: Request):
        """Trả về thông tin user hiện tại từ session.

        Route này nằm trong nhánh `/auth/*` mà `_gate` bỏ qua, nên không có
        `request.state.session` — phải tự đọc session từ Redis qua cookie.
        """
        session_id = request.cookies.get(COOKIE)
        session = await auth.get_session(request.app.state.redis, session_id)
        if not session:
            return _err(401, "Not authenticated.", "unauthorized")
        return {"email": session.get("email"), "sub": session.get("sub")}

    @app.get("/logout")
    async def logout(request: Request):
        """Xóa session Redis, xóa cookie, redirect sang Zitadel end_session."""
        session_id = request.cookies.get(COOKIE)
        session = await auth.get_session(request.app.state.redis, session_id)
        id_token = (session or {}).get("id_token") or None
        await auth.revoke_session(request.app.state.redis, session_id)

        public_url = (os.environ.get("VONIA_PUBLIC_URL") or "").rstrip("/")
        end_session = (
            auth.build_end_session_url(public_url, id_token)
            if auth.enabled else "/"
        )

        resp = RedirectResponse(end_session, status_code=303)
        resp.delete_cookie(COOKIE, path="/")
        return resp

    # ── System ────────────────────────────────────────────────────────────────
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
            speed=req.speed, duration=req.duration, normalize=req.normalize,
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
            ref_audio_ext=ext, ref_text=ref_text, instruct=instruct, speed=speed,
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


# ── Session TTL (export cho các module khác nếu cần) ─────────────────────────
SESSION_TTL = 7 * 24 * 3600
