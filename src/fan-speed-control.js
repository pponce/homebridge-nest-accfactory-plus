import { fanCurve, fanState, sameFanState, supportedSpeed, validFanState } from '../homebridge-ui/public/fan-speed.js';

const MINUTE = 60000;
const ready = (source, now) =>
  source?.kind === 'fan' && source.available && source.canControl && source.canSetSpeed &&
  source.speedAvailable && validFanState(fanState(source)) && Number.isFinite(source.lastReadAt) &&
  source.lastReadAt <= now + 1000 && now - source.lastReadAt <= 90000;

export function validSpeedLease(lease) {
  return ['baseline', 'before', 'expected'].every((key) => validFanState(lease[key])) &&
    ['speed', 'power'].includes(lease.step) && Number.isFinite(lease.maximum) && lease.maximum >= 1 && lease.maximum <= 100;
}

function observe(engine, key, lease, source, state) {
  const current = fanState(source);
  const speedMatches = Math.abs(current.speed - lease.expected.speed) < 0.001;
  // A speed setter may also turn the fan on. Power is written separately only after speed feedback is confirmed.
  const confirmed =
    lease.pending && lease.step === 'speed'
      ? speedMatches && (current.running === lease.before.running || current.running)
      : current.running === lease.expected.running && (current.running ? speedMatches : lease.pending || speedMatches);
  if (confirmed) {
    lease.expected = current;
    lease.pending = false;
    return true;
  }
  if (lease.pending && sameFanState(current, lease.before) && engine.now() - lease.sentAt < 2 * MINUTE) {
    if (state) {
      state.phase = 'waiting';
      state.reason = 'Waiting for the fan to confirm its speed or power setting.';
    }
    return false;
  }
  engine.leases.delete(key);
  if (state) {
    engine.pause(state, 'A fan speed or power setting changed, or feedback was not confirmed. Review the fan, then Resume.');
  }
  return false;
}

async function write(engine, key, lease, source, desired, state, restoring = false) {
  const speedStep = desired.running && Math.abs(source.speed - desired.speed) >= 0.001;
  lease.before = fanState(source);
  lease.expected = { running: speedStep ? source.running : desired.running, speed: desired.speed };
  lease.step = speedStep ? 'speed' : 'power';
  lease.pending = true;
  lease.restoring = restoring;
  lease.sentAt = engine.now();
  if (state) {
    (state.fanWrites ??= {})[lease.targetId] = lease.sentAt;
  }
  engine.leases.set(key, lease);
  await engine.persist();
  const options = {
    minimum: 1,
    maximum: lease.maximum,
    guard: () => restoring || (!engine.stopping && !state.paused),
  };
  if (speedStep) {
    await engine.access.setFanSpeed(lease.targetId, desired.speed, lease.before, options);
  } else {
    await engine.access.setFan(lease.targetId, desired.running, lease.before, options);
  }
  if (state) {
    state.phase = 'waiting';
    const message = speedStep ? ': speed ' + desired.speed + '% accepted; awaiting feedback.' :
      desired.running ? ': on command accepted; awaiting feedback.' : ': off command accepted; awaiting feedback.';
    state.lastAction = {
      at: engine.now(),
      value: desired.running ? desired.speed : 0,
      message: (source.name || 'Room fan') + message,
    };
  }
}

export async function releaseFanSpeed(engine, key, lease) {
  lease.restoring = true;
  const source = engine.sources.get(lease.targetId);
  if (!ready(source, engine.now())) {
    return;
  }
  const state = engine.states.get(lease.owner);
  if (!observe(engine, key, lease, source, state)) {
    return;
  }
  // Even a previous manual setting is restored only within the rule's speed cap.
  const configuredMaximum = state?.rule.maximumSpeed;
  if (Number.isFinite(configuredMaximum)) {
    lease.maximum = Math.min(lease.maximum, configuredMaximum);
  }
  const desired = { ...lease.baseline };
  if (desired.running) {
    desired.speed = supportedSpeed(source, Math.min(desired.speed, lease.maximum), 1, lease.maximum);
    if (desired.speed === null) {
      desired.running = false;
      desired.speed = source.speed;
      if (state) {
        state.reason = 'No supported running speed fits the cap. Stopping the owned fan.';
      }
    }
  }
  if ((!desired.running && !source.running) || sameFanState(fanState(source), desired)) {
    engine.leases.delete(key);
    if (state) {
      (state.fanSpeedObserved ??= {})[lease.targetId] = fanState(source);
    }
    return;
  }
  await write(engine, key, lease, source, desired, state, true);
}

