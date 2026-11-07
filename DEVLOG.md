# DEVLOG — project journal

Rules: no duplicates. If an entry about this feature or bug exists, update it instead of adding a new one.
Search here by keywords (grep); don't read the whole file.
History before 2026-11-07: git log and README / ОПИСАНИЕ.md "Последние обновления".

## Open issues
- none

## Risks & gotchas
- After editing app.js / cat.js / progress.js, update its `?v=` in index.html (first 8 chars of `shasum`), or Telegram serves the cached file.
- Telegram CloudStorage: 4096 chars per value (app stops at 4000), 1024 keys per user.
- Bot KV on the Cloudflare free tier: ~1000 writes/day caps active bot users at a few hundred.
- app.js is ~1670 lines (over the ~1000 limit): split by screen (log / program / year / bot sync) is a separate task; new pure logic goes to progress.js.
- Superset links are stored as the next exercise's id (`ln`); saveProg drops links whose pair is no longer adjacent, replaceEx re-points them to a new id.

## Done
- 2026-11-07 — drop sets (x.dr, setting 0–3, log rows), supersets (link to next, grouped cards, day ss), «Заменить» asks about history (fresh by default, pv hint), today's substitute from the skipped card (sb/xd), no «просело» after a superset change or a 2+ week break — app.js, progress.js, index.html, tests
- 2026-11-07 — progress v2: noise band (−1 rep is not a drop), 12-rep cap for the rep↔weight formula, all sets on one weight shown as reps, month compared with the end of the previous month, "Просело" only two workouts in a row; progress math moved to progress.js with node tests — progress.js, app.js, tests/progress.test.js

## Bugs & fixes
### [BUG] «⇄ Заменить» carried history to a different exercise
- Symptom: after replacing an exercise, "прошлый раз" showed the old exercise's sets and weights were prefilled from it; progress compared two different movements (16 kg dumbbells vs a 50 kg machine).
- Cause: replace kept the program slot id; records are keyed by id.
- Didn't help: —
- Fixed by: askReplace/replaceEx — choice "Другое упражнение" (new id, old def kept in `pv` for the hint and old months) vs "То же движение" (old behaviour); separate "today only" substitute.
- Prevention: never reuse an id for a different movement; ids decide what is compared.
- Dates: 2026-11-07
### [BUG] Month progress showed "Просело" for an exercise that grew over the month
- Symptom: Leg press 100×12 → 110×12 → 110×11 in a month showed «Просело −1 повт.»; the +10 kg did not show at all.
- Cause: monthSummary checked "last vs previous workout" (down) before "last vs first of the month" (up); a −1 rep counted as weaker; only the best set counted; the window was the calendar month.
- Didn't help: —
- Fixed by: periodTrend in progress.js — start = end of the previous month (≤42 days) or the first workout, end = the better of the last two; down only when both last workouts are weaker; sets weaker only beyond 4% (1RM test-retest CV ≈4%); trade-offs by Epley only ≤12 reps.
- Prevention: tests/progress.test.js covers these cases; run `node --test` before pushing progress changes.
- Dates: 2026-11-07
