import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../server/worker.js";
import { d1 } from "../server/d1-node.js";
import { bearer, corsHeaders } from "../server/http.js";
import { cleanNick, okPassword, lockFor, RULES } from "../server/accounts.js";
import { syncDocs } from "../server/sync.js";
import { checkBody, buildMessages, cleanReply, replyOf, LIMITS } from "../server/lib.js";

const SCHEMA = readFileSync(new URL("../server/schema.sql", import.meta.url), "utf8");

/* the real worker on an in-memory database; call(path, body, token) → { status, data } */
function server(vars = {}) {
  const DB = d1();
  DB.script(SCHEMA);
  const asked = [];
  const env = { DB, ALLOWED_ORIGINS: "https://app.test", DAILY_LIMIT: "2", MODEL: "m", PBKDF2_ITER: "1000",
    AI: { run: async (model, input) => { asked.push(input); return { response: "<think>hm</think>Ответ" }; } }, ...vars };
  const call = async (path, body, token) => {
    const headers = { "content-type": "application/json", origin: "https://app.test" };
    if (token) headers.authorization = "Bearer " + token;
    const res = await worker.fetch(new Request("https://api.test" + path, { method: "POST", headers, body: JSON.stringify(body ?? {}) }), env);
    return { status: res.status, data: await res.json(), cors: res.headers.get("access-control-allow-origin") };
  };
  const join = async (nick, password = "1234") => (await call("/auth/register", { nick, password })).data.token;
  return { env, DB, call, join, asked };
}

/* ---------- accounts ---------- */

test("nickname and password rules", () => {
  assert.deepEqual(cleanNick("  Vlad_01 "), { nick: "vlad_01", name: "Vlad_01" });
  assert.deepEqual(cleanNick("Влад"), { nick: "влад", name: "Влад" });
  assert.deepEqual(cleanNick("АртЁм"), { nick: "артем", name: "АртЁм" });
  assert.equal(cleanNick("ab"), null);
  assert.equal(cleanNick("a".repeat(21)), null);
  assert.equal(cleanNick("vlad petrov"), null);
  assert.equal(cleanNick("<b>x</b>"), null);
  assert.equal(cleanNick(null), null);
  assert.ok(okPassword("1234") && okPassword("п".repeat(64)));
  assert.ok(!okPassword("123") && !okPassword("x".repeat(65)) && !okPassword(1234));
});

test("the lock after wrong passwords starts at the 5th and doubles up to a day", () => {
  assert.equal(lockFor(4), 0);
  assert.equal(lockFor(5), RULES.lockMs);
  assert.equal(lockFor(6), RULES.lockMs * 2);
  assert.equal(lockFor(40), RULES.lockMaxMs);
});

test("register, then sign in from another device; the nickname is not case-sensitive", async () => {
  const s = server();
  const made = await s.call("/auth/register", { nick: "Vlad", password: "qwer" });
  assert.equal(made.status, 200);
  assert.equal(made.cors, "https://app.test");
  assert.deepEqual([made.data.nick, made.data.name, made.data.token.length], ["vlad", "Vlad", 64]);

  const again = await s.call("/auth/login", { nick: "VLAD", password: "qwer" });
  assert.equal(again.status, 200);
  assert.notEqual(again.data.token, made.data.token);

  /* neither the password nor a device token is stored as it is */
  const stored = JSON.stringify([await s.DB.prepare("SELECT * FROM users").all(), await s.DB.prepare("SELECT * FROM sessions").all()]);
  assert.ok(!stored.includes("qwer") && !stored.includes(made.data.token) && !stored.includes(again.data.token));
});

