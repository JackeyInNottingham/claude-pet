const { app, BrowserWindow, ipcMain } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');

let petWindow = null;
let httpServer = null;
const PORT_FILE = path.join(require('os').homedir(), '.claude-pet', 'port');

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

app.whenReady().then(() => {
  createPetWindow();
  startHttpServer();
});

app.on('window-all-closed', () => {
  if (httpServer) httpServer.close();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createPetWindow();
});
