// tide-table-bd -- pure tide math (no DOM). Node-testable.
// Model (labelled assumption, see README):
//   * Tides on the Bangladesh coast are semidiurnal: two high tides and
//     two low tides per lunar day, driven mainly by the M2 lunar tide
//     (period 12.4206012 h = 12 h 25 m 14 s).
//   * The user enters ONE observed high-tide time at a coastal station.
//     High tides are projected forward/backward at cal + k*P and low tides
//     at cal + (k + 0.5)*P. No station constants are invented and no tide
//     HEIGHTS are produced -- times only, labelled approximate.
//   * Real tides drift from this M2-only model (weather, wind, river
//     flow); times can be ~1 h off after a week. Recalibrate often.
(function (root) {
  'use strict';

  var APP = 'tide-table-bd';
  var VERSION = 1;

  // M2 semidiurnal period: 12.4206012 hours, in milliseconds.
  var M2_PERIOD_MS = 12.4206012 * 3600 * 1000;
  var HALF_PERIOD_MS = M2_PERIOD_MS / 2;

  // Mean synodic month (new moon to new moon), in days.
  var SYNODIC_DAYS = 29.530588853;
  // A known new moon: 2000-01-06 18:14 UTC (same anchor as moon-phase-bd).
  var NEW_MOON_REF_MS = Date.UTC(2000, 0, 6, 18, 14);
  var DAY_MS = 24 * 3600 * 1000;

  var BN_DIGITS = ['\u09e6', '\u09e7', '\u09e8', '\u09e9', '\u09ea',
                   '\u09eb', '\u09ec', '\u09ed', '\u09ee', '\u09ef'];

  // Coastal stations of Bangladesh (ASCII ids + English names only;
  // Bengali names live in i18n.js).
  var STATIONS = [
    { id: 'chattogram', name: 'Chattogram' },
    { id: 'coxs-bazar', name: "Cox's Bazar" },
    { id: 'teknaf', name: 'Teknaf' },
    { id: 'kuakata', name: 'Kuakata' },
    { id: 'mongla', name: 'Mongla' },
    { id: 'patuakhali', name: 'Patuakhali' },
    { id: 'sandwip', name: 'Sandwip' },
    { id: 'hatiya', name: 'Hatiya' },
    { id: 'kutubdia', name: 'Kutubdia' },
    { id: 'barishal', name: 'Barishal River Port' }
  ];

  function stationById(id) {
    for (var i = 0; i < STATIONS.length; i++) {
      if (STATIONS[i].id === id) return STATIONS[i];
    }
    return null;
  }

  function isFiniteNumber(x) { return typeof x === 'number' && isFinite(x); }

  function toBnDigits(s) {
    return String(s).replace(/[0-9]/g, function (d) { return BN_DIGITS[+d]; });
  }

  // All tide events in [fromMs, toMs], sorted, strictly alternating.
  // Highs at calMs + k*P, lows at calMs + (k + 0.5)*P.
  function generateTides(calMs, fromMs, toMs) {
    if (!isFiniteNumber(calMs) || !isFiniteNumber(fromMs) || !isFiniteNumber(toMs)) return [];
    if (toMs < fromMs) return [];
    var events = [];
    // Start one full period before the window so the first event inside
    // the window is never missed at the boundary. Each event time is
    // computed directly as calMs + k*P (never accumulated), so float
    // drift cannot drop a boundary event.
    var k = Math.floor((fromMs - calMs) / M2_PERIOD_MS) - 1;
    for (;; k++) {
      var high = calMs + k * M2_PERIOD_MS;
      var low = high + HALF_PERIOD_MS;
      if (high > toMs) break; // later events only move forward
      if (high >= fromMs) events.push({ t: high, type: 'high' });
      if (low >= fromMs && low <= toMs) events.push({ t: low, type: 'low' });
    }
    events.sort(function (a, b) { return a.t - b.t; });
    return events;
  }

  // Events within one local day starting at dayStartMs (epoch ms).
  function tidesForDay(calMs, dayStartMs) {
    return generateTides(calMs, dayStartMs, dayStartMs + DAY_MS - 1);
  }

  // First tide strictly after nowMs.
  function nextTide(calMs, nowMs) {
    if (!isFiniteNumber(calMs) || !isFiniteNumber(nowMs)) return null;
    var events = generateTides(calMs, nowMs + 1, nowMs + 2 * M2_PERIOD_MS);
    if (!events.length) return null;
    var e = events[0];
    return { t: e.t, type: e.type, minutesUntil: Math.round((e.t - nowMs) / 60000) };
  }

  // Moon age in days, in [0, 29.530588853).
  function moonAgeDays(dateMs) {
    var age = ((dateMs - NEW_MOON_REF_MS) / DAY_MS) % SYNODIC_DAYS;
    if (age < 0) age += SYNODIC_DAYS;
    return age;
  }

  // Spring tides near new/full moon, neap tides near the quarters.
  function tideRange(dateMs) {
    var age = moonAgeDays(dateMs);
    var FULL = SYNODIC_DAYS / 2;          // 14.765294
    var FIRST_Q = SYNODIC_DAYS / 4;        // 7.382647
    var LAST_Q = 3 * SYNODIC_DAYS / 4;     // 22.147942
    var TOL = 2.2;                         // days
    function near(target) {
      var d = Math.abs(age - target);
      return Math.min(d, SYNODIC_DAYS - d) <= TOL;
    }
    var kind = 'mid';
    if (near(0) || near(FULL)) kind = 'spring';
    else if (near(FIRST_Q) || near(LAST_Q)) kind = 'neap';
    return { kind: kind, age: age };
  }

  // 8 phase keys. Band edges (days): 1.84, 5.53, 9.22, 12.91, 16.61,
  // 20.30, 23.99, 27.68.
  function phaseName(age) {
    if (age < 1.84) return 'new';
    if (age < 5.53) return 'waxing-crescent';
    if (age < 9.22) return 'first-quarter';
    if (age < 12.91) return 'waxing-gibbous';
    if (age < 16.61) return 'full';
    if (age < 20.30) return 'waning-gibbous';
    if (age < 23.99) return 'last-quarter';
    if (age < 27.68) return 'waning-crescent';
    return 'new';
  }

  // Validate a calibration: { stationId, datetimeStr } where datetimeStr
  // is a "YYYY-MM-DDTHH:mm" wall-clock string in Asia/Dhaka time, and
  // nowMs is the current epoch ms for the future/age checks.
  // Returns { ok, errors[] } with ASCII error codes.
  function validateCalibration(input, nowMs) {
    var errors = [];
    if (!input || typeof input !== 'object') return { ok: false, errors: ['invalid-input'] };
    if (!stationById(input.stationId)) errors.push('unknown-station');
    var calMs = parseDhakaWall(input.datetimeStr);
    if (calMs === null) {
      errors.push('bad-datetime');
    } else {
      if (calMs > nowMs + 60 * 60000) errors.push('future-datetime');
      if (calMs < nowMs - 90 * DAY_MS) errors.push('too-old-datetime');
    }
    return { ok: errors.length === 0, errors: errors, calMs: calMs };
  }

  // Parse "YYYY-MM-DDTHH:mm" as a wall-clock time in Asia/Dhaka (UTC+6,
  // no DST). Returns epoch ms, or null when unparsable.
  function parseDhakaWall(s) {
    if (typeof s !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5], sec = m[6] ? +m[6] : 0;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 59) return null;
    var ms = Date.UTC(y, mo - 1, d, h, mi, sec) - 6 * 3600 * 1000;
    // Reject impossible dates (e.g. Feb 30) that Date.UTC normalises.
    var chk = new Date(ms + 6 * 3600 * 1000);
    if (chk.getUTCFullYear() !== y || chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) return null;
    return ms;
  }

  // Dhaka wall-clock components of an epoch ms, as { y, mo, d, h, mi }.
  function dhakaParts(ms) {
    var d = new Date(ms + 6 * 3600 * 1000);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(),
             h: d.getUTCHours(), mi: d.getUTCMinutes() };
  }

  // Epoch ms of midnight (00:00 Dhaka) on the Dhaka date of ms.
  function dhakaDayStart(ms) {
    var p = dhakaParts(ms);
    return Date.UTC(p.y, p.mo - 1, p.d) - 6 * 3600 * 1000;
  }

  // "YYYY-MM-DD" key for a Dhaka date.
  function dhakaDateKey(ms) {
    var p = dhakaParts(ms);
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return p.y + '-' + pad(p.mo) + '-' + pad(p.d);
  }

  // Format epoch ms as "HH:MM" in Dhaka time.
  function formatTimeDhaka(ms) {
    var p = dhakaParts(ms);
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return pad(p.h) + ':' + pad(p.mi);
  }

  // ---- JSON export / import (calibrations only) ----

  function exportPayload(calibrations) {
    return JSON.stringify({ app: APP, version: VERSION, calibrations: calibrations || {} });
  }

  function importPayload(text) {
    var obj;
    try { obj = JSON.parse(text); } catch (e) { return { ok: false, error: 'Not valid JSON.' }; }
    if (!obj || typeof obj !== 'object') return { ok: false, error: 'File must be a JSON object.' };
    if (obj.app !== APP) return { ok: false, error: 'Not a tide-table-bd file.' };
    if (obj.version !== VERSION) return { ok: false, error: 'Unsupported file version.' };
    if (!obj.calibrations || typeof obj.calibrations !== 'object' || Array.isArray(obj.calibrations)) {
      return { ok: false, error: 'Calibrations must be an object.' };
    }
    var keys = Object.keys(obj.calibrations);
    if (keys.length > 10) return { ok: false, error: 'Too many stations (max 10).' };
    for (var i = 0; i < keys.length; i++) {
      var st = stationById(keys[i]);
      if (!st) return { ok: false, error: 'Unknown station: ' + keys[i] };
      var c = obj.calibrations[keys[i]];
      if (!c || typeof c !== 'object' || !isFiniteNumber(c.calMs)) {
        return { ok: false, error: 'Bad calibration for ' + keys[i] + '.' };
      }
    }
    return { ok: true, calibrations: obj.calibrations };
  }

  var api = {
    APP: APP,
    VERSION: VERSION,
    M2_PERIOD_MS: M2_PERIOD_MS,
    HALF_PERIOD_MS: HALF_PERIOD_MS,
    SYNODIC_DAYS: SYNODIC_DAYS,
    STATIONS: STATIONS,
    stationById: stationById,
    toBnDigits: toBnDigits,
    generateTides: generateTides,
    tidesForDay: tidesForDay,
    nextTide: nextTide,
    moonAgeDays: moonAgeDays,
    tideRange: tideRange,
    phaseName: phaseName,
    validateCalibration: validateCalibration,
    parseDhakaWall: parseDhakaWall,
    dhakaParts: dhakaParts,
    dhakaDayStart: dhakaDayStart,
    dhakaDateKey: dhakaDateKey,
    formatTimeDhaka: formatTimeDhaka,
    exportPayload: exportPayload,
    importPayload: importPayload
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TTLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
