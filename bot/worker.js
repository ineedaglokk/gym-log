/* Шлёпа — Telegram bot for the gym log mini app, running on Cloudflare Workers.
   - POST /tg    : Telegram webhook (checked with a secret header derived from the bot token)
   - POST /sync    : the mini app sends reminder settings (checked with Telegram initData signature)
   - POST /workout : the mini app sends today's comparison with the previous session (same check)
   - cron 15 min   : reminders on training days at the hour the user picked, a report
                     2 hours after the last saved set (not at night), and a random joke
                     every 1–3 days in the afternoon of a rest day
   The reminder has answer buttons (on my way / ill / work / no energy / tomorrow). The bot keeps
   the last answer and brings it up next time; when ill it checks in a day later and stays quiet
   about training and jokes until the user says it is better.
   All the phrases live in lines.js.
   Secrets: BOT_TOKEN (wrangler secret). Storage: KV namespace bound as KV. */

import * as L from "./lines.js";

const APP_URL = "https://ineedaglokk.github.io/gym-log/";
const APP_ORIGIN = "https://ineedaglokk.github.io";
const DAY_MS = 864e5;
const REPORT_DELAY = 2 * 3600e3;

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (url.pathname === "/tg" && req.method === "POST") {
      if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== (await hookSecret(env))) return new Response("forbidden", { status: 403 });
      const update = await req.json().catch(() => null);
      if (update) ctx.waitUntil(onUpdate(update, env).catch(e => console.log("update failed", e)));
      return new Response("ok");
    }
    if (url.pathname === "/sync" && req.method === "POST") return cors(await onSync(req, env));
    if (url.pathname === "/workout" && req.method === "POST") return cors(await onWorkout(req, env));
    if (url.pathname === "/") return new Response("Шлёпа на месте 💪", { headers: { "content-type": "text/plain; charset=utf-8" } });
    return new Response("not found", { status: 404 });
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(tick(env));
  }
};

/* ---------- Telegram helpers ---------- */
async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  });
  return r.json().catch(() => ({ ok: false }));
}
const openButton = (text, hash) => ({ inline_keyboard: [[{ text: text || "💪 Открыть качалку", web_app: { url: APP_URL + (hash || "") } }]] });
const cb = (text, k, day) => ({ text, callback_data: "a:" + k + ":" + day });
const remindKb = day => ({ inline_keyboard: [
  [{ text: "📝 Открыть тренировку", web_app: { url: APP_URL } }],
  [cb("🏃 Уже бегу", "go", day)],
  [cb("🤒 Болею", "sick", day), cb("💼 Завал на работе", "work", day)],
  [cb("😴 Нет сил", "tired", day), cb("🗓 Перенесу на завтра", "tmrw", day)]
] });
const sickKb = day => ({ inline_keyboard: [[cb("💪 Уже лучше", "better", day), cb("🤒 Ещё болею", "still", day)]] });

async function hex(buf) { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join(""); }
async function hookSecret(env) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("shlepa-hook:" + env.BOT_TOKEN));
  return (await hex(d)).slice(0, 48);
}

/* ---------- messages from users ---------- */
async function onUpdate(update, env) {
  if (update.callback_query) return onAnswer(update.callback_query, env);
  const msg = update.message;
  if (!msg || !msg.chat || msg.chat.type !== "private") return;
  const text = (msg.text || "").trim();
  const name = (msg.from && msg.from.first_name) || "";
  const u = await mergeUser(env, msg.from.id, { started: true, blocked: false, name });
  if (/^\/fun\b/i.test(text) || /прикол|шутк|скучн|анекдот/i.test(text)) {
    await tg(env, "sendMessage", { chat_id: msg.chat.id, text: funText(u), reply_markup: openButton() });
    await env.KV.put("user:" + u.id, JSON.stringify(u));   /* remembers what was already told */
    return;
  }
  if (text.startsWith("/start")) {
    await tg(env, "sendMessage", {
      chat_id: msg.chat.id,
      text: `Привет${name ? ", " + name : ""}! Я Шлёпа 😼\n\n` +
        "Помогу тебе накачаться: записывай подходы и веса — я подскажу, когда пора добавить вес, " +
        "и покажу, где ты стал сильнее за месяц, а где просел.\n\n" +
        "Открой качалку, собери свою программу и отметь дни тренировок — в эти дни я напомню, а через пару часов после тренировки " +
        "напишу, где ты сегодня поднял больше, чем в прошлый раз. Иногда буду присылать приколы, " +
        "а если станет скучно — пиши /fun. Выключить всё можно в «Программе».\n\n" +
        "Погнали, красавчик (или красавица) 💪",
      reply_markup: openButton()
    });
    return;
  }
  await tg(env, "sendMessage", {
    chat_id: msg.chat.id,
    text: pick(L.CHAT),
    reply_markup: openButton()
  });
}

