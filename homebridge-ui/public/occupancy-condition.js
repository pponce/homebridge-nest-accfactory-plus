// Optional occupancy gates are independent of temperature inputs and time windows.
export function occupancyConditionError(condition, kind) {
  if (condition === undefined) return null;
  if (kind === 'presence') return 'Occupancy conditions apply to temperature and fan rules.';
  if (!condition || typeof condition !== 'object' || Array.isArray(condition) ||
      Object.keys(condition).some((key) => !['sourceType', 'sourceId', 'state'].includes(key)) ||
      !['sensor', 'presenceRule'].includes(condition.sourceType) ||
      typeof condition.sourceId !== 'string' || !condition.sourceId.trim() || condition.sourceId.length > 256 ||
      !['occupied', 'unoccupied'].includes(condition.state)) {
    return 'Select an occupancy sensor or presence rule and the required occupancy state.';
  }
  return null;
}

export function occupancyConditionStatus(rule, sources, states, now) {
  const condition = rule.occupancyCondition;
  if (condition === undefined) return { matches: true };
  const error = occupancyConditionError(condition, rule.kind);
  if (error) return { matches: null, reason: error };
  let occupied = null;
  let name;
  let detail;
  if (condition.sourceType === 'presenceRule') {
    const presence = states.get(condition.sourceId);
    name = presence?.rule.name || 'Selected presence rule';
    if (presence?.rule.kind === 'presence' && presence.rule.enabled && !presence.paused && !presence.fault &&
        Number.isFinite(presence.evaluatedAt) && now - presence.evaluatedAt <= 90000 && presence.evaluatedAt <= now + 1000 &&
        typeof presence.home === 'boolean') {
      occupied = presence.home;
      detail = presence.reason;
    }
  } else {
    const source = sources.get(condition.sourceId);
    name = source?.name || 'Selected occupancy sensor';
    if (source?.kind === 'occupancy' && source.available && Number.isFinite(source.lastReadAt) &&
        now - source.lastReadAt <= 90000 && source.lastReadAt <= now + 1000 && typeof source.detected === 'boolean') {
      occupied = source.detected;
    }
  }
  const matches = occupied === null ? null : occupied === (condition.state === 'occupied');
  const actual = occupied === null ? 'Unknown' : occupied ? 'Occupied / Home' : 'Unoccupied / Away';
  const required = condition.state === 'occupied' ? 'Occupied / Home' : 'Unoccupied / Away';
  return { ...condition, name, occupied, matches, detail,
    reason: name + ': ' + actual + '. Requires ' + required + '. ' +
      (matches === null ? 'Waiting for a current, reliable occupancy state.' : matches ? 'Occupancy condition is met.' :
        'Occupancy condition is not met.') };
}
