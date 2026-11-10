# mobilebox (Python)

**Python client for [Mobilebox](https://mobilebox.dev): cloud Android phones your agent drives over REST.** Create a phone, read the screen as numbered elements, tap and type, install apps, delete the phone. Standard library only, Python 3.10+, typed.

```bash
pip install mobilebox
export MOBILESANDBOX_API_KEY=...   # from https://mobilebox.dev/dashboard; never in a prompt or a commit
```

```python
from mobilebox import Mobilebox

mb = Mobilebox()
phone = mb.create_phone(name="settings-check", idle_timeout=120, max_duration=300)
try:
    result = mb.act(phone.id, [
        {"type": "open_app", "package": "com.android.settings"},
        {"type": "scroll_to", "text": "Display"},
        {"type": "tap", "target": {"text": "Display"}},
        {"type": "wait_for", "text": "Brightness level"},
    ])
    if not result.ok:
        raise result.error            # has .code and .next: what to do instead
    print(result.screen.find("Brightness level").summary)
finally:
    mb.delete_phone(phone.id)         # always clean up; park_phone() keeps apps and logins
```

`create_phone` returns once the phone is ready (about 18 s). A new account has $2 of credit; a cloud phone costs $0.01 per minute while ready, parked phones are free.

## Methods

| Method | Does | REST |
|---|---|---|
| `create_phone(idempotency_key=None, wait=True, **options)` | Create a phone; with `wait`, return it ready. Options: `name`, `platform`, `device`, `country`, `city`, `network`, `idle_timeout`, `max_duration`, `timezone`, `locale`, `location`, `proxy`, `task` | `POST /v1/phones` |
| `list_phones()`, `get_phone(id)` | Phones in this workspace, one phone | `GET /v1/phones[/{id}]` |
| `park_phone(id)`, `start_phone(id)` | Shut down and stop billing; resume with apps and data | `POST /v1/phones/{id}/park`, `/start` |
| `delete_phone(id)` | Delete the phone and everything on it | `DELETE /v1/phones/{id}` |
| `observe(id)` | The screen: `Screen(text, app, elements)` | `GET /v1/phones/{id}/observe` |
| `act(id, actions)` | Run 1–20 actions, stop at the first failure: `ActResult(results, screen)` | `POST /v1/phones/{id}/actions` |
| `screenshot(id)` | PNG bytes | `GET /v1/phones/{id}/screenshot` |
| `install_app(id, url=… \| file=…, grant_permissions=False)` | Install an APK, `.apks` or `.xapk` from a public URL, a path or bytes | `POST /v1/phones/{id}/apps` |
| `watch(id)` | A read-only live view link for a person | `POST /v1/phones/{id}/view` |
| `request(method, path, body)` | Any other endpoint, with the same auth and errors | |

Actions and targets: `{"type": "tap", "target": {"text": "Sign in"}}`, `{"type": "type", "text": "hello"}`, `scroll_to`, `wait_for`, `back`, `home`, `open_app` and more in the [API reference](https://mobilebox.dev/docs/reference).

## Errors

Every failure raises `MobileboxError` with `code`, `message`, `next` (what to do instead), `retryable`, `retry_after` and the HTTP `status`. Do what `next` says before retrying.

- A failed action is not an exception. `act` returns `result.ok == False` and `result.error`; earlier actions stay applied. Continue from `result.screen`, don't replay the batch.
- `create_phone` sends an `Idempotency-Key` (a UUID unless you pass one) and retries retryable errors with it, so a lost response never makes a second phone. Pass your own key to retry across processes.
- `phone_limit` (429) and `box_full` (503) are not retried: park or delete the phone `next` names, or wait `retry_after` seconds.

## Configuration

| | Default |
|---|---|
| `api_key` | `MOBILESANDBOX_API_KEY` |
| `base_url` | `MOBILESANDBOX_URL`, else `https://mobilebox.dev` |
| `timeout` | 65 s per request (server waits cap at 55 s) |
| `user_agent` | `mobilebox-python/<version>`; yours goes in front of it |

For agent frameworks: [`langchain-mobilebox`](https://github.com/fifteenA/mobilebox/tree/main/packages/python/langchain-mobilebox) wraps this client as LangChain tools. Any MCP client can use `https://mobilebox.dev/mcp` directly ([setup](https://github.com/fifteenA/mobilebox#quickstart)).

## Development

```bash
pip install -e . pytest
pytest                                      # offline, against a local stub
MOBILEBOX_LIVE=1 MOBILESANDBOX_API_KEY=... pytest -m live   # one real phone, deleted at the end (about $0.01)
```

MIT © fifteenA, Inc.
