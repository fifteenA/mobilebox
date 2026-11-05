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


**2026-11-05**, in CI's production smoke ([run 42114977012](https://github.com/fifteenA/mobilebox/actions/runs/42114977012)), ubuntu-latest, curl + jq.

| Example | Command | Result | Time |
|---|---|---|---|
| Live view | `examples/watch/watch.sh` (`CI` set, so the view is printed, not opened) | `live view: https://mobilebox.dev/watch#v1.…`, `ok: Settings > Display is open`, deleted | 26 s |
| Keyless MCP check | `node scripts/check-mcp.mjs` | initialize, tools/list (13 tools, `watch_phone` added), README table and `server.json` match | 0.6 s |

**2026-11-05**, framework integrations ([integrations/](integrations)), each run once against production from Linux, Python 3.12 / Node 24.22. Models came through an OpenAI-compatible endpoint (`OPENAI_BASE_URL`, `MODEL`), except the Claude Agent SDK (its default Claude model). Framework versions: openai-agents 0.24.0, langgraph 1.2.20 + langchain-mcp-adapters 0.3.2, crewai 1.15.35, browser-use 0.13.14, @mastra/core 1.82.0 + @mastra/mcp 2.8.0, ai 7.0.163 + @ai-sdk/mcp 2.0.91, @anthropic-ai/claude-agent-sdk 0.3.318.

| Example | Model | Result | Time |
|---|---|---|---|
| OpenAI Agents SDK | GLM-5.3 (Chat Completions) | `Brightness level: 83%`, deleted | 37.9 s |
| LangGraph | GLM-5.3 | `Brightness level: 83%`, deleted | 30.7 s |
| CrewAI | GLM-5.3 (LiteLLM) | `The brightness level ... is 83%`, deleted | 36 s |
| browser-use | Kimi K3.1 Pro | phone: Android 14 (Settings > About phone); web: released 4 October 2023 (Wikipedia), deleted | 174 s |
| Mastra | GLM-5.3 (`togetherai/…`) | `Brightness level: 83%`, deleted | 33 s |
| Vercel AI SDK | GLM-5.3 | `Brightness level: 83%`, deleted | 32 s |
| Claude Agent SDK | Claude (default) | `The brightness level is 83%`, deleted | 35 s |

Times include boot and the model's own latency. The CrewAI run used the `act` schema with swipe points as plain arrays (CrewAI drops tools whose schema has tuple-form `items`), served on production with the next release.

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
