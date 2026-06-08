#!/usr/bin/env bash
# notify-pet.sh — POST state changes to the Electron pet app
# Usage: notify-pet.sh <action> [plugin_root]

ACTION="$1"
PLUGIN_ROOT="${2:-$(dirname "$(dirname "$0")")}"
PORT_FILE="$HOME/.claude-pet/port"
PORT=$(cat "$PORT_FILE" 2>/dev/null)

if [ -z "$PORT" ]; then
  exit 0  # Pet not running, silently skip
fi

BASE_URL="http://127.0.0.1:$PORT"

case "$ACTION" in
  tool-start)
    # Claude Code passes tool_name via stdin JSON
    TOOL_NAME=$(python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_name',''))" 2>/dev/null || echo "")
    # Map tool name to state
    STATE=""
    case "$TOOL_NAME" in
      Read) STATE="reading" ;;
      Grep|Glob|Task|WebSearch|WebFetch) STATE="searching" ;;
      Write|Edit|NotebookEdit) STATE="writing" ;;
      Bash) STATE="executing" ;;
      *) STATE="" ;;
    esac
    if [ -n "$STATE" ]; then
      curl -s -X POST "$BASE_URL/status" \
        -H "Content-Type: application/json" \
        -d "{\"state\":\"$STATE\",\"detail\":\"$TOOL_NAME\"}" > /dev/null 2>&1 &
    fi
    ;;

  tool-finish)
    # Auto-transition to thinking, which times out to idle
    curl -s -X POST "$BASE_URL/status" \
      -H "Content-Type: application/json" \
      -d '{"state":"thinking","detail":"processing"}' > /dev/null 2>&1 &
    ;;

  tool-fail)
    TOOL_NAME=$(python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_name','unknown'))" 2>/dev/null || echo "unknown")
    curl -s -X POST "$BASE_URL/status" \
      -H "Content-Type: application/json" \
      -d "{\"state\":\"error\",\"detail\":\"$TOOL_NAME failed\"}" > /dev/null 2>&1 &
    ;;

  idle)
    curl -s -X POST "$BASE_URL/status" \
      -H "Content-Type: application/json" \
      -d '{"state":"idle","detail":""}' > /dev/null 2>&1 &
    ;;

  permission-notify)
    # Notification hook — trigger pet animation only (dialog handled by PermissionRequest)
    curl -s -X POST "$BASE_URL/status" \
      -H "Content-Type: application/json" \
      -d '{"state":"permission","detail":"waiting"}' > /dev/null 2>&1 &
    ;;

  permission-request)
    # PermissionRequest hook — blocking, returns allow/deny to Claude Code
    python3 - "$BASE_URL" <<'PY'
import json, os, sys, time, uuid, urllib.error, urllib.request

base_url = sys.argv[1]
port_file = os.path.expanduser("~/.claude-pet/port")
response_file = os.path.expanduser("~/.claude-pet/permission-response")

try:
    hook_input = json.load(sys.stdin)
except json.JSONDecodeError:
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PermissionRequest", "decision": {"behavior": "deny", "message": "Invalid hook input"}}}))
    sys.exit(0)

try:
    port = open(port_file).read().strip()
except OSError:
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PermissionRequest", "decision": {"behavior": "deny", "message": "Pet not running"}}}))
    sys.exit(0)

request_id = str(uuid.uuid4())
payload = {
    "requestId": request_id,
    "tool_name": hook_input.get("tool_name"),
    "tool_input": hook_input.get("tool_input"),
    "permission_suggestions": hook_input.get("permission_suggestions", []),
    "title": hook_input.get("title"),
    "message": hook_input.get("message"),
    "cwd": hook_input.get("cwd"),
    "permission_mode": hook_input.get("permission_mode"),
}

body = json.dumps(payload).encode("utf-8")
req = urllib.request.Request(
    f"{base_url}/permission",
    data=body,
    headers={"Content-Type": "application/json"},
    method="POST",
)

try:
    urllib.request.urlopen(req, timeout=5)
except urllib.error.URLError:
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PermissionRequest", "decision": {"behavior": "deny", "message": "Pet unreachable"}}}))
    sys.exit(0)

deadline = time.time() + 600
while time.time() < deadline:
    if os.path.exists(response_file):
        try:
            with open(response_file, "r", encoding="utf-8") as f:
                resp = json.load(f)
        except (OSError, json.JSONDecodeError):
            resp = None
        if resp and resp.get("requestId") == request_id:
            try:
                os.remove(response_file)
            except OSError:
                pass
            decision = resp.get("decision") or {"behavior": "deny"}
            print(json.dumps({"hookSpecificOutput": {"hookEventName": "PermissionRequest", "decision": decision}}))
            sys.exit(0)
    time.sleep(0.1)

print(json.dumps({"hookSpecificOutput": {"hookEventName": "PermissionRequest", "decision": {"behavior": "deny", "message": "Permission timeout"}}}))
PY
    ;;
esac
