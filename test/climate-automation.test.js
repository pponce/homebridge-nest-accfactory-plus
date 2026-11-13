import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ClimateAutomation, heatingTarget, automationSources } from '../src/climate-automation.js';
import { ClimateDashboard } from '../src/climate-dashboard.js';
import { validateRuleDrafts } from '../src/web-dashboard-config.js';
import { fanState, speedCapabilities } from '../homebridge-ui/public/fan-speed.js';
import { sensorControlState } from '../src/nest-sensor-control.js';

const minute = 60000;
test('a failed Apple Home status update cannot reject a background tick or stop cleanup', async (t) => {
  const f = await fixture(t, {});
  const warnings = [];
  f.engine.log = { warn: (message) => warnings.push(message) };
  f.engine.onState = () => {
    throw new Error('SENSITIVE-FIXTURE');
  };
  await assert.doesNotReject(f.engine.tick());
  await assert.doesNotReject(f.engine.stop());
  assert.equal(f.engine.stopping, true);
  assert.ok(warnings.length >= 2);
  assert.ok(warnings.every((message) => !message.includes('SENSITIVE-FIXTURE')));
});

const temperatureRule = {
  id: 'rooms',
  kind: 'temperature',
  name: 'Downstairs',
  enabled: true,
  thermostatId: 'T',
  sourceIds: ['nest:S', 'room'],
  aggregation: 'average',
  desiredTemperature: 21,
  maximumOffset: 1.5,
  minimumIntervalMinutes: 5,
};
const fanRule = {
  id: 'fans',
  kind: 'fan',
  name: 'Room fan',
  enabled: true,
  targetIds: ['fan'],
  sourceIds: ['room'],
  action: 'temperature',
  threshold: 24,
  hysteresis: 1,
};
const presenceRule = {
  id: 'presence',
  kind: 'presence',
  name: 'Climate Home',
  enabled: true,
  sourceIds: ['motion', 'occupancy'],
  logic: 'any',
  holdMinutes: 2,
  awayDelayMinutes: 3,
};

test('overview explains the observed fan separately from the pending temperature-based speed command', async (t) => {
  const rule = { ...fanRule, sourceIds: ['nest:S', 'room'], speedMode: 'curve', desiredTemperature: 22,
    startGap: 1, fullSpeedGap: 5, minimumSpeed: 25, maximumSpeed: 75 };
  const f = await fixture(t, {});
  f.dashboard.update('S', 'TemperatureSensor', { current_temperature: 25 }, 'A');
  f.source('room').temperature = 26;
  f.source('fan').name = 'Living room fan';
  f.source('fan').running = true;
  f.source('fan').speed = 25;
  f.source('fan').speedCapabilities = speedCapabilities({ perms: ['pr', 'pw'], minStep: 25 });
  f.rules({ fans: [rule] });
  f.noAck();
  await f.engine.tick();
  const report = f.rule('fans').explanation;
  assert.equal(report.average, 25.5);
  assert.deepEqual(report.sources.map((source) => source.temperature), [25, 26]);
  assert.equal(report.condition.demand, true);
  assert.equal(report.speed.calculated, 56.25);
  assert.equal(report.fans[0].speed, 25);
  assert.equal(report.fans[0].supportedSpeed, 50);
  assert.equal(report.fans[0].pending, true);
  assert.equal(report.fans[0].requested.speed, 50);
  assert.equal(report.fans[0].controllerId, 'fans');
  const writes = f.fanSpeedCommands.length;
  for (let index = 0; index < 3; index++) {
    assert.deepEqual(f.rule('fans').explanation, report);
  }
  assert.equal(f.fanSpeedCommands.length, writes, 'Reading explanations never sends commands');
});

test('overview retains a clear motion sensor contribution through its hold and then explains the Away delay', async (t) => {
  const f = await fixture(t, {});
  f.source('motion').detected = true;
  f.rules({ occupancy: [{ ...presenceRule, holdMinutes: 10 }] });
  await f.engine.tick();
  const detectedAt = f.now();
  f.source('motion').detected = false;
  f.advance(5 * minute);
  await f.engine.tick();
  let report = f.rule('presence').explanation;
  assert.equal(f.rule('presence').home, true);
  assert.equal(report.sources[0].detected, false);
  assert.equal(report.sources[0].effective, true);
  assert.equal(report.sources[0].lastDetectedAt, detectedAt);
  assert.equal(report.sources[0].holdUntil, detectedAt + 10 * minute);
  assert.equal(report.sources[1].effective, false);
  assert.equal(report.presence.awayAt, null);
  f.advance(5 * minute);
  await f.engine.tick();
  report = f.rule('presence').explanation;
  assert.equal(report.sources[0].effective, false);
  assert.equal(report.sources[0].holdUntil, null);
  assert.equal(report.presence.awaySince, f.now());
  assert.equal(report.presence.awayAt, f.now() + 3 * minute);
  assert.equal(f.rule('presence').home, true);
  f.advance(3 * minute);
  await f.engine.tick();
  assert.equal(f.rule('presence').home, false);
  assert.equal(f.rule('presence').explanation.presence.awayAt, null);
});

test('overview marks unavailable presence inputs unknown and keeps a manual override explicit', async (t) => {
  const f = await fixture(t, {});
  f.source('motion').detected = true;
  f.rules({ occupancy: [presenceRule] });
  await f.engine.tick();
  f.source('motion').available = false;
  await f.engine.tick();
  assert.equal(f.rule('presence').explanation.sources[0].effective, null);
  assert.equal(f.rule('presence').explanation.presence.awayAt, null);
  assert.equal(f.rule('presence').fault, true);
  await f.engine.control({ id: 'presence', action: 'away', minutes: 60 });
  assert.equal(f.rule('presence').home, false);
  assert.equal(f.rule('presence').explanation.presence.overrideUntil, f.now() + 60 * minute);
});

test('overview uses the selected fan controller and does not report a paused plan as active demand', async (t) => {
  const f = await fixture(t, {});
  const high = { ...fanRule, id: 'high', name: 'Priority rule', priority: 90 };
  f.source('room').temperature = 27;
  f.rules({ fans: [fanRule, high] });
  await f.engine.tick();
  assert.equal(f.rule('fans').explanation.fans[0].controllerId, 'high');
  await f.engine.control({ id: 'high', action: 'pause' });
  assert.equal(f.rule('high').explanation.condition.demand, null);
  assert.equal(f.rule('fans').explanation.fans[0].controllerId, 'fans');
});

test('overview explains bounded thermostat compensation and removes unavailable temperatures from its calculation', async (t) => {
  const f = await fixture(t);
  const report = f.rule('rooms').explanation;
  assert.equal(report.average, 20);
  assert.equal(report.heating.physical, 22);
  assert.equal(report.heating.rawOffset, 2);
  assert.equal(report.heating.maximumOffset, 1.5);
  assert.equal(report.heating.calculatedTarget, 22.5);
  assert.equal(report.heating.targetSource, 'rule');
  f.source('room').stale = true;
  await f.engine.tick();
  assert.equal(f.rule('rooms').explanation.average, null);
  assert.equal(f.rule('rooms').explanation.heating.calculatedTarget, null);
  assert.equal(f.rule('rooms').explanation.sources[1].temperature, null);
});

async function fixture(t, initial = { temperature: [temperatureRule] }) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'climate-engine-'));
  let clock = Date.parse('2026-11-02T10:00:00Z');
  const commands = [];
  const fanCommands = [];
  const fanSpeedCommands = [];
  const accounts = [{ id: 'A', authorised: true, observing: true }];
  let failCommand = false;
  let acknowledge = true;
  const dashboard = new ClimateDashboard(directory, {
    accounts: () => accounts,
    command: async (id, values, origin) => {
      assert.equal(origin.automation, true);
      assert.equal(origin.guard(), true);
      commands.push({ id, ...values });
      if (failCommand) {
        throw new Error('cloud unavailable');
      }
      if (acknowledge) {
        dashboard.update('T', 'Thermostat', { target_temperature_low: Math.round(values.target_temperature_low * 2) / 2 }, 'A');
      }
    },
  });
  dashboard.update(
    'T',
    'Thermostat',
    {
      nest_google_device_uuid: 'thermostat',
      description: 'Downstairs',
      online: true,
      physical_temperature: 22,
      target_temperature_low: 19,
      temperature_scale: 'C',
      hvac_mode: 'heat',
      hvac_state: 'off',
      can_heat: true,
      eco_mode: false,
      active_rcs_sensor: '',
      native_sensor_control: sensorControlState({
        rcsControlMode: 'RCS_CONTROL_MODE_HOLD', activeRcsSelection: { rcsSourceType: 'RCS_SOURCE_TYPE_BACKPLATE' },
        associatedRcsSensors: [{ deviceId: { resourceId: 'S' } }], rcsControlSchedule: { intervals: {} },
      }),
      schedules: {},
    },
    'A',
  );
  dashboard.update('S', 'TemperatureSensor', { nest_google_device_uuid: 'S', current_temperature: 20, online: true }, 'A');
  const external = [
    { id: 'room', kind: 'temperature', temperature: 20, available: true },
    { id: 'fan', kind: 'fan', running: false, canControl: true, available: true, canSetSpeed: true, speedAvailable: true, speed: 100,
      speedCapabilities: speedCapabilities({ perms: ['pr', 'pw'] }) },
    { id: 'motion', kind: 'motion', detected: false, available: true },
    { id: 'occupancy', kind: 'occupancy', detected: false, available: true },
  ];
  const access = {
    start: async () => {},
    close() {},
    refresh: async () => ({
      sources: external.map((source) => ({ ...source, lastReadAt: source.stale ? clock - 100000 : clock })),
      bridges: [],
    }),
    setFan: async (id, running, expected, options = {}) => {
      const source = external.find((entry) => entry.id === id);
      if (typeof expected === 'boolean') {
        assert.equal(source.running, expected);
      } else {
        assert.deepEqual(fanState(source), expected);
      }
      if (options.guard) {
        assert.equal(options.guard(), true);
      }
      fanCommands.push({ id, running });
      if (failCommand) {
        throw new Error('fan unavailable');
      }
      if (acknowledge) {
        source.running = running;
      }
    },
    setFanSpeed: async (id, speed, expected, options) => {
      const source = external.find((entry) => entry.id === id);
      assert.deepEqual(fanState(source), expected);
      assert.ok(speed <= options.maximum);
      assert.equal(options.guard(), true);
      fanSpeedCommands.push({ id, speed });
      if (failCommand) {
        throw new Error('fan unavailable');
      }
      if (acknowledge) {
        source.speed = speed;
      }
    },
  };
  let rules = validateRuleDrafts(initial);
  const devices = [];
  const options = {};
  const config = { snapshot: async () => ({ config: { rules: structuredClone(rules), devices, options } }) };
  const originalSnapshot = dashboard.snapshot.bind(dashboard);
  dashboard.snapshot = () => ({ ...originalSnapshot(), generatedAt: clock });
  const engine = new ClimateAutomation({ directory, dashboard, config, accessFactory: () => access, now: () => clock });
  t.after(async () => {
    await engine.stop();
    await fs.rm(directory, { recursive: true, force: true });
  });
  await engine.start({ schedule: false });
  return {
    engine,
    dashboard,
    config,
    directory,
    access,
    commands,
    fanCommands,
    fanSpeedCommands,
    accounts,
    external,
    devices,
    options,
    rule: (id) => engine.snapshot().rules.find((rule) => rule.id === id),
    advance: (ms) => {
      clock += ms;
    },
    now: () => clock,
    rules: (value) => {
      rules = validateRuleDrafts(value);
    },
    fail: () => {
      failCommand = true;
    },
    noAck: () => {
      acknowledge = false;
    },
    source: (id) => external.find((source) => source.id === id),
  };
}

test('an idle thermostat without a paired-sensor list can run a built-in and Homebridge temperature group', async (t) => {
  const rule = { ...temperatureRule, sourceIds: ['nest:thermostat', 'room'], enabled: false };
  const f = await fixture(t, { temperature: [rule] });
  f.dashboard.update('T', 'Thermostat', { native_sensor_control: sensorControlState({
    rcsControlMode: 'RCS_CONTROL_MODE_HOLD', activeRcsSelection: { rcsSourceType: 'RCS_SOURCE_TYPE_BACKPLATE' },
  }) }, 'A');
  f.rules({ temperature: [{ ...rule, enabled: true }] });
  await f.engine.evaluate();
  assert.deepEqual(f.commands, [{ id: 'thermostat', target_temperature_low: 22 }]);
  await f.engine.evaluate();
  assert.equal(f.rule('rooms').temperatureControl, 'active');
  assert.equal(f.rule('rooms').roomTemperature, 21);
  assert.equal(f.dashboard.devices.get('T').data.hvac_state, 'off', 'Heat mode does not require active heating');
  assert.equal(f.engine.sensorSetup.leases.size, 0, 'no native sensor hold or schedule changes are needed');
});

test('waiting temperature rules identify the actual unmet requirements', async (t) => {
  for (const [change, expected] of [
    [{ hvac_mode: 'off' }, 'Select Heat mode on Nest.'],
    [{ eco_mode: true }, 'Turn Eco off on Nest.'],
    [{ temperature_lock: true }, 'Turn off the Nest temperature lock.'],
    [{ can_heat: false }, 'This thermostat does not report support for heating.'],
    [{ active_rcs_sensor: 'other' }, 'Select the built-in Nest temperature sensor.'],
    [{ native_sensor_control: sensorControlState({}) }, 'Nest sensor feedback:'],
  ]) {
    const rule = { ...temperatureRule, sourceIds: ['room'], enabled: false };
    const f = await fixture(t, { temperature: [rule] });
    f.dashboard.update('T', 'Thermostat', change, 'A');
    f.rules({ temperature: [{ ...rule, enabled: true }] });
    await f.engine.evaluate();
    assert.equal(f.commands.length, 0);
    assert.equal(f.rule('rooms').temperatureControl, 'waiting');
    assert.ok(f.rule('rooms').reason.startsWith(expected), f.rule('rooms').reason);
  }
});

