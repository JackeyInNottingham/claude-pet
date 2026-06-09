#!/usr/bin/env node
/**
 * session-start.js — Cross-platform auto-launch handler
 *
 * Replaces session-start bash script with pure Node.js.
 * Checks if the pet is already running, handles stale PID cleanup,
 * respects auto-start-disabled flag, and launches the Electron app.
 *
 * SINGLE-INSTANCE: Uses an atomic file lock (~/.claude-pet/.launcher.lock)
 * to prevent multiple sessions from spawning duplicate pets.
 *
 * Usage: node session-start.js [plugin_root]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const {
  PORT_FILE,
  LOCK_FILE,
  PET_DIR,
  healthCheck,
  isPidAlive,
  tryAcquireLock,
  releaseLock,
} = require('./pet-utils');

const PLUGIN_ROOT = process.argv[2] || path.dirname(__dirname);
const ELECTRON_DIR = path.join(PLUGIN_ROOT, 'electron');
const AUTO_START_DISABLED = path.join(os.homedir(), '.claude-pet', 'auto-start-disabled');

// ── Main ──

(async () => {
  try { fs.mkdirSync(PET_DIR, { recursive: true }); } catch (_) {}

  // ── Phase 1: Clean up stale files (always do this, even if auto-start is disabled) ──

  if (fs.existsSync(PORT_FILE)) {
    const raw = fs.readFileSync(PORT_FILE, 'utf8');
    const lines = raw.trim().split('\n');
    const port = parseInt(lines[0], 10);
    const pid = parseInt(lines[1], 10);

    if (port && (await healthCheck(port))) {
      // Pet is already running — nothing to do
      process.exit(0);
    }

    // Health check failed — clean up stale files
    if (pid && !isPidAlive(pid)) {
      try { fs.unlinkSync(PORT_FILE); } catch (_) {}
    }
    // Always clean stale lock file when port file is stale
    try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
  }

  // ── Phase 2: Check auto-start setting ──
  if (fs.existsSync(AUTO_START_DISABLED)) {
    process.exit(0);
  }

  // ── Phase 3: Acquire launcher lock (atomic, prevents duplicate pets) ──
  if (!tryAcquireLock()) {
    // Another launcher is starting the pet — exit silently
    process.exit(0);
  }

  // We hold the lock. Double-check pet hasn't appeared while we were acquiring.
  if (fs.existsSync(PORT_FILE)) {
    try {
      const raw = fs.readFileSync(PORT_FILE, 'utf8');
      const port = parseInt(raw.split('\n')[0], 10);
      if (port && (await healthCheck(port))) {
        releaseLock();
        process.exit(0);
      }
    } catch (_) {}
  }

  // Install deps if needed (fire-and-forget — won't be ready this run)
  if (!fs.existsSync(path.join(ELECTRON_DIR, 'node_modules'))) {
    spawn('npm', ['install', '--silent'], {
      cwd: ELECTRON_DIR,
      stdio: 'ignore',
      detached: true,
    }).unref();
  }

  // Resolve electron binary path.
  // On Windows, use the actual .exe (the .cmd wrapper conflicts with detached:true).
  const electronBin = process.platform === 'win32'
    ? path.join(ELECTRON_DIR, 'node_modules', 'electron', 'dist', 'electron.exe')
    : path.join(ELECTRON_DIR, 'node_modules', '.bin', 'electron');

  // Launch Electron — wrap in try-catch for ENOENT (e.g. node_modules missing)
  try {
    const child = spawn(electronBin, ['.'], {
      cwd: ELECTRON_DIR,
      stdio: 'ignore',
      detached: true,
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE')),
    });
    child.unref();
  } catch (_) {
    // Electron binary not found — likely node_modules is being installed.
    // Release the lock so future sessions can try, then exit.
    releaseLock();
    process.exit(0);
  }

  // Safety net: if Electron fails to start, release lock after 30s.
  // .unref() ensures this timer doesn't keep the Node process alive.
  const safetyTimer = setTimeout(() => {
    if (!fs.existsSync(PORT_FILE)) {
      releaseLock();
    }
  }, 30000);
  safetyTimer.unref();
})();
