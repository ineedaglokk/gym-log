/* Training logic: program templates, what is planned for a day, last results, weekly plan and volume.
   Progress math itself is shared/progress.js (globalThis.GymProgress) — the tested rules from the mini app.

   Program: { workouts: [ { id, name, days: [0..6, Monday = 0], ex: [ exercise ] } ] }
   Exercise: { id, lib (catalog id or null), name, sets, lo, hi, step, start, unit, g?, q? } — records are
   keyed by exercise id, so an id never changes on rename and the same exercise in two workouts shares it. */

import { S, getDay, save, hasWorkout } from "../core/store.js";
import { LIBMAP, SID, GROUPS, groupIndex } from "./catalog.js";
import { wdOf, addDays, weekDays, today } from "../core/dates.js";
import { uid } from "../core/format.js";

export const P = globalThis.GymProgress;
export const MAX_EX = 20, MAX_W = 7, BASE_DAYS = 42;

export const TEMPLATES = [
  { key: "full", name: "Фулбоди", per: 3, level: "Новичкам", note: "Всё тело за одну тренировку. Пн, ср, пт.",
    w: [["Фулбоди", [0, 2, 4], ["Жим ногами", "Жим гантелей лежа на наклонной скамье", "Румынская тяга с гантелями", "Тяга верхнего блока широким хватом", "Ягодичный мостик со штангой со скамьи", "Тяга горизонтального блока узкой рукояткой", "Отведения рук с гантелями в стороны стоя", "Подъем гантелей на бицепс стоя", "Разгибание рук на блоке с канатной рукоятью"]]] },
  { key: "ul", name: "Верх / низ", per: 4, level: "Продолжающим", note: "Верх: пн, чт. Низ: вт, пт.",
    w: [["Верх", [0, 3], ["Жим штанги лёжа", "Тяга верхнего блока широким хватом", "Жим гантелей сидя", "Тяга горизонтального блока узкой рукояткой", "Отведения рук с гантелями в стороны стоя", "Подъем гантелей на бицепс стоя", "Разгибание рук на блоке с канатной рукоятью"]],
      ["Низ", [1, 4], ["Приседания со штангой на спине", "Румынская тяга", "Жим ногами", "Сгибание ног в тренажере лежа", "Ягодичный мостик со штангой со скамьи", "Подъём на носки стоя", "Планка"]]] },
  { key: "ppl", name: "Толкай / тяни / ноги", per: 3, level: "Продолжающим", note: "Толкай: пн. Тяни: ср. Ноги: пт.",
    w: [["Толкай", [0], ["Жим штанги лёжа", "Жим гантелей лежа на наклонной скамье", "Жим гантелей сидя", "Отведения рук с гантелями в стороны стоя", "Разгибание рук на блоке с канатной рукоятью", "Французский жим лежа"]],
      ["Тяни", [2], ["Подтягивания широким хватом", "Тяга штанги в наклоне", "Тяга верхнего блока узким (параллельным) хватом", "Отведение рук назад в кроссовере сверху на задние дельты", "Сгибание рук со штангой на бицепс прямым хватом", "Сгибания рук с гантелями хватом молот стоя"]],
      ["Ноги", [4], ["Приседания со штангой на спине", "Румынская тяга", "Жим ногами", "Сгибание ног в тренажере лежа", "Подъем на носки сидя в тренажере", "Подъем ног в висе на перекладине"]]] },
  { key: "home", name: "Дома без железа", per: 3, level: "Новичкам", note: "Только свой вес и коврик. Пн, ср, пт.",
    w: [["Дом", [0, 2, 4], ["Воздушные приседания", "Отжимания со средней постановкой рук", "Выпады вперед на месте со сменой ног", "Ягодичный мостик лёжа на коврике", "Скручивания лежа на полу с приподнятыми ногами", "Планка"]]] },
];

export const emptyProgram = () => ({ workouts: [{ id: "w1", name: "Тренировка А", days: [], ex: [] }] });
export const allEx = p => { const seen = new Set(), out = []; (p ? p.workouts : []).forEach(w => w.ex.forEach(e => { if (!seen.has(e.id)) { seen.add(e.id); out.push(e); } })); return out; };

