#!/usr/bin/env node
/**
 * session-start.js — Cross-platform auto-launch handler
 *
 * Replaces session-start bash script with pure Node.js.
 * Checks if the pet is already running, handles stale PID cleanup,
 * respects auto-start-disabled flag, and launches the Electron app.
 *
 * Usage: node session-start.js [plugin_root]
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PLUGIN_ROOT = process.argv[2] || path.dirname(path.dirname(__dirname));
const ELECTRON_DIR = path.join(PLUGIN_ROOT, 'electron');
const PORT_FILE = path.join(os.homedir(), '.claude-pet', 'port');
const AUTO_START_DISABLED = path.join(os.homedir(), '.claude-pet', 'auto-start-disabled');
const PET_DIR = path.join(os.homedir(), '.claude-pet');

// ── Helpers ──

function healthCheck(port) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1', port, path: '/health',
      method: 'GET', timeout: 2000,
    }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; });
      res.on('end', () => resolve(res.statusCode === 200));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0); // Signal 0 = check if process exists
    return true;
  } catch (_) {
    return false;
  }
}

// ── Main ──

(async () => {
  try { fs.mkdirSync(PET_DIR, { recursive: true }); } catch (_) {}

  // Check if pet is already running
  if (fs.existsSync(PORT_FILE)) {
    const raw = fs.readFileSync(PORT_FILE, 'utf8');
    const lines = raw.trim().split('\n');
    const port = parseInt(lines[0], 10);
    const pid = parseInt(lines[1], 10);

    if (port && (await healthCheck(port))) {
      // Pet is already running, exit
      process.exit(0);
    }

    // Health check failed — check if process is still alive
    if (pid && !isPidAlive(pid)) {
      // PID is dead, clean up stale port file
      try { fs.unlinkSync(PORT_FILE); } catch (_) {}
    }
  }

  // Check if auto-start is disabled
  if (fs.existsSync(AUTO_START_DISABLED)) {
    process.exit(0);
  }

  // Install deps if needed
  if (!fs.existsSync(path.join(ELECTRON_DIR, 'node_modules'))) {
    spawn('npm', ['install', '--silent'], {
      cwd: ELECTRON_DIR,
      stdio: 'ignore',
      detached: true,
    }).unref();
    // Don't wait for install; electron will fail to start if deps aren't ready,
    // but the user can run /pet start manually
  }

  // Launch Electron
  spawn('npx', ['electron', '.'], {
    cwd: ELECTRON_DIR,
    stdio: 'ignore',
    detached: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
  }).unref();
})();
