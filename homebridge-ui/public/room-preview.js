import { displayTemperature, celsiusTemperature } from './climate-utils.js';
import { sensorSources, previewGroup } from './sensor-preview.js';

export function mountRoomPreview({ host, homebridge, getStatus, getConfig, changed }) {
  const unit = () => getConfig()?.dashboardTemperatureUnit === 'F' ? 'F' : 'C';
  const format = (value) => displayTemperature(value, unit()).toFixed(1) + ' °' + unit();
  let external = { sources: [], bridges: [] };
  let selectedThermostat = '';
  let loading = false;
  const node = (tag, text) => {
    const item = document.createElement(tag);
    if (text) {
      item.textContent = text;
    }
    return item;
  };
  const heading = node('h2', 'Room sensors & fans');
  const help = node('p', 'Read-only preview: combine Nest and other Homebridge temperature sensors. No heating or fan commands are sent.');
  const discover = node('button', 'Discover / refresh Homebridge sources');
  discover.type = 'button';
  const bridgeStatus = node('p');
  bridgeStatus.setAttribute('role', 'status');
  const thermostatLabel = node('label', 'Preview thermostat');
  const thermostatSelect = node('select');
  thermostatSelect.disabled = true;
  thermostatLabel.append(thermostatSelect);
  const targetLabel = node('label', 'Desired room temperature (°C)');
  const target = node('input');
  target.type = 'number';
  target.min = '5';
  target.max = '35';
  target.step = 'any';
  target.required = true;
  target.disabled = true;
  targetLabel.append(target);
  const list = node('div');
  const result = node('p');
  result.setAttribute('role', 'status');
  const fans = node('div');
  host.append(
    heading,
    help,
    node(
      'p',
      'Homebridge accessory control (-I) must be enabled. Only configured main/child bridges are read; Apple Home-only devices are not accessible. Bridge PINs stay on the server.',
    ),
    discover,
    bridgeStatus,
    thermostatLabel,
    targetLabel,
    list,
    result,
    fans,
  );
  function options(create = false) {
    const config = getConfig();
    let device = config?.devices?.find((entry) => entry.serialNumber === selectedThermostat);
    if (!device && create && selectedThermostat && config) {
      device = { serialNumber: selectedThermostat };
      config.devices.push(device);
    }
    const saved = device?.sensorPreview;
    const normalized = {
      selected: Array.isArray(saved?.selected) ? [...new Set(saved.selected.filter((id) => typeof id === 'string' && id !== ''))] : [],
      desired: Number.isFinite(saved?.desired) && saved.desired >= 5 && saved.desired <= 35 ? saved.desired : 21,
    };
    if (create && device) {
      device.sensorPreview = normalized;
    }
    return normalized;
  }
  function calculate() {
    const snapshot = getStatus();
    const thermostat = snapshot?.devices?.find((device) => device.serial === selectedThermostat);
    const preview = previewGroup({
      sources: sensorSources(snapshot, external),
      selected: options().selected,
      desired: options().desired,
      thermostat,
    });
    const parts = [preview.reason];
    if (Number.isFinite(preview.roomTemperature)) {
      parts.unshift('Selected rooms: ' + format(preview.roomTemperature) + '.');
    }
    if (Number.isFinite(preview.proposedTarget)) {
      parts.unshift('Illustrative Nest target: ' + format(preview.proposedTarget) + '.');
    }
    if (preview.count) {
      parts.push('Sensor measurement age is unknown. Read time is not a physical measurement timestamp.');
    }
    result.textContent = parts.join(' ');
  }
  function render() {
    if (!getConfig()) {
      return;
    }
    const snapshot = getStatus();
    const devices = snapshot?.devices?.filter((device) => device.type === 'Thermostat') ?? [];
    thermostatSelect.replaceChildren();
    for (const device of devices) {
      const option = node('option', device.data.description || device.serial);
      option.value = device.serial;
      thermostatSelect.append(option);
    }
    if (!devices.some((device) => device.serial === selectedThermostat)) {
      selectedThermostat = devices[0]?.serial ?? '';
    }
    thermostatSelect.value = selectedThermostat;
    targetLabel.firstChild.textContent = 'Desired room temperature (°' + unit() + ')';
    target.min = displayTemperature(5, unit());
    target.max = displayTemperature(35, unit());
    target.value = Number(displayTemperature(options().desired, unit()).toFixed(6));
    target.disabled = !selectedThermostat;
    thermostatSelect.disabled = !selectedThermostat;
    list.replaceChildren();
    const selected = Array.isArray(options().selected) ? options().selected : [];
    const sources = sensorSources(snapshot, external);
    for (const id of selected) {
      if (!sources.some((source) => source.id === id)) {
        sources.push({ id, name: 'Unavailable selected sensor', available: false });
      }
    }
    for (const source of sources) {
      const label = node('label');
      label.className = 'check';
      const input = node('input');
      input.type = 'checkbox';
      input.checked = selected.includes(source.id);
      input.disabled = !selectedThermostat;
      input.onchange = () => {
        const selection = new Set(options(true).selected);
        if (input.checked) {
          selection.add(source.id);
        } else {
          selection.delete(source.id);
        }
        options(true).selected = [...selection];
        changed();
        calculate();
      };
      label.append(
        input,
        document.createTextNode(
          source.name +
            ' · ' +
            (source.bridgeName || 'Missing source') +
            ' · ' +
            (source.available && Number.isFinite(source.temperature) ? format(source.temperature) : 'Unavailable'),
        ),
      );
      list.append(label);
    }
    fans.replaceChildren(node('h3', 'Discovered room fans'));
    const nativeSerials = new Set((snapshot?.devices ?? []).map((device) => String(device.serial).toUpperCase()));
    const candidates = external.sources.filter(
      (source) =>
        source.kind === 'fan' && !nativeSerials.has(String(source.serial).toUpperCase()) && !/nest|google/i.test(source.manufacturer ?? ''),
    );
    if (!candidates.length) {
      fans.append(node('p', 'No accessible fans discovered.'));
    }
    for (const fan of candidates) {
      fans.append(
        node(
          'p',
          fan.name +
            ' · ' +
            fan.bridgeName +
            ' · ' +
            (fan.available ? (fan.running ? 'Running' : 'Off') : 'Unavailable') +
            (fan.canControl ? ' · On/off capable' : ' · Read only'),
        ),
      );
    }
    fans.append(node('small', 'Enable automatic room-fan control in Climate rules in the standalone dashboard.'));
    fans.append(node('h3', 'Discovered presence sensors'));
    for (const source of external.sources.filter((entry) => ['motion', 'occupancy'].includes(entry.kind))) {
      fans.append(
        node(
          'p',
          source.name +
            ' · ' +
            source.bridgeName +
            ' · ' +
            source.kind +
            ' · ' +
            (source.available ? (source.detected ? 'Detected' : 'Clear') : 'Unavailable'),
        ),
      );
    }
    fans.append(node('small', 'Configure combined Home/Away sensing in Climate rules in the standalone dashboard.'));
    calculate();
  }
  thermostatSelect.onchange = () => {
    selectedThermostat = thermostatSelect.value;
    render();
  };
  target.onchange = () => {
    if (!target.checkValidity() || target.value === '') {
      calculate();
      return;
    }
    options(true).desired = celsiusTemperature(Number(target.value), unit());
    changed();
    calculate();
  };
  discover.onclick = async () => {
    if (loading) {
      return;
    }
    loading = true;
    discover.disabled = true;
    bridgeStatus.textContent = 'Discovering configured bridges…';
    try {
      external = await homebridge.request('/sources');
      bridgeStatus.textContent =
        external.bridges.map((bridge) => bridge.name + ': ' + (bridge.available ? 'Available' : bridge.error)).join(' · ') ||
        'No configured bridges with usable credentials found.';
    } catch {
      external.sources = external.sources.map((source) => ({ ...source, available: false }));
      bridgeStatus.textContent = 'Discovery unavailable. Check Homebridge accessory control and bridge configuration.';
    } finally {
      loading = false;
      discover.disabled = false;
      render();
    }
  };
  return { render };
}
