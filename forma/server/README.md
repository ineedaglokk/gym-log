# FORMA server

A Cloudflare Worker (`worker.js`) with three jobs:
- **Accounts** (`accounts.js`): nickname + password, one session per signed-in device.
- **Journal sync** (`sync.js`): each person's records, so they open on any device.
- **Assistants** (`lib.js`): trainer and nutritionist on Workers AI, for signed-in people only.

Data lives in a Cloudflare D1 database (`schema.sql`): `users`, `sessions`, `docs`, `usage`.
What is stored about a person: the nickname, a salted password hash, the journal, a daily question counter.
The password, device tokens and questions to the assistants are not stored.

Status: covered by tests (`../tests/server.test.js`, `../tests/sync.test.js` run the real `worker.js` on SQLite) and
used in the local preview through `dev.js`. **Not deployed: never run on Cloudflare, never asked a real model.**

## Run locally
```bash
node server/dev.js
```
Same code on Node: http://localhost:8787, an SQLite file in `server/.dev/` instead of D1, a canned answer instead
of the model. The app opened from `localhost` uses this address by itself (`DEV_API_URL` in `../js/config.js`).
Preview configs: `gym-log` (the site) and `forma-api` (this server) in the repo's `.claude/launch.json`.

## Before deploying
1. Check the model id in `wrangler.toml.tpl` against the current list:
   https://developers.cloudflare.com/workers-ai/models/ (a Qwen text-generation model on the free tier).
2. Check that sign-up and sign-in stay within the free plan's CPU limit: the password hash is PBKDF2 with 100,000
   rounds. If Cloudflare cuts these requests off, lower `PBKDF2_ITER` (existing accounts keep working: the number
   of rounds is stored per account).

## Deploy (needs a Cloudflare login; free within the daily allowances)
```bash
npx wrangler@3 d1 create forma
```
Put the printed `database_id` into a copy of the template:
```bash
sed "s/__D1_ID__/<id>/" wrangler.toml.tpl > wrangler.toml
```
```bash
npx wrangler@3 d1 execute forma --remote --file=schema.sql
```
```bash
npx wrangler@3 deploy
```
`wrangler.toml` is not committed (it is written from the template, like `bot/wrangler.toml`).
Then put the Worker's address (`https://forma-api.<subdomain>.workers.dev`) into `API_URL` in `../js/config.js`:
from that moment the app asks everyone to sign in. Until then it works without accounts.

## Rules of the accounts
- Nickname: 3–20 Latin or Russian letters, digits, `_ . -`. Password: 4–64 characters.
- A nickname can be taken once: letter case and `ё` / `е` do not make it a different one (`Артём` = `артем`).
  Enforced by the `UNIQUE` column `users.nick`, so two simultaneous sign-ups cannot both get it.
- After 5 wrong passwords in a row the account locks for 15 minutes, then twice as long with every further miss
  (up to a day). A right password clears the count.
- A new password can be set from any signed-in device (profile → «Сменить пароль»); the other devices are signed
  out. A forgotten password with no signed-in device left cannot be restored.
- `MAX_USERS` accounts at most (default 12); `SIGNUP = "off"` closes registration once everyone is in.

## Limits
- Sync: a request up to 700,000 characters and 100 keys, a value up to 400,000 characters, 6,000 keys per person.
- Assistants: `DAILY_LIMIT` questions per person per day (default 40); over it the Worker answers 429. On the free
  Workers plan the account-wide allowance is 10,000 neurons a day; when it runs out requests fail until 00:00 UTC —
  no bill.
- `ALLOWED_ORIGINS` lists the sites that may call the Worker from a browser.
