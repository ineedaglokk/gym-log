# Shlyopa (gym-log)

Telegram Mini App: a full-body workout journal (sets, weights, reps, progress, yearly calendar) plus "Шлёпа", a reminder/report bot. UI and texts in Russian.

## Stack
- App: plain static HTML/CSS/JS, no build, no dependencies (`telegram-web-app.js`, Google Fonts from CDN).
- Bot: Cloudflare Worker (ES module, no deps), Workers KV, cron every 15 min.
- Data: Telegram CloudStorage per user; localStorage fallback when opened outside Telegram.

## Hosting & deploy
- GitHub: `ineedaglokk/gym-log` (public), branch `main`.
- App: GitHub Pages, legacy build from `main` / root → https://ineedaglokk.github.io/gym-log/ (auto on every push, ~25 s).
- Bot: `.github/workflows/bot.yml` on push to `main` touching `bot/**` (or manual run): finds/creates KV namespace `shlepa-bot`, writes `bot/wrangler.toml` from the `.tpl`, `wrangler@3 deploy`, puts `BOT_TOKEN` secret, sets Telegram webhook `<worker>/tg` + commands.
- Worker URL: https://shlepa-bot.iwbbtbtb.workers.dev (GET `/` → "Шлёпа на месте 💪").
- Repo secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `BOT_TOKEN`. No local `.env`; tokens live only in GitHub secrets.
- Mini App link is set in @BotFather (Configure Mini App / Menu Button) to the Pages URL.

## Commands
- Run locally: `python3 -m http.server 8000` in the root → http://localhost:8000 (local mode, localStorage; no cloud, no bot).
- Tests (progress math): `node --test` (node built-in runner, no deps; `tests/progress.test.js`).
- Syntax check: `node --check app.js && node --check progress.js && node --check cat.js && node --check --input-type=module < bot/worker.js`
- Local preview config: `.claude/launch.json` (python http.server on 8765, gitignored). No linter.

## Structure
- `index.html` — markup + all CSS (style ends ~line 411); loads `cat.js`, `progress.js`, `app.js`, each with `?v=…`.
- `progress.js` — pure progress math (`window.GymProgress`, also `require`-able): `cmpSets`, `judge`, `periodTrend`, `levelUp`, `rampTip`.
- `app.js` — the rest of the app in one IIFE: storage (`persist`, `cs`), views (`renderLog`, `renderProgEditor`, `renderYear`, `renderProgress`), library, bot sync (`syncRemind`, `sendReport`), boot at the end.
- `cat.js` — `window.CAT`: 11 muscle groups, equipment, 1045 exercises (fitpush.ru slugs, photo flag), `m` = old seto names → new ids.
- `img/` — 277 exercise photos `<Name>_0.jpg` (Free Exercise DB).
- `bot/worker.js` — routes `/tg` (webhook, secret = sha256("shlepa-hook:"+token)[:48]), `/sync`, `/workout` (both verify Telegram initData HMAC, max age 7 days), `scheduled` → `tick()`.
- `bot/lines.js` — all bot phrases (REMIND, FUN, ANSWER, AFTER, …); safe to extend.
- `docs/analysis-2026-11.md` — progress-logic flaws, competitors, science, planned design (progress v2, drop sets, supersets).
- `README.md` — full feature/progress-logic description (RU). `ОПИСАНИЕ.md` — short RU summary, local only (not in repo).

## Data
- CloudStorage keys: `program` (user program; exercise options at [11] `{l,d,p}` = superset link, drops, replaced exercise), `remind` (bot settings, `v:2`), `gone` (exercises that left the program, packed, for their cards), `w_YYYY-MM-DD` (one workout: `{date,bw,wk,ex:{<exId>:{w,r,wu,dr,nt}},sk,sb,xd,ss}`). App refuses values >4000 chars.
- localStorage: `tg-gym-log-v1`, `tg-gym-prog-v1`, `tg-gym-remind-sync`.
- Bot KV: `user:<telegramId>` → settings (on, fun, hour, tz, days), mood/sick state, pending report `rep`, seen phrases.
- Bot only receives reminder settings and today's best-set comparison, never the full journal.

## Project rules
- After editing `app.js`, `progress.js` or `cat.js`, update its `?v=` in `index.html` = first 8 chars of `shasum <file>` (sha1). Otherwise Telegram serves the cached old file.
- Hardcoded URLs: `BOT_API` in `app.js`; `APP_URL`/`APP_ORIGIN` in `bot/worker.js` (CORS allows only the Pages origin). Change both together if hosting moves.
- Workout records are keyed by program exercise id, not name — never change ids on rename/replace (history depends on it).
- Push to `main` = prod deploy (app always, bot if `bot/**` changed). Only on explicit go.
- Photos: Free Exercise DB, license unknown (likely Bodybuilding.com). Don't add more without checking.

## Decisions (why)
- Rejected by the user (2026-11-07), don't re-propose: rest timer, one-tap sets, live record toast, home-screen shortcut, workout summary/stories, plate calculator.
- Bot messages stay short (head + ≤3 highlights + next time); details live in the app.
- No server for the app — CloudStorage keeps each user's data in their own Telegram account, free hosting on Pages.
- Bot on Cloudflare Workers free tier, not Railway — cron + KV for free.

## Current status
- Done: live and working (last deploy 2026-11-08: exercise card, weekly sets, short bot report). Both live URLs answer.
- In progress: nothing.
- Git: folder connected to `origin` = `ineedaglokk/gym-log` (2026-11-07), `main` tracks `origin/main`. `ОПИСАНИЕ.md` is local only (untracked).
- Done 2026-11-07: progress v2 (noise band, 12-rep cap, month vs previous month, "Просело" only twice in a row) — live (commit b90fd56).
- Done 2026-11-07: drop sets, supersets, replace with history choice + today's substitute, no «просело» after superset change / 2-week break — live (commit 36c145e).
- Done 2026-11-07: exercise card (records by reps, chart, history), «Все упражнения» incl. removed (archive key `gone`), weekly sets per muscle, short bot report — live (pushed 2026-11-08).
- Next step: none set (effort tap from docs/analysis-2026-11.md is still open).
- Open issues: `app.js` ~1850 lines (split by screen = separate task); KV free tier caps bot users. Details in DEVLOG.
