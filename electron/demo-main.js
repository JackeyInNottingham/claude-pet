const { app, BrowserWindow } = require('electron');
const path = require('path');

function createDemoWindow() {
  const win = new BrowserWindow({
    width: 520,
    height: 780,
    title: 'Claude Pet — Animation Demo',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'demo.html'));
  win.setMenuBarVisibility(false);
}

app.whenReady().then(createDemoWindow);
app.on('window-all-closed', () => app.quit());
