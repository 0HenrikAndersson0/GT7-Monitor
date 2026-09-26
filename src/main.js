const { app, BrowserWindow, ipcMain, powerSaveBlocker } = require('electron');
const path = require('path');
const dgram = require('dgram');
const os = require('os');
const { salsa20 } = require('@noble/ciphers/salsa.js');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const SEND_PORT = 33739;
const RECEIVE_PORT = 33740;

let activePsIp = process.env.PS_IP || null;

const KEY = Buffer.from("Simulator Interface Packet GT7 v", 'ascii');

const RaceEngineer = require('./engineer');
const discordBot = require('./discordBot');
const engineer = new RaceEngineer();

let mainWindow;

// --- Web Server Setup ---
const webApp = express();
webApp.use(express.static(__dirname)); // Serve src directory statically
webApp.use('/tmpaudio', express.static(os.tmpdir())); // Serve generated audio files
const webServer = http.createServer(webApp);
const wss = new WebSocket.Server({ server: webServer });

wss.on('connection', (ws) => {
  console.log('[Web] New client connected');
  // Send the track map immediately if it is already mapped
  if (engineer.referenceLapPath && engineer.sectors) {
    ws.send(JSON.stringify({
      type: 'map-ready',
      data: { path: engineer.referenceLapPath, sectors: engineer.sectors }
    }));
  }
});

function broadcastWs(type, data) {
  const msg = JSON.stringify({ type, data });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

webServer.listen(3000, '0.0.0.0', () => {
  console.log('[*] Web server running on http://0.0.0.0:3000');
});
// ------------------------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  engineer.onMessage = (msg) => {
    console.log(`[Engineer]: ${msg}`);
    discordBot.speak(msg);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('engineer-message', msg);
    }
    broadcastWs('engineer-message', msg);
  };

  engineer.onMapReady = (path, sectors) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('map-ready', { path, sectors });
    }
    broadcastWs('map-ready', { path, sectors });
  };

  mainWindow.loadFile(path.join(__dirname, 'dash.html'));
}

app.whenReady().then(() => {
  powerSaveBlocker.start('prevent-display-sleep');
  
  // Settings IPC
  const fs = require('fs');
  const configPath = path.join(app.getPath('userData'), 'config.json');
  
  ipcMain.handle('get-discord-config', () => {
    try {
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
    } catch (e) {
      console.error("Failed to read config", e);
    }
    return { token: '', channelId: '' };
  });

  ipcMain.handle('get-local-ips', () => {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push(iface.address);
        }
      }
    }
    return ips;
  });

  ipcMain.handle('save-discord-config', (event, token, channelId) => {
    try {
      fs.writeFileSync(configPath, JSON.stringify({ token, channelId }));
      // Restart discord bot with new tokens
      discordBot.start();
      return true;
    } catch (e) {
      console.error("Failed to save config", e);
      return false;
    }
  });

  discordBot.setProgressCallback((info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tts-progress', info);
    }
    broadcastWs('tts-progress', info);
  });

  discordBot.setLocalAudioCallback((filename) => {
    const audioUrl = `/tmpaudio/${filename}`;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('play-audio', audioUrl);
    }
    broadcastWs('play-audio', audioUrl);
  });

  discordBot.setSpeakCondition(() => !engineer.isInCorner);
  
  discordBot.start();
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  startTelemetry();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

function decryptPacket(raw_data) {
  if (raw_data.length < 296) {
    console.log(`[!] Dropping packet. Length: ${raw_data.length} (expected >= 296)`);
    return null;
  }

  // Extract IV from bytes 0x40..0x43 (64..67)
  const iv1 = raw_data.readUInt32LE(0x40);
  const iv2 = (iv1 ^ 0xDEADBEEF) >>> 0; // Use >>> 0 for unsigned 32-bit int

  // Construct 8-byte Salsa20 nonce (IV2 Little Endian + IV1 Little Endian)
  const nonce = Buffer.alloc(8);
  nonce.writeUInt32LE(iv2, 0);
  nonce.writeUInt32LE(iv1, 4);

  // According to noble-ciphers, stream ciphers are Xor:
  // Decryption is same as encryption
  // We need Uint8Array arguments for noble-ciphers
  const keyArray = new Uint8Array(KEY.buffer, KEY.byteOffset, KEY.length);
  const nonceArray = new Uint8Array(nonce.buffer, nonce.byteOffset, nonce.length);
  const dataArray = new Uint8Array(raw_data.buffer, raw_data.byteOffset, raw_data.length);

  const decryptedArray = salsa20(keyArray, nonceArray, dataArray);
  const decrypted = Buffer.from(decryptedArray);

  // Verify header magic '0S7G'
  if (decrypted[0] === 0x30 && decrypted[1] === 0x53 && decrypted[2] === 0x37 && decrypted[3] === 0x47) {
    return decrypted;
  }
  
  const magic = decrypted.readInt32LE(0);
  console.log(`[!] Decryption failed. Magic: 0x${(magic >>> 0).toString(16)} (expected 0x47375330). pkt len: ${raw_data.length}`);
  return null;
}

