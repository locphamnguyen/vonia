"""Inference engine for the OmniVoice API server.

Owns a single in-process model on the GPU and serializes all GPU work
(generation *and* voice-prompt building, which may run Whisper) behind one
asyncio semaphore + a matching thread pool, so concurrent HTTP requests queue
instead of fighting over VRAM. Blocking torch calls run in the pool to keep the
event loop responsive.
"""
from __future__ import annotations

import asyncio
import io
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, Tuple

import numpy as np
import soundfile as sf
import torch

from omnivoice.models.omnivoice import OmniVoice, OmniVoiceGenerationConfig
from omnivoice.utils.common import get_best_device

from .normalize import Normalizer
from .voices import VoiceLibrary, VoiceNotFoundError

_DTYPES = {"float16": torch.float16, "float32": torch.float32, "bfloat16": torch.bfloat16}


class QueueFullError(RuntimeError):
    pass


class Engine:
    def __init__(
        self,
        model_id: str = "k2-fsa/OmniVoice",
        device: Optional[str] = None,
        dtype: str = "float16",
        voices_dir: str = "~/.cache/omnivoice/voices",
        normalizer_spec: Optional[str] = None,
        max_concurrency: int = 1,
        max_queue: int = 32,
        load_asr: bool = False,
    ):
        self.model_id = model_id
        self.device = device or get_best_device()
        torch_dtype = _DTYPES.get(dtype, torch.float16)
        if self.device in ("cpu", "mps"):
            torch_dtype = torch.float32 if self.device == "cpu" else torch_dtype

        self.model = OmniVoice.from_pretrained(
            model_id, device_map=self.device, dtype=torch_dtype, load_asr=load_asr
        )
        self.model.eval()
        self.sampling_rate = int(self.model.sampling_rate)

        self.voices = VoiceLibrary(voices_dir)
        self.normalizer = Normalizer(normalizer_spec) if normalizer_spec else Normalizer(None)

        self.max_concurrency = max(1, max_concurrency)
        self.max_queue = max(0, max_queue)
        self._sem = asyncio.Semaphore(self.max_concurrency)
        self._pool = ThreadPoolExecutor(max_workers=self.max_concurrency,
                                        thread_name_prefix="omnivoice-gpu")
        self._pending = 0  # accepted but not yet finished (running + waiting)

    # ------------------------------------------------------------------ utils
    def vram(self) -> Optional[dict]:
        if not str(self.device).startswith("cuda"):
            return None
        try:
            free, total = torch.cuda.mem_get_info()
            return {"free_mb": free // 2**20, "used_mb": (total - free) // 2**20,
                    "total_mb": total // 2**20}
        except Exception:  # noqa: BLE001
            return None

    @property
    def queue_depth(self) -> int:
        return self._pending

    async def _run_gpu(self, fn, *args):
        """Run a blocking GPU function under the concurrency limit."""
        if self._pending >= self.max_concurrency + self.max_queue:
            raise QueueFullError("Server busy: generation queue is full.")
        self._pending += 1
        try:
            async with self._sem:
                loop = asyncio.get_running_loop()
                return await loop.run_in_executor(self._pool, fn, *args)
        finally:
            self._pending -= 1

    # ----------------------------------------------------------- voice prompts
    def _build_prompt(self, audio_path: str, ref_text: Optional[str]):
        return self.model.create_voice_clone_prompt(ref_audio=audio_path, ref_text=ref_text)

    def _resolve_prompt_for_id(self, voice_id: str):
        cached = self.voices.get_cached_prompt(voice_id)
        if cached is not None:
            return cached
        rec = self.voices.get_record(voice_id)  # raises VoiceNotFoundError
        prompt = self._build_prompt(rec.audio_path, rec.ref_text)
        self.voices.set_cached_prompt(voice_id, prompt)
        return prompt

    async def register_voice(self, name: str, audio_bytes: bytes, ext: str = ".wav",
                             ref_text: Optional[str] = None, overwrite: bool = False):
        from .voices import VoiceExistsError, slugify
        voice_id = slugify(name)
        if self.voices.exists(voice_id) and not overwrite:
            raise VoiceExistsError(voice_id)
        path = self.voices.save_ref_audio(voice_id, audio_bytes, ext)

        def _job():
            prompt = self._build_prompt(path, ref_text)
            rec = self.voices.put_record(name, path, ref_text, overwrite=True)
            self.voices.set_cached_prompt(voice_id, prompt)
            return rec

        return await self._run_gpu(_job)

    # ---------------------------------------------------------------- generate
    async def synthesize(
        self,
        text: str,
        language: Optional[str] = None,
        voice_id: Optional[str] = None,
        ref_audio_bytes: Optional[bytes] = None,
        ref_audio_ext: str = ".wav",
        ref_text: Optional[str] = None,
        instruct: Optional[str] = None,
        speed: Optional[float] = None,
        duration: Optional[float] = None,
        normalize: bool = False,
        gen_kwargs: Optional[dict] = None,
    ) -> np.ndarray:
        text = (text or "").strip()
        if not text:
            raise ValueError("`text` must not be empty.")
        if normalize:
            text = self.normalizer(text)  # may raise NormalizerError

        gen_kwargs = gen_kwargs or {}

        def _job() -> np.ndarray:
            kw = dict(
                text=text,
                language=language,
                generation_config=OmniVoiceGenerationConfig.from_dict(gen_kwargs),
            )
            if speed is not None and float(speed) != 1.0:
                kw["speed"] = float(speed)
            if duration is not None and float(duration) > 0:
                kw["duration"] = float(duration)

            prompt = None
            tmp_path = None
            try:
                if voice_id:
                    prompt = self._resolve_prompt_for_id(voice_id)
                elif ref_audio_bytes:
                    fd, tmp_path = tempfile.mkstemp(suffix=ref_audio_ext or ".wav")
                    with os.fdopen(fd, "wb") as f:
                        f.write(ref_audio_bytes)
                    prompt = self._build_prompt(tmp_path, ref_text)

                if prompt is not None:
                    kw["voice_clone_prompt"] = prompt
                elif instruct and instruct.strip():
                    kw["instruct"] = instruct.strip()

                audios = self.model.generate(**kw)
                return audios[0]
            finally:
                if tmp_path and os.path.exists(tmp_path):
                    os.remove(tmp_path)

        return await self._run_gpu(_job)

    # ------------------------------------------------------------ audio encode
    def encode(self, audio: np.ndarray, fmt: str = "wav") -> Tuple[bytes, str]:
        audio = np.asarray(audio, dtype=np.float32).reshape(-1)
        pcm16 = (np.clip(audio, -1.0, 1.0) * 32767.0).astype(np.int16)
        if fmt == "wav":
            buf = io.BytesIO()
            sf.write(buf, pcm16, self.sampling_rate, format="WAV", subtype="PCM_16")
            return buf.getvalue(), "audio/wav"
        if fmt == "pcm":
            return pcm16.tobytes(), "audio/pcm"
        if fmt == "mp3":
            from pydub import AudioSegment
            seg = AudioSegment(pcm16.tobytes(), frame_rate=self.sampling_rate,
                               sample_width=2, channels=1)
            buf = io.BytesIO()
            seg.export(buf, format="mp3")
            return buf.getvalue(), "audio/mpeg"
        raise ValueError(f"Unsupported response_format: {fmt}")
