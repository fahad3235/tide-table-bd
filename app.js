// tide-table-bd -- UI logic. Pure ASCII source; all Bengali strings live
// in i18n.js as \uXXXX escapes. No network requests; state in localStorage.
(function () {
  'use strict';

  var L = window.TTLogic;
  var I18N = window.TTI18N;

  var LS_LANG = 'tide-table-bd:lang';
  var LS_CAL_PREFIX = 'tide-table-bd:cal:';

  // ---- "now" (pinned by ?asof=YYYY-MM-DD for deterministic tests) ----
  var bootReal = Date.now();
  var asof = null;
  try {
    var m = /[?&]asof=(\d{4})-(\d{2})-(\d{2})/.exec(window.location.search || '');
    if (m) asof = { y: +m[1], mo: +m[2], d: +m[3] };
  } catch (e) { asof = null; }
  // Pinned "now": 08:00 Dhaka on the asof date, advancing with real time.
  var pinnedBase = asof ? Date.UTC(asof.y, asof.mo - 1, asof.d, 2, 0, 0) : null;

  function nowMs() {
    return pinnedBase !== null ? pinnedBase + (Date.now() - bootReal) : Date.now();
  }

  // ---- state ----
  var state = {
    lang: 'en',
    stationId: 'chattogram'
  };
  try {
    var savedLang = window.localStorage.getItem(LS_LANG);
    if (savedLang === 'bn' || savedLang === 'en') state.lang = savedLang;
  } catch (e) { /* storage unavailable: stay English */ }

  function t(key) { return I18N[state.lang][key] || I18N.en[key] || key; }
  function loc(s) { return state.lang === 'bn' ? L.toBnDigits(s) : s; }

  function calKey(stationId) { return LS_CAL_PREFIX + stationId; }
  function getCalibration(stationId) {
    try {
      var raw = window.localStorage.getItem(calKey(stationId));
      if (!raw) return null;
      var c = JSON.parse(raw);
      if (!c || typeof c.calMs !== 'number' || !isFinite(c.calMs)) return null;
      return c;
    } catch (e) { return null; }
  }
  function saveCalibration(stationId, calMs) {
    try {
      window.localStorage.setItem(calKey(stationId), JSON.stringify({ calMs: calMs, savedAt: Date.now() }));
    } catch (e) { /* ignore */ }
  }
  function loadAllCalibrations() {
    var out = {};
    L.STATIONS.forEach(function (st) {
      var c = getCalibration(st.id);
      if (c) out[st.id] = { calMs: c.calMs };
    });
    return out;
  }
  function eraseAll() {
    try {
      var keys = [];
      for (var i = 0; i < window.localStorage.length; i++) keys.push(window.localStorage.key(i));
      keys.forEach(function (k) {
        if (k && k.indexOf('tide-table-bd:') === 0 && k !== LS_LANG) window.localStorage.removeItem(k);
      });
    } catch (e) { /* ignore */ }
  }

  // ---- formatting ----
  function fmtTime(ms) { return loc(L.formatTimeDhaka(ms)); }

  function fmtDate(ms) {
    var locale = state.lang === 'bn' ? 'bn-BD' : 'en-GB';
    try {
      return new Intl.DateTimeFormat(locale, {
        timeZone: 'Asia/Dhaka', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
      }).format(new Date(ms));
    } catch (e) {
      var p = L.dhakaParts(ms);
      return p.d + '/' + p.mo + '/' + p.y;
    }
  }

  function fmtCountdown(msUntil) {
    var s = Math.max(0, Math.round(msUntil / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return loc(pad(h) + ':' + pad(m) + ':' + pad(sec));
  }

  function datetimeLocalValue(ms) {
    var p = L.dhakaParts(ms);
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return p.y + '-' + pad(p.mo) + '-' + pad(p.d) + 'T' + pad(p.h) + ':' + pad(p.mi);
  }

  // ---- DOM ----
  function $(id) { return document.getElementById(id); }

  function applyLang() {
    var map = {
      title: 'title', subtitle: 'subtitle', langBtn: 'langBtn',
      calHeading: 'calHeading', lblStation: 'lblStation', lblCal: 'lblCal',
      calHint: 'calHint', saveCalBtn: 'saveCalBtn', savedMsg: 'savedMsg',
      emptyTitle: 'emptyTitle', emptyText: 'emptyText',
      nextHeading: 'nextHeading', inLabel: 'inLabel',
      todayHeading: 'todayHeading', noTidesToday: 'noTidesToday',
      moonHeading: 'moonHeading', moonAgeLabel: 'moonAgeLabel',
      weekHeading: 'weekHeading', colDate: 'colDate', colTides: 'colTides', colMoon: 'colMoon',
      dataHeading: 'dataHeading', exportBtn: 'exportBtn', importLabel: 'importLabel',
      importBtn: 'importBtn', importOk: 'importOk', eraseLabel: 'eraseLabel',
      eraseBtn: 'eraseBtn', erasedMsg: 'erasedMsg', eraseWrong: 'eraseWrong',
      disclaimer: 'disclaimer', footer: 'footer'
    };
    Object.keys(map).forEach(function (id) {
      var el = $(id);
      if (el) el.textContent = t(map[id]);
    });
    var ph = $('importText');
    if (ph) ph.placeholder = t('importPh');
    document.documentElement.lang = state.lang === 'bn' ? 'bn' : 'en';
    buildStationOptions();
  }

  function buildStationOptions() {
    var sel = $('stationSelect');
    var cur = state.stationId;
    sel.innerHTML = '';
    L.STATIONS.forEach(function (st) {
      var opt = document.createElement('option');
      opt.value = st.id;
      opt.textContent = state.lang === 'bn' ? t('station_' + st.id) : st.name;
      if (st.id === cur) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function errText(code) {
    var map = {
      'unknown-station': 'errUnknownStation',
      'bad-datetime': 'errBadDatetime',
      'future-datetime': 'errFuture',
      'too-old-datetime': 'errTooOld'
    };
    return t(map[code] || 'errBadDatetime');
  }

  // ---- render ----
  var currentNext = null;

  function render() {
    var cal = getCalibration(state.stationId);
    var empty = $('emptyState');
    var results = $('results');
    var input = $('calInput');
    input.value = cal ? datetimeLocalValue(cal.calMs) : '';
    if (!cal) {
      empty.hidden = false;
      results.hidden = true;
      currentNext = null;
      $('nextTime').textContent = '\u2014';
      $('nextCountdown').textContent = '\u2014';
      return;
    }
    empty.hidden = true;
    results.hidden = false;
    renderNext(cal.calMs);
    renderToday(cal.calMs);
    renderMoon();
    renderWeek(cal.calMs);
  }

  function renderNext(calMs) {
    var nx = L.nextTide(calMs, nowMs());
    currentNext = nx;
    if (!nx) {
      $('nextType').textContent = '\u2014';
      $('nextTime').textContent = '\u2014';
      $('nextCountdown').textContent = '\u2014';
      return;
    }
    var badge = $('nextType');
    badge.textContent = nx.type === 'high' ? t('high') : t('low');
    badge.className = 'badge ' + nx.type;
    $('nextTime').textContent = fmtTime(nx.t);
    $('nextCountdown').textContent = fmtCountdown(nx.t - nowMs());
  }

  function tideChip(ev) {
    var chip = document.createElement('span');
    chip.className = 'tide-chip';
    var badge = document.createElement('span');
    badge.className = 'badge ' + ev.type;
    badge.textContent = ev.type === 'high' ? t('high') : t('low');
    var time = document.createElement('span');
    time.className = 't';
    time.textContent = fmtTime(ev.t);
    chip.appendChild(badge);
    chip.appendChild(time);
    return chip;
  }

  function renderToday(calMs) {
    var strip = $('todayStrip');
    strip.innerHTML = '';
    var dayStart = L.dhakaDayStart(nowMs());
    var events = L.tidesForDay(calMs, dayStart);
    $('noTidesToday').hidden = events.length > 0;
    events.forEach(function (ev) { strip.appendChild(tideChip(ev)); });
  }

  function renderMoon() {
    var now = nowMs();
    var age = L.moonAgeDays(now);
    $('moonAge').textContent = loc(age.toFixed(1)) + ' ' + t('daysUnit');
    $('moonPhase').textContent = t('phase_' + L.phaseName(age).replace(/-/g, '_'));
  }

  function renderWeek(calMs) {
    var body = $('weekBody');
    body.innerHTML = '';
    var dayStart = L.dhakaDayStart(nowMs());
    for (var d = 0; d < 7; d++) {
      var start = dayStart + d * 24 * 3600 * 1000;
      var noon = start + 12 * 3600 * 1000;
      var events = L.tidesForDay(calMs, start);
      var range = L.tideRange(noon);
      var phase = L.phaseName(range.age);
      var tr = document.createElement('tr');
      tr.className = 'day-block';

      var tdDate = document.createElement('td');
      tdDate.className = 'day-date';
      tdDate.textContent = fmtDate(start);
      tr.appendChild(tdDate);

      var tdTides = document.createElement('td');
      var wrap = document.createElement('div');
      wrap.className = 'day-tides';
      events.forEach(function (ev) {
        var row = document.createElement('div');
        row.className = 'day-tide';
        var badge = document.createElement('span');
        badge.className = 'badge ' + ev.type;
        badge.textContent = ev.type === 'high' ? t('high') : t('low');
        var time = document.createElement('span');
        time.textContent = fmtTime(ev.t);
        row.appendChild(badge);
        row.appendChild(time);
        wrap.appendChild(row);
      });
      tdTides.appendChild(wrap);
      tr.appendChild(tdTides);

      var tdMoon = document.createElement('td');
      tdMoon.className = 'day-moon';
      var rb = document.createElement('span');
      rb.className = 'badge ' + range.kind;
      rb.textContent = t(range.kind);
      tdMoon.appendChild(rb);
      tdMoon.appendChild(document.createTextNode(' ' + loc(range.age.toFixed(1)) + ' ' + t('daysUnit') + ' \u00b7 ' + t('phase_' + phase.replace(/-/g, '_'))));
      tr.appendChild(tdMoon);

      body.appendChild(tr);
    }
  }

  // ---- export / import ----
  function exportPayload() {
    return L.exportPayload(loadAllCalibrations());
  }

  function importPayload(text) {
    var res = L.importPayload(text);
    if (!res.ok) return res;
    eraseAll();
    Object.keys(res.calibrations).forEach(function (id) {
      saveCalibration(id, res.calibrations[id].calMs);
    });
    render();
    return res;
  }

  // ---- events ----
  function init() {
    applyLang();
    $('stationSelect').addEventListener('change', function () {
      state.stationId = $('stationSelect').value;
      $('calError').hidden = true;
      $('savedMsg').hidden = true;
      render();
    });
    $('calForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var errEl = $('calError');
      errEl.hidden = true;
      $('savedMsg').hidden = true;
      var res = L.validateCalibration(
        { stationId: state.stationId, datetimeStr: $('calInput').value },
        nowMs()
      );
      if (!res.ok) {
        errEl.textContent = res.errors.map(errText).join(' ');
        errEl.hidden = false;
        return;
      }
      saveCalibration(state.stationId, res.calMs);
      $('savedMsg').hidden = false;
      render();
    });
    $('langBtn').addEventListener('click', function () {
      state.lang = state.lang === 'en' ? 'bn' : 'en';
      try { window.localStorage.setItem(LS_LANG, state.lang); } catch (e) { /* ignore */ }
      applyLang();
      render();
    });
    $('exportBtn').addEventListener('click', function () {
      var blob = new Blob([exportPayload()], { type: 'application/json' });
      var link = $('exportLink');
      link.href = URL.createObjectURL(blob);
      link.click();
      setTimeout(function () { URL.revokeObjectURL(link.href); }, 5000);
    });
    $('importBtn').addEventListener('click', function () {
      $('importOk').hidden = true;
      var fail = $('importFail');
      fail.hidden = true;
      var res = importPayload($('importText').value);
      if (res.ok) {
        $('importOk').hidden = false;
      } else {
        fail.textContent = t('importFail') + res.error;
        fail.hidden = false;
      }
    });
    $('eraseBtn').addEventListener('click', function () {
      $('erasedMsg').hidden = true;
      if ($('eraseInput').value !== 'DELETE') {
        $('eraseWrong').hidden = false;
        return;
      }
      $('eraseWrong').hidden = true;
      eraseAll();
      $('eraseInput').value = '';
      $('erasedMsg').hidden = false;
      render();
    });
    // Live countdown, ticking every second; re-render when the next tide flips.
    setInterval(function () {
      if (!currentNext) return;
      var now = nowMs();
      if (now >= currentNext.t) { render(); return; }
      $('nextCountdown').textContent = fmtCountdown(currentNext.t - now);
    }, 1000);
    render();
  }

  window.__ttbd = {
    state: state,
    getCalibration: getCalibration,
    exportPayload: exportPayload,
    importPayload: importPayload,
    eraseAll: function () { eraseAll(); render(); },
    render: render,
    nowMs: nowMs
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
