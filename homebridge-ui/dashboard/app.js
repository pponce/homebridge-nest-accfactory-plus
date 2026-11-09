import { nextSetpoint, displayTemperature, celsiusTemperature, scheduleTimeZone } from '/shared/climate-utils.js';
import { mountTimeZonePicker } from '/shared/time-zone-picker.js';
import { sensorSources, previewGroup, presenceSources } from '/shared/sensor-preview.js';
import { normalizeFanRule, fanSpeedError, fanRulePlan, fanSpeedLimits, supportedSpeed } from '/shared/fan-speed.js';

const $ = (id) => document.getElementById(id);
for (const id of ['http-login-warning', 'http-session-warning']) $(id).hidden = window.location.protocol !== 'http:';
const iconPaths = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  sensors: '<circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4m8.4-8.4a6 6 0 0 1 0 8.4M4.6 4.6a10.5 10.5 0 0 0 0 14.8m14.8-14.8a10.5 10.5 0 0 1 0 14.8"/>',
  rules: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="12" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10m2-12h3a4 4 0 0 1 4 4v3h1m-1 0v3a4 4 0 0 1-4 4H8"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M5 15a8 8 0 0 0 13 3"/>',
  leaf: '<path d="M20 3c0 9-3 16-10 16a6 6 0 0 1-6-6C4 6 12 5 20 3ZM4 21l10-10"/>',
  fan: '<circle cx="12" cy="12" r="2"/><path d="M11 10C4 8 7 2 11 3c3 0 3 3 2 7m1 1c2-7 8-4 7 0 0 3-3 3-7 2m-1 1c7 2 4 8 0 7-3 0-3-3-2-7m-1-1c-2 7-8 4-7 0 0-3 3-3 7-2"/>',
  thermometer: '<path d="M9 14.8V5a3 3 0 0 1 6 0v9.8a5 5 0 1 1-6 0Z"/><path d="M12 8v9m5-8h3m-3-4h2"/><circle cx="12" cy="18" r="1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2m-8 3h2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  logout: '<path d="M9 4H4v16h5m5-12 4 4-4 4m-6-4h10"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  shield: '<path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  draft: '<path d="m14 4 6 6-10 10H4v-6ZM12 6l6 6M4 14l6 6"/>',
  droplet: '<path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  motion: '<circle cx="14" cy="4" r="2"/><path d="m7 10 4-3 5 5 4 1m-9-6-2 7-4 6m4-6 5 2 1 5"/>',
};
function icon(name) {
  const node = document.createElement('span');
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = '<svg class="icon" viewBox="0 0 24 24">' + (iconPaths[name] || iconPaths.sensors) + '</svg>';
  return node;
}
document.querySelectorAll('[data-icon]').forEach((node) => node.replaceChildren(icon(node.dataset.icon)));
const state = {
  session: null, envelope: null, config: null, dirty: false, saving: false, live: false, heating: null, restarting: false, restartMessage: '', sensorSetupBusy: false,
  status: { accounts: [], devices: [] }, external: { sources: [], bridges: [] },
  page: 'overview', sourceFilter: 'all', ruleKind: 'temperature', ruleId: null, discovering: false,
};
const ruleKey = { temperature: 'temperature', presence: 'occupancy', fan: 'fans' };
const pageDetails = {
  overview: ['Your home at a glance', 'Climate overview'], sources: ['Connected rooms, clearer choices', 'Sensors & fans'],
  rules: ['Comfort, on your terms', 'Climate rules'], settings: ['The details that make it yours', 'Your setup'],
};
let toastTimer;
let refreshPromise;
let rulePickers = [];

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function pill(text, kind = 'neutral') { return el('span', text, 'status-pill ' + kind); }
function button(text, action, className = 'button secondary') {
  const node = el('button', text, className);
  node.type = 'button'; node.addEventListener('click', action); return node;
}
function notice(message = '', kind = '') {
  $('notice').hidden = !message; $('notice').textContent = message; $('notice').className = 'callout ' + kind;
}
function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6000);
}
function confirmAction(title, detail, accept, cancel = 'Keep editing', acceptStyle = 'danger') {
  const dialog = $('confirm-dialog');
  if (dialog.open) return Promise.resolve(false);
  $('confirm-title').textContent = title;
  $('confirm-detail').textContent = detail;
  $('confirm-accept').textContent = accept;
  $('confirm-accept').className = 'button ' + acceptStyle;
  $('confirm-cancel').textContent = cancel;
  dialog.returnValue = 'cancel';
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
    dialog.showModal();
    $('confirm-cancel').focus();
  });
}
$('confirm-dialog').addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const first = $('confirm-cancel'); const last = $('confirm-accept');
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
function empty(host, title, description, symbol = 'sensors', action) {
  const content = el('div', undefined, 'empty-state');
  const mark = el('span', undefined, 'device-symbol'); mark.append(icon(symbol));
  content.append(mark, el('h3', title), el('p', description)); if (action) content.append(action);
  host.replaceChildren(content);
}
function temperatureUnit() { return state.config?.temperatureUnit === 'F' ? 'F' : 'C'; }
function formatTemp(value, digits = 1) {
  return Number.isFinite(value) ? displayTemperature(value, temperatureUnit()).toFixed(digits) + '°' + temperatureUnit() : '—';
}
function temperatureField(host, title, value, change, { min, max, difference = false } = {}) {
  const unit = temperatureUnit();
  const display = (value) => Number(displayTemperature(value, unit, difference).toFixed(6));
  const input = inputField(host, title + ' (°' + unit + ')', display(value), (value) => change(celsiusTemperature(value, unit, difference)),
    { type: 'number', min: display(min), max: display(max), step: 'any' });
  input.required = true;
  return input;
}
function duration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm' : minutes + 'm';
}
function when(timestamp) {
  if (!Number.isFinite(timestamp)) return 'No update received';
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
function usable(device) {
  const account = state.status.accounts?.find((entry) => entry.id === device.account);
  return state.live && account?.authorised && account?.observing && !device.needsUpdate && device.data?.online === true;
}
function thermostats() { return (state.status.devices || []).filter((device) => device.type === 'Thermostat'); }
function deviceOptions(serial, create = false) {
  let options = state.config?.devices?.find((entry) => entry.serialNumber === serial);
  if (!options && create) { options = { serialNumber: serial }; (state.config.devices ??= []).push(options); }
  return options || {};
}
function sources() {
  const current = state.live ? state.status : { ...state.status, accounts: [] };
  const temperature = sensorSources(current, state.external);
  const nativeSerials = new Set((current.devices || []).map((device) => String(device.serial).toUpperCase()));
  const external = (state.external.sources || []).filter((source) => !['temperature', 'occupancy'].includes(source.kind) &&
    !String(source.serial ?? '').toUpperCase().startsWith('CLIMATE-PRESENCE-') &&
    !(source.kind === 'fan' && (nativeSerials.has(String(source.serial).toUpperCase()) || /nest|google/i.test(source.manufacturer || ''))));
  const homeAway = presenceSources(current, state.external);
  const now = Date.now();
  return [...temperature, ...homeAway, ...external].map((source) => ({
    ...source,
    available: Boolean(source.available && Number.isFinite(source.lastReadAt) && now - source.lastReadAt <= 90000 && source.lastReadAt <= now + 1000),
  }));
}
const matchesSource = (source, id) => source.id === id || source.aliases?.includes(id);
function markDirty() {
  state.dirty = true; $('save-bar').hidden = false; $('save-title').textContent = 'You have unsaved changes';
  $('save-detail').textContent = 'Saving applies enabled rules. Disabled rules remain drafts.'; $('save').disabled = state.saving;
  renderHeatingRecommendations();
  renderRestart();
  document.querySelectorAll('.sensor-setup button').forEach((control) => { control.disabled = true; });
}
async function api(route, { method = 'GET', body, anonymous = false, timeout = 20000 } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!['GET', 'HEAD'].includes(method) && state.session?.csrfToken) headers['X-CSRF-Token'] = state.session.csrfToken;
  const response = await fetch('/api' + route, { method, headers, credentials: 'same-origin', cache: 'no-store',
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !anonymous) showLogin('Your session expired. Sign in to continue. Unsaved changes stay in this page.');
    const error = new Error(data.error || 'The dashboard could not complete this request.'); error.status = response.status; throw error;
  }
  return data;
}
function showLogin(message = '', setup = false) {
  $('app').hidden = true; $('login-screen').hidden = false;
  $('login-error').textContent = message; $('login-error').hidden = !message;
  $('login-form').hidden = setup; $('setup-retry').hidden = !setup;
  $('login-title').textContent = setup ? 'A little setup first.' : 'Welcome home.';
  $('login-help').textContent = setup ? 'Create your web account in Homebridge → Nest Climate Cntrl → Web dashboard, then return here.' : 'Sign in with your Climate Cntrl web account.';
}
async function checkSession() {
  try {
    state.session = await api('/session', { anonymous: true });
    if (state.session.authenticated) await enterDashboard();
    else showLogin('', state.session.setupRequired);
  } catch { showLogin('Cannot reach the dashboard. Check the Nest child bridge and try again.'); }
}
async function enterDashboard() {
  $('login-screen').hidden = true; $('app').hidden = false; $('signed-in-name').textContent = state.session.username || 'Web account';
  $('password').value = '';
  route(false);
  const results = await Promise.allSettled([api('/config'), api('/status')]);
  if (results[0].status === 'fulfilled') {
    if (!state.dirty) { state.envelope = results[0].value; state.config = structuredClone(state.envelope.config); }
  } else notice(results[0].reason.message, 'danger');
  if (results[1].status === 'fulfilled') { state.status = results[1].value; state.live = true; }
  else { state.live = false; notice('Live status is unavailable. Check the Nest child bridge, then refresh.', 'warning'); }
  renderAll();
  discoverSources(false);
}
$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault(); $('sign-in').disabled = true; $('login-error').hidden = true;
  try {
    state.session = await api('/login', { method: 'POST', body: { username: $('username').value.trim(), password: $('password').value }, anonymous: true });
    await enterDashboard();
  } catch (error) { $('login-error').textContent = error.message; $('login-error').hidden = false; }
  finally { $('sign-in').disabled = false; }
});
$('setup-retry').addEventListener('click', checkSession);
async function signOut() {
  if (state.restarting) return;
  if (state.dirty && !await confirmAction('Sign out without saving?', 'Your unsaved changes will be discarded.', 'Discard and sign out')) return;
  try { await api('/logout', { method: 'POST', body: {} }); } catch (error) { if (error.status !== 401) { notice(error.message, 'danger'); return; } }
  state.session = null; state.config = null; state.envelope = null; state.dirty = false; state.live = false;
  state.heating = null;
  state.status = { accounts: [], devices: [] }; state.external = { sources: [], bridges: [] };
  $('save-bar').hidden = true; showLogin(); $('username').focus();
}
$('sign-out').addEventListener('click', signOut);
function route(focus = true) {
  const page = location.hash.slice(1); state.page = pageDetails[page] ? page : 'overview';
  document.querySelectorAll('[data-section]').forEach((node) => { node.hidden = node.dataset.section !== state.page; });
  document.querySelectorAll('[data-page]').forEach((node) => {
    if (node.dataset.page === state.page) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current');
  });
  [$('page-eyebrow').textContent, $('page-title').textContent] = pageDetails[state.page];
  if (state.page === 'rules') renderRules();
  if (state.page === 'settings' && state.config) refreshHeating();
  if (focus) { $('page-title').focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'auto' }); }
}
window.addEventListener('hashchange', () => route());
window.addEventListener('beforeunload', (event) => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });

