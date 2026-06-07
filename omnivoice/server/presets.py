"""Preset voices for the Vonia UI / API.

OmniVoice has no fixed "preset voice" catalogue — voices are either registered
clones or voice-design `instruct` strings. These presets are a curated set of
voice-design profiles (gender + pitch) given friendly star names, so the UI can
offer ready-to-use voices and the webhook page can show stable preset ids.

Each preset maps to an `instruct` string consumed by `model.generate(instruct=...)`.
"""
from __future__ import annotations

# (name, gender M/F, pitch keyword, vi description, en description)
_RAW = [
    ("Achernar", "F", "high",     "Nữ, dịu nhẹ, cao",          "Female, soft, high pitch"),
    ("Achird",   "M", "moderate", "Nam, thân thiện, trung",     "Male, friendly, mid pitch"),
    ("Algenib",  "M", "low",      "Nam, khàn, trầm",            "Male, gravelly, low pitch"),
    ("Algieba",  "M", "low",      "Nam, thoải mái, trung-trầm", "Male, easy-going, mid-low"),
    ("Alnilam",  "M", "low",      "Nam, dứt khoát, trung-trầm", "Male, firm, mid-low pitch"),
    ("Alnitak",  "M", "low",      "Nam, ấm, trầm",              "Male, warm, low pitch"),
    ("Alphard",  "F", "high",     "Nữ, trong trẻo, cao",        "Female, clear, high pitch"),
    ("Alpheratz","F", "moderate", "Nữ, nhẹ nhàng, trung",       "Female, gentle, mid pitch"),
    ("Altair",   "M", "moderate", "Nam, mạnh mẽ, trung",        "Male, strong, mid pitch"),
    ("Antares",  "M", "low",      "Nam, trầm ấm, trầm",         "Male, deep warm, low pitch"),
    ("Arcturus", "M", "low",      "Nam, điềm tĩnh, trung-trầm", "Male, calm, mid-low pitch"),
    ("Bellatrix","F", "moderate", "Nữ, sắc sảo, trung",         "Female, crisp, mid pitch"),
    ("Canopus",  "M", "low",      "Nam, trang trọng, trầm",     "Male, formal, low pitch"),
    ("Capella",  "F", "high",     "Nữ, tươi vui, cao",          "Female, cheerful, high pitch"),
    ("Castor",   "M", "moderate", "Nam, trẻ trung, trung",      "Male, youthful, mid pitch"),
    ("Deneb",    "F", "moderate", "Nữ, truyền cảm, trung",      "Female, expressive, mid pitch"),
    ("Diphda",   "M", "low",      "Nam, mộc mạc, trung-trầm",   "Male, plain, mid-low pitch"),
    ("Dubhe",    "F", "high",     "Nữ, ngọt ngào, cao",         "Female, sweet, high pitch"),
    ("Electra",  "F", "high",     "Nữ, năng động, cao",         "Female, energetic, high pitch"),
    ("Fomalhaut","M", "low",      "Nam, trầm hùng, trầm",       "Male, resonant, low pitch"),
    ("Hadar",    "M", "moderate", "Nam, thân mật, trung",       "Male, intimate, mid pitch"),
    ("Izar",     "F", "moderate", "Nữ, ấm áp, trung",           "Female, warm, mid pitch"),
    ("Mirach",   "F", "moderate", "Nữ, thanh lịch, trung",      "Female, elegant, mid pitch"),
    ("Mizar",    "M", "moderate", "Nam, tự tin, trung",         "Male, confident, mid pitch"),
    ("Polaris",  "M", "low",      "Nam, dẫn chuyện, trung-trầm","Male, narrator, mid-low pitch"),
    ("Pollux",   "M", "moderate", "Nam, hài hước, trung",       "Male, playful, mid pitch"),
    ("Procyon",  "F", "high",     "Nữ, nhẹ tênh, cao",          "Female, airy, high pitch"),
    ("Rigel",    "M", "low",      "Nam, uy lực, trầm",          "Male, powerful, low pitch"),
    ("Sirius",   "F", "high",     "Nữ, sáng rõ, cao",           "Female, bright, high pitch"),
    ("Vega",     "F", "moderate", "Nữ, êm ái, trung",           "Female, smooth, mid pitch"),
]

_GENDER = {"M": "male", "F": "female"}


def _preset_id(name: str) -> str:
    """FNV-1a 32-bit, matching the webhook design's presetId()."""
    h = 0x811C9DC5
    for ch in name:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return "fac_" + format(h, "08x")


def _instruct(gender: str, pitch: str) -> str:
    return f"{_GENDER[gender]}, {pitch} pitch"


PRESETS = [
    {
        "id": _preset_id(name),
        "name": name,
        "gender": _GENDER[g],
        "instruct": _instruct(g, pitch),
        "desc_vi": vi,
        "desc_en": en,
    }
    for (name, g, pitch, vi, en) in _RAW
]

PRESETS_BY_ID = {p["id"]: p for p in PRESETS}
PRESETS_BY_NAME = {p["name"]: p for p in PRESETS}
