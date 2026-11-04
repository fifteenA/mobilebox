# Recorded runs

Every example, run unchanged against production (`https://mobilebox.dev`) with only `MOBILESANDBOX_API_KEY` set. After each run, `GET /v1/phones` returned no phones.

**2026-11-04**, Node 24.22, Python 3.14, curl + jq on Linux. Test APK: [Editor 1.98](https://f-droid.org/packages/org.billthefarmer.editor/) from F-Droid.

| Example | Command | Result | Time |
|---|---|---|---|
| curl | `examples/curl/walkthrough.sh` | created, observed, Settings > Display, `screen.png`, deleted | 24.7 s |
| Python | `python3 examples/python/mobilebox.py` | `ok: brightness level is 83%`, deleted | 29.6 s |
| TypeScript | `node examples/typescript/mobilebox.ts` | `ok: brightness level is 83%`, deleted | 26.1 s |
| Claude Code replay | `examples/claude-code/replay.sh editor.apk org.billthefarmer.editor "Access all files"` | uploaded 1.98, opened, `PASS: "Access all files" is on screen`, deleted | 21.6 s |
| Claude Code replay, failure path | same, label `Untitled.txt` (not on the first screen) | `2. wait_for failed — wait_timeout`, exit 1, deleted | not timed |
| CI smoke | `node examples/github-actions/smoke.mjs` (label `Access all files`) | `Smoke passed: org.billthefarmer.editor 1.98 shows "Access all files"`, deleted | 21.5 s |
| CI smoke, failure path | same, label `Untitled.txt` | exit 1 with `wait_timeout` and the screen text, deleted | 51.8 s |
| CI smoke, cancelled | same, `kill -INT` after 35 s (like a cancelled job) | exit 130, `Deleted ph_…` from the signal handler, list empty afterwards | 35 s |
| Time to a ready phone | `POST /v1/phones?wait=ready` with an `Idempotency-Key`, then `DELETE`, three times in a row | ready, deleted | 18.1 s, 18.3 s, 18.8 s |
| Keyless MCP check | `node scripts/check-mcp.mjs` | initialize, tools/list (12 tools), README table and `server.json` match | 0.6 s |

Times include boot (the phone is free until ready) and are measured on the calling machine, network included. Not run here: Claude Code itself on the prompt in [claude-code/README.md](claude-code/README.md); the replay sends the same tool calls. The CI `smoke` job runs all of the above on every push to `main` once the `MOBILESANDBOX_API_KEY` secret is set.

<details>
<summary>Python output</summary>

```text
ready: ph_on7c4dcbzlnk
app: com.android.settings
[1] List #com.android.settings:id/content_parent (540,1137)
[2] View desc="Display" (540,266)
[3] Button desc="Navigate up" (73,136)
[4] List #com.android.settings:id/recycler_view (540,1403)
[5] Text "Brightness" (550,621)
[6] Row "Brightness level" — 83% (540,771)
[7] Text "Lock display" (550,962)
[8] Row "Lock screen" — Show all notification content (540,1112)
[9] Row "Screen timeout" — Not set (540,1318)
[10] Text "Appearance" (550,1509)
[11] Button (540,1659)
[12] Switch desc="Dark theme" (943,1659)
[13] Text "Dark theme" (198,1633)
[14] Text "Will never turn on automatically" (320,1694)
[15] Row "Display size and text" (540,1839)
[16] Text "Color" (550,2005)
[17] Row "Colors" (540,2129)
[18] Text "Other display controls" (550,2272)
ok: brightness level is 83%
deleted: ph_on7c4dcbzlnk
```
</details>
