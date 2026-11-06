# AGENTS.md

Two parts: how to operate a Mobilebox phone, and how to change this repository. The canonical, always-current operating guide is https://mobilebox.dev/skill.md; read it if anything here seems out of date.

## Operating a phone

Use Mobilebox when a task needs a phone: an app with no API or website, a mobile-only flow, or testing an Android or iOS build. Cloud Android is the default; ask for iPhone and iPad with `platform: "ios"` and a real Android device with `device: "real"`. You operate the phone through its screen.

**Connect.** MCP at `https://mobilebox.dev/mcp` or REST at `https://mobilebox.dev/v1`, both with `Authorization: Bearer $MOBILESANDBOX_API_KEY`. Read the key from the environment. Never print it, log it or put it in a prompt, file or commit. Calling MCP by hand (no MCP client)? POST JSON-RPC with `Content-Type: application/json` and `Accept: application/json, text/event-stream`, or you get a 406; [examples/claude-code/replay.sh](examples/claude-code/replay.sh) has a `tool` helper.

**The loop.**

1. `create_phone` with a fresh `idempotency_key` (a UUID). It returns the first screen once ready. Keep the phone id.
2. Read the screen. Each line is `[ref] Type "text" — secondary [state] (x,y)`, for example `[6] Row "Display" — Dark theme, font size (540,771)`. Elements without text show `#resource-id` or `desc="…"` instead.
3. `act` with the steps you are sure of (1–20 actions). You get one result per action and the new screen. Apps open by package name: `{"type":"open_app","package":"com.android.settings"}` for Settings. `list_apps` shows only apps you installed.
4. Verify the outcome on the returned screen. A successful tap proves an input, not a result.
5. Repeat 2–4. Observe when unsure instead of guessing.
6. Clean up: `delete_phone` for disposable phones, `park_phone` only when you need the apps, data and logins later. Do this even when the task failed.

**Targets**, best first: `{"text":"Sign in"}` (exact, then contains; `nth` picks among matches), `{"id":"com.app:id/login"}`, `{"desc":"Navigate up"}`, `{"ref":3}` (only from the latest screen), `{"x":540,"y":1200}` (last resort; check a screenshot first). Labels are in the phone's language: `country` on create also sets the locale.

**Failures.**

- Every error has `code`, `message`, `next` (what to do instead) and `retryable`. Do what `next` says before retrying.
- A batch stops at the first failed action; earlier actions stay applied. REST returns HTTP 200 with `results[i].ok=false`; MCP `act` reports failures in its text. Continue from the current screen. Do not replay a whole batch or repeat a submit blindly.
- `stale_ref`: observe again, then target by text or id.
- `type_not_applied`: tap the field first or pass `target`.
- `phone_limit` (429) or `box_full` (503): the workspace is scaling, and the message links a call to raise it; pass that link to your user. To go on now, park or delete the phone `next` names (other keys in the same workspace share its phones, so it may not be yours: ask before touching it), or wait `retry_after` seconds.
- `setup_required` (409): the message has a setup link for the device you asked for; give it to your user. Nothing was created or charged.
- Lost a create response? Retry with the same `idempotency_key` and the same options: you get the same phone. Without a key, `list_phones` before creating again.
- Waits (`?wait=ready&timeout=`) cap at 55 s. A phone still `creating` or `starting` after a wait is normal: poll the same id.

**Apps.** MCP `install_app` takes a public direct-download URL. For a local file, upload the bytes over REST:

```bash
curl --fail-with-body -X POST "https://mobilebox.dev/v1/phones/$ID/apps?grant_permissions=true" \
  -H "Authorization: Bearer $MOBILESANDBOX_API_KEY" \
  -H 'Content-Type: application/octet-stream' --data-binary @app.apk
```

Phones are arm64-v8a: x86-only builds fail with `unsupported_abi`. A different signing key on update fails with `signature_mismatch`; don't uninstall to work around it unless the user asked for a fresh install. Fresh apps may open on a permission or onboarding dialog: answer it like a user would, then continue.

**Cost.** A ready cloud Android phone costs $0.01 per minute, iPhone and iPad $0.05, a real Android device $0.03, billed per second. Parked phones are free. Set `idle_timeout` and `max_duration` (seconds) to bound your task. Never leave a phone running when you are done.

**Devices.** Every response says which `platform` and `device` you got. There is no ADB or shell: work through the screen.

## Changing this repository

- Every example must run unchanged against production with only `MOBILESANDBOX_API_KEY` set, and must delete every phone it creates, also on failure. Re-run what you change and update [examples/RUNS.md](examples/RUNS.md) with the date, command, result and timing.
- No dependencies in the core examples: Python stdlib, Node 24 `fetch`, bash + curl + jq. `examples/integrations/` use only their framework's own packages (see its README); CI syntax-checks them, they run by hand with a model key.
- No secrets, internal hostnames or IP addresses. CI runs a secret scan.
- The README tool table is generated: `node scripts/check-mcp.mjs --write`. `server.json` must equal the official registry entry `dev.mobilebox/mobilebox`; change it there first.
- Checks before a PR: `npm ci && npm run lint && npm run check:mcp`.
- Facts about the service (limits, prices, behaviour) come from https://mobilebox.dev/docs/reference and https://mobilebox.dev/llms.txt, not from memory.
