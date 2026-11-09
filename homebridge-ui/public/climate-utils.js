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

export function selectedNestSensor(data = {}) {
  const selection = data.native_sensor_control?.selection;
  if (selection) return selection.source === 'thermostat' ? '' : selection.source === 'remote' ? selection.sensorId : null;
  return typeof data.active_rcs_sensor === 'string' ? data.active_rcs_sensor : null;
}

// Use running-engine feedback, never unsaved rule settings, to describe the controller.
export function temperatureControlView(device, snapshot, live = true) {
  const data = device.data || {};
  const selected = selectedNestSensor(data);
  const name = (id) => id === '' ? 'Thermostat sensor' : id === null ? 'Current sensor not reported' :
    snapshot.devices.find((entry) => entry.type === 'TemperatureSensor' && entry.id === id)?.data?.description ||
      'Nest room sensor (name unavailable)';
  const labels = {
    active: 'Active', interval: 'Active · between updates', updating: 'Confirming target', restoring: 'Restoring Nest control',
    waiting: 'Waiting', paused: 'Paused', disabled: 'Disabled', unavailable: 'Status unavailable',
  };
  const automation = snapshot.automation;
  const engineAvailable = automation?.available !== false && !automation?.error;
  const rules = (automation?.rules || []).filter((rule) => rule.kind === 'temperature' && rule.thermostatId === device.serial)
    .map((rule) => {
      const status = !live || !engineAvailable ? 'unavailable' : rule.temperatureControl === 'restoring' ? 'restoring' :
        !rule.enabled ? 'disabled' : rule.paused ? 'paused' : Object.hasOwn(labels, rule.temperatureControl) ? rule.temperatureControl : 'unavailable';
      return { id: rule.id, name: rule.name, status, label: labels[status], reason: rule.reason,
        tone: ['active', 'interval'].includes(status) ? 'good' : ['paused', 'disabled'].includes(status) ? 'neutral' : 'warn' };
    });
  const applied = rules.filter((rule) => ['active', 'interval', 'updating', 'restoring'].includes(rule.status));
  const uncertain = !live || !engineAvailable || applied.length > 1 || rules.some((rule) => rule.status === 'unavailable');
  const controller = applied.length === 1 && !uncertain ? applied[0] : null;
  const nativeIds = [...new Set(['', ...(Array.isArray(data.linked_rcs_sensors) ? data.linked_rcs_sensors : []),
    ...(typeof selected === 'string' ? [selected] : [])])];
  const sensors = nativeIds.map((id) => ({
    id, name: name(id),
    label: id !== selected ? 'Not selected' : !live ? 'Last reported' : controller ? 'Nest sensor in use' : 'Selected by Nest',
    tone: id === selected && live ? 'good' : 'neutral',
  }));
  let title = name(selected);
  let label = selected === null ? 'Unknown' : 'Native Nest control';
  let tone = selected === null ? 'warn' : 'good';
  let detail = 'Nest uses its selected sensor. Manage native sensor selection in the Nest app.';
  if (uncertain) {
    title = 'Control status unavailable'; label = 'Unknown'; tone = 'warn';
    detail = !live ? 'Reconnect to confirm what is controlling the temperature.' :
      'The running engine has not confirmed the current controller. Check Climate rules for details.';
  } else if (controller) {
    title = 'Climate rule · ' + controller.name; label = controller.label; tone = controller.tone;
    detail = controller.status === 'restoring' ? 'The rule is returning its previous heating target to Nest.' :
      controller.status === 'updating' ? 'Waiting for Nest to confirm the rule’s requested heating target.' :
        'This rule adjusts the heating target using its selected temperatures. Nest uses ' + name(selected) + '.';
  } else if (selected === null) {
    detail = 'Nest has not reported a recognized temperature-sensor selection.';
  }
  return { title, label, tone, detail, sensors, rules };
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
