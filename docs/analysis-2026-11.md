# Product & progress analysis — 2026-11-07

Why: the user felt the progress logic "loses" progress and is not science-based, and there is no way to log
supersets / drop sets. This doc: what is wrong in our math (verified on seeded data in the live app), what
competitors and the literature say, and a proposed design. Implemented 2026-11-07: §2 items 1–4 (month vs end of previous month instead of a rolling
window, best of last two, noise band, 12-rep cap, all reps on one weight) and §3 (drop sets, supersets, replace
with a history choice, today's substitute; plus no drop after a superset change or a 2+ week break). The rest is not implemented yet.

## 1. Our progress logic: what is wrong

Current model (`app.js`, section "progress"): a workout of an exercise is judged by its **best set**;
trade-offs (more kg, fewer reps) use Epley `w × (1 + r/30)` with a 2% "same" band; if the best set is equal,
total work (Σ kg×reps) +2% counts as progress. Month view: "up" = last session vs first session of the
calendar month, "down" = last session vs the previous one, and "down" is checked first.

| # | Problem | Example (reproduced in the live app on seeded data) | Effect |
|---|---|---|---|
| 1 | One weak last session hides the whole month's gain ("down" is checked before "up") | Leg press 100×12 → 110×12 → 110×11 shows **"Просело −1 повт."**; the +10 kg for the month is not shown at all | Most visible "lost progress" |
| 2 | Only the best set counts; other sets are ignored unless the best set is exactly equal | Incline DB 16 kg: 11,10,9 → 12,12,11 shows "+1 повт."; total reps 30 → 35 (+17%) | Real progress understated |
| 3 | Calendar-month window | 20 Oct → 6 Nov (90×12 → 110×11) is invisible; first sessions of a month show nothing | Long-term trend hidden |
| 4 | Single-session noise treated as signal | −1 rep (≈3% of a 10-rep set) = "Просело"; 1RM test-retest CV is ≈4% (§6) | False alarms, bot says "просело" |
| 5 | «⇄ Заменить» keeps the same id, so the new exercise inherits the old one's history | Swap DB press 16 kg → machine press: "прошлый раз 16×12", weights prefilled with 16, then a fake jump | Comparisons across different movements |
| 6 | No effort data (RIR / failure) | 60×10 with 3 reps left = 60×10 to failure | Can't tell progress from effort; «Прокачать» fires on reps only |
| 7 | Epley used for trade-offs at any rep count | Above ~10–12 reps formulas break down (Strong/Boostcamp cut off at 12) | Wrong verdicts on calves, lateral raises, abs |
| 8 | No volume-per-muscle view | — | The main hypertrophy driver (hard sets/week) is not shown |

Fine and should stay: best set protects from a tired last set; bodyweight handling; warm-ups separate and
excluded (same as Hevy/Boostcamp); weight never rises by itself — the lifter taps «Прокачать» (double progression).

## 2. Proposed progress model v2

1. **Rolling window, not a calendar month.** Per exercise: best of the last 2 sessions vs best of the
   sessions ~4 weeks earlier. The month screen keeps navigation; items say "за 4 недели" + all-time chart.
2. **Set N vs set N.** Besides the best set, compare each working set with the same set last time
   (reps drop across sets naturally, rest length drives it — §6). "Better" if the best set or the
   position-wise sets improved and nothing dropped beyond noise.
3. **Noise-aware verdicts.** «Рекорд» = beats all-time best beyond noise; «Растёт» = window trend > ~4%;
   «Чуть лучше» = +1 rep / small step (kept, it motivates, but not a record); «Просело» only if > ~5% below the
   recent best **or** two sessions in a row. A single dip is a soft note inside the item, not a red category,
   and the bot does not call it "просело".
4. **No formula above 12 reps.** Trade-offs use Epley only when both sets are ≤ 12 reps; otherwise compare
   reps at the same weight (rep PR) — the Strong/Boostcamp rule. Still never shown as a "1RM".
5. **Optional effort tap** per exercise after the last set: «запас 3+ / 1–2 / 0 (отказ)». Advice only: top of
   range with 2+ in reserve → suggest the step now; bottom of range at failure → stay. Never required.
6. **Weekly hard sets per muscle group** (catalog group, direct sets only): working sets with reps ≥ bottom of
   range; drops as a fraction (§3). Band ~10–20 sets/week as guidance, not a rule.
7. **Record types + live toast** (Hevy): heaviest weight, best set, most reps at a weight. When a typed set beats
   a record → toast «🏆 Рекорд: 110×12» + haptic.
8. **Reps placeholder = last time's reps for that set** (now it is the top of the range); weights already
   prefill by position.

## 3. Supersets, drop sets, rest-pause — design

**Drop set / rest-pause ("добивка")** — extra mini-sets right after a working set, lighter (drop) or same
weight (rest-pause).
- UI: «+ дроп» next to «+ разминка»; a row of up to 3 kg×reps cells attached to the last working set.
  Prefill: last time's drops, else ~75–80% of the working weight.
- Storage: `x.dr = {w:[…], r:[…]}` in the day record, same shape as warm-ups (`x.wu`). Old records unaffected.
- Progress: never the best set, never blocks «Прокачать», not in "all sets at top"; shown in "прошлый раз" as
  `→ дроп 80×8, 60×6`; weekly sets: +0.5 per drop (practitioner convention, no consensus in literature).
- Science: drop sets give hypertrophy similar to traditional sets in less time (Sødal 2023, Coleman 2022).

**Superset / giant set** — exercises done alternately.
- Program editor (exercise sheet): «🔗 Суперсет со следующим», labels A1/A2/A3.
- Storage: workout-level groups in the packed program, `w[4] = [["incline","row"]]` (positional array grows at
  the end; old clients ignore it). Day record stores `doc.ss` so history knows the session was supersetted.
- Log: grouped exercises in one block with a coloured side bar, hint "по подходу из каждого по очереди".
- Progress: if one compared session was supersetted and the other not, a drop is not "Просело"
  ("в суперсете — сравнение условное").

**Exercise replacement** — two intents:
- «Заменить навсегда»: new exercise, own history; old history stays under the old exercise, visible.
- «Заменить сегодня» (machine busy): one-day substitute with its own history; the planned one is skipped that
  day, its progress untouched.
- Current behaviour (shared id, history carries over) was a deliberate earlier decision — needs the user's call.

## 4. Other UX ideas (from competitors), by value / effort

| Idea | Who does it | Value | Effort |
|---|---|---|---|
| Rest timer, auto-starts when reps are typed; skipped before a drop and inside a superset round | Hevy, Strong | High | M (only while app is open; haptic + sound) |
| Live record toast | Hevy | High | S |
| Records table per rep count (actual) | Strong, Boostcamp | Medium | S–M |
| Plate calculator + auto warm-up from the first working set (40%×5, 60%×5, 80%×3) | Boostcamp | Medium | S |
| Weekly sets per muscle | RP, Alpha Progression | High | M |
| Per-set targets for next time | Alpha Progression | Medium | M |
| Repeat a past workout in one tap | Healwork | Low (we plan by program) | S |

## 5. Competitors (research brief, 2026-11-07)

- **Hevy**: set types Normal / Warm-up / Failure / Drop via tap on the set number; superset = "+ Add To
  Superset", colour bar, auto-scroll, timer after the round; setting "include warm-ups in stats"; live PR on
  set tick; PR types heaviest / best 1RM / best set volume / session volume. Log only, no suggestions.
- **Strong**: densest "spreadsheet" log, previous column, auto rest timer, plate calculator; records only for
  ≤ 12 reps, Brzycki; actual + predicted best per rep count.
- **Alpha Progression**: per-set weight×reps targets from past sessions and today's earlier sets; optional RIR;
  mesocycles with deload; recommendations behind a paywall.
- **Fitbod**: generates workouts; e1RM, strength score, muscle recovery heat-map; complaints about
  black-box suggestions.
- **Boostcamp**: program library; records 1–12 reps; warm-ups excluded from records; auto warm-ups.
- **RP Hypertrophy**: asks pump / workload / joint pain / soreness, adjusts weekly sets.
- **Telegram / RU**: no strong product found (Repka, StradeAI, GymNote, paid "Operator"); RuStore
  "Мой подход", Healwork. A polished free TG gym log is an open niche.
- Common complaints: paywalls on the core loop, black-box suggestions, e1RM wrong on high reps, too many taps.

## 6. Science (sources)

- e1RM: best ≤ 10 reps (Reynolds 2006, https://www.unm.edu/~rrobergs/478RMStrengthPrediction.pdf);
  accuracy varies by exercise (LeSuer 1997); apps cut off at 12.
- Hypertrophy follows hard sets, not tonnage: dose-response with diminishing returns (Pelland, preprint,
  https://sportrxiv.org/index.php/server/preprint/view/537); closer to failure → more growth, strength barely
  affected (Robinson 2024, Sports Med 54:2209); light vs heavy to failure → similar growth, heavy → more 1RM
  (Schoenfeld 2017, https://pubmed.ncbi.nlm.nih.gov/28834797/). Volume load is a poor cross-load proxy.
- Drop sets ≈ traditional sets for hypertrophy, less time (Sødal 2023, https://pmc.ncbi.nlm.nih.gov/articles/PMC10390395/;
  Coleman 2022). Supersets / rest-pause: equivalent, time-saving (secondary sources, unverified).
- Progressing reps or load: similar hypertrophy (Plotkin 2022, https://peerj.com/articles/14142).
- Noise: 1RM test-retest median CV 4.2% (Grgic 2020, https://pmc.ncbi.nlm.nih.gov/articles/PMC7367986/) →
  +1 rep (≈2.6–3.3%) is within noise; real progress = > 4–5% or a 3+ session trend.
- Rest: reps fall across sets at any rest length; longer rest → more total reps (Willardson & Burkett 2005/2006);
  > 60–90 s rest small hypertrophy benefit (Singer 2024). Compare set N with set N, never with today's set 1.

## 7. Constraints

- Telegram CloudStorage: 4096 chars per value (app stops at 4000), 1024 keys per user (one key per workout
  day → ~6 years at 3/week). Drops add ~20–40 chars per exercise; superset groups ~30 chars per workout.
- No background timers in a closed Mini App; a rest timer works only while the app is open.
- `app.js` is already 1582 lines: new logic goes into separate files (`progress.js`, `sets.js`), loaded
  before `app.js`, each with its own `?v=` hash.
