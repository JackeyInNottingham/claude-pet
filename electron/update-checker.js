/**
 * update-checker.js — GitHub Releases version checker (main process)
 *
 * Pure Node.js built-in modules only: https, fs, path, os, child_process.
 * No external dependencies.
 *
 * Checks https://api.github.com/repos/JackeyInNottingham/claude-pet/releases/latest
 * once per day. Compares semver against local version from plugin.json.
 */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const REPO_API = 'https://api.github.com/repos/JackeyInNottingham/claude-pet/releases/latest';
const VERSION_STATE_FILE = path.join(os.homedir(), '.claude-pet', 'version.json');
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Semver helpers (no external deps) ──

function parseSemver(v) {
  // Strip leading 'v' and anything after '-'
  const cleaned = String(v).replace(/^v/, '').split('-')[0];
  const parts = cleaned.split('.').map(n => parseInt(n, 10) || 0);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
    raw: String(v)
  };
}

/**
 * Returns positive if a > b, negative if a < b, 0 if equal.
 */
function compareVersions(a, b) {
  const va = parseSemver(a);
  const vb = parseSemver(b);
  if (va.major !== vb.major) return va.major - vb.major;
  if (va.minor !== vb.minor) return va.minor - vb.minor;
  if (va.patch !== vb.patch) return va.patch - vb.patch;
  return 0;
}

// ── State file I/O ──

function loadState() {
  try {
    if (fs.existsSync(VERSION_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(VERSION_STATE_FILE, 'utf8'));
    }
  } catch (_) {}
  return {};
}

function saveState(state) {
  const dir = path.dirname(VERSION_STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(VERSION_STATE_FILE, JSON.stringify(state, null, 2));
}

// ── Version source ──

function getLocalVersion(pluginRoot) {
  try {
    const pluginJson = path.join(pluginRoot, '.claude-plugin', 'plugin.json');
    const data = JSON.parse(fs.readFileSync(pluginJson, 'utf8'));
    return data.version || '0.0.0';
  } catch (_) {
    // Fallback: try reading electron package.json
    try {
      const pkgJson = path.join(pluginRoot, 'electron', 'package.json');
      const data = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
      return data.version || '0.0.0';
    } catch (__) {
      return '0.0.0';
    }
  }
}

// ── GitHub API ──

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const url = new URL(REPO_API);
    const opts = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'GET',
      headers: {
        'User-Agent': 'claude-pet-update-checker/1.0',
        'Accept': 'application/vnd.github+json'
      },
      timeout: 10000
    };

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            return reject(new Error(`GitHub API returned ${res.statusCode}`));
          }
          const release = JSON.parse(data);
          resolve({
            tagName: release.tag_name || '',
            name: release.name || release.tag_name || '',
            body: release.body || '',
            htmlUrl: release.html_url || ''
          });
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

// ── Public API ──

module.exports = {

  /** Check if enough time has passed since last check */
  shouldCheck() {
    const state = loadState();
    if (!state.lastCheck) return true;
    const elapsed = Date.now() - new Date(state.lastCheck).getTime();
    return elapsed >= CHECK_INTERVAL_MS;
  },

  /** Save check timestamp (and optional skipped version) */
  recordCheck(skippedVersion) {
    const state = loadState();
    state.lastCheck = new Date().toISOString();
    if (skippedVersion !== undefined) {
      state.skippedVersion = skippedVersion;
    }
    // Clear skippedVersion if we're not skipping
    if (skippedVersion === null) {
      delete state.skippedVersion;
    }
    saveState(state);
  },

  /**
   * Check GitHub for latest release.
   * @param {string} pluginRoot — path to plugin (e.g. ~/.claude/skills/claude-pet)
   * @returns {object} { hasUpdate, currentVersion, latestVersion, releaseNotes, skipped }
   */
  async checkForUpdates(pluginRoot) {
    const currentVersion = getLocalVersion(pluginRoot);
    let latest;

    try {
      latest = await fetchLatestRelease();
    } catch (err) {
      return { hasUpdate: false, currentVersion, latestVersion: 'unknown', error: err.message };
    }

    const latestVersion = latest.tagName;
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

    // Check if user previously skipped this version
    const state = loadState();
    const skipped = !!(state.skippedVersion && state.skippedVersion === latestVersion);

    return {
      hasUpdate: hasUpdate && !skipped,
      currentVersion,
      latestVersion,
      releaseNotes: latest.body || '',
      releaseUrl: latest.htmlUrl || '',
      skipped
    };
  },

  /**
   * Run update: git pull + npm install.
   * @param {string} pluginRoot
   * @returns {Promise<{success: boolean, message: string}>}
   */
  runUpdate(pluginRoot) {
    return new Promise((resolve) => {
      const electronDir = path.join(pluginRoot, 'electron');

      // Step 1: git pull
      const git = spawn('git', ['pull', '--ff-only', 'origin', 'main'], {
        cwd: pluginRoot,
        stdio: 'pipe',
        env: { ...process.env },
        timeout: 60000
      });

      let gitOut = '', gitErr = '';

      git.stdout.on('data', d => { gitOut += d.toString(); });
      git.stderr.on('data', d => { gitErr += d.toString(); });

      git.on('close', (code) => {
        if (code !== 0) {
          // Non-zero exit doesn't always mean failure (e.g., "Already up to date" exits 0)
          // But if there's a real error, report it
          if (gitErr && !gitErr.includes('Already up to date')) {
            return resolve({ success: false, message: `git pull failed: ${gitErr.trim()}` });
          }
        }

        // Step 2: npm install
        const npm = spawn('npm', ['install', '--silent'], {
          cwd: electronDir,
          stdio: 'pipe',
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
          timeout: 120000
        });

        let npmOut = '', npmErr = '';

        npm.stdout.on('data', d => { npmOut += d.toString(); });
        npm.stderr.on('data', d => { npmErr += d.toString(); });

        npm.on('close', (npmCode) => {
          if (npmCode !== 0) {
            return resolve({ success: false, message: `npm install failed: ${npmErr.trim() || npmOut.trim()}` });
          }
          // Clear skippedVersion since user has updated past it
          try {
            const state = loadState();
            delete state.skippedVersion;
            state.lastCheck = new Date().toISOString();
            saveState(state);
          } catch (_) {}
          resolve({ success: true, message: 'Updated successfully. Please restart the pet.' });
        });

        npm.on('error', (err) => {
          resolve({ success: false, message: `npm install error: ${err.message}` });
        });
      });

      git.on('error', (err) => {
        resolve({ success: false, message: `git pull error: ${err.message}` });
      });
    });
  },

  // Exported for testing / manual check
  getLocalVersion,
  compareVersions,
  CHECK_INTERVAL_MS
};
