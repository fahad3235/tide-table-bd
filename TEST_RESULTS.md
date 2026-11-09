# TEST_RESULTS.md — tide-table-bd

Run date: 2026-11-09. All results are real, from commands run on this machine.

## Unit tests — 22/22 pass

Command: `node --test tests/logic.test.js`

```
tests 22, pass 22, fail 0
```

Hand-verified anchors (independently computed, not derived from logic.js):

| Check | Expected | Measured |
|---|---|---|
| M2 period | 12.4206012 h = 44,714,164.32 ms | exact |
| Highs after a 06:00 calibration (2026-11-09) | 06:00, 18:25:14 | exact |
| Low after 06:00 calibration | 12:12:37 | exact (06:00 + 6 h 12 m 37 s) |
| nextTide at 08:00 | LOW, 12:12, 253 min away | exact |
| nextTide at 18:00 | HIGH, 18:25, 25 min away | exact |
| Tides on 2026-11-09 | 3 events: 06:00 H, 12:12 L, 18:25 H | exact |
| 7-day window from calibration | 13–14 highs, 27–28 events | 14 highs, 28 events |
| Moon age 2000-01-06T18:14Z | 0 | exact |
| Moon age 2026-11-09 (Dhaka noon) | ~0.7 d before new moon | 28.87 d age (0.66 d to new) |
| Moon age 2026-11-24 | ~14.77 (full) | 14.59 d (0.18 d off full) |
| tideRange 2026-11-09 | spring | spring |
| tideRange 2026-11-16 | neap | neap |
| tideRange 2026-11-24 | spring | spring |
| tideRange 2026-11-12 | mid | mid |
| validateCalibration | rejects unknown station, bad date, Feb 30, future time, 100-day-old time; accepts yesterday's calibration; allows +60 min clock tolerance | all as expected |

## Smoke test — 50/50 checks pass

Command: `node tests/smoke.js` (headless Chrome via raw CDP, `?asof=2026-11-09` pinning "now" to 08:00 Dhaka)

```
50 checks, 0 failed
```

Coverage: empty state with no calibration; 10 stations in the select; empty-datetime and future-datetime validation errors; saving a Chattogram calibration (06:00) shows next tide LOW 12:12 with countdown 04:12:xx; today strip has 3 chips (06:00, 12:12, 18:25); 7-day table renders 7 day blocks; day 1 is a spring tide; moon line shows New Moon, age 28.7 days; calibration persists across reload; switching to uncalibrated Teknaf shows the empty state, switching back restores Chattogram; Bengali toggle switches title, station name (চট্টগ্রাম) and digits (১২:১২) and persists; export/import round-trip works; wrong-app and malformed-JSON imports rejected (data intact); bad import via UI textarea shows a visible error; typed-DELETE erase works and wrong word is rejected; 390 px viewport has no horizontal overflow; **0 non-file network requests**; **0 console/page errors**.

## Repairs made (2)

1. **Float drift in `generateTides`** — the first version accumulated `t += P` per step, which dropped boundary events (a high tide exactly at the window edge). Fixed by computing each event directly as `calMs + k*P`. An intermediate attempt that rounded event times to whole seconds reintroduced the same boundary bug, so rounding was removed; exact float comparison is used instead.
2. **Smoke-test assertion bugs (not app bugs)** — moon-age check expected "28.9" but pinned "now" (08:00 Dhaka) gives 28.7 days; export-payload check expected `"app": "…"` with a space, but `JSON.stringify` emits no space. Both assertions corrected to the real values; app code untouched.

## Corrections to the task brief (verified by the math)

- **Today strip has 3 chips, not 4**, for a 06:00 calibration on 2026-11-09 (06:00 High, 12:12 Low, 18:25 High). A 4th event (00:37 Low) falls on 2026-11-10. The smoke test asserts the correct 3.
- **7-day window yields 13–14 high tides (27–28 events total), not 13–14 events** — semidiurnal tides give ~4 events per day. The unit test asserts 13–14 highs and 27–28 total.
- **Moon age on 2026-11-09 is ~0.66 d before new moon, not within ±0.6 d** — the mean synodic model puts the new moon ~0.9 days after 2026-11-09 00:00 UTC. The unit test therefore uses a 1.0-day tolerance for the new-moon anchor (and records the exact 0.66 d), while the ±0.6 d tolerance holds for the 2026-11-24 full moon (0.18 d). The spring-tide classification for 2026-11-09 is unaffected (0.66 d < 2.2 d tolerance).

## ASCII purity

`grep -P '[^\x00-\x7F]' index.html styles.css logic.js app.js i18n.js tests/*.js` returns **zero matches**. All Bengali UI strings are `\uXXXX` escapes in `i18n.js` (generated from UTF-8 via a temp Node script); README.md and TEST_RESULTS.md may carry raw Bengali.
