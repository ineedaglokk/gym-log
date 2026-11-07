# DEVLOG — project journal

Rules: no duplicates. If an entry about this feature or bug exists, update it instead of adding a new one.
Search here by keywords (grep); don't read the whole file.
History before 2026-11-07: git log and README / ОПИСАНИЕ.md "Последние обновления".

## Open issues
### [OPEN] «⇄ Заменить» carries history to a different exercise
- Symptom: after replacing an exercise, "прошлый раз" shows the old exercise's sets and weights are prefilled from it; progress compares two different movements.
- Tried: nothing yet; same id on replace was a deliberate earlier decision ("История и прогресс на месте").
- Hypothesis / next step: two modes — «Заменить навсегда» (new history) and «Заменить на сегодня»; needs the user's call. See docs/analysis-2026-11.md §3.
- Since: 2026-11-07

## Risks & gotchas
- After editing app.js / cat.js / progress.js, update its `?v=` in index.html (first 8 chars of `shasum`), or Telegram serves the cached file.
- Telegram CloudStorage: 4096 chars per value (app stops at 4000), 1024 keys per user.
- Bot KV on the Cloudflare free tier: ~1000 writes/day caps active bot users at a few hundred.
- app.js is ~1460 lines (over the ~1000 limit): new logic goes into separate files like progress.js.

## Done
- 2026-11-07 — progress v2: noise band (−1 rep is not a drop), 12-rep cap for the rep↔weight formula, all sets on one weight shown as reps, month compared with the end of the previous month, "Просело" only two workouts in a row; progress math moved to progress.js with node tests — progress.js, app.js, tests/progress.test.js

## Bugs & fixes
### [BUG] Month progress showed "Просело" for an exercise that grew over the month
- Symptom: Leg press 100×12 → 110×12 → 110×11 in a month showed «Просело −1 повт.»; the +10 kg did not show at all.
- Cause: monthSummary checked "last vs previous workout" (down) before "last vs first of the month" (up); a −1 rep counted as weaker; only the best set counted; the window was the calendar month.
- Didn't help: —
- Fixed by: periodTrend in progress.js — start = end of the previous month (≤42 days) or the first workout, end = the better of the last two; down only when both last workouts are weaker; sets weaker only beyond 4% (1RM test-retest CV ≈4%); trade-offs by Epley only ≤12 reps.
- Prevention: tests/progress.test.js covers these cases; run `node --test` before pushing progress changes.
- Dates: 2026-11-07
