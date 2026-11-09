// Shared by the rule preview, execution engine and configured-bridge adapter.
export const speedAction = 'temperature-speed';

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
