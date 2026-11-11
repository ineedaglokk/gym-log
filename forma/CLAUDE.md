# FORMA

Personal fitness web app (PWA) for the owner and up to ~4 people: workouts, food diary, recipes, trackers, weekly
conclusions, two AI assistants, personal accounts. UI and texts in Russian. Lives in `forma/`, separate from the
Shlyopa Telegram mini app and bot in the repo root (they keep working as they are).

## Stack
- Static site: plain HTML/CSS/ES modules, no build, no dependencies. Fonts from Google Fonts (Oswald, Golos Text).
- Data: every person's journal lives in their account on the server; the device keeps a full copy (IndexedDB,
  localStorage fallback) and works offline. Without a server address (`API_URL` empty) the app runs without accounts.
- Server: `server/worker.js` — Cloudflare Worker + D1 (accounts, sync) + Workers AI (assistants). NOT deployed yet;
  `server/dev.js` runs the same code locally on Node's SQLite.

## Commands
- Run the site: `python3 -m http.server 8765` in the repo root → http://localhost:8765/forma/ (preview "gym-log").
- Run the local server: `node server/dev.js` → http://localhost:8787 (preview "forma-api"). The app on localhost
  needs it: it shows the sign-in screen and talks to this address.
- Tests: `cd forma && node --test` (node built-in runner, 94 tests; needs Node 22.5+ for `node:sqlite`).
- Syntax: `for f in js/*.js js/*/*.js server/*.js sw.js; do node --check "$f"; done`

## Structure (every file ≤ ~500 lines; one job per file)
- `index.html` — shell; loads `shared/cat.js`, `shared/progress.js`, then `js/main.js`.
- `css/` — `base.css` tokens + shell + motion, `components.css`, `screens-day|gym|food|more.css`.
- `js/core/` — `store.js` (state + persistence + backup), `db.js` (storage backends), `account.js` (session on the
  device, calls to the server), `sync.js` (device ↔ account), `router.js`, `dates.js`, `format.js`, `dom.js`.
- `js/ui/` — `icons.js`, `ring.js`, `chart.js`, `sheet.js` (sheets, toasts, dialogs), `trackers.js`, `thumb.js`.
- `js/domain/` — `catalog.js` (exercise library), `training.js`, `nutrition.js`, `summary.js` (rings, insights),
  `report.js`, `coach.js`, `session.js` (sign up / in / out). No DOM here; covered by tests.
- `js/screens/` — one file per screen: auth, onboarding, today, quick-add, gym, workout, program, library, exercise,
  food, food-add, recipes, recipe, stats, calendar, profile, report, coach.
- `js/data/` — `foods.js` (321 foods per 100 g), `recipes-a.js`, `recipes-b.js` (48 recipes; macros are computed).
- `shared/` — copies of the root `cat.js` and `progress.js` (see `shared/README.md`). `img/ex/` — copy of root `img/`.
- `server/` — `worker.js` (routes), `accounts.js`, `sync.js`, `lib.js` (assistants), `http.js`, `schema.sql`,
  `d1-node.js` + `dev.js` (local stand-in), `wrangler.toml.tpl`, `README.md` (API rules, deploy steps).
- `tests/` — `setup.js` loads the shared browser scripts into Node; import it first. `sync.test.js` runs the app's
  modules against the real server code.

## Data (see the headers of `js/core/store.js`, `js/core/sync.js`, `server/sync.js`)
- Journal keys: `profile`, `program`, `settings`, `foods`, `favs`, `recent`, `gone`, `chats`, `d:YYYY-MM-DD`.
- Day: `{ w: { id, ex: { <exId>: { w:[], r:[], wu, nt } }, sk, t0 }, food: [ { id, m, n, g, k, p, f, c, fid?, rid?, t } ], water, steps, sleep, bw }`.
- Device-only keys start with `@`: `@account { nick, name, token }`, `@sync { cursor }`, `@dirty [keys]`.
  Never exported, never synced. The password is never kept on the device, only the session token.
- Sync: a changed key is sent 2.5 s later (`POST /sync`), other devices' changes come back in the same answer.
  Conflict on a day → merged (`mergeDay`); on anything else → the account's value wins.
- Program and exercise records have the same shape as in the mini app, so `shared/progress.js` works unchanged.
- Backup file: `{ app: "forma", v: 1, data }`; restore merges (local days win) or replaces.

## Project rules
- Records are keyed by exercise id — never change an id on rename.
- Screens never write to storage directly: only `save()` / `updateDay()` from `store.js` (they report to sync).
- A new journal key must be added in three places: `DEFAULTS` in `store.js`, `KEY` in `server/sync.js`, the docs here.
- Every user-typed or external string goes through `esc()` before `innerHTML`.
- A screen that has inputs must not re-render while the user types (see `typingIn`, workout and auth screens).
- Inputs keep `font-size ≥ 16px` (iOS zooms otherwise); tap targets ≥ 44 px.
- Metric colours are fixed: food orange, gym blue, water cyan, sleep violet, steps lime (`--m-*`).
- After editing `shared/*` keep it identical to the root file (or change both).
- Push to `main` publishes the whole repo on GitHub Pages, including `forma/`. Only on explicit go.

## Decisions (why)
- Web app, not native: no App Store, no weekly re-signing, works on any phone; Apple Health is not needed.
- No build step: deploys as files, nothing to break. Own data model, compatible with the mini app's records.
- Accounts are deliberately light (owner's ask, 2026-11-11): a nickname and any password from 4 characters, typed
  once per device, no e-mail. A new password is set from a signed-in device without asking the old one — that is
  the only recovery. Guessing is stopped by the lock after 5 misses, not by password rules.
- One server for accounts, sync and assistants (a signed-in session replaced the assistants' access codes).
- Not built on purpose (rejected by the owner for the mini app, 2026-11-07): rest timer, one-tap sets, live record
  toast, workout summary / stories, plate calculator. No paid / free split.
- Assistants run on Cloudflare Workers AI (pay per question, free daily allowance), not a self-hosted model:
  a model kept in memory on Railway costs from ~$60 a month, a sleeping one answers for minutes.
- Recipe covers are emoji on gradients: no licensed photos available.

## Current status
- Done 2026-11-11: first full version (all screens) + accounts with sync between devices; checked in the preview
  with the local server at 320 / 375 / 393 / 430 px.
- Not done: the server is not deployed, so accounts, sync and assistants work only locally (needs the owner's go,
  a check of the model id and of the CPU limit, see `server/README.md`); not tried on a real iPhone; no supersets /
  drop sets / replace-exercise; no barcode scanner; no import of the mini app's journal; no reminders; no "delete
  my account" button.
- Git: branch `forma-app`, nothing committed.
- Next step: owner looks at the app → fixes → deploy the server (Cloudflare) and put its address into `API_URL` →
  deploy the site to Pages.