test('mixed sensor heating writes a bounded target, waits for feedback and rate limits later adjustments', async (t) => {
  const f = await fixture(t);
  assert.deepEqual(f.commands, [{ id: 'thermostat', target_temperature_low: 22.5 }]);
  assert.equal(f.rule('rooms').roomTemperature, 20);
  assert.equal(f.rule('rooms').thermostatId, 'T');
  assert.equal(f.rule('rooms').temperatureControl, 'updating');
  f.source('room').temperature = 24;
  await f.engine.tick();
  assert.equal(f.commands.length, 1);
  assert.equal(f.rule('rooms').temperatureControl, 'interval');
  f.advance(5 * minute);
  await f.engine.tick();
  assert.equal(f.commands.at(-1).target_temperature_low, 21);
  assert.equal(f.rule('rooms').roomTemperature, 22);
  assert.equal(f.rule('rooms').temperatureControl, 'updating');
  await f.engine.tick();
  assert.equal(f.rule('rooms').temperatureControl, 'active');
});

test('temperature controller reporting does not mistake enabled, paused or unavailable rules for applied rules', async (t) => {
  const f = await fixture(t, {});
  f.dashboard.update('T', 'Thermostat', { hvac_mode: 'cool' }, 'A');
  f.rules({ temperature: [temperatureRule] });
  await f.engine.tick();
  assert.equal(f.rule('rooms').temperatureControl, 'waiting');
  assert.equal(f.commands.length, 0);
  f.dashboard.update('T', 'Thermostat', { hvac_mode: 'heat', target_temperature_low: 22.5 }, 'A');
  await f.engine.tick();
  assert.equal(f.rule('rooms').temperatureControl, 'active', 'An already-correct target needs no write to be managed');
  assert.equal(f.commands.length, 0);
  await f.engine.control({ id: 'rooms', action: 'pause' });
  assert.equal(f.rule('rooms').temperatureControl, 'paused');
  f.rules({ temperature: [{ ...temperatureRule, enabled: false }] });
  await f.engine.tick();
  assert.equal(f.rule('rooms').temperatureControl, 'disabled');
  f.engine.error = 'Checks failed';
  assert.equal(f.rule('rooms').temperatureControl, 'unavailable');
});

test('rounding stays on C/F grids inside offset and absolute limits', () => {
  assert.equal(heatingTarget(21, 25, 19, 1.5), 22.5);
  assert.equal(heatingTarget(32, 30, 10), 32);
  assert.equal(heatingTarget(9, 10, 30), 9);
  const value = heatingTarget(21, 25, 19, 1.5, 'F');
  assert.ok(value <= 22.5 && value >= 19.5);
  assert.equal(Math.round(value * 1.8 + 32), value * 1.8 + 32);
});

test('whole-Fahrenheit commands accept half-Celsius feedback without masking a subsequent manual step', async (t) => {
  const f = await fixture(t, {});
  f.dashboard.update('T', 'Thermostat', { temperature_scale: 'F' }, 'A');
  f.rules({ temperature: [temperatureRule] });
  await f.engine.tick();
  assert.ok(Math.abs(f.commands[0].target_temperature_low - 22.2222222222) < 0.0001);
  assert.equal(f.dashboard.devices.get('T').data.target_temperature_low, 22);
  f.advance(5 * minute);
  await f.engine.tick();
  assert.equal(f.rule('rooms').paused, false);
  assert.equal(f.commands.length, 1);
  f.dashboard.update('T', 'Thermostat', { target_temperature_low: 22.5 }, 'A');
  await f.engine.tick();
  assert.equal(f.rule('rooms').paused, false);
  assert.ok(Math.abs(f.rule('rooms').desiredTemperature - (21 + 1 / 1.8)) < 0.000001);
  assert.equal(f.commands.length, 1);
});

test('sensor recovery cannot bypass the heating update interval after restoring a fallback target', async (t) => {
  const f = await fixture(t);
  await f.engine.tick();
  f.source('room').available = false;
  await f.engine.tick();
  assert.equal(f.commands.length, 2);
  f.source('room').available = true;
  await f.engine.tick();
  assert.equal(f.commands.length, 2);
  assert.match(f.rule('rooms').reason, /minimum heating-target/);
  f.advance(5 * minute);
  await f.engine.tick();
  assert.equal(f.commands.length, 3);
});

test('manual cloud target changes pause heating without restoring over the user', async (t) => {
  const f = await fixture(t, { temperature: [{ ...temperatureRule, manualTargetBehavior: 'pause' }] });
  await f.engine.tick();
  f.dashboard.update('T', 'Thermostat', { target_temperature_low: 20.5 }, 'A');
  f.advance(6 * minute);
  await f.engine.tick();
  assert.equal(f.rule('rooms').paused, true);
  assert.equal(f.rule('rooms').temperatureControl, 'paused');
  assert.equal(f.commands.length, 1);
  await f.engine.stop();
  assert.equal(f.commands.length, 1);
});

test('the default follows native target changes without changing saved settings or sensor membership', async (t) => {
  const f = await fixture(t);
  await f.engine.tick();
  f.dashboard.update('T', 'Thermostat', { target_temperature_low: 23.5 }, 'A');
  await f.engine.tick();
  assert.equal(f.rule('rooms').paused, false);
  assert.equal(f.rule('rooms').desiredTemperature, 22);
  assert.equal(f.rule('rooms').savedDesiredTemperature, 21);
  assert.equal(f.rule('rooms').targetSource, 'manual');
  assert.equal(f.rule('rooms').temperatureControl, 'active');
  assert.equal(f.rule('rooms').nextChangeAt, f.now() + 5 * minute);
  assert.equal(f.commands.length, 1, 'the manual write also starts the command interval');
  assert.deepEqual((await f.config.snapshot()).config.rules.temperature[0],
    validateRuleDrafts({ temperature: [temperatureRule] }).temperature[0]);
  f.advance(5 * minute);
  await f.engine.tick();
  await f.engine.tick();
  assert.equal(f.rule('rooms').desiredTemperature, 22, 'compensation acknowledgements cannot become manual adjustments');
  f.dashboard.update('T', 'Thermostat', { target_temperature_low: 22.5 }, 'A');
  await f.engine.tick();
  assert.equal(f.rule('rooms').desiredTemperature, 21);
  assert.equal(f.rule('rooms').paused, false);
});

test('HomeKit target requests wait for acceptance and feedback, accumulate quick changes, and leave the group active', async (t) => {
  const f = await fixture(t);
  await f.engine.tick();
  const first = await f.engine.manualThermostat('thermostat', { uuid: 'thermostat', target_temperature_low: 23.5 });
  const second = await f.engine.manualThermostat('thermostat', { uuid: 'thermostat', target_temperature_low: 24.5 });
  await f.engine.manualThermostatResult(first, true);
  f.dashboard.update('T', 'Thermostat', { target_temperature_low: 23.5 }, 'A');
  await f.engine.tick();
  assert.equal(f.rule('rooms').temperatureControl, 'updating');
  assert.equal(f.rule('rooms').desiredTemperature, 21);
  assert.equal(f.commands.length, 1);
  f.dashboard.update('T', 'Thermostat', { target_temperature_low: 24.5 }, 'A');
  await f.engine.tick();
  assert.equal(f.rule('rooms').desiredTemperature, 21, 'feedback alone cannot confirm a queued request');
  await f.engine.manualThermostatResult(second, true);
  await f.engine.tick();
  assert.equal(f.rule('rooms').desiredTemperature, 23);
  assert.equal(f.rule('rooms').paused, false);
  assert.equal(f.commands.length, 1);
  f.advance(5 * minute);
  await f.engine.tick();
  await f.engine.tick();
  assert.equal(f.rule('rooms').desiredTemperature, 23);
});

test('failed and unconfirmed HomeKit requests pause without retries or a fabricated desired temperature', async (t) => {
  for (const accepted of [false, true]) {
    const f = await fixture(t);
    await f.engine.tick();
    const request = await f.engine.manualThermostat('thermostat', { target_temperature_low: 23.5 });
    await f.engine.manualThermostatResult(request, accepted);
    f.advance(2 * minute);
    await f.engine.tick();
    assert.equal(f.rule('rooms').paused, true);
    assert.equal(f.rule('rooms').desiredTemperature, 21);
    assert.equal(f.commands.length, 1);
    await f.engine.stop();
    assert.equal(f.commands.length, 1, 'the last native target must not be overwritten');
  }
});

test('the pause option covers HomeKit while duplicate target writes do not pause an active rule', async (t) => {
  const f = await fixture(t, { temperature: [{ ...temperatureRule, manualTargetBehavior: 'pause' }] });
  await f.engine.tick();
  await f.engine.manualThermostat('thermostat', { target_temperature_low: 22.5 });
  assert.equal(f.rule('rooms').paused, false);
  await f.engine.manualThermostat('thermostat', { target_temperature_low: 23.5 });
  assert.equal(f.rule('rooms').paused, true);
  assert.equal(f.engine.leases.size, 0);
  assert.equal(f.rule('rooms').desiredTemperature, 21);
});

test('saved desired edits and Resume use the exact saved target instead of preserving a temporary adjustment', async (t) => {
  const f = await fixture(t);
  await f.engine.tick();
  f.dashboard.update('T', 'Thermostat', { target_temperature_low: 23.5 }, 'A');
  await f.engine.tick();
  assert.equal(f.rule('rooms').desiredTemperature, 22);
  f.rules({ temperature: [{ ...temperatureRule, desiredTemperature: 24 }] });
  await f.engine.tick();
  assert.equal(f.rule('rooms').desiredTemperature, 24);
  assert.equal(f.rule('rooms').targetSource, 'rule');
  f.dashboard.update('T', 'Thermostat', { target_temperature_low: 24.5 }, 'A');
  await f.engine.tick();
  assert.equal(f.rule('rooms').desiredTemperature, 25);
  await f.engine.control({ id: 'rooms', action: 'pause' });
  await f.engine.control({ id: 'rooms', action: 'resume' });
  assert.equal(f.rule('rooms').desiredTemperature, 24);
});

test('the saved room target can be restored without pausing the sensor group', async (t) => {
  const f = await fixture(t);
  await f.engine.tick();
  f.dashboard.update('T', 'Thermostat', { target_temperature_low: 23.5 }, 'A');
  await f.engine.tick();
  assert.equal(f.rule('rooms').desiredTemperature, 22);
  await f.engine.control({ id: 'rooms', action: 'resetTarget' });
  assert.equal(f.rule('rooms').desiredTemperature, 21);
  assert.equal(f.rule('rooms').targetSource, 'rule');
  assert.equal(f.rule('rooms').paused, false);
  const pending = await f.engine.manualThermostat('thermostat', { target_temperature_low: 24.5 });
  await assert.rejects(f.engine.control({ id: 'rooms', action: 'resetTarget' }), /confirmation/);
  await f.engine.manualThermostatResult(pending, false);
});

test('scheduled targets expire manual adjustments only after native feedback, with no command echo loop', async (t) => {
  const f = await fixture(t, {});
  f.devices.push({ serialNumber: 'T', scheduleTimeZone: 'UTC' });
  f.dashboard.update('T', 'Thermostat', { schedules: { 0: { a: { time: 36060, 'temp-min': 19 } } } }, 'A');
  f.rules({ temperature: [temperatureRule] });
  await f.engine.tick();
  await f.engine.tick();
  f.dashboard.update('T', 'Thermostat', { target_temperature_low: 23.5 }, 'A');
  await f.engine.tick();
  assert.equal(f.rule('rooms').desiredTemperature, 22);
  f.advance(minute);
  await f.engine.tick();
  assert.equal(f.rule('rooms').temperatureControl, 'updating');
  assert.equal(f.commands.length, 1);
  f.dashboard.update('T', 'Thermostat', { target_temperature_low: 19 }, 'A');
  await f.engine.tick();
  assert.equal(f.rule('rooms').desiredTemperature, 19);
  assert.equal(f.rule('rooms').targetSource, 'schedule');
  assert.equal(f.rule('rooms').paused, false);
  f.advance(5 * minute);
  await f.engine.tick();
  assert.equal(f.commands.at(-1).target_temperature_low, 20.5);
  await f.engine.tick();
  assert.equal(f.rule('rooms').desiredTemperature, 19);
});

test('an unconfirmed or ambiguous scheduled heating target pauses instead of fighting Nest', async (t) => {
  for (const desired of [19, undefined]) {
    const f = await fixture(t, {});
    f.devices.push({ serialNumber: 'T', scheduleTimeZone: 'UTC' });
    f.dashboard.update('T', 'Thermostat', { schedules: { 0: { a: { time: 36060, 'temp-min': desired } } } }, 'A');
    f.rules({ temperature: [temperatureRule] });
    await f.engine.tick();
    f.advance(minute);
    await f.engine.tick();
    f.advance(2 * minute);
    await f.engine.tick();
    assert.equal(f.rule('rooms').paused, true);
    assert.match(f.rule('rooms').reason, /schedule/);
    assert.equal(f.commands.length, 1);
  }
});