/* a catalog exercise as a program exercise; reuses the id (and the start weight) if the program already has it */
export function exFromLib(x, p) {
  const other = allEx(p).find(e => e.lib === x.id);
  return { id: other ? other.id : x.id, lib: x.id, name: x.name, sets: x.sets, lo: x.lo, hi: Math.max(x.lo, x.hi), step: x.step, start: other ? other.start : 0, unit: x.unit };
}
export function ownExercise({ name, g, q, unit }) {
  return { id: uid("x"), lib: null, name: String(name).trim().slice(0, 60) || "Упражнение", sets: 3, lo: 8, hi: 12, step: 2.5, start: 0, unit: unit || "кг", g, q };
}
export function buildTemplate(t) {
  const p = { workouts: [] };
  t.w.forEach((a, i) => {
    const w = { id: "w" + (i + 1), name: a[0], days: a[1].slice(), ex: [] };
    p.workouts.push(w);
    a[2].forEach(nm => { const x = LIBMAP[SID(nm)]; if (x && !w.ex.some(e => e.lib === x.id)) w.ex.push(exFromLib(x, p)); });
  });
  return p;
}

/* exercises that leave the program are remembered, so their history keeps its name and settings */
export function saveProgram(next) {
  const keep = new Set(allEx(next).map(e => e.id)), gone = { ...S.gone };
  let changed = false;
  allEx(S.program).forEach(e => { if (!keep.has(e.id)) { gone[e.id] = e; changed = true; } });
  keep.forEach(id => { if (gone[id]) { delete gone[id]; changed = true; } });
  if (changed) save("gone", gone);
  save("program", next);
}

/* definition of an exercise by id: the program, then removed ones, then the catalog */
export function exDef(id) {
  const e = allEx(S.program).find(x => x.id === id) || S.gone[id];
  if (e) return e;
  const x = LIBMAP[id];
  return x ? { id, lib: id, name: x.name, sets: x.sets, lo: x.lo, hi: x.hi, step: x.step, start: 0, unit: x.unit } : null;
}
export const groupName = e => GROUPS[groupIndex(e)] || "";
export const targetText = e => `${e.sets} × ${e.lo === e.hi ? e.hi : e.lo + "–" + e.hi}${e.unit === "секунды" ? " с" : e.unit === "минуты" ? " мин" : ""}`;

/* ---------- a day ---------- */
export const hasSets = x => !!(x && Array.isArray(x.r) && x.r.some(r => r != null && r > 0));
export const plannedFor = date => (S.program ? S.program.workouts.filter(w => w.days.includes(wdOf(date))) : []);
/* the workout shown for a date: the one logged that day, else the planned one */
export function workoutOn(date) {
  if (!S.program) return null;
  const d = getDay(date), byId = id => S.program.workouts.find(w => w.id === id);
  return (d.w && byId(d.w.id)) || plannedFor(date)[0] || null;
}

const seq = n => Array.from({ length: n }, (_, i) => i);
function normWu(u) {
  if (!u || !Array.isArray(u.r)) return null;
  const out = { w: [], r: [] };
  u.r.forEach((r, i) => { if (r != null) { out.r.push(r); out.w.push(u.w && u.w[i] != null ? u.w[i] : null); } });
  return out.r.length ? out : null;
}
/* a stored record padded to n sets: { w:[…], r:[…], wu, nt } */
export function norm(x, n) {
  const r = x && Array.isArray(x.r) ? x.r : [], w = x && Array.isArray(x.w) ? x.w : [];
  const len = Math.max(n || 0, r.length, w.length, 1);
  return { w: seq(len).map(i => (w[i] == null ? null : w[i])), r: seq(len).map(i => (r[i] == null ? null : r[i])), wu: normWu(x && x.wu), nt: (x && x.nt) || "" };
}
const exRec = (d, id) => (d && d.w && d.w.ex ? d.w.ex[id] : null);

