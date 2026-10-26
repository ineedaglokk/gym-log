/* Шлёпа — Telegram bot for the gym log mini app, running on Cloudflare Workers.
   - POST /tg    : Telegram webhook (checked with a secret header derived from the bot token)
   - POST /sync    : the mini app sends reminder settings (checked with Telegram initData signature)
   - POST /workout : the mini app sends today's comparison with the previous session (same check)
   - cron 15 min   : reminders on training days at the hour the user picked, and a report
                     2 hours after the last saved set (not at night)
   Secrets: BOT_TOKEN (wrangler secret). Storage: KV namespace bound as KV. */

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

async function hex(buf) { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join(""); }
async function hookSecret(env) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("shlepa-hook:" + env.BOT_TOKEN));
  return (await hex(d)).slice(0, 48);
}

/* ---------- messages from users ---------- */
async function onUpdate(update, env) {
  const msg = update.message;
  if (!msg || !msg.chat || msg.chat.type !== "private") return;
  const text = (msg.text || "").trim();
  const name = (msg.from && msg.from.first_name) || "";
  await mergeUser(env, msg.from.id, { started: true, blocked: false, name });
  if (text.startsWith("/start")) {
    await tg(env, "sendMessage", {
      chat_id: msg.chat.id,
      text: `Привет${name ? ", " + name : ""}! Я Шлёпа 😼\n\n` +
        "Помогу тебе накачаться: записывай подходы и веса — я подскажу, когда пора добавить вес, " +
        "и покажу, где ты стал сильнее за месяц, а где просел.\n\n" +
        "Открой качалку и отметь дни тренировок — в эти дни я напомню, а через пару часов после тренировки " +
        "напишу, где ты сегодня поднял больше, чем в прошлый раз. Выключить можно в «Программе».\n\n" +
        "Погнали, красавчик (или красавица) 💪",
      reply_markup: openButton()
    });
    return;
  }
  await tg(env, "sendMessage", {
    chat_id: msg.chat.id,
    text: "Я умею открывать качалку, напоминать о тренировках и хвалить за прогресс. Жми кнопку 👇",
    reply_markup: openButton()
  });
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
  const patch = { on: !!body.on, hour, tz, days, name: user.first_name || "" };
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
    up: cleanItems(body.up, 12), down: cleanItems(body.down, 4)
  };
  u.tz = Math.min(840, Math.max(-840, Math.round(Number(body.tz) || u.tz || 0)));
  u.id = user.id;
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

/* ---------- the report after a workout ---------- */
const UP_HEAD = [
  "{n}ебать ты машина 🔥 Сегодня ты поднял больше, чем в прошлый раз:",
  "бро, ебать круто 😼 Сегодня ты стал сильнее:",
  "{n}вот это прогресс 🚀 Сегодня ты обошёл себя прошлого:",
  "бро, это было мощно 💪 Смотри, где сегодня больше:"
];
const UP_TAIL = ["Так держать 💪", "Шлёпа гордится тобой 😼", "Дальше — больше 🚀", "Вот так и растут, бро 🔥"];
const line = x => `• ${x.n} — ${x.now}, а ${x.d} было ${x.was}${x.r ? " 🏆" : ""}`;
function reportText(u, rep) {
  const n = hi(u), up = rep.up || [], down = rep.down || [];
  const downBlock = down.length ? "\n\nЧуть просело:\n" + down.map(line).join("\n") : "";
  if (up.length) {
    const rec = up.some(x => x.r) ? "\n\n🏆 — личный рекорд" : "";
    return cap(pick(UP_HEAD).replace("{n}", n)) + "\n" + up.map(line).join("\n") + rec + downBlock +
      (down.length ? "\n\nПросевшее вернём в следующий раз. " : "\n\n") + pick(UP_TAIL);
  }
  if (down.length)
    return cap(n + "тренировка засчитана ✅") + downBlock +
      "\n\nБывает. Выспись, поешь нормально — и в следующий раз вернём 💪";
  if (rep.c)
    return cap(n + "тренировка засчитана ✅ Веса на уровне прошлого раза. " +
      "В следующий раз попробуй добавить хотя бы повтор или пару кило — Шлёпа проверит 😼");
  return cap(n + "тренировка засчитана ✅ Записал " + rep.n + " упр. — в следующий раз будет с чем сравнить 😼");
}

/* ---------- every 15 minutes: reminders and reports ---------- */
const LINES = [
  "Сегодня «{w}». Погнали 💪",
  "{n}Шлёпа напоминает: сегодня «{w}». Не сливаемся 😼",
  "День «{w}». Вес сам себя не поднимет 🏋️",
  "{n}сегодня «{w}». Запиши подходы — вечером будет чем гордиться 🔥"
];
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
async function say(env, u, text, button, hash) {
  const r = await tg(env, "sendMessage", { chat_id: u.id, text, reply_markup: openButton(button, hash) });
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
  if (w && hour === u.hour && u.last !== day) {
    const t = pick(LINES).replace("{w}", w).replace("{n}", hi(u));
    await say(env, u, cap(t), "📝 Открыть тренировку");
    u.last = day; changed = true;
  }
  if (u.rep && now >= u.rep.due && !u.blocked) {
    if (now - u.rep.due > 14 * 3600e3) { delete u.rep; return true; }   /* too late to be news */
    if (hour < 8 || hour >= 23) return changed;                         /* nobody wants this at night */
    await say(env, u, reportText(u, u.rep), "📈 Мой прогресс", "#year");
    u.repSent = u.rep.date; delete u.rep; changed = true;
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
