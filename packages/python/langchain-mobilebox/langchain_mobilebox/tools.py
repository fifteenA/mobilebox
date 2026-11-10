"""LangChain tools for Mobilebox cloud Android phones."""

from __future__ import annotations

import base64
from typing import Any

from langchain_core.tools import BaseTool, BaseToolkit, ToolException
from mobilebox import Mobilebox, MobileboxError
from pydantic import BaseModel, ConfigDict, Field

__version__ = "0.1.0"


def _default_client() -> Mobilebox:
    return Mobilebox(user_agent=f"langchain-mobilebox/{__version__}")  # reads MOBILESANDBOX_API_KEY


class _MobileboxTool(BaseTool):
    client: Mobilebox = Field(default_factory=_default_client, exclude=True)
    """The Mobilebox client. Default: one built from MOBILESANDBOX_API_KEY."""

    handle_tool_error: bool = True  # the model reads code, message and next instead of the run crashing

    def _call(self, fn, *args: Any, **kwargs: Any) -> Any:
        try:
            return fn(*args, **kwargs)
        except MobileboxError as e:
            raise ToolException(str(e)) from e


class PhoneInput(BaseModel):
    phone_id: str = Field(description="The phone id, e.g. ph_abc123, from mobilebox_create_phone")


class CreatePhoneInput(BaseModel):
    name: str | None = Field(None, description="A label for the phone")
    country: str | None = Field(None, description="Two-letter country code; also sets the phone's locale")
    city: str | None = Field(None, description="e.g. Berlin: sets GPS, timezone and locale to match")
    idle_timeout: int | None = Field(None, ge=60, le=3600, description="Park after this many idle seconds (default 300)")
    max_duration: int | None = Field(None, ge=60, le=10800, description="Park after this many seconds running (default 900)")


class MobileboxCreatePhone(_MobileboxTool):
    """Create a cloud Android phone, wait until it is ready and return its id and first screen."""

    name: str = "mobilebox_create_phone"
    description: str = (
        "Create a cloud Android phone, wait until it is ready (about 20 s) and return its id and first screen. "
        "Costs $0.01 per minute while ready: delete it when the task is done, also when it failed."
    )
    args_schema: type[BaseModel] = CreatePhoneInput

    def _run(self, **options: Any) -> str:
        phone = self._call(self.client.create_phone, **{k: v for k, v in options.items() if v is not None})
        screen = self._call(self.client.observe, phone.id)
        return f"Phone {phone.id} is ready ({phone.platform}, {phone.device}).\n\n{screen.text}"


class MobileboxObserve(_MobileboxTool):
    """Read the phone's current screen as a numbered element list."""

    name: str = "mobilebox_observe"
    description: str = (
        "Read the phone's current screen. Each line is `[ref] Type \"text\" — secondary [state] (x,y)`. "
        "Observe when unsure instead of guessing."
    )
    args_schema: type[BaseModel] = PhoneInput

    def _run(self, phone_id: str) -> str:
        return self._call(self.client.observe, phone_id).text


class ActInput(PhoneInput):
    actions: list[dict[str, Any]] = Field(
        min_length=1,
        max_length=20,
        description=(
            "1-20 actions, run in order. Types and fields: tap / long_press (target), "
            "type (text; optional target, clear, submit), swipe (from [x,y], to [x,y]), "
            "scroll (direction up/down/left/right), scroll_to (text), key (key: back/home/enter/delete/recents/tab), "
            "back, home, open_app / close_app (package), wait (ms), wait_for (text; optional gone, timeout_ms). Targets, best first: {\"text\":\"Sign in\"}, {\"id\":\"com.app:id/login\"}, "
            "{\"desc\":\"Navigate up\"}, {\"ref\":3} (latest screen only), {\"x\":540,\"y\":1200}. Examples: "
            "{\"type\":\"open_app\",\"package\":\"com.android.settings\"}, {\"type\":\"tap\",\"target\":{\"text\":\"Display\"}}"
        ),
    )


