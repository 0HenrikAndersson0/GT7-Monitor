if (!window.gt7Telemetry) {
  console.log("Web client detected, initializing WebSocket connection...");
  
  const callbacks = {
    update: [],
    engineer: [],
    ttsProgress: [],
    mapReady: []
  };

  const ws = new WebSocket(`ws://${window.location.host}`);
  
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'telemetry-update') {
        callbacks.update.forEach(cb => cb(msg.data));
      } else if (msg.type === 'engineer-message') {
        callbacks.engineer.forEach(cb => cb(msg.data));
      } else if (msg.type === 'tts-progress') {
        callbacks.ttsProgress.forEach(cb => cb(msg.data));
      } else if (msg.type === 'map-ready') {
        callbacks.mapReady.forEach(cb => cb(msg.data));
      }
    } catch (e) {
      console.error("Failed to parse websocket message", e);
    }
  };

  window.gt7Telemetry = {
    onUpdate: (callback) => callbacks.update.push(callback),
    onEngineerMessage: (callback) => callbacks.engineer.push(callback),
    onTtsProgress: (callback) => callbacks.ttsProgress.push(callback),
    onMapReady: (callback) => callbacks.mapReady.push(callback),
    getDiscordConfig: async () => ({ token: '', channelId: '' }),
    getLocalIps: async () => [window.location.hostname],
    saveDiscordConfig: async (token, channelId) => {
      alert("Settings can only be changed from the desktop app.");
      return false;
    }
  };
}
