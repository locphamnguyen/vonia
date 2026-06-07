"""Pydantic request/response models for the OmniVoice API server."""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

ResponseFormat = Literal["wav", "mp3", "pcm"]

# Generation-config fields exposed to clients. Names match
# OmniVoiceGenerationConfig so they can be forwarded verbatim. All optional —
# omitted fields fall back to the model defaults.
GEN_FIELDS = (
    "num_step", "guidance_scale", "t_shift", "denoise", "postprocess_output",
    "layer_penalty_factor", "position_temperature", "class_temperature",
    "audio_chunk_duration", "audio_chunk_threshold",
)


class GenParams(BaseModel):
    num_step: Optional[int] = None
    guidance_scale: Optional[float] = None
    t_shift: Optional[float] = None
    denoise: Optional[bool] = None
    postprocess_output: Optional[bool] = None
    layer_penalty_factor: Optional[float] = None
    position_temperature: Optional[float] = None
    class_temperature: Optional[float] = None
    audio_chunk_duration: Optional[float] = None
    audio_chunk_threshold: Optional[float] = None

    def gen_config_kwargs(self) -> dict:
        return {k: v for k, v in self.model_dump().items()
                if k in GEN_FIELDS and v is not None}


class TTSRequest(GenParams):
    """Custom REST request. Mode is inferred: voice_id/ref_audio -> clone,
    instruct -> design, otherwise -> auto."""
    text: str = Field(..., description="Text to synthesize.")
    language: Optional[str] = Field(None, description="Language name ('English') or code ('en').")
    voice_id: Optional[str] = Field(None, description="Registered voice from the library.")
    ref_audio: Optional[str] = Field(None, description="Base64-encoded reference audio (voice cloning).")
    ref_text: Optional[str] = Field(None, description="Transcript of ref_audio (auto-ASR if omitted).")
    instruct: Optional[str] = Field(None, description="Voice-design attributes, e.g. 'female, british accent'.")
    speed: Optional[float] = Field(None, description=">1.0 faster, <1.0 slower.")
    duration: Optional[float] = Field(None, description="Fixed output seconds (overrides speed).")
    normalize: bool = Field(False, description="Run the server's text normalizer first.")
    response_format: ResponseFormat = "wav"


class SpeechRequest(BaseModel):
    """OpenAI-compatible POST /v1/audio/speech body (+ optional extensions)."""
    model: Optional[str] = None
    input: str = Field(..., description="Text to synthesize.")
    voice: Optional[str] = Field(None, description="Registered voice_id; if unknown, treated as instruct.")
    response_format: ResponseFormat = "mp3"
    speed: Optional[float] = None
    # extensions (non-standard, optional)
    instruct: Optional[str] = None
    language: Optional[str] = None
    normalize: bool = False


class VoicePublic(BaseModel):
    id: str
    name: str
    has_ref_text: bool
    created: str


class VoiceList(BaseModel):
    voices: List[VoicePublic]


class ErrorBody(BaseModel):
    message: str
    type: str = "error"


class ErrorResponse(BaseModel):
    error: ErrorBody
