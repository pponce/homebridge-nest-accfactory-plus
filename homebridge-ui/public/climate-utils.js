// Only named zones are accepted: fixed offsets cannot describe daylight-saving changes.
export function validTimeZone(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 100 || /^[+-]/.test(value.trim())) return null;
  try {
    return new Intl.DateTimeFormat('en', { timeZone: value.trim() }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function scheduleTimeZone(options = {}, data = {}) {
  // An invalid explicit choice must not silently fall back to a different zone.
  return validTimeZone(options.scheduleTimeZone || data.schedule_time_zone);
}

export function displayTemperature(value, unit = 'C', difference = false) {
  if (!Number.isFinite(value)) return NaN;
  return unit === 'F' ? Number((value * 1.8 + (difference ? 0 : 32)).toFixed(10)) : value;
}

export function celsiusTemperature(value, unit = 'C', difference = false) {
  if (!Number.isFinite(value)) return NaN;
  // Remove conversion noise at range boundaries: a 0.18 °F gap is exactly 0.1 °C.
  return unit === 'F' ? Number(((value - (difference ? 0 : 32)) / 1.8).toFixed(10)) : value;
}

// Normalize supported legacy containers without discarding credentials or unknown options.
export function editableConfig(input) {
  const config = structuredClone(input);
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!object(config)) {
    throw new Error('Invalid configuration');
  }
  if (config.accounts == null) {
    config.accounts = [];
  }
  if (!Array.isArray(config.accounts) || config.accounts.some((account) => !object(account))) {
    throw new Error('Invalid accounts');
  }
  if (!config.accounts.length) {
    if (config.nest?.access_token) {
      config.accounts.push({ name: 'Nest', type: 'nest', ...config.nest });
      delete config.nest;
    }
    if (config.google?.issuetoken && config.google?.cookie) {
      config.accounts.push({ name: 'Google', type: 'google', ...config.google, issueToken: config.google.issuetoken });
      delete config.accounts.at(-1).issuetoken;
      delete config.google;
    }
  }
  config.devices ??= [];
  if (object(config.devices)) {
    config.devices = Object.entries(config.devices).map(([serialNumber, options]) => {
      if (!object(options)) {
        throw new Error('Invalid device options');
      }
      return { serialNumber, ...options };
    });
  }
  config.homes ??= [];
  config.options ??= {};
  if (
    !object(config.options) ||
    !Array.isArray(config.devices) ||
    !Array.isArray(config.homes) ||
    [...config.devices, ...config.homes].some((item) => !object(item))
  ) {
    throw new Error('Invalid configuration containers');
  }
  return config;
}

export function nextSetpoint(entries, timeZone, now = new Date()) {
  if (!timeZone || !entries.length) {
    return null;
  }
  let parts;
  try {
    parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(now)
        .map((part) => [part.type, part.value]),
    );
  } catch {
    return null;
  }
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday);
  const current = day * 86400 + Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  return (
    entries
      .filter(
        (entry) =>
          Number.isInteger(entry.day) &&
          entry.day >= 0 &&
          entry.day <= 6 &&
          Number.isFinite(entry.time) &&
          entry.time >= 0 &&
          entry.time < 86400,
      )
      .map((entry) => ({
        ...entry,
        distance: (((entry.day * 86400 + entry.time - current) % 604800) + 604800) % 604800 || 604800,
      }))
      .sort((a, b) => a.distance - b.distance)[0] ?? null
  );
}