test('future schedule edits preserve a manual room target until its current schedule event changes', async (t) => {
  const f = await fixture(t, {});
  f.devices.push({ serialNumber: 'T', scheduleTimeZone: 'UTC' });
  const schedules = { 0: { a: { time: 200, 'temp-min': 19 }, b: { time: 50000, 'temp-min': 20 } } };
  f.dashboard.update('T', 'Thermostat', { schedules }, 'A');
  f.rules({ temperature: [temperatureRule] });
  await f.engine.tick();
  await f.engine.tick();
  f.dashboard.update('T', 'Thermostat', { target_temperature_low: 23.5 }, 'A');
  await f.engine.tick();
  schedules[0].b['temp-min'] = 18;
  f.dashboard.update('T', 'Thermostat', { schedules }, 'A');
  await f.engine.tick();
  assert.equal(f.rule('rooms').targetSource, 'manual');
  assert.equal(f.rule('rooms').desiredTemperature, 22);
  assert.equal(f.rule('rooms').paused, false);
});

test('manual following keeps desired targets within heating limits', async (t) => {
  for (const [desiredTemperature, room, actual, expected] of [[31, 24, 32, 32], [10, 20, 9, 9]]) {
    const f = await fixture(t, {});
    f.source('room').temperature = room;
    f.rules({ temperature: [{ ...temperatureRule, desiredTemperature, sourceIds: ['room'] }] });
    await f.engine.tick();
    await f.engine.tick();
    f.dashboard.update('T', 'Thermostat', { target_temperature_low: actual }, 'A');
    await f.engine.tick();
    assert.equal(f.rule('rooms').desiredTemperature, expected);
    assert.equal(f.rule('rooms').paused, false);
  }
  assert.throws(() => validateRuleDrafts({ temperature: [{ ...temperatureRule, manualTargetBehavior: 'invalid' }] }), /supported/);
});

test('a direct manual request invalidates an automation command queued before it', async (t) => {
  const f = await fixture(t);
  await f.engine.tick();
  f.source('room').temperature = 24;
  f.advance(5 * minute);
  let requests;
  const set = f.dashboard.setAutomationTarget.bind(f.dashboard);
  f.dashboard.setAutomationTarget = async (...args) => {
    requests = await f.engine.manualThermostat('thermostat', { target_temperature_low: 23.5 });
    return set(...args);
  };
  await f.engine.tick();
  assert.equal(f.commands.length, 1, 'the cancelled compensation must not reach Nest');
  assert.equal(f.rule('rooms').paused, false);
  f.dashboard.setAutomationTarget = set;
  await f.engine.manualThermostatResult(requests, true);
  f.dashboard.update('T', 'Thermostat', { target_temperature_low: 23.5 }, 'A');
  await f.engine.tick();
  assert.equal(f.rule('rooms').paused, false);
  assert.equal(f.rule('rooms').targetSource, 'manual');
  assert.equal(f.rule('rooms').desiredTemperature, 22, 'an unsent compensation cannot change the manual adjustment baseline');
});

test('direct manual commands pause before feedback and resume explicitly starts a new hold', async (t) => {
  const f = await fixture(t);
  await f.engine.manualThermostat('thermostat');
  f.dashboard.update('T', 'Thermostat', { target_temperature_low: 20 }, 'A');
  await f.engine.tick();
  assert.equal(f.rule('rooms').paused, true);
  assert.equal(f.commands.length, 1);
  await f.engine.control({ id: 'rooms', action: 'resume' });
  assert.equal(f.rule('rooms').paused, false);
  assert.equal(f.commands.length, 1);
  f.advance(5 * minute);
  await f.engine.tick();
  assert.equal(f.commands.length, 2);
});

test('missing inputs restore only owned settings and cannot be silently dropped from the average', async (t) => {
  const f = await fixture(t);
  await f.engine.tick();
  f.source('room').available = false;
  await f.engine.tick();
  assert.equal(f.rule('rooms').phase, 'waiting');
  assert.equal(f.rule('rooms').temperatureControl, 'restoring');
  assert.equal(f.commands.at(-1).target_temperature_low, 19);
  await f.engine.tick();
  assert.equal(f.commands.length, 2);
  assert.equal(f.rule('rooms').temperatureControl, 'waiting');
  f.source('room').available = true;
  f.advance(5 * minute);
  await f.engine.tick();
  assert.equal(f.commands.at(-1).target_temperature_low, 22.5);
});

test('Eco, Off, native sensor changes and loss of observation never trigger compensation', async (t) => {
  for (const change of [{ eco_mode: true }, { hvac_mode: 'off' }, { active_rcs_sensor: 'other' }, { temperature_lock: true }]) {
    const f = await fixture(t);
    f.dashboard.update('T', 'Thermostat', change, 'A');
    f.advance(5 * minute);
    await f.engine.tick();
    assert.equal(f.rule('rooms').paused, true);
    assert.equal(f.commands.length, 1);
  }
  const f = await fixture(t);
  f.accounts[0].observing = false;
  f.advance(5 * minute);
  await f.engine.tick();
  assert.equal(f.commands.length, 1);
  assert.match(f.rule('rooms').reason, /feedback was unavailable/);
  assert.equal(f.rule('rooms').paused, true);
});

test('schedule boundaries use the scheduled room target even when the numeric Nest target has not changed', async (t) => {
  const f = await fixture(t, {});
  f.devices.push({ serialNumber: 'T', scheduleTimeZone: 'UTC' });
  f.dashboard.update('T', 'Thermostat', { schedules: { 0: { a: { time: 36060, 'temp-min': 22.5 } } } }, 'A');
  f.rules({ temperature: [temperatureRule] });
  await f.engine.tick();
  assert.equal(f.commands.length, 1);
  f.advance(minute);
  await f.engine.tick();
  assert.equal(f.rule('rooms').paused, false);
  assert.equal(f.rule('rooms').desiredTemperature, 22.5);
  assert.equal(f.rule('rooms').targetSource, 'schedule');
  assert.equal(f.rule('rooms').savedDesiredTemperature, 21);
  assert.equal(f.commands.length, 1);
});

test('disabling a rule restores the original target; changed targets are not restored', async (t) => {
  const f = await fixture(t);
  await f.engine.tick();
  f.rules({ temperature: [{ ...temperatureRule, enabled: false }] });
  await f.engine.tick();
  assert.equal(f.commands.at(-1).target_temperature_low, 19);
  assert.equal(f.rule('rooms').phase, 'disabled');
  await f.engine.tick();
  assert.equal(f.engine.leases.size, 0);
});

test('failed or unacknowledged writes pause without repeated cloud commands', async (t) => {
  const f = await fixture(t, {});
  f.fail();
  f.rules({ temperature: [temperatureRule] });
  await f.engine.tick();
  assert.equal(f.rule('rooms').paused, true);
  f.advance(3 * minute);
  await f.engine.tick();
  assert.equal(f.commands.length, 1);
  const g = await fixture(t, {});
  g.noAck();
  g.rules({ temperature: [temperatureRule] });
  await g.engine.tick();
  await g.engine.tick();
  assert.equal(g.commands.length, 1);
  g.advance(3 * minute);
  await g.engine.tick();
  assert.equal(g.rule('rooms').paused, true);
  assert.equal(g.commands.length, 1);
});

test('missing heating feedback refreshes observation once and confirms without repeating the command', async (t) => {
  const f = await fixture(t, {});
  let refreshes = 0;
  f.dashboard.refresh = (id) => {
    assert.equal(id, 'thermostat');
    refreshes += 1;
    f.accounts[0].observing = false;
    f.dashboard.invalidate('A');
    return true;
  };
  f.noAck();
  f.rules({ temperature: [temperatureRule] });
  await f.engine.tick();
  f.advance(15000);
  await f.engine.tick();
  assert.equal(refreshes, 0);
  f.advance(15000);
  await f.engine.tick();
  assert.equal(refreshes, 1);
  assert.match(f.rule('rooms').reason, /Refreshing Nest feedback/);
  assert.equal(f.rule('rooms').paused, false);
  f.advance(15000);
  await f.engine.tick();
  assert.equal(f.commands.length, 1);
  f.accounts[0].observing = true;
  f.dashboard.update('T', 'Thermostat', { target_temperature_low: 22.5, hvac_state: 'off' }, 'A');
  await f.engine.tick();
  assert.equal(f.rule('rooms').phase, 'waiting');
  assert.match(f.rule('rooms').reason, /selected temperature readings/);
  assert.equal(f.commands.length, 1, 'Partial recovery must not restore the old target before sensors report');
  f.dashboard.update('S', 'TemperatureSensor', { current_temperature: 20 }, 'A');
  await f.engine.tick();
  assert.equal(f.rule('rooms').phase, 'active');
  assert.equal(f.rule('rooms').lastAction.status, 'confirmed');
  assert.match(f.rule('rooms').lastAction.message, /confirmed by Nest/);
  assert.equal(f.commands.length, 1);
  assert.equal(refreshes, 1);
});

test('feedback refresh cannot extend the heating timeout or resend a command while disconnected', async (t) => {
  const f = await fixture(t, {});
  let refreshes = 0;
  f.dashboard.refresh = () => {
    refreshes += 1;
    f.accounts[0].observing = false;
    f.dashboard.invalidate('A');
    return true;
  };
  f.noAck();
  f.rules({ temperature: [temperatureRule] });
  await f.engine.tick();
  f.advance(30000);
  await f.engine.tick();
  f.advance(90000);
  await f.engine.tick();
  assert.equal(f.rule('rooms').paused, true);
  assert.match(f.rule('rooms').reason, /feedback.*two minutes/);
  assert.equal(f.rule('rooms').lastAction.status, 'unconfirmed');
  assert.equal(f.engine.leases.size, 0);
  f.accounts[0].observing = true;
  f.dashboard.update('T', 'Thermostat', { target_temperature_low: 22.5, hvac_state: 'off' }, 'A');
  await f.engine.tick();
  assert.equal(f.rule('rooms').paused, true, 'Late feedback must not silently resume a paused rule');
  assert.equal(f.rule('rooms').nestTarget, 22.5, 'Paused rule reporting still shows current Nest feedback');
  assert.equal(f.commands.length, 1);
  assert.equal(refreshes, 1);
});

test('a failed feedback refresh remains bounded and does not expose connection details', async (t) => {
  const f = await fixture(t, {});
  let refreshes = 0;
  f.dashboard.refresh = () => {
    refreshes += 1;
    throw new Error('SENSITIVE-CONNECTION');
  };
  f.noAck();
  f.rules({ temperature: [temperatureRule] });
  await f.engine.tick();
  f.advance(30000);
  await f.engine.tick();
  assert.equal(f.rule('rooms').paused, false);
  f.advance(30000);
  await f.engine.tick();
  assert.equal(refreshes, 1);
  f.advance(60000);
  await f.engine.tick();
  assert.equal(f.rule('rooms').paused, true);
  assert.equal(f.rule('rooms').lastAction.status, 'unconfirmed');
  assert.equal(JSON.stringify(f.engine.snapshot()).includes('SENSITIVE-CONNECTION'), false);
  assert.equal(f.commands.length, 1);
});

test('conflicting Nest feedback pauses immediately without a refresh or another temperature write', async (t) => {
  const f = await fixture(t, {});
  let refreshes = 0;
  f.dashboard.refresh = () => {
    refreshes += 1;
    return true;
  };
  f.noAck();
  f.rules({ temperature: [temperatureRule] });
  await f.engine.tick();
  f.dashboard.update('T', 'Thermostat', { target_temperature_low: 20 }, 'A');
  f.advance(30000);
  await f.engine.tick();
  assert.equal(f.rule('rooms').paused, true);
  assert.match(f.rule('rooms').reason, /different heating target/);
  assert.equal(f.rule('rooms').lastAction.status, 'unconfirmed');
  assert.equal(refreshes, 0);
  assert.equal(f.commands.length, 1);
});

test('missing room-sensor readings cannot hide a target conflict or extend confirmation after refresh', async (t) => {
  for (const reported of [19, 20]) {
    const f = await fixture(t, {});
    f.dashboard.refresh = () => {
      f.dashboard.invalidate('A');
      return true;
    };
    f.noAck();
    f.rules({ temperature: [temperatureRule] });
    await f.engine.tick();
    f.advance(30000);
    await f.engine.tick();
    f.dashboard.update('T', 'Thermostat', { target_temperature_low: reported, hvac_state: 'off' }, 'A');
    // The selected Nest room sensor has not reappeared in this observation yet.
    if (reported === 19) {
      f.advance(90000);
    }
    await f.engine.tick();
    assert.equal(f.rule('rooms').paused, true);
    assert.equal(f.commands.length, 1);
    assert.equal(f.rule('rooms').lastAction.status, 'unconfirmed');
  }
});

test('room fan hysteresis avoids chatter and respects manual changes', async (t) => {
  const f = await fixture(t, { fans: [fanRule] });
  assert.equal(f.fanCommands.length, 0);
  f.source('room').temperature = 25;
  await f.engine.tick();
  assert.deepEqual(f.fanCommands, [{ id: 'fan', running: true }]);
  f.advance(minute);
  f.source('room').temperature = 23.5;
  await f.engine.tick();
  assert.equal(f.fanCommands.length, 1);
  f.source('room').temperature = 23;
  await f.engine.tick();
  assert.equal(f.fanCommands.at(-1).running, false);
  f.advance(minute);
  await f.engine.tick();
  f.source('fan').running = true;
  await f.engine.tick();
  assert.equal(f.rule('fans').paused, true);
  assert.equal(f.fanCommands.length, 2);
});

