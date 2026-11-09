// tide-table-bd -- unit tests (node:test). Run: node --test tests/logic.test.js
// Anchors are independently computed (hand arithmetic / USNO-anchored lunar
// dates), never derived from logic.js itself.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logic.js');

const P = 12.4206012 * 3600 * 1000; // 44,714,164.32 ms
const DAY = 24 * 3600 * 1000;
// Calibration: high tide 2026-11-09 06:00 Dhaka (+06) = 00:00 UTC.
const CAL = Date.UTC(2026, 10, 9, 0, 0, 0);
const NOW_08 = Date.UTC(2026, 10, 9, 2, 0, 0); // 08:00 Dhaka
const NOW_18 = Date.UTC(2026, 10, 9, 12, 0, 0); // 18:00 Dhaka

test('M2 period constant is 12.4206012 h', () => {
  assert.equal(L.M2_PERIOD_MS, P);
  assert.equal(L.HALF_PERIOD_MS, P / 2);
});

test('generateTides: consecutive highs differ by exactly one M2 period', () => {
  const evs = L.generateTides(CAL, CAL, CAL + 3 * P);
  const highs = evs.filter((e) => e.type === 'high');
  assert.equal(highs.length, 4); // k = 0..3
  for (let i = 1; i < highs.length; i++) {
    assert.ok(Math.abs((highs[i].t - highs[i - 1].t) - P) < 1, 'high gap = P');
  }
});

test('generateTides: lows sit exactly half a period after highs', () => {
  const evs = L.generateTides(CAL, CAL, CAL + 2 * P);
  const highs = evs.filter((e) => e.type === 'high');
  const lows = evs.filter((e) => e.type === 'low');
  assert.equal(highs.length, 3);
  assert.equal(lows.length, 2);
  for (let i = 0; i < lows.length; i++) {
    assert.ok(Math.abs((lows[i].t - highs[i].t) - P / 2) < 1, 'low = high + P/2');
  }
});

test('generateTides: strictly alternating, sorted, covers the window', () => {
  const from = CAL - 5 * P, to = CAL + 5 * P;
  const evs = L.generateTides(from, from, to);
  assert.ok(evs.length >= 19 && evs.length <= 21, 'about 20 events, got ' + evs.length);
  for (let i = 0; i < evs.length; i++) {
    assert.ok(evs[i].t >= from && evs[i].t <= to, 'inside window');
    if (i > 0) {
      assert.ok(evs[i].t > evs[i - 1].t, 'sorted');
      assert.notEqual(evs[i].type, evs[i - 1].type, 'alternating');
      assert.ok(Math.abs((evs[i].t - evs[i - 1].t) - P / 2) < 1, 'gap = P/2');
    }
  }
  assert.equal(evs[0].type, 'high', 'first event after a high calibration is a high');
});

test('generateTides: empty window and bad inputs', () => {
  assert.deepEqual(L.generateTides(CAL, CAL + 1000, CAL), []);
  assert.deepEqual(L.generateTides(NaN, CAL, CAL + P), []);
});

test('tidesForDay: 2026-11-09 has exactly 3 events (06:00 H, 12:12 L, 18:25 H)', () => {
  const dayStart = Date.UTC(2026, 10, 8, 18, 0, 0); // 00:00 Dhaka, 9 Nov
  const evs = L.tidesForDay(CAL, dayStart);
  assert.equal(evs.length, 3);
  assert.equal(evs[0].type, 'high');
  assert.equal(evs[0].t, CAL);
  assert.equal(evs[1].type, 'low');
  assert.equal(evs[1].t, CAL + P / 2);
  assert.equal(evs[2].type, 'high');
  assert.equal(evs[2].t, CAL + P);
  assert.equal(L.formatTimeDhaka(evs[1].t), '12:12');
  assert.equal(L.formatTimeDhaka(evs[2].t), '18:25');
});

test('nextTide: 08:00 -> next is LOW at 12:12:37 Dhaka', () => {
  const nx = L.nextTide(CAL, NOW_08);
  assert.equal(nx.type, 'low');
  assert.equal(nx.t, CAL + P / 2);
  assert.equal(L.formatTimeDhaka(nx.t), '12:12');
  assert.equal(nx.minutesUntil, 253); // 4 h 12 m 37 s, rounded
});

test('nextTide: 18:00 -> next is HIGH at 18:25:14 Dhaka', () => {
  const nx = L.nextTide(CAL, NOW_18);
  assert.equal(nx.type, 'high');
  assert.equal(nx.t, CAL + P);
  assert.equal(L.formatTimeDhaka(nx.t), '18:25');
  assert.equal(nx.minutesUntil, 25); // 25 m 14 s, rounded
});

test('nextTide: strictly after now (never returns the event at now)', () => {
  const nx = L.nextTide(CAL, CAL);
  assert.equal(nx.type, 'low');
  assert.equal(nx.t, CAL + P / 2);
});

test('7-day window: 13 or 14 high tides, 27 or 28 events total', () => {
  const evs = L.generateTides(CAL, CAL, CAL + 7 * DAY);
  const highs = evs.filter((e) => e.type === 'high');
  assert.ok(highs.length === 13 || highs.length === 14, 'highs=' + highs.length);
  assert.ok(evs.length === 27 || evs.length === 28, 'total=' + evs.length);
});

test('moonAgeDays: reference new moon 2000-01-06T18:14Z has age 0', () => {
  assert.equal(L.moonAgeDays(Date.UTC(2000, 0, 6, 18, 14)), 0);
});

