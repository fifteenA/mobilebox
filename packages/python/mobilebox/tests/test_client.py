"""Offline tests: a local HTTP server stands in for the API."""

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

import mobilebox
from mobilebox import Mobilebox, MobileboxError

PHONE = {"id": "ph_1", "object": "phone", "name": "t", "platform": "android", "device": "cloud",
         "status": "ready", "created_at": None, "settings": {}, "session": None, "failure": None,
         "added_later": "ignored"}
SCREEN = {"app": "com.android.settings", "text": '[1] Row "Display" (540,771)',
          "elements": [{"ref": 1, "type": "Row", "text": "Display", "center": [540, 771]}]}


class Stub:
    """Replies are (status, body) popped in order; every request is recorded."""

    def __init__(self):
        self.replies, self.requests = [], []
        stub = self

        class Handler(BaseHTTPRequestHandler):
            def _any(self):
                length = int(self.headers.get("Content-Length") or 0)
                stub.requests.append({"method": self.command, "path": self.path,
                                      "headers": dict(self.headers), "body": self.rfile.read(length)})
                status, body = stub.replies.pop(0)
                data = body if isinstance(body, bytes) else json.dumps(body).encode() if body is not None else b""
                self.send_response(status)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            do_GET = do_POST = do_DELETE = do_PATCH = _any

            def log_message(self, *args):
                pass

        self.server = HTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.server.server_port}"


@pytest.fixture
def stub():
    s = Stub()
    yield s
    s.server.shutdown()


@pytest.fixture
def mb(stub):
    return Mobilebox(api_key="sk_test", base_url=stub.url)


def test_key_from_env_and_missing(monkeypatch):
    monkeypatch.setenv("MOBILESANDBOX_API_KEY", "sk_env")
    assert Mobilebox().api_key == "sk_env"
    assert "sk_env" not in repr(Mobilebox())
    monkeypatch.delenv("MOBILESANDBOX_API_KEY")
    with pytest.raises(MobileboxError) as e:
        Mobilebox()
    assert e.value.code == "missing_api_key" and "MOBILESANDBOX_API_KEY" in e.value.next


def test_headers_and_user_agent(stub):
    stub.replies = [(200, {"data": [PHONE]}), (200, {"data": []})]
    phones = Mobilebox(api_key="sk_test", base_url=stub.url).list_phones()
    assert phones[0].id == "ph_1" and phones[0].status == "ready"
    h = stub.requests[0]["headers"]
    assert h["Authorization"] == "Bearer sk_test"
    assert h["User-Agent"] == f"mobilebox-python/{mobilebox.__version__}"
    Mobilebox(api_key="k", base_url=stub.url, user_agent="langchain-mobilebox/0.1.0").list_phones()
    assert stub.requests[1]["headers"]["User-Agent"] == f"langchain-mobilebox/0.1.0 mobilebox-python/{mobilebox.__version__}"


def test_create_waits_until_ready_with_one_idempotency_key(stub, mb):
    stub.replies = [
        (503, {"error": {"code": "unavailable", "message": "busy", "next": "Retry.", "retryable": True, "retry_after": 0}}),
        (201, {**PHONE, "status": "creating"}),
        (200, PHONE),
    ]
    phone = mb.create_phone(name="t", idle_timeout=120)
    assert phone.status == "ready"
    first, second, poll = stub.requests
    assert first["path"] == second["path"] == "/v1/phones?wait=ready&timeout=50"
    assert first["headers"]["Idempotency-Key"] == second["headers"]["Idempotency-Key"]
    assert json.loads(second["body"]) == {"name": "t", "idle_timeout": 120}
    assert poll["method"] == "GET" and poll["path"] == "/v1/phones/ph_1?wait=ready&timeout=50"


def test_create_passes_caller_key_and_does_not_retry_errors_that_are_not_retryable(stub, mb):
    stub.replies = [(409, {"error": {"code": "idempotency_conflict", "message": "Other options.",
                                     "next": "Use a new key.", "retryable": False}})]
    with pytest.raises(MobileboxError) as e:
        mb.create_phone(idempotency_key="key-1", name="other")
    assert (e.value.code, e.value.next, e.value.status) == ("idempotency_conflict", "Use a new key.", 409)
    assert len(stub.requests) == 1 and stub.requests[0]["headers"]["Idempotency-Key"] == "key-1"


