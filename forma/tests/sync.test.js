/* Accounts and sync end to end: the app's own modules against the real server code (server/worker.js)
   on an in-memory database. "Devices" are separate storages; use(name) switches the app to one. */

import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../server/worker.js";
import { d1 } from "../server/d1-node.js";
import { memoryBackend } from "../js/core/db.js";
import { S, init, save, updateDay, getDay, flush, wipe, getMeta } from "../js/core/store.js";
import { account, signedIn, accountsOn, apiUrl, ApiError, errorText } from "../js/core/account.js";
import { API_URL } from "../js/config.js";
import { startSync, syncNow, syncInfo, mergeDay } from "../js/core/sync.js";
import { signUp, signIn, signOut, changePassword } from "../js/domain/session.js";
import { coachReady } from "../js/domain/coach.js";

globalThis.location = { hostname: "localhost" };   /* the app then talks to the local server address */

const SCHEMA = readFileSync(new URL("../server/schema.sql", import.meta.url), "utf8");
let env, devices, net;

/* a fresh server and fresh devices; the network can be switched off, fully or for one path */
function world() {
  const DB = d1();
  DB.script(SCHEMA);
  env = { DB, ALLOWED_ORIGINS: "http://localhost:8765", PBKDF2_ITER: "1000", DAILY_LIMIT: "5", MODEL: "m", AI: { run: async () => ({ response: "ok" }) } };
  devices = {};
  net = { down: false, failing: "" };
  globalThis.fetch = async (url, opts) => {
    if (net.down || (net.failing && String(url).endsWith(net.failing))) throw new TypeError("fetch failed");
    return worker.fetch(new Request(url, { method: opts.method, headers: opts.headers, body: opts.body }), env);
  };
}
async function use(name) {
  await flush();
  devices[name] ||= memoryBackend();
  await init(devices[name]);
  startSync();
}
const food = (id, k = 100) => ({ id, m: "l", n: "Еда " + id, g: 100, k, p: 10, f: 5, c: 20 });
const ids = date => getDay(date).food.map(i => i.id);

