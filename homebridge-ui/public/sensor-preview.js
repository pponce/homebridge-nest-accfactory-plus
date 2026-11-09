// Pure read-only planning model. Nothing in this module sends thermostat or fan commands.
export function presenceSources(snapshot, external) {
  const remaining = (external?.sources ?? []).filter((source) =>
    source.kind === 'occupancy' && !String(source.serial ?? '').toUpperCase().startsWith('CLIMATE-PRESENCE-'));
  const native = (snapshot?.devices ?? []).filter((device) => device.type === 'HomeAway').map((device) => {
    const account = snapshot.accounts?.find((entry) => entry.id === device.account);
    const copies = remaining.filter((source) => source.serial && device.serial &&
      String(source.serial).toUpperCase() === String(device.serial).toUpperCase());
    return {
      id: 'nest:' + device.id, aliases: copies.map((source) => source.id),
      name: device.data.description || 'Nest Home/Away', kind: 'occupancy', provider: 'nest', bridgeName: 'Nest',
      detected: device.data.occupancy, lastReadAt: snapshot.generatedAt, measuredAt: null,
      available: Boolean(account?.authorised && account?.observing && !device.needsUpdate &&
        device.data.online !== false && typeof device.data.occupancy === 'boolean'),
    };
  });
  const duplicates = new Set(native.flatMap((source) => source.aliases));
  return [...native, ...remaining.filter((source) => !duplicates.has(source.id))];
}

export function sensorSources(snapshot, external) {
  const devices = snapshot?.devices ?? [];
  const serials = new Set(devices.map((device) => String(device.serial).toUpperCase()));
  const native = devices
    .filter((device) => ['Thermostat', 'TemperatureSensor'].includes(device.type))
    .map((device) => {
      const account = snapshot.accounts?.find((entry) => entry.id === device.account);
      const temperature = device.type === 'Thermostat' ? device.data.physical_temperature : device.data.current_temperature;
      return {
        id: 'nest:' + device.id,
        provider: 'nest',
        kind: 'temperature',
        name: device.data.description || device.serial,
        bridgeName: 'Nest',
        temperature,
        lastReadAt: snapshot.generatedAt ?? device.lastUpdate,
        measuredAt: null,
        available:
          account?.authorised === true &&
          account?.observing === true &&
          !device.needsUpdate &&
          device.data.online === true &&
          Number.isFinite(temperature),
      };
    });
  return [
    ...native,
    ...(external?.sources ?? []).filter(
      (source) =>
        source.kind === 'temperature' &&
        !serials.has(String(source.serial).toUpperCase()) &&
        !/nest|google|climate cntrl/i.test(source.manufacturer ?? ''),
    ),
  ];
}

export function previewGroup({ sources, selected, desired, thermostat, now = Date.now(), maximumOffset = 1.5 }) {
  const ids = [...new Set(selected ?? [])];
  if (!ids.length) {
    return { state: 'empty', reason: 'Select one or more room sensors.' };
  }
  if (
    !Number.isFinite(desired) ||
    desired < 5 ||
    desired > 35 ||
    !Number.isFinite(maximumOffset) ||
    maximumOffset < 0 ||
    maximumOffset > 3
  ) {
    return { state: 'unavailable', reason: 'Enter a target from 5 to 35 °C (41–95 °F).' };
  }
  const chosen = ids.map((id) => sources.find((source) => source.id === id));
  if (
    chosen.some(
      (source) =>
        !source?.available ||
        !Number.isFinite(source.temperature) ||
        source.temperature < -100 ||
        source.temperature > 100 ||
        !Number.isFinite(source.lastReadAt) ||
        now - source.lastReadAt > 90000 ||
        source.lastReadAt > now + 1000,
    )
  ) {
    return { state: 'unavailable', reason: 'A selected source is unavailable or has not been read recently. Refresh the preview.' };
  }
  const roomTemperature = chosen.reduce((sum, source) => sum + source.temperature, 0) / chosen.length;
  const info = { roomTemperature, count: chosen.length, measurementAgeKnown: chosen.every((source) => Number.isFinite(source.measuredAt)) };
  const control = thermostat?.data?.native_sensor_control;
  if (thermostat?.data?.active_rcs_sensor !== '' ||
      (control && control.reported !== false && (!control.supported || control.source !== 'thermostat')) ||
      !Number.isFinite(thermostat.data.physical_temperature)) {
    return { ...info, state: 'paused', reason: 'Preview requires a confirmed built-in Nest temperature source.' };
  }
  const native = sources.find((source) => source.id === 'nest:' + thermostat.id);
  if (
    !native?.available ||
    !Number.isFinite(native.lastReadAt) ||
    now - native.lastReadAt > 90000 ||
    native.lastReadAt > now + 1000 ||
    thermostat.data.hvac_mode !== 'heat' ||
    thermostat.data.eco_mode !== false
  ) {
    return { ...info, state: 'paused', reason: 'Preview requires an available thermostat in Heat mode with Eco off.' };
  }
  const offset = Math.max(-maximumOffset, Math.min(maximumOffset, thermostat.data.physical_temperature - roomTemperature));
  return {
    ...info,
    state: 'preview',
    desired,
    offset,
    proposedTarget: Math.max(5, Math.min(35, desired + offset)),
    reason: 'Read-only estimate. No thermostat changes are sent; device limits and control behavior still require validation.',
  };
}

