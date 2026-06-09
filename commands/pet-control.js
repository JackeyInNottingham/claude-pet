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
const {
  PORT_FILE,
  LOCK_FILE,
  PET_DIR,
  getPort,
  healthCheck,
  isPidAlive,
  tryAcquireLock,
  releaseLock,
  httpGet,
  httpPost,
} = require('../hooks/pet-utils');

const ACTION = process.argv[2];
const PLUGIN_ROOT = process.argv[3] || path.dirname(__dirname);
const ELECTRON_DIR = path.join(PLUGIN_ROOT, 'electron');
const AUTO_START_FILE = path.join(os.homedir(), '.claude-pet', 'auto-start-disabled');
const RESPONSE_FILE = path.join(PET_DIR, 'permission-response');

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

  // Acquire launcher lock to prevent duplicate pets
  if (!tryAcquireLock()) {
    console.log('Claude Pet is already starting (another launcher is active).');
    process.exit(1);
  }

  // Install deps if needed (await — must complete before launching)
  if (!fs.existsSync(path.join(ELECTRON_DIR, 'node_modules'))) {
    console.log('Installing dependencies...');
    try {
      await new Promise((resolve, reject) => {
        const proc = spawn('npm', ['install', '--silent'], {
          cwd: ELECTRON_DIR, stdio: 'inherit',
          env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE')),
        });
        proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`npm exit ${code}`)));
      });
      console.log('Dependencies installed.');
    } catch (_) {
      console.log('Warning: npm install failed. Trying to launch anyway...');
    }
  }

  // Resolve electron binary path.
  // On Windows, use the actual .exe (the .cmd wrapper conflicts with detached:true).
  const electronBin = process.platform === 'win32'
    ? path.join(ELECTRON_DIR, 'node_modules', 'electron', 'dist', 'electron.exe')
    : path.join(ELECTRON_DIR, 'node_modules', '.bin', 'electron');

  // Launch Electron
  let child;
  try {
    child = spawn(electronBin, ['.'], {
      cwd: ELECTRON_DIR,
      stdio: 'ignore',
      detached: true,
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE')),
    });
    child.unref();
  } catch (_) {
    releaseLock();
    console.log('Error: Could not launch Electron. Is it installed? Run: cd electron && npm install');
    process.exit(1);
  }

  // Poll for Electron to write PORT_FILE, then release lock.
  // Use a longer timeout (15s) to avoid race with slow startups.
  // Also monitor child exit — if Electron crashes early, release lock immediately.
  let attempts = 0;
  while (attempts < 150) { // 15 seconds
    await new Promise(r => setTimeout(r, 100));

    // If Electron exited before writing PORT_FILE, bail
    if (child.exitCode !== null || child.killed) {
      releaseLock();
      console.log('Error: Claude Pet failed to start.');
      process.exit(1);
    }

    if (fs.existsSync(PORT_FILE)) {
      releaseLock();
      console.log('Claude Pet started.');
      process.exit(0);
    }
    attempts++;
  }

  // Timeout: Electron is still starting, release lock
  releaseLock();
  console.log('Claude Pet started (startup in progress).');
}

async function stopPet() {
  const port = getPort();
  if (port) {
    await httpPost('127.0.0.1', port, '/shutdown');
    try { fs.unlinkSync(PORT_FILE); } catch (_) {}
  }
  try { fs.unlinkSync(RESPONSE_FILE); } catch (_) {}
  releaseLock();
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
