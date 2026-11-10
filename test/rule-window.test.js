import test from 'node:test';
import assert from 'node:assert/strict';
import { windowActive, windowError, windowSummary, ruleWindow } from '../homebridge-ui/public/rule-window.js';
import { validateRuleDrafts } from '../src/web-dashboard-config.js';

const night = { days: [0, 1, 2, 3, 4, 5, 6], start: '22:00', end: '06:00', timeZone: 'America/Los_Angeles' };
const at = (date) => Date.parse(date);
test('Always is implicit; start inclusive, end exclusive, and overnight days mean the start day', () => {
  assert.equal(windowActive(undefined), true);
  assert.equal(windowSummary(undefined), 'Always · all day, every day');
  const friday = { ...night, days: [4] };
  for (const [date, expected] of [
    ['2026-11-07T05:59:59Z', false], ['2026-11-07T06:00:00Z', true],
    ['2026-11-07T13:59:59Z', true], ['2026-11-07T14:00:00Z', false],
    ['2026-11-06T13:00:00Z', false],
  ]) {
    assert.equal(windowActive(friday, at(date)), expected, date);
  }
  assert.match(windowSummary(friday), /Fri.*next day/);
  const day = { ...night, start: '06:00', end: '22:00' };
  assert.equal(windowActive(day, at('2026-11-07T14:00:00Z')), true);
  assert.equal(windowActive(day, at('2026-11-08T06:00:00Z')), false);
});
test('time zones and DST determine current eligibility and the next actual opening', () => {
  assert.equal(ruleWindow(night, at('2026-11-07T14:00:00Z')).nextStart, at('2026-11-08T06:00:00Z'));
  assert.equal(ruleWindow(night, at('2026-11-07T15:00:00Z')).nextStart, at('2026-11-08T06:00:00Z'));
  const spring = { ...night, days: [6], start: '02:30', end: '04:00' };
  assert.equal(ruleWindow(spring, at('2026-03-08T09:00:00Z')).nextStart, at('2026-03-08T10:00:00Z'));
  assert.equal(windowActive(spring, at('2026-03-08T10:59:00Z')), true);
  assert.equal(windowActive(spring, at('2026-03-08T11:00:00Z')), false);
  const repeated = { ...night, days: [6], start: '01:00', end: '02:00' };
  assert.equal(windowActive(repeated, at('2026-11-01T08:30:00Z')), true);
  assert.equal(windowActive(repeated, at('2026-11-01T09:30:00Z')), true);
  assert.equal(windowActive(repeated, at('2026-11-01T10:00:00Z')), false);
});
test('invalid and ambiguous windows are rejected for both rule categories', () => {
  for (const bad of [null, {}, [], { ...night, extra: true }, { ...night, days: [] }, { ...night, days: [0, 0] },
    { ...night, days: [7] }, { ...night, start: '24:00' }, { ...night, end: '22:00' },
    { ...night, timeZone: '' }, { ...night, timeZone: 'not-a-zone' }]) {
    assert.ok(windowError(bad));
    assert.equal(windowActive(bad), false);
    assert.ok(ruleWindow(bad).error);
    assert.equal(windowSummary(bad ?? {}), 'Review the time window');
    for (const [category, kind] of [['temperature', 'temperature'], ['fans', 'fan']]) {
      assert.throws(() => validateRuleDrafts({ [category]: [{ id: 'x', name: 'Test', kind, window: bad }] }));
    }
  }
  assert.throws(() => validateRuleDrafts({
    occupancy: [{ id: 'p', name: 'Presence', kind: 'presence', window: night }],
  }), /temperature and fan/);
  assert.equal(validateRuleDrafts({ temperature: [{ id: 't', name: 'Temperature', kind: 'temperature', window: night }] })
    .temperature[0].window.start, '22:00');
});
