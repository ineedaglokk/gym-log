/* A period of the journal as data and as plain text. The text is what goes to a coach, into a PDF,
   or to the AI assistants as context — the person's records leave the device only in this form. */

import { S, getDay, hasWorkout } from "../core/store.js";
import { periodSummary, weightSeries, weightRate } from "./summary.js";
import { targets, GOALS, ACTIVITY } from "./nutrition.js";
import { P, trends, exDef, hasSets, norm } from "./training.js";
import { today, addDays, range, shortDate } from "../core/dates.js";
import { num, litres, signed, kg } from "../core/format.js";

export function buildReport(days = 30) {
  const to = today(), from = addDays(to, -(days - 1)), p = S.profile;
  const workouts = range(from, to).filter(d => hasWorkout(getDay(d))).map(d => {
    const doc = getDay(d), w = S.program ? S.program.workouts.find(x => x.id === doc.w.id) : null;
    const ex = Object.entries(doc.w.ex).map(([id, x]) => {
      const e = exDef(id);
      return e && hasSets(x) ? { name: e.name, sets: P.setsOf(e, norm(x), null).map(q => P.setChip(e, q)).join(" · "), note: x.nt || "" } : null;
    }).filter(Boolean);
    return { d, name: w ? w.name : "Тренировка", ex };
  });
  const tr = trends(from, to), all = weightSeries();
  return {
    days, from, to, p, t: targets(), s: periodSummary(from, to), workouts,
    up: tr.filter(x => x.kind === "up").map(x => ({ name: x.e.name, was: x.t.j.was, now: x.t.j.now })),
    down: tr.filter(x => x.kind === "down").map(x => ({ name: x.e.name, was: x.t.j.was, now: x.t.j.now })),
    weights: all.filter(w => w.d >= from), rate: weightRate(all),
    program: S.program ? S.program.workouts.map(w => ({ name: w.name, days: w.days, ex: w.ex.map(e => `${e.name} ${e.sets}×${e.lo}–${e.hi}`) })) : [],
  };
}

const goalName = k => (GOALS.find(g => g.k === k) || GOALS[1]).n.toLowerCase();
const actName = k => (ACTIVITY.find(a => a.k === String(k)) || ACTIVITY[1]).short;
const WD = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

/* maxWorkouts trims the journal (the newest stay) to keep the text short for the assistants */
export function reportText(r, { maxWorkouts = 40, title = true } = {}) {
  const { p, t, s } = r, L = [];
  if (title) L.push(`ФОРМА — отчёт за ${r.days} дн. (${shortDate(r.from)} — ${shortDate(r.to)})`, "");
  L.push(`Профиль: ${p.name}, ${p.sex === "f" ? "жен." : "муж."}, ${p.age} лет, ${p.height} см, ${kg(p.weight)} кг. Цель: ${goalName(p.goal)}. Активность: ${actName(p.activity)}.`);
  L.push(`Цели на день: ${num(t.kcal)} ккал, Б ${t.p} / Ж ${t.f} / У ${t.c} г, вода ${litres(t.water)} л, сон ${t.sleep} ч.`, "");
  L.push(s.foodDays ? `Питание (дней с записями: ${s.foodDays}): в среднем ${num(s.kcal)} ккал, Б ${num(s.p)} / Ж ${num(s.f)} / У ${num(s.c)} г.` : "Питание: записей нет.");
  if (r.weights.length) {
    const a = r.weights[0], b = r.weights[r.weights.length - 1];
    L.push(`Вес: ${kg(a.v)} → ${kg(b.v)} кг (${signed(b.v - a.v, 1)})${r.rate != null ? `, темп ${signed(r.rate, 2)} кг в неделю` : ""}.`);
  }
  const hab = [s.sleep != null ? `сон ${num(s.sleep, 1)} ч` : "", s.water != null ? `вода ${litres(Math.round(s.water / 50) * 50)} л` : "", s.steps != null ? `шаги ${num(Math.round(s.steps / 10) * 10)}` : ""].filter(Boolean);
  if (hab.length) L.push(`В среднем за день: ${hab.join(", ")}.`);
  L.push("", `Тренировки: ${s.done}${s.planned ? ` из ${s.planned} по плану` : ""}.`);
  if (r.program.length) L.push(`Программа: ${r.program.map(w => `${w.name} (${w.days.map(d => WD[d]).join(", ") || "без дня"})`).join("; ")}.`);
  if (r.up.length) L.push(`Растут: ${r.up.map(x => `${x.name} (${x.was} → ${x.now})`).join("; ")}.`);
  if (r.down.length) L.push(`Просели два раза подряд: ${r.down.map(x => `${x.name} (${x.was} → ${x.now})`).join("; ")}.`);
  const list = r.workouts.slice(-maxWorkouts);
  if (list.length) {
    L.push("", "Журнал тренировок:");
    list.forEach(w => L.push(`${shortDate(w.d)} — ${w.name}: ${w.ex.map(e => `${e.name} ${e.sets}${e.note ? ` (${e.note})` : ""}`).join("; ")}`));
  }
  return L.join("\n");
}