test('HVAC-follow fans restore after activity stops but do not stop a fan already running', async (t) => {
  const f = await fixture(t, { fans: [{ ...fanRule, action: 'heating', thermostatId: 'T' }] });
  f.dashboard.update('T', 'Thermostat', { hvac_state: 'heating' }, 'A');
  await f.engine.tick();
  assert.equal(f.fanCommands.at(-1).running, true);
  f.advance(minute);
  f.dashboard.update('T', 'Thermostat', { hvac_state: 'off' }, 'A');
  await f.engine.tick();
  assert.equal(f.fanCommands.at(-1).running, false);
  const g = await fixture(t, {});
  g.source('fan').running = true;
  g.rules({ fans: [fanRule] });
  await g.engine.tick();
  assert.equal(g.fanCommands.length, 0);
  g.source('fan').running = false;
  g.source('room').temperature = 25;
  await g.engine.tick();
  assert.equal(g.rule('fans').paused, true);
  assert.equal(g.fanCommands.length, 0);
});

test('presence holds motion, keeps continuous occupancy, delays Away and treats missing sensors as unknown', async (t) => {
  const f = await fixture(t, { occupancy: [presenceRule] });
  assert.equal(f.rule('presence').home, undefined);
  f.source('motion').detected = true;
  await f.engine.tick();
  assert.equal(f.rule('presence').home, true);
  f.source('motion').detected = false;
  f.advance(minute);
  await f.engine.tick();
  assert.equal(f.rule('presence').home, true);
  f.advance(2 * minute);
  await f.engine.tick();
  assert.equal(f.rule('presence').home, true);
  f.source('occupancy').available = false;
  f.advance(10 * minute);
  await f.engine.tick();
  assert.equal(f.rule('presence').home, true);
  assert.equal(f.rule('presence').fault, true);
  f.source('occupancy').available = true;
  await f.engine.tick();
  f.advance(3 * minute);
  await f.engine.tick();
  assert.equal(f.rule('presence').home, false);
  f.source('occupancy').detected = true;
  await f.engine.tick();
  f.advance(60 * minute);
  await f.engine.tick();
  assert.equal(f.rule('presence').home, true);
});

test('any/all conditions and expiring manual presence overrides operate without writing Google state', async (t) => {
  const f = await fixture(t, { occupancy: [{ ...presenceRule, logic: 'all', awayDelayMinutes: 0 }] });
  f.source('occupancy').detected = true;
  await f.engine.tick();
  assert.equal(f.rule('presence').home, false);
  f.source('motion').detected = true;
  await f.engine.tick();
  assert.equal(f.rule('presence').home, true);
  await f.engine.control({ id: 'presence', action: 'away', minutes: 1 });
  assert.equal(f.rule('presence').home, false);
  f.advance(minute);
  await f.engine.tick();
  assert.equal(f.rule('presence').home, true);
  assert.equal(f.commands.length, 0);
});

test('Nest occupancy has one source while saved Homebridge aliases still resolve and rule outputs are excluded', async (t) => {
  const rule = { ...presenceRule, sourceIds: ['hap:home-copy'], awayDelayMinutes: 0 };
  const f = await fixture(t, { occupancy: [rule] });
  f.dashboard.update('HOME', 'HomeAway', { nest_google_device_uuid: 'structure-home', occupancy: true, online: true }, 'A');
  f.external.push(
    { id: 'hap:home-copy', serial: 'home', kind: 'occupancy', detected: false, available: true },
    { id: 'hap:rule-output', serial: 'CLIMATE-PRESENCE-TEST', kind: 'occupancy', detected: true, available: true },
  );
  await f.engine.tick();
  const sources = automationSources(f.engine.live, f.engine.external);
  assert.equal(sources.some((source) => source.id === 'hap:home-copy' || source.id === 'hap:rule-output'), false);
  assert.deepEqual(sources.find((source) => source.id === 'nest:structure-home').aliases, ['hap:home-copy']);
  assert.equal(f.rule('presence').home, true);
  assert.deepEqual(f.engine.rules.find((entry) => entry.id === 'presence').sourceIds, ['hap:home-copy']);
  f.dashboard.update('HOME', 'HomeAway', { occupancy: false }, 'A');
  await f.engine.tick();
  assert.equal(f.rule('presence').home, false);
  f.dashboard.invalidate('A');
  await f.engine.tick();
  assert.equal(f.rule('presence').fault, true);
  assert.equal(f.commands.length, 0);
});

test('restart retains presence overrides and continues equipment rules after checks', async (t) => {
  const f = await fixture(t, { temperature: [temperatureRule], occupancy: [presenceRule] });
  await f.engine.control({ id: 'presence', action: 'home', minutes: 60 });
  await f.engine.stop();
  const replacement = new ClimateAutomation({
    directory: f.directory,
    dashboard: f.dashboard,
    config: f.config,
    accessFactory: () => f.access,
    now: f.now,
  });
  await replacement.start({ schedule: false });
  assert.equal(replacement.snapshot().rules.find((rule) => rule.id === 'rooms').paused, false);
  assert.equal(replacement.snapshot().rules.find((rule) => rule.id === 'presence').home, true);
  assert.equal(f.commands.at(-1).target_temperature_low, 19);
  await replacement.stop();
});

test('command guards reject stale targets, invalid bounds and cancelled ownership before any device write', async (t) => {
  const f = await fixture(t, {});
  await assert.rejects(f.dashboard.setAutomationTarget('T', 22, 18), { code: 'CLIMATE_CONFLICT' });
  await assert.rejects(f.dashboard.setAutomationTarget('T', 33, 19), { code: 'CLIMATE_CONFLICT' });
  await assert.rejects(
    f.dashboard.setAutomationTarget('T', 22, 19, () => false),
    { code: 'CLIMATE_CONFLICT' },
  );
  await assert.rejects(f.dashboard.setAutomationTarget('missing', 22, 19), { code: 'CLIMATE_CONFLICT' });
  assert.equal(f.commands.length, 0);
});

test('storage failures and invalid configuration prevent enabled rules from issuing commands', async (t) => {
  const f = await fixture(t, {});
  f.rules({ temperature: [temperatureRule] });
  const persist = f.engine.persist.bind(f.engine);
  f.engine.persist = async () => {
    throw new Error('Disk full');
  };
  await f.engine.tick();
  assert.equal(f.commands.length, 0);
  assert.match(f.engine.snapshot().error, /checks/);
  f.engine.persist = persist;
  f.config.snapshot = async () => ({ rulesError: 'Invalid rules' });
  await f.engine.tick();
  assert.equal(f.rule('rooms').paused, true);
  assert.equal(f.engine.snapshot().error, 'Invalid rules');
});

test('unreadable recovery state requires explicit resume, and invalid runtime commands are rejected', async (t) => {
  const f = await fixture(t, {});
  await f.engine.stop();
  await fs.writeFile(path.join(f.directory, 'automation.json'), '{broken');
  f.rules({ temperature: [temperatureRule] });
  const engine = new ClimateAutomation({
    directory: f.directory,
    dashboard: f.dashboard,
    config: f.config,
    accessFactory: () => f.access,
    now: f.now,
  });
  await engine.start({ schedule: true });
  assert.equal(engine.snapshot().rules[0].paused, true);
  assert.equal(f.commands.length, 0);
  await assert.rejects(engine.control({ id: 'rooms', action: 'away' }), /Presence overrides/);
  await assert.rejects(engine.control({ id: 'rooms', action: 'resume', unexpected: true }), /Invalid/);
  await assert.rejects(engine.control({ id: 'unknown', action: 'resume' }), /enabled rule/);
  await engine.control({ id: 'rooms', action: 'resume' });
  assert.equal(f.commands.length, 1);
  await engine.control({ id: 'rooms', action: 'pause' });
  assert.equal(engine.snapshot().rules[0].paused, true);
  await engine.stop();
  await assert.rejects(engine.control({ id: 'rooms', action: 'resume' }), /Invalid/);
});

test('removing a rule releases owned equipment and removes its runtime entry', async (t) => {
  const f = await fixture(t);
  await f.engine.tick();
  f.rules({});
  await f.engine.tick();
  await f.engine.tick();
  assert.equal(f.commands.at(-1).target_temperature_low, 19);
  assert.equal(f.rule('rooms'), undefined);
});

test('loss of fan input restores an owned fan and disconnected fans retain pending restoration', async (t) => {
  const f = await fixture(t, { fans: [fanRule] });
  f.source('room').temperature = 25;
  await f.engine.tick();
  f.source('room').stale = true;
  f.source('fan').available = false;
  await f.engine.tick();
  assert.equal(f.fanCommands.length, 1);
  assert.equal(f.engine.snapshot().pendingRestorations, 1);
  f.source('fan').available = true;
  await f.engine.tick();
  assert.equal(f.fanCommands.at(-1).running, false);
});

test('missing Nest schedule time zone blocks heating and manual changes adjust the room target before the first write', async (t) => {
  const f = await fixture(t, {});
  f.dashboard.update('T', 'Thermostat', { target_temperature_low: 22.5, schedules: { 0: { a: { time: 200, 'temp-min': 22.5 } } } }, 'A');
  f.rules({ temperature: [temperatureRule] });
  await f.engine.tick();
  assert.match(f.rule('rooms').reason, /time zone/);
  assert.equal(f.commands.length, 0);
  f.devices.push({ serialNumber: 'T', scheduleTimeZone: 'UTC' });
  await f.engine.tick();
  assert.equal(f.commands.length, 0);
  f.dashboard.update('T', 'Thermostat', { target_temperature_low: 20 }, 'A');
  await f.engine.tick();
  assert.equal(f.rule('rooms').paused, false);
  assert.equal(f.rule('rooms').desiredTemperature, 18.5);
  assert.equal(f.commands.length, 0);
});

test('shutdown does not restore over a Nest schedule boundary with an unchanged numeric target', async (t) => {
  const f = await fixture(t, {});
  f.devices.push({ serialNumber: 'T', scheduleTimeZone: 'UTC' });
  f.dashboard.update('T', 'Thermostat', { schedules: { 0: { a: { time: 36060, 'temp-min': 22.5 } } } }, 'A');
  f.rules({ temperature: [temperatureRule] });
  await f.engine.tick();
  f.advance(minute);
  await f.engine.stop();
  assert.equal(f.commands.length, 1);
});

test('reported schedule zones support control and changes pause an active hold without another command', async (t) => {
  const f = await fixture(t, {});
  f.dashboard.update('T', 'Thermostat', {
    schedule_time_zone: 'America/Los_Angeles', schedule_time_zone_source: 'home',
    schedules: { 0: { a: { time: 200, 'temp-min': 22.5 } } },
  }, 'A');
  f.rules({ temperature: [temperatureRule] });
  await f.engine.tick();
  assert.equal(f.commands.length, 1);
  f.dashboard.update('T', 'Thermostat', { schedule_time_zone: 'America/New_York' }, 'A');
  await f.engine.tick();
  assert.equal(f.rule('rooms').paused, true);
  assert.equal(f.commands.length, 1);
});

test('manual schedule zone wins and missing or invalid automatic zones prevent scheduled writes', async (t) => {
  const f = await fixture(t, {});
  f.devices.push({ serialNumber: 'T', scheduleTimeZone: 'UTC' });
  f.dashboard.update('T', 'Thermostat', { schedule_time_zone: 'America/Los_Angeles', schedules: { 0: { a: { time: 200 } } } }, 'A');
  f.engine.refreshSnapshot();
  f.engine.deviceOptions = f.devices;
  assert.equal(f.engine.schedule(f.engine.device('T'), 'T').zone, 'UTC');
  delete f.devices[0].scheduleTimeZone;
  f.dashboard.update('T', 'Thermostat', { schedule_time_zone: 'bad/zone' }, 'A');
  f.rules({ temperature: [temperatureRule] });
  await f.engine.tick();
  assert.equal(f.commands.length, 0);
  assert.match(f.rule('rooms').reason, /time zone/);
  f.dashboard.update('T', 'Thermostat', { schedule_time_zone: null, schedule_time_zone_source: null }, 'A');
  await f.engine.tick();
  assert.equal(f.commands.length, 0);
});

test('a reported time-zone change starts fresh heating evidence without writing a manual override', async (t) => {
  const f = await fixture(t, { temperature: [{ ...temperatureRule, enabled: false }] });
  f.devices.push({ serialNumber: 'T', heatingType: 'radiators', heatingResponseEnabled: true });
  f.dashboard.update('T', 'Thermostat', { schedule_time_zone: 'America/Los_Angeles' }, 'A');
  await f.engine.tick();
  const first = f.engine.heatingResponse.records.get('rooms');
  f.advance(minute);
  f.dashboard.update('T', 'Thermostat', { schedule_time_zone: 'America/New_York' }, 'A');
  assert.equal((await f.engine.heatingRecommendations()).rules[0].evidence.since, null);
  await f.engine.tick();
  const second = f.engine.heatingResponse.records.get('rooms');
  assert.notEqual(first.signature, second.signature);
  assert.ok(second.since > first.since);
  assert.equal(second.samples.length, 1);
  assert.equal(f.devices[0].scheduleTimeZone, undefined);
  assert.equal(f.commands.length, 0);
});

test('enabled-rule validation rejects conflicting owners and incomplete rules but preserves disabled drafts', () => {
  assert.equal(validateRuleDrafts({ temperature: [{ id: 'draft', name: 'Draft', kind: 'temperature' }] }).temperature[0].enabled, false);
  assert.throws(() => validateRuleDrafts({ temperature: [temperatureRule, { ...temperatureRule, id: 'second' }] }), /different priorities/);
  assert.throws(() => validateRuleDrafts({ fans: [fanRule, { ...fanRule, id: 'second' }] }), /different priorities/);
  assert.throws(() => validateRuleDrafts({ temperature: [{ ...temperatureRule, aggregation: 'single' }] }), /exactly one/);
  assert.throws(() => validateRuleDrafts({ temperature: [{ ...temperatureRule, desiredTemperature: 5 }] }), /9 and 32/);
  assert.throws(() => validateRuleDrafts({ fans: [{ ...fanRule, targetIds: [] }] }), /at least one/);
});

