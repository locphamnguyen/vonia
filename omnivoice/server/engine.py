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
import json
import logging
import os
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, Tuple

import numpy as np
import soundfile as sf
import torch

from omnivoice.models.omnivoice import OmniVoice, OmniVoiceGenerationConfig
from omnivoice.utils.common import get_best_device

from .normalize import Normalizer
from .voices import VoiceLibrary, VoiceNotFoundError

log = logging.getLogger(__name__)

_DTYPES = {"float16": torch.float16, "float32": torch.float32, "bfloat16": torch.bfloat16}

# STT model id (from the UI) -> Whisper HF repo
_STT_MODELS = {
    "tiny": "openai/whisper-tiny",
    "base": "openai/whisper-base",
    "small": "openai/whisper-small",
    "large": "openai/whisper-large-v3",
    "turbo": "openai/whisper-large-v3-turbo",
}


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

        # NOTE: concurrency > 1 is NOT supported. The OmniVoice model and the lazy
        # ASR loader in transcribe() share mutable state with no lock, so parallel
        # GPU jobs can double-load Whisper or corrupt model state. serve.py clamps
        # this to 1; keep it 1 unless the model is made thread-safe.
        self.max_concurrency = max(1, max_concurrency)
        self.max_queue = max(0, max_queue)
        self._sem = asyncio.Semaphore(self.max_concurrency)
        self._pool = ThreadPoolExecutor(max_workers=self.max_concurrency,
                                        thread_name_prefix="omnivoice-gpu")
        self._pending = 0  # accepted but not yet finished (running + waiting)

        # Auto-release VRAM when idle: after `idle_minutes` with no GPU work the
        # model is moved off the GPU (to CPU RAM) and the CUDA cache is emptied,
        # freeing VRAM for other processes. The first request after that pays a
        # few seconds to move the model back. 0 = disabled (keep resident).
        # Only meaningful on CUDA; a no-op on CPU/MPS. Persisted so the choice
        # survives restarts. Settings live next to the voices cache.
        self._offloaded = False
        self._last_active = time.monotonic()
        self._settings_path = os.path.join(
            os.path.dirname(os.path.normpath(os.path.expanduser(voices_dir))), "runtime.json")
        self.idle_minutes = self._load_idle_minutes()

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

    @property
    def offloaded(self) -> bool:
        return self._offloaded

    @property
    def supports_idle_offload(self) -> bool:
        return str(self.device).startswith("cuda")

    async def _run_gpu(self, fn, *args):
        """Run a blocking GPU function under the concurrency limit. If the model
        was offloaded to CPU after an idle period, bring it back first (the small
        latency of this move is the cost of auto-releasing VRAM)."""
        if self._pending >= self.max_concurrency + self.max_queue:
            raise QueueFullError("Server busy: generation queue is full.")
        self._pending += 1
        try:
            async with self._sem:
                loop = asyncio.get_running_loop()
                if self._offloaded:
                    await loop.run_in_executor(self._pool, self._onload_blocking)
                self._last_active = time.monotonic()
                try:
                    result = await loop.run_in_executor(self._pool, fn, *args)
                    self._last_active = time.monotonic()
                    return result
                finally:
                    # Return cached-but-unused VRAM to the driver after every job.
                    # Without this the PyTorch allocator keeps growing its reserve
                    # over a session (each generation peaks higher), eventually
                    # starving the shared GPU — voice cloning would then OOM on the
                    # reference-audio encode even though the model is only ~2 GiB.
                    if torch.cuda.is_available():
                        await loop.run_in_executor(self._pool, torch.cuda.empty_cache)
        finally:
            self._pending -= 1

    # --------------------------------------------------------- idle VRAM release
    def _load_idle_minutes(self) -> int:
        """Persisted UI choice wins; else VONIA_VRAM_IDLE_MINUTES; else 0 (off)."""
        try:
            with open(self._settings_path, "r", encoding="utf-8") as f:
                val = json.load(f).get("vram_idle_minutes")
                if val is not None:
                    return max(0, int(val))
        except (OSError, ValueError, TypeError):
            pass
        try:
            return max(0, int(os.environ.get("VONIA_VRAM_IDLE_MINUTES", "0")))
        except ValueError:
            return 0

    def _persist_idle_minutes(self) -> None:
        try:
            os.makedirs(os.path.dirname(self._settings_path), exist_ok=True)
            with open(self._settings_path, "w", encoding="utf-8") as f:
                json.dump({"vram_idle_minutes": self.idle_minutes}, f)
        except OSError as e:  # noqa: BLE001
            log.warning("Could not persist VRAM idle setting: %s", e)

    def set_idle_minutes(self, minutes: int) -> None:
        self.idle_minutes = max(0, int(minutes))
        self._last_active = time.monotonic()  # don't offload immediately after a change
        self._persist_idle_minutes()
        log.info("VRAM auto-release set to %s.",
                 f"{self.idle_minutes} min idle" if self.idle_minutes else "off")

    def gpu_status(self) -> dict:
        return {
            "device": self.device,
            "supported": self.supports_idle_offload,
            "idle_minutes": self.idle_minutes,
            "offloaded": self._offloaded,
            "vram": self.vram(),
        }

    def _offload_blocking(self) -> None:
        """Move the model off the GPU and free its VRAM. Runs in the GPU pool
        thread, holding the semaphore so no job can touch the model meanwhile."""
        if self._offloaded:
            return
        self.model.to("cpu")
        # The ASR (Whisper) pipeline is a separate attribute, not a submodule, so
        # .to() above doesn't touch it. Drop it to release its VRAM; transcribe()
        # rebuilds it lazily on the next STT request.
        if getattr(self.model, "_asr_pipe", None) is not None:
            self.model._asr_pipe = None
        if str(self.device).startswith("cuda"):
            torch.cuda.empty_cache()
        self._offloaded = True
        log.info("Idle VRAM release: model moved to CPU, CUDA cache emptied.")

    def _onload_blocking(self) -> None:
        """Bring the model back onto the GPU for an incoming request."""
        if not self._offloaded:
            return
        self.model.to(self.device)
        self._offloaded = False
        log.info("Model reloaded onto %s for incoming request.", self.device)

    async def idle_monitor(self, tick: float = 15.0) -> None:
        """Background loop: offload the model once it's been idle past the
        configured threshold. Cancelled on shutdown."""
        if not self.supports_idle_offload:
            log.info("Idle VRAM monitor disabled (device=%s, not CUDA).", self.device)
            return
        log.info("Idle VRAM monitor started (checking every %ss).", tick)
        while True:
            await asyncio.sleep(tick)
            try:
                secs = self.idle_minutes * 60
                if secs <= 0 or self._offloaded or self._pending > 0:
                    continue
                if (time.monotonic() - self._last_active) < secs:
                    continue
                async with self._sem:  # block jobs while we move the model
                    secs = self.idle_minutes * 60  # re-read; may have changed
                    if secs <= 0 or self._offloaded:
                        continue
                    if (time.monotonic() - self._last_active) < secs:
                        continue
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(self._pool, self._offload_blocking)
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                log.exception("Idle VRAM monitor iteration failed.")

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
        seed: Optional[int] = None,
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
            # Seed the RNG so voice-design (instruct) output is reproducible:
            # same seed → same voice. The UI derives a stable seed per chosen
            # voice name, so each preset/cast role gets a distinct, consistent
            # voice instead of a fresh random one each call. Runs inside the
            # GPU-locked job (serialized at max_concurrency=1) so the global
            # seed isn't clobbered by a concurrent generation.
            if seed is not None:
                torch.manual_seed(int(seed))
                if torch.cuda.is_available():
                    torch.cuda.manual_seed_all(int(seed))
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

    # --------------------------------------------------------------- STT (ASR)
    async def transcribe(self, audio_bytes: bytes, model: str = "turbo",
                         language: Optional[str] = None, ext: str = ".wav") -> dict:
        """Transcribe audio to text with per-segment timestamps via Whisper."""
        hf_name = _STT_MODELS.get(model, _STT_MODELS["turbo"])

        def _job() -> dict:
            # (Re)load the ASR model if a different one is requested.
            if getattr(self.model, "_asr_model_name", None) != hf_name or self.model._asr_pipe is None:
                self.model.load_asr_model(model_name=hf_name)
                self.model._asr_model_name = hf_name
            fd, tmp_path = tempfile.mkstemp(suffix=ext or ".wav")
            try:
                with os.fdopen(fd, "wb") as f:
                    f.write(audio_bytes)
                # Only pass generate_kwargs when non-empty. The Whisper pipeline
                # does `forward_params.update(generate_kwargs.pop("generate_kwargs"))`,
                # so an explicit generate_kwargs=None crashes with
                # "'NoneType' object is not iterable" (e.g. auto-detect language).
                pipe_kwargs = {"return_timestamps": True, "chunk_length_s": 30}
                if language and language not in ("auto", "", None):
                    pipe_kwargs["generate_kwargs"] = {"language": language}
                out = self.model._asr_pipe(tmp_path, **pipe_kwargs)
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
            chunks = out.get("chunks") or []
            segments = []
            for c in chunks:
                ts = c.get("timestamp") or (None, None)
                segments.append({
                    "start": ts[0], "end": ts[1],
                    "text": (c.get("text") or "").strip(),
                })
            return {"text": (out.get("text") or "").strip(), "segments": segments}

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