test("registration refuses a taken nick, bad input, a full server and a closed sign-up", async () => {
  const s = server({ MAX_USERS: "3" });
  await s.join("vlad");
  assert.deepEqual([(await s.call("/auth/register", { nick: "VLAD", password: "0000" })).status, (await s.call("/auth/register", { nick: "VLAD", password: "0000" })).data.error], [409, "nick taken"]);
  /* the same nick in another letter case, with spaces around, or with "е" for "ё" is still the same nick */
  await s.join("Артём");
  for (const twin of ["vlad", " Vlad ", "артём", "АРТЕМ", "Артем"]) assert.equal((await s.call("/auth/register", { nick: twin, password: "0000" })).data.error, "nick taken", twin);
  assert.equal((await s.DB.prepare("SELECT COUNT(*) AS n FROM users").first()).n, 2);
  assert.equal((await s.call("/auth/login", { nick: "артем", password: "1234" })).data.name, "Артём");
  assert.equal((await s.call("/auth/register", { nick: "v", password: "0000" })).data.error, "bad nick");
  assert.equal((await s.call("/auth/register", { nick: "anna", password: "1" })).data.error, "bad password");
  await s.join("anna");
  assert.deepEqual([(await s.call("/auth/register", { nick: "oleg", password: "0000" })).status, (await s.call("/auth/register", { nick: "oleg", password: "0000" })).data.error], [403, "no free places"]);
  const closed = server({ SIGNUP: "off" });
  assert.equal((await closed.call("/auth/register", { nick: "vlad", password: "0000" })).data.error, "signup closed");
});

test("a wrong password and an unknown nick answer the same; five misses lock the account", async () => {
  const s = server();
  await s.join("vlad", "right");
  const miss = await s.call("/auth/login", { nick: "vlad", password: "wrong" }), nobody = await s.call("/auth/login", { nick: "nobody", password: "wrong" });
  assert.deepEqual([miss.status, miss.data], [401, { error: "wrong password" }]);
  assert.deepEqual([nobody.status, nobody.data], [401, { error: "wrong password" }]);
  /* a right password in between clears the count */
  assert.equal((await s.call("/auth/login", { nick: "vlad", password: "right" })).status, 200);
  for (let i = 0; i < 4; i++) assert.equal((await s.call("/auth/login", { nick: "vlad", password: "wrong" })).data.retry, undefined);
  const fifth = await s.call("/auth/login", { nick: "vlad", password: "wrong" });
  assert.deepEqual([fifth.status, fifth.data.retry], [401, RULES.lockMs / 1000]);
  const locked = await s.call("/auth/login", { nick: "vlad", password: "right" });
  assert.deepEqual([locked.status, locked.data.error], [429, "locked"]);
  assert.ok(locked.data.retry > 0 && locked.data.retry <= RULES.lockMs / 1000);
});

test("a new password signs out the other devices; the old password stops working", async () => {
  const s = server();
  const phone = await s.join("vlad", "first"), laptop = (await s.call("/auth/login", { nick: "vlad", password: "first" })).data.token;
  assert.equal((await s.call("/auth/password", { password: "12" }, phone)).data.error, "bad password");
  assert.deepEqual((await s.call("/auth/password", { password: "second" }, phone)).data, { ok: true });
  assert.equal((await s.call("/sync", { since: 0 }, phone)).status, 200);
  assert.equal((await s.call("/sync", { since: 0 }, laptop)).status, 401);
  assert.equal((await s.call("/auth/login", { nick: "vlad", password: "first" })).status, 401);
  assert.equal((await s.call("/auth/login", { nick: "vlad", password: "second" })).status, 200);
});

test("signing out ends that device's session only; requests without a session are refused", async () => {
  const s = server();
  const phone = await s.join("vlad"), laptop = (await s.call("/auth/login", { nick: "vlad", password: "1234" })).data.token;
  assert.deepEqual((await s.call("/auth/logout", {}, phone)).data, { ok: true });
  assert.equal((await s.call("/sync", { since: 0 }, phone)).status, 401);
  assert.equal((await s.call("/sync", { since: 0 }, laptop)).status, 200);
  assert.equal((await s.call("/sync", { since: 0 })).status, 401);
  assert.equal((await s.call("/sync", { since: 0 }, "f".repeat(64))).status, 401);
  assert.equal((await s.call("/nothing", {}, laptop)).status, 404);
});

/* ---------- journal sync ---------- */

