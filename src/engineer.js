class RaceEngineer {
  constructor() {
    this.currentLap = 0;
    this.fuelAtLapStart = 0;
    this.lastLapTime = 0;
    
    // History
    this.lapTimes = [];
    this.fuelPerLap = [];
    
    // Advanced Physics Tracking
    this.initialTireRadius = null;
    this.bottomingOutCount = 0;
    this.revLimiterTimeMs = 0;
    this.maxRpmSeen = 0;
    this.oversteerCount = 0;
    
    // Track Mapping & Sectors
    this.isMappingLap = true;
    this.referenceLapPath = []; // Array of { distance, time, x, z, throttle, brake, speed }
    this.bestLapPath = [];
    this.currentLapPath = [];
    this.lapDistance = 0;
    this.lastPos = null;
    this.lapStartTime = Date.now();
    
    this.sectors = []; // Distances where sectors end
    this.currentSectorIndex = 0;
    this.referenceSectorTimes = []; // Time taken for each sector in reference lap
    this.currentSectorStartTime = 0;
    
    // Crash Detection
    this.lastSpeedKmh = 0;
    this.lastCrashTime = 0;
    this.pendingCrashTime = null;
      this.mappingInvalidated = false;

    this.onMessage = null; // Callback for when engineer speaks
    this.onMapReady = null; // Callback for sending the full track map
  }

  triggerCrash(message) {
    if (this.isMappingLap && !this.mappingInvalidated) {
      this.mappingInvalidated = true;
      if (this.onMessage) {
        if (message) {
          this.onMessage(message + " Track mapping aborted.");
        } else {
          this.onMessage("Track mapping aborted due to pace interference. Please try again on the next lap.");
        }
      }
    } else {
      if (message && this.onMessage) this.onMessage(message);
    }
    this.lastCrashTime = Date.now();
    this.pendingCrashTime = null;
  }

  update(telemetry) {
    // 0. Teleport & Reset Detection
    if (this.lastPos) {
      const dx = telemetry.car_body_x - this.lastPos.x;
      const dz = telemetry.car_body_z - this.lastPos.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      if (dist > 50) {
        // Massive teleport (e.g., pit entry, resetting to track, race restart).
        // Ignore this frame's physics completely to prevent false crashes and map corruption.
        this.lastPos = { x: telemetry.car_body_x, z: telemetry.car_body_z };
        this.lastSpeedKmh = telemetry.speed_kmh;
        this.lastYaw = telemetry.rot_yaw;
        return;
      }
    }

    // --- Crash Detection ---
    const now = Date.now();
    
    // Only check for crashes if we are actually racing (not lap 0)
    if (this.currentLap > 0 && telemetry.current_lap > 0 && now - this.lastCrashTime > 15000) {
      const speedDrop = this.lastSpeedKmh - telemetry.speed_kmh;
      
      // 25 km/h drop in a single frame (16ms) is a massive deceleration.
      // This is caused by either hitting a wall OR entering the pit lane (AI takeover).
      // Since both events ruin a mapping lap, we abort mapping immediately.
      // On normal laps, we stay silent to avoid annoying the user during pit stops.
      if (speedDrop > 25 && this.lastSpeedKmh > 50) {
        this.triggerCrash(null);
      }


      
      // Rollover and Airborne don't happen in the pit lane, so they can fire instantly.
      if (Math.abs(telemetry.rot_roll) > 1.3 && telemetry.speed_kmh > 10) {
        this.triggerCrash("You are rolling over! Hold on, are you alright?");
      }
      else if (Math.abs(telemetry.vel_y) > 15) {
        this.triggerCrash("You are airborne! Brace for impact!");
      }
    }
    this.lastSpeedKmh = telemetry.speed_kmh;

    // Detect race restart (lap number resets to 1 or 0)
    if (this.currentLap > 0 && telemetry.current_lap < this.currentLap) {
      this.currentLap = 0;
      this.isMappingLap = true;
      this.referenceLapPath = [];
      this.lapDistance = 0;
      this.lapTimes = [];
      this.fuelPerLap = [];
      this.lastPos = null;
      this.pendingCrashTime = null;
    }

    // 1. Initialize on first valid packet
    if (this.currentLap === 0 && telemetry.current_lap > 0) {
      if (telemetry.speed_kmh < 1.0) {
        // We are sitting on the starting grid waiting for the green flag.
        // Delay timer initialization until the car actually launches!
        return;
      }
      this.currentLap = telemetry.current_lap;
      this.fuelAtLapStart = telemetry.fuel_remaining;
      this.lapStartTime = Date.now();
      this.currentSectorStartTime = Date.now();
      this.lastPos = { x: telemetry.car_body_x, z: telemetry.car_body_z };
      
      if (telemetry.current_lap === 1) {
        const pepTalks = [
          "Alright, green flag, let's get out there and push hard!",
          "Okay, we are racing. Keep your inputs smooth and let's bring it home.",
          "Track is clear. Head down, find your rhythm, and let's go get 'em.",
          "Alright, let's have a good clean race. Build tire temperature carefully on this first lap."
        ];
        const pepTalk = pepTalks[Math.floor(Math.random() * pepTalks.length)];
        if (this.onMessage) this.onMessage(pepTalk);
      }
      
      return;
    }

    // --- Advanced Physics Tracking (Live) ---
    if (!this.initialTireRadius && telemetry.tire_radius_fl > 0) {
      this.initialTireRadius = {
        fl: telemetry.tire_radius_fl,
        fr: telemetry.tire_radius_fr,
        rl: telemetry.tire_radius_rl,
        rr: telemetry.tire_radius_rr
      };
    }

    // Suspension Bottoming (Values close to 0 mean full compression in GT7)
    const minSuspension = Math.min(telemetry.suspension_fl, telemetry.suspension_fr, telemetry.suspension_rl, telemetry.suspension_rr);
    if (minSuspension < 0.05 && telemetry.speed_kmh > 150) { 
       this.bottomingOutCount++;
    }

    // Shift Optimization (Dynamic Redline Detection)
    if (telemetry.rpm > this.maxRpmSeen) this.maxRpmSeen = telemetry.rpm;
    if (this.maxRpmSeen > 3000 && telemetry.rpm > this.maxRpmSeen * 0.98 && telemetry.throttle > 90) {
       this.revLimiterTimeMs += 16; // approx 60fps frame time
    }

    // Yaw Rate (Spin Detection, Oversteer, and Corner Detection)
    if (telemetry.speed_kmh > 30) {
       let deltaYaw = telemetry.rot_yaw - (this.lastYaw !== undefined ? this.lastYaw : telemetry.rot_yaw);
       while (deltaYaw > Math.PI) deltaYaw -= 2 * Math.PI;
       while (deltaYaw < -Math.PI) deltaYaw += 2 * Math.PI;
       const yawRate = Math.abs(deltaYaw);

       // Smooth the yaw rate to determine if we are in a sustained corner
       if (this.avgYawRate === undefined) this.avgYawRate = 0;
       this.avgYawRate = 0.8 * this.avgYawRate + 0.2 * yawRate;

       // Corner detection with hysteresis (0.0015 rad/frame is ~5 deg/sec)
       if (this.avgYawRate > 0.0015) {
           this.isInCorner = true;
       } else if (this.avgYawRate < 0.0005) {
           this.isInCorner = false;
       }

       if (yawRate > 0.08 && telemetry.speed_kmh > 40) { // > 270 deg/sec rotation
          // Temporarily disabled due to over-sensitivity
          // if (now - this.lastCrashTime > 15000) {
          //   if (this.onMessage) this.onMessage("You've spun out! Gather it up, are you okay?");
          //   this.lastCrashTime = now;
          // }
       } else if (yawRate > 0.03 && telemetry.throttle > 50) {
          this.oversteerCount++;
       }
    } else {
       // Too slow to be considered a significant corner for talking purposes
       this.isInCorner = false;
    }
    this.lastYaw = telemetry.rot_yaw;
    // ----------------------------------------

    // 2. Track Distance & Geographic Progress
    if (this.lastPos && telemetry.current_lap === this.currentLap) {
      const dx = telemetry.car_body_x - this.lastPos.x;
      const dz = telemetry.car_body_z - this.lastPos.z;
      const dist = Math.sqrt(dx*dx + dz*dz);
      
      this.lapDistance += dist;
      
      const currentTimeMs = Date.now() - this.lapStartTime;
      
      let mappedDistance = this.lapDistance;
      
      if (!this.isMappingLap && this.referenceLapPath.length > 0) {
        // Geographically match the car to the reference path to prevent drift from different driving lines
        if (!this.closestPathIndex) this.closestPathIndex = 0;
        
        let minDistSq = Infinity;
        let minIndex = this.closestPathIndex;
        
        // Search the next 300 points (approx 5 seconds ahead) for the closest geographic match
        const searchLimit = Math.min(this.closestPathIndex + 300, this.referenceLapPath.length);
        for (let i = this.closestPathIndex; i < searchLimit; i++) {
          const p = this.referenceLapPath[i];
          const px = p.x - telemetry.car_body_x;
          const pz = p.z - telemetry.car_body_z;
          const dSq = px*px + pz*pz;
          if (dSq < minDistSq) {
            minDistSq = dSq;
            minIndex = i;
          }
        }
        this.closestPathIndex = minIndex;
        mappedDistance = this.referenceLapPath[this.closestPathIndex].distance;
      }

      const pointData = { 
        distance: mappedDistance, 
        time: currentTimeMs,
        x: telemetry.car_body_x,
        z: telemetry.car_body_z,
        speed: telemetry.speed_kmh,
        throttle: telemetry.throttle,
        brake: telemetry.brake
      };
      this.currentLapPath.push(pointData);

      if (this.isMappingLap) {
        if (this.referenceLapPath.length === 0 || dist > 0) {
           this.referenceLapPath.push(pointData);
        }
      } else {
        if (this.currentSectorIndex < this.sectors.length) {
          const targetDistance = this.sectors[this.currentSectorIndex];
          if (mappedDistance >= targetDistance) {
            this.analyzeSector();
            this.currentSectorIndex++;
            this.currentSectorStartTime = Date.now();
          }
        }
      }
    }
    
    this.lastPos = { x: telemetry.car_body_x, z: telemetry.car_body_z };

    // 3. Lap Completion
    if (telemetry.current_lap > this.currentLap) {
      if (this.isMappingLap) {
        if (this.mappingInvalidated) {
          this.mappingInvalidated = false;
          this.referenceLapPath = [];
        } else if (this.lapDistance > 1000) { 
          this.generateSectors();
          this.isMappingLap = false;
          if (this.onMessage) this.onMessage("Track mapped. 5-Sector timing is now active.");
          if (this.onMapReady) this.onMapReady(this.referenceLapPath, this.sectors);
        }
      } else {
        // Announce the final (Yellow) sector right as we cross the finish line
        this.analyzeSector();
      }

      this.analyzeLap(telemetry);
      
      this.currentLap = telemetry.current_lap;
      this.fuelAtLapStart = telemetry.fuel_remaining;
      
      // Reset for new lap
      this.lapDistance = 0;
      this.lapStartTime = Date.now();
      this.currentSectorIndex = 0;
      this.currentSectorStartTime = Date.now();
      this.currentLapSectorTimes = [];
      this.closestPathIndex = 0;
      this.currentLapPath = [];
      
      if (telemetry.current_lap === 2 && this.onMessage) {
        this.onMessage("Mapping complete. Establishing baseline flying lap. Sector deltas will activate on lap 3.");
      }
    }
  }

  analyzeTelemetryDifference(sectorIdx) {
    if (!this.bestLapPath || this.bestLapPath.length === 0) return "";
    
    const startDist = sectorIdx === 0 ? 0 : this.sectors[sectorIdx - 1];
    const endDist = sectorIdx === 4 ? Infinity : this.sectors[sectorIdx];
    
    const bestPoints = this.bestLapPath.filter(p => p.distance >= startDist && p.distance < endDist);
    const currPoints = this.currentLapPath.filter(p => p.distance >= startDist && p.distance < endDist);
    
    if (bestPoints.length === 0 || currPoints.length === 0) return "";
    
    // 1. Min Speed (Apex Speed)
    const bestMinSpeed = Math.min(...bestPoints.map(p => p.speed));
    const currMinSpeed = Math.min(...currPoints.map(p => p.speed));
    
    // 2. Average Throttle
    const bestAvgThrottle = bestPoints.reduce((sum, p) => sum + p.throttle, 0) / bestPoints.length;
    const currAvgThrottle = currPoints.reduce((sum, p) => sum + p.throttle, 0) / currPoints.length;
    
    // 3. Braking Point
    const bestBrakePoint = bestPoints.find(p => p.brake > 20);
    const currBrakePoint = currPoints.find(p => p.brake > 20);
    
    if (bestBrakePoint && currBrakePoint) {
       const brakeDiffDist = currBrakePoint.distance - bestBrakePoint.distance;
       if (brakeDiffDist < -5) {
         return "You are braking earlier than your best lap.";
       } else if (brakeDiffDist > 5) {
         return "You braked too late and likely missed the apex.";
       }
    }
    
    if (currMinSpeed < bestMinSpeed - 2) {
       return "Your minimum corner speed is lower, try rolling off the brakes sooner.";
    }
    
    if (currAvgThrottle < bestAvgThrottle - 5) {
       return "You are hesitating on the throttle or carrying less speed on exit.";
    }
    
    return "";
  }

  generateSectors() {
    const totalDist = this.lapDistance;
    this.sectors = [
      totalDist * 0.2,
      totalDist * 0.4,
      totalDist * 0.6,
      totalDist * 0.8
    ];

    const sTimes = [0, 0, 0, 0];
    for (const point of this.referenceLapPath) {
      if (!sTimes[0] && point.distance >= this.sectors[0]) sTimes[0] = point.time;
      if (!sTimes[1] && point.distance >= this.sectors[1]) sTimes[1] = point.time;
      if (!sTimes[2] && point.distance >= this.sectors[2]) sTimes[2] = point.time;
      if (!sTimes[3] && point.distance >= this.sectors[3]) sTimes[3] = point.time;
    }
    
    this.bestSectorTimes = []; // Intentionally left empty so Lap 2 doesn't compare against the invalid Lap 1 grid-start geometry.
    this.bestLapTimeMs = null; // Clear this so Lap 2 is forcibly recorded as the first valid PB.
    this.currentLapSectorTimes = [];
  }

  analyzeSector() {
    const sectorTimeMs = Date.now() - this.currentSectorStartTime;
    this.currentLapSectorTimes.push(sectorTimeMs);
    
    if (!this.bestSectorTimes || this.bestSectorTimes.length === 0) return;

    // Safety check in case we exceed sector bounds
    if (this.currentSectorIndex >= this.bestSectorTimes.length) return;

    const refSectorTimeMs = this.bestSectorTimes[this.currentSectorIndex];
    
    const diff = (sectorTimeMs - refSectorTimeMs) / 1000;
    const absDiff = Math.abs(diff).toFixed(1);
    
    const sectorColors = ['green', 'blue', 'pink', 'orange', 'yellow'];
    const colorName = sectorColors[this.currentSectorIndex];
    
    if (diff < -0.05) {
      if (this.onMessage) this.onMessage(`The ${colorName} sector is a personal best, ${absDiff} seconds faster.`);
    } else if (diff > 0.1) {
      if (this.onMessage) this.onMessage(`The ${colorName} sector is ${absDiff} seconds slower.`);
    } else {
      if (this.onMessage) this.onMessage(`The ${colorName} sector is on pace.`);
    }
  }

  analyzeLap(telemetry) {
    const messages = [];

    // Note: finalSectorTime is now correctly pushed by the analyzeSector() call triggered at lap completion

    // 1. Lap Time & Sector Analysis
    const lapTimeMs = telemetry.last_lap_time;
    if (lapTimeMs > 0) {
      const totalSeconds = lapTimeMs / 1000;
      const mins = Math.floor(totalSeconds / 60);
      const secs = (totalSeconds % 60).toFixed(1);
      const timeString = mins > 0 ? `${mins} minute${mins > 1 ? 's' : ''} and ${secs} seconds` : `${secs} seconds`;
      this.lapTimes.push(lapTimeMs);
      
      // Lap 1 has invalid grid-start geometry, do not allow it to become a PB
      if (this.currentLap === 1) {
        messages.push(`First lap completed in ${timeString}.`);
      }
      else if (!this.bestLapTimeMs || lapTimeMs < this.bestLapTimeMs) {
        // NEW PERSONAL BEST! Update the reference sector times!
        this.bestLapTimeMs = lapTimeMs;
        if (this.currentLapSectorTimes.length === 5) {
           this.bestSectorTimes = [...this.currentLapSectorTimes];
        }
        
        // Save telemetry path for future input analysis
        this.bestLapPath = [...this.currentLapPath];
        
        messages.push(`Fantastic! New personal best, ${timeString}.`);
      } else if (this.lapTimes.length > 1) {
        const diffToBest = ((lapTimeMs - this.bestLapTimeMs) / 1000).toFixed(1);
        messages.push(`Lap was ${diffToBest} seconds off your best.`);
        
        // Find where we lost the most time compared to our BEST lap
        if (this.bestSectorTimes && this.currentLapSectorTimes.length === 5) {
          let worstSectorIdx = -1;
          let worstTimeLoss = -Infinity;
          
          for (let i = 0; i < 5; i++) {
            const loss = this.currentLapSectorTimes[i] - this.bestSectorTimes[i];
            // Filter out massive anomaly deltas
            if (loss > worstTimeLoss && loss < 5000) {
              worstTimeLoss = loss;
              worstSectorIdx = i;
            }
          }
          
          if (worstTimeLoss > 200 && worstSectorIdx !== -1) { 
            const colorName = ['green', 'blue', 'pink', 'orange', 'yellow'][worstSectorIdx];
            const telemetryReason = this.analyzeTelemetryDifference(worstSectorIdx);
            messages.push(`Focus on the ${colorName} sector. You lost ${(worstTimeLoss/1000).toFixed(1)} seconds there. ${telemetryReason}`);
          }
        }
      }
    }

    // 2. Fuel Analysis
    const fuelUsed = this.fuelAtLapStart - telemetry.fuel_remaining;
    if (fuelUsed > 0 && telemetry.fuel_capacity > 0) {
      this.fuelPerLap.push(fuelUsed);
      const avgFuel = this.fuelPerLap.reduce((a, b) => a + b, 0) / this.fuelPerLap.length;
      const lapsRemaining = telemetry.fuel_remaining / avgFuel;
      
      if (lapsRemaining <= 1.5) {
        messages.push("Fuel is critical. Box this lap. Box box!");
      } else if (lapsRemaining <= 3.5) {
        messages.push(`Fuel is low. We need to pit in ${Math.floor(lapsRemaining)} laps.`);
      } else {
        messages.push(`Fuel looks good. At current pace we can do ${Math.floor(lapsRemaining)} more laps.`);
      }
    }

    // 3. Tire Temp Analysis
    const avgTemp = (telemetry.tire_temp_fl + telemetry.tire_temp_fr + telemetry.tire_temp_rl + telemetry.tire_temp_rr) / 4;
    if (avgTemp > 100) {
      messages.push("Tires are overheating, you are overdriving the car. Be smoother.");
    } else if (avgTemp < 60) {
      messages.push("Tires are cold.");
    } else {
      messages.push("Tire temperatures are optimal.");
    }

    // 4. Tire Wear & Setup (Radius degradation)
    if (this.initialTireRadius) {
       const fl_wear = this.initialTireRadius.fl - telemetry.tire_radius_fl;
       const fr_wear = this.initialTireRadius.fr - telemetry.tire_radius_fr;
       const rl_wear = this.initialTireRadius.rl - telemetry.tire_radius_rl;
       const rr_wear = this.initialTireRadius.rr - telemetry.tire_radius_rr;
       
       const avgFrontWear = (fl_wear + fr_wear) / 2;
       const avgRearWear = (rl_wear + rr_wear) / 2;
       
       if (avgFrontWear > 0.005 || avgRearWear > 0.005) { // Meaningful wear occurred
          if (avgFrontWear > avgRearWear * 1.5) {
             messages.push("Front tires are wearing much faster than the rears. Consider moving brake bias rearward.");
          } else if (avgRearWear > avgFrontWear * 1.5) {
             messages.push("Rear tires are degrading quickly. Move brake bias forward or be smoother on corner exit.");
          }
       }
    }

    // 5. Suspension
    if (this.bottomingOutCount > 30) { // ~0.5 seconds of bottoming out
       messages.push("You are bottoming out heavily at high speeds. Raise the ride height or stiffen the springs.");
    }
    
    // 6. Shifting
    if (this.revLimiterTimeMs > 2000) { // Spent > 2s on limiter
       messages.push("You are holding gears too long and hitting the rev limiter. Shift earlier.");
    }
    
    // 7. Oversteer
    if (this.oversteerCount > 40) { // Sliding excessively
       messages.push("You are sliding the rear end on corner exits. Roll onto the throttle smoother to save the tires.");
    }

    // Reset physics counters for next lap
    this.bottomingOutCount = 0;
    this.revLimiterTimeMs = 0;
    this.oversteerCount = 0;

    if (messages.length > 0 && this.onMessage) {
      this.onMessage(messages.join(" "));
    }
  }
}

module.exports = RaceEngineer;
