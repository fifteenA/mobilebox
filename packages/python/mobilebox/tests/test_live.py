"""Opt-in: one real phone on production, deleted at the end (about $0.01).

    MOBILEBOX_LIVE=1 MOBILESANDBOX_API_KEY=... pytest -m live
"""

import os

import pytest

from mobilebox import Mobilebox

pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(not (os.environ.get("MOBILEBOX_LIVE") and os.environ.get("MOBILESANDBOX_API_KEY")),
                       reason="set MOBILEBOX_LIVE=1 and MOBILESANDBOX_API_KEY"),
]

# A small public F-Droid app; the test only needs an install to succeed.
APK = "https://f-droid.org/repo/org.billthefarmer.editor_198.apk"


def test_phone_round_trip():
    mb = Mobilebox(user_agent=os.environ.get("MOBILEBOX_USER_AGENT"))
    phone = mb.create_phone(name="python-live-test", idle_timeout=120, max_duration=600)
    try:
        assert phone.status == "ready"
        assert any(p.id == phone.id for p in mb.list_phones())
        assert mb.observe(phone.id).text

        result = mb.act(phone.id, [
            {"type": "open_app", "package": "com.android.settings"},
            {"type": "scroll_to", "text": "Display"},
            {"type": "tap", "target": {"text": "Display"}},
            {"type": "wait_for", "text": "Brightness level"},
        ])
        assert result.ok, result.error
        assert result.screen.find("Brightness level")

        failed = mb.act(phone.id, [{"type": "tap", "target": {"text": "No such label 7f3c"}}])
        assert not failed.ok and failed.error.code and failed.error.next

        assert mb.screenshot(phone.id)[:8] == b"\x89PNG\r\n\x1a\n"
        assert mb.watch(phone.id).url.startswith("https://")
        assert mb.install_app(phone.id, url=APK).package == "org.billthefarmer.editor"

        assert mb.park_phone(phone.id).status in ("parking", "parked")
        assert mb.start_phone(phone.id).status == "ready"
    finally:
        mb.delete_phone(phone.id)
    assert all(p.id != phone.id for p in mb.list_phones())