class MobileboxAct(_MobileboxTool):
    """Run 1-20 actions on the phone, stop at the first failure, return results and the new screen."""

    name: str = "mobilebox_act"
    description: str = (
        "Run 1-20 actions on the phone in order. Stops at the first failed action; earlier actions stay applied. "
        "Returns one result per action and the new screen: verify the outcome there, a successful tap proves "
        "only the input. On a failure, do what its `next` says and continue from the returned screen."
    )
    args_schema: type[BaseModel] = ActInput

    def _run(self, phone_id: str, actions: list[dict[str, Any]]) -> str:
        result = self._call(self.client.act, phone_id, actions)
        lines = [f"{i}. {r.type}: ok" if r.ok else f"{i}. {r.type}: FAILED {r.error}" for i, r in enumerate(result.results, 1)]
        if len(result.results) < len(actions):
            lines.append(f"Not run: actions {len(result.results) + 1}-{len(actions)}.")
        return "\n".join(lines) + "\n\nScreen:\n" + result.screen.text


class MobileboxScreenshot(_MobileboxTool):
    """A PNG of the phone's screen, for what the element list cannot show."""

    name: str = "mobilebox_screenshot"
    description: str = (
        "A PNG of the phone's screen, for content the element list cannot show: images, maps, games, "
        "or checking coordinates before a tap by x,y."
    )
    args_schema: type[BaseModel] = PhoneInput

    def _run(self, phone_id: str) -> list[dict[str, Any]]:
        png = self._call(self.client.screenshot, phone_id)
        return [{"type": "image", "base64": base64.b64encode(png).decode(), "mime_type": "image/png"}]


class InstallAppInput(PhoneInput):
    url: str = Field(description="Public direct-download URL of an APK (arm64-v8a or universal), .apks or .xapk")
    grant_permissions: bool = Field(False, description="Grant the app's runtime permissions on install")


class MobileboxInstallApp(_MobileboxTool):
    """Install or update an app on the phone from a public download URL."""

    name: str = "mobilebox_install_app"
    description: str = (
        "Install or update an app on the phone from a public download URL (APK, .apks or .xapk). "
        "Open it afterwards with an open_app action and its package name."
    )
    args_schema: type[BaseModel] = InstallAppInput

    def _run(self, phone_id: str, url: str, grant_permissions: bool = False) -> str:
        app = self._call(self.client.install_app, phone_id, url=url, grant_permissions=grant_permissions)
        return f"Installed {app.package} {app.version_name or ''}".rstrip() + "."


class MobileboxParkPhone(_MobileboxTool):
    """Park the phone: shut it down and stop billing, keeping apps, data and logins."""

    name: str = "mobilebox_park_phone"
    description: str = (
        "Park the phone: shut it down and stop billing. Apps, data and logins stay. "
        "Use only when the phone is needed again later; otherwise delete it."
    )
    args_schema: type[BaseModel] = PhoneInput

    def _run(self, phone_id: str) -> str:
        return f"Phone {phone_id} is {self._call(self.client.park_phone, phone_id).status}."


class MobileboxDeletePhone(_MobileboxTool):
    """Delete the phone and everything on it."""

    name: str = "mobilebox_delete_phone"
    description: str = "Delete the phone and everything on it. Do this when the task is done, also when it failed."
    args_schema: type[BaseModel] = PhoneInput

    def _run(self, phone_id: str) -> str:
        self._call(self.client.delete_phone, phone_id)
        return f"Phone {phone_id} is deleted."


class MobileboxToolkit(BaseToolkit):
    """All Mobilebox tools, sharing one client.

    Setup:
        pip install langchain-mobilebox
        export MOBILESANDBOX_API_KEY=...

    Instantiate:
        from langchain_mobilebox import MobileboxToolkit

        tools = MobileboxToolkit().get_tools()

    Your code can own the phone instead: create it with the client, give the agent
    only observe, act, screenshot and install, and delete the phone in a finally.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    client: Mobilebox = Field(default_factory=_default_client, exclude=True)

    def get_tools(self) -> list[BaseTool]:
        return [
            cls(client=self.client)
            for cls in (
                MobileboxCreatePhone,
                MobileboxObserve,
                MobileboxAct,
                MobileboxScreenshot,
                MobileboxInstallApp,
                MobileboxParkPhone,
                MobileboxDeletePhone,
            )
        ]
