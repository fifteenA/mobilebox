#!/usr/bin/env bash
# The calls Claude Code makes for the prompt in README.md, sent by hand: MCP tools for the phone,
# one REST upload for the local APK (MCP install_app only takes a public URL).
# Exits non-zero if the label never appears; deletes the phone either way.
#   export MOBILESANDBOX_API_KEY=...
#   ./replay.sh app/build/outputs/apk/debug/app-debug.apk com.example.app Welcome
set -euo pipefail
usage='usage: replay.sh APK_FILE PACKAGE LABEL'
APK=${1:?$usage} PKG=${2:?$usage} LABEL=${3:?$usage}
MSB=${MOBILESANDBOX_URL:-https://mobilebox.dev}
AUTH="Authorization: Bearer ${MOBILESANDBOX_API_KEY:?set MOBILESANDBOX_API_KEY}"

tool() {  # tool NAME JSON_ARGS -> the tool's text result; exits 1 on a tool error
  local out
  out=$(jq -n --arg name "$1" --argjson args "$2" \
      '{jsonrpc:"2.0",id:1,method:"tools/call",params:{name:$name,arguments:$args}}' |
    curl -sS --fail-with-body --max-time 120 "$MSB/mcp" -H "$AUTH" -H 'Content-Type: application/json' \
      -H 'Accept: application/json, text/event-stream' --data-binary @- |
    sed -n 's/^data: //p; /^{/p')   # the reply is JSON or a single SSE event
  jq -r '.result.content[] | select(.type=="text") | .text' <<<"$out"
  jq -e '.result.isError != true' >/dev/null <<<"$out"
}

OUT=$(tool create_phone "{\"name\":\"apk-check\",\"idle_timeout\":300,\"max_duration\":600,\"idempotency_key\":\"$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen)\"}")
ID=$(grep -o 'ph_[a-z0-9]*' <<<"$OUT" | head -1)
trap 'tool delete_phone "{\"phone_id\":\"$ID\"}"' EXIT
trap 'exit 130' INT TERM   # a cancelled run still deletes the phone
head -1 <<<"$OUT"

curl -sS --fail-with-body --max-time 600 -X POST "$MSB/v1/phones/$ID/apps?grant_permissions=true" -H "$AUTH" \
  -H 'Content-Type: application/octet-stream' --data-binary "@$APK" | jq -c .

# act reports a failed action in its text ("2. wait_for failed: ..."), not as a tool error.
RESULT=$(tool act "$(jq -nc --arg id "$ID" --arg pkg "$PKG" --arg label "$LABEL" \
  '{phone_id:$id, actions:[{type:"open_app",package:$pkg},{type:"wait_for",text:$label,timeout_ms:30000}]}')")
echo "$RESULT"
if grep -Eq '^[0-9]+\. [a-z_]+ failed' <<<"$RESULT"; then
  echo "FAIL: an action failed, see the result above" >&2
  exit 1
fi
echo "PASS: \"$LABEL\" is on screen"
