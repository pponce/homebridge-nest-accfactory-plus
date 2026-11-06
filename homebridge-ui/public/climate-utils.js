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
