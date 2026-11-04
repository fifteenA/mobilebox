"""Minimal Mobilebox REST client. Python 3.9+ (tested on 3.14), standard library only.

    export MOBILESANDBOX_API_KEY=...   # from https://mobilebox.dev/dashboard
    python3 mobilebox.py

Creates a phone, opens Settings > Display, reads the brightness level, deletes the phone.
"""
import json
import os
import signal
import sys
import time
import urllib.error
import urllib.request
import uuid


class MobileboxError(Exception):
    def __init__(self, message, retryable=False):
        super().__init__(message)
        self.retryable = retryable


class Mobilebox:
    def __init__(self, key=None, base=None):
        self.key = key or os.environ.get("MOBILESANDBOX_API_KEY")
        if not self.key:
            raise MobileboxError("Set MOBILESANDBOX_API_KEY")
        self.base = (base or os.environ.get("MOBILESANDBOX_URL") or "https://mobilebox.dev").rstrip("/")

    def call(self, method, path, body=None, headers=None):
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(self.base + path, data=data, method=method)
        req.add_header("Authorization", "Bearer " + self.key)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        for name, value in (headers or {}).items():
            req.add_header(name, value)
        try:
            with urllib.request.urlopen(req, timeout=65) as res:
                text = res.read().decode()
        except urllib.error.HTTPError as e:
            # Every error body has error.code, error.message and error.next (what to do instead).
            raise MobileboxError(f"{method} {path} -> {e.code} {e.read().decode()}", e.code >= 500) from None
        except OSError as e:  # network error or timeout
            raise MobileboxError(f"{method} {path} -> {e}", True) from None
        return json.loads(text) if text else None

    def create(self, idempotency_key=None, **options):
        """Returns the phone, possibly still "creating": pass it to wait_ready().

        Retrying with the same idempotency key returns the same phone, so a lost response
        cannot leak a second one.
        """
        headers = {"Idempotency-Key": idempotency_key or str(uuid.uuid4())}
        for attempt in (1, 2, 3):
            try:
                return self.call("POST", "/v1/phones?wait=ready&timeout=50", options, headers)
            except MobileboxError as e:
                if attempt == 3 or not e.retryable:
                    raise
                time.sleep(3)

    def wait_ready(self, phone, deadline_s=180):
        deadline = time.time() + deadline_s
        while phone["status"] in ("creating", "starting"):
            if time.time() > deadline:
                raise MobileboxError(f"{phone['id']} not ready after {deadline_s}s")
            phone = self.call("GET", f"/v1/phones/{phone['id']}?wait=ready&timeout=50")
        if phone["status"] != "ready":
            raise MobileboxError(json.dumps(phone))
        return phone

    def observe(self, phone_id):
        return self.call("GET", f"/v1/phones/{phone_id}/observe")

    def act(self, phone_id, actions):
        """Run 1-20 actions. Raises on the first failed action; returns the new screen."""
        result = self.call("POST", f"/v1/phones/{phone_id}/actions", {"actions": actions})
        for item in result["results"]:
            if not item["ok"]:  # HTTP 200 can still carry a failed action
                raise MobileboxError(f"{json.dumps(item['error'])}\n{result['screen']['text']}")
        return result["screen"]

    def park(self, phone_id):
        return self.call("POST", f"/v1/phones/{phone_id}/park")

    def delete(self, phone_id):
        self.call("DELETE", f"/v1/phones/{phone_id}")


def main():
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))  # a cancelled job still runs the finally below
    mb = Mobilebox()
    phone = mb.create(name="python-example", idle_timeout=120, max_duration=300)
    try:
        mb.wait_ready(phone)
        print("ready:", phone["id"])
        screen = mb.act(phone["id"], [
            {"type": "open_app", "package": "com.android.settings"},
            {"type": "scroll_to", "text": "Display"},
            {"type": "tap", "target": {"text": "Display"}},
            {"type": "wait_for", "text": "Brightness level"},
        ])
        print(screen["text"])
        row = next((e for e in screen["elements"] if e.get("text") == "Brightness level"), None)
        if row is None:
            raise MobileboxError("Expected a 'Brightness level' row on the Display screen")
        print("ok: brightness level is", row.get("summary"))
    finally:
        mb.delete(phone["id"])  # always clean up; park() instead keeps apps and data
        print("deleted:", phone["id"])


if __name__ == "__main__":
    try:
        main()
    except MobileboxError as e:
        sys.exit(f"error: {e}")
