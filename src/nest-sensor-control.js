import crypto from 'node:crypto';

const MODES = {
  RCS_CONTROL_MODE_HOLD: 'hold',
  RCS_CONTROL_MODE_SCHEDULE: 'schedule',
  RCS_CONTROL_MODE_SCHEDULE_OVERRIDE: 'schedule_override',
};
const BACKPLATE = { rcsSourceType: 'RCS_SOURCE_TYPE_BACKPLATE' };
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = (value) => {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (object(value)) {
    return Object.fromEntries(
      Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
};
const signature = (value) => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

function validSelection(selection, settings) {
  if (!object(selection) || Object.keys(selection).some((key) => !['rcsSourceType', 'activeRcsSensor'].includes(key))) {
    return false;
  }
  if (selection.rcsSourceType === 'RCS_SOURCE_TYPE_BACKPLATE') {
    return selection.activeRcsSensor === undefined;
  }
  return (
    selection.rcsSourceType === 'RCS_SOURCE_TYPE_SINGLE_SENSOR' &&
    object(selection.activeRcsSensor) && Object.keys(selection.activeRcsSensor).length === 1 &&
    typeof selection.activeRcsSensor.resourceId === 'string' && selection.activeRcsSensor.resourceId.length > 0 &&
    settings.associatedRcsSensors.some((sensor) => sensor.deviceId.resourceId === selection.activeRcsSensor.resourceId)
  );
}

export function sensorControlState(settings) {
  const result = {
    reported: object(settings),
    supported: false,
    reason: 'Nest sensor control is unavailable. ' +
      'Mixed temperature groups cannot control heating until Nest reports a supported hold using its built-in sensor.',
    mode: 'unknown', source: 'unknown', sensorId: null, signature: '', holdSignature: null, control: null,
  };
  if (!object(settings)) {
    return result;
  }
  // Sign the entire reported trait so restoring control never overwrites a changed sensor schedule or association.
  result.signature = signature(settings);
  result.mode = Object.hasOwn(MODES, settings.rcsControlMode) ? MODES[settings.rcsControlMode] : 'unknown';
  const multi = settings.multiSensorSettings;
  if (
    settings.sensorSelection !== undefined ||
    (multi !== undefined && (
      !object(multi) || multi.multiSensorEnabled !== false ||
      (multi.multiSensorGroup !== undefined && (!Array.isArray(multi.multiSensorGroup) || multi.multiSensorGroup.length > 0))
    ))
  ) {
    result.reason = 'Automatic setup is unavailable for this Nest multi-sensor format. ' +
      'Mixed temperature groups cannot control heating until Nest reports a supported hold using its built-in sensor.';
    return result;
  }
  if (
    result.mode === 'unknown' || !Array.isArray(settings.associatedRcsSensors) ||
    settings.associatedRcsSensors.some((sensor) =>
      !object(sensor?.deviceId) || typeof sensor.deviceId.resourceId !== 'string' || !sensor.deviceId.resourceId,
    ) ||
    !validSelection(settings.activeRcsSelection, settings)
  ) {
    return result;
  }
  result.supported = true;
  result.reason = null;
  result.source = settings.activeRcsSelection.rcsSourceType === 'RCS_SOURCE_TYPE_BACKPLATE' ? 'thermostat' : 'remote';
  result.sensorId = settings.activeRcsSelection.activeRcsSensor?.resourceId ?? null;
  result.control = { mode: settings.rcsControlMode, selection: structuredClone(settings.activeRcsSelection) };
  result.holdSignature = signature({ ...settings, rcsControlMode: 'RCS_CONTROL_MODE_HOLD', activeRcsSelection: BACKPLATE });
  return result;
}

export function sensorControlUpdate(settings, command) {
  const state = sensorControlState(settings);
  if (!state.supported) {
    throw new Error(state.reason);
  }
  if (
    !object(command) || Object.keys(command).some((key) => !['action', 'expected', 'control'].includes(key)) ||
    !['hold', 'restore'].includes(command.action) || typeof command.expected !== 'string' ||
    command.expected !== state.signature
  ) {
    throw new Error('Nest sensor settings changed. Refresh before changing sensor control.');
  }
  const value = structuredClone(settings);
  if (command.action === 'hold') {
    if (command.control !== undefined) {
      throw new Error('A sensor hold cannot include replacement settings.');
    }
    value.rcsControlMode = 'RCS_CONTROL_MODE_HOLD';
    value.activeRcsSelection = { ...BACKPLATE };
  } else {
    const control = command.control;
    if (
      state.mode !== 'hold' || state.source !== 'thermostat' || !object(control) ||
      Object.keys(control).some((key) => !['mode', 'selection'].includes(key)) || !Object.hasOwn(MODES, control.mode) ||
      !validSelection(control.selection, settings)
    ) {
      throw new Error('Saved Nest sensor control cannot be restored to these settings.');
    }
    value.rcsControlMode = control.mode;
    value.activeRcsSelection = structuredClone(control.selection);
  }
  return value;
}
