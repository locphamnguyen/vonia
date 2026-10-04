"""Voice library for the OmniVoice API server.

Stores named reference voices on disk (audio file + metadata) and caches the
built :class:`VoiceClonePrompt` objects in memory *and* on disk (``prompt.pt``
next to the audio) so repeat requests — and server restarts — skip the
ASR/encoding step. Voices shipped with the source (``bundled_voices/``) are
copied into the library on first start, so a fresh build already has them. The library only handles *storage and caching*; building a
prompt touches the GPU model, so that is orchestrated by the Engine under its
GPU lock (see ``engine.py``).
"""
from __future__ import annotations

import json
import os
import re
import shutil
import logging
import threading
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional

_INDEX_NAME = "index.json"
_PROMPT_NAME = "prompt.pt"
_BUNDLED_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bundled_voices")
_SLUG_RE = re.compile(r"[^a-z0-9]+")

log = logging.getLogger(__name__)


def slugify(name: str) -> str:
    slug = _SLUG_RE.sub("-", name.strip().lower()).strip("-")
    return slug or "voice"


@dataclass
class VoiceRecord:
    id: str
    name: str
    ref_text: Optional[str]
    audio_path: str
    created: str

    def public(self) -> dict:
        d = asdict(self)
        # don't leak absolute server paths to clients
        d.pop("audio_path", None)
        d["has_ref_text"] = bool(self.ref_text)
        return d


class VoiceExistsError(ValueError):
    pass


class VoiceNotFoundError(KeyError):
    pass


