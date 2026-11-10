"""Python client for Mobilebox: cloud Android phones your agent drives over REST.

    from mobilebox import Mobilebox

    mb = Mobilebox()  # reads MOBILESANDBOX_API_KEY
    phone = mb.create_phone(name="demo")
    try:
        result = mb.act(phone.id, [{"type": "open_app", "package": "com.android.settings"}])
        print(result.screen.text)
    finally:
        mb.delete_phone(phone.id)

Standard library only. API reference: https://mobilebox.dev/docs/reference
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass, field, fields
from pathlib import Path
from typing import Any

__version__ = "0.1.0"
__all__ = [
    "ActResult",
    "ActionResult",
    "App",
    "Element",
    "Mobilebox",
    "MobileboxError",
    "Phone",
    "Screen",
    "WatchLink",
]

DEFAULT_BASE_URL = "https://mobilebox.dev"
_WAIT = 50  # server-side wait per request; the API caps it at 55 s


class MobileboxError(Exception):
    """An API error. `next` says what to do instead; do that before retrying."""

    def __init__(
        self,
        code: str,
        message: str,
        next: str = "",
        retryable: bool = False,
        retry_after: int | None = None,
        status: int | None = None,
    ):
        super().__init__(f"{code}: {message}" + (f" Next: {next}" if next else ""))
        self.code = code
        self.message = message
        self.next = next
        self.retryable = retryable
        self.retry_after = retry_after
        self.status = status  # HTTP status; None for network errors and failed actions

    @classmethod
    def _from(cls, detail: dict, status: int | None = None) -> MobileboxError:
        return cls(
            detail.get("code", "unknown"),
            detail.get("message", ""),
            detail.get("next", ""),
            bool(detail.get("retryable")),
            detail.get("retry_after"),
            status,
        )


def _build(cls, data: dict):
    # ponytail: unknown keys are dropped so new API fields never break old clients
    names = {f.name for f in fields(cls)}
    return cls(**{k: v for k, v in data.items() if k in names})


@dataclass
class Phone:
    id: str
    status: str  # creating, starting, ready, parking, parked, failed, deleted
    name: str = ""
    platform: str = "android"
    device: str = "cloud"
    created_at: str | None = None
    settings: dict = field(default_factory=dict)
    session: dict | None = None
    failure: dict | None = None
    notice: str | None = None


@dataclass
class Element:
    ref: int
    type: str = ""
    text: str | None = None
    desc: str | None = None
    id: str | None = None
    summary: str | None = None
    bounds: list[int] = field(default_factory=list)
    center: list[int] = field(default_factory=list)
    state: list[str] = field(default_factory=list)


@dataclass
class Screen:
    text: str  # one line per element: [ref] Type "text" — secondary [state] (x,y)
    app: str | None = None
    elements: list[Element] = field(default_factory=list)

    @classmethod
    def _from(cls, data: dict) -> Screen:
        return cls(
            text=data.get("text", ""),
            app=data.get("app"),
            elements=[_build(Element, e) for e in data.get("elements", [])],
        )

    def find(self, text: str) -> Element | None:
        """The first element whose text is exactly `text`."""
        return next((e for e in self.elements if e.text == text), None)


@dataclass
class ActionResult:
    type: str
    ok: bool
    error: MobileboxError | None = None


@dataclass
class ActResult:
    """One result per action that ran, and the screen after the last one."""

    results: list[ActionResult]
    screen: Screen

    @property
    def ok(self) -> bool:
        return all(r.ok for r in self.results)

    @property
    def error(self) -> MobileboxError | None:
        """The failed action's error. Actions before it stay applied."""
        return next((r.error for r in self.results if not r.ok), None)


@dataclass
class App:
    package: str
    version_code: int | None = None
    version_name: str | None = None


@dataclass
class WatchLink:
    url: str  # read-only live view; its access token is in the fragment
    expires_at: str
    command: str  # npx mobilebox watch "<url>": opens the view in its own window


