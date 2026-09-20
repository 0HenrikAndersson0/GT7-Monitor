function formatTime(ms) {
  if (ms <= 0) return '00:00.000';
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = ms % 1000;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

// Preload voices to prevent initial voice loading delays causing different voices
window.speechSynthesis.getVoices();

let subtitleTimeout;
window.gt7Telemetry.onEngineerMessage((msg) => {
  console.log("Engineer says:", msg);
  
  // Show Subtitle
  const subDiv = document.getElementById('subtitles');
  if (subDiv) {
    subDiv.innerText = msg;
    subDiv.style.display = 'block';
    clearTimeout(subtitleTimeout);
    subtitleTimeout = setTimeout(() => { subDiv.style.display = 'none'; }, 8000);
  }

  const utterance = new SpeechSynthesisUtterance(msg);
  const voices = speechSynthesis.getVoices();
  utterance.voice = voices.find(v => v.name === 'Serena') || 
                    voices.find(v => v.name === 'Samantha') || 
                    voices.find(v => v.name.includes('Female')) || 
                    (voices.length > 0 ? voices[0] : null);
  // window.speechSynthesis.speak(utterance); // Replaced by high-quality Kokoro TTS
});

window.gt7Telemetry.onUpdate((data) => {
  // Tires (Left Panel)
  document.getElementById('tire_fl').innerText = data.tire_temp_fl.toFixed(1);
  document.getElementById('tire_fr').innerText = data.tire_temp_fr.toFixed(1);
  document.getElementById('tire_rl').innerText = data.tire_temp_rl.toFixed(1);
  document.getElementById('tire_rr').innerText = data.tire_temp_rr.toFixed(1);

  // Center Panel
  let gearStr = data.current_gear.toString();
  if (data.current_gear === 0) gearStr = 'R';
  if (data.current_gear === 15) gearStr = 'N';
  document.getElementById('dash_gear').innerText = gearStr;

  // Use speed_val separately from the 'km/h' text
  document.getElementById('dash_speed_val').innerText = data.speed_kmh.toFixed(0).padStart(3, '0');
  document.getElementById('dash_rpm').innerText = data.rpm.toFixed(0).padStart(5, '0');

  // Laps (Right Panel)
  document.getElementById('dash_current_lap').innerText = `LAP ${data.current_lap}`;
  document.getElementById('dash_last_lap').innerText = formatTime(data.last_lap_time);
  document.getElementById('dash_best_lap').innerText = formatTime(data.best_lap_time);

  // Bottom Row
  document.getElementById('dash_throttle').innerText = data.throttle.toFixed(0);
  document.getElementById('dash_brake').innerText = data.brake.toFixed(0);
  document.getElementById('dash_boost').innerText = data.turbo_boost.toFixed(1);

  // Dummy values mapped to match the layout boxes
  document.getElementById('dash_throttle_bar').innerText = (data.throttle / 100).toFixed(3);
  document.getElementById('dash_rpm_pct').innerText = Math.min(99, Math.floor((data.rpm / 8000) * 100)).toString();
  document.getElementById('dash_current_lap_box').innerText = data.current_lap.toString();

  // Fuel Box
  document.getElementById('dash_fuel').innerText = data.fuel_remaining.toFixed(1);
  document.getElementById('dash_capacity').innerText = data.fuel_capacity.toFixed(0);
  
  // Screen 2 Timing
  const s2BestLap = document.getElementById('s2_dash_best_lap');
  const s2LastLap = document.getElementById('s2_dash_last_lap');
  if (s2BestLap) s2BestLap.innerText = formatTime(data.best_lap_time);
  if (s2LastLap) s2LastLap.innerText = formatTime(data.last_lap_time);
  
  if (data.currentLapSectorTimes) {
    for (let i = 0; i < 5; i++) {
      const secEl = document.getElementById(`sec${i}`);
      if (!secEl) continue;
      
      const currTime = data.currentLapSectorTimes[i];
      const bestTime = data.bestSectorTimes ? data.bestSectorTimes[i] : null;
      
      if (currTime) {
        secEl.innerText = formatTime(currTime);
        if (bestTime && currTime <= bestTime) {
          secEl.className = 'sector-val best';
        } else {
          secEl.className = 'sector-val';
        }
      } else {
        secEl.innerText = '--:--.---';
        secEl.className = 'sector-val';
      }
    }
  }

  // Lap 1 Warning
  const lap1Warning = document.getElementById('lap1Warning');
  const sectorLap1Warning = document.getElementById('sectorLap1Warning');
  
  if (data.current_lap > 1) {
    if (lap1Warning) lap1Warning.style.display = 'none';
    if (sectorLap1Warning) sectorLap1Warning.style.display = 'none';
  } else {
    if (lap1Warning) lap1Warning.style.display = 'block';
    if (sectorLap1Warning) sectorLap1Warning.style.display = 'block';
  }
});

// Screen Swapping Logic
let currentScreen = 1;
const totalScreens = 3;
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') {
    currentScreen = currentScreen < totalScreens ? currentScreen + 1 : 1;
    updateScreenVisibility();
  } else if (e.key === 'ArrowLeft') {
    currentScreen = currentScreen > 1 ? currentScreen - 1 : totalScreens;
    updateScreenVisibility();
  }
});

