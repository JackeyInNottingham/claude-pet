#!/usr/bin/env bash
# notify-pet.sh — POST state changes to the Electron pet app
# Usage: notify-pet.sh <action> [plugin_root]

ACTION="$1"
PLUGIN_ROOT="${2:-$(dirname "$(dirname "$0")")}"
PORT_FILE="$HOME/.claude-pet/port"
PORT=$(head -n 1 "$PORT_FILE" 2>/dev/null)

if [ -z "$PORT" ]; then
  exit 0  # Pet not running, silently skip
fi

BASE_URL="http://127.0.0.1:$PORT"

case "$ACTION" in
  tool-start)
    # Claude Code passes tool_name via stdin JSON
    TOOL_NAME=$(node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).tool_name||'')}catch(e){console.log('')}})" 2>/dev/null || echo "")
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
    TOOL_NAME=$(node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).tool_name||'unknown')}catch(e){console.log('unknown')}})" 2>/dev/null || echo "unknown")
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
    # Save stdin JSON to temp file (heredoc replaces stdin, so we capture it first)
    HOOK_INPUT_FILE="$HOME/.claude-pet/hook-input-$$.json"
    mkdir -p "$HOME/.claude-pet" 2>/dev/null
    cat > "$HOOK_INPUT_FILE"
    node - "$BASE_URL" "$HOOK_INPUT_FILE" <<'JS'
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

(async () => {
  const baseUrl = process.argv[2];
  const inputFile = process.argv[3];
  const portFile = path.join(os.homedir(), '.claude-pet', 'port');
  const responseFile = path.join(os.homedir(), '.claude-pet', 'permission-response');

  // Read hook input from temp file
  let hookInput;
  try {
    hookInput = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    fs.unlinkSync(inputFile);
  } catch (e) {
    try { fs.unlinkSync(inputFile); } catch (_) {}
    console.log(JSON.stringify({hookSpecificOutput: {hookEventName: 'PermissionRequest', decision: {behavior: 'deny', message: 'Invalid hook input'}}}));
    process.exit(0);
  }

  // Check pet is running
  let port;
  try { port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim(); } catch (e) {
    console.log(JSON.stringify({hookSpecificOutput: {hookEventName: 'PermissionRequest', decision: {behavior: 'deny', message: 'Pet not running'}}}));
    process.exit(0);
  }

  const requestId = crypto.randomUUID();
  const payload = JSON.stringify({
    requestId,
    tool_name: hookInput.tool_name,
    tool_input: hookInput.tool_input,
    permission_suggestions: hookInput.permission_suggestions || [],
    title: hookInput.title,
    message: hookInput.message,
    cwd: hookInput.cwd,
    permission_mode: hookInput.permission_mode,
  });

  // POST /permission
  const posted = await new Promise((resolve) => {
    const [host, portStr] = baseUrl.replace('http://', '').split(':');
    const req = http.request({
      hostname: host || '127.0.0.1',
      port: parseInt(portStr) || port,
      path: '/permission',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000,
    }, (res) => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => resolve(true));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.write(payload);
    req.end();
  });

  if (!posted) {
    console.log(JSON.stringify({hookSpecificOutput: {hookEventName: 'PermissionRequest', decision: {behavior: 'deny', message: 'Pet unreachable'}}}));
    process.exit(0);
  }

  // Poll for response (600s timeout, 100ms interval)
  const deadline = Date.now() + 600000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 100));
    try {
      const raw = fs.readFileSync(responseFile, 'utf8');
      const resp = JSON.parse(raw);
      if (resp && resp.requestId === requestId) {
        try { fs.unlinkSync(responseFile); } catch (_) {}
        const decision = resp.decision || { behavior: 'deny' };
        console.log(JSON.stringify({hookSpecificOutput: {hookEventName: 'PermissionRequest', decision}}));
        process.exit(0);
      }
    } catch (e) {}
  }

  console.log(JSON.stringify({hookSpecificOutput: {hookEventName: 'PermissionRequest', decision: {behavior: 'deny', message: 'Permission timeout'}}}));
})();
JS
    # Clean up temp file if still exists (e.g. if node failed to start)
    rm -f "$HOOK_INPUT_FILE"
    ;;
esac
