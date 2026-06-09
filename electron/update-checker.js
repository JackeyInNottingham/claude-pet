/**
 * update-checker.js — GitHub Releases version checker (main process)
 *
 * Pure Node.js built-in modules only: https, fs, path, os, child_process.
 * No external dependencies.
 *
 * Checks https://api.github.com/repos/JackeyInNottingham/claude-pet/releases/latest
 * once per day. Compares semver against local version from plugin.json.
 *
 * Supports two update paths:
 *   1. Git-based install → git pull + npm install
 *   2. Release-based install → download tarball, extract, replace files
 */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const REPO_OWNER = 'JackeyInNottingham';
const REPO_NAME = 'claude-pet';
const REPO_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
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

// ── Platform / arch ──

function getPlatform() {
  return process.platform; // 'win32', 'darwin', 'linux'
}

function getArch() {
  return process.arch; // 'x64', 'arm64', 'ia32'
}

function getAssetExt() {
  return process.platform === 'win32' ? 'zip' : 'tar.gz';
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

/**
 * Check if the installation is a git repository.
 * Release-based installs (from tarball) won't have .git.
 */
function isGitRepo(pluginRoot) {
  return fs.existsSync(path.join(pluginRoot, '.git'));
}

// ── HTTPS helpers ──

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'claude-pet-update-checker/1.0',
        'Accept': 'application/vnd.github+json'
      },
      timeout: 10000
    };

    const req = https.request(opts, (res) => {
      // Follow redirects (GitHub release downloads redirect)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      resolve(res);
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

function downloadToFile(url, destPath) {
  return new Promise((resolve, reject) => {
    httpsGet(url).then(res => {
      const file = fs.createWriteStream(destPath);
      let downloaded = 0;
      const total = parseInt(res.headers['content-length'], 10) || 0;

      res.on('data', chunk => {
        downloaded += chunk.length;
        file.write(chunk);
      });

      res.on('end', () => {
        file.end();
        resolve({ size: downloaded });
      });

      res.on('error', (err) => {
        file.close();
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }).catch(reject);
  });
}

// ── GitHub API ──

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    httpsGet(REPO_API).then(res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          resolve({
            tagName: release.tag_name || '',
            name: release.name || release.tag_name || '',
            body: release.body || '',
            htmlUrl: release.html_url || '',
            assets: (release.assets || []).map(a => ({
              name: a.name,
              url: a.browser_download_url,
              size: a.size
            }))
          });
        } catch (e) {
          reject(e);
        }
      });
      res.on('error', reject);
    }).catch(reject);
  });
}

// ── Release tarball update ──

/**
 * Download and extract the pre-built release tarball for the current platform.
 * @param {string} pluginRoot
 * @param {string} tagName — e.g. "v0.1.0"
 * @returns {Promise<{success: boolean, message: string}>}
 */