/* ---------- answers to the reminder buttons ---------- */
async function onAnswer(q, env) {
  const m = /^a:(go|sick|work|tired|tmrw|better|still):(\d{4}-\d{2}-\d{2})$/.exec(q.data || "");
  const id = q.from && q.from.id;
  if (!m || !id) { await tg(env, "answerCallbackQuery", { callback_query_id: q.id }); return; }
  const k = m[1], d = m[2], now = Date.now();
  const u = Object.assign(await getUser(env, id), { id, started: true, blocked: false });
  if (!u.name) u.name = q.from.first_name || "";
  const today = localDay(u, now);
  if (k === "sick") { u.sick = { since: today, ask: atLocal(u, now, 1, 660 + rnd(120)) }; delete u.mood; }
  else if (k === "still") u.sick = Object.assign(u.sick || { since: today }, { ask: atLocal(u, now, 2, 660 + rnd(120)) });
  else if (k === "better") delete u.sick;
  else {
    u.mood = { k, d };
    if (k === "tmrw") {
      const wd = (new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7;
      u.extra = { d: localDay(u, now + DAY_MS), w: (u.days && u.days[wd]) || "Тренировка" };
    }
  }
  await tg(env, "answerCallbackQuery", { callback_query_id: q.id, text: "Шлёпа запомнил 😼" });
  if (q.message) /* the question is answered: leave only the button that opens the app */
    await tg(env, "editMessageReplyMarkup", { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: openButton("📝 Открыть качалку") });
  const text = fill(pickFor(u, "a_" + k, L.ANSWER[k]), u, { h: String(u.hour == null ? 8 : u.hour).padStart(2, "0") });
  const body = { chat_id: id, text };
  if (k === "go") body.reply_markup = openButton("📝 Записать тренировку");
  if (k === "better") body.reply_markup = openButton();
  await tg(env, "sendMessage", body);
  await env.KV.put("user:" + id, JSON.stringify(u));
}

/* ---------- settings from the mini app ---------- */
async function onSync(req, env) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.initData !== "string") return json({ ok: false, error: "bad request" }, 400);
  const user = await checkInitData(body.initData, env.BOT_TOKEN);
  if (!user) return json({ ok: false, error: "bad signature" }, 403);
  const days = {};
  if (body.days && typeof body.days === "object") {
    for (const [k, v] of Object.entries(body.days)) {
      const d = Number(k);
      if (Number.isInteger(d) && d >= 0 && d < 7) days[d] = String(v || "Тренировка").slice(0, 30);
    }
  }
  const hour = Math.min(23, Math.max(0, Math.round(Number(body.hour) || 8)));
  const tz = Math.min(840, Math.max(-840, Math.round(Number(body.tz) || 0)));
  const patch = { on: !!body.on, fun: body.fun !== false, hour, tz, days, name: user.first_name || "" };
  if (body.wa) patch.blocked = false;   /* the user has just allowed the bot to write */
  const u = await mergeUser(env, user.id, patch);
  return json({ ok: true, started: !!(u.started || user.allows_write_to_pm || body.wa) });
}

/* ---------- today's workout from the mini app ----------
   Only the comparison is sent: exercise name, today's best, the previous best and its date. */
const str = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
function cleanItems(list, max) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, max).map(x => x && typeof x === "object" ? {
    n: str(x.n, 60), now: str(x.now, 24), was: str(x.was, 24), d: str(x.d, 12), r: !!x.r
  } : null).filter(x => x && x.n && x.now && x.was);
}
async function onWorkout(req, env) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.initData !== "string") return json({ ok: false, error: "bad request" }, 400);
  const user = await checkInitData(body.initData, env.BOT_TOKEN);
  if (!user) return json({ ok: false, error: "bad signature" }, 403);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") ? body.date : null;
  if (!date) return json({ ok: false, error: "bad date" }, 400);
  const u = await getUser(env, user.id);
  if (u.on === false || u.repSent === date) return json({ ok: true, skipped: true });
  const n = Math.min(99, Math.max(0, Math.round(Number(body.n) || 0)));
  if (!n) {   /* the record for today was deleted */
    if (u.rep && u.rep.date === date) { delete u.rep; await env.KV.put("user:" + user.id, JSON.stringify(u)); }
    return json({ ok: true });
  }
  u.rep = {
    date, due: Date.now() + REPORT_DELAY, n,
    c: Math.min(n, Math.max(0, Math.round(Number(body.c) || 0))),
    t: Math.min(9999, Math.max(0, Math.round(Number(body.t) || 0))),
    up: cleanItems(body.up, 12), down: cleanItems(body.down, 4)
  };
  u.tz = Math.min(840, Math.max(-840, Math.round(Number(body.tz) || u.tz || 0)));
  u.id = user.id; u.lastW = date;
  delete u.sick;   /* training again — must be better */
  if (!u.name) u.name = user.first_name || "";
  await env.KV.put("user:" + user.id, JSON.stringify(u));
  return json({ ok: true, due: u.rep.due });
}

