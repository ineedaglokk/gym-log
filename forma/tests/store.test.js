import test from "node:test";
import assert from "node:assert/strict";
import { memoryBackend } from "../js/core/db.js";
import { S, init, save, getDay, updateDay, flush, exportData, importData, wipe, resetLocal, isEmptyDay, DEFAULTS, getMeta, setMeta, onLocalChange, applyRemote, valueOf, localKeys } from "../js/core/store.js";

test("a day is written through to storage and an emptied day is removed", async () => {
  const be = memoryBackend(); await init(be);
  updateDay("2026-11-10", d => { d.water = 500; });
  await flush();
  assert.equal(be.map.get("d:2026-11-10").water, 500);
  assert.equal(getDay("2026-11-10").water, 500);
  updateDay("2026-11-10", d => { d.water = 0; });
  await flush();
  assert.equal(be.map.has("d:2026-11-10"), false);
  assert.equal(S.days.has("2026-11-10"), false);
});

test("getDay never returns a stored object for a missing day and updateDay does not mutate the old record", async () => {
  await init(memoryBackend());
  getDay("2026-01-01").water = 999;
  assert.equal(getDay("2026-01-01").water, 0);
  updateDay("2026-01-02", d => { d.bw = 80; });
  const before = getDay("2026-01-02");
  updateDay("2026-01-02", d => { d.bw = 81; });
  assert.equal(before.bw, 80);
  assert.equal(getDay("2026-01-02").bw, 81);
});

test("isEmptyDay: food, water, weight, steps, sleep or a workout make a day non-empty", () => {
  assert.equal(isEmptyDay({ v: 1, food: [], water: 0 }), true);
  assert.equal(isEmptyDay({ food: [], water: 0, bw: 80 }), false);
  assert.equal(isEmptyDay({ food: [], water: 0, sleep: 0 }), false);
  assert.equal(isEmptyDay({ food: [], water: 0, w: { id: "w1", ex: {} } }), true);
  assert.equal(isEmptyDay({ food: [], water: 0, w: { id: "w1", ex: {}, sk: ["a"] } }), false);
  assert.equal(isEmptyDay({ food: [], water: 0, w: { id: "w1", ex: { a: { w: [1], r: [1] } } } }), false);
});

test("state survives a restart and settings from an older version get the new defaults", async () => {
  const be = memoryBackend({ settings: { theme: "dark" }, profile: { name: "A" }, "d:2026-11-01": { v: 1, food: [], water: 250 } });
  await init(be);
  assert.equal(S.settings.theme, "dark");
  assert.deepEqual(S.settings.trackers, DEFAULTS.settings.trackers);
  assert.equal(S.settings.glass, 250);
  assert.equal(S.profile.name, "A");
  assert.equal(getDay("2026-11-01").water, 250);
});

test("save rejects unknown keys", async () => {
  await init(memoryBackend());
  assert.throws(() => save("nope", 1), /unknown store key/);
});

test("backup: export leaves out the sign-in; merge keeps local days, replace makes a copy", async () => {
  await init(memoryBackend());
  save("profile", { name: "Vlad" });
  setMeta("@account", { nick: "vlad", name: "Vlad", token: "secret-token" });
  updateDay("2026-11-01", d => { d.water = 1000; });
  updateDay("2026-11-02", d => { d.water = 2000; });
  const backup = JSON.parse(JSON.stringify(exportData()));
  assert.equal(backup.app, "forma");
  assert.equal(JSON.stringify(backup).includes("secret-token"), false);

  await init(memoryBackend());
  updateDay("2026-11-02", d => { d.water = 300; });
  updateDay("2026-11-03", d => { d.water = 400; });
  assert.equal(await importData(backup, "merge"), 1);
  assert.equal(getDay("2026-11-01").water, 1000);
  assert.equal(getDay("2026-11-02").water, 300, "the local day wins on merge");
  assert.equal(getDay("2026-11-03").water, 400);
  assert.equal(S.profile.name, "Vlad", "an empty profile is filled from the backup");

  assert.equal(await importData(backup, "replace"), 2);
  assert.equal(getDay("2026-11-02").water, 2000);
  assert.equal(S.days.has("2026-11-03"), false);
});

test("import refuses files that are not a FORMA backup and wipe clears everything", async () => {
  const be = memoryBackend(); await init(be);
  await assert.rejects(importData({ app: "other", data: {} }), /не копия/);
  await assert.rejects(importData(null), /не копия/);
  save("profile", { name: "X" }); updateDay("2026-11-01", d => { d.water = 1; });
  setMeta("@account", { nick: "x", name: "X", token: "t" });
  await wipe();
  assert.equal(S.profile, null);
  assert.equal(S.days.size, 0);
  assert.deepEqual([...be.map.keys()], ["@account"], "the journal is gone, the sign-in stays");
  await resetLocal();
  assert.equal(be.map.size, 0);
  assert.equal(getMeta("@account"), null);
});

test("device-only records survive a restart; local changes are reported, values from the account are not", async () => {
  const be = memoryBackend(); await init(be);
  const seen = [];
  onLocalChange(k => seen.push(k));
  setMeta("@sync", { cursor: 7 });
  save("profile", { name: "X" });
  updateDay("2026-11-01", d => { d.water = 250; });
  updateDay("2026-11-01", d => { d.water = 0; });          /* the day became empty: reported as a change too */
  assert.deepEqual(seen, ["profile", "d:2026-11-01", "d:2026-11-01"]);

  assert.equal(applyRemote("d:2026-11-02", { v: 1, food: [], water: 500 }), "day");
  assert.equal(applyRemote("program", { workouts: [] }), "program");
  assert.equal(applyRemote("settings", { theme: "dark" }), "settings");
  assert.equal(applyRemote("unknown", {}), null);
  assert.equal(seen.length, 3);
  assert.deepEqual([S.settings.theme, S.settings.glass], ["dark", 250], "missing fields come from the defaults");
  assert.deepEqual(localKeys().sort(), ["d:2026-11-02", "profile", "program", "settings"]);
  assert.deepEqual([valueOf("d:2026-11-02").water, valueOf("d:2026-11-01"), valueOf("foods")], [500, null, []]);

  applyRemote("profile", null);                             /* deleted in the account */
  assert.equal(S.profile, null);
  await flush();
  onLocalChange(null);
  await init(be);
  assert.deepEqual([getMeta("@sync"), S.profile, getDay("2026-11-02").water], [{ cursor: 7 }, null, 500]);
});