test('local observation reads disabled-rule sensors without commands and discards unavailable input', async (t) => {
  const f = await fixture(t, { temperature: [{ ...temperatureRule, enabled: false }] });
  f.devices.push({ serialNumber: 'T', heatingType: 'radiantFloor', heatingResponseEnabled: true });
  await f.engine.tick();
  let view = await f.engine.heatingRecommendations();
  assert.equal(view.rules[0].collecting, true);
  assert.equal(f.commands.length, 0);
  assert.equal(f.engine.heatingResponse.records.get('rooms').samples.length, 1);
  f.source('room').available = false;
  f.advance(minute);
  await f.engine.tick();
  view = await f.engine.heatingRecommendations();
  assert.match(view.rules[0].status, /fresh temperatures/);
  assert.equal(f.commands.length, 0);
  f.source('room').available = true;
  f.advance(minute);
  f.engine.heatingResponse.file = path.join(f.directory, 'missing', 'response.json');
  await f.engine.tick();
  await f.engine.heatingResponse.persist(true);
  assert.match((await f.engine.heatingRecommendations()).error, /could not be saved/);
  assert.equal(f.engine.snapshot().error, null);
  f.devices[0].heatingResponseEnabled = false;
  await f.engine.tick();
  assert.equal(f.engine.heatingResponse.records.size, 0);
});

const speedRule = {
  ...fanRule, action: 'temperature-speed', desiredTemperature: (72 - 32) / 1.8,
  startGap: 2 / 1.8, stopGap: 0.5 / 1.8, fullSpeedGap: 6 / 1.8, minimumSpeed: 25, maximumSpeed: 75,
};
const fahrenheitRoom = (f, value) => {
  f.source('room').temperature = (value - 32) / 1.8;
};
async function startSpeedFan(f, temperature = 74) {
  fahrenheitRoom(f, temperature);
  await f.engine.tick(); // Stage speed while off.
  await f.engine.tick(); // Confirm speed, then turn on.
  await f.engine.tick(); // Confirm power.
}

test('speed fan starts at 74F, ramps to 50% at 76F, caps at 75%, holds through 73F and stops at 72.5F', async (t) => {
  const f = await fixture(t, { fans: [speedRule] });
  fahrenheitRoom(f, 73);
  await f.engine.tick();
  assert.equal(f.fanCommands.length + f.fanSpeedCommands.length, 0);
  fahrenheitRoom(f, 74);
  await f.engine.tick();
  assert.deepEqual(f.fanSpeedCommands, [{ id: 'fan', speed: 25 }]);
  assert.equal(f.fanCommands.length, 0, 'Power waits for confirmed speed');
  await f.engine.tick();
  assert.deepEqual(f.fanCommands, [{ id: 'fan', running: true }]);
  await f.engine.tick();
  fahrenheitRoom(f, 76);
  f.advance(59000);
  await f.engine.tick();
  assert.equal(f.fanSpeedCommands.length, 1);
  f.advance(1000);
  await f.engine.tick();
  assert.equal(f.fanSpeedCommands.at(-1).speed, 50);
  await f.engine.tick();
  f.advance(minute);
  fahrenheitRoom(f, 76.1);
  await f.engine.tick();
  assert.equal(f.fanSpeedCommands.length, 2, 'Tiny changes are ignored');
  fahrenheitRoom(f, 90);
  await f.engine.tick();
  assert.equal(f.fanSpeedCommands.at(-1).speed, 75);
  await f.engine.tick();
  f.advance(minute);
  fahrenheitRoom(f, 73);
  await f.engine.tick();
  assert.equal(f.fanSpeedCommands.at(-1).speed, 25);
  await f.engine.tick();
  fahrenheitRoom(f, 72.5);
  await f.engine.tick();
  assert.equal(f.fanCommands.at(-1).running, false);
  await f.engine.tick();
  assert.equal(f.engine.leases.size, 0);
  assert.equal(f.rule('fans').paused, false);
});

test('speed writes that also start a fan need no redundant power command', async (t) => {
  const f = await fixture(t, { fans: [speedRule] });
  const write = f.access.setFanSpeed;
  f.access.setFanSpeed = async (...args) => {
    await write(...args);
    f.source('fan').running = true;
  };
  await startSpeedFan(f);
  assert.equal(f.fanSpeedCommands.length, 1);
  assert.equal(f.fanCommands.length, 0);
  assert.equal(f.rule('fans').paused, false);
});

test('manual speed and power changes pause speed rules without undoing user intent', async (t) => {
  for (const change of [{ speed: 60 }, { running: false }]) {
    const f = await fixture(t, { fans: [speedRule] });
    await startSpeedFan(f);
    Object.assign(f.source('fan'), change);
    await f.engine.tick();
    await f.engine.tick();
    assert.equal(f.rule('fans').paused, true);
    assert.equal(f.fanSpeedCommands.length, 1);
    assert.equal(f.fanCommands.length, 1);
    assert.equal(f.engine.leases.size, 0);
    await f.engine.control({ id: 'fans', action: 'resume' });
    assert.equal(f.rule('fans').paused, false);
  }
});

test('speed control restores a previously running fan within the cap after pause or loss of temperature input', async (t) => {
  for (const baseline of [60, 100]) {
    const f = await fixture(t, {});
    f.source('fan').running = true;
    f.source('fan').speed = baseline;
    f.rules({ fans: [speedRule] });
    fahrenheitRoom(f, 74);
    await f.engine.tick();
    await f.engine.tick();
    assert.equal(f.source('fan').speed, 25);
    if (baseline === 60) {
      await f.engine.control({ id: 'fans', action: 'pause' });
    } else {
      f.source('room').available = false;
      await f.engine.tick();
    }
    assert.equal(f.fanSpeedCommands.at(-1).speed, Math.min(baseline, 75));
    await f.engine.tick();
    assert.equal(f.source('fan').running, true);
    assert.equal(f.fanCommands.length, 0);
    assert.equal(f.engine.leases.size, 0);
  }
});

test('lower caps take priority over the interval and unsupported cap restoration stops only an owned fan', async (t) => {
  const f = await fixture(t, { fans: [speedRule] });
  await startSpeedFan(f, 90);
  f.rules({ fans: [{ ...speedRule, maximumSpeed: 50 }] });
  await f.engine.tick();
  assert.equal(f.source('fan').speed, 50);
  f.source('fan').speedCapabilities = speedCapabilities({ perms: ['pr', 'pw'], minStep: 25 });
  f.rules({ fans: [{ ...speedRule, minimumSpeed: 1, maximumSpeed: 20 }] });
  await f.engine.tick();
  assert.equal(f.source('fan').running, false);
  assert.ok(f.fanSpeedCommands.every((command) => command.speed <= 75));
});

test('missing speed feedback or unsupported fans never fall back to unrestricted on/off commands', async (t) => {
  for (const change of [{ canSetSpeed: false }, { speedAvailable: false }, { speed: null }, { available: false }, { stale: true }]) {
    const f = await fixture(t, { fans: [speedRule] });
    Object.assign(f.source('fan'), change);
    fahrenheitRoom(f, 90);
    await f.engine.tick();
    assert.equal(f.fanCommands.length + f.fanSpeedCommands.length, 0);
    assert.equal(f.rule('fans').phase, 'waiting');
  }
});

test('unconfirmed speed writes time out without turning on or retrying the fan', async (t) => {
  const f = await fixture(t, { fans: [speedRule] });
  f.noAck();
  fahrenheitRoom(f, 78);
  await f.engine.tick();
  f.advance(minute);
  await f.engine.tick();
  assert.equal(f.rule('fans').phase, 'waiting');
  f.advance(minute);
  await f.engine.tick();
  await f.engine.tick();
  assert.equal(f.rule('fans').paused, true);
  assert.equal(f.fanSpeedCommands.length, 1);
  assert.equal(f.fanCommands.length, 0);
});

test('a failed speed command pauses, and a manual change before ownership is respected', async (t) => {
  const f = await fixture(t, { fans: [speedRule] });
  f.fail();
  fahrenheitRoom(f, 78);
  await f.engine.tick();
  assert.equal(f.rule('fans').paused, true);
  assert.equal(f.fanCommands.length, 0);
  const g = await fixture(t, { fans: [speedRule] });
  g.source('fan').speed = 60;
  await g.engine.tick();
  assert.equal(g.rule('fans').paused, true);
  assert.equal(g.fanSpeedCommands.length, 0);
});

test('disconnected owned speed fans restore on reconnection and active rules survive restart', async (t) => {
  const f = await fixture(t, { fans: [speedRule] });
  await startSpeedFan(f);
  f.source('fan').available = false;
  await f.engine.control({ id: 'fans', action: 'pause' });
  assert.equal(f.engine.snapshot().pendingRestorations, 1);
  f.source('fan').available = true;
  await f.engine.tick();
  await f.engine.tick();
  assert.equal(f.source('fan').running, false);
  await f.engine.control({ id: 'fans', action: 'resume' });
  f.advance(minute);
  await f.engine.tick();
  await f.engine.tick();
  const restarted = new ClimateAutomation({ directory: f.directory, dashboard: f.dashboard, config: f.config,
    accessFactory: () => f.access, now: f.now });
  await restarted.start({ schedule: false });
  assert.equal(restarted.snapshot().rules[0].paused, false);
  assert.equal(restarted.recoveryRequired, undefined);
  await restarted.stop();
});

test('changing between speed and on/off modes releases old ownership before a different controller can write', async (t) => {
  const f = await fixture(t, { fans: [speedRule] });
  await startSpeedFan(f);
  f.rules({ fans: [{ ...fanRule, threshold: 30 }] });
  await f.engine.tick();
  await f.engine.tick();
  assert.equal(f.source('fan').running, false);
  assert.equal(f.engine.leases.size, 0);
  assert.equal(f.rule('fans').paused, false);
});

test('an owned previously running fan stops when no restoration speed fits a reduced cap', async (t) => {
  const f = await fixture(t, {});
  f.source('fan').running = true;
  f.source('fan').speed = 75;
  f.source('fan').speedCapabilities = speedCapabilities({ perms: ['pr', 'pw'], minStep: 25 });
  f.rules({ fans: [speedRule] });
  fahrenheitRoom(f, 74);
  await f.engine.tick();
  await f.engine.tick();
  f.rules({ fans: [{ ...speedRule, minimumSpeed: 1, maximumSpeed: 20 }] });
  await f.engine.tick();
  assert.equal(f.source('fan').running, false);
  await f.engine.tick();
  assert.equal(f.engine.leases.size, 0);
});

test('a speed conflict on one fan retains restoration ownership for other fans in the rule', async (t) => {
  const f = await fixture(t, {});
  f.external.push({ ...f.source('fan'), id: 'fan-2' });
  const original = f.access.setFanSpeed;
  f.access.setFanSpeed = async (...args) => {
    if (args[0] === 'fan-2') {
      const error = new Error('Manual change before write');
      error.code = 'CLIMATE_CONFLICT';
      throw error;
    }
    await original(...args);
    f.source('fan').running = true;
  };
  f.rules({ fans: [{ ...speedRule, targetIds: ['fan', 'fan-2'] }] });
  fahrenheitRoom(f, 74);
  await f.engine.tick();
  assert.equal(f.rule('fans').paused, true);
  assert.equal(f.engine.leases.size, 1);
  assert.equal(f.source('fan').running, true);
  await f.engine.tick();
  assert.equal(f.source('fan').running, false);
  await f.engine.tick();
  assert.equal(f.engine.leases.size, 0);
  assert.equal(f.source('fan-2').running, false);
  assert.equal(f.source('fan-2').speed, 100);
});

const fixedRule = { ...fanRule, speedMode: 'fixed', fixedSpeed: 50, priority: 20 };
const hvac = (f, state) => f.dashboard.update('T', 'Thermostat', { hvac_state: state }, 'A');
async function settleFan(f) {
  await f.engine.tick();
  await f.engine.tick();
  await f.engine.tick();
}

test('fixed speeds work for every trigger and respect supported steps below the setting', async (t) => {
  for (const action of ['temperature', 'heating', 'cooling']) {
    const f = await fixture(t, {});
    f.source('fan').speedCapabilities = speedCapabilities({ perms: ['pr', 'pw'], minStep: 25 });
    f.source('room').temperature = 26;
    hvac(f, action);
    f.rules({ fans: [{ ...fixedRule, action, thermostatId: 'T', fixedSpeed: 70 }] });
    await settleFan(f);
    assert.deepEqual(f.fanSpeedCommands, [{ id: 'fan', speed: 50 }]);
    assert.deepEqual(f.fanCommands, [{ id: 'fan', running: true }]);
    assert.equal(f.commands.length, 0, 'Fan triggers never send thermostat commands');
    f.source('room').temperature = 20;
    hvac(f, 'off');
    await settleFan(f);
    assert.equal(f.source('fan').running, false);
  }
});

