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

function selectionSource(selection) {
  if (!object(selection) || Object.keys(selection).some((key) => !['rcsSourceType', 'activeRcsSensor'].includes(key))) {
    return 'unknown';
  }
  if (selection.rcsSourceType === 'RCS_SOURCE_TYPE_BACKPLATE') {
    return selection.activeRcsSensor === undefined ? 'thermostat' : 'unknown';
  }
  return (
    selection.rcsSourceType === 'RCS_SOURCE_TYPE_SINGLE_SENSOR' &&
    object(selection.activeRcsSensor) && Object.keys(selection.activeRcsSensor).length === 1 &&
    typeof selection.activeRcsSensor.resourceId === 'string' && selection.activeRcsSensor.resourceId.length > 0
  ) ? 'remote' : 'unknown';
}

function validSelection(selection, settings) {
  const source = selectionSource(selection);
  return source === 'thermostat' || (source === 'remote' &&
    settings.associatedRcsSensors.some((sensor) => sensor.deviceId.resourceId === selection.activeRcsSensor.resourceId));
}

export function sensorControlState(settings) {
  const result = {
    reported: object(settings),
    supported: false,
    builtInConfirmed: false,
    reason: null,
    mode: 'unknown', source: 'unknown', sensorId: null, signature: '', holdSignature: null, control: null,
    // Selection is display feedback; heating and sensor-setting writes have separate validation.
    selection: { source: 'unknown', sensorId: null },
    diagnostics: {
      settingsReported: object(settings), modeReported: settings?.rcsControlMode !== undefined,
      selectionReported: settings?.activeRcsSelection !== undefined,
      associationsReported: settings?.associatedRcsSensors !== undefined,
      associatedSensorCount: Array.isArray(settings?.associatedRcsSensors) ? settings.associatedRcsSensors.length : null,
      multiSensorSettingsReported: settings?.multiSensorSettings !== undefined,
      sensorSelectionReported: settings?.sensorSelection !== undefined,
      issues: [],
    },
  };
  const issue = (code, message) => {
    result.diagnostics.issues.push({ code, message });
    result.reason = result.diagnostics.issues.map((entry) => entry.message).join(' ');
  };
  if (!object(settings)) {
    issue('settings_missing', 'Nest has not reported usable sensor-control settings.');
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
    issue('multi_sensor_format', 'Automatic setup is unavailable for this Nest multi-sensor format.');
    return result;
  }
  result.selection.source = selectionSource(settings.activeRcsSelection);
  if (result.selection.source === 'remote') {
    result.selection.sensorId = settings.activeRcsSelection.activeRcsSensor.resourceId;
  }
  if (result.mode === 'unknown') {
    issue(settings.rcsControlMode === undefined ? 'mode_missing' : 'mode_unknown',
      settings.rcsControlMode === undefined ?
        'Nest has not reported whether room-sensor selection follows a schedule or is held. ' +
          'This does not identify the thermostat model as unsupported.' :
        'Nest reported a sensor scheduling mode that automatic setup does not recognize.');
  }
  const associationsValid = Array.isArray(settings.associatedRcsSensors) &&
    !settings.associatedRcsSensors.some((sensor) =>
      !object(sensor?.deviceId) || typeof sensor.deviceId.resourceId !== 'string' || !sensor.deviceId.resourceId,
    );
  if (!associationsValid) {
    issue('associations_unavailable', 'Nest has not reported a usable paired-sensor list.');
  }
  if (result.selection.source === 'unknown') {
    issue('selection_unknown', 'Nest has not reported a recognized active temperature sensor.');
  } else if (associationsValid && !validSelection(settings.activeRcsSelection, settings)) {
    issue('sensor_not_associated', 'The selected Nest sensor is not in the reported paired-sensor list.');
  }
  // Protobuf can omit an empty repeated paired-sensor list. A positively reported
  // backplate can guide heating even when schedule mode is omitted. This does not
  // authorize sensor-setting writes or infer a native schedule/hold mode.
  result.builtInConfirmed = result.selection.source === 'thermostat' && result.diagnostics.issues.every((entry) =>
    (entry.code === 'associations_unavailable' && settings.associatedRcsSensors === undefined) ||
    (entry.code === 'mode_missing' && settings.rcsControlMode === undefined),
  );
  if (result.diagnostics.issues.length) {
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
