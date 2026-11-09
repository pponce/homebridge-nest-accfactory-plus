import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const MINUTE = 60000;
const DAY = 86400000;
const SAMPLE_LIMIT = 2880;
const CYCLE_LIMIT = 128;
const FILE_LIMIT = 16 * 1024 * 1024;
// These are provisional plugin heuristics, not equipment manufacturer specifications.
export const HEATING_PROFILES = Object.freeze({
  forcedAir: { label: 'Forced air', minimumIntervalMinutes: 10, maximumOffset: 1, settleMinutes: 5 },
  radiators: { label: 'Radiators', minimumIntervalMinutes: 20, maximumOffset: 0.75, settleMinutes: 10 },
  radiantFloor: { label: 'In-floor radiant', minimumIntervalMinutes: 30, maximumOffset: 0.5, settleMinutes: 20 },
});
const profileFor = (type) => (Object.hasOwn(HEATING_PROFILES, type) ? HEATING_PROFILES[type] : undefined);
const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const median = (values) => {
  const ordered = values.filter(Number.isFinite).sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length ? (ordered[middle] + ordered[Math.max(0, Math.ceil(ordered.length / 2) - 1)]) / 2 : null;
};
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const optionFor = (rule, devices) => devices.find((device) => device.serialNumber.toUpperCase() === rule.thermostatId?.toUpperCase()) ?? {};
const fingerprint = (rule, options) =>
  digest([
    rule.thermostatId,
    [...new Set(rule.sourceIds)].sort(),
    rule.aggregation ?? 'average',
    rule.desiredTemperature,
    options.heatingType,
    options.scheduleTimeZone ?? '',
  ]);
const validSample = (sample) =>
  Array.isArray(sample) &&
  sample.length === 5 &&
  sample.every(Number.isFinite) &&
  sample[0] > 0 &&
  Math.abs(sample[1]) <= 100 &&
  Math.abs(sample[2]) <= 100 &&
  sample[3] >= 9 &&
  sample[3] <= 32 &&
  [0, 1].includes(sample[4]);
const cycleFields = ['start', 'end', 'delay', 'rate', 'coastMinutes', 'coastRise', 'offset', 'overshoot'];
const validCycle = (cycle) =>
  cycle &&
  cycleFields.every((key) => Number.isFinite(cycle[key])) &&
  cycle.end >= cycle.start &&
  cycle.end - cycle.start <= DAY &&
  cycle.delay >= 0 &&
  cycle.rate > 0 &&
  cycle.coastMinutes >= 0 &&
  cycle.coastRise >= 0 &&
  Math.abs(cycle.offset) <= 200 &&
  cycle.overshoot >= 0;

export class HeatingResponse {
  constructor({ directory, now = Date.now }) {
    this.file = path.join(directory, 'heating-response.json');
    this.now = now;
    this.records = new Map();
    this.dirty = false;
    this.lastSave = 0;
    this.error = null;
  }

  async start() {
    try {
      const stat = await fs.lstat(this.file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > FILE_LIMIT) {
        throw new Error('Invalid heating history');
      }
      const data = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (data.version !== 1 || !Array.isArray(data.records) || data.records.length > 32) {
        throw new Error('Invalid heating history');
      }
      const now = this.now();
      for (const record of data.records) {
        if (
          !record ||
          !/^[a-zA-Z0-9_-]{1,80}$/.test(record.id) ||
          this.records.has(record.id) ||
          !/^[a-f0-9]{64}$/.test(record.signature) ||
          !Number.isFinite(record.since) ||
          record.since > now ||
          !Array.isArray(record.samples) ||
          record.samples.length > SAMPLE_LIMIT ||
          !record.samples.every(validSample) ||
          !Array.isArray(record.cycles) ||
          record.cycles.length > CYCLE_LIMIT ||
          !record.cycles.every(validCycle)
        ) {
          throw new Error('Invalid heating history');
        }
        this.records.set(record.id, {
          id: record.id,
          signature: record.signature,
          since: record.since,
          samples: record.samples.filter((sample) => sample[0] >= now - 2 * DAY && sample[0] <= now),
          cycles: record.cycles.filter((cycle) => cycle.end >= now - 30 * DAY && cycle.end <= now),
          // A partial cycle never crosses a restart or a missing observation.
          status: 'Waiting for current readings.',
        });
      }
    } catch (error) {
      this.records.clear();
      if (error.code !== 'ENOENT') {
        this.error = 'Local heating history could not be read. A new observation period will start.';
      }
    }
  }

