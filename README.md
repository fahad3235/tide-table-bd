# Tide Table BD — Bangladesh Coast Tide Times

Offline, bilingual (English / বাংলা) tide-time predictor for the Bangladesh coast. You enter **one observed high-tide time** at a coastal station and the app projects high and low tides forward using the semidiurnal M2 lunar tide cycle. Times only — no invented station constants, no fake heights, no sample data.

## Problem

Fishers, boat operators and coastal residents in Bangladesh need to know when the next high and low tides will come, but tide tables are usually printed, station-specific, or behind a network connection. This app turns a single observation anyone can make — "the water was highest at 06:00" — into a usable 7-day tide table that works fully offline on a phone.

## Features

- **10 coastal stations**: Chattogram, Cox's Bazar, Teknaf, Kuakata, Mongla, Patuakhali, Sandwip, Hatiya, Kutubdia, Barishal River Port.
- **One-observation calibration**: enter one observed high-tide time per station; calibrations are saved per station in `localStorage` and reloaded when you switch back.
- **Next-tide card**: next high/low tide, its time, and a live countdown ticking every second.
- **Today's tide strip**: today's high/low tides in time order.
- **7-day table**: today + 6 days, each with tide times, a spring / neap / mid-range badge, moon age and moon phase.
- **Moon line**: current moon age in days and phase name (8 phases).
- **Bilingual EN / বাংলা** toggle, persisted in `localStorage`; Bengali digits when Bengali is active.
- **JSON export / import** of calibrations, with strict validation (wrong app, wrong version, unknown station and malformed JSON are all rejected with a visible error).
- **Typed-DELETE erase-all**: all calibrations wiped only after typing `DELETE`.
- **Empty state**: with no calibration for a station, short instructions explain how to observe a high tide. There is no "load example" button and no fabricated tide data anywhere.
- **Deterministic test mode**: `?asof=YYYY-MM-DD` pins "today" and "now" (08:00 Dhaka) so the UI can be tested reproducibly.

## How the M2 model works

Tides on the Bangladesh coast are semidiurnal — roughly two high tides and two low tides per lunar day — driven mainly by the **M2 lunar tide**, whose period is **12.4206012 hours (12 h 25 m 14 s)**.

- High tides are projected at `calibration + k × 12.4206012 h` (k = …, −1, 0, 1, …).
- Low tides fall exactly half a period later: `calibration + (k + 0.5) × 12.4206012 h`.
- Moon age is days since the new moon of 2000-01-06 18:14 UTC, wrapped into the 29.530588853-day synodic month (same anchor as the factory's moon-phase-bd). Spring tides are flagged within 2.2 days of new/full moon; neap tides within 2.2 days of the quarters.

Worked example (verified by the unit tests): calibrate a high tide at **06:00 on 2026-11-09** in Chattogram. The next low tide is **12:12:37** (06:00 + 6 h 12 m 37 s) and the next high tide is **18:25:14**. On 2026-11-09 the moon is ~0.7 days from new moon, so it is a **spring tide**.

## Stack

Vanilla HTML / CSS / JavaScript. No dependencies, no build step, no network requests — open `index.html` in any modern browser.

## Prerequisites

Any modern browser (Chrome, Firefox, Safari, Edge). No installation, no accounts, no keys.

## Install / run

```bash
# just open the file, or serve it locally:
python3 -m http.server 8000
# then visit http://localhost:8000/
```

## Dev commands

```bash
node --test tests/logic.test.js   # unit tests (22 tests)
node tests/smoke.js               # headless-Chrome UI smoke test (50 checks)
```

## Environment

None. The app stores calibrations and the language choice in the browser's `localStorage` only; nothing leaves the device.

## Testing

See [TEST_RESULTS.md](TEST_RESULTS.md). Summary: **22/22 unit tests pass** (`node --test tests/logic.test.js`) and **50/50 headless-Chrome smoke checks pass** (`node tests/smoke.js`), with **0 console/page errors** and **0 non-file network requests**. Key hand-verified numbers: M2 period 12.4206012 h; low tide 12:12:37 and high tide 18:25:14 after a 06:00 calibration on 2026-11-09; 2026-11-09 is a spring tide; 2026-11-16 is a neap tide; 2026-11-24 is a spring tide.

## Deployment

Static site — deploy the folder to GitHub Pages (main branch, root) or any static host.

## Limitations

- **Approximate model**: only the M2 cycle is used. Real tide times shift with weather, wind, river flow and local geography, and can drift about **1 hour over a week** from a single calibration. Recalibrate with a fresh observed high tide every few days.
- **Times only**: the app does not predict tide heights, which need station-specific harmonic constants this app deliberately does not invent.
- **Not for navigation safety**: do not use for navigation. Verify with BIWTA / port notices before fishing or boating.
- **Calibration window**: a calibration older than 90 days is rejected (model drift); a future time is rejected (60-minute clock tolerance allowed).
- Moon age uses the mean synodic month; it can differ from published almanacs by up to about a day.

## Status

Complete MVP, tested (see TEST_RESULTS.md). No known bugs.