function getSubnetAddresses() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const parts = iface.address.split('.');
        const base = `${parts[0]}.${parts[1]}.${parts[2]}.`;
        for (let i = 1; i <= 255; i++) {
          ips.push(base + i);
        }
      }
    }
  }
  return ips;
}

function startTelemetry() {
  const sock = dgram.createSocket('udp4');

  sock.on('error', (err) => {
    console.error(`Socket error:\n${err.stack}`);
    sock.close();
  });

  sock.on('message', (msg, rinfo) => {
    if (!activePsIp) {
      activePsIp = rinfo.address;
      console.log(`[+] Discovered PlayStation at ${activePsIp}`);
    }

    const decrypted = decryptPacket(msg);
    if (decrypted) {
      const pkg_id = decrypted.readInt32LE(0x70);
      const best_lap_time = decrypted.readInt32LE(0x78);
      const last_lap_time = decrypted.readInt32LE(0x7C);
      const current_lap = decrypted.readInt16LE(0x74);
      
      const suggestedgear_gear = decrypted.readUInt8(0x90);
      const current_gear = suggestedgear_gear & 0x0F;
      const suggested_gear = suggestedgear_gear >> 4;
      
      const speed_kmh = decrypted.readFloatLE(0x4C) * 3.6;
      const rpm = decrypted.readFloatLE(0x3C);
      const turbo_boost = decrypted.readFloatLE(0x50);
      const water_temp = decrypted.readFloatLE(0x58);
      const oil_pressure = decrypted.readFloatLE(0x54);
      const oil_temp = decrypted.readFloatLE(0x5C);

      const car_body_x = decrypted.readFloatLE(0x04);
      const car_body_y = decrypted.readFloatLE(0x08);
      const car_body_z = decrypted.readFloatLE(0x0C);

      const vel_x = decrypted.readFloatLE(0x10);
      const vel_y = decrypted.readFloatLE(0x14);
      const vel_z = decrypted.readFloatLE(0x18);

      const rot_pitch = decrypted.readFloatLE(0x1C);
      const rot_yaw = decrypted.readFloatLE(0x20);
      const rot_roll = decrypted.readFloatLE(0x24);

      const tire_temp_fl = decrypted.readFloatLE(0x60);
      const tire_temp_fr = decrypted.readFloatLE(0x64);
      const tire_temp_rl = decrypted.readFloatLE(0x68);
      const tire_temp_rr = decrypted.readFloatLE(0x6C);

      const throttle = (decrypted.readUInt8(0x91) / 255.0) * 100.0;
      const brake = (decrypted.readUInt8(0x92) / 255.0) * 100.0;
      const fuel_capacity = decrypted.readFloatLE(0x48);
      const fuel_remaining = decrypted.readFloatLE(0x44);

      const telemetryData = {
        pkg_id,
        best_lap_time,
        last_lap_time,
        current_lap,
        current_gear,
        suggested_gear,
        speed_kmh,
        rpm,
        turbo_boost,
        water_temp,
        oil_pressure,
        oil_temp,
        car_body_x,
        car_body_y,
        car_body_z,
        vel_x,
        vel_y,
        vel_z,
        rot_pitch,
        rot_yaw,
        rot_roll,
        tire_temp_fl,
        tire_temp_fr,
        tire_temp_rl,
        tire_temp_rr,
        throttle,
        brake,
        fuel_capacity,
        fuel_remaining
      };

      engineer.update(telemetryData);
      
      telemetryData.currentLapSectorTimes = engineer.currentLapSectorTimes || [];
      telemetryData.bestSectorTimes = engineer.bestSectorTimes || [];

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('telemetry-update', telemetryData);
      }
      
      broadcastWs('telemetry-update', telemetryData);
    }
  });

  sock.bind(RECEIVE_PORT, () => {
    sock.setBroadcast(true);
    console.log(`[*] Listening for GT7 telemetry on port ${RECEIVE_PORT}...`);

    // Heartbeat loop
    setInterval(() => {
      const heartbeat = Buffer.from("B");
      if (activePsIp) {
        sock.send(heartbeat, 0, heartbeat.length, SEND_PORT, activePsIp, (err) => {
          if (err) console.error('Heartbeat send error:', err);
        });
      } else {
        // Send to general broadcast just in case it works
        sock.send(heartbeat, 0, heartbeat.length, SEND_PORT, "255.255.255.255");
        
        // Scan the local subnet to cross WLAN/LAN bridges
        const scanIps = getSubnetAddresses();
        for (const ip of scanIps) {
          sock.send(heartbeat, 0, heartbeat.length, SEND_PORT, ip);
        }
      }
    }, 1000);
  });
}
