const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let petWindow = null;

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
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  petWindow.on('closed', () => { petWindow = null; });
}

app.whenReady().then(createPetWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createPetWindow();
});

// IPC: permission response from renderer
ipcMain.on('permission-response', (_event, { requestId, decision }) => {
  petWindow.webContents.send('permission-resolved', { requestId, decision });
});

// IPC: send state from main to renderer
function sendStateToRenderer(state, detail) {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('state-change', { state, detail, timestamp: Date.now() });
  }
}

module.exports = { createPetWindow, sendStateToRenderer };
