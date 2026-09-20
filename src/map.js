let trackPath = null;
let sectorBoundaries = null;
let minX = 0, maxX = 0, minZ = 0, maxZ = 0;
let scale = 1;
let offsetX = 0, offsetY = 0;

const canvas = document.getElementById('trackCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const statusDiv = document.getElementById('status');

const canvasInputs = document.getElementById('trackCanvasInputs');
const ctxInputs = canvasInputs ? canvasInputs.getContext('2d') : null;

const canvasCurves = document.getElementById('curvesCanvas');
const ctxCurves = canvasCurves ? canvasCurves.getContext('2d') : null;

// Sector Colors
const colors = ['#00ff00', '#00ccff', '#ff00ff', '#ffaa00', '#ffff00'];

let currentLapPoints = [];
let currentLapNum = 0;

function drawTrack(targetCtx, semiTransparent = false) {
  if (!trackPath || trackPath.length === 0 || !targetCtx) return;

  targetCtx.clearRect(0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
  
  targetCtx.globalAlpha = semiTransparent ? 0.4 : 1.0;
  targetCtx.lineWidth = 8;
  targetCtx.lineCap = 'round';
  targetCtx.lineJoin = 'round';

  let currentSector = 0;
  targetCtx.beginPath();
  targetCtx.strokeStyle = semiTransparent ? '#555' : colors[currentSector];
  
  for (let i = 0; i < trackPath.length; i++) {
    const pt = trackPath[i];
    
    // Check if we crossed a sector boundary
    if (currentSector < sectorBoundaries.length && pt.distance >= sectorBoundaries[currentSector]) {
      targetCtx.stroke(); // Draw previous sector
      currentSector++;
      targetCtx.beginPath();
      targetCtx.strokeStyle = semiTransparent ? '#555' : colors[currentSector];
      const prevPt = trackPath[i-1];
      if (prevPt) {
        targetCtx.moveTo((prevPt.x - minX) * scale + offsetX, (prevPt.z - minZ) * scale + offsetY);
      }
    }
    
    const cx = (pt.x - minX) * scale + offsetX;
    const cy = (pt.z - minZ) * scale + offsetY;
    
    if (i === 0) {
      targetCtx.moveTo(cx, cy);
    } else {
      targetCtx.lineTo(cx, cy);
    }
  }
  targetCtx.stroke();
  
  // Draw Start/Finish Line
  const startPt = trackPath[0];
  const sx = (startPt.x - minX) * scale + offsetX;
  const sy = (startPt.z - minZ) * scale + offsetY;
  targetCtx.fillStyle = '#fff';
  targetCtx.fillRect(sx - 5, sy - 5, 10, 10);
  
  targetCtx.globalAlpha = 1.0;
}

function drawInputTrace(targetCtx) {
  if (currentLapPoints.length < 2 || !targetCtx) return;
  
  targetCtx.lineCap = 'round';
  targetCtx.lineJoin = 'round';
  targetCtx.lineWidth = 4;
  
  for (let i = 1; i < currentLapPoints.length; i++) {
     const p1 = currentLapPoints[i-1];
     const p2 = currentLapPoints[i];
     
     const cx1 = (p1.car_body_x - minX) * scale + offsetX;
     const cy1 = (p1.car_body_z - minZ) * scale + offsetY;
     const cx2 = (p2.car_body_x - minX) * scale + offsetX;
     const cy2 = (p2.car_body_z - minZ) * scale + offsetY;
     
     let strokeStyle = '#888888'; // Coasting (Grey)
     if (p1.brake > 5) {
        strokeStyle = '#ff0000'; // Braking (Red)
     } else if (p1.throttle > 90) {
        strokeStyle = '#00ff00'; // Full Throttle (Green)
     } else if (p1.throttle > 5) {
        strokeStyle = '#ffaa00'; // Partial Throttle (Orange)
     }
     
     targetCtx.beginPath();
     targetCtx.moveTo(cx1, cy1);
     targetCtx.lineTo(cx2, cy2);
     targetCtx.strokeStyle = strokeStyle;
     targetCtx.stroke();
  }
}

function drawCar(targetCtx, data) {
  if (!targetCtx || !trackPath) return;

  const cx = (data.car_body_x - minX) * scale + offsetX;
  const cy = (data.car_body_z - minZ) * scale + offsetY;
  
  targetCtx.beginPath();
  targetCtx.arc(cx, cy, 6, 0, 2 * Math.PI);
  targetCtx.fillStyle = '#ff0000';
  targetCtx.fill();
  targetCtx.strokeStyle = '#fff';
  targetCtx.lineWidth = 2;
  targetCtx.stroke();
}

function drawCurves() {
  if (!ctxCurves || currentLapPoints.length < 2) return;
  
  const w = ctxCurves.canvas.width;
  const h = ctxCurves.canvas.height;
  ctxCurves.clearRect(0, 0, w, h);
  
  // Background grid
  ctxCurves.strokeStyle = '#333';
  ctxCurves.lineWidth = 1;
  ctxCurves.beginPath();
  ctxCurves.moveTo(0, h/2); ctxCurves.lineTo(w, h/2);
  ctxCurves.moveTo(0, h/4); ctxCurves.lineTo(w, h/4);
  ctxCurves.moveTo(0, 3*h/4); ctxCurves.lineTo(w, 3*h/4);
  ctxCurves.stroke();
  
  const maxPts = currentLapPoints.length;
  
  // Throttle Curve (Green)
  ctxCurves.beginPath();
  ctxCurves.strokeStyle = '#00ff00';
  ctxCurves.lineWidth = 2;
  for (let i = 0; i < maxPts; i++) {
    const pt = currentLapPoints[i];
    const x = (i / maxPts) * w;
    const y = h - (pt.throttle / 100) * h;
    if (i === 0) ctxCurves.moveTo(x, y);
    else ctxCurves.lineTo(x, y);
  }
  ctxCurves.stroke();

  // Brake Curve (Red)
  ctxCurves.beginPath();
  ctxCurves.strokeStyle = '#ff0000';
  ctxCurves.lineWidth = 2;
  for (let i = 0; i < maxPts; i++) {
    const pt = currentLapPoints[i];
    const x = (i / maxPts) * w;
    const y = h - (pt.brake / 100) * h;
    if (i === 0) ctxCurves.moveTo(x, y);
    else ctxCurves.lineTo(x, y);
  }
  ctxCurves.stroke();
}

window.gt7Telemetry.onMapReady((data) => {
  trackPath = data.path;
  sectorBoundaries = data.sectors;
  
  if (statusDiv) statusDiv.innerText = "Track Mapped Successfully!";
  
  // Calculate bounding box
  minX = Math.min(...trackPath.map(p => p.x));
  maxX = Math.max(...trackPath.map(p => p.x));
  minZ = Math.min(...trackPath.map(p => p.z));
  maxZ = Math.max(...trackPath.map(p => p.z));
  
  const trackWidth = maxX - minX;
  const trackHeight = maxZ - minZ;
  
  // Scale to fit canvas with padding
  const padding = 15;
  if (canvas) {
    const scaleX = (canvas.width - padding * 2) / trackWidth;
    const scaleY = (canvas.height - padding * 2) / trackHeight;
    scale = Math.min(scaleX, scaleY);
    offsetX = (canvas.width - (trackWidth * scale)) / 2 + padding;
    offsetY = (canvas.height - (trackHeight * scale)) / 2 + padding;
  }
  
  drawTrack(ctx, false);
  drawTrack(ctxInputs, true);
});

window.gt7Telemetry.onUpdate((data) => {
  if (!trackPath) return; // Wait for map

  if (data.current_lap > currentLapNum) {
     currentLapNum = data.current_lap;
     currentLapPoints = [];
  }
  currentLapPoints.push(data);

  // Map 1 (Sectors + Car)
  drawTrack(ctx, false);
  drawCar(ctx, data);

  // Map 2 (Trace + Car)
  drawTrack(ctxInputs, true);
  drawInputTrace(ctxInputs);
  drawCar(ctxInputs, data);
  
  // Curves
  drawCurves();
});
