// tide-table-bd -- headless-Chrome smoke test via raw CDP (no puppeteer dependency).
// Usage: node tests/smoke.js
// Exits non-zero on any failed assertion; fails on page console errors.
// ?asof=2026-11-09 pins "today" and "now" (08:00 Dhaka) for deterministic tests.
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 9353;
const FILE = 'file://' + path.resolve(__dirname, '..', 'index.html') + '?asof=2026-11-09';
let failures = 0;
let count = 0;
const pageErrors = [];
function check(name, cond, extra) {
  count++;
  console.log((cond ? 'ok - ' : 'FAIL - ') + name + (cond ? '' : ' :: ' + (extra || '')));
  if (!cond) failures++;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const CHROME_BIN = process.env.CHROME_BIN ||
    require('os').homedir() + '/.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell';
  const chrome = spawn(CHROME_BIN, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--remote-debugging-port=' + PORT, '--user-data-dir=/tmp/ttbd-smoke-' + process.pid,
    'about:blank',
  ], { stdio: 'ignore' });
  let targets = [];
  for (let i = 0; i < 50 && targets.length === 0; i++) {
    await wait(200);
    try {
      targets = JSON.parse(await new Promise((res, rej) => {
        http.get('http://127.0.0.1:' + PORT + '/json/list', (r) => {
          let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(d));
        }).on('error', rej);
      }));
    } catch (e) { /* retry */ }
  }
  if (!targets.length) { console.log('FAIL - chrome did not start'); process.exit(2); }
  const wsUrl = targets[0].webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);
  await new Promise((res) => { ws.onopen = res; });
  let seq = 0; const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push('exception: ' + JSON.stringify(msg.params.exceptionDetails).slice(0, 300));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      pageErrors.push('console.error: ' + JSON.stringify(msg.params.args).slice(0, 300));
    }
  };
  function send(method, params) {
    return new Promise((res) => {
      const id = ++seq;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: FILE });
  await wait(1500);
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { error: JSON.stringify(r.result.exceptionDetails).slice(0, 300) };
    return r.result ? r.result.result.value : undefined;
  };
  const BN = (s) => s.replace(/[0-9]/g, (d) => '\u09e6\u09e7\u09e8\u09e9\u09ea\u09eb\u09ec\u09ed\u09ee\u09ef'[+d]);

  // ---- Empty state (no calibration stored) ----
  check('page title contains Tide Table', (await ev('document.title'))?.includes('Tide Table'));
  check('empty state visible with no calibration', (await ev(`document.getElementById('emptyState').hidden`)) === false);
  check('results hidden with no calibration', (await ev(`document.getElementById('results').hidden`)) === true);
  check('station select has 10 stations', (await ev(`document.querySelectorAll('#stationSelect option').length`)) === 10);
  check('disclaimer renders', (await ev(`document.getElementById('disclaimer').textContent.length`)) > 40);
  check('disclaimer says NOT for navigation', (await ev(`document.getElementById('disclaimer').textContent`)).includes('NOT for navigation'));

  // ---- Validation: empty datetime rejected ----
  await ev(`document.getElementById('saveCalBtn').click()`);
  check('empty datetime shows error', (await ev(`document.getElementById('calError').hidden`)) === false);
  check('empty state stays after invalid save', (await ev(`document.getElementById('emptyState').hidden`)) === false);

  // ---- Validation: future datetime rejected (pinned now is 08:00) ----
  await ev(`document.getElementById('calInput').value='2026-11-09T10:00'; document.getElementById('saveCalBtn').click()`);
  check('future datetime shows error', (await ev(`document.getElementById('calError').hidden`)) === false);
  check('future error mentions future', (await ev(`document.getElementById('calError').textContent`)).toLowerCase().includes('future'));

  // ---- Save calibration: Chattogram, high tide 2026-11-09 06:00 Dhaka ----
  await ev(`document.getElementById('calInput').value='2026-11-09T06:00'; document.getElementById('saveCalBtn').click()`);
  check('saved message shows', (await ev(`document.getElementById('savedMsg').hidden`)) === false);
  check('empty state hidden after save', (await ev(`document.getElementById('emptyState').hidden`)) === true);
  check('results visible after save', (await ev(`document.getElementById('results').hidden`)) === false);
  check('next tide is Low', (await ev(`document.getElementById('nextType').textContent`)) === 'Low tide');
  check('next tide time is 12:12', (await ev(`document.getElementById('nextTime').textContent`)) === '12:12');
  check('countdown starts 04:12', (await ev(`document.getElementById('nextCountdown').textContent`)).startsWith('04:12'));
  // Today (9 Nov): 06:00 High, 12:12 Low, 18:25 High = 3 chips.
  check('today strip has 3 chips', (await ev(`document.querySelectorAll('#todayStrip .tide-chip').length`)) === 3);
  check('today strip shows 06:00', (await ev(`document.getElementById('todayStrip').textContent`)).includes('06:00'));
  check('today strip shows 18:25', (await ev(`document.getElementById('todayStrip').textContent`)).includes('18:25'));
  check('7-day table has 7 day blocks', (await ev(`document.querySelectorAll('#weekBody tr.day-block').length`)) === 7);
  check('day 1 is spring tide', (await ev(`document.querySelector('#weekBody tr').textContent`)).includes('Spring tide'));
  check('moon line shows New Moon', (await ev(`document.getElementById('moonPhase').textContent`)) === 'New Moon');
  check('moon age ~28.7 days', (await ev(`document.getElementById('moonAge').textContent`)).startsWith('28.7'));

  // ---- Calibration persists across reload; switching station shows empty ----
  await send('Page.navigate', { url: FILE });
  await wait(1200);
  check('calibration persists after reload', (await ev(`document.getElementById('results').hidden`)) === false);
  check('next tide still 12:12 after reload', (await ev(`document.getElementById('nextTime').textContent`)) === '12:12');
  await ev(`document.getElementById('stationSelect').value='teknaf'; document.getElementById('stationSelect').dispatchEvent(new Event('change'))`);
  check('switching to uncalibrated station shows empty state', (await ev(`document.getElementById('emptyState').hidden`)) === false);
  await ev(`document.getElementById('stationSelect').value='chattogram'; document.getElementById('stationSelect').dispatchEvent(new Event('change'))`);
  check('switching back restores Chattogram tides', (await ev(`document.getElementById('results').hidden`)) === false);

  // ---- Language toggle: Bengali title + digits, persists after reload ----
  await ev(`document.getElementById('langBtn').click()`);
  check('BN toggle: title in Bengali', (await ev(`document.getElementById('title').textContent`)) === '\u09ac\u09be\u0982\u09b2\u09be\u09a6\u09c7\u09b6 \u0989\u09aa\u0995\u09c2\u09b2 \u099c\u09cb\u09af\u09bc\u09be\u09b0-\u09ad\u09be\u099f\u09be');
  check('BN toggle: next time in Bengali digits', (await ev(`document.getElementById('nextTime').textContent`)) === BN('12:12'));
  check('BN toggle: station name in Bengali', (await ev(`document.querySelector('#stationSelect option:checked').textContent`)) === '\u099a\u099f\u09cd\u099f\u0997\u09cd\u09b0\u09be\u09ae');
  await send('Page.navigate', { url: FILE });
  await wait(1200);
  check('BN toggle persists after reload', (await ev(`window.__ttbd.state.lang`)) === 'bn');
  await ev(`document.getElementById('langBtn').click()`);
  check('back to EN', (await ev(`window.__ttbd.state.lang`)) === 'en');

  // ---- Export / import round-trip + malformed import rejected ----
  const payload = await ev(`window.__ttbd.exportPayload()`);
  check('export payload is tide-table-bd v1', payload.includes('"app":"tide-table-bd"') && payload.includes('"version":1'), payload);
  check('export payload carries Chattogram calibration', payload.includes('"chattogram"'));
  await ev(`window.__ttbd.eraseAll()`);
  check('eraseAll restores empty state', (await ev(`document.getElementById('emptyState').hidden`)) === false);
  const imp = await ev(`JSON.stringify(window.__ttbd.importPayload(${JSON.stringify(payload)}))`);
  check('import valid payload ok', imp.includes('"ok":true'), imp);
  check('import restores tides', (await ev(`document.getElementById('results').hidden`)) === false);
  const badImp = await ev(`JSON.stringify(window.__ttbd.importPayload('{"app":"bus-fare-bd","version":1}'))`);
  check('import wrong app rejected', badImp.includes('"ok":false'));
  check('invalid import leaves data intact', (await ev(`window.__ttbd.exportPayload()`)).includes('"chattogram"'));
  const badJson = await ev(`JSON.stringify(window.__ttbd.importPayload('{not json'))`);
  check('malformed JSON rejected', badJson.includes('"ok":false'));

  // ---- Bad import via UI textarea shows visible error ----
  await ev(`document.getElementById('importText').value='{not json'; document.getElementById('importBtn').click()`);
  check('bad UI import shows error', (await ev(`document.getElementById('importFail').hidden`)) === false);
  check('good UI import succeeds', (await ev(`document.getElementById('importText').value=${JSON.stringify(payload)}; document.getElementById('importBtn').click(); document.getElementById('importOk').hidden`)) === false);

  // ---- Typed-DELETE erase via UI; wrong word rejected ----
  await ev(`document.getElementById('eraseInput').value='delete'; document.getElementById('eraseBtn').click();`);
  check('wrong erase word rejected', (await ev(`document.getElementById('eraseWrong').hidden`)) === false);
  check('wrong erase keeps data', (await ev(`window.__ttbd.exportPayload()`)).includes('"chattogram"'));
  await ev(`document.getElementById('eraseInput').value='DELETE'; document.getElementById('eraseBtn').click();`);
  check('DELETE erases data', (await ev(`window.__ttbd.exportPayload()`)).includes('"calibrations":{}'));
  check('erase success message shows', (await ev(`document.getElementById('erasedMsg').hidden`)) === false);
  check('empty state returns after erase', (await ev(`document.getElementById('emptyState').hidden`)) === false);

  // ---- Mobile 390px: no horizontal overflow ----
  await ev(`document.getElementById('calInput').value='2026-11-09T06:00'; document.getElementById('saveCalBtn').click()`);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: FILE });
  await wait(1200);
  const overflow = await ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  check('390px no horizontal overflow', overflow <= 0, 'overflow=' + overflow);

  // ---- Zero network requests: app is fully offline (only file:// loads) ----
  const reqs = await ev(`performance.getEntriesByType('resource').map(r => r.name).filter(n => !n.startsWith('file://')).length`);
  check('zero non-file network requests', reqs === 0, 'non-file=' + reqs);

  check('no console/page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  chrome.kill();
  console.log('\n' + count + ' checks, ' + failures + ' failed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL - harness error: ' + e.message); try { chrome.kill(); } catch (_) {} process.exit(2); });
