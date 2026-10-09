"""Gọi-về trang trung tâm + dải thông báo (omnivoice/server/announcement.py, phone_home.py).

Khoá hợp đồng: gửi ĐÚNG hai trường, link chỉ https, body sai dạng ⇒ không có
thông báo, lỗi mạng giữ thông báo đang có, mặc định không cho đóng, không có
biến env để tắt, mã bản cài sinh một lần.
"""
from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path

import fakeredis
import httpx
import pytest

from omnivoice.server import phone_home
from omnivoice.server.announcement import build_ping_payload, parse_announcement_response

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(autouse=True)
def _reset():
    phone_home._reset_for_tests()
    yield
    phone_home._reset_for_tests()


def _client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def test_payload_has_exactly_two_keys():
    assert build_ping_payload("id", "1.0") == {"instanceId": "id", "version": "1.0"}


@pytest.mark.parametrize("body", [
    None, [], {"announcement": None}, {"announcement": "x"},
    {"announcement": {"id": "", "text": "t"}},
    {"announcement": {"id": "a", "text": "  "}},
    {"announcement": {"id": "a", "text": "t", "link": "http://insecure.example"}},
    {"announcement": {"id": "a", "text": "t", "link": "javascript:alert(1)"}},
])
def test_bad_or_empty_bodies_mean_no_announcement(body):
    assert parse_announcement_response(body) is None


def test_not_dismissible_unless_central_page_says_true():
    def parse(**extra):
        return parse_announcement_response({"announcement": {"id": "a", "text": "t", **extra}})

    assert parse().dismissible is False
    assert parse(dismissible="true").dismissible is False
    assert parse(dismissible=True).dismissible is True


def test_instance_id_in_redis_is_created_once():
    r = fakeredis.FakeAsyncRedis(decode_responses=True)
    first = asyncio.run(phone_home.get_instance_id(r))
    assert re.fullmatch(r"[0-9a-f-]{36}", first)
    phone_home._reset_for_tests()
    assert asyncio.run(phone_home.get_instance_id(r)) == first


def test_instance_id_falls_back_to_file(tmp_path):
    first = phone_home.instance_id_from_file(str(tmp_path))
    assert phone_home.instance_id_from_file(str(tmp_path)) == first


def test_ping_sends_two_fields_and_caches():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["body"] = json.loads(request.read())
        return httpx.Response(200, json={"announcement": {"id": "a", "text": "Xin chào"}})

    r = fakeredis.FakeAsyncRedis(decode_responses=True)
    a = asyncio.run(phone_home.ping_once(_client(handler), r))
    assert a.text == "Xin chào" and phone_home.current_announcement() == a
    assert set(seen["body"]) == {"instanceId", "version"}
    assert seen["url"] == phone_home.PHONE_HOME_URL


def test_failures_keep_current_and_null_turns_it_off():
    r = fakeredis.FakeAsyncRedis(decode_responses=True)
    ok = _client(lambda q: httpx.Response(200, json={"announcement": {"id": "a", "text": "t"}}))
    kept = asyncio.run(phone_home.ping_once(ok, r))
    for handler in (lambda q: httpx.Response(503),
                    lambda q: (_ for _ in ()).throw(httpx.ConnectError("mat mang"))):
        assert asyncio.run(phone_home.ping_once(_client(handler), r)) == kept
    off = _client(lambda q: httpx.Response(200, json={"announcement": None}))
    assert asyncio.run(phone_home.ping_once(off, r)) is None


def test_never_starts_under_pytest_and_has_no_env_switch():
    assert phone_home.should_start() is False
    src = (ROOT / "omnivoice" / "server" / "phone_home.py").read_text(encoding="utf-8")
    assert "os.environ" not in src and "getenv" not in src
    assert phone_home.PHONE_HOME_URL.startswith("https://updater.zopen.vn/")
