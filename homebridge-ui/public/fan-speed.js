// Shared by the rule preview, execution engine and configured-bridge adapter.
export const speedAction = 'temperature-speed';

export function normalizeFanRule(rule) {
  if (rule.action === speedAction) {
    const threshold = rule.desiredTemperature + rule.startGap;
    const hysteresis = rule.startGap - rule.stopGap;
    return { ...rule, action: 'temperature', speedMode: 'curve', priority: rule.priority ?? 0,
      ...(Number.isFinite(threshold) ? { threshold } : {}), ...(Number.isFinite(hysteresis) ? { hysteresis } : {}), thresholdInclusive: true };
  }
  return { ...rule, action: rule.action ?? 'temperature', speedMode: rule.speedMode ?? 'last', priority: rule.priority ?? 0 };
}

export function fanSpeedLimits(rule) {
  return rule.speedMode === 'fixed' ? { minimum: 1, maximum: rule.fixedSpeed } :
    rule.speedMode === 'curve' ? { minimum: rule.minimumSpeed, maximum: rule.maximumSpeed } : null;
}

export function fanSpeedError(rule) {
  if (rule.speedMode === 'last') return null;
  if (rule.speedMode === 'fixed') return Number.isFinite(rule.fixedSpeed) && rule.fixedSpeed >= 1 && rule.fixedSpeed <= 100 ? null :
    'Choose a fixed fan speed between 1% and 100%.';
  const ranges = { desiredTemperature: [5, 35], startGap: [0, 10], fullSpeedGap: [0.1, 20], minimumSpeed: [1, 100], maximumSpeed: [1, 100] };
  if (rule.speedMode !== 'curve' || Object.entries(ranges).some(([key, [low, high]]) => !Number.isFinite(rule[key]) || rule[key] < low || rule[key] > high)) {
    return 'Enter a comfort target, temperature gaps and fan speeds within the displayed ranges.';
  }
  if (rule.fullSpeedGap <= rule.startGap) return 'The maximum-speed gap must be larger than the gap where speed starts increasing.';
  if (rule.minimumSpeed > rule.maximumSpeed) return 'Minimum running speed must not exceed the maximum speed.';
  return null;
}

export function fanRulePlan(rule, { temperature, hvacState, previousDemand = false } = {}) {
  rule = normalizeFanRule(rule);
  let demand;
  if (rule.action === 'temperature' && Number.isFinite(temperature) && Number.isFinite(rule.threshold)) {
    const above = rule.thresholdInclusive ? temperature >= rule.threshold - 1e-8 : temperature > rule.threshold;
    demand = above ? true : temperature <= rule.threshold - (rule.hysteresis ?? 1) + 1e-8 ? false : previousDemand;
  } else if (['heating', 'cooling'].includes(rule.action) && ['heating', 'cooling', 'off'].includes(hvacState)) {
    demand = hvacState === rule.action;
  }
  const limits = fanSpeedLimits(rule);
  let speed = null;
  if (demand !== false && fanSpeedError(rule)) return { demand: undefined, speed, limits };
  if (demand && rule.speedMode === 'fixed') speed = rule.fixedSpeed;
  if (demand && rule.speedMode === 'curve') {
    if (!Number.isFinite(temperature)) return { demand: undefined, speed, limits };
    const fraction = Math.max(0, Math.min(1, (temperature - rule.desiredTemperature - rule.startGap) / (rule.fullSpeedGap - rule.startGap)));
    speed = rule.minimumSpeed + fraction * (rule.maximumSpeed - rule.minimumSpeed);
  }
  return { demand, speed, limits };
}

export function fanCurveError(rule) {
  const ranges = { desiredTemperature: [5, 35], startGap: [0.1, 10], stopGap: [0, 10], fullSpeedGap: [0.2, 20],
    minimumSpeed: [1, 100], maximumSpeed: [1, 100] };
  if (Object.entries(ranges).some(([key, [low, high]]) => !Number.isFinite(rule[key]) || rule[key] < low || rule[key] > high)) {
    return 'Enter a comfort target, temperature gaps and fan speeds within the displayed ranges.';
  }
  if (rule.stopGap >= rule.startGap || rule.fullSpeedGap <= rule.startGap) {
    return 'The stop gap must be smaller than the start gap; the maximum-speed gap must be larger than the start gap.';
  }
  if (rule.minimumSpeed > rule.maximumSpeed) {
    return 'Minimum running speed must not exceed the maximum speed.';
  }
  return null;
}

export function fanCurve(rule, temperature, running = false) {
  if (fanCurveError(rule) || !Number.isFinite(temperature)) return null;
  const gap = temperature - rule.desiredTemperature;
  const demand = running ? gap > rule.stopGap + 1e-8 : gap >= rule.startGap - 1e-8;
  const fraction = Math.max(0, Math.min(1, (gap - rule.startGap) / (rule.fullSpeedGap - rule.startGap)));
  return { demand, speed: demand ? rule.minimumSpeed + fraction * (rule.maximumSpeed - rule.minimumSpeed) : 0 };
}

export function speedCapabilities(characteristic) {
  if (!characteristic?.perms?.includes('pr') || !characteristic.perms.includes('pw') ||
      characteristic.perms.some((permission) => ['tw', 'aa'].includes(permission)) ||
      ![undefined, 'percentage'].includes(characteristic.unit)) return null;
  const min = characteristic.minValue ?? 0;
  const max = characteristic.maxValue ?? 100;
  const step = characteristic.minStep ?? 1;
  if (![min, max, step].every(Number.isFinite) || min < 0 || max > 100 || min >= max || step < 0.01 || step > 100) return null;
  const range = characteristic['valid-values-range'] ?? characteristic.validValueRanges;
  if (range !== undefined && (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isFinite) || range[0] > range[1])) return null;
  const values = characteristic['valid-values'] ?? characteristic.validValues;
  if (values !== undefined && (!Array.isArray(values) || !values.length || values.length > 1000 || !values.every(Number.isFinite))) return null;
  const candidates = values ?? Array.from({ length: Math.floor((max - min) / step + 1e-8) + 1 }, (_, index) => min + index * step);
  const supported = [...new Set(candidates.filter((value) => value >= min && value <= max &&
    (!range || (value >= range[0] && value <= range[1])) &&
    Math.abs((value - min) / step - Math.round((value - min) / step)) < 1e-6).map((value) => Number(value.toFixed(6))))].sort((a, b) => a - b);
  return supported.some((value) => value > 0) ? { min, max, step, values: supported } : null;
}

export function supportedSpeed(source, requested, minimum, maximum) {
  if (!source?.canSetSpeed || !Array.isArray(source.speedCapabilities?.values) ||
      ![requested, minimum, maximum].every(Number.isFinite) || minimum <= 0 || maximum > 100 || minimum > maximum) return null;
  const values = source.speedCapabilities.values.filter((value) => Number.isFinite(value) && value >= minimum && value <= maximum);
  if (!values.length) return null;
  return values.reduce((best, value) => Math.abs(value - requested) < Math.abs(best - requested) - 1e-8 ? value : best);
}

export function validFanState(value) {
  return value && typeof value.running === 'boolean' && Number.isFinite(value.speed) && value.speed >= 0 && value.speed <= 100;
}

export function fanState(source) {
  return { running: source.running, speed: source.speed };
}

export function sameFanState(a, b) {
  return validFanState(a) && validFanState(b) && a.running === b.running && Math.abs(a.speed - b.speed) < 0.001;
}
