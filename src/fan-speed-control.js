import { fanRulePlan, fanSpeedLimits, fanState, sameFanState, supportedSpeed, validFanState } from '../homebridge-ui/public/fan-speed.js';

const MINUTE = 60000;
const ready = (source, now) =>
  source?.kind === 'fan' && source.available && source.canControl && source.canSetSpeed &&
  source.speedAvailable && validFanState(fanState(source)) && Number.isFinite(source.lastReadAt) &&
  source.lastReadAt <= now + 1000 && now - source.lastReadAt <= 90000;

const powerReady = (source, now) => source?.kind === 'fan' && source.available && source.canControl &&
  typeof source.running === 'boolean' && Number.isFinite(source.lastReadAt) &&
  source.lastReadAt <= now + 1000 && now - source.lastReadAt <= 90000;

export function prepareFanRules(engine) {
  const states = [...engine.states.values()].filter((state) => state.rule.kind === 'fan');
  const known = new Set(states.flatMap((state) => state.rule.targetIds));
  const lastWrites = new Map();
  for (const state of states) {
    for (const [id, at] of Object.entries(state.fanWrites ?? {})) {
      if (Number.isFinite(at)) {
        lastWrites.set(id, Math.max(lastWrites.get(id) ?? 0, at));
      }
    }
  }
  for (const map of [engine.fanOverrides, engine.fanObservations]) {
    for (const id of map.keys()) {
      if (!known.has(id)) {
        map.delete(id);
      }
    }
  }
  for (const id of known) {
    const source = engine.sources.get(id);
    if (!powerReady(source, engine.now())) {
      continue;
    }
    const current = { running: source.running, speed: source.speedAvailable ? source.speed : undefined };
    const before = engine.fanObservations.get(id);
    const watched = states.some((state) => state.rule.enabled && !state.paused &&
      state.windowStatus?.active !== false && state.rule.targetIds.includes(id));
    if (watched && !engine.leases.has('fan:' + id) && before &&
        (before.running !== current.running || (Number.isFinite(before.speed) && Number.isFinite(current.speed) &&
          Math.abs(before.speed - current.speed) >= 0.001))) {
      engine.manualFan(id, 'The fan changed outside automatic control. Resume this fan when ready.');
    }
    if (watched) {
      engine.fanObservations.set(id, current);
    } else {
      engine.fanObservations.delete(id);
    }
  }
  const winners = new Map();
  for (const state of states.sort((a, b) => b.rule.priority - a.rule.priority)) {
    state.fanTargets = [];
    state.fanSpeeds = [];
    if (!state.rule.enabled || state.paused || state.windowStatus?.active === false) {
      continue;
    }
    const rule = state.rule;
    const temperature = rule.action === 'temperature' || rule.speedMode === 'curve' ? engine.temperatureInputs(rule) : null;
    const thermostat = engine.device(rule.thermostatId);
    const hvacState = engine.connected(thermostat) ? thermostat.data.hvac_state : undefined;
    state.roomTemperature = temperature;
    state.fanPlan = fanRulePlan(rule, { temperature, hvacState, previousDemand: state.demand === true });
    if (state.fanPlan.demand !== undefined) {
      state.demand = state.fanPlan.demand;
    } else if (rule.speedMode === 'curve') {
      state.demand = false;
    }
    for (const id of rule.targetIds) {
      // An unknown higher-priority condition reserves the fan instead of permitting a surprising fallback.
      if (!engine.fanOverrides.has(id) && state.fanPlan.demand !== false && !winners.has(id)) {
        winners.set(id, state);
      }
    }
  }
  for (const state of states) {
    state.fanAssignments = state.rule.targetIds.map((id) => {
      const winner = winners.get(id);
      if (winner === state && engine.fanWinners.get(id) !== state.rule.id) {
        delete state.fanObserved?.[id];
        delete state.fanSpeedObserved?.[id];
      }
      const selected = !engine.fanOverrides.has(id) && (winner === state ||
        (!winner && !state.paused && state.rule.enabled && state.windowStatus?.active !== false &&
          engine.leases.get('fan:' + id)?.owner === state.rule.id));
      if (selected) {
        state.fanTargets.push(id);
        if (lastWrites.has(id)) {
          (state.fanWrites ??= {})[id] = lastWrites.get(id);
        }
      }
      return { id, name: engine.sources.get(id)?.name || 'Room fan', controller: winner?.rule.name ?? null,
        priority: winner?.rule.priority, selected, override: engine.fanOverrides.get(id) ?? null };
    });
  }
  engine.fanWinners = new Map([...winners].map(([id, state]) => [id, state.rule.id]));
}