let touchStartX = 0;
let touchEndX = 0;

window.addEventListener('touchstart', e => {
  touchStartX = e.changedTouches[0].screenX;
});

window.addEventListener('touchend', e => {
  touchEndX = e.changedTouches[0].screenX;
  handleSwipe();
});

function handleSwipe() {
  const diff = touchStartX - touchEndX;
  if (Math.abs(diff) > 50) { // Minimum swipe distance
    if (diff > 0) {
      // Swiped left (next screen)
      currentScreen = currentScreen < totalScreens ? currentScreen + 1 : 1;
    } else {
      // Swiped right (previous screen)
      currentScreen = currentScreen > 1 ? currentScreen - 1 : totalScreens;
    }
    updateScreenVisibility();
  }
}

function updateScreenVisibility() {
  for (let i = 1; i <= totalScreens; i++) {
    const s = document.getElementById(`screen${i}`);
    if (s) {
      if (i === currentScreen) {
        s.classList.add('active');
      } else {
        s.classList.remove('active');
      }
    }
  }
}


// Settings Modal Logic
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const botTokenInput = document.getElementById('botToken');
const channelIdInput = document.getElementById('channelId');

settingsBtn.addEventListener('click', async (e) => {
  e.preventDefault();
  const config = await window.gt7Telemetry.getDiscordConfig();
  botTokenInput.value = config.token || '';
  channelIdInput.value = config.channelId || '';
  
  try {
    const ips = await window.gt7Telemetry.getLocalIps();
    const ipListEl = document.getElementById('ipList');
    if (ipListEl) {
      if (ips && ips.length > 0) {
        ipListEl.innerHTML = ips.map(ip => `<li>http://${ip}:3000/dash.html</li>`).join('');
      } else {
        ipListEl.innerHTML = '<li>No network interfaces found.</li>';
      }
    }
  } catch (err) {
    console.error("Could not fetch local IPs:", err);
  }

  settingsModal.style.display = 'block';
});

closeSettingsBtn.addEventListener('click', () => {
  settingsModal.style.display = 'none';
});

saveSettingsBtn.addEventListener('click', async () => {
  const token = botTokenInput.value.trim();
  const channelId = channelIdInput.value.trim();
  
  saveSettingsBtn.innerText = 'Saving...';
  const success = await window.gt7Telemetry.saveDiscordConfig(token, channelId);
  
  if (success) {
    saveSettingsBtn.innerText = 'Saved!';
    setTimeout(() => {
      saveSettingsBtn.innerText = 'Save & Restart Bot';
      settingsModal.style.display = 'none';
    }, 1000);
  } else {
    saveSettingsBtn.innerText = 'Error Saving';
    setTimeout(() => {
      saveSettingsBtn.innerText = 'Save & Restart Bot';
    }, 2000);
  }
});

if (window.gt7Telemetry.onTtsProgress) {
  window.gt7Telemetry.onTtsProgress((info) => {
    const container = document.getElementById('ttsProgressContainer');
    const bar = document.getElementById('ttsProgressBar');
    if (!container || !bar) return;
    
    if (info.status === 'initiate' || info.status === 'download' || info.status === 'progress') {
      container.style.display = 'block';
      if (info.total && info.loaded) {
         const pct = (info.loaded / info.total) * 100;
         bar.style.width = `${pct}%`;
      }
    } else if (info.status === 'done' || info.status === 'ready') {
      setTimeout(() => { container.style.display = 'none'; }, 1000);
    }
  });
}

// Fullscreen & Wake Lock
let wakeLock = null;
const fullscreenBtn = document.getElementById('fullscreenBtn');
if (fullscreenBtn) {
  fullscreenBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    
    // Toggle Fullscreen
    if (!document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen();
        fullscreenBtn.innerText = '⛶ Exit Fullscreen';
      } catch (err) {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      }
    } else {
      document.exitFullscreen();
      fullscreenBtn.innerText = '⛶ Fullscreen';
    }

    // Request Wake Lock
    if ('wakeLock' in navigator && !wakeLock) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
        });
      } catch (err) {
        console.error(`Wake Lock error: ${err.message}`);
      }
    }
  });

  // Re-acquire wake lock if page becomes visible again
  document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  });
}


// Play high-quality audio locally if Discord is not connected
if (window.gt7Telemetry.onPlayAudio) {
  window.gt7Telemetry.onPlayAudio((audioUrl) => {
    console.log("Playing local audio:", audioUrl);
    const finalUrl = window.location.protocol === 'file:' ? `http://localhost:3000${audioUrl}` : audioUrl;
    const audio = new Audio(finalUrl);
    audio.play().catch(e => console.error("Error playing local audio:", e));
  });
}
