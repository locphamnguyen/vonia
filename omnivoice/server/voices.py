"""Voice library for the OmniVoice API server.

Stores named reference voices on disk (audio file + metadata) and caches the
built :class:`VoiceClonePrompt` objects in memory so repeat requests skip the
ASR/encoding step. The library only handles *storage and caching*; building a
prompt touches the GPU model, so that is orchestrated by the Engine under its
GPU lock (see ``engine.py``).
"""
from __future__ import annotations

import json
import os
import re
import shutil
import threading
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional

_INDEX_NAME = "index.json"
_SLUG_RE = re.compile(r"[^a-z0-9]+")


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
    def __init__(self, voices_dir: str):
        self.dir = os.path.abspath(os.path.expanduser(voices_dir))
        os.makedirs(self.dir, exist_ok=True)
        self._lock = threading.Lock()
        self._records: Dict[str, VoiceRecord] = {}
        self._prompts: Dict[str, object] = {}  # id -> VoiceClonePrompt (cached)
        self._load_index()

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
        for rec in data.get("voices", []):
            try:
                self._records[rec["id"]] = VoiceRecord(**rec)
            except (TypeError, KeyError):
                continue

    def _save_index(self) -> None:
        tmp = self._index_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"voices": [asdict(r) for r in self._records.values()]}, f,
                      ensure_ascii=False, indent=2)
        os.replace(tmp, self._index_path)

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