export async function handoffFanLease(engine, key, lease, state) {
  const source = engine.sources.get(lease.targetId);
  if (!powerReady(source, engine.now()) || (lease.mode === 'speed' && !ready(source, engine.now()))) {
    return false;
  }
  const previous = engine.states.get(lease.owner);
  if (lease.mode === 'speed' ? !observe(engine, key, lease, source, previous) :
      !engine.observe(key, lease, source.running, previous)) {
    return false;
  }
  if (state.rule.speedMode !== 'last' && lease.mode !== 'speed') {
    if (!ready(source, engine.now())) {
      await engine.release(key, lease);
      return false;
    }
    lease.baseline = { running: lease.baseline, speed: source.speed };
    lease.before = fanState(source);
    lease.expected = fanState(source);
    lease.mode = 'speed';
    lease.step = 'power';
    lease.maximum = fanSpeedLimits(state.rule).maximum;
  }
  lease.owner = state.rule.id;
  (state.fanWrites ??= {})[lease.targetId] = lease.sentAt;
  return true;
}

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
  engine.manualFan(lease.targetId, 'A fan speed or power setting changed, or feedback was not confirmed. Review the fan, then Resume.');
  return false;
}

async function write(engine, key, lease, source, desired, state, restoring = false) {
  const previousLease = engine.leases.has(key) ? structuredClone(lease) : undefined;
  const previousWrite = state?.fanWrites?.[lease.targetId];
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
  if (!restoring && !engine.windowPermits(state, lease.targetId)) {
    engine.undoPreparedCommand(key, lease, previousLease, state, previousWrite);
    return;
  }
  const options = {
    minimum: 1,
    maximum: lease.maximum,
    guard: () => restoring || engine.windowPermits(state, lease.targetId),
  };
  try {
    if (speedStep) {
      await engine.access.setFanSpeed(lease.targetId, desired.speed, lease.before, options);
    } else {
      await engine.access.setFan(lease.targetId, desired.running, lease.before, options);
    }
  } catch (error) {
    if (error.code === 'CLIMATE_CONFLICT' && !restoring && !engine.windowPermits(state, lease.targetId)) {
      engine.undoPreparedCommand(key, lease, previousLease, state, previousWrite);
      return;
    }
    // Keep ownership of other fans so a partial group command can still restore them.
    error.fanTargetId = lease.targetId;
    throw error;
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
  const configuredMaximum = state && fanSpeedLimits(state.rule)?.maximum;
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

export async function runFanSpeed(engine, state, targetIds) {
  const rule = state.rule;
  const plan = state.fanPlan;
  if (plan.demand === undefined) {
    state.demand = false;
    state.phase = 'waiting';
    state.reason = 'Temperature readings or speed settings are unavailable. Returning owned fans to their previous state when possible.';
    for (const [key, lease] of engine.leases) {
      if (lease.owner === rule.id && targetIds.includes(lease.targetId)) {
        await engine.release(key, lease);
      }
    }
    return;
  }
  state.phase = 'active';
  state.reason = plan.demand ? 'Run condition is met.' : 'Run condition is clear.';
  state.nextChangeAt = null;
  state.fanSpeedObserved ??= {};
  state.fanWrites ??= {};
  for (const id of targetIds) {
    const key = 'fan:' + id;
    const source = engine.sources.get(id);
    let lease = engine.leases.get(key);
    const limits = plan.limits ?? { minimum: 1, maximum: lease?.maximum ?? 100 };
    const requested = rule.speedMode === 'last' ? source?.speed : plan.speed ?? limits.minimum;
    const speed = supportedSpeed(source, requested, limits.minimum, limits.maximum);
    state.fanSpeeds.push({
      id,
      name: source?.name || 'Room fan',
      currentSpeed: ready(source, engine.now()) ? (source.running ? source.speed : 0) : null,
      proposedSpeed: plan.demand ? speed : 0,
      maximumSpeed: limits.maximum,
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
      engine.manualFan(id, 'A selected fan speed or power setting changed outside this rule. Resume when ready for automatic control.');
      continue;
    }
    state.fanSpeedObserved[id] = fanState(source);
    if (!plan.demand) {
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
    const overCap = source.running && source.speed > limits.maximum;
    if (!stagedStart && !overCap && Number.isFinite(state.fanWrites[id]) && engine.now() - state.fanWrites[id] < MINUTE) {
      state.phase = 'waiting';
      state.reason = 'Waiting for the one-minute fan-speed update interval.';
      state.nextChangeAt = state.fanWrites[id] + MINUTE;
      continue;
    }
    const atEnd = speed === supportedSpeed(source, limits.minimum, limits.minimum, limits.maximum) ||
      speed === supportedSpeed(source, limits.maximum, limits.minimum, limits.maximum);
    if (rule.speedMode === 'curve' && lease && source.running && !overCap && !atEnd && Math.abs(source.speed - speed) < 5) {
      continue;
    }
    if (!lease) {
      const baseline = fanState(source);
      lease = { kind: 'fan', mode: 'speed', targetId: id, owner: rule.id, baseline, maximum: limits.maximum };
    }
    lease.maximum = limits.maximum;
    await write(engine, key, lease, source, { running: true, speed }, state);
  }
}