test('priority handoffs keep a single original baseline and avoid off/on cycling', async (t) => {
  const f = await fixture(t, {});
  const heat = { ...fixedRule, id: 'heat', action: 'heating', thermostatId: 'T', fixedSpeed: 25, priority: 30 };
  const cool = { ...heat, id: 'cool', action: 'cooling', fixedSpeed: 75, priority: 60 };
  const warm = { ...speedRule, id: 'warm', priority: 90 };
  f.source('fan').running = true;
  f.source('fan').speed = 60;
  f.rules({ fans: [heat, cool, warm] });
  fahrenheitRoom(f, 70);
  hvac(f, 'heating');
  await settleFan(f);
  assert.equal(f.source('fan').speed, 25);
  assert.equal(f.engine.leases.get('fan:fan').baseline.speed, 60);
  f.advance(minute);
  hvac(f, 'cooling');
  await settleFan(f);
  assert.equal(f.source('fan').speed, 75);
  assert.equal(f.engine.leases.get('fan:fan').owner, 'cool');
  fahrenheitRoom(f, 76);
  await f.engine.tick();
  assert.equal(f.source('fan').speed, 75, 'A handoff retains the per-fan cooldown');
  assert.equal(f.engine.leases.get('fan:fan').owner, 'warm');
  f.advance(minute);
  await settleFan(f);
  assert.equal(f.source('fan').speed, 50);
  fahrenheitRoom(f, 70);
  f.advance(minute);
  await settleFan(f);
  assert.equal(f.source('fan').speed, 75);
  hvac(f, 'off');
  await settleFan(f);
  assert.equal(f.source('fan').speed, 60, 'Restore the original state within the final controller cap');
  assert.equal(f.engine.leases.size, 0);
  assert.equal(f.fanCommands.length, 0);
});

test('speed-mode edits transfer ownership and last-setting mode issues no speed adjustment', async (t) => {
  const f = await fixture(t, { fans: [fanRule] });
  f.source('room').temperature = 26;
  await settleFan(f);
  assert.equal(f.engine.leases.get('fan:fan').mode, undefined);
  f.rules({ fans: [fixedRule] });
  await settleFan(f);
  assert.equal(f.engine.leases.get('fan:fan').mode, 'speed');
  assert.equal(f.source('fan').speed, 50, 'Lower cap applies immediately');
  assert.equal(f.engine.leases.get('fan:fan').baseline.running, false);
  f.rules({ fans: [fanRule] });
  f.advance(minute);
  await settleFan(f);
  assert.equal(f.fanSpeedCommands.length, 1);
  assert.equal(f.fanCommands.length, 1);
  f.source('room').temperature = 20;
  await settleFan(f);
  assert.equal(f.source('fan').running, false);
  assert.equal(f.engine.leases.size, 0);
});

test('per-fan priority winners and manual overrides leave other fans running', async (t) => {
  const f = await fixture(t, {});
  f.external.push({ ...f.source('fan'), id: 'fan-2' });
  f.source('room').temperature = 26;
  const low = { ...fixedRule, id: 'low', targetIds: ['fan', 'fan-2'], fixedSpeed: 25 };
  const high = { ...fixedRule, id: 'high', priority: 90, fixedSpeed: 75 };
  f.rules({ fans: [low, high] });
  await settleFan(f);
  assert.equal(f.source('fan').speed, 75);
  assert.equal(f.source('fan-2').speed, 25);
  assert.equal(f.engine.leases.get('fan:fan-2').owner, 'low');
  f.source('fan').speed = 60;
  await settleFan(f);
  assert.equal(f.rule('high').paused, true);
  assert.equal(f.rule('low').paused, false);
  assert.deepEqual(f.rule('low').fanOverrides, ['fan']);
  assert.equal(f.source('fan-2').running, true);
  assert.equal(f.engine.leases.has('fan:fan'), false);
  assert.equal(f.source('fan').speed, 60);
  await f.engine.control({ id: 'high', action: 'resume' });
  f.advance(minute);
  await settleFan(f);
  assert.equal(f.source('fan').speed, 75);
  assert.equal(f.engine.fanOverrides.size, 0);
});

test('unknown higher-priority inputs reserve the fan and recovery resumes the selected rule', async (t) => {
  const f = await fixture(t, {});
  const low = { ...fixedRule, id: 'low', action: 'cooling', thermostatId: 'T', fixedSpeed: 25 };
  const high = { ...speedRule, id: 'high', priority: 90 };
  f.rules({ fans: [low, high] });
  hvac(f, 'cooling');
  fahrenheitRoom(f, 70);
  await settleFan(f);
  assert.equal(f.source('fan').running, true);
  f.source('room').available = false;
  await settleFan(f);
  assert.equal(f.source('fan').running, false);
  assert.equal(f.engine.fanWinners.get('fan'), 'high');
  assert.equal(f.rule('high').phase, 'waiting');
  f.source('room').available = true;
  f.advance(minute);
  fahrenheitRoom(f, 76);
  await settleFan(f);
  assert.equal(f.source('fan').running, true);
  assert.equal(f.source('fan').speed, 50);
  assert.equal(f.engine.leases.get('fan:fan').owner, 'high');
});

test('paused, disabled or deleted winning rules yield to the next match without toggling power', async (t) => {
  for (const action of ['pause', 'disable', 'delete']) {
    const f = await fixture(t, {});
    const high = { ...fixedRule, id: 'high', priority: 90, fixedSpeed: 75 };
    f.rules({ fans: [fixedRule, high] });
    f.source('room').temperature = 26;
    await settleFan(f);
    if (action === 'pause') {
      await f.engine.control({ id: 'high', action: 'pause' });
    } else {
      f.rules({ fans: action === 'delete' ? [fixedRule] : [fixedRule, { ...high, enabled: false }] });
    }
    await settleFan(f);
    assert.equal(f.engine.leases.get('fan:fan').owner, 'fans');
    assert.equal(f.source('fan').speed, 50);
    assert.deepEqual(f.fanCommands, [{ id: 'fan', running: true }]);
  }
});

test('pending speed or power feedback delays a priority handoff without retrying writes', async (t) => {
  for (const speedMode of ['last', 'fixed']) {
    const f = await fixture(t, { fans: [{ ...fixedRule, speedMode }] });
    f.noAck();
    f.source('room').temperature = 26;
    await f.engine.tick();
    const high = { ...fixedRule, id: 'high', priority: 90, fixedSpeed: 75 };
    f.rules({ fans: [{ ...fixedRule, speedMode }, high] });
    await f.engine.tick();
    assert.equal(f.engine.leases.get('fan:fan').owner, 'fans');
    assert.equal(f.fanCommands.length + f.fanSpeedCommands.length, 1);
    if (speedMode === 'fixed') {
      f.source('fan').speed = 50;
    } else {
      f.source('fan').running = true;
    }
    await f.engine.tick();
    assert.equal(f.engine.leases.get('fan:fan').owner, 'high');
    assert.equal(f.engine.fanOverrides.size, 0);
  }
});

test('unsupported higher-priority speed control cannot fall through to an on/off rule', async (t) => {
  const f = await fixture(t, { fans: [fanRule] });
  f.source('room').temperature = 26;
  await settleFan(f);
  f.source('fan').canSetSpeed = false;
  const high = { ...fixedRule, id: 'high', priority: 90 };
  f.rules({ fans: [fanRule, high] });
  await settleFan(f);
  assert.equal(f.source('fan').running, false);
  assert.equal(f.rule('high').phase, 'waiting');
  assert.equal(f.fanSpeedCommands.length, 0);
  assert.deepEqual(f.fanCommands.map((command) => command.running), [true, false]);
});

test('manual speed changes in last-setting mode block all rules and survive restart', async (t) => {
  const f = await fixture(t, { fans: [fanRule] });
  f.source('room').temperature = 26;
  await settleFan(f);
  f.source('fan').speed = 45;
  await settleFan(f);
  assert.equal(f.engine.fanOverrides.has('fan'), true);
  f.rules({ fans: [fanRule, { ...fixedRule, id: 'high', priority: 90 }] });
  await settleFan(f);
  assert.equal(f.source('fan').speed, 45);
  const restarted = new ClimateAutomation({ directory: f.directory, dashboard: f.dashboard, config: f.config,
    accessFactory: () => f.access, now: f.now });
  await restarted.start({ schedule: false });
  assert.equal(restarted.fanOverrides.has('fan'), true);
  assert.equal(f.fanSpeedCommands.length, 0);
  await restarted.stop();
  f.rules({ fans: [] });
  await settleFan(f);
  assert.equal(f.engine.fanOverrides.size, 0);
  assert.equal(f.engine.fanObservations.size, 0);
});


test('HomeKit room view is opt-in per thermostat and uses fresh group values without replacing Nest data', async (t) => {
  const f = await fixture(t);
  await f.engine.tick();
  assert.equal(f.engine.homeKitRoom('T'), null);
  f.devices.push({ serialNumber: 'OTHER', homeKitRoomTemperature: true });
  assert.equal(f.engine.homeKitRoom('T'), null);
  f.devices.push({ serialNumber: 't', homeKitRoomTemperature: true });
  assert.deepEqual(f.engine.homeKitRoom('T'), { ruleId: 'rooms', temperature: 20, desiredTemperature: 21 });
  assert.equal(f.dashboard.devices.get('T').data.target_temperature_low, 22.5);
  f.external[0].temperature = 22;
  await f.engine.tick();
  assert.equal(f.engine.homeKitRoom('T').temperature, 21);
  f.advance(91000);
  assert.equal(f.engine.homeKitRoom('T'), null, 'expired source readings cannot be displayed as a live group');
  await f.engine.tick();
  assert.ok(f.engine.homeKitRoom('T'));
  f.accounts[0].observing = false;
  assert.equal(f.engine.homeKitRoom('T'), null);
});

test('HomeKit desired-target edits stay absolute even with manual pause enabled and retain the write interval', async (t) => {
  const f = await fixture(t, { temperature: [{ ...temperatureRule, manualTargetBehavior: 'pause' }] });
  f.devices.push({ serialNumber: 'T', homeKitRoomTemperature: true });
  await f.engine.tick();
  const writes = f.commands.length;
  let updates = 0;
  f.engine.onState = () => updates++;
  await f.engine.setHomeKitRoomTarget('thermostat', { ruleId: 'rooms', value: 22 });
  await f.engine.setHomeKitRoomTarget('thermostat', { ruleId: 'rooms', value: 23 });
  assert.equal(f.rule('rooms').desiredTemperature, 23);
  assert.equal(f.rule('rooms').savedDesiredTemperature, 21);
  assert.equal(f.rule('rooms').paused, false);
  assert.equal(f.commands.length, writes, 'manual room edits do not bypass the heating interval');
  assert.equal(f.engine.homeKitRoom('T').desiredTemperature, 23);
  assert.equal(updates, 2);
  f.advance(5 * minute);
  await f.engine.tick();
  assert.equal(f.commands.at(-1).target_temperature_low, 24.5, 'the next bounded Nest target compensates for the group');
  await f.engine.tick();
  assert.equal(f.rule('rooms').desiredTemperature, 23, 'compensation feedback is not another user edit');
  f.dashboard.update('T', 'Thermostat', { target_temperature_low: 25 }, 'A');
  assert.equal(f.engine.homeKitRoom('T'), null, 'unprocessed physical changes cannot expose an obsolete room target');
  await f.engine.tick();
  assert.equal(f.rule('rooms').paused, true, 'physical Nest changes still honor pause');
  assert.equal(f.engine.homeKitRoom('T'), null);
});

test('HomeKit room edits preserve pending compensation acknowledgement and do not write a direct Nest target', async (t) => {
  const f = await fixture(t);
  f.devices.push({ serialNumber: 'T', homeKitRoomTemperature: true });
  assert.equal(f.engine.leases.get('temperature:T').pending, true);
  await f.engine.setHomeKitRoomTarget('thermostat', { ruleId: 'rooms', value: 20 });
  assert.equal(f.rule('rooms').desiredTemperature, 20);
  assert.equal(f.rule('rooms').paused, false);
  assert.equal(f.engine.leases.get('temperature:T').pending, false);
  assert.equal(f.commands.length, 1);
  assert.equal(f.dashboard.devices.get('T').data.target_temperature_low, 22.5);
});

test('HomeKit room writes reject disabled settings, wrong ownership, invalid targets and paused rules', async (t) => {
  const f = await fixture(t);
  const request = { ruleId: 'rooms', value: 22 };
  await assert.rejects(f.engine.setHomeKitRoomTarget('thermostat', request));
  f.devices.push({ serialNumber: 'T', homeKitRoomTemperature: true });
  for (const [id, payload] of [
    ['wrong', request], ['thermostat', { ...request, ruleId: 'missing' }],
    ['thermostat', { ...request, value: 33 }], ['thermostat', { ...request, value: '22' }],
    ['thermostat', { ...request, unexpected: true }], ['thermostat', null],
  ]) {
    await assert.rejects(f.engine.setHomeKitRoomTarget(id, payload));
  }
  assert.equal(f.rule('rooms').desiredTemperature, 21);
  await f.engine.control({ id: 'rooms', action: 'pause' });
  assert.equal(f.engine.homeKitRoom('T'), null);
  await assert.rejects(f.engine.setHomeKitRoomTarget('thermostat', request));
});

test('HomeKit room writes reject changed configuration and unavailable physical modes before any target write', async (t) => {
  const f = await fixture(t);
  f.devices.push({ serialNumber: 'T', homeKitRoomTemperature: true });
  await f.engine.tick();
  f.rules({ temperature: [{ ...temperatureRule, desiredTemperature: 24 }] });
  await assert.rejects(f.engine.setHomeKitRoomTarget('thermostat', { ruleId: 'rooms', value: 22 }));
  f.rules({ temperature: [temperatureRule] });
  for (const change of [{ eco_mode: true }, { hvac_mode: 'cool' }, { temperature_lock: true }, { online: false }]) {
    const data = { ...f.dashboard.devices.get('T').data };
    f.dashboard.update('T', 'Thermostat', change, 'A');
    assert.equal(f.engine.homeKitRoom('T'), null);
    await assert.rejects(f.engine.setHomeKitRoomTarget('thermostat', { ruleId: 'rooms', value: 22 }));
    f.dashboard.update('T', 'Thermostat', data, 'A');
  }
  assert.equal(f.commands.length, 1);
});

