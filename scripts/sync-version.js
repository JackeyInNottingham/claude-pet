#!/usr/bin/env node
/**
 * sync-version.js — Sync VERSION → plugin.json + package.json
 *
 * Reads the canonical VERSION file and writes its value to the `version`
 * fields of .claude-plugin/plugin.json and electron/package.json.
 *
 * Usage: node scripts/sync-version.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

// 1. Read VERSION
const versionFile = path.join(REPO_ROOT, 'VERSION');
let version;
try {
  version = fs.readFileSync(versionFile, 'utf8').trim().split('\n')[0];
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    console.error(`ERROR: Invalid version in VERSION: "${version}"`);
    process.exit(1);
  }
} catch (e) {
  console.error('ERROR: Could not read VERSION file:', e.message);
  process.exit(1);
}

// 2. Sync plugin.json
const pluginJson = path.join(REPO_ROOT, '.claude-plugin', 'plugin.json');
try {
  const data = JSON.parse(fs.readFileSync(pluginJson, 'utf8'));
  data.version = version;
  fs.writeFileSync(pluginJson, JSON.stringify(data, null, 2) + '\n');
  console.log(`✓ plugin.json → ${version}`);
} catch (e) {
  console.error('ERROR: Could not sync plugin.json:', e.message);
  process.exit(1);
}

// 3. Sync package.json
const pkgJson = path.join(REPO_ROOT, 'electron', 'package.json');
try {
  const data = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
  data.version = version;
  fs.writeFileSync(pkgJson, JSON.stringify(data, null, 2) + '\n');
  console.log(`✓ package.json → ${version}`);
} catch (e) {
  console.error('ERROR: Could not sync package.json:', e.message);
  process.exit(1);
}

console.log('Done.');
