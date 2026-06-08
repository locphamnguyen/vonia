"""FastAPI application for the OmniVoice API server.

Exposes a rich custom REST surface (/tts, /tts/upload, /v1/voices...) plus an
OpenAI-compatible /v1/audio/speech endpoint. Build with ``create_app(engine)``.
"""
from __future__ import annotations

import base64
import json
import logging
import os
from typing import Optional

from fastapi import FastAPI, File, Form, Query, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from omnivoice.models.omnivoice import OmniVoiceGenerationConfig

from .auth import COOKIE, PUBLIC_PATHS, Auth
from .billing import BillingStore, OrderRecord, new_invoice_number, new_payment_code
from .engine import Engine, QueueFullError
from .normalize import NormalizerError
from .presets import PRESETS
from .schemas import (
    CheckoutRequest, CheckoutResponse, ErrorResponse, QrRequest, QrResponse,
    SpeechRequest, SttResponse, TTSRequest, VoiceList, VoicePublic,
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


def _login_page(error: bool = False) -> str:
    err = ('<div class="err">Sai email hoặc mật khẩu</div>' if error else "")
    return f"""<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Đăng nhập · Vonia</title><style>
*{{box-sizing:border-box}}body{{margin:0;min-height:100vh;display:flex;align-items:center;
justify-content:center;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
background:radial-gradient(1200px 600px at 50% -10%,#0e2a33,#0a0f14 60%);color:#e6eef2}}
.card{{width:340px;padding:32px 28px;background:#10171d;border:1px solid #1d2a33;
border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.45)}}
.brand{{display:flex;align-items:center;gap:10px;margin-bottom:22px}}
.dot{{width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,#22d3ee,#0891b2)}}
.brand b{{font-size:18px;letter-spacing:-.01em}}
label{{display:block;font-size:12.5px;color:#8aa0ad;margin:14px 0 6px}}
input{{width:100%;padding:11px 12px;background:#0b1116;border:1px solid #25333d;border-radius:9px;
color:#e6eef2;font-size:14px;outline:none}}input:focus{{border-color:#22d3ee}}
button{{width:100%;margin-top:20px;padding:11px;border:0;border-radius:9px;font-weight:700;
font-size:14px;color:#022;cursor:pointer;background:linear-gradient(135deg,#22d3ee,#0891b2)}}
.err{{margin-top:14px;padding:9px 12px;border-radius:9px;background:#3a1416;border:1px solid #5b1d22;
color:#ffb4b4;font-size:13px}}.foot{{margin-top:16px;font-size:11.5px;color:#5c7180;text-align:center}}
</style></head><body><form class="card" method="post" action="/login">
<div class="brand"><span class="dot"></span><b>Vonia Voice Studio</b></div>
<label>Email</label><input name="username" type="email" autocomplete="username" autofocus required>
<label>Mật khẩu</label><input name="password" type="password" autocomplete="current-password" required>
<button type="submit">Đăng nhập</button>{err}
<div class="foot">MVP · truy cập riêng tư</div></form></body></html>"""


def create_app(engine: Engine, web_dir: Optional[str] = None) -> FastAPI:
    app = FastAPI(title="OmniVoice API", version="1.0",
                  description="Zero-shot multilingual TTS — voice cloning, voice design, auto voice.")

    # CORS: defaults to "*" for local dev. In production (behind a domain) set
    # VONIA_CORS_ORIGINS to the exact origin(s), comma-separated, e.g.
    # "https://vonia.locnguyendata.com". The UI is served same-origin so it never
    # needs CORS; webhooks are server-to-server and aren't subject to it either.
    _origins_env = os.environ.get("VONIA_CORS_ORIGINS", "*").strip()
    allow_origins = ["*"] if _origins_env == "*" else [o.strip() for o in _origins_env.split(",") if o.strip()]
    app.add_middleware(CORSMiddleware, allow_origins=allow_origins,
                       allow_methods=["*"], allow_headers=["*"])

    # Reject oversized request bodies before they are read into memory (DoS guard).
    # Defense-in-depth: the reverse proxy / Cloudflare should also cap this.
    max_upload = int(os.environ.get("VONIA_MAX_UPLOAD_MB", "25")) * 1024 * 1024

    @app.middleware("http")
    async def _limit_body(request: Request, call_next):
        if request.method in ("POST", "PUT", "PATCH"):
            cl = request.headers.get("content-length")
            if cl and cl.isdigit() and int(cl) > max_upload:
                return _err(413, f"Payload too large (limit {max_upload // 2**20} MB).",
                            "payload_too_large")
        return await call_next(request)

    # ----------------------------------------------------------------- auth
    auth = Auth()

    # --------------------------------------------------------------- billing
    # SePay payment gateway + on-disk order/subscription store. The app has one
    # shared login today, so every authed request maps to a single customer id
    # (the login email, or "default" when auth is disabled in local dev). When a
    # real multi-user account system lands, _customer_id() becomes per-user.
    billing = BillingStore(os.environ.get("VONIA_BILLING_DIR", "~/.cache/omnivoice/billing"))
    sepay = client_from_env()
    bank = bank_config_from_env()  # VietQR / webhook (in-app QR flow)
    if sepay.configured:
        log.info("SePay payment gateway enabled (env=%s, merchant=%s).",
                 sepay.env, sepay.merchant_id)
    else:
        log.warning("SePay gateway NOT configured (merchant_id/secret_key).")
    if bank.configured:
        log.info("SePay VietQR/webhook enabled (bank=%s, acc=%s, auth=%s).",
                 bank.bank_code, bank.bank_account,
                 "apikey" if bank.webhook_api_key else "hmac" if bank.webhook_secret else "none")
    else:
        log.warning("SePay VietQR NOT configured (set SEPAY_BANK_ACCOUNT/SEPAY_BANK_CODE).")

    def _customer_id(request: Request) -> str:
        return auth.user or "default"

    def _wants_html(request: Request) -> bool:
        return "text/html" in request.headers.get("accept", "")

    @app.middleware("http")
    async def _gate(request: Request, call_next):
        if not auth.enabled or request.method == "OPTIONS" or request.url.path in PUBLIC_PATHS:
            return await call_next(request)
        if auth.valid_cookie(request.cookies.get(COOKIE)) or auth.check_basic(
                request.headers.get("authorization")):
            return await call_next(request)
        if _wants_html(request):  # browser navigation -> show login page
            return RedirectResponse("/login", status_code=303)
        return _err(401, "Authentication required.", "unauthorized")

    @app.get("/login", response_class=HTMLResponse)
    async def login_page(request: Request, error: int = Query(0)):
        if auth.enabled and auth.valid_cookie(request.cookies.get(COOKIE)):
            return RedirectResponse("/", status_code=303)
        return HTMLResponse(_login_page(error=bool(error)))

    @app.post("/login")
    async def login_submit(request: Request, username: str = Form(...), password: str = Form(...)):
        if not auth.check_credentials(username, password):
            return RedirectResponse("/login?error=1", status_code=303)
        resp = RedirectResponse("/", status_code=303)
        secure = (request.headers.get("x-forwarded-proto", "").startswith("https")
                  or request.url.scheme == "https")
        resp.set_cookie(COOKIE, auth.token, httponly=True, samesite="lax",
                        secure=secure, max_age=7 * 24 * 3600, path="/")
        return resp

    @app.get("/logout")
    async def logout():
        resp = RedirectResponse("/login", status_code=303)
        resp.delete_cookie(COOKIE, path="/")
        return resp

    # --------------------------------------------------------- error handlers
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

    # ----------------------------------------------------------------- system
    @app.get("/health")
    async def health():
        return {"status": "ok", "model": engine.model_id, "device": engine.device,
                "sampling_rate": engine.sampling_rate, "queue_depth": engine.queue_depth,
                "max_concurrency": engine.max_concurrency, "vram": engine.vram()}

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

    # -------------------------------------------------------------------- TTS
    @app.post("/tts")
    async def tts(req: TTSRequest, json: bool = Query(False, description="Return base64 JSON instead of binary.")):
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
        file: Optional[UploadFile] = File(None, description="Reference audio for cloning."),
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

    # --------------------------------------------------------- voice library
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

    # ------------------------------------------------------------- presets/STT
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

    # ----------------------------------------------------- OpenAI-compatible
    @app.post("/v1/audio/speech")
    async def speech(req: SpeechRequest):
        # Map OpenAI `voice` -> registered voice_id; unknown -> treat as instruct.
        voice_id = None
        instruct = req.instruct
        if req.voice and req.voice not in (None, "", "auto"):
            if engine.voices.exists(req.voice):
                voice_id = req.voice
            elif not instruct:
                instruct = req.voice  # e.g. "female, british accent"
        audio = await engine.synthesize(
            text=req.input, language=req.language, voice_id=voice_id,
            instruct=instruct, speed=req.speed, normalize=req.normalize,
        )
        data, ctype = engine.encode(audio, req.response_format)
        return Response(content=data, media_type=ctype)

    # --------------------------------------------------------------- payments
    @app.get("/payment/config")
    async def payment_config():
        """What billing methods are usable, for the UI. ``method`` is the
        preferred flow: 'qr' (in-app VietQR) when a bank is configured, else
        'gateway' (hosted redirect)."""
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
        return billing.get_subscription(_customer_id(request))

    @app.post("/payment/checkout", response_model=CheckoutResponse)
    async def payment_checkout(req: CheckoutRequest, request: Request):
        if not sepay.configured:
            return _err(503, "Payment gateway is not configured.", "sepay_unconfigured")
        plan = PLANS.get(req.plan_id)
        if not plan:
            return _err(400, f"Unknown plan: {req.plan_id}", "unknown_plan")
        customer = _customer_id(request)
        invoice = new_invoice_number(plan["id"])
        billing.create_order(OrderRecord(
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
        rec = billing.get_order(invoice_number)
        if rec is None:
            return _err(404, f"Order not found: {invoice_number}", "order_not_found")
        # Best-effort reconciliation for *gateway* orders: if the IPN hasn't
        # flipped this order yet, ask SePay directly. Bank/VietQR orders are
        # confirmed by the webhook instead, so they just poll our store.
        if rec.status == "pending" and rec.provider == "gateway" and sepay.configured:
            data = sepay.query_order(invoice_number)
            status = (data or {}).get("order_status") if isinstance(data, dict) else None
            if status in ("CAPTURED", "COMPLETED", "PAID"):
                rec = billing.mark_paid(invoice_number, PLANS.get(rec.plan_id, {}).get("days", 0),
                                        sepay_order_id=(data or {}).get("id")) or rec
        return rec.public()

    @app.post("/payment/ipn")
    async def payment_ipn(request: Request):
        """SePay Instant Payment Notification (public; verified by X-Secret-Key).
        Must return HTTP 200 to acknowledge receipt."""
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
            rec = billing.get_order(invoice)
            if rec is None:
                log.warning("SePay IPN ORDER_PAID for unknown invoice %s", invoice)
                return {"success": True}  # ack so SePay stops retrying
            # Anti-tamper: confirm the paid amount matches what we created.
            try:
                paid = int(float(order.get("order_amount") or 0))
            except (TypeError, ValueError):
                paid = 0
            if paid and paid < rec.amount:
                log.warning("SePay IPN amount mismatch for %s: paid=%s expected=%s",
                            invoice, paid, rec.amount)
                return {"success": True}
            days = PLANS.get(rec.plan_id, {}).get("days", 0)
            billing.mark_paid(invoice, days, sepay_order_id=order.get("id"),
                              sepay_transaction_id=txn.get("id"))
        elif ntype == "TRANSACTION_VOID" and invoice:
            billing.set_status(invoice, "cancelled")

        return {"success": True}

    # ---------------------------------------------- VietQR / bank-transfer flow
    @app.post("/payment/qr", response_model=QrResponse)
    async def payment_qr(req: QrRequest, request: Request):
        """Create a pending order and return the in-app VietQR + bank details.
        The frontend renders the QR and polls /payment/order/{code} until the
        webhook flips it to paid."""
        if not bank.configured:
            return _err(503, "VietQR is not configured.", "qr_unconfigured")
        plan = PLANS.get(req.plan_id)
        if not plan:
            return _err(400, f"Unknown plan: {req.plan_id}", "unknown_plan")
        customer = _customer_id(request)
        # Unique payment code (retry on the rare collision).
        for _ in range(5):
            code = new_payment_code(bank.code_prefix)
            if billing.get_order(code) is None:
                break
        billing.create_order(OrderRecord(
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
        """SePay bank-transaction webhook (public; verified by API Key or HMAC).
        Matches the transfer's payment `code` to a pending order, confirms the
        amount, then marks paid + extends the subscription. Returns 200 to ack."""
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
            rec = billing.get_order(code)
            if rec is None:
                log.info("SePay webhook: no order for code %s (ignored).", code)
                return {"success": True}  # ack; not ours
            if amount_in < rec.amount:
                log.warning("SePay webhook underpaid for %s: got=%s need=%s",
                            code, amount_in, rec.amount)
                return {"success": True}
            days = PLANS.get(rec.plan_id, {}).get("days", 0)
            billing.mark_paid(code, days, sepay_transaction_id=tx_id)
        return {"success": True}

    # ------------------------------------------------- static UI (mounted last)
    # Mounted at "/" AFTER all API routes so explicit routes win; html=True
    # serves index.html for "/" and unknown paths (SPA-friendly).
    if web_dir and os.path.isdir(web_dir):
        app.mount("/", StaticFiles(directory=web_dir, html=True), name="ui")

    return app
