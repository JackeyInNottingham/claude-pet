const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onStateChange: (callback) => {
    ipcRenderer.on('state-change', (_event, data) => callback(data));
  },
  onPermissionRequest: (callback) => {
    ipcRenderer.on('permission-request', (_event, data) => callback(data));
  },
  sendPermissionResponse: (requestId, decision) => {
    ipcRenderer.send('permission-response', { requestId, decision });
  },
  onCommand: (callback) => {
    ipcRenderer.on('command', (_event, data) => callback(data));
  },
  onConfig: (callback) => {
    ipcRenderer.on('config', (_event, data) => callback(data));
  },
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (_event, data) => callback(data));
  },
  onUpdateResult: (callback) => {
    ipcRenderer.on('update-result', (_event, data) => callback(data));
  },
  sendUpdateAction: (payload) => {
    ipcRenderer.send('update-action', payload);
  }
});

// Notify main process when drag ends (for position persistence)
window.addEventListener('mouseup', () => {
  ipcRenderer.send('window-dragged');
});
