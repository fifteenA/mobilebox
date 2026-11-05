#!/usr/bin/env bash
# Watch while your agent works: create a phone, open its live view, run a few steps you can follow, delete the phone.
#   export MOBILESANDBOX_API_KEY=...   # from https://mobilebox.dev/dashboard
#   ./watch.sh
set -euo pipefail
MSB=${MOBILESANDBOX_URL:-https://mobilebox.dev}
AUTH="Authorization: Bearer ${MOBILESANDBOX_API_KEY:?set MOBILESANDBOX_API_KEY}"
api() { curl -sS --fail-with-body --max-time 70 -H "$AUTH" "$@"; }

# 1. Create a phone and wait until it is ready (as in curl/walkthrough.sh).
PHONE=$(api --retry 2 -X POST "$MSB/v1/phones?wait=ready&timeout=50" \
  -H 'Content-Type: application/json' -H "Idempotency-Key: $(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)" \
  -d '{"name":"watch-example","idle_timeout":120,"max_duration":300}')
ID=$(jq -r .id <<<"$PHONE")
trap 'api -X DELETE "$MSB/v1/phones/$ID" >/dev/null && echo "deleted $ID"' EXIT   # delete even on failure
trap 'exit 130' INT TERM
for _ in 1 2 3; do
  [ "$(jq -r .status <<<"$PHONE")" = ready ] && break
  PHONE=$(api "$MSB/v1/phones/$ID?wait=ready&timeout=50")
done
[ "$(jq -r .status <<<"$PHONE")" = ready ] || { echo "not ready: $PHONE" >&2; exit 1; }

# 2. Ask for a live view link: the screen, with every action below drawn on it and captioned as it happens.
#    Over MCP your agent gets the same link from watch_phone.
VIEW=$(api -X POST "$MSB/v1/phones/$ID/view")
URL=$(jq -r .url <<<"$VIEW")
case $URL in */watch\#v1.*) ;; *) echo "not a viewer link: $VIEW" >&2; exit 1 ;; esac
echo "live view: $URL"

# 3. Open it in its own window (Chrome or Edge, else your browser). In CI nobody is watching, so it only prints.
if [ -z "${CI:-}" ]; then npx -y mobilebox watch "$URL"; sleep 3; fi

# 4. Steps to follow along: each one shows up in the view as a cursor move, a tap or a scroll, with a caption.
RESULT=$(api -X POST "$MSB/v1/phones/$ID/actions" -H 'Content-Type: application/json' -d '{"actions":[
  {"type":"open_app","package":"com.android.settings"},
  {"type":"scroll_to","text":"Display"},
  {"type":"tap","target":{"text":"Display"}},
  {"type":"wait_for","text":"Brightness level"}]}')
jq -e 'all(.results[]; .ok)' >/dev/null <<<"$RESULT" || { jq '.results' <<<"$RESULT" >&2; exit 1; }
echo "ok: Settings > Display is open"

# 5. Hold the last screen for a moment, then the EXIT trap deletes the phone and the view says it ended.
[ -n "${CI:-}" ] || sleep 5