test('moonAgeDays: 2026-11-09 is within 1 day of new moon (mean model)', () => {
  // Dhaka noon 9 Nov 2026: age ~28.87 d, i.e. 0.66 d before new moon.
  // The mean model differs from the true orbit by up to ~1 day, so the
  // honest tolerance here is 1.0 d, not 0.6 d.
  const age = L.moonAgeDays(Date.UTC(2026, 10, 9, 6, 0, 0));
  const distToNew = Math.min(age, L.SYNODIC_DAYS - age);
  assert.ok(distToNew < 1.0, 'distance to new moon = ' + distToNew.toFixed(2) + ' d');
  assert.ok(age >= 0 && age < L.SYNODIC_DAYS, 'age in [0, 29.53)');
});

test('moonAgeDays: 2026-11-24 is within 0.6 d of full moon (age ~14.77)', () => {
  const age = L.moonAgeDays(Date.UTC(2026, 10, 24, 6, 0, 0));
  assert.ok(Math.abs(age - L.SYNODIC_DAYS / 2) < 0.6, 'age=' + age.toFixed(2));
});

test('tideRange: spring on 2026-11-09, neap on 2026-11-16, spring on 2026-11-24', () => {
  assert.equal(L.tideRange(Date.UTC(2026, 10, 9, 6, 0, 0)).kind, 'spring');
  assert.equal(L.tideRange(Date.UTC(2026, 10, 16, 6, 0, 0)).kind, 'neap');
  assert.equal(L.tideRange(Date.UTC(2026, 10, 24, 6, 0, 0)).kind, 'spring');
  // A mid-range date: 2026-11-12 (age ~3 d from new, ~4 d from quarter).
  assert.equal(L.tideRange(Date.UTC(2026, 10, 12, 6, 0, 0)).kind, 'mid');
});

test('phaseName: all 8 bands at their edges', () => {
  assert.equal(L.phaseName(0), 'new');
  assert.equal(L.phaseName(1.84), 'waxing-crescent');
  assert.equal(L.phaseName(5.53), 'first-quarter');
  assert.equal(L.phaseName(9.22), 'waxing-gibbous');
  assert.equal(L.phaseName(12.91), 'full');
  assert.equal(L.phaseName(16.61), 'waning-gibbous');
  assert.equal(L.phaseName(20.30), 'last-quarter');
  assert.equal(L.phaseName(23.99), 'waning-crescent');
  assert.equal(L.phaseName(27.68), 'new');
  assert.equal(L.phaseName(29.0), 'new');
});

test('validateCalibration rejects bad input', () => {
  const now = NOW_08;
  assert.deepEqual(L.validateCalibration({ stationId: 'nope', datetimeStr: '2026-11-08T06:00' }, now).errors, ['unknown-station']);
  assert.deepEqual(L.validateCalibration({ stationId: 'chattogram', datetimeStr: 'not-a-date' }, now).errors, ['bad-datetime']);
  assert.deepEqual(L.validateCalibration({ stationId: 'chattogram', datetimeStr: '2026-02-30T06:00' }, now).errors, ['bad-datetime']);
  assert.deepEqual(L.validateCalibration({ stationId: 'chattogram', datetimeStr: '2026-11-09T10:00' }, now).errors, ['future-datetime']);
  assert.deepEqual(L.validateCalibration({ stationId: 'chattogram', datetimeStr: '2026-07-31T06:00' }, now).errors, ['too-old-datetime']);
});

test('validateCalibration accepts a valid yesterday calibration', () => {
  const res = L.validateCalibration({ stationId: 'chattogram', datetimeStr: '2026-11-08T06:00' }, NOW_08);
  assert.equal(res.ok, true);
  assert.deepEqual(res.errors, []);
  assert.equal(res.calMs, Date.UTC(2026, 10, 8, 0, 0, 0));
});

test('validateCalibration allows 60-minute clock tolerance into the future', () => {
  const res = L.validateCalibration({ stationId: 'chattogram', datetimeStr: '2026-11-09T08:30' }, NOW_08);
  assert.equal(res.ok, true);
});

test('STATIONS: 10 unique coastal stations', () => {
  assert.equal(L.STATIONS.length, 10);
  const ids = L.STATIONS.map((s) => s.id);
  assert.equal(new Set(ids).size, 10);
  assert.ok(L.stationById('chattogram'));
  assert.ok(L.stationById('barishal'));
  assert.equal(L.stationById('nope'), null);
});

test('toBnDigits converts ASCII digits to Bengali digits', () => {
  assert.equal(L.toBnDigits('0123456789'), '\u09e6\u09e7\u09e8\u09e9\u09ea\u09eb\u09ec\u09ed\u09ee\u09ef');
  assert.equal(L.toBnDigits('12:12'), '\u09e7\u09e8:\u09e7\u09e8');
});

test('Dhaka helpers: day start, date key, time format', () => {
  assert.equal(L.dhakaDateKey(CAL), '2026-11-09');
  assert.equal(L.dhakaDayStart(CAL), Date.UTC(2026, 10, 8, 18, 0, 0));
  assert.equal(L.formatTimeDhaka(CAL), '06:00');
  assert.equal(L.parseDhakaWall('2026-11-09T06:00'), CAL);
  assert.equal(L.parseDhakaWall('garbage'), null);
});

test('export/import payload round-trips and rejects foreign files', () => {
  const payload = L.exportPayload({ chattogram: { calMs: CAL } });
  const res = L.importPayload(payload);
  assert.equal(res.ok, true);
  assert.equal(res.calibrations.chattogram.calMs, CAL);
  assert.equal(L.importPayload('{not json').ok, false);
  assert.equal(L.importPayload('{"app":"bus-fare-bd","version":1,"calibrations":{}}').ok, false);
  assert.equal(L.importPayload('{"app":"tide-table-bd","version":2,"calibrations":{}}').ok, false);
  assert.equal(L.importPayload('{"app":"tide-table-bd","version":1,"calibrations":{"nope":{"calMs":1}}}').ok, false);
});
