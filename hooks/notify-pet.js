#!/usr/bin/env node
/**
 * notify-pet.js — Cross-platform hook handler for Claude Pet
 *
 * Replaces notify-pet.sh with pure Node.js — no bash, no curl, no Git Bash needed.
 * Uses only Node.js built-in modules (http, fs, path, os, crypto).
 *
 * Usage: node notify-pet.js <action> [plugin_root]
 *
 * Actions:
 *   tool-start          — Read stdin JSON, map tool_name → state, POST /status
 *   tool-finish         — POST /status {thinking}
 *   tool-fail           — Read stdin JSON, POST /status {error}
 *   idle                — POST /status {idle}
 *   permission-notify   — POST /status {permission}
 *   permission-request  — BLOCKING — POST /permission, poll response file, output decision
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ACTION = process.argv[2];
const PLUGIN_ROOT = process.argv[3] || path.dirname(path.dirname(__dirname));
const PORT_FILE = path.join(os.homedir(), '.claude-pet', 'port');
const PET_DIR = path.join(os.homedir(), '.claude-pet');

// ── Helpers ──

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) return resolve('');
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    // If stdin ends immediately, resolve early
    process.stdin.on('close', () => resolve(data));
    // Timeout: if no data within 500ms, resolve empty
    setTimeout(() => resolve(data), 500);
  });
}

function getPort() {
  try {
    const raw = fs.readFileSync(PORT_FILE, 'utf8');
    return parseInt(raw.split('\n')[0].trim(), 10) || null;
  } catch (_) {
    return null;
  }
}

function postJSON(hostname, port, route, data, timeout = 3000) {
  return new Promise((resolve) => {
    const body = JSON.stringify(data);
    const req = http.request({
      hostname, port, path: route, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout,
    }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

// ── Tool name → state mapping ──

function toolToState(toolName) {
  switch (toolName) {
    case 'Read': return 'reading';
    case 'Grep': case 'Glob': case 'Task': case 'WebSearch': case 'WebFetch':
      return 'searching';
    case 'Write': case 'Edit': case 'NotebookEdit':
      return 'writing';
    case 'Bash': return 'executing';
    default: return null;
  }
}

// ── State posting (fire-and-forget) ──

function postState(state, detail) {
  const port = getPort();
  if (!port) return; // Pet not running, silently skip
  // Fire-and-forget — don't wait for response
  const body = JSON.stringify({ state, detail: detail || '' });
  const req = http.request({
    hostname: '127.0.0.1', port,
    path: '/status', method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeout: 2000,
  });
  req.on('error', () => {});
  req.on('timeout', () => { req.destroy(); });
  req.write(body);
  req.end();
}

// ── Actions ──

async function handleToolStart() {
  const stdin = await readStdin();
  let toolName = '';
  try {
    if (stdin) toolName = JSON.parse(stdin).tool_name || '';
  } catch (_) {}
  const state = toolToState(toolName);
  if (state) postState(state, toolName);
}

async function handleToolFinish() {
  postState('thinking', 'processing');
}

async function handleToolFail() {
  const stdin = await readStdin();
  let toolName = 'unknown';
  try {
    if (stdin) toolName = JSON.parse(stdin).tool_name || 'unknown';
  } catch (_) {}
  postState('error', toolName + ' failed');
}

async function handleIdle() {
  postState('idle', '');
}

async function handlePermissionNotify() {
  postState('permission', 'waiting');
}

async function handlePermissionRequest() {
  // This is BLOCKING — must wait for user decision and output JSON to stdout
  const stdin = await readStdin();
  let hookInput;
  try {
    hookInput = JSON.parse(stdin);
  } catch (_) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: { behavior: 'deny', message: 'Invalid hook input' },
      },
    }));
    process.exit(0);
  }

  // Check pet is running
  const port = getPort();
  if (!port) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: { behavior: 'deny', message: 'Pet not running' },
      },
    }));
    process.exit(0);
  }

  const requestId = crypto.randomUUID();
  const payload = {
    requestId,
    tool_name: hookInput.tool_name,
    tool_input: hookInput.tool_input,
    permission_suggestions: hookInput.permission_suggestions || [],
    title: hookInput.title,
    message: hookInput.message,
    cwd: hookInput.cwd,
    permission_mode: hookInput.permission_mode,
  };

  // POST /permission
  const result = await postJSON('127.0.0.1', port, '/permission', payload, 5000);
  if (!result) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: { behavior: 'deny', message: 'Pet unreachable' },
      },
    }));
    process.exit(0);
  }

  // Poll for response (600s timeout, 100ms interval)
  const responseFile = path.join(PET_DIR, 'permission-response');
  const deadline = Date.now() + 600000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      const raw = fs.readFileSync(responseFile, 'utf8');
      const resp = JSON.parse(raw);
      if (resp && resp.requestId === requestId) {
        try { fs.unlinkSync(responseFile); } catch (_) {}
        const decision = resp.decision || { behavior: 'deny' };
        console.log(JSON.stringify({
          hookSpecificOutput: { hookEventName: 'PermissionRequest', decision },
        }));
        process.exit(0);
      }
    } catch (_) {}
  }

  // Timeout
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'deny', message: 'Permission timeout' },
    },
  }));
}

// ── Main dispatch ──

(async () => {
  // Ensure pet directory exists
  try { fs.mkdirSync(PET_DIR, { recursive: true }); } catch (_) {}

  switch (ACTION) {
    case 'tool-start':          return await handleToolStart();
    case 'tool-finish':         return await handleToolFinish();
    case 'tool-fail':           return await handleToolFail();
    case 'idle':                return await handleIdle();
    case 'permission-notify':   return await handlePermissionNotify();
    case 'permission-request':  return await handlePermissionRequest();
    default:
      // Unknown action, silently exit
      process.exit(0);
  }
})();
