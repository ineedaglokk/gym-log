/* Шлёпа — Telegram bot for the gym log mini app, running on Cloudflare Workers.
   - POST /tg    : Telegram webhook (checked with a secret header derived from the bot token)
   - POST /sync  : the mini app sends reminder settings (checked with Telegram initData signature)
   - cron hourly : reminders on training days at the hour the user picked
   Secrets: BOT_TOKEN (wrangler secret). Storage: KV namespace bound as KV. */

const APP_URL = "https://ineedaglokk.github.io/gym-log/";
const APP_ORIGIN = "https://ineedaglokk.github.io";
const DAY_MS = 864e5;

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
    if (url.pathname === "/") return new Response("Шлёпа на месте 💪", { headers: { "content-type": "text/plain; charset=utf-8" } });
    return new Response("not found", { status: 404 });
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendReminders(env));
  }
};

/* ---------- Telegram helpers ---------- */
async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  });
  return r.json().catch(() => ({ ok: false }));
}
const openButton = text => ({ inline_keyboard: [[{ text: text || "💪 Открыть качалку", web_app: { url: APP_URL } }]] });

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
  await mergeUser(env, msg.from.id, { started: true, name });
  if (text.startsWith("/start")) {
    await tg(env, "sendMessage", {
      chat_id: msg.chat.id,
      text: `Привет${name ? ", " + name : ""}! Я Шлёпа 😼\n\n` +
        "Помогу тебе накачаться: записывай подходы и веса — я подскажу, когда пора добавить вес, " +
        "и покажу, где ты стал сильнее за месяц, а где просел.\n\n" +
        "Хочешь, чтобы я напоминал о тренировках? Открой качалку → «Программа» → «Напоминания».\n\n" +
        "Погнали, красавчик (или красавица) 💪",
      reply_markup: openButton()
    });
    return;
  }
  await tg(env, "sendMessage", {
    chat_id: msg.chat.id,
    text: "Я пока умею немного: открывать качалку и напоминать о тренировках. Жми кнопку 👇",
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
  await mergeUser(env, user.id, { on: !!body.on, hour, tz, days, name: user.first_name || "" });
  return json({ ok: true });
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
  const u = await getUser(env, id);
  await env.KV.put("user:" + id, JSON.stringify(Object.assign(u, patch, { id })));
}

/* ---------- reminders ---------- */
const LINES = [
  "Сегодня «{w}». Погнали 💪",
  "{n}Шлёпа напоминает: сегодня «{w}». Не сливаемся 😼",
  "День «{w}». Вес сам себя не поднимет 🏋️",
  "{n}сегодня «{w}». Запиши подходы — вечером будет чем гордиться 🔥"
];
async function sendReminders(env) {
  let cursor;
  do {
    const page = await env.KV.list({ prefix: "user:", cursor });
    for (const k of page.keys) {
      const u = await env.KV.get(k.name, "json");
      if (!u || !u.on) continue;
      const local = new Date(Date.now() - (u.tz || 0) * 60000);   /* tz is getTimezoneOffset(): minutes behind UTC */
      const hour = local.getUTCHours(), wd = (local.getUTCDay() + 6) % 7, day = local.toISOString().slice(0, 10);
      const w = u.days && u.days[wd];
      if (!w || hour !== u.hour || u.last === day) continue;
      const line = LINES[Math.floor(Math.random() * LINES.length)]
        .replace("{w}", w).replace("{n}", u.name ? u.name + ", " : "");
      const r = await tg(env, "sendMessage", { chat_id: u.id, text: line.charAt(0).toUpperCase() + line.slice(1), reply_markup: openButton("📝 Открыть тренировку") });
      u.last = day;
      if (!r.ok && r.error_code === 403) u.on = false;   /* the user blocked the bot */
      await env.KV.put(k.name, JSON.stringify(u));
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
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
