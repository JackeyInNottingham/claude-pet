const { app, BrowserWindow, ipcMain } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');

let petWindow = null;
let httpServer = null;
const os = require('os');
const PORT_FILE = path.join(os.homedir(), '.claude-pet', 'port');
const LOCK_FILE = path.join(os.homedir(), '.claude-pet', '.launcher.lock');
const POSITION_FILE = path.join(os.homedir(), '.claude-pet', 'position.json');
const AUTO_START_FILE = path.join(os.homedir(), '.claude-pet', 'auto-start-disabled');
const CONFIG_FILE = path.join(os.homedir(), '.claude-pet', 'config.json');

// Plugin root is electron/../ = the repo root
const PLUGIN_ROOT = path.dirname(__dirname);
const updateChecker = require('./update-checker');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (_) {}
  return {};
}

function createPetWindow() {
  petWindow = new BrowserWindow({
    width: 256,
    height: 256,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  petWindow.loadFile(path.join(__dirname, 'index.html'));
  // macOS: show on all workspaces
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  petWindow.on('closed', () => { petWindow = null; });
}

function loadPosition() {
  try {
    if (fs.existsSync(POSITION_FILE)) {
      return JSON.parse(fs.readFileSync(POSITION_FILE, 'utf8'));
    }
  } catch (_) {}
  return null;
}

function savePosition() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const [x, y] = petWindow.getPosition();
  const dir = path.dirname(POSITION_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(POSITION_FILE, JSON.stringify({ x, y }));
}

function applyPosition() {
  const pos = loadPosition();
  if (pos && petWindow && !petWindow.isDestroyed()) {
    petWindow.setPosition(pos.x, pos.y);
  }
}

function setupTray() {
  const { Tray, Menu, nativeImage } = require('electron');
  // Create a simple 16x16 tray icon programmatically
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAPklEQVQ4T2NkYPj/n4EBBJgYKAwYqSwelDYYqSwekjYY6eFmoLKBSBuM/w8TI00DkZoY/v+H0TQbiJowGBoAAHcYDGcNPLWZAAAAAElFTkSuQmCC'
  );
  const tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Start Pet', click: () => { if (!petWindow) createPetWindow(); } },
    { label: 'Stop Pet', click: () => { if (petWindow) petWindow.close(); } },
    { type: 'separator' },
    { label: 'Quit Claude Pet', click: () => { app.quit(); } }
  ]);
  tray.setToolTip('Claude Pet');
  tray.setContextMenu(contextMenu);
}

function startHttpServer() {
  httpServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (req.method === 'POST' && req.url === '/status') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { state, detail } = JSON.parse(body);
          sendStateToRenderer(state || 'idle', detail || '');
          res.writeHead(200);
          res.end('ok');
        } catch (e) {
          res.writeHead(400);
          res.end('bad request');
        }
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/permission') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          petWindow.webContents.send('permission-request', data);
          res.writeHead(200);
          res.end(JSON.stringify({ received: true }));
        } catch (e) {
          res.writeHead(400);
          res.end('bad request');
        }
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/shutdown') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'shutting down' }));
      app.quit();
      return;
    }

    res.writeHead(404);
    res.end('not found');
  });

  httpServer.on('error', (err) => {
    console.error('Claude Pet HTTP server error:', err.message);
    try { fs.unlinkSync(PORT_FILE); } catch (_) {}
  });

  httpServer.listen(0, '127.0.0.1', () => {
    const port = httpServer.address().port;
    const dir = path.dirname(PORT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PORT_FILE, `${port}\n${process.pid}`);
    // Release launcher lock — pet is now ready to accept connections
    try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
    console.log(`Claude Pet HTTP server on 127.0.0.1:${port} (pid ${process.pid})`);
  });
}

function sendStateToRenderer(state, detail) {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('state-change', { state, detail, timestamp: Date.now() });
  }
}

// IPC
ipcMain.on('permission-response', (_event, { requestId, decision }) => {
  // Decision recorded; hook script polls or we write response file
  const responseFile = path.join(require('os').homedir(), '.claude-pet', 'permission-response');
  fs.writeFileSync(responseFile, JSON.stringify({ requestId, decision, timestamp: Date.now() }));
});

// IPC: handle position save on drag end
ipcMain.on('window-dragged', () => {
  savePosition();
});

// ── Version update check ──

async function checkAndNotify() {
  if (!updateChecker.shouldCheck()) return;
  try {
    const result = await updateChecker.checkForUpdates(PLUGIN_ROOT);
    updateChecker.recordCheck();
    if (result.hasUpdate && petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send('update-available', {
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion,
        releaseNotes: result.releaseNotes,
        releaseUrl: result.releaseUrl
      });
    }
  } catch (_) {
    // Silently ignore check failures — don't bother the user
  }
}

// IPC: update action from renderer
ipcMain.on('update-action', async (event, payload) => {
  const action = payload && payload.action;

  if (action === 'update') {
    try {
      const result = await updateChecker.runUpdate(PLUGIN_ROOT);
      event.reply('update-result', result);
    } catch (err) {
      event.reply('update-result', { success: false, message: err.message });
    }
  } else if (action === 'skip' && payload.version) {
    // Mark the specified version as skipped so we don't re-prompt
    try {
      const stateFile = path.join(os.homedir(), '.claude-pet', 'version.json');
      let state = {};
      if (fs.existsSync(stateFile)) {
        state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      }
      state.lastCheck = new Date().toISOString();
      state.skippedVersion = payload.version;
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    } catch (_) {}
  }
});

app.whenReady().then(() => {
  createPetWindow();
  startHttpServer();
  setupTray();
  // Apply saved position and send config after window is shown
  petWindow.webContents.on('did-finish-load', () => {
    applyPosition();
    const config = loadConfig();
    petWindow.webContents.send('config', config);

    // Start version update checker
    // First check after 60s to avoid slowing down startup
    setTimeout(() => checkAndNotify(), 60000);
    // Then check every 30 minutes (shouldCheck() enforces 24h minimum interval)
    setInterval(() => checkAndNotify(), 30 * 60 * 1000);
  });
});

app.on('before-quit', () => {
  // Clean up IPC files on any exit path
  try { fs.unlinkSync(PORT_FILE); } catch (_) {}
  try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
  try { fs.unlinkSync(path.join(os.homedir(), '.claude-pet', 'permission-response')); } catch (_) {}
  if (httpServer) httpServer.close();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createPetWindow();
});
