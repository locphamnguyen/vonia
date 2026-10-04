"""VoiceLibrary: bundled voices seeding + prompt persistence across restarts."""
import json
import os
import time

import torch

from omnivoice.models.omnivoice import VoiceClonePrompt
from omnivoice.server.voices import VoiceLibrary


def _prompt(text="xin chào"):
    return VoiceClonePrompt(
        ref_audio_tokens=torch.zeros(8, 5, dtype=torch.long), ref_text=text, ref_rms=0.1
    )


def _bundle(tmp_path):
    b = tmp_path / "bundled"
    (b / "demo").mkdir(parents=True)
    (b / "demo" / "ref.wav").write_bytes(b"RIFF....")
    _prompt("lời mẫu").save(str(b / "demo" / "prompt.pt"))
    (b / "voices.json").write_text(json.dumps({"voices": [{
        "id": "demo", "name": "Demo", "ref_text": "lời mẫu",
        "audio": "demo/ref.wav", "prompt": "demo/prompt.pt"}]}), encoding="utf-8")
    return str(b)


def test_bundled_voice_seeded_with_prompt(tmp_path):
    lib = VoiceLibrary(str(tmp_path / "voices"), bundled_dir=_bundle(tmp_path))
    rec = lib.get_record("demo")
    assert rec.name == "Demo" and rec.ref_text == "lời mẫu"
    assert os.path.isfile(rec.audio_path)
    assert lib.load_saved_prompt("demo").ref_text == "lời mẫu"


def test_deleted_bundled_voice_stays_deleted(tmp_path):
    bundled, voices = _bundle(tmp_path), str(tmp_path / "voices")
    VoiceLibrary(voices, bundled_dir=bundled).delete("demo")
    assert not VoiceLibrary(voices, bundled_dir=bundled).exists("demo")


def test_existing_voice_not_overwritten_by_bundle(tmp_path):
    voices = str(tmp_path / "voices")
    lib = VoiceLibrary(voices, bundled_dir=None)
    path = lib.save_ref_audio("demo", b"mine", ".wav")
    lib.put_record("demo", path, "của tôi")
    lib = VoiceLibrary(voices, bundled_dir=_bundle(tmp_path))
    assert lib.get_record("demo").ref_text == "của tôi"


def test_prompt_survives_restart_and_goes_stale_on_new_audio(tmp_path):
    voices = str(tmp_path / "voices")
    lib = VoiceLibrary(voices, bundled_dir=None)
    path = lib.save_ref_audio("a", b"v1", ".wav")
    lib.put_record("a", path, None)
    lib.save_prompt("a", _prompt("một"))

    lib = VoiceLibrary(voices, bundled_dir=None)  # "restart"
    assert lib.load_saved_prompt("a").ref_text == "một"

    time.sleep(0.05)
    lib.save_ref_audio("a", b"v2", ".wav")  # voice overwritten -> prompt is stale
    later = time.time() + 1
    os.utime(path, (later, later))
    assert lib.load_saved_prompt("a") is None


def test_missing_or_corrupt_prompt_returns_none(tmp_path):
    lib = VoiceLibrary(str(tmp_path / "voices"), bundled_dir=None)
    path = lib.save_ref_audio("b", b"x", ".wav")
    lib.put_record("b", path, None)
    assert lib.load_saved_prompt("b") is None
    p = os.path.join(os.path.dirname(path), "prompt.pt")
    with open(p, "wb") as f:
        f.write(b"not a torch file")
    later = time.time() + 1
    os.utime(p, (later, later))
    assert lib.load_saved_prompt("b") is None


def test_repo_bundle_has_nhatnam():
    import omnivoice.server.voices as v

    with open(os.path.join(v._BUNDLED_DIR, "voices.json"), encoding="utf-8") as f:
        entries = {e["id"]: e for e in json.load(f)["voices"]}
    e = entries["nhatnam"]
    assert os.path.isfile(os.path.join(v._BUNDLED_DIR, e["audio"]))
    assert VoiceClonePrompt.load(os.path.join(v._BUNDLED_DIR, e["prompt"])).ref_text == e["ref_text"]
