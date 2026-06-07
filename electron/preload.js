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
  }
});
