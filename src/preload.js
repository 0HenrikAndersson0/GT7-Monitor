const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gt7Telemetry', {
  onUpdate: (callback) => ipcRenderer.on('telemetry-update', (_event, data) => callback(data))
});
