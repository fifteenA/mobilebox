"""Offline: LangChain's standard tool tests, plus each tool against a fake client."""

import base64

import pytest
from langchain_core.messages import ToolMessage
from langchain_tests.unit_tests import ToolsUnitTests
from mobilebox import Mobilebox

from langchain_mobilebox import (
    MobileboxAct,
    MobileboxCreatePhone,
    MobileboxDeletePhone,
    MobileboxInstallApp,
    MobileboxObserve,
    MobileboxParkPhone,
    MobileboxScreenshot,
    MobileboxToolkit,
    __version__,
)

PHONE = {"id": "ph_1", "status": "ready", "platform": "android", "device": "cloud"}
SCREEN = {"app": "com.android.settings", "text": '[1] Row "Display" (540,771)', "elements": []}


class FakeMobilebox(Mobilebox):
    """Answers each (method, path) from `replies` and records the calls."""

    def __init__(self, replies=None):
        super().__init__(api_key="sk_test", base_url="http://fake")
        self.replies, self.calls = replies or {}, []

    def request(self, method, path, body=None, headers=None, raw=False):
        self.calls.append((method, path, body))
        reply = self.replies[(method, path.split("?")[0])]
        if isinstance(reply, Exception):
            raise reply
        return reply


class _Standard(ToolsUnitTests):
    @property
    def tool_constructor_params(self):
        return {"client": FakeMobilebox()}

    @property
    def tool_invoke_params_example(self):
        return {"phone_id": "ph_1"}

    @property
    def init_from_env_params(self):
        return {"MOBILESANDBOX_API_KEY": "sk_env"}, {}, {}


class TestCreatePhoneStandard(_Standard):
    tool_constructor = MobileboxCreatePhone

    @property
    def tool_invoke_params_example(self):
        return {"name": "demo", "idle_timeout": 120}


class TestObserveStandard(_Standard):
    tool_constructor = MobileboxObserve


class TestActStandard(_Standard):
    tool_constructor = MobileboxAct

    @property
    def tool_invoke_params_example(self):
        return {"phone_id": "ph_1", "actions": [{"type": "tap", "target": {"text": "Display"}}]}


class TestScreenshotStandard(_Standard):
    tool_constructor = MobileboxScreenshot


class TestInstallAppStandard(_Standard):
    tool_constructor = MobileboxInstallApp

    @property
    def tool_invoke_params_example(self):
        return {"phone_id": "ph_1", "url": "https://example.org/app.apk"}


class TestParkPhoneStandard(_Standard):
    tool_constructor = MobileboxParkPhone


class TestDeletePhoneStandard(_Standard):
    tool_constructor = MobileboxDeletePhone


def test_default_client_reads_env_and_sends_its_user_agent(monkeypatch):
    monkeypatch.setenv("MOBILESANDBOX_API_KEY", "sk_env")
    client = MobileboxObserve().client
    assert client.api_key == "sk_env"
    assert client.user_agent.startswith(f"langchain-mobilebox/{__version__} mobilebox-python/")


def test_toolkit_shares_one_client():
    client = FakeMobilebox()
    tools = MobileboxToolkit(client=client).get_tools()
    assert [t.name for t in tools] == [
        "mobilebox_create_phone", "mobilebox_observe", "mobilebox_act", "mobilebox_screenshot",
        "mobilebox_install_app", "mobilebox_park_phone", "mobilebox_delete_phone",
    ]
    assert all(t.client is client for t in tools)


def test_create_phone_returns_id_and_first_screen():
    client = FakeMobilebox({("POST", "/v1/phones"): PHONE, ("GET", "/v1/phones/ph_1/observe"): SCREEN})
    out = MobileboxCreatePhone(client=client).invoke({"name": "demo", "idle_timeout": 120})
    assert out.startswith("Phone ph_1 is ready (android, cloud).") and "Display" in out
    assert client.calls[0][2] == {"name": "demo", "idle_timeout": 120}  # unset options are not sent


def test_act_reports_the_failed_action_and_the_screen():
    error = {"code": "target_not_found", "message": "No 'Wifi'.", "next": "Observe, then target by text.", "retryable": False}
    client = FakeMobilebox({("POST", "/v1/phones/ph_1/actions"): {
        "results": [{"type": "open_app", "ok": True}, {"type": "tap", "ok": False, "error": error}], "screen": SCREEN}})
    actions = [{"type": "open_app", "package": "com.android.settings"}, {"type": "tap", "target": {"text": "Wifi"}},
               {"type": "back"}]
    out = MobileboxAct(client=client).invoke({"phone_id": "ph_1", "actions": actions})
    assert "1. open_app: ok" in out
    assert "2. tap: FAILED target_not_found: No 'Wifi'. Next: Observe, then target by text." in out
    assert "Not run: actions 3-3." in out and out.endswith(SCREEN["text"])


def test_api_error_reaches_the_model_with_code_and_next():
    from mobilebox import MobileboxError

    gone = MobileboxError("phone_not_found", "No phone ph_x.", "List phones, then use an id from the list.", status=404)
    tool = MobileboxObserve(client=FakeMobilebox({("GET", "/v1/phones/ph_x/observe"): gone}))
    msg = tool.invoke({"type": "tool_call", "id": "1", "name": tool.name, "args": {"phone_id": "ph_x"}})
    assert isinstance(msg, ToolMessage) and msg.status == "error"
    assert "phone_not_found" in msg.content and "List phones" in msg.content


def test_screenshot_is_an_image_block():
    png = b"\x89PNG\r\n\x1a\nrest"
    tool = MobileboxScreenshot(client=FakeMobilebox({("GET", "/v1/phones/ph_1/screenshot"): png}))
    msg = tool.invoke({"type": "tool_call", "id": "1", "name": tool.name, "args": {"phone_id": "ph_1"}})
    assert msg.content == [{"type": "image", "base64": base64.b64encode(png).decode(), "mime_type": "image/png"}]


def test_install_park_delete():
    client = FakeMobilebox({
        ("POST", "/v1/phones/ph_1/apps"): {"package": "org.example", "version_name": "1.2"},
        ("POST", "/v1/phones/ph_1/park"): {**PHONE, "status": "parked"},
        ("DELETE", "/v1/phones/ph_1"): None,
    })
    assert MobileboxInstallApp(client=client).invoke({"phone_id": "ph_1", "url": "https://example.org/a.apk"}) == "Installed org.example 1.2."
    assert MobileboxParkPhone(client=client).invoke({"phone_id": "ph_1"}) == "Phone ph_1 is parked."
    assert MobileboxDeletePhone(client=client).invoke({"phone_id": "ph_1"}) == "Phone ph_1 is deleted."
    assert client.calls[0][2] == {"url": "https://example.org/a.apk"}


def test_act_rejects_empty_and_oversized_batches():
    tool = MobileboxAct(client=FakeMobilebox())
    for actions in ([], [{"type": "back"}] * 21):
        with pytest.raises(ValueError):
            tool.invoke({"phone_id": "ph_1", "actions": actions})