def test_failed_phone_raises_its_failure(stub, mb):
    stub.replies = [(201, {**PHONE, "status": "failed", "failure": {"code": "boot_failed", "message": "No boot."}})]
    with pytest.raises(MobileboxError) as e:
        mb.create_phone()
    assert e.value.code == "boot_failed" and e.value.next


def test_error_without_json_body(stub, mb):
    stub.replies = [(502, b"Bad Gateway")]
    with pytest.raises(MobileboxError) as e:
        mb.get_phone("ph_1")
    assert (e.value.code, e.value.retryable, e.value.status) == ("http_502", True, 502)


def test_network_error_is_retryable():
    with pytest.raises(MobileboxError) as e:
        Mobilebox(api_key="k", base_url="http://127.0.0.1:9", timeout=2).list_phones()
    assert e.value.code == "network_error" and e.value.retryable


def test_act_reports_failed_action_without_raising(stub, mb):
    stub.replies = [(200, {"results": [
        {"type": "open_app", "ok": True},
        {"type": "tap", "ok": False, "error": {"code": "target_not_found", "message": "No 'Wifi'.",
                                               "next": "Observe, then target by text.", "retryable": False}},
    ], "screen": SCREEN})]
    result = mb.act("ph_1", [{"type": "open_app", "package": "com.android.settings"},
                             {"type": "tap", "target": {"text": "Wifi"}}])
    assert not result.ok and result.error.code == "target_not_found" and result.error.next
    assert result.screen.find("Display").center == [540, 771]
    assert json.loads(stub.requests[0]["body"])["actions"][1]["target"] == {"text": "Wifi"}


def test_phone_lifecycle_and_screen_paths(stub, mb):
    png = b"\x89PNG\r\n\x1a\nrest"
    stub.replies = [
        (200, SCREEN), (200, png),
        (201, {"url": "https://mobilebox.dev/watch#t", "expires_at": "2026-11-08T12:00:00Z", "command": "npx mobilebox watch"}),
        (200, {**PHONE, "status": "parked"}), (200, PHONE), (204, None),
    ]
    assert mb.observe("ph_1").app == "com.android.settings"
    assert mb.screenshot("ph_1") == png
    assert mb.watch("ph_1").url.startswith("https://")
    assert mb.park_phone("ph_1").status == "parked"
    assert mb.start_phone("ph_1", idle_timeout=60).status == "ready"
    assert mb.delete_phone("ph_1") is None
    assert [(r["method"], r["path"]) for r in stub.requests] == [
        ("GET", "/v1/phones/ph_1/observe"), ("GET", "/v1/phones/ph_1/screenshot"), ("POST", "/v1/phones/ph_1/view"),
        ("POST", "/v1/phones/ph_1/park"), ("POST", "/v1/phones/ph_1/start?wait=ready&timeout=50"), ("DELETE", "/v1/phones/ph_1"),
    ]


def test_install_from_url_and_bytes(stub, mb, tmp_path):
    app = {"package": "org.example", "version_code": 3, "version_name": "1.2"}
    stub.replies = [(201, app), (201, app)]
    assert mb.install_app("ph_1", url="https://example.org/a.apk").package == "org.example"
    apk = tmp_path / "a.apk"
    apk.write_bytes(b"PK\x03\x04apk")
    mb.install_app("ph_1", file=apk, grant_permissions=True)
    by_url, by_file = stub.requests
    assert by_url["path"] == "/v1/phones/ph_1/apps?grant_permissions=false"
    assert json.loads(by_url["body"]) == {"url": "https://example.org/a.apk"}
    assert by_file["path"] == "/v1/phones/ph_1/apps?grant_permissions=true"
    assert by_file["headers"]["Content-Type"] == "application/octet-stream" and by_file["body"] == b"PK\x03\x04apk"
    with pytest.raises(ValueError):
        mb.install_app("ph_1")
