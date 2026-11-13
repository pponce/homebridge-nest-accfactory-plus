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
    active: 'Active', interval: 'Active · between updates', updating: 'Confirming target', recovering: 'Recovering feedback', restoring: 'Restoring Nest control',
    idle: 'Occupancy not met', scheduled: 'Scheduled', standby: 'Standby', waiting: 'Waiting', paused: 'Paused', disabled: 'Disabled', unavailable: 'Status unavailable',
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
  const applied = rules.filter((rule) => ['active', 'interval', 'updating', 'recovering', 'restoring'].includes(rule.status));
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
      controller.status === 'recovering' ? 'Adjustments are on hold while Nest feedback recovers. The rule resumes automatically after confirmation.' :
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

export function upcomingSetpoints(entries, timeZone, now = new Date()) {
  if (!timeZone || !entries.length) {
    return [];
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
    return [];
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
      .sort((a, b) => a.distance - b.distance)
  );
}

export function nextSetpoint(entries, timeZone, now = new Date()) {
  return upcomingSetpoints(entries, timeZone, now)[0] ?? null;
}

// Describe the selected thermostat using reported mode and running-rule feedback.
export function scheduleOverview(device, snapshot, options = {}, live = true, now = new Date()) {
  const data = device?.data || {};
  const normalizeMode = (value) => ['range', 'heatcool'].includes(value?.toLowerCase()) ? 'range' : value?.toLowerCase();
  const mode = normalizeMode(data.hvac_mode);
  const modeLabel = { heat: 'Heat mode', cool: 'Cool mode', range: 'Heat / Cool mode', off: 'Off' }[mode] || 'Mode unavailable';
  const zone = scheduleTimeZone(options, data);
  const entries = ['heat', 'cool', 'range'].includes(mode) ? Object.entries(data.schedules || {}).flatMap(([day, points]) =>
    Object.values(points || {}).filter((point) => (!point.type || normalizeMode(point.type) === mode) &&
      (!point.entry_type || point.entry_type === 'setpoint')).map((point) => ({ ...point, day: Number(day), targets: [
      ...(mode !== 'cool' ? [{ label: 'Heat', value: point['temp-min'] ?? (mode === 'heat' ? point.temp : undefined) }] : []),
      ...(mode !== 'heat' ? [{ label: 'Cool', value: point['temp-max'] ?? (mode === 'cool' ? point.temp : undefined) }] : []),
    ] }))) : [];
  const points = upcomingSetpoints(entries, zone, now).slice(0, 3);
  const empty = !device ? 'Select a thermostat to see its Nest schedule.' : mode === 'off' ?
    'The thermostat is off. No temperature schedule is active.' : !['heat', 'cool', 'range'].includes(mode) ?
      'Nest has not reported a usable mode for this thermostat.' : !entries.length ?
        'No schedule has been reported for this thermostat’s current mode.' : !zone ?
          'Choose this thermostat’s Nest schedule time zone in Settings to calculate upcoming changes.' :
          'No usable schedule times have been reported for this thermostat.';
  const view = device ? temperatureControlView(device, snapshot, live) : null;
  const unknown = !device || !snapshot.automation || view?.label === 'Unknown';
  const controller = !unknown && view.rules.find((rule) => ['active', 'interval', 'updating', 'recovering', 'restoring'].includes(rule.status));
  const heating = mode === 'heat' && data.eco_mode === false;
  let title = 'Nest sensor control';
  let label = 'Native control';
  let tone = 'neutral';
  let detail = selectedNestSensor(data) === '' ? 'Nest uses its built-in temperature sensor for scheduled targets.' :
    'Nest uses its selected temperature sensor for scheduled targets.';
  let runtime = null;
  if (unknown) {
    title = 'Control status unavailable'; label = 'Unknown'; tone = 'warn';
    detail = 'Current climate-rule control cannot be confirmed. Reconnect or check Climate rules before relying on this preview.';
  } else if (controller && heating) {
    title = 'Climate rule · ' + controller.name; label = controller.label; tone = controller.tone;
    runtime = snapshot.automation.rules.find((rule) => rule.id === controller.id);
    detail = controller.status === 'restoring' ? 'This rule is returning its previous heating target to Nest; it is not applying a new room target.' :
      'If this rule is still controlling heating at the scheduled change, the confirmed Nest heating target becomes its desired room temperature. ' +
      'It then adjusts Nest’s target using the selected sensor readings, adjustment limit and minimum update interval. Nest’s target may differ from the room target.';
    if (['updating', 'recovering'].includes(controller.status)) detail = (runtime.reason || 'Waiting for Nest to confirm a target.') + ' ' + detail;
  } else if (view.rules.length) {
    title = 'Climate rules inactive'; label = 'Not adjusting';
    detail = 'No climate temperature rule is adjusting this thermostat now. ' + detail;
  }
  if (data.eco_mode === true) detail = 'Eco is on. These are the normal Nest schedule targets; Eco can prevent them from taking effect. ' + detail;
  else if (mode === 'off') detail = 'Turn on a supported mode to use its Nest temperature schedule. Climate temperature rules require Heat mode with Eco off.';
  return { name: data.description || (device ? 'Thermostat' : 'No thermostat selected'), modeLabel, mode, zone, points, empty,
    eco: data.eco_mode === true, live, control: { title, label, tone, detail, rules: view?.rules || [], runtime } };
}

