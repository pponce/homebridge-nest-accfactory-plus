import { supportedSpeed } from '../homebridge-ui/public/fan-speed.js';

const MINUTE = 60000;
const finite = (value) => Number.isFinite(value) ? value : null;
const fresh = (source, now) => source?.available === true && Number.isFinite(source.lastReadAt) &&
  source.lastReadAt <= now + 1000 && now - source.lastReadAt <= 90000;

// Capture only display-safe evidence from the completed evaluation. This never runs controls,
// refreshes devices, or uses the dashboard's unsaved rule drafts.
export function explainRule(engine, state, heatingTarget) {
  const rule = state.rule;
  const now = engine.now();
  const sources = rule.sourceIds.map((id) => {
    const source = engine.sources.get(id);
    const available = fresh(source, now);
    const temperature = available && source.kind === 'temperature' && Number.isFinite(source.temperature) &&
      Math.abs(source.temperature) <= 100 ? source.temperature : null;
    const detected = available && ['motion', 'occupancy'].includes(source.kind) && typeof source.detected === 'boolean' ?
      source.detected : null;
    const holdUntil = source?.kind === 'motion' && Number.isFinite(state.holds?.[id]) &&
      state.holds[id] > now && state.holds[id] <= now + 1440 * MINUTE ? state.holds[id] : null;
    return { id, name: source?.name || 'Selected sensor', kind: source?.kind ?? null,
      available: rule.kind === 'presence' ? detected !== null : temperature !== null,
      lastReadAt: finite(source?.lastReadAt), temperature, detected,
      lastDetectedAt: finite(state.lastDetectedAt?.[id]), holdUntil,
      effective: detected === null ? null : detected || (source.kind === 'motion' && holdUntil !== null) };
  });
  const report = { evaluatedAt: now, sources };
  if (rule.kind === 'presence') {
    const known = sources.length > 0 && sources.every((source) => source.effective !== null);
    report.presence = { logic: rule.logic, holdMinutes: rule.holdMinutes ?? 10,
      awayDelayMinutes: rule.awayDelayMinutes ?? 20, awaySince: finite(state.awaySince),
      awayAt: state.phase === 'waiting' && known ? finite(state.nextChangeAt) : null,
      overrideUntil: state.phase === 'override' ? finite(state.override?.until) : null,
      matching: rule.logic === 'all' ? known && sources.every((source) => source.effective) :
        sources.some((source) => source.effective === true) };
    return report;
  }
  report.average = engine.temperatureInputs(rule);
  const device = engine.device(rule.thermostatId);
  const connected = engine.connected(device);
  report.thermostat = { name: device?.data.description ?? 'Thermostat', available: connected,
    hvacState: connected ? device.data.hvac_state ?? null : null };
  if (rule.kind === 'fan') {
    const eligible = rule.enabled && !state.paused && state.windowStatus?.active !== false;
    const plan = eligible ? state.fanPlan : null;
    report.condition = { action: rule.action, demand: plan?.demand ?? null,
      threshold: finite(rule.threshold), inclusive: rule.thresholdInclusive === true,
      stopThreshold: Number.isFinite(rule.threshold) ? rule.threshold - (rule.hysteresis ?? 1) : null };
    report.speed = { mode: rule.speedMode, calculated: finite(plan?.speed), fixed: finite(rule.fixedSpeed),
      comfort: finite(rule.desiredTemperature), minimum: finite(rule.minimumSpeed), maximum: finite(rule.maximumSpeed),
      startsAt: finite(rule.desiredTemperature + rule.startGap), fullAt: finite(rule.desiredTemperature + rule.fullSpeedGap) };
    report.fans = rule.targetIds.map((id) => {
      const source = engine.sources.get(id);
      const lease = engine.leases.get('fan:' + id);
      const available = source?.kind === 'fan' && fresh(source, now) && typeof source.running === 'boolean';
      const limits = plan?.limits;
      const speed = plan?.demand === true && limits ? supportedSpeed(source, plan.speed, limits.minimum, limits.maximum) : null;
      const nextEligibleAt = Number.isFinite(state.fanWrites?.[id]) && state.fanWrites[id] + MINUTE > now ?
        state.fanWrites[id] + MINUTE : null;
      const atEnd = limits && speed !== null && [limits.minimum, limits.maximum].some((value) =>
        speed === supportedSpeed(source, value, limits.minimum, limits.maximum));
      return { id, name: source?.name || 'Room fan', available,
        running: available ? source.running : null,
        speed: available && source.speedAvailable ? finite(source.speed) : null,
        lastReadAt: finite(source?.lastReadAt), controllerId: engine.fanWinners.get(id) ?? null,
        ownerId: lease?.owner ?? null, pending: lease?.pending === true, restoring: lease?.restoring === true,
        requested: lease?.pending ? lease.expected : null,
        supportedSpeed: speed, nextEligibleAt,
        holdingSpeed: available && rule.speedMode === 'curve' && lease?.owner === rule.id && !lease.pending &&
          !lease.restoring && !nextEligibleAt && source.running && source.speedAvailable && speed !== null && !atEnd &&
          source.speed <= limits.maximum && Math.abs(source.speed - speed) >= 0.001 && Math.abs(source.speed - speed) < 5,
        override: engine.fanOverrides.get(id) ?? null };
    });
  } else {
    const desired = state.roomTarget?.value ?? rule.desiredTemperature;
    const physical = connected ? finite(device.data.physical_temperature) : null;
    const maximumOffset = rule.maximumOffset ?? 1.5;
    const rawOffset = physical !== null && report.average !== null ? physical - report.average : null;
    report.heating = { desired, physical, maximumOffset, rawOffset,
      calculatedTarget: rawOffset !== null ? heatingTarget(desired, physical, report.average, maximumOffset,
        device.data.temperature_scale) : null,
      targetSource: state.roomTarget?.source ?? 'rule', minimumIntervalMinutes: rule.minimumIntervalMinutes ?? 5,
      nextEligibleAt: finite(state.nextChangeAt) };
  }
  return report;
}