  sync(rules, devices) {
    const wanted = new Set();
    for (const rule of rules) {
      const options = optionFor(rule, devices);
      if (
        !options.heatingResponseEnabled ||
        !profileFor(options.heatingType) ||
        !rule.sourceIds.length ||
        !Number.isFinite(rule.desiredTemperature)
      ) {
        continue;
      }
      wanted.add(rule.id);
      const signature = fingerprint(rule, options);
      if (this.records.get(rule.id)?.signature !== signature) {
        this.records.set(rule.id, {
          id: rule.id,
          signature,
          since: this.now(),
          samples: [],
          cycles: [],
          status: 'Waiting for a complete heating cycle.',
        });
        this.dirty = true;
        this.resetPending = true;
      }
    }
    for (const id of this.records.keys()) {
      if (!wanted.has(id)) {
        this.records.delete(id);
        this.dirty = true;
        this.resetPending = true;
      }
    }
  }

  invalidate(record, reason) {
    record.previous = null;
    record.active = null;
    record.status = reason;
  }

  observe(rules, devices, readings) {
    this.sync(rules, devices);
    const now = this.now();
    for (const rule of rules) {
      const record = this.records.get(rule.id);
      if (!record) {
        continue;
      }
      const reading = readings.get(rule.id);
      if (!reading?.valid) {
        this.invalidate(record, 'Waiting for fresh temperatures, Heat mode, Eco off and the built-in Nest sensor.');
        continue;
      }
      const sample = [now, reading.room, reading.physical, reading.target, reading.heating ? 1 : 0];
      if (!validSample(sample)) {
        this.invalidate(record, 'Waiting for valid temperature and heating-state readings.');
        continue;
      }
      const previous = record.previous;
      // Record once per minute, but capture state and setpoint changes immediately.
      if (previous && now >= previous[0] && now - previous[0] < MINUTE && sample[4] === previous[4] && sample[3] === previous[3]) {
        continue;
      }
      if (previous && (now <= previous[0] || now - previous[0] > 2 * MINUTE || Math.abs(sample[1] - previous[1]) > 2)) {
        this.invalidate(record, 'An observation gap or sudden temperature change interrupted this cycle.');
      }
      record.samples.push(sample);
      record.samples = record.samples.filter((row) => row[0] >= now - 2 * DAY).slice(-SAMPLE_LIMIT);
      record.cycles = record.cycles.filter((cycle) => cycle.end >= now - 30 * DAY);
      this.dirty = true;
      this.advance(record, sample, rule.desiredTemperature, profileFor(optionFor(rule, devices).heatingType));
      record.previous = sample;
    }
  }