class VoiceLibrary:
    def __init__(self, voices_dir: str, bundled_dir: Optional[str] = _BUNDLED_DIR):
        self.dir = os.path.abspath(os.path.expanduser(voices_dir))
        os.makedirs(self.dir, exist_ok=True)
        self._lock = threading.Lock()
        self._records: Dict[str, VoiceRecord] = {}
        self._prompts: Dict[str, object] = {}  # id -> VoiceClonePrompt (cached)
        # bundled voice ids already offered once; a user who deletes one keeps it deleted
        self._seeded: List[str] = []
        self._load_index()
        if bundled_dir:
            self._seed_bundled(bundled_dir)

    # ----- persistence -----
    @property
    def _index_path(self) -> str:
        return os.path.join(self.dir, _INDEX_NAME)

    def _load_index(self) -> None:
        if not os.path.isfile(self._index_path):
            return
        try:
            with open(self._index_path, encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            return
        self._seeded = [v for v in data.get("seeded", []) if isinstance(v, str)]
        for rec in data.get("voices", []):
            try:
                self._records[rec["id"]] = VoiceRecord(**rec)
            except (TypeError, KeyError):
                continue

    def _save_index(self) -> None:
        tmp = self._index_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"voices": [asdict(r) for r in self._records.values()],
                       "seeded": self._seeded}, f, ensure_ascii=False, indent=2)
        os.replace(tmp, self._index_path)

    def _seed_bundled(self, bundled_dir: str) -> None:
        """Copy voices listed in ``<bundled_dir>/voices.json`` into the library
        (audio + prebuilt prompt) the first time this library sees them."""
        manifest = os.path.join(bundled_dir, "voices.json")
        if not os.path.isfile(manifest):
            return
        try:
            with open(manifest, encoding="utf-8") as f:
                entries = json.load(f).get("voices", [])
        except (json.JSONDecodeError, OSError) as e:
            log.warning("Could not read bundled voices manifest: %s", e)
            return
        changed = False
        with self._lock:
            for e in entries:
                try:
                    voice_id, name = e["id"], e["name"]
                    src_audio = os.path.join(bundled_dir, e["audio"])
                except (TypeError, KeyError):
                    continue
                if voice_id in self._seeded:
                    continue
                self._seeded.append(voice_id)
                changed = True
                if voice_id in self._records or not os.path.isfile(src_audio):
                    continue
                sub = os.path.join(self.dir, voice_id)
                os.makedirs(sub, exist_ok=True)
                audio_path = os.path.join(sub, "ref" + os.path.splitext(src_audio)[1].lower())
                shutil.copyfile(src_audio, audio_path)
                if e.get("prompt"):
                    src_prompt = os.path.join(bundled_dir, e["prompt"])
                    if os.path.isfile(src_prompt):
                        shutil.copyfile(src_prompt, os.path.join(sub, _PROMPT_NAME))
                self._records[voice_id] = VoiceRecord(
                    id=voice_id,
                    name=name,
                    ref_text=e.get("ref_text"),
                    audio_path=audio_path,
                    created=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                )
                log.info("Added bundled voice %r to the library.", voice_id)
            if changed:
                self._save_index()

    # ----- records -----
    def list_records(self) -> List[VoiceRecord]:
        with self._lock:
            return list(self._records.values())

    def get_record(self, voice_id: str) -> VoiceRecord:
        with self._lock:
            rec = self._records.get(voice_id)
        if rec is None:
            raise VoiceNotFoundError(voice_id)
        return rec

    def exists(self, voice_id: str) -> bool:
        with self._lock:
            return voice_id in self._records

    def save_ref_audio(self, voice_id: str, audio_bytes: bytes, ext: str) -> str:
        """Persist the raw reference audio and return its path."""
        sub = os.path.join(self.dir, voice_id)
        os.makedirs(sub, exist_ok=True)
        ext = ext if ext.startswith(".") else "." + ext
        path = os.path.join(sub, "ref" + ext.lower())
        with open(path, "wb") as f:
            f.write(audio_bytes)
        return path

    def put_record(self, name: str, audio_path: str, ref_text: Optional[str],
                   overwrite: bool = False) -> VoiceRecord:
        voice_id = slugify(name)
        with self._lock:
            if voice_id in self._records and not overwrite:
                raise VoiceExistsError(voice_id)
            rec = VoiceRecord(
                id=voice_id,
                name=name,
                ref_text=ref_text,
                audio_path=audio_path,
                created=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            )
            self._records[voice_id] = rec
            self._prompts.pop(voice_id, None)  # invalidate stale cache
            self._save_index()
        return rec

    def delete(self, voice_id: str) -> None:
        with self._lock:
            if voice_id not in self._records:
                raise VoiceNotFoundError(voice_id)
            self._records.pop(voice_id, None)
            self._prompts.pop(voice_id, None)
            self._save_index()
        shutil.rmtree(os.path.join(self.dir, voice_id), ignore_errors=True)

    # ----- prompt cache (populated by the Engine under its GPU lock) -----
    def get_cached_prompt(self, voice_id: str) -> Optional[object]:
        with self._lock:
            return self._prompts.get(voice_id)

    def set_cached_prompt(self, voice_id: str, prompt: object) -> None:
        with self._lock:
            self._prompts[voice_id] = prompt

    # ----- prompt persistence (survives restarts) -----
    def _prompt_path(self, voice_id: str) -> str:
        return os.path.join(self.dir, voice_id, _PROMPT_NAME)

    def load_saved_prompt(self, voice_id: str) -> Optional[object]:
        """Return the prompt saved next to the voice's audio, or None if it is
        missing, older than the audio (voice was overwritten) or unreadable."""
        rec = self.get_record(voice_id)
        path = self._prompt_path(voice_id)
        try:
            if os.path.getmtime(path) < os.path.getmtime(rec.audio_path):
                return None
            from omnivoice.models.omnivoice import VoiceClonePrompt

            return VoiceClonePrompt.load(path)
        except FileNotFoundError:
            return None
        except Exception as e:  # noqa: BLE001 - a bad file just means rebuild
            log.warning("Ignoring saved prompt for %r: %s", voice_id, e)
            return None

    def save_prompt(self, voice_id: str, prompt: object) -> None:
        path = self._prompt_path(voice_id)
        tmp = path + ".tmp"
        try:
            prompt.save(tmp)  # type: ignore[attr-defined]
            os.replace(tmp, path)
        except Exception as e:  # noqa: BLE001 - cache only; generation still works
            log.warning("Could not save prompt for %r: %s", voice_id, e)