async function refreshStatus() {
  if (state.restarting) return;
  if (refreshPromise) return refreshPromise;
  $('refresh-status').disabled = true;
  refreshPromise = (async () => {
    const session = state.session;
    try {
      await Promise.all([
        (async () => {
          try { const status = await api('/status'); if (state.session === session) { state.status = status; state.live = true; notice(); } }
          catch (error) { if (state.session === session) { state.live = false; notice(error.message || 'Live status unavailable.', 'warning'); } }
        })(),
        discoverSources(false),
        state.page === 'settings' ? refreshHeating() : Promise.resolve(),
      ]);
    }
    finally { $('refresh-status').disabled = false; refreshPromise = null; renderLive(); }
  })();
  return refreshPromise;
}
$('refresh-status').addEventListener('click', refreshStatus);
function refreshVisibleDashboard() {
  if (!document.hidden && state.session?.authenticated && !$('app').hidden) refreshStatus();
}
setInterval(refreshVisibleDashboard, 30000);
document.addEventListener('visibilitychange', refreshVisibleDashboard);
async function sendCommand(device, action, value, control) {
  if (!usable(device)) return;
  control.disabled = true;
  try {
    const response = await api('/command', { method: 'POST', body: { serial: device.serial, action, value } });
    toast(response.message || 'Command accepted. Checking device state…'); await refreshStatus();
  } catch (error) { notice(error.message, 'danger'); }
  finally { if (control.isConnected) control.disabled = !usable(device); }
}
function renderConnection() {
  const accounts = state.status.accounts || [];
  const connected = state.live && accounts.some((account) => account.authorised && account.observing);
  const label = connected ? 'Connected' : state.live ? 'Waiting for Nest' : 'Unavailable';
  $('connection-state').textContent = label; $('connection-state').className = 'status-pill ' + (connected ? 'good' : 'warn');
  $('connection-state').title = label;
  $('last-updated').textContent = state.live ? 'Updated ' + when(state.status.generatedAt) : 'Live updates unavailable';
}
function renderThermostats() {
  const devices = thermostats(); const host = $('thermostats'); host.replaceChildren();
  $('home-heading').textContent = state.config?.name || 'A clearer view of home.';
  const online = devices.filter(usable).length;
  $('overview-summary').textContent = devices.length ? online + ' of ' + devices.length + ' thermostats connected. A view of the rooms that matter.' : 'Your Nest thermostats appear here when the account connects.';
  if (!devices.length) empty(host, 'Your thermostats belong here.', 'Connect your Nest account in Homebridge. Live temperatures and controls appear once devices are discovered.', 'thermometer');
  for (const device of devices) {
    const data = device.data || {}; const available = usable(device); const scale = temperatureUnit();
    const card = el('article', undefined, 'thermostat-card'); const main = el('div', undefined, 'thermostat-main');
    const top = el('div', undefined, 'card-top'); const title = el('div', undefined, 'card-title'); const symbol = el('span', undefined, 'device-symbol'); symbol.append(icon('thermometer'));
    const text = el('div'); text.append(el('h3', data.description || 'Thermostat'), el('small', data.model || 'Nest thermostat'));
    title.append(symbol, text); top.append(title, pill(available ? (data.eco_mode ? 'Eco' : data.hvac_state === 'heating' ? 'Heating' : data.hvac_state === 'cooling' ? 'Cooling' : 'Idle') : 'Unavailable', available ? data.eco_mode ? 'good' : ['heating', 'cooling'].includes(data.hvac_state) ? data.hvac_state : 'neutral' : 'warn'));
    const row = el('div', undefined, 'temperature-row'); const current = el('div', undefined, 'current-temperature');
    const actual = Number.isFinite(data.current_temperature) ? displayTemperature(data.current_temperature, scale).toFixed(1) : '—';
    current.append(document.createTextNode(actual), el('span', '°' + scale));
    current.setAttribute('aria-label', 'Current temperature ' + formatTemp(data.current_temperature));
    const target = el('div', undefined, 'temperature-target');
    const targetText = data.hvac_mode === 'range' || data.hvac_mode === 'heatcool' ? formatTemp(data.target_temperature_low) + '–' + formatTemp(data.target_temperature_high) : formatTemp(data.target_temperature);
    target.append(el('strong', targetText), document.createTextNode('Target · ' + (data.hvac_mode || 'Unknown mode'))); row.append(current, target);
    const facts = el('div', undefined, 'device-facts');
    if (Number.isFinite(data.current_humidity)) { const fact = el('span'); fact.append(icon('droplet'), document.createTextNode(Math.round(data.current_humidity) + '% humidity')); facts.append(fact); }
    const updated = el('span'); updated.append(icon('clock'), document.createTextNode(when(device.lastUpdate))); facts.append(updated);
    main.append(top, row, facts); card.append(main);
    const controls = el('div', undefined, 'thermostat-controls'); const actions = el('div', undefined, 'control-row');
    if (typeof data.eco_mode === 'boolean') {
      const eco = button('', () => sendCommand(device, 'eco', !data.eco_mode, eco), 'eco-button');
      eco.append(icon('leaf'), document.createTextNode('Eco ' + (data.eco_mode ? 'on' : 'off'))); eco.setAttribute('aria-pressed', String(data.eco_mode));
      eco.setAttribute('aria-label', 'Turn Eco ' + (data.eco_mode ? 'off' : 'on') + ' for ' + (data.description || 'thermostat')); eco.disabled = !available; actions.append(eco);
    }
    if (data.has_fan) {
      const timer = el('div'); timer.append(el('div', 'HVAC fan' + (data.fan_state ? ' · running' : ''), 'control-caption')); const buttons = el('div', undefined, 'timer-buttons');
      for (const minutes of [15, 30, 60]) { const run = button(minutes + 'm', () => sendCommand(device, 'fan', minutes, run), ''); run.disabled = !available; run.setAttribute('aria-label', 'Run ' + (data.description || 'thermostat') + ' HVAC fan for ' + minutes + ' minutes'); buttons.append(run); }
      timer.append(buttons); actions.append(timer);
    }
    controls.append(actions);
    if (Array.isArray(data.linked_rcs_sensors)) {
      const nativeControl = data.native_sensor_control;
      const selectionAvailable = available && (!nativeControl || nativeControl.supported === true);
      const selection = el('div', undefined, 'source-control'); const label = el('label', 'Temperature controlled by'); const select = el('select');
      select.setAttribute('aria-label', 'Temperature controlled by for ' + (data.description || 'thermostat'));
      const builtin = el('option', 'Thermostat sensor'); builtin.value = ''; select.append(builtin);
      for (const id of data.linked_rcs_sensors) { const sensor = state.status.devices.find((entry) => entry.id === id); const option = el('option', sensor?.data?.description || 'Nest sensor'); option.value = id; select.append(option); }
      if (nativeControl && !nativeControl.supported) { const unknown = el('option', 'Current selection unavailable'); unknown.value = 'unavailable'; select.append(unknown); }
      select.value = nativeControl && !nativeControl.supported ? 'unavailable' : data.active_rcs_sensor || ''; select.disabled = !selectionAvailable; label.append(select);
      const apply = button('Apply', () => sendCommand(device, 'sensor', select.value, apply), 'button secondary'); apply.disabled = !selectionAvailable;
      apply.setAttribute('aria-label', 'Apply temperature source for ' + (data.description || 'thermostat')); selection.append(label, apply); controls.append(selection);
      controls.append(el('p', nativeControl && !nativeControl.supported ? nativeControl.reason || 'Review native sensor selection in the Nest app.' : 'Native Nest selection · its sensor schedule may replace this choice.', 'small-note'));
    }
    for (const setup of state.status.automation?.sensorSetups || []) {
      if (setup.thermostatId !== device.serial) continue;
      const section = el('div', undefined, 'preview-box');
      section.append(el('h4', 'Temperature group · ' + setup.name));
      renderSensorSetup(section, setup.id, setup);
      controls.append(section);
    }
    if (actions.childElementCount || controls.childElementCount > 1) card.append(controls);
    host.append(card);
  }
  const selected = $('runtime-device').value; $('runtime-device').replaceChildren();
  devices.forEach((device) => { const option = el('option', device.data.description || 'Thermostat'); option.value = device.serial; $('runtime-device').append(option); });
  if (devices.some((device) => device.serial === selected)) $('runtime-device').value = selected;
  $('heat-links').replaceChildren();
  for (const device of (state.status.devices || []).filter((entry) => entry.type === 'Heatlink')) {
    const card = el('article', undefined, 'panel'); card.append(el('h3', device.data.description || 'Heat Link'), el('p', 'Hot-water boost ' + (device.data.hot_water_boost_active ? 'active' : 'inactive')), el('span', 'Updated ' + when(device.lastUpdate), 'subtle')); $('heat-links').append(card);
  }
}
function renderRuntime() {
  const device = thermostats().find((entry) => entry.serial === $('runtime-device').value);
  const runtime = device?.runtime || []; $('runtime-summary').replaceChildren(); $('runtime-chart').replaceChildren(); $('runtime-table').replaceChildren();
  if (!runtime.length) { empty($('runtime-chart'), 'A little time tells a story.', 'Runtime appears as the plugin observes heating and cooling. Time while offline is not counted.', 'clock'); }
  else {
    for (const [key, label] of [['heating', 'Heating'], ['cooling', 'Cooling'], ['observed', 'Observed coverage']]) { const total = runtime.reduce((sum, day) => sum + (day[key] || 0), 0); const metric = el('div'); metric.append(el('strong', duration(total)), el('span', label)); $('runtime-summary').append(metric); }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 480 150'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Observed heating and cooling over the last seven UTC days. Exact values in the runtime table.');
    const maximum = Math.max(60, ...runtime.flatMap((day) => [day.heating || 0, day.cooling || 0]));
    const width = 460 / runtime.length;
    const add = (tag, attrs, text) => { const node = document.createElementNS(svg.namespaceURI, tag); Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value))); if (text) node.textContent = text; svg.append(node); };
    add('line', { x1: 8, y1: 119, x2: 475, y2: 119, class: 'chart-baseline' });
    runtime.forEach((day, index) => { const x = 10 + width * (index + .5); for (const [key, dx, color] of [['heating', -13, 'heat-fill'], ['cooling', 2, 'cool-fill']]) { const height = Math.max(0, Math.min(100, (day[key] || 0) / maximum * 95)); add('rect', { x: x + dx, y: 119 - height, width: 11, height, rx: 3, class: color }); } add('text', { x, y: 141, 'text-anchor': 'middle', class: 'chart-label' }, new Date(day.date + 'T12:00:00Z').toLocaleDateString([], { weekday: 'short', timeZone: 'UTC' })); });
    $('runtime-chart').append(svg);
    const table = el('table'); const caption = el('caption', 'Recorded runtime; incomplete coverage is not zero usage.'); const head = el('tr'); ['Date (UTC)', 'Heating', 'Cooling', 'Observed'].forEach((title) => head.append(el('th', title))); table.append(caption, head);
    runtime.forEach((day) => { const row = el('tr'); [day.date, duration(day.heating), duration(day.cooling), duration(day.observed)].forEach((value) => row.append(el('td', value))); table.append(row); }); $('runtime-table').append(table);
  }
  renderSchedule(device);
}
$('runtime-device').addEventListener('change', renderRuntime);
function renderSchedule(device) {
  const entries = []; for (const [day, points] of Object.entries(device?.data?.schedules || {})) for (const point of Object.values(points || {})) entries.push({ day: Number(day), ...point });
  entries.sort((a, b) => a.day - b.day || a.time - b.time);
  const zone = scheduleTimeZone(deviceOptions(device?.serial), device?.data); const next = nextSetpoint(entries, zone); const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const time = (point) => String(Math.floor(point.time / 3600)).padStart(2, '0') + ':' + String(Math.floor(point.time % 3600 / 60)).padStart(2, '0');
  $('schedule-next').textContent = next ? 'Next planned change · ' + days[next.day] + ' ' + time(next) + ' (' + zone + ')' : entries.length ? 'Choose this thermostat’s Nest schedule time zone in Settings to calculate the next change.' : 'No schedule has been reported for this thermostat’s current mode.';
  $('schedule-preview').replaceChildren();
  const chosen = next ? [next, ...entries.filter((entry) => entry.day !== next.day || entry.time !== next.time)].slice(0, 3) : entries.slice(0, 3);
  for (const point of chosen) { const row = el('div', undefined, 'schedule-row'); row.append(el('span', days[point.day] + ' · ' + time(point)), el('strong', formatTemp(point['temp-min']) + ' / ' + formatTemp(point['temp-max']))); $('schedule-preview').append(row); }
}
async function discoverSources(explicit = true) {
  if (state.discovering || !state.session?.authenticated) return;
  const session = state.session;
  state.discovering = true; $('refresh-sources').disabled = true; $('source-summary').textContent = 'Discovering configured Homebridge sources…';
  try { const external = await api('/sources'); if (state.session === session) { state.external = external; if (explicit) toast('Sources refreshed.'); } }
  catch (error) { if (state.session === session) { state.external.sources = (state.external.sources || []).map((entry) => ({ ...entry, available: false })); state.external.error = error.message; } }
  finally { state.discovering = false; $('refresh-sources').disabled = false; renderSources(); renderRulePickers(); renderRulePreview(); }
}
$('refresh-sources').addEventListener('click', () => discoverSources());
$('source-search').addEventListener('input', renderSources);
document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
  state.sourceFilter = button.dataset.filter; document.querySelectorAll('[data-filter]').forEach((item) => item.setAttribute('aria-pressed', String(item === button))); renderSources();
}));
function reading(source) {
  if (!source.available) return 'Unavailable';
  if (source.kind === 'temperature') return formatTemp(source.temperature);
  if (source.kind === 'fan') return source.running ? 'Running' + (source.speedAvailable ? ' · ' + source.speed + '%' : '') : 'Off';
  return source.detected ? 'Detected' : 'Clear';
}
function renderSources() {
  const all = sources(); const query = $('source-search').value.trim().toLowerCase();
  const filtered = all.filter((source) => (state.sourceFilter === 'all' || state.sourceFilter === source.kind || state.sourceFilter === 'presence' && ['occupancy', 'motion'].includes(source.kind)) && (!query || ((source.name || '') + ' ' + (source.bridgeName || '')).toLowerCase().includes(query)));
  $('source-summary').textContent = state.external.error || all.length + ' sources · ' + all.filter((source) => source.available).length + ' available. Readings refresh every 30 seconds while this dashboard is visible.';
  const host = $('source-list'); host.replaceChildren();
  if (!filtered.length) empty(host, query ? 'No matching sources.' : 'Connect more of your home.', query ? 'Try another name or source type.' : 'Use Discover sources to find accessible Homebridge room sensors and fans.', 'sensors');
  for (const source of filtered) {
    const card = el('article', undefined, 'panel source-card'); const top = el('div', undefined, 'card-top'); const mark = el('span', undefined, 'device-symbol'); mark.append(icon(source.kind === 'temperature' ? 'thermometer' : source.kind === 'fan' ? 'fan' : 'motion'));
    top.append(mark, pill(source.provider === 'nest' ? 'Nest' : 'Homebridge', 'neutral')); card.append(top, el('h3', source.name || 'Source'), el('span', (source.bridgeName || 'Unknown bridge') + ' · ' + (source.kind === 'occupancy' ? 'Occupancy' : source.kind), 'source-origin'), el('div', reading(source), 'source-reading' + (source.available ? '' : ' unavailable')));
    card.append(el('span', source.available ? 'Read ' + when(source.lastReadAt) + (source.kind === 'fan' ? source.canSetSpeed ? ' · Speed control' : source.canControl ? ' · On/off capable' : ' · Read only' : '') : 'Check the source bridge and connection.', 'subtle')); host.append(card);
  }
  $('bridge-list').replaceChildren();
  for (const bridge of state.external.bridges || []) { const row = el('div', undefined, 'bridge-row'); const title = el('div'); title.append(el('strong', bridge.name || 'Homebridge'), el('small', bridge.available ? bridge.kind + ' bridge' : bridge.error || 'Unavailable')); row.append(title, pill(bridge.available ? 'Available' : 'Unavailable', bridge.available ? 'good' : 'warn')); $('bridge-list').append(row); }
  if (!(state.external.bridges || []).length) $('bridge-list').append(el('p', 'No Homebridge sources have been discovered yet.', 'small-note'));
}

