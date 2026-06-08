#!/usr/bin/env node
/**
 * pet-control.js — Cross-platform /pet command handler
 *
 * Replaces pet-control.sh with pure Node.js.
 *
 * Usage: node pet-control.js start|stop|toggle|status [plugin_root]
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ACTION = process.argv[2];
const PLUGIN_ROOT = process.argv[3] || path.dirname(path.dirname(__dirname));
const ELECTRON_DIR = path.join(PLUGIN_ROOT, 'electron');
const PORT_FILE = path.join(os.homedir(), '.claude-pet', 'port');
const AUTO_START_FILE = path.join(os.homedir(), '.claude-pet', 'auto-start-disabled');
const PET_DIR = path.join(os.homedir(), '.claude-pet');
const RESPONSE_FILE = path.join(PET_DIR, 'permission-response');

// ── Helpers ──

function httpGet(hostname, port, route) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname, port, path: route,
      method: 'GET', timeout: 3000,
    }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

function httpPost(hostname, port, route) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname, port, path: route,
      method: 'POST', timeout: 3000,
    }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
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

// ── Actions ──

async function startPet() {
  try { fs.mkdirSync(PET_DIR, { recursive: true }); } catch (_) {}

  // Check if already running
  const port = getPort();
  if (port) {
    const health = await httpGet('127.0.0.1', port, '/health');
    if (health && health.status === 200) {
      console.log(`Claude Pet is already running (port ${port}).`);
      process.exit(0);
    }
    // Stale port file — clean up
    try { fs.unlinkSync(PORT_FILE); } catch (_) {}
  }

  // Install deps if needed
  if (!fs.existsSync(path.join(ELECTRON_DIR, 'node_modules'))) {
    console.log('Installing dependencies...');
    try {
      await new Promise((resolve, reject) => {
        const proc = spawn('npm', ['install', '--silent'], {
          cwd: ELECTRON_DIR, stdio: 'inherit',
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
        });
        proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`npm exit ${code}`)));
      });
    } catch (_) {
      console.log('Warning: npm install failed. Dependencies may not be ready.');
    }
  }

  // Launch Electron
  const child = spawn('npx', ['electron', '.'], {
    cwd: ELECTRON_DIR,
    stdio: 'ignore',
    detached: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
  });
  child.unref();
  console.log('Claude Pet started.');
}

async function stopPet() {
  const port = getPort();
  if (port) {
    await httpPost('127.0.0.1', port, '/shutdown');
    try { fs.unlinkSync(PORT_FILE); } catch (_) {}
  }
  try { fs.unlinkSync(RESPONSE_FILE); } catch (_) {}
  console.log('Claude Pet stopped.');
}

async function togglePet() {
  try { fs.mkdirSync(PET_DIR, { recursive: true }); } catch (_) {}
  if (fs.existsSync(AUTO_START_FILE)) {
    fs.unlinkSync(AUTO_START_FILE);
    console.log('Auto-start: ENABLED');
  } else {
    fs.writeFileSync(AUTO_START_FILE, '', 'utf8');
    console.log('Auto-start: DISABLED');
  }
}

async function statusPet() {
  const port = getPort();
  if (port) {
    const health = await httpGet('127.0.0.1', port, '/health');
    if (health && health.status === 200) {
      console.log(`Claude Pet is running (port ${port}).`);
      process.exit(0);
    }
    // Port file exists but unreachable
    try { fs.unlinkSync(PORT_FILE); } catch (_) {}
  }
  console.log('Claude Pet is not running.');
}

// ── Main dispatch ──

(async () => {
  switch (ACTION) {
    case 'start':   return await startPet();
    case 'stop':    return await stopPet();
    case 'toggle':  return await togglePet();
    case 'status':  return await statusPet();
    default:
      console.log('Usage: pet-control.js start|stop|toggle|status');
      process.exit(1);
  }
})();