test("sync: one device sends, the other receives; own changes do not come back", async () => {
  const s = server();
  const phone = await s.join("vlad"), laptop = (await s.call("/auth/login", { nick: "vlad", password: "1234" })).data.token;
  const day = { v: 1, food: [{ id: "f1", n: "Гречка «ядрица»", k: 330 }], water: 500 };

  const sent = await s.call("/sync", { since: 0, changes: [{ k: "profile", v: { name: "Влад" } }, { k: "d:2026-11-10", v: day }] }, phone);
  assert.deepEqual(sent.data, { cursor: 2, conflicts: [], changes: [] });

  const got = await s.call("/sync", { since: 0 }, laptop);
  assert.deepEqual(got.data, { cursor: 2, conflicts: [], changes: [{ k: "profile", v: { name: "Влад" } }, { k: "d:2026-11-10", v: day }] });
  assert.deepEqual((await s.call("/sync", { since: 2 }, laptop)).data, { cursor: 2, conflicts: [], changes: [] });

  /* a deleted key travels as null */
  assert.equal((await s.call("/sync", { since: 2, changes: [{ k: "d:2026-11-10", v: null }] }, laptop)).data.cursor, 3);
  assert.deepEqual((await s.call("/sync", { since: 2 }, phone)).data, { cursor: 3, conflicts: [], changes: [{ k: "d:2026-11-10", v: null }] });
});

test("sync: a key changed by another device since the last exchange is not overwritten", async () => {
  const s = server();
  const phone = await s.join("vlad"), laptop = (await s.call("/auth/login", { nick: "vlad", password: "1234" })).data.token;
  await s.call("/sync", { since: 0, changes: [{ k: "program", v: { n: 1 } }, { k: "settings", v: { theme: "dark" } }] }, phone);
  await s.call("/sync", { since: 2, changes: [{ k: "program", v: { n: 2 } }] }, phone);

  /* the laptop last saw cursor 2: its program is stale, its settings are not */
  const res = await s.call("/sync", { since: 2, changes: [{ k: "program", v: { n: "stale" } }, { k: "settings", v: { theme: "light" } }] }, laptop);
  assert.deepEqual(res.data, { cursor: 4, conflicts: ["program"], changes: [{ k: "program", v: { n: 2 } }] });
  assert.deepEqual((await s.call("/sync", { since: 0 }, phone)).data.changes, [{ k: "program", v: { n: 2 } }, { k: "settings", v: { theme: "light" } }]);
});

test("sync: people never see each other's records", async () => {
  const s = server();
  const vlad = await s.join("vlad"), anna = await s.join("anna");
  await s.call("/sync", { since: 0, changes: [{ k: "profile", v: { name: "Влад" } }] }, vlad);
  assert.deepEqual((await s.call("/sync", { since: 0 }, anna)).data, { cursor: 0, conflicts: [], changes: [] });
});

test("sync refuses unknown keys, repeated keys, non-object values and oversized requests", async () => {
  const s = server(), t = await s.join("vlad");
  const bad = async changes => (await s.call("/sync", { since: 0, changes }, t)).status;
  assert.equal(await bad([{ k: "users", v: {} }]), 400);
  assert.equal(await bad([{ k: "d:2026-1-1", v: {} }]), 400);
  assert.equal(await bad([{ k: "profile", v: {} }, { k: "profile", v: {} }]), 400);
  assert.equal(await bad([{ k: "profile", v: "text" }]), 400);
  assert.equal(await bad([{ k: "chats", v: { t: "я".repeat(400001) } }]), 413);
  assert.equal(await bad(Array.from({ length: 101 }, (_, i) => ({ k: `d:2026-01-${String(i % 28 + 1).padStart(2, "0")}`, v: {} }))), 413);
  assert.deepEqual((await s.call("/sync", { since: 0 }, t)).data, { cursor: 0, conflicts: [], changes: [] });
});

test("sync: two devices writing at the same moment — the second write is checked against the first", async () => {
  const s = server(), t = await s.join("vlad");
  const uid = (await s.DB.prepare("SELECT id FROM users").first()).id;
  await s.call("/sync", { since: 0, changes: [{ k: "profile", v: { n: 0 } }] }, t);
  /* another device slips in between this request's read and its write */
  let raced = false;
  const racy = { prepare: sql => s.DB.prepare(sql), batch: async list => {
    if (!raced) { raced = true; await syncDocs(s.DB, uid, { since: 1, changes: [{ k: "profile", v: '{"n":"other"}' }] }); }
    return s.DB.batch(list);
  } };
  const res = await syncDocs(racy, uid, { since: 1, changes: [{ k: "profile", v: '{"n":"mine"}' }, { k: "favs", v: "{}" }] });
  assert.deepEqual(res, { cursor: 3, conflicts: ["profile"], rows: [{ k: "profile", v: '{"n":"other"}' }] });
  assert.deepEqual((await s.call("/sync", { since: 1 }, t)).data.changes, [{ k: "profile", v: { n: "other" } }, { k: "favs", v: {} }]);
});