  advance(record, sample, desired, profile) {
    const [time, room, physical, setpoint, heating] = sample;
    const previous = record.previous;
    if (record.active && Math.abs(setpoint - record.active.setpoint) > 0.26) {
      record.active = null;
      record.status = 'A setpoint change interrupted this cycle. Waiting for a stable heating cycle.';
      return;
    }
    if (heating && previous?.[4] === 0) {
      // A restart before the previous coast settled leaves that cycle incomplete.
      record.active = { start: time, room, setpoint, offsets: [], peak: room, peakAt: time, maxRoom: room, responseSamples: 0 };
      record.status = 'Observing heating response.';
    }
    const active = record.active;
    if (!active) {
      record.status = 'Waiting to observe heating start.';
      return;
    }
    if (time - active.start > 12 * 60 * MINUTE) {
      this.invalidate(record, 'This cycle is too long to compare reliably. Waiting for the next cycle.');
      return;
    }
    if (Math.abs(room - desired) <= 0.75 && active.offsets.length < 720) {
      active.offsets.push(physical - room);
    }
    active.maxRoom = Math.max(active.maxRoom ?? room, room);
    // Radiant rooms can first respond after Nest has already stopped calling for heat.
    if (active.delay === undefined) {
      if (room - active.room >= 0.2) {
        active.responseAt ??= time;
        active.responseSamples++;
        if (active.responseSamples >= 2) {
          active.delay = (active.responseAt - active.start) / MINUTE;
        }
      } else {
        active.responseSamples = 0;
        active.responseAt = undefined;
      }
    }
    if (heating) {
      return;
    }
    if (!active.stop) {
      active.stop = time;
      active.stopRoom = room;
      active.peak = room;
      active.peakAt = time;
      active.rate = (room - active.room) / ((time - active.start) / MINUTE);
    }
    record.status = 'Observing continued warming after heating stops.';
    if (room > active.peak + 0.05) {
      active.peak = room;
      active.peakAt = time;
    }
    if (time - active.stop > 3 * 60 * MINUTE) {
      this.invalidate(record, 'Post-heating temperature did not settle within three hours.');
      return;
    }
    if (time - active.stop < profile.settleMinutes * MINUTE || time - active.peakAt < 10 * MINUTE) {
      return;
    }
    if (active.delay === undefined || active.offsets.length < 3) {
      record.status = 'Waiting for measurable room response after heating stops.';
      return;
    }
    const rate = (active.peak - active.room) / ((active.peakAt - active.start) / MINUTE);
    if (Number.isFinite(active.delay) && rate > 0 && active.stop - active.start >= 2 * MINUTE && active.offsets.length >= 3) {
      record.cycles.push({
        start: active.start,
        end: time,
        delay: active.delay,
        rate,
        coastMinutes: (active.peakAt - active.stop) / MINUTE,
        coastRise: Math.max(0, active.peak - active.stopRoom),
        offset: median(active.offsets),
        overshoot: Math.max(0, active.maxRoom - desired),
      });
      record.cycles = record.cycles.slice(-CYCLE_LIMIT);
      record.status = 'Complete heating cycle recorded.';
    } else {
      record.status = 'Cycle excluded: insufficient warming or too few readings near the desired room temperature.';
    }
    record.active = null;
  }

