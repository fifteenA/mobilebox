<a href="https://mobilebox.dev">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/readme/banner-dark.png">
    <img src=".github/readme/banner-light.png" alt="Mobilebox: mobile sandboxes for your AI agents" width="100%">
  </picture>
</a>

<p align="center"><b>Cloud Android phones your agent drives over MCP or REST.</b><br>It reads the screen as numbered elements, then taps, types and installs apps.</p>

<p align="center">
  <a href="https://mobilebox.dev">Website</a> ·
  <a href="https://mobilebox.dev/docs">Docs</a> ·
  <a href="#quickstart">Quickstart</a> ·
  <a href="https://registry.modelcontextprotocol.io/v0/servers?search=dev.mobilebox/mobilebox">MCP registry</a>
</p>

<p align="center">
  <a href="https://github.com/fifteenA/mobilebox/actions/workflows/ci.yml"><img src="https://github.com/fifteenA/mobilebox/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://glama.ai/mcp/connectors/dev.mobilebox/mobilebox"><img src="https://glama.ai/mcp/connectors/dev.mobilebox/mobilebox/badges/score.svg" alt="Rated A on Glama"></a>
  <a href="https://registry.modelcontextprotocol.io/v0/servers?search=dev.mobilebox/mobilebox"><img src="https://img.shields.io/badge/MCP_registry-dev.mobilebox%2Fmobilebox-2a46d1" alt="Official MCP registry: dev.mobilebox/mobilebox"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2a46d1" alt="MIT license"></a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/readme/demo-dark.webp">
    <img src=".github/readme/demo-light.webp" alt="An agent finds the height of the Matterhorn on Wikipedia on a Mobilebox phone: 8 MCP calls, done in 24.6 s, answer 4,478 m (14,692 ft)" width="820">
  </picture>
  <br><sub>Phone screens are unedited API screenshots from one recorded run; steps and times are its MCP calls, from the home screen on. Playback shortened.</sub>
</p>

<p align="center">
  <picture>
    <source media="(max-width: 600px) and (prefers-color-scheme: dark)" srcset=".github/readme/stats-dark-narrow.png">
    <source media="(max-width: 600px)" srcset=".github/readme/stats-light-narrow.png">
    <source media="(prefers-color-scheme: dark)" srcset=".github/readme/stats-dark.png">
    <img src=".github/readme/stats-light.png" alt="~18 s to a ready phone · 12 MCP tools · $0.01 per phone-minute · Android 14 arm64 phones · park and resume, apps and logins kept" width="820">
  </picture>
  <br><sub>Ready time: create to ready, three runs on 2026-11-04 (<a href="examples/RUNS.md">RUNS.md</a>).</sub>
</p>

<p align="center">Works with &nbsp;
  <img src=".github/readme/claude.svg" width="16" height="16" alt="">&nbsp;Claude&nbsp;Code &nbsp;
  <img src=".github/readme/openai.svg" width="16" height="16" alt="">&nbsp;Codex &nbsp;
  <img src=".github/readme/cursor.svg" width="16" height="16" alt="">&nbsp;Cursor &nbsp;
  <img src=".github/readme/mcp.svg" width="16" height="16" alt="">&nbsp;any&nbsp;MCP&nbsp;client
</p>

