import { fanManualHoldUntil } from '../homebridge-ui/public/fan-speed.js';

const legacyManualReasons = new Set([
  'The fan changed outside automatic control. Resume this fan when ready.',
  'A fan speed changed manually. Resume this fan when ready for automatic control.',
  'A selected fan changed outside this rule. Resume when ready for automatic fan control.',
  'A selected fan speed or power setting changed outside this rule. Resume when ready for automatic control.',
]);
const signature = (rule) => JSON.stringify(rule.manualOverride ?? { mode: 'manual' });
const eligible = (state, id) => state?.rule.kind === 'fan' && state.rule.enabled && !state.paused &&
  state.rule.targetIds.includes(id);

export function recordFanManualHold(engine, id, ownerId) {
  const owner = engine.states.get(ownerId ?? engine.fanWinners.get(id));
  const state = eligible(owner, id) ? owner : [...engine.states.values()]
    .filter((entry) => eligible(entry, id) && entry.windowStatus?.active !== false && entry.occupancyStatus?.matches !== false)
    .sort((a, b) => b.rule.priority - a.rule.priority)[0];
  if (!state) {
    return;
  }
  const changedAt = engine.now();
  engine.fanManualHolds.set(id, { owner: state.rule.id, changedAt,
    until: fanManualHoldUntil(state.rule.manualOverride, changedAt), policy: signature(state.rule) });
}

export function clearFanManualHold(engine, id) {
  engine.fanOverrides.delete(id);
  engine.fanManualHolds.delete(id);
  engine.fanObservations.delete(id);
  for (const candidate of engine.states.values()) {
    delete candidate.fanObserved?.[id];
    delete candidate.fanSpeedObserved?.[id];
    if (candidate.rule.kind === 'fan' && candidate.rule.targetIds.includes(id)) {
      candidate.demand = false;
    }
  }
}

export function refreshFanManualHolds(engine, ready) {
  for (const [id, reason] of engine.fanOverrides) {
    // Older confirmed manual changes have no detection timestamp. Start their hold when the setting is first applied.
    if (!engine.fanManualHolds.has(id) && legacyManualReasons.has(reason)) {
      recordFanManualHold(engine, id);
    }
    const hold = engine.fanManualHolds.get(id);
    const state = engine.states.get(hold?.owner);
    if (!hold || !eligible(state, id)) {
      continue;
    }
    if (hold.policy !== signature(state.rule)) {
      hold.changedAt = engine.now();
      hold.policy = signature(state.rule);
      hold.until = fanManualHoldUntil(state.rule.manualOverride, hold.changedAt);
    }
    if (Number.isFinite(hold.until) && engine.now() >= hold.until && ready(id, state) && !engine.leases.has('fan:' + id)) {
      clearFanManualHold(engine, id);
    }
  }
}

export function fanManualHoldStatus(engine, id) {
  const hold = engine.fanManualHolds.get(id);
  if (!hold || !engine.fanOverrides.has(id)) {
    return null;
  }
  const state = engine.states.get(hold.owner);
  return { changedAt: hold.changedAt, until: eligible(state, id) ? hold.until : null,
    ruleName: state?.rule.name ?? null, timeZone: state?.rule.manualOverride?.timeZone ?? null };
}

export function validFanManualHolds(entries) {
  return Array.isArray(entries) && entries.length <= 256 && entries.every((entry) =>
    Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && entry[0].length <= 256 &&
    typeof entry[1]?.owner === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(entry[1].owner) &&
    Number.isFinite(entry[1].changedAt) && entry[1].changedAt >= 0 &&
    (entry[1].until === null || Number.isFinite(entry[1].until) && entry[1].until > entry[1].changedAt) &&
    typeof entry[1].policy === 'string' && entry[1].policy.length <= 300);
}