/* the latest earlier workout of this exercise */
export function prevEntry(id, date, n) {
  let best = null;
  for (const [d, doc] of S.days) {
    if (d >= date || (best && d <= best.d)) continue;
    const x = exRec(doc, id);
    if (hasSets(x)) best = { d, ...norm(x, n) };
  }
  return best;
}
/* weights for today: the same as last time, set by set — going heavier is the lifter's call */
export function suggest(e, prev) {
  if (!prev) return seq(e.sets).map(() => e.start || null);
  let lastW = prev.w.find(v => v != null) ?? e.start ?? null;
  return seq(e.sets).map(i => { const w = prev.w[i] != null ? prev.w[i] : lastW; lastW = w; return w; });
}
/* body weight known on that date (the latest logged on or before it, else the profile's) */
export function bwOn(date) {
  let v = null, bd = "";
  for (const [d, doc] of S.days) if (d <= date && doc.bw != null && d > bd) { bd = d; v = doc.bw; }
  return v ?? (S.profile ? S.profile.weight : null) ?? null;
}
/* all workouts of an exercise, oldest first: [{ d, x }] */
export function sessions(id) {
  const out = [];
  for (const [d, doc] of S.days) { const x = exRec(doc, id); if (hasSets(x)) out.push({ d, x: norm(x) }); }
  return out.sort((a, b) => (a.d < b.d ? -1 : 1));
}

/* how much of the day's workout is done, in working sets */
export function dayTraining(date) {
  const d = getDay(date), planned = plannedFor(date)[0] || null, workout = workoutOn(date);
  const trained = hasWorkout(d), skipped = new Set((d.w && d.w.sk) || []);
  let done = 0, total = 0;
  if (workout) workout.ex.forEach(e => {
    if (skipped.has(e.id)) return;
    const x = exRec(d, e.id), n = x && Array.isArray(x.r) ? x.r.filter(r => r != null && r > 0).length : 0;
    total += Math.max(e.sets, n); done += n;
  });
  const active = !!planned || trained;
  return { planned, workout, trained, done, total, pct: active && total ? Math.min(1, done / total) : active ? 0 : null, rest: !active };
}
export const minutesFor = w => (w ? Math.max(15, Math.round(w.ex.reduce((t, e) => t + e.sets, 0) * 2.7 / 5) * 5) : 0);

/* the 7 days of a week: state is done | missed | today | planned | rest */
export function weekPlan(date) {
  const now = today();
  return weekDays(date).map(d => {
    const planned = plannedFor(d)[0] || null, trained = hasWorkout(getDay(d));
    const state = trained ? "done" : !planned ? "rest" : d < now ? "missed" : d === now ? "today" : "planned";
    return { date: d, planned, trained, state };
  });
}
export function nextPlanned(from) {
  for (let i = 1; i <= 14; i++) { const d = addDays(from, i), w = plannedFor(d)[0]; if (w) return { date: d, workout: w }; }
  return null;
}

/* hard sets per muscle group in a week: [{ gi, group, sets }] sorted by sets */
export function weekMuscles(weekStartIso) {
  const sum = new Map();
  weekDays(weekStartIso).forEach(d => {
    const doc = S.days.get(d);
    if (!doc || !doc.w || !doc.w.ex) return;
    Object.entries(doc.w.ex).forEach(([id, x]) => {
      const e = exDef(id), gi = e ? groupIndex(e) : -1;
      if (!e || gi < 0 || !hasSets(x)) return;
      sum.set(gi, (sum.get(gi) || 0) + P.hardSets(e, norm(x)));
    });
  });
  return [...sum.entries()].map(([gi, sets]) => ({ gi, group: GROUPS[gi], sets })).sort((a, b) => b.sets - a.sets);
}

/* each program exercise over a period: up / down / flat, by the shared periodTrend rules */
export function trends(from, to) {
  const out = [];
  allEx(S.program).forEach(e => {
    const all = sessions(e.id), pts = all.filter(p => p.d >= from && p.d <= to);
    if (!pts.length) return;
    const floor = addDays(from, -BASE_DAYS), base = all.filter(p => p.d < from && p.d >= floor).slice(-2);
    const t = P.periodTrend(e, pts, base, bwOn(to));
    out.push({ e, kind: t ? t.kind : null, t, n: pts.length });
  });
  return out;
}

export const workoutDays = () => [...S.days.entries()].filter(([, d]) => hasWorkout(d)).map(([d]) => d).sort();
/* weeks in a row with at least one workout, counting back from this week (or the last one if this is still empty) */
export function weekStreak() {
  const set = new Set(workoutDays().map(d => P.weekOf(d)));
  let w = P.weekOf(today()), n = 0;
  if (!set.has(w)) w = addDays(w, -7);
  while (set.has(w)) { n++; w = addDays(w, -7); }
  return n;
}
