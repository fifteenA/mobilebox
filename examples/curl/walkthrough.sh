#!/usr/bin/env bash
# REST walkthrough with curl + jq: create a phone, read the screen, act, screenshot, delete.
#   export MOBILESANDBOX_API_KEY=...   # from https://mobilebox.dev/dashboard
#   ./walkthrough.sh
set -euo pipefail
MSB=${MOBILESANDBOX_URL:-https://mobilebox.dev}
AUTH="Authorization: Bearer ${MOBILESANDBOX_API_KEY:?set MOBILESANDBOX_API_KEY}"
api() { curl -sS --fail-with-body --max-time 70 -H "$AUTH" "$@"; }

# 1. Create. The Idempotency-Key makes curl's retry after a timeout or 5xx return the same phone, not a second one.
#    wait=ready holds the request up to 50 s; the phone may still be "creating" afterwards.
PHONE=$(api --retry 2 -X POST "$MSB/v1/phones?wait=ready&timeout=50" \
  -H 'Content-Type: application/json' -H "Idempotency-Key: $(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)" \
  -d '{"name":"curl-walkthrough","idle_timeout":120,"max_duration":300}')
ID=$(jq -r .id <<<"$PHONE")
trap 'api -X DELETE "$MSB/v1/phones/$ID" && echo "deleted $ID"' EXIT   # delete even on failure
trap 'exit 130' INT TERM                                                 # ... and on Ctrl-C or a cancelled job
echo "created $ID ($(jq -r .status <<<"$PHONE"))"

# 2. Poll the same id until ready. Never create again while it boots.
for _ in 1 2 3; do
  [ "$(jq -r .status <<<"$PHONE")" = ready ] && break
  PHONE=$(api "$MSB/v1/phones/$ID?wait=ready&timeout=50")
done
[ "$(jq -r .status <<<"$PHONE")" = ready ] || { echo "not ready: $PHONE" >&2; exit 1; }

# 3. Read the screen as numbered elements: [ref] Type "text" (x,y)
api "$MSB/v1/phones/$ID/observe?format=text"; echo

# 4. Act: up to 20 actions per call. Returns per-action results and the new screen.
RESULT=$(api -X POST "$MSB/v1/phones/$ID/actions" -H 'Content-Type: application/json' -d '{"actions":[
  {"type":"open_app","package":"com.android.settings"},
  {"type":"scroll_to","text":"Display"},
  {"type":"tap","target":{"text":"Display"}},
  {"type":"wait_for","text":"Brightness level"}]}')
# HTTP 200 can still contain a failed action: check every result.
jq -e 'all(.results[]; .ok)' >/dev/null <<<"$RESULT" || { jq '.results' <<<"$RESULT" >&2; exit 1; }
jq -r .screen.text <<<"$RESULT"

# 5. Screenshot (PNG), for what the element list cannot show.
api "$MSB/v1/phones/$ID/screenshot" -o screen.png && echo "saved ./screen.png"

# 6. The EXIT trap deletes the phone. To keep apps and data instead: POST /v1/phones/$ID/park
