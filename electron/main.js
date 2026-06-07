const { app, BrowserWindow, ipcMain } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');

let petWindow = null;
let httpServer = null;
const os = require('os');
const PORT_FILE = path.join(os.homedir(), '.claude-pet', 'port');
const POSITION_FILE = path.join(os.homedir(), '.claude-pet', 'position.json');
const AUTO_START_FILE = path.join(os.homedir(), '.claude-pet', 'auto-start-disabled');

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

    res.writeHead(404);
    res.end('not found');
  });

  httpServer.listen(0, '127.0.0.1', () => {
    const port = httpServer.address().port;
    const dir = path.dirname(PORT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PORT_FILE, String(port));
    console.log(`Claude Pet HTTP server on 127.0.0.1:${port}`);
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

app.whenReady().then(() => {
  createPetWindow();
  startHttpServer();
  setupTray();
  // Apply saved position after window is shown
  petWindow.webContents.on('did-finish-load', () => {
    applyPosition();
  });
});

app.on('window-all-closed', () => {
  if (httpServer) httpServer.close();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createPetWindow();
});
