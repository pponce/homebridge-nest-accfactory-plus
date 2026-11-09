import test from 'node:test';
import assert from 'node:assert/strict';
import { reportedScheduleTimeZone } from '../src/schedule-time-zone.js';
import { scheduleTimeZone, validTimeZone, nextSetpoint } from '../homebridge-ui/public/climate-utils.js';
import { timeZoneChoices } from '../homebridge-ui/public/time-zone-picker.js';

const empty = { schedule_time_zone: null, schedule_time_zone_source: null };
test('reported zone uses the thermostat, then its paired home, and never an unrelated home', () => {
  const raw = {
    DEVICE_T: { value: { device_info: { pairerId: { resourceId: 'STRUCTURE_HOME' } } } },
    STRUCTURE_HOME: { value: { time_zone: { timezoneName: { value: 'America/Los_Angeles' } } } },
    STRUCTURE_OTHER: { value: { time_zone: { timezoneName: { value: 'Europe/London' } } } },
  };
  assert.deepEqual(reportedScheduleTimeZone(raw, 'DEVICE_T'), {
    schedule_time_zone: 'America/Los_Angeles', schedule_time_zone_source: 'home',
  });
  raw.DEVICE_T.value.device_timezone = { timezoneName: 'America/Phoenix' };
  assert.deepEqual(reportedScheduleTimeZone(raw, 'DEVICE_T'), {
    schedule_time_zone: 'America/Phoenix', schedule_time_zone_source: 'thermostat',
  });
  raw.DEVICE_T.value.device_timezone.timezoneName = 'bad/zone';
  assert.equal(reportedScheduleTimeZone(raw, 'DEVICE_T').schedule_time_zone_source, 'home');
  delete raw.STRUCTURE_HOME.value.time_zone;
  assert.deepEqual(reportedScheduleTimeZone(raw, 'DEVICE_T'), empty);
  assert.deepEqual(reportedScheduleTimeZone(raw, 'missing'), empty);
  assert.deepEqual(reportedScheduleTimeZone(undefined, 'missing'), empty);
  raw.DEVICE_T.value.device_timezone.timezoneName = 'UTC';
  raw.DEVICE_T.value.other_timezone = { timezoneName: { value: 'Europe/Paris' } };
  assert.deepEqual(reportedScheduleTimeZone(raw, 'DEVICE_T'), empty);
});

test('explicit choices take priority and invalid choices cannot silently fall back', () => {
  const data = { schedule_time_zone: 'America/Los_Angeles' };
  assert.equal(scheduleTimeZone(undefined, data), 'America/Los_Angeles');
  assert.equal(scheduleTimeZone({ scheduleTimeZone: null }, data), 'America/Los_Angeles');
  assert.equal(scheduleTimeZone({ scheduleTimeZone: 'Europe/London' }, data), 'Europe/London');
  assert.equal(scheduleTimeZone({ scheduleTimeZone: 'bad/zone' }, data), null);
  assert.equal(scheduleTimeZone(), null);
  for (const value of [undefined, null, 42, {}, '', '   ', '+05:00', '-0800', 'X'.repeat(101), 'Not/AZone']) {
    assert.equal(validTimeZone(value), null);
  }
  assert.equal(validTimeZone(' US/Pacific '), 'America/Los_Angeles');
});

test('named schedule zones follow seasonal offsets and keep Arizona separate from Mountain Time', () => {
  const entries = [{ day: 0, time: 7 * 3600 }, { day: 0, time: 8 * 3600 }];
  const summer = new Date('2026-07-06T13:30:00Z');
  const winter = new Date('2026-01-05T14:30:00Z');
  assert.equal(nextSetpoint(entries, 'America/Denver', summer).time, 8 * 3600);
  assert.equal(nextSetpoint(entries, 'America/Phoenix', summer).time, 7 * 3600);
  assert.equal(nextSetpoint(entries, 'America/Denver', winter).time, 8 * 3600);
  assert.equal(nextSetpoint(entries, 'America/Phoenix', winter).time, 8 * 3600);
});

test('picker provides common and other supported zones while preserving saved aliases', (t) => {
  const choices = new Map(timeZoneChoices('US/Pacific'));
  assert.match(choices.get('America/Los_Angeles'), /Pacific Time/);
  assert.match(choices.get('America/Phoenix'), /Arizona/);
  assert.equal(choices.get('US/Pacific'), 'US/Pacific');
  assert.ok(choices.has('Asia/Tokyo'));
  t.mock.method(Intl, 'supportedValuesOf', () => { throw new Error('Unavailable'); });
  assert.ok(new Map(timeZoneChoices('Asia/Tokyo')).has('Asia/Tokyo'));
});