test('failed storage of a HomeKit desired target rejects the edit and pauses without a cloud command', async (t) => {
  const f = await fixture(t);
  f.devices.push({ serialNumber: 'T', homeKitRoomTemperature: true });
  await f.engine.tick();
  const persist = f.engine.persist;
  f.engine.persist = async () => {
    throw new Error('Fixture disk unavailable');
  };
  await assert.rejects(f.engine.setHomeKitRoomTarget('thermostat', { ruleId: 'rooms', value: 22 }), /disk unavailable/);
  f.engine.persist = persist;
  assert.equal(f.rule('rooms').desiredTemperature, 21);
  assert.equal(f.rule('rooms').paused, true);
  assert.equal(f.engine.homeKitRoom('T'), null);
  assert.equal(f.commands.length, 1);
});

async function restartFixture(f) {
  const engine = new ClimateAutomation({ directory: f.directory, dashboard: f.dashboard, config: f.config,
    accessFactory: () => f.access, now: f.now });
  await engine.start({ schedule: false });
  return engine;
}

test('restart keeps desired room target across shutdown restoration and respects update interval', async (t) => {
  const f = await fixture(t);
  await f.engine.tick();
  f.engine.applyRoomTarget(f.engine.states.get('rooms'), 22, 'manual', 22.5);
  await f.engine.tick();
  await f.engine.stop();
  const count = f.commands.length;
  const restarted = await restartFixture(f);
  const rule = restarted.snapshot().rules[0];
  assert.equal(rule.paused, false);
  assert.equal(rule.desiredTemperature, 22);
  assert.equal(f.commands.length, count);
  assert.equal(rule.temperatureControl, 'interval');
  f.advance(5 * minute);
  await restarted.tick();
  assert.equal(restarted.snapshot().rules[0].desiredTemperature, 22);
  assert.equal(f.commands.length, count + 1);
  await restarted.stop();
});

test('restart preserves intentional pauses and offers an opt-in restart pause policy', async (t) => {
  for (const explicit of [true, false]) {
    const f = await fixture(t);
    if (explicit) {
      await f.engine.control({ id: 'rooms', action: 'pause' });
    } else {
      f.options.pauseOnRestart = true;
    }
    await f.engine.stop();
    const restarted = await restartFixture(f);
    assert.equal(restarted.snapshot().rules[0].paused, true);
    assert.match(restarted.snapshot().rules[0].reason, explicit ? /Paused by you/ : /Pause after bridge restart/);
    await restarted.stop();
  }
});

test('restart waits for sources and connection before continuing without a Resume command', async (t) => {
  const f = await fixture(t);
  await f.engine.tick();
  await f.engine.persist();
  f.source('room').available = false;
  f.dashboard.invalidate('A');
  const count = f.commands.length;
  const restarted = await restartFixture(f);
  assert.equal(restarted.snapshot().rules[0].paused, false);
  assert.equal(restarted.snapshot().rules[0].temperatureControl, 'waiting');
  assert.equal(f.commands.length, count);
  f.dashboard.update('T', 'Thermostat', { online: true, hvac_state: 'off' }, 'A');
  await restarted.tick();
  assert.equal(f.commands.length, count);
  f.source('room').available = true;
  f.dashboard.update('S', 'TemperatureSensor', { online: true, current_temperature: 20 }, 'A');
  await restarted.tick();
  assert.equal(restarted.snapshot().rules[0].temperatureControl, 'active', JSON.stringify(restarted.snapshot().rules[0]));
  await restarted.stop();
});

test('manual Nest changes during downtime keep the configured follow or pause policy', async (t) => {
  for (const behavior of ['follow', 'pause']) {
    const f = await fixture(t, { temperature: [{ ...temperatureRule, manualTargetBehavior: behavior }] });
    await f.engine.tick();
    await f.engine.persist();
    f.dashboard.update('T', 'Thermostat', { target_temperature_low: 23.5 }, 'A');
    const restarted = await restartFixture(f);
    assert.equal(restarted.snapshot().rules[0].paused, behavior === 'pause');
    assert.equal(restarted.snapshot().rules[0].desiredTemperature, behavior === 'pause' ? 21 : 22);
    await restarted.stop();
  }
});

test('restart does not hide a manual fan change made while the bridge was stopped', async (t) => {
  const f = await fixture(t, { fans: [fanRule] });
  await f.engine.persist();
  f.source('fan').running = true;
  const restarted = await restartFixture(f);
  assert.equal(restarted.snapshot().rules[0].paused, true);
  assert.equal(f.fanCommands.length, 0);
  await restarted.stop();
});

test('a thermostat plus non-Nest room sensors runs when backplate is confirmed but scheduling metadata is omitted', async (t) => {
  const f = await fixture(t, {});
  f.dashboard.update('T', 'Thermostat', { native_sensor_control: sensorControlState({
    activeRcsSelection: { rcsSourceType: 'RCS_SOURCE_TYPE_BACKPLATE' },
  }) }, 'A');
  f.rules({ temperature: [{ ...temperatureRule, sourceIds: ['nest:thermostat', 'room'] }] });
  await f.engine.tick();
  assert.equal(f.rule('rooms').paused, false);
  assert.equal(f.rule('rooms').temperatureControl, 'updating');
  assert.equal(f.commands.length, 1);
  await f.engine.tick();
  assert.equal(f.rule('rooms').temperatureControl, 'active');
  f.dashboard.update('T', 'Thermostat', { active_rcs_sensor: 'S' }, 'A');
  await f.engine.tick();
  assert.equal(f.rule('rooms').paused, true);
});

test('unconfirmed commands across restart never trigger a blind retry', async (t) => {
  const f = await fixture(t, {});
  f.noAck();
  f.rules({ temperature: [temperatureRule] });
  await f.engine.tick();
  const count = f.commands.length;
  f.advance(3 * minute);
  const restarted = await restartFixture(f);
  assert.equal(restarted.snapshot().rules[0].paused, true);
  assert.equal(f.commands.length, count);
  await restarted.stop();
});

test('changed native modes during downtime remain a reason to pause', async (t) => {
  const f = await fixture(t);
  await f.engine.tick();
  await f.engine.persist();
  f.dashboard.update('T', 'Thermostat', { eco_mode: true }, 'A');
  const count = f.commands.length;
  const restarted = await restartFixture(f);
  assert.equal(restarted.snapshot().rules[0].paused, true);
  assert.equal(f.commands.length, count);
  await restarted.stop();
});

test('restart status names only the feedback still missing', async (t) => {
  const f = await fixture(t);
  await f.engine.tick();
  await f.engine.persist();
  f.dashboard.devices.get('T').data.eco_mode = undefined;
  const restarted = await restartFixture(f);
  assert.equal(restarted.snapshot().rules[0].reason, 'Waiting for Nest to report whether Eco is off.');
  assert.equal(restarted.snapshot().rules[0].paused, false);
  f.dashboard.update('T', 'Thermostat', { eco_mode: false }, 'A');
  await restarted.tick();
  assert.equal(restarted.snapshot().rules[0].temperatureControl, 'active');
  await restarted.stop();
});

test('web desired-target edits work with HomeKit projection off and preserve group, interval and restart target', async (t) => {
  const f = await fixture(t, { temperature: [{ ...temperatureRule, manualTargetBehavior: 'pause' }] });
  await f.engine.tick();
  assert.equal(f.engine.homeKitRoom('T'), null);
  const model = f.dashboard.snapshot().devices.find((device) => device.serial === 'T').temperatureTarget;
  assert.equal(model.source, 'room');
  assert.equal(model.fields[0].value, 21);
  const writes = f.commands.length;
  const result = await f.dashboard.setTemperatureTarget({ serial: 'T', expected: model.expected, values: { value: 23 } });
  assert.equal(result.source, 'room');
  assert.equal(f.rule('rooms').desiredTemperature, 23);
  assert.equal(f.rule('rooms').savedDesiredTemperature, 21);
  assert.equal(f.rule('rooms').paused, false);
  assert.equal(f.commands.length, writes);
  await assert.rejects(f.dashboard.setTemperatureTarget({ serial: 'T', expected: model.expected, values: { value: 24 } }), { status: 409 });
  await f.engine.stop();
  const restarted = await restartFixture(f);
  t.after(() => restarted.stop());
  assert.equal(restarted.snapshot().rules[0].desiredTemperature, 23);
  assert.equal(restarted.snapshot().rules[0].paused, false);
});

test('web editor rejects changed controllers, waits and disk failures without falling through to native control', async (t) => {
  const f = await fixture(t);
  await f.engine.tick();
  const model = f.dashboard.temperatureTarget('T');
  await f.engine.control({ id: 'rooms', action: 'pause' });
  assert.equal(f.dashboard.temperatureTarget('T').available, false, 'restoration must complete before direct control');
  await f.engine.tick();
  assert.equal(f.dashboard.temperatureTarget('T').source, 'nest');
  await assert.rejects(f.dashboard.setTemperatureTarget({ serial: 'T', expected: model.expected, values: { value: 23 } }), { status: 409 });
  await f.engine.control({ id: 'rooms', action: 'resume' });
  await f.engine.tick();
  const fresh = f.dashboard.temperatureTarget('T');
  const persist = f.engine.persist;
  f.engine.persist = async () => {
    throw new Error('Fixture disk failure');
  };
  await assert.rejects(f.dashboard.setTemperatureTarget({ serial: 'T', expected: fresh.expected, values: { value: 23 } }), /disk failure/);
  f.engine.persist = persist;
  assert.equal(f.rule('rooms').desiredTemperature, 21);
  assert.equal(f.dashboard.busy, false);
});

const windowAt = (start, end) => ({ days: [0, 1, 2, 3, 4, 5, 6], start, end, timeZone: 'UTC' });
const windowRules = () => [
  { ...temperatureRule, id: 'night', name: 'Night', priority: 2, window: windowAt('22:00', '10:05') },
  { ...temperatureRule, id: 'day', name: 'Day', priority: 1, sourceIds: ['room'], window: windowAt('10:05', '22:00') },
];

test('scheduled temperature groups hand off the original lease and manual room target without an intermediate write', async (t) => {
  const f = await fixture(t, { temperature: windowRules() });
  await f.engine.evaluate();
  assert.equal(f.rule('day').phase, 'scheduled');
  assert.equal(f.rule('day').nextWindowStart, f.now() + 5 * minute);
  await f.engine.setRoomTarget('thermostat', { ruleId: 'night', value: 22 });
  const baseline = f.engine.leases.get('temperature:T').baseline;
  const writes = f.commands.length;
  f.advance(5 * minute);
  await f.engine.evaluate();
  assert.equal(f.rule('night').phase, 'scheduled');
  assert.equal(f.rule('day').desiredTemperature, 22);
  assert.equal(f.rule('day').targetSource, 'manual');
  assert.equal(f.engine.leases.get('temperature:T').owner, 'day');
  assert.equal(f.engine.leases.get('temperature:T').baseline, baseline);
  assert.ok(f.commands.length <= writes + 1);
  assert.equal(f.commands.slice(writes).some((command) => command.target_temperature_low === baseline), false);
  await f.engine.evaluate();
  assert.equal(f.engine.roomControl('T').ruleId, 'day');
});

test('temperature priority reserves unavailable higher groups and respects intervals across handoffs', async (t) => {
  const rules = windowRules();
  rules[0].window = windowAt('10:01', '22:00');
  rules[0].minimumIntervalMinutes = 1;
  delete rules[1].window;
  rules[1].minimumIntervalMinutes = 10;
  const f = await fixture(t, { temperature: rules });
  await f.engine.evaluate();
  f.advance(minute);
  f.source('room').temperature = 23;
  await f.engine.evaluate();
  assert.equal(f.commands.length, 1, 'new shorter interval cannot bypass the previous write interval');
  assert.equal(f.rule('night').temperatureControl, 'interval');
  assert.equal(f.rule('day').phase, 'standby');
  f.source('room').stale = true;
  await f.engine.evaluate();
  assert.equal(f.rule('night').phase, 'waiting');
  assert.equal(f.rule('day').phase, 'standby');
  assert.equal(f.engine.roomControl('T'), null);
});

test('manual pause applies to all thermostat groups across boundaries and Resume clears it', async (t) => {
  const rules = windowRules(); rules[0].manualTargetBehavior = 'pause';
  const f = await fixture(t, { temperature: rules });
  await f.engine.evaluate();
  const writes = f.commands.length;
  f.dashboard.update('T', 'Thermostat', { target_temperature_low: 24 }, 'A');
  f.advance(5 * minute);
  await f.engine.evaluate();
  assert.equal(f.rule('night').paused, true);
  assert.equal(f.rule('day').paused, true);
  assert.equal(f.commands.length, writes);
  await f.engine.control({ id: 'day', action: 'resume' });
  assert.equal(f.rule('night').paused, false);
  assert.equal(f.rule('day').paused, false);
  assert.notEqual(f.rule('day').phase, 'standby');
});

test('physical target changes at a group boundary follow the outgoing desired temperature', async (t) => {
  const rules = windowRules(); rules[1].desiredTemperature = 19;
  const f = await fixture(t, { temperature: rules });
  await f.engine.evaluate();
  const before = f.dashboard.devices.get('T').data.target_temperature_low;
  f.dashboard.update('T', 'Thermostat', { target_temperature_low: before + 1 }, 'A');
  f.advance(5 * minute);
  await f.engine.evaluate();
  assert.equal(f.rule('day').desiredTemperature, 22);
  assert.equal(f.rule('day').paused, false);
  assert.equal(f.rule('day').targetSource, 'manual');
});

