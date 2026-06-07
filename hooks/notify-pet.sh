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

  permission)
    # Extract notification details from stdin JSON
    NOTIF_DATA=$(python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  msg = d.get('message', 'Permission needed')
  print(json.dumps({'command': msg, 'requestId': str(d.get('notification_id',''))}))
except:
  print('{}')
" 2>/dev/null)
    curl -s -X POST "$BASE_URL/permission" \
      -H "Content-Type: application/json" \
      -d "$NOTIF_DATA" > /dev/null 2>&1 &
    ;;
esac
