import { validTimeZone } from './climate-utils.js';

const common = [
  ['America/Los_Angeles', 'Pacific Time — Los Angeles'],
  ['America/Denver', 'Mountain Time — Denver'],
  ['America/Phoenix', 'Arizona — Phoenix'],
  ['America/Chicago', 'Central Time — Chicago'],
  ['America/New_York', 'Eastern Time — New York'],
  ['America/Anchorage', 'Alaska — Anchorage'],
  ['Pacific/Honolulu', 'Hawaii — Honolulu'],
  ['America/Halifax', 'Atlantic Time — Halifax'],
  ['America/St_Johns', 'Newfoundland — St. John’s'],
  ['Europe/London', 'United Kingdom — London'],
  ['Europe/Paris', 'Central Europe — Paris'],
  ['Australia/Sydney', 'Australia — Sydney'],
  ['Pacific/Auckland', 'New Zealand — Auckland'],
  ['UTC', 'UTC'],
];

export function timeZoneChoices(current) {
  let supported = [];
  try { supported = Intl.supportedValuesOf('timeZone'); } catch { /* Common choices remain available in older browsers. */ }
  const choices = new Map(common);
  for (const zone of supported) if (!choices.has(zone)) choices.set(zone, zone.replaceAll('_', ' '));
  // Preserve aliases and any existing manual setting, including one that needs correction.
  if (current && !choices.has(current)) choices.set(current, current);
  return [...choices];
}

export function mountTimeZonePicker(host, { value = '', data = {}, changed }) {
  const label = document.createElement('label');
  label.textContent = 'Nest schedule time zone';
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Nest schedule time zone');
  const automatic = new Option('Automatic — use Nest’s reported time zone', '');
  select.add(automatic);
  for (const [zone, title] of timeZoneChoices(value)) select.add(new Option(title, zone));
  select.value = value;
  label.append(select);
  const status = document.createElement('small');
  status.className = 'small-note';
  status.setAttribute('aria-live', 'polite');
  const help = document.createElement('small');
  help.className = 'small-note';
  help.textContent = 'Named zones follow daylight-saving rules automatically. This setting controls schedule interpretation in the plugin.';
  host.append(label, status, help);
  const update = (latest = data) => {
    data = latest;
    const zone = validTimeZone(data.schedule_time_zone);
    const source = data.schedule_time_zone_source === 'thermostat' ? 'Nest thermostat' : data.schedule_time_zone_source === 'home' ? 'Nest home' : 'Nest';
    automatic.textContent = zone ? 'Automatic — ' + zone + ' (from ' + source + ')' : 'Automatic — Nest time zone unavailable';
    status.textContent = select.value
      ? (validTimeZone(select.value) ? 'Manual override: ' + select.value + '. ' : 'The saved time zone is invalid. Choose a named time zone. ') + (zone ? source + ' reports ' + zone + '.' : 'Nest has not reported a time zone.')
      : zone ? 'Using ' + zone + ', reported by your ' + source + '.' : 'Nest has not reported a time zone. Choose one manually to calculate schedule changes and use scheduled heating control.';
  };
  select.addEventListener('change', () => { update(); changed(select.value); });
  update();
  return { update };
}