/* https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app */
async function checkInitData(initData, token) {
  const p = new URLSearchParams(initData);
  const hash = p.get("hash");
  if (!hash) return null;
  p.delete("hash");
  const check = [...p.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k}=${v}`).join("\n");
  const enc = new TextEncoder();
  const k1 = await crypto.subtle.importKey("raw", enc.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const secret = await crypto.subtle.sign("HMAC", k1, enc.encode(token));
  const k2 = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const calc = await hex(await crypto.subtle.sign("HMAC", k2, enc.encode(check)));
  if (calc !== hash) return null;
  const authDate = Number(p.get("auth_date") || 0) * 1000;
  if (!authDate || Date.now() - authDate > 7 * DAY_MS) return null;
  try { return JSON.parse(p.get("user") || "null"); } catch (e) { return null; }
}

/* ---------- storage ---------- */
async function getUser(env, id) { return (await env.KV.get("user:" + id, "json")) || {}; }
async function mergeUser(env, id, patch) {
  const u = Object.assign(await getUser(env, id), patch, { id });
  await env.KV.put("user:" + id, JSON.stringify(u));
  return u;
}

const pick = a => a[Math.floor(Math.random() * a.length)];
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
const hi = u => (u.name ? u.name + ", " : "");
/* a random phrase that was not used recently for this user (the last few are remembered per kind) */
function pickFor(u, kind, arr) {
  u.seen = u.seen || {};
  const recent = (u.seen[kind] || []).filter(i => i < arr.length);
  const keep = Math.min(arr.length - 1, Math.max(1, Math.floor(arr.length / 2)), 10);
  let pool = arr.map((_, i) => i).filter(i => recent.indexOf(i) < 0);
  if (!pool.length) pool = arr.map((_, i) => i);
  const i = pool[Math.floor(Math.random() * pool.length)];
  u.seen[kind] = [i].concat(recent).slice(0, keep);
  return arr[i];
}
function fill(t, u, vars) {
  let s = t.replace("{n}", hi(u));
  for (const [k, v] of Object.entries(vars || {})) s = s.split("{" + k + "}").join(String(v));
  return cap(s);
}

/* ---------- the report after a workout ---------- */
const line = x => `• ${x.n} — ${x.now}, а ${x.d} было ${x.was}${x.r ? " 🏆" : ""}`;
function reportText(u, rep) {
  const up = rep.up || [], down = rep.down || [];
  const downBlock = down.length ? "\n\n" + pickFor(u, "dh", L.DOWN_HEAD) + "\n" + down.map(line).join("\n") : "";
  const ms = L.MILESTONES.indexOf(rep.t) >= 0 ? "\n\n" + fill(pickFor(u, "ms", L.MILESTONE), u, { t: rep.t }) : "";
  if (up.length) {
    const rec = up.some(x => x.r) ? "\n\n🏆 — личный рекорд" : "";
    return fill(pickFor(u, "uh", L.UP_HEAD), u) + "\n" + up.map(line).join("\n") + rec + downBlock +
      (down.length ? "\n\nПросевшее вернём в следующий раз. " : "\n\n") + pickFor(u, "ut", L.UP_TAIL) + ms;
  }
  if (down.length)
    return fill(hi(u) + "тренировка засчитана ✅", u) + downBlock + "\n\n" + pickFor(u, "do", L.DOWN_ONLY) + ms;
  if (rep.c) return fill(pickFor(u, "fl", L.FLAT), u) + ms;
  if (rep.t === 1) return fill(pickFor(u, "f1", L.FIRST), u, { k: rep.n });
  return fill(pickFor(u, "fr", L.FRESH), u, { k: rep.n }) + ms;
}
/* the best thing from the last report, for a joke later */
function bragOf(rep) {
  const up = rep.up || [];
  const x = up.find(i => i.r) || up[0];
  return x ? { ex: x.n, now: x.now.replace(/ × \d+$/, "") } : null;
}
function funText(u) {
  if (u.brag && Math.random() < 0.25) return fill(pickFor(u, "br", L.BRAG), u, u.brag);
  return fill(pickFor(u, "fun", L.FUN), u);
}
const rnd = n => Math.floor(Math.random() * n);
const localDay = (u, ms) => new Date(ms - (u.tz || 0) * 60000).toISOString().slice(0, 10);
const dayGap = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
/* the moment `min` minutes after local midnight, k days from now */
function atLocal(u, now, k, min) {
  const tzMs = (u.tz || 0) * 60000;
  return Math.floor((now - tzMs) / DAY_MS) * DAY_MS + tzMs + k * DAY_MS + min * 60000;
}
/* a random moment 11:00–20:59 local time, between a and b days ahead */
const funAt = (u, now, a, b) => atLocal(u, now, a + rnd(b - a + 1), 660 + rnd(600));

/* the reminder remembers how the last one was answered */
function remindText(u, w, day) {
  if (u.sick) return { text: fill(pickFor(u, "sr", L.SICK_REMIND), u, { w }), kb: sickKb(day) };
  let pool = L.REMIND, kind = "rm";
  const m = u.mood;
  if (m && m.d < day) {
    if (dayGap(m.d, day) <= 10) {
      const k = m.k === "go" ? (u.lastW === m.d || u.repSent === m.d ? "goDone" : "goEmpty") : m.k;
      if (L.AFTER[k]) { pool = L.AFTER[k]; kind = "af_" + k; }
    }
    delete u.mood;
  }
  return { text: fill(pickFor(u, kind, pool), u, { w }), kb: remindKb(day) };
}

/* ---------- every 15 minutes: reminders, reports and jokes ---------- */
async function tick(env) {
  let cursor;
  do {
    const page = await env.KV.list({ prefix: "user:", cursor });
    for (const k of page.keys) {
      const u = await env.KV.get(k.name, "json");
      if (u && (await serveUser(env, u))) await env.KV.put(k.name, JSON.stringify(u));
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
}
async function say(env, u, text, markup) {
  const body = { chat_id: u.id, text };
  if (markup) body.reply_markup = markup;
  const r = await tg(env, "sendMessage", body);
  if (!r.ok && r.error_code === 403) u.blocked = true;   /* the user blocked the bot or never started it */
}
/* returns true when the user record changed */
async function serveUser(env, u) {
  if (!u.on || u.blocked || !u.id) return false;
  const now = Date.now();
  const local = new Date(now - (u.tz || 0) * 60000);   /* tz is getTimezoneOffset(): minutes behind UTC */
  const hour = local.getUTCHours(), wd = (local.getUTCDay() + 6) % 7, day = local.toISOString().slice(0, 10);
  let changed = false;
  const w = u.days && u.days[wd];
  if (u.extra && u.extra.d < day) { delete u.extra; changed = true; }
  const moved = u.extra && u.extra.d === day ? u.extra.w : null;   /* "tomorrow" from yesterday */
  if ((w || moved) && hour === u.hour && u.last !== day) {
    const r = remindText(u, w || moved, day);
    await say(env, u, r.text, r.kb);
    u.last = day; delete u.extra; changed = true;
    if (u.sick) u.sick.ask = null;   /* that reminder already asked */
  }
  if (u.sick) {
    if (dayGap(u.sick.since, day) > 14) { delete u.sick; changed = true; }   /* surely over by now */
    else if (u.sick.ask && now >= u.sick.ask && hour >= 9 && hour < 21) {
      await say(env, u, fill(pickFor(u, "sa", L.SICK_ASK), u), sickKb(day));
      u.sick.ask = null; changed = true;
    }
  }
  if (u.rep && now >= u.rep.due && !u.blocked) {
    if (now - u.rep.due > 14 * 3600e3) { delete u.rep; changed = true; }   /* too late to be news */
    else if (hour >= 8 && hour < 23) {                                     /* nobody wants this at night */
      await say(env, u, reportText(u, u.rep), openButton("📈 Мой прогресс", "#year"));
      u.brag = bragOf(u.rep) || u.brag;
      u.repSent = u.rep.date; delete u.rep; changed = true;
    }
  }
  if (u.fun !== false && !u.blocked && !u.sick) {
    const rest = 7 - Object.keys(u.days || {}).length;
    if (!u.funAt || now - u.funAt > 2 * DAY_MS) { u.funAt = funAt(u, now, 1, 2); changed = true; }
    else if (now >= u.funAt) {
      if ((w && rest > 0) || u.repSent === day || u.rep) { u.funAt += DAY_MS; changed = true; }   /* keep training days for training */
      else if (hour >= 11 && hour < 21) {
        await say(env, u, funText(u), openButton());
        u.funAt = funAt(u, now, 1, 3); changed = true;
      }
    }
  }
  return changed;
}

/* ---------- http helpers ---------- */
function json(obj, status) { return new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json" } }); }
function cors(res) {
  const h = new Headers(res.headers);
  h.set("Access-Control-Allow-Origin", APP_ORIGIN);
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "content-type");
  return new Response(res.body, { status: res.status, headers: h });
}