test('a window ending without a successor restores only owned targets and stays scheduled', async (t) => {
  const f = await fixture(t, { temperature: [windowRules()[0]] });
  await f.engine.evaluate();
  f.advance(5 * minute);
  await f.engine.evaluate();
  assert.equal(f.commands.at(-1).target_temperature_low, 19);
  await f.engine.evaluate();
  assert.equal(f.engine.leases.size, 0);
  assert.equal(f.rule('night').phase, 'scheduled');
  const writes = f.commands.length;
  f.dashboard.update('T', 'Thermostat', { target_temperature_low: 20 }, 'A');
  await f.engine.evaluate();
  assert.equal(f.commands.length, writes);
});

test('pending Nest feedback transfers across a window without a duplicate command or changed baseline', async (t) => {
  const rules = windowRules(); rules[0].enabled = false; rules[1].enabled = false;
  const f = await fixture(t, { temperature: rules });
  f.advance(4 * minute); f.noAck();
  rules.forEach((rule) => {
    rule.enabled = true;
  });
  f.rules({ temperature: rules });
  await f.engine.evaluate();
  f.advance(minute);
  await f.engine.evaluate();
  assert.equal(f.commands.length, 1);
  assert.equal(f.engine.leases.get('temperature:T').owner, 'day');
  assert.equal(f.rule('day').temperatureControl, 'updating');
  const expected = f.engine.leases.get('temperature:T').expected;
  f.dashboard.update('T', 'Thermostat', { target_temperature_low: expected }, 'A');
  await f.engine.evaluate();
  assert.equal(f.rule('day').paused, false);
});

test('restart selects the current window and retains a room override and thermostat-wide pause', async (t) => {
  const f = await fixture(t, { temperature: windowRules() });
  await f.engine.evaluate();
  await f.engine.setRoomTarget('thermostat', { ruleId: 'night', value: 22 });
  await f.engine.stop();
  f.advance(5 * minute);
  const restarted = new ClimateAutomation({ directory: f.directory, dashboard: f.dashboard, config: f.config,
    accessFactory: () => f.access, now: f.now });
  t.after(() => restarted.stop());
  await restarted.start({ schedule: false });
  assert.equal(restarted.states.get('day').roomTarget.value, 22);
  assert.equal(restarted.states.get('night').phase, 'scheduled');
  assert.equal(restarted.states.get('day').paused, false);
  await restarted.control({ id: 'day', action: 'pause' });
  assert.equal(restarted.states.get('night').paused, true);
});

test('fan windows hand off without a power cycle, restore at closing, and allow manual use outside windows', async (t) => {
  const rules = [
    { ...fanRule, id: 'evening', priority: 2, window: windowAt('09:00', '10:01') },
    { ...fanRule, id: 'morning', priority: 1, window: windowAt('10:01', '10:03') },
  ];
  const f = await fixture(t, { fans: rules });
  f.source('room').temperature = 26;
  await f.engine.evaluate(); await f.engine.evaluate();
  assert.equal(f.source('fan').running, true);
  f.advance(minute); await f.engine.evaluate();
  assert.equal(f.rule('evening').phase, 'scheduled');
  assert.equal(f.engine.leases.get('fan:fan').owner, 'morning');
  assert.deepEqual(f.fanCommands, [{ id: 'fan', running: true }]);
  f.advance(2 * minute); await f.engine.evaluate(); await f.engine.evaluate();
  assert.equal(f.source('fan').running, false);
  f.source('fan').running = true;
  await f.engine.evaluate();
  assert.equal(f.engine.fanOverrides.size, 0);
  f.advance(23 * 60 * minute);
  await f.engine.evaluate();
  assert.equal(f.engine.fanOverrides.size, 0);
});

test('a window closing while a target is being prepared does not leave a phantom pending command', async (t) => {
  const rules = windowRules();
  rules[0].window = windowAt('09:00', '10:01');
  rules[1].window = windowAt('10:01', '22:00');
  rules.forEach((rule) => {
    rule.enabled = false;
  });
  const f = await fixture(t, { temperature: rules });
  const persist = f.engine.persist.bind(f.engine);
  let crossed = false;
  f.engine.persist = async () => {
    await persist();
    if (!crossed && f.engine.leases.get('temperature:T')?.pending) {
      crossed = true;
      f.advance(minute);
    }
  };
  rules.forEach((rule) => {
    rule.enabled = true;
  });
  f.rules({ temperature: rules });
  await f.engine.evaluate();
  assert.equal(f.commands.length, 0);
  await f.engine.evaluate();
  assert.equal(f.commands.length, 1);
  assert.equal(f.rule('day').paused, false);
});

test('a confirmed native schedule target at the window boundary expires the manual group target', async (t) => {
  const f = await fixture(t, { temperature: windowRules() });
  f.devices.push({ serialNumber: 'T', scheduleTimeZone: 'UTC' });
  f.dashboard.update('T', 'Thermostat', { schedules: { 0: {
    earlier: { time: 9 * 3600, 'temp-min': 21 }, next: { time: 10 * 3600 + 5 * 60, 'temp-min': 20 },
  } } }, 'A');
  await f.engine.control({ id: 'night', action: 'resume' });
  await f.engine.evaluate();
  await f.engine.setRoomTarget('thermostat', { ruleId: 'night', value: 23 });
  f.advance(5 * minute);
  f.dashboard.update('T', 'Thermostat', { target_temperature_low: 20 }, 'A');
  await f.engine.evaluate();
  assert.equal(f.rule('day').desiredTemperature, 20);
  assert.equal(f.rule('day').targetSource, 'schedule');
  assert.equal(f.rule('day').paused, false);
});

test('fan power and speed commands cancelled at a window boundary can hand off on the next check', async (t) => {
  for (const mode of ['last', 'fixed']) {
    for (const stage of ['persist', 'guard']) {
      const rules = [
        { ...fanRule, id: 'early', priority: 2, enabled: false, speedMode: mode, fixedSpeed: 50, window: windowAt('09:00', '10:01') },
        { ...fanRule, id: 'later', priority: 1, enabled: false, speedMode: mode, fixedSpeed: 50, window: windowAt('10:01', '11:00') },
      ];
      const f = await fixture(t, { fans: rules });
      f.source('room').temperature = 26;
      let crossed = false;
      if (stage === 'persist') {
        const persist = f.engine.persist.bind(f.engine);
        f.engine.persist = async () => {
          await persist();
          if (!crossed && f.engine.leases.get('fan:fan')?.pending) {
            crossed = true;
            f.advance(minute);
          }
        };
      } else {
        const method = mode === 'last' ? 'setFan' : 'setFanSpeed';
        const send = f.access[method];
        f.access[method] = async (...args) => {
          if (!crossed) {
            crossed = true;
            f.advance(minute);
            assert.equal(args[3].guard(), false);
            const error = new Error('Window ended');
            error.code = 'CLIMATE_CONFLICT';
            throw error;
          }
          return send(...args);
        };
      }
      rules.forEach((rule) => {
        rule.enabled = true;
      });
      f.rules({ fans: rules });
      await f.engine.evaluate();
      assert.equal(f.fanCommands.length + f.fanSpeedCommands.length, 0, mode + ' ' + stage);
      assert.equal(f.engine.fanOverrides.size, 0, mode + ' ' + stage);
      await f.engine.evaluate();
      assert.equal(f.fanCommands.length + f.fanSpeedCommands.length, 1, mode + ' ' + stage);
    }
  }
});

test('a Nest command rejected by its final window guard preserves the successor instead of pausing', async (t) => {
  const rules = windowRules();
  rules[0].window = windowAt('09:00', '10:01'); rules[1].window = windowAt('10:01', '22:00');
  rules.forEach((rule) => {
    rule.enabled = false;
  });
  const f = await fixture(t, { temperature: rules });
  const send = f.dashboard.setAutomationTarget.bind(f.dashboard);
  let crossed = false;
  f.dashboard.setAutomationTarget = async (...args) => {
    if (!crossed) {
      crossed = true;
      f.advance(minute);
    }
    return send(...args);
  };
  rules.forEach((rule) => {
    rule.enabled = true;
  });
  f.rules({ temperature: rules });
  await f.engine.evaluate();
  assert.equal(f.commands.length, 0);
  await f.engine.evaluate();
  assert.equal(f.commands.length, 1);
  assert.equal(f.rule('day').paused, false);
});

test('cancelling a subsequent adjustment keeps the original restoration baseline through the handoff', async (t) => {
  const rules = windowRules();
  rules[0].window = windowAt('09:00', '10:06'); rules[1].window = windowAt('10:06', '22:00');
  const f = await fixture(t, { temperature: rules });
  await f.engine.evaluate();
  f.advance(5 * minute);
  f.source('room').temperature = 24;
  const persist = f.engine.persist.bind(f.engine);
  let crossed = false;
  f.engine.persist = async () => {
    await persist();
    if (!crossed && f.engine.leases.get('temperature:T')?.pending) {
      crossed = true;
      f.advance(minute);
    }
  };
  await f.engine.evaluate();
  assert.equal(f.commands.length, 1);
  assert.equal(f.engine.leases.get('temperature:T').baseline, 19);
  await f.engine.evaluate();
  assert.equal(f.engine.leases.get('temperature:T').owner, 'day');
  assert.equal(f.engine.leases.get('temperature:T').baseline, 19);
});


const sevenSpeedRanges = [[1, 21], [22, 35], [36, 49], [50, 64], [65, 78], [79, 92], [93, 100]]
  .map(([min, max], index) => ({ label: 'Speed ' + (index + 1), min, max }));
async function useFanMapping(f, ranges = sevenSpeedRanges) {
  const snapshot = f.config.snapshot;
  f.config.snapshot = async () => {
    const view = await snapshot();
    view.config.fanMappings = [{ sourceId: 'fan', ranges }];
    return view;
  };
}

test('mapped fixed speed accepts settled feedback, retains ownership and detects a different physical setting', async (t) => {
  const rule = { ...fanRule, speedMode: 'fixed', fixedSpeed: 75 };
  const f = await fixture(t, { fans: [rule] });
  await useFanMapping(f);
  f.source('room').temperature = 30;
  await f.engine.tick();
  assert.equal(f.fanSpeedCommands.at(-1).speed, 71);
  f.source('fan').speed = 75; // Same physical speed, different reported percentage.
  await f.engine.tick(); await f.engine.tick();
  assert.equal(f.rule('fans').phase, 'active');
  assert.equal(f.fanCommands.at(-1).running, true);
  const count = f.fanSpeedCommands.length;
  f.source('fan').speed = 78;
  f.advance(minute); await f.engine.tick();
  assert.equal(f.fanSpeedCommands.length, count);
  assert.equal(f.engine.fanOverrides.size, 0);
  const evidence = f.rule('fans').explanation.fans[0];
  assert.equal(evidence.setting, 'Speed 5');
  assert.equal(evidence.proposedSetting, 'Speed 5');
  assert.equal(evidence.mappedRange.min, 65);
  f.source('fan').speed = 86; await f.engine.tick();
  assert.equal(f.engine.fanOverrides.has('fan'), true);
  assert.equal(f.fanSpeedCommands.length, count);
});

test('mapped curves suppress same-setting writes but allow small changes to a different mapped setting', async (t) => {
  const f = await fixture(t, { fans: [speedRule] });
  await useFanMapping(f, [{ label: 'Low', min: 48, max: 49 }, { label: 'High', min: 50, max: 51 }]);
  await startSpeedFan(f, 75.92); // 49%, mapped to Low at 48%.
  assert.equal(f.fanSpeedCommands.at(-1).speed, 48);
  fahrenheitRoom(f, 76); f.advance(minute);
  await f.engine.tick();
  assert.equal(f.fanSpeedCommands.at(-1).speed, 50, 'A real setting change bypasses the unmapped five-point deadband');
  await f.engine.tick();
  assert.equal(f.rule('fans').explanation.fans[0].holdingSpeed, false);
});

test('mapped restoration, restart recovery and mapping removal preserve feedback checks', async (t) => {
  const f = await fixture(t, {});
  f.rules({ fans: [speedRule] });
  await useFanMapping(f);
  f.source('fan').running = true; f.source('fan').speed = 71;
  await startSpeedFan(f, 74);
  assert.equal(f.fanSpeedCommands.at(-1).speed, 28);
  f.source('fan').speed = 29;
  await f.engine.tick();
  await f.engine.persist();
  f.engine.leases.clear(); await f.engine.start({ schedule: false });
  await f.engine.tick();
  assert.equal(f.engine.fanOverrides.size, 0, 'Saved leases accept the same mapped feedback after restart');
  fahrenheitRoom(f, 70); f.advance(minute); await f.engine.tick();
  assert.equal(f.fanSpeedCommands.at(-1).speed, 71);
  f.source('fan').speed = 75; await f.engine.tick();
  assert.equal(f.engine.leases.size, 0);
  f.source('fan').speed = 78; await f.engine.tick();
  assert.equal(f.engine.fanOverrides.size, 0, 'Unowned observations compare mapped settings too');
  f.config.snapshot = async () => ({ config: { rules: validateRuleDrafts({ fans: [speedRule] }), devices: [], options: {} } });
  f.source('fan').speed = 71; await f.engine.tick();
  assert.equal(f.engine.fanOverrides.has('fan'), true, 'Removing mappings restores exact percentage comparisons');
});
