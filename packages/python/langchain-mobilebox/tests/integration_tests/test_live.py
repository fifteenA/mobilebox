"""Opt-in: the tools against production, one real phone deleted at the end (about $0.01).

    MOBILEBOX_LIVE=1 MOBILESANDBOX_API_KEY=... pytest tests/integration_tests
"""

import os
import re

import pytest
from langchain_tests.integration_tests import ToolsIntegrationTests
from mobilebox import Mobilebox

from langchain_mobilebox import MobileboxObserve, MobileboxToolkit, __version__

pytestmark = pytest.mark.skipif(
    not (os.environ.get("MOBILEBOX_LIVE") and os.environ.get("MOBILESANDBOX_API_KEY")),
    reason="set MOBILEBOX_LIVE=1 and MOBILESANDBOX_API_KEY",
)
APK = "https://f-droid.org/repo/org.billthefarmer.editor_198.apk"
created: list[str] = []


@pytest.fixture(scope="module")
def client():
    extra = os.environ.get("MOBILEBOX_USER_AGENT")
    mb = Mobilebox(user_agent=f"{extra} langchain-mobilebox/{__version__}" if extra else f"langchain-mobilebox/{__version__}")
    yield mb
    for phone_id in created:  # also after a failed test
        mb.delete_phone(phone_id)
    assert not {p.id for p in mb.list_phones()} & set(created)


@pytest.fixture(scope="module")
def tools(client):
    return {t.name: t for t in MobileboxToolkit(client=client).get_tools()}


@pytest.fixture(scope="module")
def phone_id(tools):
    out = tools["mobilebox_create_phone"].invoke({"name": "langchain-live-test", "idle_timeout": 120, "max_duration": 600})
    phone_id = re.match(r"Phone (\S+) is ready", out).group(1)
    created.append(phone_id)
    return phone_id


class TestObserveIntegration(ToolsIntegrationTests):
    @pytest.fixture(autouse=True)
    def _phone(self, phone_id, client):
        self._id, self._client = phone_id, client

    @property
    def tool_constructor(self):
        return MobileboxObserve(client=self._client)

    @property
    def tool_invoke_params_example(self):
        return {"phone_id": self._id}


def test_drive_a_phone_with_the_tools(tools, phone_id):
    out = tools["mobilebox_act"].invoke({"phone_id": phone_id, "actions": [
        {"type": "open_app", "package": "com.android.settings"},
        {"type": "scroll_to", "text": "Display"},
        {"type": "tap", "target": {"text": "Display"}},
        {"type": "wait_for", "text": "Brightness level"},
    ]})
    assert "FAILED" not in out and "Brightness level" in out

    out = tools["mobilebox_act"].invoke({"phone_id": phone_id, "actions": [{"type": "tap", "target": {"text": "No such label 7f3c"}}]})
    assert "1. tap: FAILED" in out and "Next:" in out

    shot = tools["mobilebox_screenshot"].invoke({"phone_id": phone_id})
    assert shot[0]["type"] == "image" and shot[0]["base64"].startswith("iVBORw0KGgo")  # PNG magic

    assert tools["mobilebox_install_app"].invoke({"phone_id": phone_id, "url": APK}).startswith("Installed org.billthefarmer.editor")
    assert tools["mobilebox_park_phone"].invoke({"phone_id": phone_id}) in (f"Phone {phone_id} is parking.", f"Phone {phone_id} is parked.")


def test_delete_phone(tools, phone_id):
    assert tools["mobilebox_delete_phone"].invoke({"phone_id": phone_id}) == f"Phone {phone_id} is deleted."
    created.remove(phone_id)