function inputField(host, title, value, change, { type = 'text', min, max, step, choices, description } = {}) {
  const label = el('label', title); const input = el(choices ? 'select' : 'input');
  input.setAttribute('aria-label', title);
  if (choices) choices.forEach(([value, title]) => { const option = el('option', title); option.value = value; input.append(option); });
  else { input.type = type; if (min !== undefined) input.min = min; if (max !== undefined) input.max = max; if (step !== undefined) input.step = step; if (type === 'text') input.maxLength = 80; }
  input.value = value ?? ''; input.addEventListener(choices ? 'change' : 'input', () => { if (type === 'number' && (input.value === '' || !input.checkValidity())) return; change(type === 'number' ? Number(input.value) : input.value); markDirty(); renderRulePreview(); });
  label.append(input); if (description) label.append(el('small', description, 'small-note')); host.append(label); return input;
}
function toggle(host, title, description, value, change) {
  const label = el('label', undefined, 'toggle-row'); const text = el('span'); text.append(el('strong', title), el('small', description));
  const input = el('input'); input.type = 'checkbox'; input.setAttribute('role', 'switch'); input.checked = value === true;
  input.addEventListener('change', () => { change(input.checked); markDirty(); renderRulePreview(); }); label.append(text, input); host.append(label);
}
let heatingRequest;
const timeZonePickers = new Map();
async function refreshHeating() {
  if (!state.session?.authenticated || !state.config || state.restarting) return;
  if (heatingRequest) return heatingRequest;
  const session = state.session;
  heatingRequest = (async () => {
    try { const data = await api('/heating-response'); if (state.session === session) state.heating = data; }
    catch (error) { if (state.session === session) state.heating = { error: error.message, rules: [] }; }
    finally { heatingRequest = null; if (state.session === session) renderHeatingRecommendations(); }
  })();
  return heatingRequest;
}
function formatDifference(value) {
  return Number.isFinite(value) ? displayTemperature(value, temperatureUnit(), true).toFixed(2).replace(/0$/, '') + '°' + temperatureUnit() : '—';
}
function renderHeatingSettings(group, device, options) {
  const section = el('section', undefined, 'heating-settings');
  section.append(el('h4', 'Heating response & tuning'), el('p', 'Choose your heating system, then review guidance for each temperature rule. Suggestions only change a rule when you apply them.', 'small-note'));
  inputField(section, 'Heating type', options.heatingType || 'unknown', (value) => { deviceOptions(device.serial, true).heatingType = value; },
    { choices: [['unknown', 'Choose heating type'], ['forcedAir', 'Forced air'], ['radiators', 'Radiators'], ['radiantFloor', 'In-floor radiant']] }).setAttribute('aria-label', 'Heating type');
  timeZonePickers.set(device.serial, mountTimeZonePicker(section, { value: options.scheduleTimeZone || '', data: device.data, changed: (value) => {
    deviceOptions(device.serial, true).scheduleTimeZone = value || null; markDirty(); renderRuntime();
  } }));
  toggle(section, 'Observe heating response locally', 'Collects while this dashboard is closed, including disabled rules. Keeps readings for up to 48 hours and cycle summaries for 30 days. Turning this off clears this thermostat’s response history.', options.heatingResponseEnabled,
    (value) => { deviceOptions(device.serial, true).heatingResponseEnabled = value; });
  section.append(el('p', 'Save these settings to start observation. Changing the selected sensors, desired room temperature or heating type starts a new observation period. Collection never changes rule settings.', 'small-note'));
  const recommendations = el('div', undefined, 'heating-recommendations'); recommendations.dataset.thermostat = device.serial;
  section.append(recommendations); group.append(section);
}
function renderHeatingRecommendations() {
  for (const host of document.querySelectorAll('.heating-recommendations')) {
    const entries = (state.heating?.rules || []).filter((rule) => rule.thermostatId === host.dataset.thermostat);
    const signature = JSON.stringify([entries, state.heating?.error, state.dirty, state.saving, temperatureUnit(), state.heating?.revision === state.envelope?.revision]);
    if (host.dataset.rendered === signature) continue;
    host.dataset.rendered = signature; host.replaceChildren();
    if (state.dirty) host.append(el('p', 'Save or discard your edits to review and apply recommendations for the saved setup.', 'callout'));
    if (state.heating?.error) host.append(el('p', state.heating.error, 'callout warning'));
    if (!state.dirty && state.heating?.revision && state.heating.revision !== state.envelope?.revision) host.append(el('p', 'Settings changed elsewhere. Reload the dashboard to review the saved setup before applying.', 'callout warning'));
    if (state.heating?.error && !entries.length) continue;
    if (!entries.length) host.append(el('p', state.heating ? 'Create and save a temperature rule for this thermostat to see its recommendations.' : 'Loading heating guidance…', 'small-note'));
    for (const entry of entries) {
      const card = el('article', undefined, 'heating-rule'); card.setAttribute('aria-label', entry.name + ' heating recommendations');
      card.append(el('h5', entry.name), el('p', 'Current rule: at least ' + entry.current.minimumIntervalMinutes + ' minutes between target changes · maximum adjustment ±' + formatDifference(entry.current.maximumOffset), 'small-note'));
      card.append(el('p', entry.reason, 'small-note'));
      const evidence = entry.evidence;
      card.append(el('p', evidence.cycles + ' usable cycles across ' + evidence.days + ' days · ' + entry.status, 'small-note'));
      if (evidence.cycles) {
        const table = el('dl', undefined, 'heating-evidence');
        for (const [label, value] of [
          ['Response delay', Math.round(evidence.responseDelayMinutes) + ' min'],
          ['Warming rate', formatDifference(evidence.warmingRateCPerHour) + '/hour'],
          ['Warming after shutoff', formatDifference(evidence.coastRiseC) + ' over ' + Math.round(evidence.coastMinutes) + ' min'],
          ['Nest minus room average', formatDifference(evidence.nestMinusRoomC)],
          ['Room overshoot', formatDifference(evidence.overshootC)],
        ]) { table.append(el('dt', label), el('dd', value)); }
        card.append(table);
      }
      for (const [stage, title] of [['starting', 'Starting recommendation'], ['learned', 'Learned recommendation']]) {
        const suggestion = entry[stage]; if (!suggestion) continue;
        const block = el('section', undefined, 'heating-suggestion'); block.setAttribute('aria-label', title);
        block.append(el('strong', title), pill(suggestion.confidence + ' confidence', stage === 'learned' ? 'good' : 'neutral'),
          el('p', 'Update interval: ' + suggestion.minimumIntervalMinutes + ' min · maximum adjustment: ±' + formatDifference(suggestion.maximumOffset)),
          el('p', suggestion.reason.replace('0.25°C', formatDifference(0.25)), 'small-note'));
        if (suggestion.limitReached) block.append(el('p', 'Observed response exceeds the supported 60-minute interval. This suggestion is capped; review comfort before applying.', 'callout warning'));
        const apply = button('Apply to this rule', () => applyHeatingRecommendation(entry, stage));
        apply.disabled = state.dirty || state.saving || state.heating.revision !== state.envelope.revision || Boolean(stage === 'learned' && state.heating.error);
        block.append(apply); card.append(block);
      }
      card.append(el('p', 'The interval limits changes to the Nest target, not how often the heating equipment cycles. Maximum adjustment bounds the target around this rule’s desired room temperature.', 'small-note'));
      host.append(card);
    }
  }
}
async function applyHeatingRecommendation(entry, stage) {
  if (state.dirty || state.saving) return;
  state.saving = true; renderHeatingRecommendations();
  try {
    const envelope = await api('/heating-response/apply', { method: 'POST', body: {
      id: entry.id, stage, recommendationId: entry[stage].id, revision: state.envelope.revision,
    } });
    state.envelope = envelope; state.config = structuredClone(envelope.config); renderAll();
    notice('Applied to ' + entry.name + '. Only its update interval and maximum adjustment were saved. Enabled rules use these values on their next check.');
    toast('Heating recommendation applied');
  } catch (error) {
    notice(error.status === 409 ? 'The saved setup or recommendation changed. Reload the dashboard and review it before applying.' : error.message, 'warning');
  } finally { state.saving = false; await refreshHeating(); renderHeatingRecommendations(); }
}
function renderSettings() {
  if (!state.config) return;
  $('temperature-unit').value = temperatureUnit();
  $('dashboard-name').value = state.config.name || 'Nest Climate Cntrl'; $('eve-history').checked = state.config.options?.eveHistory !== false;
  $('dashboard-url').textContent = state.envelope.web?.url || location.origin;
  $('device-settings').replaceChildren();
  timeZonePickers.clear();
  for (const device of thermostats()) {
    const options = deviceOptions(device.serial); const group = el('div', undefined, 'device-setting'); group.append(el('h3', device.data.description || 'Thermostat'));
    renderHeatingSettings(group, device, options);
    group.append(el('h4', 'Apple Home features · restart to apply'));
    toggle(group, 'Eco switch', 'A dedicated Eco control in Apple Home.', options.ecoSwitch ?? device.data.ecoSwitch, (value) => { deviceOptions(device.serial, true).ecoSwitch = value; });
    toggle(group, 'Separate humidity sensor', 'Show humidity as its own Apple Home sensor.', options.humiditySensor ?? device.data.humiditySensor, (value) => { deviceOptions(device.serial, true).humiditySensor = value; });
    if (device.data.has_fan) {
      toggle(group, 'HVAC fan preset switches', 'Optional 15, 30 and 60 minute switches. Off by default.', options.fanPresetSwitches ?? device.data.fanPresetSwitches, (value) => { deviceOptions(device.serial, true).fanPresetSwitches = value; });
      const durations = [['', 'Use Nest duration'], ...[15, 30, 45, 60, 120, 240, 480, 720, 1440, 4320, 7200, 10080].map((minutes) => [minutes + 'm', minutes + ' minutes'])];
      if (options.fanDuration && !durations.some(([value]) => value === options.fanDuration)) durations.push([options.fanDuration, 'Current setting (' + options.fanDuration + ')']);
      inputField(group, 'Default HVAC fan duration', options.fanDuration || '', (value) => { const options = deviceOptions(device.serial, true); if (value) options.fanDuration = value; else delete options.fanDuration; }, { choices: durations });
    }
    $('device-settings').append(group);
  }
  if (!thermostats().length) $('device-settings').append(el('p', 'Device options appear when your thermostats connect.', 'small-note'));
  renderAccounts();
  refreshHeating();
}
$('temperature-unit').addEventListener('change', () => { if (state.config) { state.config.temperatureUnit = $('temperature-unit').value; markDirty(); renderAll(); } });
$('dashboard-name').addEventListener('input', () => { if (state.config) { state.config.name = $('dashboard-name').value; markDirty(); } });
$('eve-history').addEventListener('change', () => { if (state.config) { (state.config.options ??= {}).eveHistory = $('eve-history').checked; markDirty(); } });
function renderAccounts() {
  $('account-list').replaceChildren();
  for (const [index, account] of (state.envelope?.accounts || []).entries()) {
    const live = state.status.accounts?.find((entry) => entry.name === account.name) || state.status.accounts?.[index];
    const row = el('div', undefined, 'account-row'); const label = el('div'); label.append(el('strong', account.name || 'Nest account'), el('small', account.authMethod === 'refreshToken' ? 'Existing legacy Google refresh token' : account.type === 'nest' ? 'Nest access token' : 'Google account'));
    const states = el('div', undefined, 'account-states'); states.append(pill(live?.authorised ? 'Authorized' : account.configured ? 'Authorization pending' : 'Setup needed', live?.authorised ? 'good' : 'warn'), pill(state.live && live?.observing ? 'Receiving updates' : 'No live updates', state.live && live?.observing ? 'good' : 'neutral'));
    row.append(label, states); $('account-list').append(row);
  }
  if (!(state.envelope?.accounts || []).length) $('account-list').append(el('p', 'Add your Nest or Google account in Homebridge to begin.', 'small-note'));
}
const accountActions = el('div', undefined, 'account-row'); const webUser = el('span', 'Your local web account');
accountActions.append(webUser, button('Sign out', signOut, 'button secondary'));
$('dashboard-url').closest('.panel').append(accountActions);

