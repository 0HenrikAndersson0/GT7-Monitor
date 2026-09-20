const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gt7Telemetry', {
  onUpdate: (callback) => ipcRenderer.on('telemetry-update', (_event, data) => callback(data)),
  onEngineerMessage: (callback) => ipcRenderer.on('engineer-message', (_event, msg) => callback(msg)),
  onTtsProgress: (callback) => ipcRenderer.on('tts-progress', (_event, data) => callback(data)),
  onPlayAudio: (callback) => ipcRenderer.on('play-audio', (_event, url) => callback(url)),
  onMapReady: (callback) => ipcRenderer.on('map-ready', (_event, data) => callback(data)),
  getDiscordConfig: () => ipcRenderer.invoke('get-discord-config'),
  saveDiscordConfig: (token, channelId) => ipcRenderer.invoke('save-discord-config', token, channelId),
  getLocalIps: () => ipcRenderer.invoke('get-local-ips')
});