- **Listed** in the [official MCP registry](https://registry.modelcontextprotocol.io/v0/servers?search=dev.mobilebox/mobilebox) as `dev.mobilebox/mobilebox`, tool definitions rated **A** on [Glama](https://glama.ai/mcp/connectors/dev.mobilebox/mobilebox).
- **Checked on every deploy:** an end-to-end run on production that uses only the public docs (create, install, tap, type, park, resume, delete over REST and MCP).

## Quickstart

**1. Get a key.** [Sign up with GitHub](https://mobilebox.dev/signup) ($2 of credit, 200 phone-minutes) and create an agent key in the [dashboard](https://mobilebox.dev/dashboard).

```bash
export MOBILESANDBOX_API_KEY=...   # keep it in your shell or secret manager, never in a prompt
```

**2. Add Mobilebox to your agent.**

```bash
claude mcp add --transport http mobilebox https://mobilebox.dev/mcp \
  --header "Authorization: Bearer $MOBILESANDBOX_API_KEY"
```

<details>
<summary>Codex, Cursor, a shared <code>.mcp.json</code>, other clients</summary>

**Codex**, `~/.codex/config.toml`:

```toml
[mcp_servers.mobilebox]
url = "https://mobilebox.dev/mcp"
bearer_token_env_var = "MOBILESANDBOX_API_KEY"
```

**Cursor**, `.cursor/mcp.json`:

```json
{ "mcpServers": { "mobilebox": { "url": "https://mobilebox.dev/mcp", "headers": { "Authorization": "Bearer ${env:MOBILESANDBOX_API_KEY}" } } } }
```

**Claude Code, shared through a committed `.mcp.json`** without the key in it. Keep `"type": "http"`, or Claude Code treats the entry as a stdio server:

```json
{ "mcpServers": { "mobilebox": { "type": "http", "url": "https://mobilebox.dev/mcp", "headers": { "Authorization": "Bearer ${MOBILESANDBOX_API_KEY}" } } } }
```

**Other clients:** any MCP client with Streamable HTTP and a custom header. Hand-written clients also send `Accept: application/json, text/event-stream`. The registry entry is [`server.json`](server.json).
</details>

**3. Give it a task.**

> Use Mobilebox. Create a phone, open Settings and tell me which Android version it runs. Delete the phone at the end, even if a step fails.

Next: let your agent [test the APK you just built](examples/claude-code), or run the same check [in CI](examples/github-actions). No MCP client? [curl/walkthrough.sh](examples/curl/walkthrough.sh) does the whole loop over REST ([OpenAPI](https://mobilebox.dev/openapi.json), [reference](https://mobilebox.dev/docs/reference)).

## Tools

Phones, apps and the screen over MCP; REST adds binary APK upload, account balance and billed sessions. Without a key, `/mcp` answers `initialize`, `tools/list` and `ping`; every `tools/call` needs the key.

<details>
<summary>All tools and actions (generated from the live <code>tools/list</code>; CI fails when it drifts)</summary>

<!-- tools:start (generated by scripts/check-mcp.mjs --write) -->
| Tool | What it does | Arguments (`?` = optional) |
|---|---|---|
| `list_phones` | List this project's phones and their status. | – |
| `create_phone` | Create a phone, wait until it is ready and return its first screen. | `platform?`, `device?`, `name?`, `idle_timeout?`, `max_duration?`, `country?`, `idempotency_key?` |
| `start_phone` | Resume a parked phone. | `phone_id` |
| `park_phone` | Park a phone: shuts it down and stops billing. | `phone_id` |
| `delete_phone` | Delete a phone and everything on it. | `phone_id` |
| `set_device` | Set where the phone is: timezone (IANA), locale (BCP-47), GPS location, and proxy (socks5://user:pass@host:port; all traffic leaves through it, null = direct). | `phone_id`, `timezone?`, `locale?`, `location?`, `proxy?` |
| `install_app` | Install or update an app from a public download URL: an APK (arm64-v8a or universal) or a split bundle (.apks/.xapk; the splits this phone needs are picked). | `phone_id`, `url`, `grant_permissions?` |
| `list_apps` | Apps the user installed on this phone. | `phone_id` |
| `uninstall_app` | Uninstall an app and delete its data. | `phone_id`, `package` |
| `observe` | Read the current screen as a numbered element list. | `phone_id` |
| `act` | Run 1–20 actions in order, stop at the first failure, return results and the new screen. | `phone_id`, `actions` |
| `screenshot` | PNG of the screen, for content the element list cannot show (images, maps, games). | `phone_id` |
<!-- tools:end -->

Actions for `act`: `tap`, `long_press`, `swipe`, `scroll`, `scroll_to`, `type`, `key`, `back`, `home`, `open_app`, `close_app`, `wait`, `wait_for`. Targets: `{"text":"OK"}` (best default), `{"ref":3}`, `{"id":"com.app:id/login"}`, `{"desc":"Navigate up"}`, `{"x":540,"y":1200}`. REST only: `POST /v1/phones/{id}/apps` (APK upload), `GET /v1/account`, `GET /v1/phones/{id}/sessions`. Full vocabulary: [API reference](https://mobilebox.dev/docs/reference).
</details>

## Examples

Each creates a phone, checks one outcome and deletes the phone, also when the check fails. All ran against production on 2026-11-04 ([RUNS.md](examples/RUNS.md)).

| Example | Shows | Needs |
|---|---|---|
| [curl/walkthrough.sh](examples/curl/walkthrough.sh) | create, observe, act, screenshot, delete | bash, curl, jq |
| [python/mobilebox.py](examples/python/mobilebox.py) | minimal client + Settings check | Python 3.9+, stdlib |
| [typescript/mobilebox.ts](examples/typescript/mobilebox.ts) | minimal client + Settings check | Node 24 |
| [claude-code/](examples/claude-code) | Claude Code tests the APK you just built | an arm64 or universal APK |
| [github-actions/](examples/github-actions) | APK smoke test in a workflow | a repo secret with your key |

## Pricing

| Device | Price |
|---|---|
| Cloud Android 14 phone (arm64) | $0.01 per phone-minute |
| iPhone and iPad (`platform: "ios"`) | $0.05 per phone-minute |
| Real Android device (`device: "real"`) | $0.03 per phone-minute |
| Dedicated devices | from $79 per month |

Billed per second while a phone is ready, with a one-minute minimum per session. Boot time and parked phones are free. New accounts start with $2 of credit; add more from the dashboard. Over 100 devices: [contact sales](https://calendly.com/mustafa-yenler/30min). [Pricing](https://mobilebox.dev/pricing).

<details>
<summary>Requests and sessions</summary>

- Up to 20 actions per `act` call, 256 KB of JSON per request, waits up to 55 s per call, APK uploads up to 300 MiB.
- Phones park after 5 idle minutes (`idle_timeout`, 60–3,600 s) and after 15 minutes of running (`max_duration`, up to 3 hours).
- All keys of a workspace (called *project* in the API) share its phones and balance.
- Apps with strict root or integrity checks (e.g. Play Integrity) may not run on a cloud phone; use a real Android device for those.
</details>

## Security

Each phone is an isolated Android sandbox on Mobilebox servers in Germany, reachable only through the API. Keys are per workspace, stored hashed and never logged. Mobilebox runs no model: screen content goes only to your agent.

<details>
<summary>Security model</summary>

- **Your key is a bearer token for one workspace.** Every key in a workspace can see and control all of its phones and spend its balance. For a hard boundary between two agents or customers, use separate workspaces, not separate keys.
- **Agent keys only control phones.** They cannot sign into the dashboard or create other keys. Revoke or rotate keys in the dashboard.
- **The phone is a sandbox, not your machine.** Each phone is a cloud Android 14 phone on Mobilebox servers in Nuremberg, Germany. There is no public ADB or shell. Phones can reach the internet (or the SOCKS5 proxy you set) but not each other or Mobilebox's internal network.
- **Screen content goes to your agent, and from there to its model provider.** Don't put data on a phone that you aren't allowed to send to your agent's model.
- **We don't look into phones** except to fix a fault you report or when the law requires it. Park keeps apps, data and logins; delete removes them. Deleting a phone does not log out sessions on third-party servers.
- Details: [privacy policy](https://mobilebox.dev/privacy), [key security](https://mobilebox.dev/blog/android-api-key-security). Found a vulnerability? See [SECURITY.md](SECURITY.md).
</details>

## For agents

[AGENTS.md](AGENTS.md) is the operating guide: the loop, targets, error recovery and cleanup. Live versions: [skill.md](https://mobilebox.dev/skill.md), [llms.txt](https://mobilebox.dev/llms.txt).

---

Questions: hello@mobilebox.dev, or [open an issue](../../issues). [MIT](LICENSE) for this repository; the hosted service is covered by its [terms](https://mobilebox.dev/terms).
