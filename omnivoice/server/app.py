"""FastAPI application for the OmniVoice API server.

Exposes a rich custom REST surface (/tts, /tts/upload, /v1/voices...) plus an
OpenAI-compatible /v1/audio/speech endpoint. Build with ``create_app(engine)``.
"""
from __future__ import annotations

import base64
import os
from typing import Optional

from fastapi import FastAPI, File, Form, Query, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from omnivoice.models.omnivoice import OmniVoiceGenerationConfig

from .auth import COOKIE, PUBLIC_PATHS, Auth
from .engine import Engine, QueueFullError
from .normalize import NormalizerError
from .presets import PRESETS
from .schemas import (
    ErrorResponse, SpeechRequest, SttResponse, TTSRequest, VoiceList, VoicePublic,
)
from .voices import VoiceExistsError, VoiceNotFoundError


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

    # ------------------------------------------------- static UI (mounted last)
    # Mounted at "/" AFTER all API routes so explicit routes win; html=True
    # serves index.html for "/" and unknown paths (SPA-friendly).
    if web_dir and os.path.isdir(web_dir):
        app.mount("/", StaticFiles(directory=web_dir, html=True), name="ui")

    return app