export async function runFanSpeed(engine, state) {
  const rule = state.rule;
  const temperature = engine.temperatureInputs(rule);
  state.roomTemperature = temperature;
  const curve = fanCurve(rule, temperature, state.demand === true);
  state.fanSpeeds = [];
  if (!curve) {
    state.demand = false;
    state.phase = 'waiting';
    state.reason = 'Temperature readings or speed settings are unavailable. Returning owned fans to their previous state when possible.';
    for (const [key, lease] of engine.leases) {
      if (lease.owner === rule.id) {
        await engine.release(key, lease);
      }
    }
    return;
  }
  state.demand = curve.demand;
  state.phase = 'active';
  state.reason = curve.demand ? 'Airflow follows the temperature above your comfort target.' : 'The temperature does not call for cooling.';
  state.nextChangeAt = null;
  state.fanSpeedObserved ??= {};
  state.fanWrites ??= {};
  for (const id of rule.targetIds) {
    const key = 'fan:' + id;
    const source = engine.sources.get(id);
    let lease = engine.leases.get(key);
    const speed = supportedSpeed(source, curve.speed, rule.minimumSpeed, rule.maximumSpeed);
    state.fanSpeeds.push({
      id,
      name: source?.name || 'Room fan',
      currentSpeed: source?.running ? source.speed : 0,
      proposedSpeed: curve.demand ? speed : 0,
      maximumSpeed: rule.maximumSpeed,
    });
    if (!ready(source, engine.now()) || speed === null) {
      state.phase = 'waiting';
      state.reason = 'A selected fan needs readable speed control and a supported speed between the minimum and maximum.';
      if (lease?.mode === 'speed' && ready(source, engine.now())) {
        await releaseFanSpeed(engine, key, lease);
      }
      continue;
    }
    if (lease && (lease.mode !== 'speed' || lease.owner !== rule.id || lease.restoring || !observe(engine, key, lease, source, state))) {
      if (state.paused) {
        return;
      }
      continue;
    }
    if (!lease && state.fanSpeedObserved[id] && !sameFanState(fanState(source), state.fanSpeedObserved[id])) {
      engine.pause(state, 'A selected fan speed or power setting changed outside this rule. Resume when ready for automatic control.');
      return;
    }
    state.fanSpeedObserved[id] = fanState(source);
    if (!curve.demand) {
      if (lease) {
        await releaseFanSpeed(engine, key, lease);
      }
      continue;
    }
    if (source.running && Math.abs(source.speed - speed) < 0.001) {
      continue;
    }
    // Complete a staged start promptly; subsequent changes are limited to once a minute.
    const stagedStart = lease?.step === 'speed' && !source.running && Math.abs(source.speed - speed) < 0.001;
    const overCap = source.running && source.speed > rule.maximumSpeed;
    if (!stagedStart && !overCap && Number.isFinite(state.fanWrites[id]) && engine.now() - state.fanWrites[id] < MINUTE) {
      state.phase = 'waiting';
      state.reason = 'Waiting for the one-minute fan-speed update interval.';
      state.nextChangeAt = state.fanWrites[id] + MINUTE;
      continue;
    }
    const atEnd = speed === supportedSpeed(source, rule.minimumSpeed, rule.minimumSpeed, rule.maximumSpeed) ||
      speed === supportedSpeed(source, rule.maximumSpeed, rule.minimumSpeed, rule.maximumSpeed);
    if (lease && source.running && !overCap && !atEnd && Math.abs(source.speed - speed) < 5) {
      continue;
    }
    if (!lease) {
      const baseline = fanState(source);
      if (baseline.running) {
        baseline.speed = supportedSpeed(source, Math.min(baseline.speed, rule.maximumSpeed), 1, rule.maximumSpeed);
      }
      lease = { kind: 'fan', mode: 'speed', targetId: id, owner: rule.id, baseline, maximum: rule.maximumSpeed };
    }
    lease.maximum = rule.maximumSpeed;
    await write(engine, key, lease, source, { running: true, speed }, state);
  }
}
