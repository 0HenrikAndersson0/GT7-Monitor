window.gt7Telemetry.onUpdate((data) => {
  document.getElementById('speed').innerText = `${data.speed.toFixed(1)} km/h`;
  document.getElementById('rpm').innerText = data.rpm.toFixed(0);

  let gearStr = data.gear.toString();
  if (data.gear === 0) gearStr = 'R';
  document.getElementById('gear').innerText = gearStr;

  document.getElementById('throttle').innerText = `${data.throttle.toFixed(0)}%`;
  document.getElementById('brake').innerText = `${data.brake.toFixed(0)}%`;
});
