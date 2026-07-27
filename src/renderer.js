function formatTime(ms) {
  if (ms <= 0) return '00:00.000';
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = ms % 1000;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

window.gt7Telemetry.onUpdate((data) => {
  // Engine & Transmission
  document.getElementById('speed_kmh').innerText = `${data.speed_kmh.toFixed(1)} km/h`;
  document.getElementById('rpm').innerText = data.rpm.toFixed(0);

  let currentGearStr = data.current_gear.toString();
  if (data.current_gear === 0) currentGearStr = 'R';
  document.getElementById('gear').innerText = `${currentGearStr} / ${data.suggested_gear}`;

  document.getElementById('turbo_boost').innerText = data.turbo_boost.toFixed(2);
  document.getElementById('water_temp').innerText = `${data.water_temp.toFixed(1)} °C`;
  document.getElementById('oil_temp').innerText = `${data.oil_temp.toFixed(1)} °C`;
  document.getElementById('oil_pressure').innerText = `${data.oil_pressure.toFixed(2)} Bar`;

  // Laps & Fuel
  document.getElementById('current_lap').innerText = data.current_lap;
  document.getElementById('best_lap_time').innerText = formatTime(data.best_lap_time);
  document.getElementById('last_lap_time').innerText = formatTime(data.last_lap_time);
  document.getElementById('fuel_remaining').innerText = data.fuel_remaining.toFixed(1);
  document.getElementById('fuel_capacity').innerText = data.fuel_capacity.toFixed(1);

  // Inputs
  document.getElementById('throttle').innerText = `${data.throttle.toFixed(0)}%`;
  document.getElementById('brake').innerText = `${data.brake.toFixed(0)}%`;

  // Tires
  document.getElementById('tire_temp_fl').innerText = `${data.tire_temp_fl.toFixed(1)} °C`;
  document.getElementById('tire_temp_fr').innerText = `${data.tire_temp_fr.toFixed(1)} °C`;
  document.getElementById('tire_temp_rl').innerText = `${data.tire_temp_rl.toFixed(1)} °C`;
  document.getElementById('tire_temp_rr').innerText = `${data.tire_temp_rr.toFixed(1)} °C`;

  // Motion
  document.getElementById('rot_pitch').innerText = data.rot_pitch.toFixed(3);
  document.getElementById('rot_yaw').innerText = data.rot_yaw.toFixed(3);
  document.getElementById('rot_roll').innerText = data.rot_roll.toFixed(3);
  document.getElementById('vel_x').innerText = `${data.vel_x.toFixed(2)} m/s`;
  document.getElementById('vel_y').innerText = `${data.vel_y.toFixed(2)} m/s`;
  document.getElementById('vel_z').innerText = `${data.vel_z.toFixed(2)} m/s`;
  document.getElementById('car_body_x').innerText = data.car_body_x.toFixed(2);
  document.getElementById('car_body_y').innerText = data.car_body_y.toFixed(2);
  document.getElementById('car_body_z').innerText = data.car_body_z.toFixed(2);

  // System
  document.getElementById('pkg_id').innerText = data.pkg_id;
});