function rules(kind = state.ruleKind) { return state.config?.rules?.[ruleKey[kind]] || []; }
function selectedRule() { return rules().find((rule) => rule.id === state.ruleId); }
function newRule() {
  if (!state.config) return;
  const rule = { id: crypto.randomUUID(), kind: state.ruleKind, enabled: false, sourceIds: [],
    name: state.ruleKind === 'temperature' ? 'New temperature group' : state.ruleKind === 'presence' ? 'Home presence' : 'Room fan comfort' };
  if (state.ruleKind === 'temperature') { rule.aggregation = 'average'; rule.desiredTemperature = 21; if (thermostats()[0]) rule.thermostatId = thermostats()[0].serial; }
  else if (state.ruleKind === 'presence') { rule.logic = 'any'; rule.holdMinutes = 10; rule.awayDelayMinutes = 20; const home = sources().find((source) => source.provider === 'nest' && source.kind === 'occupancy'); if (home) rule.sourceIds = [home.id]; }
  else { rule.targetIds = []; rule.action = 'temperature'; rule.speedMode = 'last'; rule.priority = 0; rule.threshold = 24; rule.hysteresis = 1; if (thermostats()[0]) rule.thermostatId = thermostats()[0].serial; }
  ((state.config.rules ??= {})[ruleKey[state.ruleKind]] ??= []).push(rule); state.ruleId = rule.id; markDirty(); renderRules();
  $('rule-editor').querySelector('input')?.focus();
}
$('new-rule').addEventListener('click', newRule);
document.querySelectorAll('[data-kind]').forEach((tab) => {
  tab.addEventListener('click', () => { state.ruleKind = tab.dataset.kind; state.ruleId = null; renderRules(); });
  tab.addEventListener('keydown', (event) => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const tabs = [...document.querySelectorAll('[data-kind]')]; const index = tabs.indexOf(tab); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; tabs[next].click(); tabs[next].focus(); });
});
function renderRules() {
  if (!state.config) { empty($('rule-editor'), 'Configuration unavailable.', 'Refresh after the plugin has started.', 'rules'); return; }
  document.querySelectorAll('[data-kind]').forEach((tab) => { const active = tab.dataset.kind === state.ruleKind; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; });
  document.querySelectorAll('[data-count]').forEach((node) => { node.textContent = rules(node.dataset.count).length; });
  $('rule-list-title').textContent = { temperature: 'Temperature groups', presence: 'Presence rules', fan: 'Fan rules' }[state.ruleKind];
  const items = rules(); if (!items.some((rule) => rule.id === state.ruleId)) state.ruleId = items[0]?.id || null;
  $('rule-list').replaceChildren();
  for (const rule of items) { const item = button('', () => { state.ruleId = rule.id; renderRules(); }, 'rule-item'); item.append(el('strong', rule.name), el('small', (rule.sourceIds?.length || 0) + ' inputs · ' + (rule.enabled ? 'Enabled' : 'Disabled') + (rule.kind === 'fan' ? ' · Priority ' + (rule.priority ?? 0) : ''))); item.setAttribute('aria-pressed', String(rule.id === state.ruleId)); $('rule-list').append(item); }
  if (!items.length) {
    $('rule-list').append(el('p', 'No rules yet. Add one to get started.', 'small-note'));
    const details = { temperature: ['Comfort starts with the right room.', 'Select Nest and Homebridge temperature sensors to plan a room-based temperature group.', 'thermometer'], presence: ['Home is more than one signal.', 'Bring motion and occupancy sensors together to explore a Home/Away rule.', 'home'], fan: ['Put room fans in the picture.', 'Choose accessible Homebridge ceiling or room fans and plan when they would run.', 'fan'] }[state.ruleKind];
    empty($('rule-editor'), ...details, button('Create ' + (state.ruleKind === 'temperature' ? 'temperature group' : state.ruleKind === 'presence' ? 'presence rule' : 'fan rule'), newRule, 'button primary')); return;
  }
  renderRuleEditor();
}
function editorSection(host, number, title, description) {
  const section = el('section', undefined, 'editor-section'); const heading = el('h4'); heading.append(el('span', number, 'step-number'), document.createTextNode(title)); section.append(heading, el('p', description)); host.append(section); return section;
}
function thermostatSelect(host, rule) {
  const choices = [['', 'Select a thermostat'], ...thermostats().map((device) => [device.serial, device.data.description || 'Thermostat'])];
  if (rule.thermostatId && !choices.some(([id]) => id === rule.thermostatId)) choices.push([rule.thermostatId, 'Unavailable selected thermostat']);
  inputField(host, 'Thermostat', rule.thermostatId || '', (value) => { if (value) rule.thermostatId = value; else delete rule.thermostatId; }, { choices });
}
function picker(host, rule, key, kinds) {
  const search = el('input'); search.type = 'search'; search.placeholder = 'Find a room or source'; search.setAttribute('aria-label', key === 'targetIds' ? 'Find room fans' : 'Find rule inputs'); host.append(search);
  const list = el('div', undefined, 'source-picker'); host.append(list);
  const rows = new Map();
  const hint = el('div', undefined, 'empty-state compact'); const hintText = el('p'); hint.append(hintText, button('Discover sources', () => discoverSources(), 'button secondary'));
  const render = () => {
    const selected = rule[key] || []; const candidates = sources().filter((source) => kinds.includes(source.kind));
    for (const id of selected) if (!candidates.some((source) => matchesSource(source, id))) candidates.push({ id, name: 'Unavailable selected source', available: false, kind: kinds[0] });
    const query = search.value.trim().toLowerCase(); const matches = candidates.filter((source) => !query || ((source.name || '') + ' ' + (source.bridgeName || '')).toLowerCase().includes(query));
    const visible = new Set(matches.map((source) => source.id));
    for (const [id, row] of rows) if (!visible.has(id)) { row.label.remove(); rows.delete(id); }
    if (matches.length) hint.remove();
    for (const [index, source] of matches.entries()) {
      let row = rows.get(source.id);
      if (!row) {
        const label = el('label', undefined, 'pick-source'); const checkbox = el('input'); checkbox.type = 'checkbox';
        checkbox.addEventListener('change', () => { const next = new Set(rule[key] || []); for (const id of [row.source.id, ...(row.source.aliases || [])]) next.delete(id); if (checkbox.checked) next.add(row.source.id); rule[key] = [...next]; markDirty(); renderRulePreview(); });
        const text = el('div'); const name = el('strong'); const origin = el('small'); text.append(name, origin);
        const sample = el('span', undefined, 'pick-reading'); label.append(checkbox, text, sample);
        row = { label, checkbox, name, origin, sample }; rows.set(source.id, row);
      }
      row.source = source;
      row.checkbox.checked = selected.some((id) => matchesSource(source, id));
      row.name.textContent = source.name || 'Source'; row.origin.textContent = (source.bridgeName || 'Missing source') + ' · ' + source.kind + (source.kind === 'fan' ? source.canSetSpeed ? ' · Speed control' : ' · On/off only' : '');
      row.sample.textContent = reading(source);
      // Keep existing controls in place so polling preserves keyboard focus and edits.
      if (list.children[index] !== row.label) list.insertBefore(row.label, list.children[index] || null);
    }
    if (!matches.length) { hintText.textContent = query ? 'No matching sources.' : 'No sources found. Discover connected Homebridge bridges, then return to this rule.'; if (!hint.isConnected) list.append(hint); }
  };
  rulePickers.push({ list, render });
  search.addEventListener('input', render); render();
}
function renderRulePickers() {
  rulePickers = rulePickers.filter(({ list }) => list.isConnected);
  for (const { render } of rulePickers) render();
}
function renderRuleEditor() {
  const rule = selectedRule(); if (!rule) return;
  rulePickers = [];
  const host = $('rule-editor'); host.replaceChildren();
  const head = el('div', undefined, 'editor-header'); head.append(el('h3', { temperature: 'A temperature group', presence: 'A sense of home', fan: 'Air, when you want it' }[rule.kind]), el('span', rule.enabled ? 'Execution enabled' : 'Disabled draft', 'draft-chip')); host.append(head);
  inputField(host, 'Rule name', rule.name, (value) => { rule.name = value; const active = $('rule-list').querySelector('[aria-pressed="true"] strong'); if (active) active.textContent = value; });
  toggle(host, 'Enable automatic execution', rule.kind === 'presence' ? 'After saving, this rule publishes its combined Home/Away state as a separate Apple Home occupancy sensor. It does not change Google’s Home/Away or Eco settings.' : 'After saving, this rule can control the selected equipment. You can pause it below. Temperature and fan rules require Resume after a bridge restart.', rule.enabled, (value) => { rule.enabled = value; renderRules(); });
  if (rule.kind === 'temperature') {
    const target = editorSection(host, '01', 'Choose the room target', 'Choose the thermostat this rule will control and the temperature you want the selected rooms to reach.');
    const fields = el('div', undefined, 'form-grid'); thermostatSelect(fields, rule); temperatureField(fields, 'Desired room temperature', rule.desiredTemperature ?? 21, (value) => { rule.desiredTemperature = value; }, { min: rule.enabled ? 9 : 5, max: rule.enabled ? 32 : 35 }); target.append(fields);
    const inputs = editorSection(host, '02', 'Choose your temperature sources', 'Only selected readings count toward the room average. Include the controlled thermostat here if you want its temperature counted; you can also use only other room sensors. Automatic control requires Heat mode, Eco off and Nest’s built-in control sensor.');
    inputField(inputs, 'Combine readings', rule.aggregation || 'average', (value) => { rule.aggregation = value; }, { choices: [['average', 'Equal average of selected sensors'], ['single', 'One selected sensor']] }); picker(inputs, rule, 'sourceIds', ['temperature']);
    const limits = editorSection(host, '03', 'Limit thermostat adjustments', 'The desired room temperature stays separate from the target sent to Nest. Manual changes and Nest schedule boundaries pause the rule. If Homebridge stops or loses its connection, Nest may retain the last bounded target.');
    const tuningLink = el('a', 'Review heating response & tuning in Settings', 'small-note'); tuningLink.href = '#settings'; limits.append(tuningLink);
    temperatureField(limits, 'Maximum target adjustment', rule.maximumOffset ?? 1.5, (value) => { rule.maximumOffset = value; }, { min: 0, max: 3, difference: true });
    inputField(limits, 'Minimum update interval (minutes)', rule.minimumIntervalMinutes ?? 5, (value) => { rule.minimumIntervalMinutes = value; }, { type: 'number', min: 1, max: 60, step: 1 });
  } else if (rule.kind === 'presence') {
    const inputs = editorSection(host, '01', 'Listen for signs of home', 'Choose the motion and occupancy sources to include. Native Nest Home/Away appears when its state is available.'); picker(inputs, rule, 'sourceIds', ['motion', 'occupancy']);
    const behavior = editorSection(host, '02', 'Give arrivals and departures some time', 'Continuous occupancy remains positive while reported. A motion hold keeps a brief detection useful.');
    inputField(behavior, 'Consider home when', rule.logic || 'any', (value) => { rule.logic = value; }, { choices: [['any', 'Any selected source is positive'], ['all', 'All selected sources are positive']] });
    const fields = el('div', undefined, 'form-grid'); inputField(fields, 'Motion hold (minutes)', rule.holdMinutes ?? 10, (value) => { rule.holdMinutes = value; }, { type: 'number', min: 0, max: 1440, step: 1 }); inputField(fields, 'Delay before Away (minutes)', rule.awayDelayMinutes ?? 20, (value) => { rule.awayDelayMinutes = value; }, { type: 'number', min: 0, max: 1440, step: 1 }); behavior.append(fields);
  } else {
    Object.assign(rule, normalizeFanRule(rule));
    const outputs = editorSection(host, '01', 'Choose your room fans', 'Select Homebridge ceiling or room fans. A fan can belong to several rules; only its highest-priority matching rule controls it. Nest’s HVAC blower has separate controls on Overview.');
    picker(outputs, rule, 'targetIds', ['fan']);
    const trigger = editorSection(host, '02', 'Choose when the fans run', 'Temperature and active thermostat heating/cooling are run conditions. The speed choice below determines the airflow while this condition is met.');
    inputField(trigger, 'Run condition', rule.action, (value) => { rule.action = value; rule.threshold ??= 24; rule.hysteresis ??= 1; renderRuleEditor(); },
      { choices: [['temperature', 'Temperature above threshold'], ['heating', 'Thermostat is heating'], ['cooling', 'Thermostat is cooling']] });
    if (rule.action === 'temperature') {
      const fields = el('div', undefined, 'form-grid');
      temperatureField(fields, rule.thresholdInclusive ? 'At or above temperature' : 'Above temperature', rule.threshold ?? 24,
        (value) => { rule.threshold = value; }, { min: 5, max: 35 });
      temperatureField(fields, 'Turn-off gap', rule.hysteresis ?? 1, (value) => { rule.hysteresis = value; }, { min: 0, max: 10, difference: true });
      trigger.append(fields);
    } else {
      thermostatSelect(trigger, rule);
      trigger.append(el('p', rule.action === 'cooling' ? 'Use room fans to circulate cooled air while AC is actively cooling. This rule does not switch the AC on.' : 'Use room fans to circulate warm air while the thermostat is actively heating. Fan direction remains a manual setting.', 'small-note'));
    }
    const behavior = editorSection(host, '03', 'Choose how fast the fans run', 'These speed choices work with every run condition. Fixed and temperature-based speeds require a fan with readable, writable speed control.');
    inputField(behavior, 'Fan speed', rule.speedMode, (value) => {
      rule.speedMode = value;
      if (value === 'fixed') rule.fixedSpeed ??= 50;
      if (value === 'curve') {
        const fahrenheit = temperatureUnit() === 'F';
        rule.desiredTemperature ??= fahrenheit ? celsiusTemperature(72, 'F') : 22;
        rule.startGap ??= fahrenheit ? 2 / 1.8 : 1;
        rule.fullSpeedGap ??= fahrenheit ? 6 / 1.8 : 3;
        rule.minimumSpeed ??= 25; rule.maximumSpeed ??= 75;
      }
      renderRuleEditor();
    }, { choices: [['last', 'Use last setting (on/off only)'], ['fixed', 'Fixed speed'], ['curve', 'Temperature-based speed']] });
    if (rule.speedMode === 'last') {
      behavior.append(el('p', 'Only on/off commands are sent. The fan’s Homebridge plugin restores its last speed or uses its configured startup speed.', 'small-note'));
    } else if (rule.speedMode === 'fixed') {
      const input = inputField(behavior, 'Fixed fan speed (%)', rule.fixedSpeed, (value) => { rule.fixedSpeed = value; }, { type: 'number', min: 1, max: 100, step: 1 }); input.required = true;
      behavior.append(el('p', 'Uses the nearest supported speed at or below this setting. The preview shows the speed each selected fan can use.', 'small-note'));
    } else {
      const fields = el('div', undefined, 'form-grid');
      for (const [title, key, min, max, difference] of [
        ['Comfort target', 'desiredTemperature', 5, 35, false], ['Increase speed above target by', 'startGap', 0, 10, true],
        ['Reach maximum speed above target by', 'fullSpeedGap', .1, 20, true],
      ]) temperatureField(fields, title, rule[key], (value) => { rule[key] = value; }, { min, max, difference });
      for (const [title, key] of [['Minimum running speed (%)', 'minimumSpeed'], ['Maximum fan speed (%)', 'maximumSpeed']]) {
        const input = inputField(fields, title, rule[key], (value) => { rule[key] = value; }, { type: 'number', min: 1, max: 100, step: 1 }); input.required = true;
      }
      behavior.append(fields, el('p', 'The curve chooses speed only; the run condition decides on/off. While heating or cooling is active, a cooler room uses minimum speed. Airflow increases as the room gets warmer, up to your cap. The comfort target does not change a thermostat.', 'small-note'));
    }
    if (rule.action === 'temperature' || rule.speedMode === 'curve') {
      const inputs = editorSection(host, '04', 'Choose temperature sources', 'Selected readings are averaged equally. The same average drives the temperature run condition and speed curve when both are used.');
      picker(inputs, rule, 'sourceIds', ['temperature']);
    }
    if (rule.speedMode !== 'last') { const curve = el('div', undefined, 'preview-box'); curve.id = 'fan-curve'; behavior.append(curve); }
    const priority = editorSection(host, rule.action === 'temperature' || rule.speedMode === 'curve' ? '05' : '04', 'Set rule priority', 'Higher numbers win for each fan. Matching rules sharing a fan need different priorities. When a condition clears, the next matching rule can take over. A higher-priority rule with missing readings reserves the fan until readings return.');
    inputField(priority, 'Priority (higher wins)', rule.priority, (value) => { rule.priority = value; }, { type: 'number', min: 0, max: 100, step: 1 }).required = true;
    priority.append(el('p', 'Example: room too warm at priority 90 with a speed curve; active cooling at 60 with fixed speed; active heating at 30 with a quieter fixed speed. Manual fan changes suspend every rule for that fan until you Resume it.', 'small-note'));
    priority.append(el('p', 'When no rule calls for the fan, automation restores its original state within the last controlling speed limit. A handoff between matching rules keeps the fan running. Normal changes share a one-minute interval across rules.', 'small-note'));
  }
  const runtime = el('div', undefined, 'preview-box'); runtime.id = 'rule-runtime'; runtime.setAttribute('role', 'status'); host.append(runtime);
  const preview = el('div', undefined, 'preview-box'); preview.id = 'rule-preview'; preview.setAttribute('role', 'status'); host.append(preview);
  const footer = el('div', undefined, 'editor-footer'); footer.append(el('span', 'Save changes to apply this rule’s configuration.', 'small-note'), button('Delete rule', async () => {
    if (!await confirmAction('Delete this rule?', 'Save changes to confirm the deletion. This releases any equipment controlled by the rule and removes its combined presence sensor, if any.', 'Delete rule', 'Keep rule')) return;
    state.config.rules[ruleKey[state.ruleKind]] = rules().filter((entry) => entry.id !== rule.id); state.ruleId = null; markDirty(); renderRules();
    ($('rule-editor').querySelector('input') || $('new-rule')).focus();
  }, 'button danger')); host.append(footer); renderRulePreview();
}
async function ruleCommand(id, action) {
  if (state.dirty || state.saving || state.sensorSetupBusy) return;
  const current = state.status.automation?.rules?.find((entry) => entry.id === id);
  if (action === 'resume' && current?.sensorSetup?.canPrepare) {
    await sensorSetupAction(id, 'prepareSensors', current.sensorSetup);
    return;
  }
  try { state.status.automation = await api('/rules/command', { method: 'POST', body: { id, action, ...(['home', 'away'].includes(action) ? { minutes: 60 } : {}) } }); renderRulePreview(); }
  catch (error) { notice(error.message, 'danger'); }
}
async function sensorSetupAction(id, action, setup) {
  const restoring = action === 'restoreSensors';
  if (state.dirty || !state.live || state.sensorSetupBusy || !setup?.confirmation || !(restoring ? setup.canRestore : setup.canPrepare)) return;
  const name = setup.thermostatName || 'this thermostat';
  state.sensorSetupBusy = true;
  try {
    const confirmed = await confirmAction(
      restoring ? 'Restore Nest sensor control?' : 'Prepare Nest for this temperature group?',
      restoring
        ? 'Pause this group and restore the saved sensor selection and sensor schedule mode for ' + name + '. Any heating target still controlled by the group is restored first. Restoration proceeds only while Nest’s sensor settings still match the group’s setup.'
        : 'For ' + name + ', pause native sensor scheduling and select the built-in thermostat sensor. The saved sensor schedule is kept, and paired Nest room sensors remain available to this group. The group can start after Nest confirms the setup. Your temperature schedule, heating mode and Eco settings stay as configured. Use Restore Nest sensor settings when you want native sensor control again.',
      restoring ? 'Restore sensor settings' : 'Prepare thermostat',
      'Keep current settings',
      'primary',
    );
    if (!confirmed || state.dirty || !state.live) return;
    state.status.automation = await api('/rules/command', { method: 'POST', body: { id, action, confirmation: setup.confirmation } });
    toast(restoring ? 'Restoration requested · check execution status' : 'Sensor setup requested · waiting for Nest confirmation');
  } catch (error) { notice(error.message, 'danger'); }
  finally { state.sensorSetupBusy = false; renderRulePreview(); renderThermostats(); }
}
function renderSensorSetup(host, id, setup) {
  if (!setup) return;
  const section = el('div', undefined, 'sensor-setup');
  section.append(el('strong', 'Nest sensor setup'), el('p', setup.reason || 'Review the thermostat’s sensor control before using this group.'));
  const actions = el('div', undefined, 'timer-buttons');
  for (const [available, label, action] of [[setup.canPrepare, 'Prepare Nest for group', 'prepareSensors'], [setup.canRestore, 'Restore Nest sensor settings', 'restoreSensors']]) {
    if (!available) continue;
    const control = button(label, () => sensorSetupAction(id, action, setup));
    control.disabled = state.dirty || state.saving || state.sensorSetupBusy || !state.live;
    actions.append(control);
  }
  section.append(actions);
  if (actions.childElementCount && state.dirty) section.append(el('p', 'Save or discard edits before changing Nest sensor settings.', 'small-note'));
  host.append(section);
}
function renderRuleRuntime(rule) {
  const host = $('rule-runtime'); if (!host) return;
  const runtime = state.status.automation; const current = runtime?.rules?.find((entry) => entry.id === rule.id);
  host.replaceChildren(el('h4', 'Execution status'));
  if (!state.live || !runtime?.available) { host.append(el('p', 'Execution status unavailable. Refresh after the Nest bridge starts.')); return; }
  if (runtime.error) host.append(el('p', runtime.error));
  if (runtime.pendingRestorations) host.append(el('p', 'Some owned settings are waiting to be restored. Check equipment connectivity.'));
  host.append(el('strong', current?.phase || 'Not saved'), el('p', current?.reason || 'Save this rule to apply its settings.'));
  if (Number.isFinite(current?.nestTarget)) host.append(el('p', 'Nest target: ' + formatTemp(current.nestTarget) + ' · Room target: ' + formatTemp(current.desiredTemperature)));
  for (const fan of current?.fanSpeeds || []) host.append(el('p', fan.name + ': current ' + (Number.isFinite(fan.currentSpeed) ? fan.currentSpeed + '%' : 'unavailable') + ' · requested ' + (Number.isFinite(fan.proposedSpeed) ? fan.proposedSpeed + '%' : 'unsupported') + ' · cap ' + fan.maximumSpeed + '%'));
  for (const fan of current?.fanAssignments || []) host.append(el('p', fan.name + ': ' + (fan.override ? 'Manual override · ' + fan.override : fan.controller ? 'Controlling rule: ' + fan.controller + ' · priority ' + fan.priority : 'No matching rule')));
  if (current?.kind === 'presence') host.append(el('p', 'Combined presence: ' + (typeof current.home === 'boolean' ? current.home ? 'Home' : 'Away' : 'Unknown') + (current.fault ? ' · source attention required' : '')));
  if (Number.isFinite(current?.nextChangeAt) && current.nextChangeAt > Date.now()) host.append(el('p', 'Next timer: ' + new Date(current.nextChangeAt).toLocaleTimeString()));
  if (current?.lastAction) host.append(el('p', current.lastAction.message + ' ' + new Date(current.lastAction.at).toLocaleTimeString()));
  renderSensorSetup(host, rule.id, current?.sensorSetup);
  if (current?.enabled) {
    const actions = el('div', undefined, 'timer-buttons');
    for (const [label, action] of [[current.paused ? 'Resume automatic control' : 'Pause rule', current.paused ? 'resume' : 'pause'], ...(rule.kind === 'presence' ? [['Force Home · 1 hour', 'home'], ['Force Away · 1 hour', 'away'], ['Resume automatic presence', 'resume']] : [])]) {
      const item = button(label, () => ruleCommand(rule.id, action), 'button secondary'); item.disabled = state.dirty; actions.append(item);
    }
    if (current.fanOverrides?.length && !current.paused) { const resume = button('Resume overridden fans', () => ruleCommand(rule.id, 'resume')); resume.disabled = state.dirty; actions.append(resume); }
    host.append(actions); if (state.dirty) host.append(el('p', 'Save or discard your edits before using immediate rule controls.', 'small-note'));
  }
}
function renderFanCurve(rule) {
  const host = $('fan-curve'); if (!host || rule.speedMode === 'last') return;
  host.replaceChildren(el('h4', rule.speedMode === 'fixed' ? 'Supported fixed speeds' : 'Your speed curve'));
  const error = fanSpeedError(rule);
  if (error) { host.append(el('p', error)); return; }
  const targets = (rule.targetIds || []).map((id) => sources().find((source) => source.id === id));
  const limits = fanSpeedLimits(rule);
  const table = el('table'); table.append(el('caption', 'Airflow while the run condition is met'));
  const header = el('tr');
  for (const title of ['Room temperature', 'Requested speed', ...targets.map((source) => source?.name || 'Unavailable fan')]) { const cell = el('th', title); cell.scope = 'col'; header.append(cell); }
  const head = el('thead'); head.append(header); table.append(head);
  const body = el('tbody');
  const rows = rule.speedMode === 'fixed' ? [['While running', null, rule.fixedSpeed]] : [
    ['Minimum', rule.desiredTemperature + rule.startGap, rule.minimumSpeed],
    ['Halfway', rule.desiredTemperature + (rule.startGap + rule.fullSpeedGap) / 2, (rule.minimumSpeed + rule.maximumSpeed) / 2],
    ['Maximum', rule.desiredTemperature + rule.fullSpeedGap, rule.maximumSpeed],
  ];
  for (const [label, temperature, requested] of rows) {
    const row = el('tr'); row.append(el('td', (temperature === null ? '' : formatTemp(temperature) + ' · ') + label), el('td', requested + '%'));
    for (const source of targets) {
      const value = supportedSpeed(source, requested, limits.minimum, limits.maximum);
      row.append(el('td', value === null ? 'Unsupported' : value + '%'));
    }
    body.append(row);
  }
  table.append(body); const scroll = el('div', undefined, 'table-scroll'); scroll.append(table); host.append(scroll);
  if (rule.action === 'temperature') host.append(el('p', (rule.thresholdInclusive ? 'Run at or above ' : 'Run above ') + formatTemp(rule.threshold) + '; release at ' + formatTemp(rule.threshold - rule.hysteresis) + ' or below. The preview does not run hysteresis timers.', 'small-note'));
}
function renderRulePreview() {
  const host = $('rule-preview'); const rule = selectedRule(); if (!host || !rule) return;
  renderRuleRuntime(rule);
  renderFanCurve(rule);
  host.replaceChildren(el('h4', 'Current signals · preview only'));
  const all = sources(); const chosen = [...new Set((rule.sourceIds || []).map((id) => all.find((source) => matchesSource(source, id))))];
  const fresh = (source) => source?.available && Number.isFinite(source.lastReadAt) && Date.now() - source.lastReadAt <= 90000 && source.lastReadAt <= Date.now() + 1000;
  let headline = 'Choose your inputs'; let detail = 'Select sources above to preview their current readings.';
  if (rule.kind === 'temperature') {
    if (rule.aggregation === 'single' && chosen.length > 1) { headline = 'Choose one sensor'; detail = 'A single-source group needs one selected sensor. Choose equal average to combine rooms.'; }
    else {
      const thermostat = thermostats().find((device) => device.serial === rule.thermostatId);
      const preview = previewGroup({ sources: all, selected: rule.sourceIds, desired: rule.desiredTemperature ?? 21, thermostat });
      if (Number.isFinite(preview.roomTemperature)) { headline = formatTemp(preview.roomTemperature); detail = chosen.length + ' source' + (chosen.length === 1 ? '' : 's') + ' · desired ' + formatTemp(rule.desiredTemperature ?? 21) + '. ' + preview.reason; }
      else { headline = preview.state === 'empty' ? 'Choose your inputs' : 'Waiting for reliable readings'; detail = preview.reason; }
    }
  } else if (rule.kind === 'presence') {
    if (chosen.length && chosen.every(fresh)) { const positive = chosen.filter((source) => source.detected === true).length; const matches = rule.logic === 'all' ? positive === chosen.length : positive > 0; headline = matches ? 'Home condition met now' : 'No Home condition right now'; detail = positive + ' of ' + chosen.length + ' selected sources are positive. Motion holds and Away delays are saved settings; this snapshot does not run their timers.'; }
    else if (chosen.length) { headline = 'A source needs attention'; detail = 'Refresh sources. Missing or stale readings cannot establish an Away condition.'; }
  } else {
    const targets = (rule.targetIds || []).map((id) => all.find((source) => source.id === id));
    if (!targets.length) { headline = 'Choose your room fans'; detail = 'Select at least one fan exposed by Homebridge.'; }
    else if (targets.some((source) => !fresh(source) || !source.canControl)) { headline = 'A fan needs attention'; detail = 'A selected fan is unavailable or does not expose standard on/off control. No fan command is sent.'; }
    else {
      const error = fanSpeedError(rule);
      const average = chosen.length && chosen.every((source) => fresh(source) && Number.isFinite(source.temperature)) ? chosen.reduce((sum, source) => sum + source.temperature, 0) / chosen.length : null;
      const thermostat = thermostats().find((device) => device.serial === rule.thermostatId);
      const plan = fanRulePlan(rule, { temperature: average, hvacState: thermostat && usable(thermostat) ? thermostat.data.hvac_state : undefined });
      const limits = fanSpeedLimits(rule);
      if (error) { headline = 'Review fan speed settings'; detail = error; }
      else if (limits && targets.some((source) => !source.speedAvailable || supportedSpeed(source, plan.speed ?? limits.minimum, limits.minimum, limits.maximum) === null)) {
        headline = 'Speed control needs attention'; detail = 'Each selected fan needs readable speed control and a supported speed within the selected limits.';
      } else if (plan.demand === undefined) { headline = 'Waiting for reliable readings'; detail = 'Check the selected thermostat and temperature sources. An unknown higher-priority condition prevents a lower-priority rule from taking control.'; }
      else {
        headline = plan.demand ? 'Run condition met now' : 'Run condition not met';
        detail = (rule.action === 'temperature' ? 'Selected rooms average ' + formatTemp(average) + '; threshold ' + formatTemp(rule.threshold) : (thermostat.data.description || 'Thermostat') + ' reports ' + thermostat.data.hvac_state) + '. ';
        detail += !plan.demand ? 'This rule would release control; another matching rule may take over.' : rule.speedMode === 'last' ? 'Send on/off only, using the fan’s startup speed.' : targets.map((source) => (source.name || 'Fan') + ': ' + supportedSpeed(source, plan.speed, limits.minimum, limits.maximum) + '%').join(' · ');
        detail += ' Priority ' + (rule.priority ?? 0) + '. See Execution status for the controlling rule and live hysteresis state.';
      }
    }
  }
  host.append(el('strong', headline), el('p', detail), el('span', 'This preview sends no commands. Enabled rules execute separately; see Execution status. Sensor measurement age may be unknown.', 'preview-label'));
}
async function save() {
  if (!state.dirty || state.saving || !state.config || !state.envelope) return;
  const invalid = [...document.querySelectorAll('#page-settings input, #rule-editor input')].find((input) => !input.checkValidity());
  if (invalid) { invalid.reportValidity(); return; }
  const curveError = (state.config.rules.fans || []).filter((rule) => rule.enabled).map((rule) => fanSpeedError(normalizeFanRule(rule))).find(Boolean);
  if (curveError) { notice(curveError, 'danger'); return; }
  const sensorSetupCandidates = (state.config.rules.temperature || []).filter((rule) => {
    const previous = (state.envelope.config.rules.temperature || []).find((entry) => entry.id === rule.id);
    return rule.enabled && (!previous?.enabled || previous.thermostatId !== rule.thermostatId ||
      JSON.stringify([...(previous.sourceIds || [])].sort()) !== JSON.stringify([...(rule.sourceIds || [])].sort()));
  }).map((rule) => rule.id);
  state.saving = true; $('save').disabled = true; $('discard').disabled = true; renderRestart();
  try {
    const envelope = await api('/config', { method: 'PUT', body: { revision: state.envelope.revision, config: state.config } });
    state.envelope = envelope; state.config = structuredClone(envelope.config); state.dirty = false; $('save-bar').hidden = true;
    state.restartMessage = '';
    notice(envelope.restartRequired ? 'Saved. Restart the child bridge to apply accessory settings.' : 'Saved. Check execution status for running rules and any required setup. Disabled rules remain drafts.');
    renderAll(); toast(envelope.restartRequired ? 'Setup saved · child-bridge restart required' : 'Rules saved');
    try {
      state.status = await api('/status'); state.live = true; renderLive();
      for (const id of sensorSetupCandidates) {
        const setup = state.status.automation?.rules?.find((entry) => entry.id === id)?.sensorSetup;
        if (setup?.canPrepare) await sensorSetupAction(id, 'prepareSensors', setup);
      }
    } catch { /* The configuration was saved; live status can be refreshed separately. */ }
  } catch (error) {
    notice(error.status === 409 ? 'The configuration changed elsewhere. Your edits are still here, but nothing was saved. Discard to load the latest setup, then reapply your changes.' : error.message, error.status === 409 ? 'warning' : 'danger');
    $('save-title').textContent = error.status === 409 ? 'Newer configuration found' : 'Changes not saved';
  } finally { state.saving = false; $('save').disabled = !state.dirty; $('discard').disabled = false; renderRestart(); renderRulePreview(); renderThermostats(); }
}
$('save').addEventListener('click', save);
$('discard').addEventListener('click', async () => {
  if (!state.dirty || state.saving || !await confirmAction('Discard unsaved changes?', 'Your edits will be removed and the latest saved setup will be loaded.', 'Discard changes')) return;
  $('discard').disabled = true; $('save').disabled = true;
  try { const envelope = await api('/config'); state.envelope = envelope; state.config = structuredClone(envelope.config); state.dirty = false; $('save-bar').hidden = true; notice(); renderAll(); $('page-title').focus(); }
  catch (error) { notice(error.message, 'danger'); }
  finally { $('discard').disabled = false; $('save').disabled = !state.dirty; }
});
function renderLive() { renderConnection(); renderThermostats(); renderRuntime(); renderSources(); renderAccounts(); renderRulePickers(); renderRulePreview(); for (const device of thermostats()) timeZonePickers.get(device.serial)?.update(device.data); }
function renderRestart() {
  const restart = state.envelope?.restart;
  $('restart-notice').hidden = !state.envelope?.restartRequired && !state.restarting && !state.restartMessage;
  $('restart-title').textContent = state.restarting ? 'Restarting child bridge…' : 'Restart required';
  $('restart-detail').textContent = state.restartMessage || (state.dirty ? 'Save or discard your edits before restarting.' :
    restart?.available ? 'Restart this Nest child bridge to apply saved settings. The dashboard will briefly disconnect. Sign in again afterward, then Resume temperature and fan rules.' :
      restart?.message || 'Restart this child bridge from Homebridge to apply saved settings, then Resume temperature and fan rules.');
  $('restart-child').hidden = !restart?.available;
  $('restart-child').disabled = state.restarting || state.dirty || state.saving || ['prepared', 'requested'].includes(restart?.phase);
  for (const section of document.querySelectorAll('[data-section]')) section.inert = state.restarting;
  $('sign-out').disabled = state.restarting;
}
async function restartChildBridge() {
  if (state.restarting || state.dirty || state.saving || !state.envelope?.restart?.available) return;
  const before = state.envelope.web.instanceId;
  state.restarting = true; state.restartMessage = 'Requesting a restart of this Nest child bridge. Waiting for the dashboard to reconnect…'; renderRestart();
  try {
    await api('/bridge/restart', { method: 'POST', body: { revision: state.envelope.revision } });
    state.envelope.restart.phase = 'requested';
  } catch (error) {
    // A bridge can stop before the HTTP reply arrives. Check for a new instance; never resend automatically.
    if (error.status) { state.restarting = false; state.restartMessage = error.message; renderRestart(); return; }
  }
  for (let attempt = 0; attempt < 45 && state.restarting; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
      const session = await api('/session', { anonymous: true, timeout: 3000 });
      if (session.instanceId && session.instanceId !== before) {
        state.restarting = false; state.restartMessage = ''; state.envelope = null; state.config = null; state.live = false; state.heating = null;
        state.session = session; renderRestart();
        if (session.authenticated) { await enterDashboard(); notice('Child bridge restarted. Review your equipment, then Resume temperature and fan rules.'); }
        else showLogin('Child bridge restarted. Sign in again, then Resume your temperature and fan rules.', session.setupRequired);
        return;
      }
      if (session.authenticated) {
        const result = await api('/bridge/restart', { anonymous: true, timeout: 3000 });
        if (result.phase === 'failed') {
          state.restarting = false; state.envelope.restart.phase = 'failed'; state.restartMessage = result.message; renderRestart(); return;
        }
      }
    } catch { /* Temporary connection failures are expected while the bridge restarts. */ }
  }
  state.restarting = false;
  state.restartMessage = 'Restart could not be confirmed. Reload this dashboard or check the child bridge in Homebridge. The request will not be repeated automatically.';
  renderRestart();
}
$('restart-child').addEventListener('click', restartChildBridge);
function renderAll() { renderLive(); renderSettings(); renderRules(); renderRestart(); }
checkSession();