class Mobilebox:
    """A Mobilebox REST client.

    api_key: defaults to MOBILESANDBOX_API_KEY. base_url: defaults to MOBILESANDBOX_URL
    or https://mobilebox.dev. user_agent: prefixed to mobilebox-python/<version>.
    """

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: float = 65,
        user_agent: str | None = None,
    ):
        self.api_key = api_key or os.environ.get("MOBILESANDBOX_API_KEY", "")
        if not self.api_key:
            raise MobileboxError(
                "missing_api_key",
                "No API key.",
                "Set MOBILESANDBOX_API_KEY or pass api_key; create a key at https://mobilebox.dev/dashboard.",
            )
        self.base_url = (base_url or os.environ.get("MOBILESANDBOX_URL") or DEFAULT_BASE_URL).rstrip("/")
        self.timeout = timeout
        ua = f"mobilebox-python/{__version__}"
        self.user_agent = f"{user_agent} {ua}" if user_agent else ua

    def __repr__(self) -> str:  # never show the key
        return f"Mobilebox(base_url={self.base_url!r})"

    # -- transport ----------------------------------------------------------------

    def request(
        self,
        method: str,
        path: str,
        body: Any = None,
        headers: dict[str, str] | None = None,
        raw: bool = False,
    ) -> Any:
        """Call any endpoint. Returns parsed JSON, or bytes with raw=True."""
        req = urllib.request.Request(self.base_url + path, method=method)
        req.add_header("Authorization", "Bearer " + self.api_key)
        req.add_header("User-Agent", self.user_agent)
        req.add_header("Accept", "application/json")
        if isinstance(body, bytes):
            req.data = body
            req.add_header("Content-Type", "application/octet-stream")
        elif body is not None:
            req.data = json.dumps(body).encode()
            req.add_header("Content-Type", "application/json")
        for name, value in (headers or {}).items():
            req.add_header(name, value)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                data = res.read()
        except urllib.error.HTTPError as e:
            text = e.read().decode(errors="replace")
            try:
                detail = json.loads(text)["error"]
            except (ValueError, KeyError, TypeError):
                detail = {"code": f"http_{e.code}", "message": text[:500] or str(e.reason), "retryable": e.code >= 500}
            if e.headers.get("Retry-After", "").isdigit():
                detail.setdefault("retry_after", int(e.headers["Retry-After"]))
            raise MobileboxError._from(detail, e.code) from None
        except OSError as e:  # DNS, refused, reset, timeout
            raise MobileboxError(
                "network_error", f"{method} {path}: {e}", "Retry the same request; for create, reuse the idempotency key.", True
            ) from None
        if raw:
            return data
        return json.loads(data) if data else None

    # -- phones -------------------------------------------------------------------

    def list_phones(self) -> list[Phone]:
        return [_build(Phone, p) for p in self.request("GET", "/v1/phones")["data"]]

    def get_phone(self, phone_id: str) -> Phone:
        return _build(Phone, self.request("GET", f"/v1/phones/{_q(phone_id)}"))

    def create_phone(
        self,
        idempotency_key: str | None = None,
        wait: bool = True,
        wait_timeout: float = 180,
        **options: Any,
    ) -> Phone:
        """Create a phone and, with wait=True, return it once ready.

        options: name, platform ("android"/"ios"), device ("cloud"/"real"), country, city,
        network, idle_timeout, max_duration, timezone, locale, location, proxy, task.
        A retry with the same idempotency_key and options returns the same phone, never a
        second one; one is generated when you pass none, and retryable errors retry with it.
        """
        key = idempotency_key or str(uuid.uuid4())
        query = f"?wait=ready&timeout={_WAIT}" if wait else ""
        for attempt in range(3):
            try:
                data = self.request("POST", "/v1/phones" + query, options, {"Idempotency-Key": key})
                break
            except MobileboxError as e:
                if attempt == 2 or not e.retryable or e.code in ("phone_limit", "box_full"):
                    raise
                time.sleep(min(3 if e.retry_after is None else e.retry_after, 30))
        phone = _build(Phone, data)
        return self.wait_ready(phone, wait_timeout) if wait else phone

    def start_phone(self, phone_id: str, wait: bool = True, wait_timeout: float = 180, **options: Any) -> Phone:
        """Resume a parked phone. options: idle_timeout, max_duration."""
        query = f"?wait=ready&timeout={_WAIT}" if wait else ""
        phone = _build(Phone, self.request("POST", f"/v1/phones/{_q(phone_id)}/start{query}", options))
        return self.wait_ready(phone, wait_timeout) if wait else phone

    def wait_ready(self, phone: Phone, timeout: float = 180) -> Phone:
        """Poll until the phone leaves creating/starting. Raises unless it is ready."""
        deadline = time.monotonic() + timeout
        while phone.status in ("creating", "starting"):
            if time.monotonic() > deadline:
                raise MobileboxError(
                    "not_ready", f"{phone.id} is still {phone.status} after {timeout:.0f}s.", "Call wait_ready again with the same phone.", True
                )
            phone = _build(Phone, self.request("GET", f"/v1/phones/{_q(phone.id)}?wait=ready&timeout={_WAIT}"))
        if phone.status != "ready":
            f = phone.failure or {}
            raise MobileboxError(
                f.get("code", "not_ready"),
                f.get("message", f"{phone.id} is {phone.status}."),
                "Delete this phone and create a new one with a new idempotency key.",
            )
        return phone

    def park_phone(self, phone_id: str) -> Phone:
        """Shut down and stop billing; apps, data and logins stay for start_phone."""
        return _build(Phone, self.request("POST", f"/v1/phones/{_q(phone_id)}/park"))

    def delete_phone(self, phone_id: str) -> None:
        """Delete the phone and everything on it."""
        self.request("DELETE", f"/v1/phones/{_q(phone_id)}")

    # -- screen -------------------------------------------------------------------

    def observe(self, phone_id: str) -> Screen:
        return Screen._from(self.request("GET", f"/v1/phones/{_q(phone_id)}/observe"))

    def act(self, phone_id: str, actions: list[dict]) -> ActResult:
        """Run 1-20 actions in order; stops at the first failure.

        A failed action is not an exception: check result.ok / result.error, then
        continue from result.screen. Actions before the failure stay applied.
        """
        data = self.request("POST", f"/v1/phones/{_q(phone_id)}/actions", {"actions": actions})
        results = [
            ActionResult(r.get("type", ""), bool(r.get("ok")), MobileboxError._from(r["error"]) if r.get("error") else None)
            for r in data["results"]
        ]
        return ActResult(results, Screen._from(data["screen"]))

    def screenshot(self, phone_id: str) -> bytes:
        """The screen as PNG bytes."""
        return self.request("GET", f"/v1/phones/{_q(phone_id)}/screenshot", raw=True)

    def watch(self, phone_id: str) -> WatchLink:
        """A read-only live view link for a person: each action drawn on the screen."""
        return _build(WatchLink, self.request("POST", f"/v1/phones/{_q(phone_id)}/view"))

    # -- apps ---------------------------------------------------------------------

    def install_app(
        self,
        phone_id: str,
        url: str | None = None,
        file: str | os.PathLike | bytes | None = None,
        grant_permissions: bool = False,
    ) -> App:
        """Install or update an APK, .apks or .xapk from a public URL or a local file/bytes."""
        if (url is None) == (file is None):
            raise ValueError("Pass exactly one of url or file")
        path = f"/v1/phones/{_q(phone_id)}/apps?grant_permissions={'true' if grant_permissions else 'false'}"
        if url is not None:
            body: Any = {"url": url}
        else:
            body = file if isinstance(file, bytes) else Path(file).read_bytes()
        return _build(App, self.request("POST", path, body))


def _q(phone_id: str) -> str:
    return urllib.parse.quote(phone_id, safe="")