function updateFromRelease(pluginRoot, tagName) {
  return new Promise((resolve) => {
    const platform = getPlatform();
    const arch = getArch();
    const ext = getAssetExt();
    const assetName = `claude-pet-${tagName}-${platform}-${arch}.${ext}`;
    const downloadUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/${tagName}/${assetName}`;

    const tmpDir = path.join(os.tmpdir(), `claude-pet-update-${Date.now()}`);
    const tmpFile = path.join(tmpDir, assetName);

    try {
      fs.mkdirSync(tmpDir, { recursive: true });
    } catch (e) {
      return resolve({ success: false, message: `Failed to create temp dir: ${e.message}` });
    }

    // Step 1: Download
    downloadToFile(downloadUrl, tmpFile).then(({ size }) => {
      // Step 2: Extract
      const extractDir = path.join(tmpDir, 'extracted');
      fs.mkdirSync(extractDir, { recursive: true });

      let extractPromise;
      if (ext === 'zip') {
        // Windows: use PowerShell
        extractPromise = new Promise((res, rej) => {
          const ps = spawn('powershell', [
            '-Command',
            `Expand-Archive -Path "${tmpFile}" -DestinationPath "${extractDir}" -Force`
          ], { stdio: 'pipe', timeout: 60000 });

          let stderr = '';
          ps.stderr.on('data', d => { stderr += d.toString(); });
          ps.on('close', code => {
            if (code === 0) res();
            else rej(new Error(stderr.trim() || `Expand-Archive exited ${code}`));
          });
          ps.on('error', rej);
        });
      } else {
        // macOS / Linux: use tar
        extractPromise = new Promise((res, rej) => {
          const tar = spawn('tar', ['-xzf', tmpFile, '-C', extractDir], {
            stdio: 'pipe', timeout: 60000
          });

          let stderr = '';
          tar.stderr.on('data', d => { stderr += d.toString(); });
          tar.on('close', code => {
            if (code === 0) res();
            else rej(new Error(stderr.trim() || `tar exited ${code}`));
          });
          tar.on('error', rej);
        });
      }

      return extractPromise.then(() => {
        // Step 3: Find extracted claude-pet directory
        let srcDir = extractDir;
        const subDir = path.join(extractDir, 'claude-pet');
        if (fs.existsSync(subDir) && fs.statSync(subDir).isDirectory()) {
          srcDir = subDir;
        }

        // Step 4: Replace files
        // Copy new files over old installation, preserving .git if it exists
        copyRecursive(srcDir, pluginRoot, { preserveGit: isGitRepo(pluginRoot) });

        // Fix permissions on Unix
        if (platform !== 'win32') {
          const electronBin = path.join(pluginRoot, 'electron', 'node_modules', 'electron', 'dist', 'electron');
          if (fs.existsSync(electronBin)) {
            try { fs.chmodSync(electronBin, 0o755); } catch (_) {}
          }
          const sandbox = path.join(pluginRoot, 'electron', 'node_modules', 'electron', 'dist', 'chrome-sandbox');
          if (fs.existsSync(sandbox)) {
            try { fs.chmodSync(sandbox, 0o4755); } catch (_) {}
          }
        }

        // Step 5: Cleanup
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}

        // Clear skippedVersion
        try {
          const state = loadState();
          delete state.skippedVersion;
          state.lastCheck = new Date().toISOString();
          saveState(state);
        } catch (_) {}

        resolve({ success: true, message: 'Updated successfully. Please restart the pet.' });
      });
    }).catch(err => {
      // Cleanup temp files on error
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
      resolve({ success: false, message: `Download/extract failed: ${err.message}` });
    });
  });
}

/**
 * Recursively copy src into dest, overwriting existing files.
 */
function copyRecursive(src, dest, opts = {}) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === '.git' && opts.preserveGit) continue; // Keep existing .git
      copyRecursive(srcPath, destPath, opts);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ── Git-based update (legacy) ──

function updateFromGit(pluginRoot) {
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
        if (gitErr && !gitErr.includes('Already up to date')) {
          return resolve({ success: false, message: `git pull failed: ${gitErr.trim()}` });
        }
      }

      // Step 2: npm install
      const npm = spawn('npm', ['install', '--silent'], {
        cwd: electronDir,
        stdio: 'pipe',
        env: { ...process.env },
        timeout: 120000
      });

      let npmOut = '', npmErr = '';

      npm.stdout.on('data', d => { npmOut += d.toString(); });
      npm.stderr.on('data', d => { npmErr += d.toString(); });

      npm.on('close', (npmCode) => {
        if (npmCode !== 0) {
          return resolve({ success: false, message: `npm install failed: ${npmErr.trim() || npmOut.trim()}` });
        }
        // Clear skippedVersion
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
   * Run update. Auto-detects installation type:
   *   - Git repo → git pull + npm install
   *   - Release tarball → download + extract
   * @param {string} pluginRoot
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async runUpdate(pluginRoot) {
    // Get latest tag for asset URL construction
    let tagName;
    try {
      const release = await fetchLatestRelease();
      tagName = release.tagName;
    } catch (err) {
      // If we can't fetch, try git pull anyway (might have the tag info cached)
      if (isGitRepo(pluginRoot)) {
        return updateFromGit(pluginRoot);
      }
      return { success: false, message: `Could not fetch release info: ${err.message}` };
    }

    if (isGitRepo(pluginRoot)) {
      return updateFromGit(pluginRoot);
    }

    return updateFromRelease(pluginRoot, tagName);
  },

  // Exported for testing / manual check
  getLocalVersion,
  compareVersions,
  isGitRepo,
  CHECK_INTERVAL_MS
};
