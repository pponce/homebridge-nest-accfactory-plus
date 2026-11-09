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
  const config = { snapshot: async () => ({ config: { rules: structuredClone(rules), devices } }) };
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
  assert.equal(f.rule('rooms').paused, true);
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
  const f = await fixture(t);
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
  assert.match(f.rule('rooms').reason, /connection unavailable/);
});

test('schedule boundaries pause a hold even when the numeric target has not changed', async (t) => {
  const f = await fixture(t, {});
  f.devices.push({ serialNumber: 'T', scheduleTimeZone: 'UTC' });
  f.dashboard.update('T', 'Thermostat', { schedules: { 0: { a: { time: 36060, 'temp-min': 22.5 } } } }, 'A');
  f.rules({ temperature: [temperatureRule] });
  await f.engine.tick();
  assert.equal(f.commands.length, 1);
  f.advance(minute);
  await f.engine.tick();
  assert.equal(f.rule('rooms').paused, true);
  assert.match(f.rule('rooms').reason, /schedule/);
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

test('restart retains presence overrides, faults unknown initial readings and pauses equipment rules', async (t) => {
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
  assert.equal(replacement.snapshot().rules.find((rule) => rule.id === 'rooms').paused, true);
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

test('missing Nest schedule time zone blocks heating and manual changes are respected even before the first write', async (t) => {
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
  assert.equal(f.rule('rooms').paused, true);
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
  assert.throws(() => validateRuleDrafts({ temperature: [temperatureRule, { ...temperatureRule, id: 'second' }] }), /one enabled/);
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

test('disconnected owned speed fans restore on reconnection, and restarted rules require Resume', async (t) => {
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
  assert.equal(restarted.snapshot().rules[0].paused, true);
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

