const { app, BrowserWindow } = require('electron');
const path = require('path');
const dgram = require('dgram');
const { salsa20 } = require('@noble/ciphers/salsa.js');

const PS_IP = process.env.PS_IP || "192.168.1.150"; // Can be configured via environment or UI later
const SEND_PORT = 33740;
const RECEIVE_PORT = 33739;

const KEY = Buffer.from("0SEC0541029450084710540085348015", 'ascii');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
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
  if (raw_data.length !== 128) {
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

  // Verify header magic character
  if (decrypted[0] === '0'.charCodeAt(0)) {
    return decrypted;
  }
  return null;
}

function startTelemetry() {
  const sock = dgram.createSocket('udp4');

  sock.on('error', (err) => {
    console.error(`Socket error:
${err.stack}`);
    sock.close();
  });

  sock.on('message', (msg, rinfo) => {
    const decrypted = decryptPacket(msg);
    if (decrypted) {
      // Unpack all telemetry fields
      const pkg_id = decrypted.readInt32LE(0x04);
      const best_lap_time = decrypted.readInt32LE(0x0C);
      const last_lap_time = decrypted.readInt32LE(0x10);
      const current_lap = decrypted.readInt32LE(0x14);
      const current_gear = decrypted.readInt16LE(0x1C) & 0x0F;
      const suggested_gear = decrypted.readInt16LE(0x1E) & 0x0F;
      const speed_kmh = decrypted.readFloatLE(0x20) * 3.6;
      const rpm = decrypted.readFloatLE(0x24);
      const turbo_boost = decrypted.readFloatLE(0x28);
      const water_temp = decrypted.readFloatLE(0x2C);
      const oil_pressure = decrypted.readFloatLE(0x30);
      const oil_temp = decrypted.readFloatLE(0x34);

      const car_body_x = decrypted.readFloatLE(0x38);
      const car_body_y = decrypted.readFloatLE(0x3C);
      const car_body_z = decrypted.readFloatLE(0x40);

      const vel_x = decrypted.readFloatLE(0x44);
      const vel_y = decrypted.readFloatLE(0x48);
      const vel_z = decrypted.readFloatLE(0x4C);

      const rot_pitch = decrypted.readFloatLE(0x50);
      const rot_yaw = decrypted.readFloatLE(0x54);
      const rot_roll = decrypted.readFloatLE(0x58);

      const tire_temp_fl = decrypted.readFloatLE(0x60);
      const tire_temp_fr = decrypted.readFloatLE(0x64);
      const tire_temp_rl = decrypted.readFloatLE(0x68);
      const tire_temp_rr = decrypted.readFloatLE(0x6C);

      const throttle = (decrypted.readUInt8(0x70) / 255.0) * 100.0;
      const brake = (decrypted.readUInt8(0x71) / 255.0) * 100.0;
      const fuel_capacity = decrypted.readFloatLE(0x74);
      const fuel_remaining = decrypted.readFloatLE(0x78);

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

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('telemetry-update', telemetryData);
      }
    }
  });

  sock.bind(RECEIVE_PORT, () => {
    console.log(`[*] Listening for GT7 telemetry on port ${RECEIVE_PORT}...`);
  });

  // Heartbeat loop
  setInterval(() => {
    const heartbeat = Buffer.from("A");
    sock.send(heartbeat, 0, heartbeat.length, SEND_PORT, PS_IP, (err) => {
      if (err) {
        console.error('Heartbeat send error:', err);
      }
    });
  }, 1000);
}
