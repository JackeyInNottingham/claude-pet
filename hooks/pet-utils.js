#!/usr/bin/env node
/**
 * pet-utils.js — Shared utilities for Claude Pet hook/command scripts
 *
 * This module is required by session-start.js, notify-pet.js, and pet-control.js.
 * All functions use only Node.js built-in modules.
 *
 * ⚠️  Do NOT add npm dependencies to this file.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PET_DIR = path.join(os.homedir(), '.claude-pet');
const PORT_FILE = path.join(PET_DIR, 'port');
const LOCK_FILE = path.join(PET_DIR, '.launcher.lock');

// ── Port file ──

function getPort() {
  try {
    const raw = fs.readFileSync(PORT_FILE, 'utf8');
    return parseInt(raw.split('\n')[0].trim(), 10) || null;
  } catch (_) {
    return null;
  }
}

// ── Health check ──

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

// ── PID check ──

function isPidAlive(pid) {
  if (!pid || isNaN(pid)) return false;
  try {
    process.kill(pid, 0); // Signal 0 = check existence
    return true;
  } catch (_) {
    return false;
  }
}

// ── Atomic launcher lock ──
// Uses fs.writeFileSync with 'wx' flag — fails atomically if file exists.
// Recursive retry with depth limit prevents stack overflow on pathological cases.

function tryAcquireLock(maxRetries = 5) {
  try {
    fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: 'wx' });
    return true;
  } catch (e) {
    if (e.code !== 'EEXIST') return false;
    // Lock exists — check if holder is alive
    try {
      const holderPid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim(), 10);
      if (!isPidAlive(holderPid)) {
        try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
        if (maxRetries > 0) return tryAcquireLock(maxRetries - 1);
      }
    } catch (_) {}
    return false;
  }
}

function releaseLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
}

// ── HTTP helpers ──

function httpGet(hostname, port, route, timeout = 3000) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname, port, path: route,
      method: 'GET', timeout,
    }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

function httpPost(hostname, port, route, timeout = 3000) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname, port, path: route,
      method: 'POST', timeout,
    }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
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

module.exports = {
  PET_DIR,
  PORT_FILE,
  LOCK_FILE,
  getPort,
  healthCheck,
  isPidAlive,
  tryAcquireLock,
  releaseLock,
  httpGet,
  httpPost,
  postJSON,
};
