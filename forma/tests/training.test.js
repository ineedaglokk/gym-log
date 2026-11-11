import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { memoryBackend } from "../js/core/db.js";
import { S, init, updateDay } from "../js/core/store.js";
import { TEMPLATES, buildTemplate, saveProgram, exFromLib, plannedFor, workoutOn, prevEntry, suggest, norm, dayTraining, weekPlan, nextPlanned,
  weekMuscles, sessions, trends, exDef, weekStreak, bwOn, allEx, targetText } from "../js/domain/training.js";
import { LIB, LIBMAP, SID, searchLib, GROUPS, photoOf } from "../js/domain/catalog.js";
import { today, addDays, weekStart, wdOf } from "../js/core/dates.js";

const monday = weekStart(today());
const full = () => buildTemplate(TEMPLATES.find(t => t.key === "full"));

test("the catalog is loaded: 1045 exercises, ids are stable hashes of the names", () => {
  assert.equal(LIB.length, 1045);
  assert.equal(GROUPS.length, 11);
  assert.equal(LIBMAP[SID("Жим ногами")].name, "Жим ногами");
  assert.ok(photoOf(LIBMAP[SID("Жим ногами")]).startsWith("img/ex/"));
  const r = searchLib("жим лежа");
  assert.ok(r.total > 5 && r.items.every(x => x.sk.includes("жим") && x.sk.includes("лежа")));
  assert.ok(searchLib("", { group: 1 }).items.every(x => x.gi === 1));
});

test("every exercise named in a template exists in the catalog", () => {
  for (const t of TEMPLATES) {
    const p = buildTemplate(t);
    t.w.forEach((w, i) => assert.equal(p.workouts[i].ex.length, w[2].length, `${t.key} / ${w[0]}: a name is missing from the catalog`));
    assert.equal(p.workouts.reduce((n, w) => n + w.days.length, 0), t.per, `${t.key}: days per week`);
  }
});

test("the same exercise in two workouts shares one id", () => {
  const p = buildTemplate(TEMPLATES.find(t => t.key === "ul"));
  const a = exFromLib(LIBMAP[SID("Жим ногами")], p);
  assert.equal(a.id, p.workouts[1].ex.find(e => e.name === "Жим ногами").id);
  assert.equal(allEx(p).length, new Set(allEx(p).map(e => e.id)).size);
  assert.equal(targetText({ sets: 3, lo: 8, hi: 12, unit: "кг" }), "3 × 8–12");
});

test("plan of the week: done, missed, today, planned, rest", async () => {
  await init(memoryBackend());
  saveProgram(full());
  const w = S.program.workouts[0], e = w.ex[0];
  assert.equal(plannedFor(monday)[0].id, w.id);
  assert.equal(plannedFor(addDays(monday, 1)).length, 0);
  assert.equal(workoutOn(monday).id, w.id);
  const past = addDays(monday, -7);
  updateDay(past, d => { d.w = { id: w.id, ex: { [e.id]: { w: [40, 40, 40], r: [10, 9, 8] } } }; });
  const wp = weekPlan(past);
  assert.equal(wp[0].state, "done");
  assert.equal(wp[1].state, "rest");
  assert.equal(wp[2].state, "missed");
  const now = weekPlan(today()).find(x => x.date === today());
  assert.ok(["today", "rest"].includes(now.state));
  const nx = nextPlanned(today());
  assert.ok(nx && [0, 2, 4].includes(wdOf(nx.date)) && nx.date > today());
});

test("last time's result feeds today's suggestion; progress of the day in sets", async () => {
  await init(memoryBackend());
  saveProgram(full());
  const w = S.program.workouts[0], e = w.ex[0], d0 = addDays(monday, -14), d1 = addDays(monday, -7);
  assert.equal(prevEntry(e.id, d1, e.sets), null);
  assert.deepEqual(suggest({ ...e, start: 50 }, null), [50, 50, 50]);
  updateDay(d0, d => { d.w = { id: w.id, ex: { [e.id]: { w: [40, 40, 40], r: [10, 9, 8] } } }; });
  updateDay(d1, d => { d.w = { id: w.id, ex: { [e.id]: { w: [40, 42.5, null], r: [12, 10, null], nt: "узкая постановка" } } }; });
  const prev = prevEntry(e.id, monday, e.sets);
  assert.equal(prev.d, d1);
  assert.equal(prev.nt, "узкая постановка");
  assert.deepEqual(suggest(e, prev), [40, 42.5, 42.5]);
  assert.deepEqual(norm({ w: [40], r: [10] }, 3), { w: [40, null, null], r: [10, null, null], wu: null, nt: "" });
  const tr = dayTraining(d1);
  assert.equal(tr.done, 2);
  assert.equal(tr.total, w.ex.reduce((n, x) => n + x.sets, 0));
  assert.equal(tr.trained, true);
  assert.equal(dayTraining(addDays(d1, 1)).rest, true);
  assert.equal(dayTraining(addDays(d1, 1)).pct, null);
  assert.equal(sessions(e.id).length, 2);
});

test("weekly volume per muscle and trends over a period", async () => {
  await init(memoryBackend());
  saveProgram(full());
  const w = S.program.workouts[0], legs = w.ex[0], d0 = addDays(monday, -21), d1 = addDays(monday, -14), d2 = addDays(monday, -7);
  const put = (d, r) => updateDay(d, x => { x.w = { id: w.id, ex: { [legs.id]: { w: [40, 40, 40], r } } }; });
  put(d0, [8, 8, 8]); put(d1, [10, 10, 9]); put(d2, [12, 11, 10]);
  const vol = weekMuscles(d2);
  assert.equal(vol.length, 1);
  assert.equal(vol[0].group, "Ноги");
  assert.equal(vol[0].sets, 3);
  const tr = trends(d1, addDays(d2, 6));
  assert.equal(tr.length, 1);
  assert.equal(tr[0].kind, "up");
  assert.ok(weekStreak() === 0 || weekStreak() >= 1);
});

test("exercises that leave the program keep their definition for the history", async () => {
  await init(memoryBackend());
  saveProgram(full());
  const gone = S.program.workouts[0].ex[0], next = structuredClone(S.program);
  next.workouts[0].ex.shift();
  saveProgram(next);
  assert.equal(S.gone[gone.id].name, gone.name);
  assert.equal(exDef(gone.id).name, gone.name);
  saveProgram(full());
  assert.equal(S.gone[gone.id], undefined, "back in the program — no longer 'gone'");
  assert.equal(exDef("nope"), null);
});

test("body weight for bodyweight moves: the latest weigh-in, else the profile", async () => {
  await init(memoryBackend());
  assert.equal(bwOn(today()), null);
  updateDay("2026-10-01", d => { d.bw = 80; });
  updateDay("2026-10-20", d => { d.bw = 79; });
  assert.equal(bwOn("2026-10-10"), 80);
  assert.equal(bwOn("2026-11-01"), 79);
});
