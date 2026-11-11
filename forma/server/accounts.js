/* Accounts: a nickname and a password, one session per signed-in device.
   db is a Cloudflare D1 database (env.DB). Only WebCrypto is used, so the same code runs on Node
   (tests, server/dev.js). The password is never stored: only a salted PBKDF2 hash. A device keeps a
   random token; the server keeps its SHA-256. A forgotten password cannot be restored — it can only be
   replaced from a device that is still signed in. */

import { fail } from "./http.js";

export const RULES = {
  nickMin: 3, nickMax: 20, passMin: 4, passMax: 64,
  maxFails: 5,                 /* wrong passwords in a row before the account starts to lock */
  lockMs: 15 * 60000,          /* the first lock; doubles with every further wrong password */
  lockMaxMs: 24 * 3600000,
  iter: 20000,                 /* PBKDF2 rounds: ~1.5 ms, well inside the free plan's 10 ms of CPU per request.
                                  Each account keeps its own count, so changing it never breaks a login. */
  maxUsers: 12,
};

const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const unhex = s => new Uint8Array((String(s).match(/../g) || []).map(h => parseInt(h, 16)));
export const randomHex = bytes => hex(crypto.getRandomValues(new Uint8Array(bytes)));
export const sha256 = async text => hex(await crypto.subtle.digest("SHA-256", enc.encode(text)));

export async function hashPassword(password, salt, iter) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unhex(salt), iterations: iter }, key, 256));
}

/* constant-time comparison of two strings (nothing leaks but the length) */
export function safeEqual(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/* the nickname as typed → { nick: the login, name: as typed }, or null when it breaks the rules:
   3–20 Latin or Russian letters, digits, "_", "." or "-".
   Two nicknames are the same person's when their logins match: letter case, spaces around and "ё" / "е"
   do not count ("Артём" = "артем"). The database refuses a second account with the same login. */
export function cleanNick(raw) {
  const name = String(raw ?? "").normalize("NFC").trim();
  const ok = new RegExp(`^[a-zа-яё0-9_.-]{${RULES.nickMin},${RULES.nickMax}}$`, "i").test(name);
  return ok ? { nick: name.toLowerCase().replace(/ё/g, "е"), name } : null;
}
export const okPassword = p => typeof p === "string" && p.length >= RULES.passMin && p.length <= RULES.passMax;

/* how long the account stays locked after this many wrong passwords in a row */
export const lockFor = fails => (fails < RULES.maxFails ? 0 : Math.min(RULES.lockMs * 2 ** (fails - RULES.maxFails), RULES.lockMaxMs));

async function openSession(db, userId, now) {
  const token = randomHex(32);
  await db.prepare("INSERT INTO sessions (token, user, created, seen) VALUES (?1, ?2, ?3, ?3)").bind(await sha256(token), userId, now).run();
  return token;
}

/* register: { nick, password } → { token, nick, name } */
export async function register(db, env, body, now) {
  const id = cleanNick(body && body.nick);
  if (!id) throw fail(400, "bad nick");
  if (!okPassword(body.password)) throw fail(400, "bad password");
  if (String(env.SIGNUP || "on") === "off") throw fail(403, "signup closed");
  if (await db.prepare("SELECT id FROM users WHERE nick = ?1").bind(id.nick).first()) throw fail(409, "nick taken");
  const { n } = await db.prepare("SELECT COUNT(*) AS n FROM users").first();
  if (n >= (Number(env.MAX_USERS) || RULES.maxUsers)) throw fail(403, "no free places");

  const salt = randomHex(16), iter = Number(env.PBKDF2_ITER) || RULES.iter;
  const hash = await hashPassword(body.password, salt, iter);
  const made = await db.prepare("INSERT OR IGNORE INTO users (nick, name, salt, hash, iter, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(id.nick, id.name, salt, hash, iter, now).run();
  if (!made.meta.changes) throw fail(409, "nick taken");   /* two people took the same nick at the same moment */
  const u = await db.prepare("SELECT id FROM users WHERE nick = ?1").bind(id.nick).first();
  return { token: await openSession(db, u.id, now), nick: id.nick, name: id.name };
}

/* sign in: { nick, password } → { token, nick, name }. An unknown nick and a wrong password answer the same.
   After RULES.maxFails wrong passwords in a row the account locks: 15 min, then twice as long each time. */
export async function login(db, body, now) {
  const id = cleanNick(body && body.nick);
  const u = id ? await db.prepare("SELECT * FROM users WHERE nick = ?1").bind(id.nick).first() : null;
  if (!u) throw fail(401, "wrong password");
  if (u.locked > now) throw fail(429, "locked", { retry: Math.ceil((u.locked - now) / 1000) });

  const password = body.password;
  const ok = typeof password === "string" && password.length <= RULES.passMax && safeEqual(await hashPassword(password, u.salt, u.iter), u.hash);
  if (!ok) {
    const fails = u.fails + 1, wait = lockFor(fails);
    await db.prepare("UPDATE users SET fails = ?1, locked = ?2 WHERE id = ?3").bind(fails, wait ? now + wait : 0, u.id).run();
    throw fail(401, "wrong password", wait ? { retry: Math.ceil(wait / 1000) } : {});
  }
  if (u.fails) await db.prepare("UPDATE users SET fails = 0, locked = 0 WHERE id = ?1").bind(u.id).run();
  return { token: await openSession(db, u.id, now), nick: u.nick, name: u.name };
}

/* the person behind a device token → { id, nick, name, session }; 401 when the token is unknown */
export async function sessionUser(db, token, now) {
  if (!token) throw fail(401, "no session");
  const session = await sha256(token);
  const row = await db.prepare("SELECT u.id, u.nick, u.name, s.seen FROM sessions s JOIN users u ON u.id = s.user WHERE s.token = ?1").bind(session).first();
  if (!row) throw fail(401, "no session");
  if (now - row.seen > 86400000) await db.prepare("UPDATE sessions SET seen = ?1 WHERE token = ?2").bind(now, session).run();
  return { id: row.id, nick: row.nick, name: row.name, session };
}

/* a new password from a signed-in device: { password }. Every other device has to sign in again. */
export async function changePassword(db, env, user, body) {
  if (!okPassword(body && body.password)) throw fail(400, "bad password");
  const salt = randomHex(16), iter = Number(env.PBKDF2_ITER) || RULES.iter;
  const hash = await hashPassword(body.password, salt, iter);
  await db.batch([
    db.prepare("UPDATE users SET salt = ?1, hash = ?2, iter = ?3, fails = 0, locked = 0 WHERE id = ?4").bind(salt, hash, iter, user.id),
    db.prepare("DELETE FROM sessions WHERE user = ?1 AND token <> ?2").bind(user.id, user.session),
  ]);
  return { ok: true };
}

export async function logout(db, user) {
  await db.prepare("DELETE FROM sessions WHERE token = ?1").bind(user.session).run();
  return { ok: true };
}
