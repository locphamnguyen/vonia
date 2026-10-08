"""Gọi-về trang trung tâm Vonia + cache thông báo trong bộ nhớ.

Port từ ZaloCRM / VoiceStudio-VN. Nhịp: một lần sau khi khởi động (trễ 30 giây),
rồi mỗi 12 giờ. Mỗi lần gửi ĐÚNG ``{ instanceId, version }``, nhận
``{ announcement }`` rồi cất vào bộ nhớ. Route ``GET /v1/announcement`` chỉ đọc
cache — không bao giờ gọi ra ngoài theo request của người dùng.

Luật hỏng-êm: timeout 5 giây, lỗi chỉ ghi log debug, thông báo đang cache giữ
nguyên. Không có công tắc env (chủ dự án chốt): địa chỉ ghim cứng ở
``PHONE_HOME_URL``; đổi domain ⇒ đổi ở đây TRƯỚC khi phát hành.

``instanceId``: uuid4 ngẫu nhiên, lưu ở Redis ``vonia:instance_id`` (SET NX — hai
pod cùng khởi động lần đầu vẫn chỉ sinh MỘT mã, và mã sống qua việc tạo lại
pod). Redis không dùng được thì rơi về tệp ``~/.cache/omnivoice/instance_id``.
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys
import tempfile
import uuid
from typing import Optional

from .announcement import Announcement, build_ping_payload, parse_announcement_response

log = logging.getLogger("omnivoice.server.phone_home")

PHONE_HOME_URL = "https://updater.zopen.vn/vonia-phone-home/v1/ping"
PING_INTERVAL_S = 12 * 60 * 60
BOOT_DELAY_S = 30
REQUEST_TIMEOUT_S = 5.0
REDIS_KEY = "vonia:instance_id"
FILE_DIR = os.path.join(os.path.expanduser("~"), ".cache", "omnivoice")


class _State:
    """Trạng thái của tiến trình (một thể hiện duy nhất ``_state``)."""

    def __init__(self) -> None:
        self.current: Optional[Announcement] = None
        self.instance_id: Optional[str] = None
        self.in_flight = False


_state = _State()


def current_announcement() -> Optional[Announcement]:
    return _state.current


def _valid_uuid(value: str) -> bool:
    try:
        return str(uuid.UUID(value)) == value
    except (ValueError, TypeError):
        return False


def instance_id_from_file(folder: str = FILE_DIR) -> str:
    """Đọc (hoặc sinh lần đầu) mã bản cài từ tệp. Ghi atomic: tệp tạm rồi ``os.replace``."""
    path = os.path.join(folder, "instance_id")
    try:
        with open(path, encoding="utf-8") as fh:
            existing = fh.read().strip()
        if _valid_uuid(existing):
            return existing
    except OSError:
        pass  # chưa có tệp (lần chạy đầu) hoặc không đọc được ⇒ sinh mã mới bên dưới
    new_id = str(uuid.uuid4())
    os.makedirs(folder, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=folder, prefix=".instance_id.")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(new_id + "\n")
        os.replace(tmp, path)
    except OSError:
        try:
            os.unlink(tmp)
        except OSError:
            pass  # dọn tệp tạm là phụ; lỗi ghi gốc mới là thứ cần ném ra
        raise
    return new_id


async def get_instance_id(redis=None) -> str:
    if _state.instance_id:
        return _state.instance_id
    value: Optional[str] = None
    if redis is not None:
        try:
            await redis.set(REDIS_KEY, str(uuid.uuid4()), nx=True)
            value = await redis.get(REDIS_KEY)
        except Exception as exc:  # noqa: BLE001
            log.debug("[phone-home] Redis không dùng được, lưu mã bản cài ra tệp: %s", exc)
            value = None
    if not value or not _valid_uuid(value):
        value = await asyncio.to_thread(instance_id_from_file)
    _state.instance_id = value
    return value


def _app_version() -> str:
    try:
        from importlib.metadata import version

        return version("omnivoice") or "unknown"
    except Exception:  # noqa: BLE001
        return "unknown"


async def ping_once(http, redis=None) -> Optional[Announcement]:
    """Một lượt gọi-về bằng ``http`` (``httpx.AsyncClient``). KHÔNG ném lỗi."""
    if _state.in_flight:
        return _state.current
    _state.in_flight = True
    try:
        instance_id = await get_instance_id(redis)
        res = await http.post(PHONE_HOME_URL,
                              json=build_ping_payload(instance_id, _app_version()),
                              headers={"accept": "application/json"},
                              timeout=REQUEST_TIMEOUT_S)
        if res.status_code < 200 or res.status_code >= 300:
            log.debug("[phone-home] trang trung tâm trả %s — giữ thông báo đang có", res.status_code)
            return _state.current
        _state.current = parse_announcement_response(res.json())
        return _state.current
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001
        # Cố ý debug, không warning: máy không có mạng ra ngoài là bình thường.
        log.debug("[phone-home] gọi-về thất bại — giữ thông báo đang có: %s", exc)
        return _state.current
    finally:
        _state.in_flight = False


async def phone_home_loop(http, redis=None) -> None:
    """Vòng chạy nền: trễ 30 giây sau khởi động, rồi mỗi 12 giờ."""
    log.info("[phone-home] Gửi {instanceId, version=%s} tới %s mỗi 12h", _app_version(), PHONE_HOME_URL)
    await asyncio.sleep(BOOT_DELAY_S)
    while True:
        await ping_once(http, redis)
        await asyncio.sleep(PING_INTERVAL_S)


def should_start() -> bool:
    """Không chạy dưới pytest — bộ test không được gọi ra mạng."""
    return "pytest" not in sys.modules


def _reset_for_tests() -> None:
    global _state
    _state = _State()