test("a development copy talks to the local server, the published one to the real server", () => {
  assert.equal(apiUrl(), "http://localhost:8787");
  assert.ok(accountsOn());
  /* a phone in the same Wi-Fi opens the app by this computer's address: the local server is on the same host */
  for (const [host, api] of [["192.168.1.103", "http://192.168.1.103:8787"], ["10.0.0.7", "http://10.0.0.7:8787"], ["172.20.10.2", "http://172.20.10.2:8787"], ["MacBook.local", "http://MacBook.local:8787"]]) {
    globalThis.location = { hostname: host };
    assert.equal(apiUrl(), api);
  }
  assert.match(API_URL, /^https:\/\//);
  for (const host of ["ineedaglokk.github.io", "172.32.0.1", "192.169.1.1", "evil-192.168.1.1.example"]) {
    globalThis.location = { hostname: host };
    assert.equal(apiUrl(), API_URL, host);
    assert.ok(accountsOn());
  }
  globalThis.location = { hostname: "localhost" };
});

test("merging a day changed on two devices keeps what both typed", () => {
  const mine = { v: 1, food: [food("a", 111), food("mine")], water: 250, bw: 82, w: { id: "A", ex: { e1: { w: [50], r: [8] } }, sk: ["e2", "e3"] } };
  const theirs = { v: 1, food: [food("a"), food("theirs")], water: 750, steps: 9000, bw: 81, w: { id: "A", ex: { e2: { w: [20], r: [12] } }, sk: ["e1"] } };
  const m = mergeDay(mine, theirs);
  assert.deepEqual(m.food.map(i => [i.id, i.k]), [["a", 111], ["theirs", 100], ["mine", 100]]);
  assert.deepEqual([m.water, m.steps, m.bw, m.sleep], [750, 9000, 82, undefined]);
  assert.deepEqual(Object.keys(m.w.ex).sort(), ["e1", "e2"]);
  assert.deepEqual(m.w.sk, ["e3"]);                       /* an exercise that has sets is not "skipped" */
  assert.deepEqual(mergeDay(null, theirs), theirs);       /* deleted here, changed there → stays */
  assert.deepEqual(mergeDay(mine, null), mine);
  assert.equal(mergeDay(null, null), null);
  assert.deepEqual(mergeDay(theirs, theirs), theirs);
});

test("registering keeps what was already on the device; a second device gets it all after signing in", async () => {
  world();
  await use("phone");
  save("profile", { name: "Влад", weight: 82 });
  updateDay("2026-11-10", d => { d.food = [food("a")]; d.water = 500; });
  assert.equal(signedIn(), false);

  await signUp("Vlad", "1234");
  assert.deepEqual([account().nick, account().name, account().token.length], ["vlad", "Vlad", 64]);
  assert.deepEqual([syncInfo().state, syncInfo().pending], ["ok", 0]);
  assert.ok(coachReady());
  /* the password itself is nowhere on the device */
  assert.ok(!JSON.stringify([...devices.phone.map]).includes("1234"));

  await use("laptop");
  assert.equal(S.profile, null);
  await signIn("vlad", "1234");
  assert.deepEqual(S.profile, { name: "Влад", weight: 82 });
  assert.deepEqual([ids("2026-11-10"), getDay("2026-11-10").water], [["a"], 500]);
  assert.deepEqual(devices.laptop.map.get("d:2026-11-10").food[0].id, "a");   /* and it is in the laptop's storage */
});

test("changes travel both ways; a day that became empty disappears on the other device too", async () => {
  world();
  await use("phone"); await signUp("vlad", "1234");
  await use("laptop"); await signIn("vlad", "1234");

  updateDay("2026-11-11", d => { d.food = [food("b")]; });
  save("settings", { ...S.settings, theme: "dark" });
  assert.equal(syncInfo().pending, 2);
  assert.ok(await syncNow());

  await use("phone");
  assert.deepEqual(ids("2026-11-11"), []);
  assert.ok(await syncNow());
  assert.deepEqual([ids("2026-11-11"), S.settings.theme], [["b"], "dark"]);

  updateDay("2026-11-11", d => { d.food = []; });
  await syncNow();
  await use("laptop"); await syncNow();
  assert.equal(S.days.has("2026-11-11"), false);
  assert.equal(devices.laptop.map.has("d:2026-11-11"), false);
});

test("without a connection the records wait on the device and go out when it returns — even after a restart", async () => {
  world();
  await use("phone"); await signUp("vlad", "1234");
  net.down = true;
  updateDay("2026-11-11", d => { d.water = 750; });
  assert.equal(await syncNow(), false);
  assert.deepEqual([syncInfo().state, syncInfo().pending], ["offline", 1]);
  assert.ok(signedIn());

  await use("phone");                                   /* the app was closed and opened again */
  assert.equal(syncInfo().pending, 1);
  net.down = false;
  assert.ok(await syncNow());
  assert.equal(syncInfo().pending, 0);

  await use("laptop"); await signIn("vlad", "1234");
  assert.equal(getDay("2026-11-11").water, 750);
});

test("the same day edited on two devices is merged; for the program the account's version wins", async () => {
  world();
  await use("phone"); await signUp("vlad", "1234");
  updateDay("2026-11-11", d => { d.food = [food("first")]; });
  save("program", { workouts: [{ id: "w", name: "Старая" }] });
  await syncNow();
  await use("laptop"); await signIn("vlad", "1234");

  /* the phone is offline in the gym, the laptop is online at home */
  await use("phone"); net.down = true;
  updateDay("2026-11-11", d => { d.food.push(food("phone")); d.water = 500; });
  save("program", { workouts: [{ id: "w", name: "С телефона" }] });
  await syncNow();
  await use("laptop"); net.down = false;
  updateDay("2026-11-11", d => { d.food.push(food("laptop")); });
  save("program", { workouts: [{ id: "w", name: "С ноутбука" }] });
  await syncNow();

  await use("phone");
  assert.ok(await syncNow());
  assert.deepEqual([ids("2026-11-11"), getDay("2026-11-11").water], [["first", "laptop", "phone"], 500]);
  assert.equal(S.program.workouts[0].name, "С ноутбука");
  assert.equal(syncInfo().pending, 0);

  await use("laptop"); await syncNow();
  assert.deepEqual([ids("2026-11-11"), getDay("2026-11-11").water], [["first", "laptop", "phone"], 500]);
});

test("signing out clears the device, the account keeps everything", async () => {
  world();
  await use("phone"); await signUp("vlad", "1234");
  save("profile", { name: "Влад" });
  updateDay("2026-11-11", d => { d.water = 250; });
  await syncNow();

  await signOut();
  assert.deepEqual([signedIn(), account(), S.profile, S.days.size, devices.phone.map.size], [false, null, null, 0, 0]);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions").first()).n, 0);

  await signIn("vlad", "1234");
  assert.deepEqual([S.profile, getDay("2026-11-11").water], [{ name: "Влад" }, 250]);
});

test("two people on one device never see or overwrite each other's records", async () => {
  world();
  await use("phone"); await signUp("vlad", "1234");
  save("profile", { name: "Влад" });
  updateDay("2026-11-11", d => { d.water = 250; });
  await syncNow();
  await changePassword("5678");
  /* Vlad's session on this device ends without a sign-out (as if the password was changed elsewhere) */
  await env.DB.prepare("DELETE FROM sessions").run();
  assert.equal(await syncNow(), false);
  assert.deepEqual([signedIn(), account().nick, S.profile], [false, "vlad", { name: "Влад" }]);

  await signUp("anna", "0000");
  assert.deepEqual([account().nick, S.profile, S.days.size], ["anna", null, 0]);
  save("profile", { name: "Аня" });
  await syncNow();

  await use("laptop"); await signIn("vlad", "5678");
  assert.deepEqual([S.profile, getDay("2026-11-11").water], [{ name: "Влад" }, 250]);
});

test("a new password signs the other device out; it signs in again and loses nothing it had typed", async () => {
  world();
  await use("phone"); await signUp("vlad", "1234");
  await use("laptop"); await signIn("vlad", "1234");
  updateDay("2026-11-11", d => { d.steps = 7000; });        /* not sent yet */

  await use("phone");
  assert.deepEqual(await changePassword("abcd"), { ok: true });
  assert.ok(await syncNow());                               /* this device stays signed in */

  await use("laptop");
  assert.equal(await syncNow(), false);
  assert.deepEqual([signedIn(), account().token, syncInfo().pending], [false, "", 1]);
  await assert.rejects(signIn("vlad", "1234"), e => e instanceof ApiError && e.code === "wrong password" && errorText(e) === "Неверный ник или пароль");
  await signIn("vlad", "abcd");
  assert.equal(syncInfo().pending, 0);

  await use("phone"); await syncNow();
  assert.equal(getDay("2026-11-11").steps, 7000);
});

test("deleting all data empties the account on every device; the sign-in stays", async () => {
  world();
  await use("phone"); await signUp("vlad", "1234");
  save("profile", { name: "Влад" });
  updateDay("2026-11-10", d => { d.water = 250; });
  updateDay("2026-11-11", d => { d.water = 500; });
  await syncNow();
  await use("laptop"); await signIn("vlad", "1234");

  await wipe();
  assert.deepEqual([S.profile, S.days.size, signedIn()], [null, 0, true]);
  assert.ok(await syncNow());

  await use("phone"); await syncNow();
  assert.deepEqual([S.profile, S.days.size, signedIn()], [null, 0, true]);
});

test("a sign-in whose records could not be loaded does not count", async () => {
  world();
  await use("phone"); await signUp("vlad", "1234");
  save("profile", { name: "Влад" });
  await syncNow();

  await use("laptop");
  net.failing = "/sync";
  await assert.rejects(signIn("vlad", "1234"), e => e.code === "no records");
  assert.deepEqual([signedIn(), account().nick, S.profile], [false, "vlad", null]);
  net.failing = "";
  await signIn("vlad", "1234");
  assert.deepEqual(S.profile, { name: "Влад" });
});

test("sign-in errors are told in plain words", async () => {
  world();
  await use("phone"); await signUp("vlad", "1234");
  await signOut();
  await assert.rejects(signUp("VLAD", "9999"), e => errorText(e).startsWith("Такой ник уже занят"));
  await assert.rejects(signUp("v", "9999"), e => errorText(e).startsWith("Ник:"));
  await assert.rejects(signIn("vlad", "nope"), e => errorText(e) === "Неверный ник или пароль");
  net.down = true;
  await assert.rejects(signIn("vlad", "1234"), e => e.status === 0 && errorText(e).startsWith("Нет связи"));
  assert.equal(getMeta("@account"), null);
});