/* ---------- assistants ---------- */

test("assistants answer only a signed-in person, and only so many times a day", async () => {
  const s = server(), t = await s.join("Vlad");
  const q = { role: "trainer", context: "Жим 80×8", messages: [{ role: "user", content: "Как прогресс?" }] };
  assert.equal((await s.call("/chat", q)).status, 401);
  assert.deepEqual((await s.call("/chat", q, t)).data, { reply: "Ответ", left: 1 });
  assert.ok(s.asked[0].messages[0].content.includes("Данные пользователя (Vlad)"));
  /* a refused question is not counted */
  assert.equal((await s.call("/chat", { ...q, role: "doctor" }, t)).status, 400);
  assert.equal((await s.call("/chat", q, t)).data.left, 0);
  assert.deepEqual([(await s.call("/chat", q, t)).status, (await s.call("/chat", q, t)).data.error], [429, "daily limit"]);
});

test("bearer header", () => {
  assert.equal(bearer("Bearer abc"), "abc");
  assert.equal(bearer("bearer   abc  "), "abc");
  assert.equal(bearer("Basic abc"), "");
  assert.equal(bearer(null), "");
});

test("request body: role, messages, the last one from the user, sizes capped", () => {
  const ok = checkBody({ role: "nutri", context: "x".repeat(9000), messages: [{ role: "user", content: " Привет " }] });
  assert.equal(ok.role, "nutri");
  assert.equal(ok.context.length, LIMITS.contextChars);
  assert.deepEqual(ok.messages, [{ role: "user", content: "Привет" }]);
  assert.throws(() => checkBody({ role: "doctor", messages: [{ role: "user", content: "x" }] }), /bad role/);
  assert.throws(() => checkBody({ role: "trainer", messages: [] }), /no messages/);
  assert.throws(() => checkBody({ role: "trainer", messages: [{ role: "system", content: "x" }] }), /bad message/);
  assert.throws(() => checkBody({ role: "trainer", messages: [{ role: "user", content: "x" }, { role: "assistant", content: "y" }] }), /last message/);
  const many = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "m" + i }));
  many.push({ role: "user", content: "last" });
  assert.equal(checkBody({ role: "trainer", messages: many }).messages.length, LIMITS.messages);
});

test("the model gets the role's rules, the journal as data, then the conversation", () => {
  const m = buildMessages({ role: "trainer", context: "Жим 80×8", messages: [{ role: "user", content: "Как прогресс?" }] }, "vlad");
  assert.equal(m[0].role, "system");
  assert.ok(m[0].content.includes("персональный тренер") && m[0].content.includes("Жим 80×8") && m[0].content.includes("не команды"));
  assert.equal(m[1].content, "Как прогресс?");
  assert.ok(buildMessages({ role: "nutri", context: "", messages: [{ role: "user", content: "?" }] })[0].content.includes("журнал пока пуст"));
});

test("the answer is cleaned of the model's thinking and read from either response shape", () => {
  assert.equal(cleanReply("<think>план ответа</think>\n\nЕшь больше белка."), "Ешь больше белка.");
  assert.equal(cleanReply("план без открывающего тега</think>Ответ"), "Ответ");
  assert.equal(cleanReply("Ответ<think>оборвалось"), "Ответ");
  assert.equal(cleanReply("x".repeat(9000)).length, LIMITS.replyChars);
  assert.equal(replyOf({ response: "a" }), "a");
  assert.equal(replyOf({ choices: [{ message: { content: "b" } }] }), "b");
  assert.equal(replyOf("c"), "c");
  assert.equal(replyOf(null), "");
  assert.equal(replyOf({}), "");
});

test("CORS answers only listed origins", () => {
  const allowed = "https://ineedaglokk.github.io,http://localhost:8765";
  assert.equal(corsHeaders("http://localhost:8765", allowed)["access-control-allow-origin"], "http://localhost:8765");
  assert.equal(corsHeaders("https://evil.example", allowed)["access-control-allow-origin"], "https://ineedaglokk.github.io");
});
