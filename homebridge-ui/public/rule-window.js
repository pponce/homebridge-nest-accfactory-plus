// Wall-clock windows use the selected start day, including the following morning.
import { validTimeZone } from './climate-utils.js';

export const systemTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export function ruleTimeZone(selection, system = systemTimeZone()) {
  return validTimeZone(selection === undefined || selection === 'system' ? system : selection);
}
export function ruleInTimeZone(rule, zone) {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return rule;
  return { ...rule,
    ...(rule.window && typeof rule.window === 'object' && !Array.isArray(rule.window) ?
      { window: { ...rule.window, timeZone: zone } } : {}),
    ...(rule.manualOverride?.mode === 'time' ? { manualOverride: { ...rule.manualOverride, timeZone: zone } } : {}) };
}
export function rulesInTimeZone(groups, zone) {
  if (!groups || typeof groups !== 'object' || Array.isArray(groups)) return groups;
  return Object.fromEntries(Object.entries(groups).map(([kind, rules]) =>
    [kind, Array.isArray(rules) ? rules.map((rule) => ruleInTimeZone(rule, zone)) : rules]));
}

export const windowDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const time = (value) => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const minutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const formatters = new Map();
const upcoming = new Map();

export function windowError(window) {
  if (window === undefined) return null;
  if (!window || typeof window !== 'object' || Array.isArray(window) ||
      Object.keys(window).some((key) => !['days', 'start', 'end', 'timeZone'].includes(key))) {
    return 'Choose Always or a scheduled time window.';
  }
  if (!Array.isArray(window.days) || !window.days.length || window.days.length > 7 ||
      new Set(window.days).size !== window.days.length || window.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    return 'Select at least one start day for the time window.';
  }
  if (!time(window.start) || !time(window.end) || window.start === window.end) {
    return 'Choose different start and end times, or choose Always for all-day operation.';
  }
  try {
    if (typeof window.timeZone !== 'string' || !window.timeZone) throw new Error('Missing zone');
    new Intl.DateTimeFormat('en', { timeZone: window.timeZone }).format(0);
  } catch { return 'Choose a valid time zone for the time window.'; }
  return null;
}

export function windowActive(window, now = Date.now()) {
  if (window === undefined) return true;
  if (windowError(window)) return false;
  return matches(window, now);
}

function matches(window, now) {
  let formatter = formatters.get(window.timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: window.timeZone, weekday: 'short',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    if (formatters.size >= 64) formatters.clear();
    formatters.set(window.timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  const day = windowDays.indexOf(parts.weekday);
  const local = Number(parts.hour) * 60 + Number(parts.minute);
  const start = minutes(window.start); const end = minutes(window.end);
  return start < end ? window.days.includes(day) && local >= start && local < end :
    (local >= start && window.days.includes(day)) || (local < end && window.days.includes((day + 6) % 7));
}

export function ruleWindow(window, now = Date.now()) {
  const error = windowError(window);
  if (error) return { active: false, error, nextStart: null };
  if (windowActive(window, now)) return { active: true, nextStart: null };
  const key = JSON.stringify(window);
  const cached = upcoming.get(key);
  if (cached && now >= cached.checkedAt && now < cached.nextStart) return { active: false, nextStart: cached.nextStart };
  // Scan actual instants so missing and repeated local hours follow the time zone's DST rules.
  // Cache until the next opening; this search runs once per closed window, not every engine tick.
  let nextStart = Math.floor(now / 60000) * 60000 + 60000;
  const limit = nextStart + 8 * 86400000;
  for (; nextStart < limit; nextStart += 60000) if (matches(window, nextStart)) break;
  if (nextStart >= limit) nextStart = null;
  if (upcoming.size >= 128) upcoming.clear();
  upcoming.set(key, { checkedAt: now, nextStart });
  return { active: false, nextStart };
}

export function windowSummary(window) {
  if (!window) return 'Always · all day, every day';
  if (windowError(window)) return 'Review the time window';
  return (window.days.length === 7 ? 'Every day' : window.days.map((day) => windowDays[day]).join(', ')) +
    ' · ' + window.start + '–' + window.end + (window.start > window.end ? ' next day' : '') + ' · ' + window.timeZone;
}

