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
from fastapi.responses import JSONResponse

from omnivoice.models.omnivoice import OmniVoiceGenerationConfig

from .engine import Engine, QueueFullError
from .normalize import NormalizerError
from .schemas import (
    ErrorResponse, SpeechRequest, TTSRequest, VoiceList, VoicePublic,
)
from .voices import VoiceExistsError, VoiceNotFoundError


def _err(status: int, message: str, type_: str = "error") -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"message": message, "type": type_}})


def _audio_response(data: bytes, content_type: str, as_json: bool, fmt: str) -> Response:
    if as_json:
        return JSONResponse({"audio_base64": base64.b64encode(data).decode("ascii"),
                             "format": fmt, "content_type": content_type})
    return Response(content=data, media_type=content_type)


def create_app(engine: Engine) -> FastAPI:
    app = FastAPI(title="OmniVoice API", version="1.0",
                  description="Zero-shot multilingual TTS — voice cloning, voice design, auto voice.")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

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
        response_format: str = Form("wav"),
        json: bool = Query(False),
    ):
        ref_bytes = await file.read() if file is not None else None
        ext = os.path.splitext(file.filename)[1] if file and file.filename else ".wav"
        gen = {k: v for k, v in (("num_step", num_step), ("guidance_scale", guidance_scale)) if v is not None}
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

    return app