  recommendation(rule, options) {
    const profile = profileFor(options.heatingType);
    const stored = this.records.get(rule.id);
    const record = stored?.signature === fingerprint(rule, options) ? stored : null;
    const cycles = (record?.cycles ?? []).filter((cycle) => cycle.end >= this.now() - 30 * DAY && cycle.end <= this.now());
    const zone = options.scheduleTimeZone || 'UTC';
    let dates;
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone });
      dates = cycles.map((cycle) => formatter.format(cycle.start));
    } catch {
      dates = cycles.map((cycle) => new Date(cycle.start).toISOString().slice(0, 10));
    }
    const days = new Set(dates).size;
    const span = cycles.length > 1 ? (cycles.at(-1).start - cycles[0].start) / DAY : 0;
    const evidence = {
      cycles: cycles.length,
      days,
      spanDays: span,
      since: record?.since ?? null,
      responseDelayMinutes: median(cycles.map((cycle) => cycle.delay)),
      warmingRateCPerHour: median(cycles.map((cycle) => cycle.rate * 60)),
      coastMinutes: median(cycles.map((cycle) => cycle.coastMinutes)),
      coastRiseC: median(cycles.map((cycle) => cycle.coastRise)),
      nestMinusRoomC: median(cycles.map((cycle) => cycle.offset)),
      overshootC: median(cycles.map((cycle) => cycle.overshoot)),
    };
    const starting = profile
      ? {
          minimumIntervalMinutes: profile.minimumIntervalMinutes,
          maximumOffset: profile.maximumOffset,
          confidence: 'Provisional',
          reason: 'Starting guidance for ' + profile.label.toLowerCase() + '; not learned from this home.',
        }
      : null;
    let learned = null;
    let reason = 'Choose a heating type and enable local observation to learn from this rule’s rooms.';
    if (profile && options.heatingResponseEnabled) {
      reason = 'Needs 6 complete cycles across 3 days and at least 48 hours between the first and last cycle.';
      const offset = evidence.nestMinusRoomC;
      const spread = median(cycles.map((cycle) => Math.abs(cycle.offset - offset)));
      const consistent = cycles.filter((cycle) => Math.abs(cycle.offset) < 0.25 || Math.sign(cycle.offset) === Math.sign(offset)).length;
      if (cycles.length >= 6 && days >= 3 && span >= 2) {
        if (spread > 0.5 || consistent / cycles.length < 0.75) {
          reason = 'Room-to-Nest differences vary too much. Keep observing before changing the adjustment limit.';
        } else {
          const rawInterval = evidence.responseDelayMinutes + 15 / evidence.warmingRateCPerHour + evidence.coastMinutes;
          const interval = clamp(Math.ceil(rawInterval / 5) * 5, profile.minimumIntervalMinutes / 2, 60);
          const offsetLimit = clamp(Math.abs(offset) + 0.25 - evidence.overshootC, 0.5, Math.min(1.5, profile.maximumOffset + 0.5));
          learned = {
            minimumIntervalMinutes: Math.ceil(interval),
            maximumOffset: Math.round(offsetLimit * 4) / 4,
            confidence: cycles.length >= 12 && days >= 5 && span >= 4 && spread <= 0.25 ? 'Higher' : 'Moderate',
            reason:
              'Interval uses response delay, time to warm 0.25°C and continued warming after shutoff. ' +
              'The adjustment limit uses the persistent room-to-Nest difference, reduced for observed overshoot.',
            limitReached: rawInterval > 60,
          };
          reason = 'A learned suggestion is ready for review. Weather, sunlight and occupancy can also affect these observations.';
        }
      }
    }
    for (const [stage, recommendation] of [
      ['starting', starting],
      ['learned', learned],
    ]) {
      if (recommendation) {
        recommendation.id = digest([rule.id, fingerprint(rule, options), stage, recommendation, stage === 'learned' ? evidence : null]);
      }
    }
    return {
      id: rule.id,
      name: rule.name,
      thermostatId: rule.thermostatId,
      collecting: options.heatingResponseEnabled === true,
      current: { minimumIntervalMinutes: rule.minimumIntervalMinutes ?? 5, maximumOffset: rule.maximumOffset ?? 1.5 },
      starting,
      learned,
      evidence,
      reason,
      status: record?.status ?? (options.heatingResponseEnabled ? 'Waiting for the next background observation.' : 'Observation is off.'),
    };
  }

  snapshot(rules, devices) {
    return { error: this.error, rules: rules.map((rule) => this.recommendation(rule, optionFor(rule, devices))) };
  }

  async persist(force = false) {
    if (!this.dirty || (!force && !this.resetPending && this.now() - this.lastSave < 5 * MINUTE)) {
      return;
    }
    const temporary = this.file + '.' + crypto.randomUUID() + '.tmp';
    let handle;
    try {
      const bytes = JSON.stringify({
        version: 1,
        records: [...this.records.values()].map(({ id, signature, since, samples, cycles }) => ({ id, signature, since, samples, cycles })),
      });
      if (Buffer.byteLength(bytes) > FILE_LIMIT) {
        throw new Error('Heating history exceeds its storage limit');
      }
      handle = await fs.open(temporary, 'wx', 0o600);
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.rename(temporary, this.file);
      this.dirty = false;
      this.resetPending = false;
      this.lastSave = this.now();
      this.error = null;
    } catch {
      this.error = 'Local heating history could not be saved. Observations in memory may be lost on restart.';
    } finally {
      await handle?.close().catch(() => {});
      await fs.rm(temporary, { force: true }).catch(() => {});
    }
  }
}
