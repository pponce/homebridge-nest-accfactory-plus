import { mountRoomPreview } from './room-preview.js';
import { mountWebDashboardSetup } from './web-dashboard-setup.js';
import { nextSetpoint, editableConfig, displayTemperature, scheduleTimeZone } from './climate-utils.js';
import { mountTimeZonePicker } from './time-zone-picker.js';
const hb = window.homebridge;
const $ = (id) => document.getElementById(id);
let blocks = [];
let config;
let status;
let settingsKey = '';
const timeZonePickers = new Map();
let saveQueue = Promise.resolve();
let refreshing = false;
let liveAvailable = false;
const roomPreview = mountRoomPreview({
  host: $('room-preview'),
  homebridge: hb,
  getStatus: () => (liveAvailable ? status : undefined),
  getConfig: () => config,
  changed,
});
const webDashboardSetup = mountWebDashboardSetup({ host: $('web-dashboard'), homebridge: hb, getConfig: () => config, changed });
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) {
    node.textContent = text;
  }
  if (className) {
    node.className = className;
  }
  return node;
}
function notice(text) {
  $('notice').hidden = !text;
  $('notice').textContent = text;
}
function changed() {
  $('save-state').textContent = 'Unsaved changes — use Homebridge Save';
  const copy = structuredClone(blocks);
  saveQueue = saveQueue
    .then(() => hb.updatePluginConfig(copy))
    .catch(() => {
      notice('Could not update configuration. Keep this page open and retry your change.');
    });
}
function field(container, title, value, update, type = 'text', choices) {
  const label = el('label', title);
  const input = el(choices ? 'select' : 'input');
  if (choices) {
    for (const [key, title] of choices) {
      const option = el('option', title);
      option.value = key;
      input.append(option);
    }
  } else {
    input.type = type;
  }
  input.value = value ?? '';
  if (type === 'password') {
    input.autocomplete = 'off';
    input.spellcheck = false;
  }
  input.addEventListener(choices ? 'change' : 'input', () => {
    update(input.value);
    changed();
  });
  label.append(input);
  container.append(label);
  return input;
}
function check(container, title, value, update) {
  const label = el('label', undefined, 'check');
  const input = el('input');
  input.type = 'checkbox';
  input.checked = value === true;
  input.addEventListener('change', () => {
    update(input.checked);
    changed();
  });
  label.append(input, document.createTextNode(title));
  container.append(label);
}
function button(container, text, action) {
  const node = el('button', text);
  node.type = 'button';
  node.addEventListener('click', action);
  container.append(node);
  return node;
}
function accounts() {
  $('accounts').replaceChildren();
  config.accounts.forEach((account, index) => {
    const section = el('div', undefined, 'account');
    const grid = el('div', undefined, 'grid');
    field(grid, 'Account name', account.name, (value) => {
      account.name = value;
    });
    field(
      grid,
      'Account type',
      account.type ?? 'google',
      (value) => {
        account.type = value;
        // Only remove credentials for the explicitly deselected method.
        if (value === 'google') {
          delete account.access_token;
        } else {
          delete account.issueToken;
          delete account.cookie;
          delete account.refreshToken;
          delete account.authMethod;
        }
        accounts();
      },
      'text',
      [
        ['google', 'Google'],
        ['nest', 'Nest (Protect only)'],
      ],
    );
    if (account.type !== 'nest') {
      field(
        grid,
        'Authentication',
        account.authMethod ?? 'issueTokenCookie',
        (value) => {
          account.authMethod = value;
          if (value === 'refreshToken') {
            delete account.issueToken;
            delete account.cookie;
          } else {
            delete account.refreshToken;
          }
          accounts();
        },
        'text',
        [
          ['issueTokenCookie', 'Issue token and cookie'],
          ['refreshToken', 'Existing legacy refresh token'],
        ],
      );
      if (account.authMethod === 'refreshToken') {
        field(
          grid,
          'Legacy refresh token',
          account.refreshToken,
          (value) => {
            account.refreshToken = value;
          },
          'password',
        );
      } else {
        field(
          grid,
          'Issue token URL',
          account.issueToken,
          (value) => {
            account.issueToken = value;
          },
          'password',
        );
        field(
          grid,
          'Cookie',
          account.cookie,
          (value) => {
            account.cookie = value;
          },
          'password',
        );
      }
    } else {
      field(
        grid,
        'Nest access token',
        account.access_token,
        (value) => {
          account.access_token = value;
        },
        'password',
      );
    }
    section.append(grid);
    const advanced = el('details');
    advanced.append(el('summary', 'Account options'));
    check(advanced, 'Disable this account', account.exclude, (value) => {
      account.exclude = value;
    });
    check(advanced, 'Use Field Test endpoints', account.fieldTest, (value) => {
      account.fieldTest = value;
    });
    button(advanced, 'Remove account', () => {
      if (window.confirm('Remove this account from the configuration?')) {
        config.accounts.splice(index, 1);
        accounts();
        changed();
      }
    });
    section.append(advanced);
    $('accounts').append(section);
  });
}
function homes() {
  $('homes').replaceChildren();
  (config.homes ?? []).forEach((home, index) => {
    const grid = el('div', undefined, 'account grid');
    field(grid, 'Home name (exact match)', home.name, (value) => {
      home.name = value;
    });
    check(grid, 'Exclude this home', home.exclude, (value) => {
      home.exclude = value;
    });
    button(grid, 'Remove home override', () => {
      config.homes.splice(index, 1);
      homes();
      changed();
    });
    $('homes').append(grid);
  });
}
function optionsFor(device) {
  let options = config.devices.find((entry) => entry.serialNumber === device.serial);
  if (!options) {
    options = { serialNumber: device.serial };
    config.devices.push(options);
  }
  return options;
}
function settings() {
  const devices = status?.devices ?? [];
  for (const device of devices) timeZonePickers.get(device.serial)?.update(device.data);
  const key = devices
    .map((d) => d.serial + ':' + d.type + ':' + d.data.has_fan)
    .sort()
    .join('|');
  if (key === settingsKey && $('device-settings').childElementCount) {
    return;
  }
  settingsKey = key;
  $('device-settings').replaceChildren();
  timeZonePickers.clear();
  if (!devices.length) {
    $('device-settings').append(el('p', 'Device options appear after discovery. Existing overrides are preserved.'));
  }
  for (const device of devices.filter((d) => ['Thermostat', 'Heatlink'].includes(d.type))) {
    const options = config.devices.find((entry) => entry.serialNumber === device.serial) ?? {};
    const section = el('div', undefined, 'device-setting');
    section.append(el('h3', device.data.description || device.serial));
    const grid = el('div', undefined, 'grid');
    check(grid, 'Exclude from Apple Home', options.exclude, (v) => {
      optionsFor(device).exclude = v;
    });
    field(
      grid,
      'Eve history',
      options.eveHistory === undefined ? '' : String(options.eveHistory),
      (v) => {
        if (v === '') {
          delete optionsFor(device).eveHistory;
        } else {
          optionsFor(device).eveHistory = v === 'true';
        }
      },
      'text',
      [
        ['', 'Use global setting'],
        ['true', 'Enabled'],
        ['false', 'Disabled'],
      ],
    );
    if (device.type === 'Thermostat') {
      const timeZoneField = el('div');
      grid.append(timeZoneField);
      timeZonePickers.set(device.serial, mountTimeZonePicker(timeZoneField, { value: options.scheduleTimeZone || '', data: device.data, changed: (value) => {
        if (value) optionsFor(device).scheduleTimeZone = value;
        else delete optionsFor(device).scheduleTimeZone;
        schedule(); changed();
      } }));
      check(grid, 'Eco switch in Apple Home', options.ecoSwitch, (v) => {
        optionsFor(device).ecoSwitch = v;
      });
      check(grid, 'Separate humidity sensor', options.humiditySensor, (v) => {
        optionsFor(device).humiditySensor = v;
      });
      if (device.data.has_fan) {
        field(
          grid,
          'Default HVAC fan duration',
          options.fanDuration ?? '',
          (v) => {
            if (v === '') {
              delete optionsFor(device).fanDuration;
            } else {
              optionsFor(device).fanDuration = v;
            }
          },
          'text',
          [
            ['', 'Use Nest duration'],
            ...[15, 30, 45, 60, 120, 240, 480, 720, 1440, 4320, 7200, 10080].map((v) => [v + 'm', v + ' minutes']),
          ],
        );
        check(grid, 'HVAC fan preset switches (15, 30, 60 min)', options.fanPresetSwitches, (v) => {
          optionsFor(device).fanPresetSwitches = v;
        });
      }
    } else {
      field(
        grid,
        'Hot-water boost duration',
        options.hotwaterBoostTime ?? '30m',
        (v) => {
          optionsFor(device).hotwaterBoostTime = v;
        },
        'text',
        [
          ['30m', '30 minutes'],
          ['60m', '60 minutes'],
          ['120m', '2 hours'],
        ],
      );
    }
    section.append(grid);
    $('device-settings').append(section);
  }
}
function temp(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  const unit = config?.dashboardTemperatureUnit === 'F' ? 'F' : 'C';
  return displayTemperature(value, unit).toFixed(1) + ' °' + unit;
}
function when(value) {
  return value ? new Date(value).toLocaleString() : 'Not yet received';
}
function usable(device) {
  const account = status.accounts.find((a) => a.id === device.account);
  return liveAvailable && account?.authorised && account?.observing && !device.needsUpdate && device.data.online === true;
}
async function command(device, action, value, control) {
  control.disabled = true;
  try {
    const result = await hb.request('/command', { serial: device.serial, action, value });
    notice(result.message);
    await refresh();
  } catch (error) {
    notice(error.message || 'Command failed. Refresh to check device state.');
  } finally {
    control.disabled = !usable(device);
  }
}
function render() {
  const devices = status.devices ?? [];
  const thermostats = devices.filter((d) => d.type === 'Thermostat');
  $('device-cards').replaceChildren();
  $('sensor-cards').replaceChildren();
  $('sensor-controls').replaceChildren();
  $('heatlink-cards').replaceChildren();
  if (!thermostats.length) {
    $('device-cards').append(el('p', 'No thermostats discovered. Check account status below.'));
  }
  for (const device of thermostats) {
    const data = device.data;
    const card = el('article', undefined, 'card');
    card.append(el('h3', data.description || 'Thermostat'));
    card.append(
      el('span', usable(device) ? data.hvac_state || 'Connected' : 'Unavailable / stale', 'pill' + (usable(device) ? '' : ' warn')),
    );
    card.append(el('div', temp(data.current_temperature, data), 'temperature'));
    card.append(el('p', 'Target ' + temp(data.target_temperature, data) + ' · ' + (data.hvac_mode || 'Unknown mode')));
    card.append(el('small', 'Last device update: ' + when(device.lastUpdate)));
    const actions = el('div', undefined, 'actions');
    if (typeof data.eco_mode === 'boolean') {
      const eco = button(actions, data.eco_mode ? 'Turn Eco off' : 'Turn Eco on', () => command(device, 'eco', !data.eco_mode, eco));
      eco.disabled = !usable(device);
    }
    if (data.has_fan) {
      for (const minutes of [15, 30, 60]) {
        const fan = button(actions, 'HVAC fan ' + minutes + 'm', () => command(device, 'fan', minutes, fan));
        fan.disabled = !usable(device);
      }
    }
    card.append(actions);
    $('device-cards').append(card);
    const group = el('div', undefined, 'account');
    group.append(el('h3', data.description || 'Thermostat'));
    const label = el('label', 'Temperature controlled by');
    const select = el('select');
    const builtin = el('option', 'Thermostat built-in sensor');
    builtin.value = '';
    select.append(builtin);
    for (const id of data.linked_rcs_sensors ?? []) {
      const sensor = devices.find((d) => d.id === id);
      const option = el('option', sensor?.data.description || 'Sensor ' + id.slice(-6));
      option.value = id;
      select.append(option);
    }
    select.value = data.active_rcs_sensor ?? '';
    select.disabled = !usable(device) || !Array.isArray(data.linked_rcs_sensors);
    label.append(select);
    group.append(label);
    const apply = button(group, 'Use selected sensor', () => command(device, 'sensor', select.value, apply));
    apply.disabled = select.disabled;
    group.append(el('p', 'Manual selection may be replaced by Nest’s sensor schedule.', 'help'));
    $('sensor-controls').append(group);
  }
  for (const device of devices.filter((d) => ['TemperatureSensor', 'Heatlink'].includes(d.type))) {
    const card = el('article', undefined, 'card');
    card.append(el('h3', device.data.description || device.type));
    card.append(
      el(
        'p',
        device.type === 'Heatlink'
          ? 'Hot-water boost: ' + (device.data.hot_water_boost_active ? 'On' : 'Off')
          : temp(device.data.current_temperature, device.data),
      ),
    );
    card.append(el('small', 'Last update: ' + when(device.lastUpdate)));
    $(device.type === 'Heatlink' ? 'heatlink-cards' : 'sensor-cards').append(card);
  }
  const selected = $('selected-device').value;
  $('selected-device').replaceChildren();
  for (const device of thermostats) {
    const option = el('option', device.data.description || device.serial);
    option.value = device.serial;
    $('selected-device').append(option);
  }
  if (thermostats.some((d) => d.serial === selected)) {
    $('selected-device').value = selected;
  }
  $('connection-details').replaceChildren();
  for (const account of status.accounts) {
    const row = el(
      'p',
      account.name +
        ': ' +
        (account.authorised ? 'Authorized' : 'Not authorized') +
        ' · ' +
        (liveAvailable && account.observing ? 'Receiving Google updates' : 'Updates unavailable') +
        ' · Last update: ' +
        when(account.lastUpdate),
    );
    $('connection-details').append(row);
  }
  if (status.lastCommand) {
    $('connection-details').append(
      el(
        'p',
        'Last command: ' +
          status.lastCommand.action +
          ' · ' +
          (status.lastCommand.accepted ? 'Accepted by API' : 'Failed') +
          ' · ' +
          when(status.lastCommand.at),
      ),
    );
  }
  settings();
  schedule();
  roomPreview.render();
}
function schedule() {
  const device = status?.devices.find((d) => d.serial === $('selected-device').value);
  $('schedule-rows').replaceChildren();
  $('runtime-rows').replaceChildren();
  $('runtime-chart').replaceChildren();
  if (!device) {
    $('next-change').textContent = 'Select a discovered thermostat.';
    return;
  }
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const entries = [];
  for (const [day, points] of Object.entries(device.data.schedules ?? {})) {
    for (const point of Object.values(points)) {
      entries.push({ day: Number(day), ...point });
    }
  }
  entries.sort((a, b) => a.day - b.day || a.time - b.time);
  for (const point of entries) {
    const row = el('tr');
    const time =
      String(Math.floor(point.time / 3600)).padStart(2, '0') + ':' + String(Math.floor((point.time % 3600) / 60)).padStart(2, '0');
    for (const text of [names[point.day], time, temp(point['temp-min'], device.data), temp(point['temp-max'], device.data)]) {
      row.append(el('td', text));
    }
    $('schedule-rows').append(row);
  }
  const zone = scheduleTimeZone(config.devices.find((d) => d.serialNumber === device.serial), device.data);
  const next = nextSetpoint(entries, zone);
  $('next-change').textContent = next
    ? 'Next planned setpoint: ' +
      names[next.day] +
      ' ' +
      String(Math.floor(next.time / 3600)).padStart(2, '0') +
      ':' +
      String(Math.floor((next.time % 3600) / 60)).padStart(2, '0') +
      ' (' +
      zone +
      '). This is not a confirmed override expiry.'
    : entries.length
      ? 'Choose this thermostat’s Nest schedule time zone in Settings to see the next planned change; no override end time is assumed.'
      : 'No schedule reported for the current mode.';
  const runtime = device.runtime ?? [];
  const maximum = Math.max(60, ...runtime.flatMap((day) => [day.heating, day.cooling]));
  for (const day of runtime) {
    const row = el('tr');
    for (const value of [day.date, minutes(day.heating), minutes(day.cooling), minutes(day.observed)]) {
      row.append(el('td', value));
    }
    $('runtime-rows').append(row);
    const bars = el('div', undefined, 'bar-group');
    bars.setAttribute('aria-label', day.date + ': heating ' + minutes(day.heating) + ', cooling ' + minutes(day.cooling));
    for (const mode of ['heating', 'cooling']) {
      const bar = el('div', undefined, 'bar' + (mode === 'cooling' ? ' cool' : ''));
      bar.style.height = (day[mode] / maximum) * 100 + '%';
      bar.title = mode + ': ' + minutes(day[mode]);
      bars.append(bar);
    }
    $('runtime-chart').append(bars);
  }
}
function minutes(seconds) {
  return Math.round(seconds / 60) + ' min';
}
async function refresh() {
  if (refreshing) {
    return;
  }
  refreshing = true;
  $('refresh').disabled = true;
  try {
    status = await hb.request('/status');
    liveAvailable = true;
    $('live-status').textContent = 'Bridge connected';
    $('live-status').className = 'pill';
    render();
  } catch {
    liveAvailable = false;
    $('live-status').textContent = 'Bridge unavailable';
    $('live-status').className = 'pill warn';
    notice('Live data unavailable. Start or restart the Nest bridge, then refresh. Saved settings remain editable.');
    if (status) {
      render();
    }
  } finally {
    refreshing = false;
    $('refresh').disabled = false;
  }
}
$('add-account').onclick = () => {
  config.accounts.push({ name: 'Google', type: 'google', authMethod: 'issueTokenCookie' });
  accounts();
  changed();
};
$('add-home').onclick = () => {
  (config.homes ??= []).push({ name: '' });
  homes();
  changed();
};
$('temperature-unit').onchange = (event) => { config.dashboardTemperatureUnit = event.target.value; changed(); render(); };
$('eve-history').onchange = (event) => {
  config.options.eveHistory = event.target.checked;
  changed();
};
$('debug').onchange = (event) => {
  config.options.debug = event.target.checked;
  changed();
};
$('support-dump').onchange = (event) => {
  config.options.supportDump = event.target.checked;
  changed();
};
$('selected-device').onchange = schedule;
$('refresh').onclick = refresh;
$('schema-form').onclick = async () => {
  await saveQueue;
  hb.showSchemaForm();
};
$('copy-diagnostics').onclick = async () => {
  // Deliberate allow-list: no credentials, names, serials, or resource IDs.
  const safe = {
    generatedAt: status?.generatedAt,
    bridgeAvailable: liveAvailable,
    accounts: status?.accounts.map((a) => ({
      authorised: a.authorised,
      observing: a.observing,
      authMethod: a.authMethod,
      lastUpdate: a.lastUpdate,
    })),
    devices: status?.devices.map((d) => ({ type: d.type, online: d.data.online, lastUpdate: d.lastUpdate })),
    lastCommand: status?.lastCommand,
  };
  try {
    await navigator.clipboard.writeText(JSON.stringify(safe, null, 2));
    notice('Safe diagnostics copied.');
  } catch {
    notice('Clipboard unavailable in this browser.');
  }
};
try {
  blocks = await hb.getPluginConfig();
  if (!blocks.length) {
    blocks = [{ platform: 'NestClimateCntrl', name: 'Nest Climate Cntrl', accounts: [] }];
  }
  config = editableConfig(blocks[0]);
  blocks[0] = config;
  $('eve-history').checked = config.options.eveHistory !== false;
  $('temperature-unit').value = config.dashboardTemperatureUnit === 'F' ? 'F' : 'C';
  $('debug').checked = config.options.debug === true;
  $('support-dump').checked = config.options.supportDump === true;
  accounts();
  homes();
  webDashboardSetup.render();
  await webDashboardSetup.refresh();
  await refresh();
  const timer = setInterval(() => {
    if (!document.hidden && !document.activeElement?.closest('#sensors')) {
      refresh();
    }
  }, 30000);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
} catch {
  notice('Configuration could not be loaded. Open the full configuration form to review it.');
  for (const id of ['add-account', 'add-home', 'temperature-unit', 'eve-history', 'debug', 'support-dump']) {
    $(id).disabled = true;
  }
}
