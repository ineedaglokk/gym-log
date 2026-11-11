/* The FORMA server: a Cloudflare Worker with accounts, journal sync and the two assistants.

   POST /auth/register  { nick, password }               → { token, nick, name }
   POST /auth/login     { nick, password }               → { token, nick, name }
   POST /auth/password  { password }            (signed) → { ok }      every other device is signed out
   POST /auth/logout                            (signed) → { ok }
   POST /sync           { since, changes }      (signed) → { cursor, conflicts, changes }   see sync.js
   POST /chat           { role, context, messages } (signed) → { reply, left }
   GET  /               → "ok" (health check)
   (signed) = header "Authorization: Bearer <device token>". Errors: { error: code } with an HTTP status.

   Bindings and variables (wrangler.toml.tpl):
     DB              D1 database (schema.sql): accounts, sessions, journals, daily question counters
     AI              Workers AI binding
     MODEL           model id, e.g. @cf/qwen/qwen3.8-27b (check the catalog: models get deprecated)
     REASONING       the model's reasoning effort: low | medium | xhigh (default low — cheaper, faster)
     DAILY_LIMIT     questions to the assistants per person per day (default 40)
     ALLOWED_ORIGINS comma-separated origins allowed by CORS
     MAX_USERS       how many accounts may exist (default 12);  SIGNUP = "off" closes registration
     PBKDF2_ITER     password hashing rounds (default 20000; Cloudflare allows at most 100000)
   A question to an assistant is not stored: only the counter "how many questions today". */

import { HttpError, fail, bearer, corsHeaders, readJson } from "./http.js";
import { register, login, sessionUser, changePassword, logout } from "./accounts.js";
import { SYNC, checkSync, syncDocs, syncJson } from "./sync.js";
import { checkBody, buildMessages, cleanReply, replyOf } from "./lib.js";

const JSON_TYPE = { "content-type": "application/json; charset=utf-8" };
const OPEN = ["/auth/register", "/auth/login"], SIGNED = ["/auth/password", "/auth/logout", "/sync", "/chat"];

async function chat(env, user, body, now) {
  let input;
  try { input = checkBody(body); }
  catch (err) { throw fail(400, String(err.message || "bad request")); }

  const limit = Number(env.DAILY_LIMIT) || 40, day = new Date(now).toISOString().slice(0, 10);
  /* counted before the model runs, so a failing model cannot be hammered for free */
  const counted = await env.DB.prepare("INSERT INTO usage (user, day, n) VALUES (?1, ?2, 1) ON CONFLICT (user, day) DO UPDATE SET n = n + 1 RETURNING n").bind(user.id, day).all();
  const used = counted.results[0].n;
  if (used > limit) throw fail(429, "daily limit");

  let out;
  try {
    /* the reasoning counts toward max_completion_tokens: the budget leaves room for it and the answer */
    out = await env.AI.run(env.MODEL, { messages: buildMessages(input, user.name), max_completion_tokens: 1800, reasoning_effort: env.REASONING || "low", temperature: 0.4 });
  } catch (err) {
    console.error("model call failed", err && err.message);
    throw fail(502, "model unavailable");
  }
  const reply = cleanReply(replyOf(out));
  if (!reply) { console.error("empty model answer"); throw fail(502, "empty answer"); }
  return { reply, left: limit - used };
}

/* → an object (sent as JSON) or ready JSON text */
async function handle(req, env, now) {
  const path = new URL(req.url).pathname, db = env.DB;
  if (req.method !== "POST" || !(OPEN.includes(path) || SIGNED.includes(path))) throw fail(404, "not found");
  if (path === "/auth/register") return register(db, env, await readJson(req, 2000), now);
  if (path === "/auth/login") return login(db, await readJson(req, 2000), now);

  const user = await sessionUser(db, bearer(req.headers.get("authorization")), now);
  if (path === "/auth/password") return changePassword(db, env, user, await readJson(req, 2000));
  if (path === "/auth/logout") return logout(db, user);
  if (path === "/sync") return syncJson(await syncDocs(db, user.id, checkSync(await readJson(req, SYNC.maxBodyChars))));
  return chat(env, user, await readJson(req, 60000), now);
}

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req.headers.get("origin"), env.ALLOWED_ORIGINS);
    const send = (body, status) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { ...JSON_TYPE, ...cors } });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method === "GET" && new URL(req.url).pathname === "/") return new Response("ok", { headers: cors });
    try {
      return send(await handle(req, env, Date.now()), 200);
    } catch (err) {
      if (err instanceof HttpError) return send({ error: err.code, ...err.extra }, err.status);
      console.error("request failed", err && (err.stack || err.message));
      return send({ error: "server error" }, 500);
    }
  },
};
