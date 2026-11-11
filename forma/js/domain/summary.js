/* Day rings, period series and plain-language conclusions built from the journal.
   Everything here is derived on the fly from the day records; nothing is stored. */

import { S, getDay, hasWorkout } from "../core/store.js";
import { targets, dayFood } from "./nutrition.js";
import { dayTraining, weekPlan, weekMuscles, trends, bwOn } from "./training.js";
import { addDays, range, today, weekStart, diffDays } from "../core/dates.js";
import { num, plural, round, clamp, litres, signed } from "../core/format.js";

export const METRICS = {
  food: { n: "Питание", short: "Еда", ico: "flame", color: "var(--m-food)" },
  gym: { n: "Тренировка", short: "Зал", ico: "dumbbell", color: "var(--m-gym)" },
  water: { n: "Вода", short: "Вода", ico: "drop", color: "var(--m-water)" },
  sleep: { n: "Сон", short: "Сон", ico: "moon", color: "var(--m-sleep)" },
  steps: { n: "Шаги", short: "Шаги", ico: "steps", color: "var(--m-steps)" },
};

/* the rings of one day: [{ key, v, goal, pct (0..1 or null when it does not apply that day), … }] and the day score */
export function dayRings(date) {
  const t = targets(), d = getDay(date), tr = dayTraining(date), tk = S.settings.trackers, food = dayFood(date).sum;
  const items = [
    /* the ring fills up to the target; eating more than 110% of it lowers the day score instead of raising it */
    { key: "food", v: food.k, goal: t.kcal, pct: clamp(food.k / t.kcal, 0, 1), over: food.k > t.kcal * 1.1, score: food.k > t.kcal * 1.1 ? clamp(1 - (food.k / t.kcal - 1.1) / 0.4, 0, 1) : undefined },
    { key: "gym", v: tr.done, goal: tr.total, pct: tr.pct, rest: tr.rest },
  ];
  if (tk.water) items.push({ key: "water", v: d.water || 0, goal: t.water, pct: clamp((d.water || 0) / t.water, 0, 1) });
  if (tk.sleep) items.push({ key: "sleep", v: d.sleep ?? null, goal: t.sleep, pct: d.sleep != null ? clamp(d.sleep / t.sleep, 0, 1) : 0 });
  if (tk.steps) items.push({ key: "steps", v: d.steps ?? null, goal: t.steps, pct: d.steps != null ? clamp(d.steps / t.steps, 0, 1) : 0 });
  items.forEach(i => Object.assign(i, METRICS[i.key], i.over ? { color: "var(--bad)" } : null));
  const counted = items.filter(i => i.pct != null);
  const score = counted.length ? counted.reduce((s, i) => s + (i.score ?? i.pct), 0) / counted.length : 0;
  return { items, score, any: counted.some(i => i.pct > 0) };
}
/* the three small rings used in the week strip and the calendar: food, workout, water */
export function miniRings(date) {
  const r = dayRings(date).items;
  return r.filter(i => i.key === "food" || i.key === "gym" || i.key === "water").map(i => ({ pct: i.pct == null ? 0 : i.pct, color: i.color }));
}

/* days with a food diary; today is left out — a day that is not over would pull every average down */
export const foodDays = (from, to) => { const now = today(); return range(from, to).filter(d => d !== now && (getDay(d).food || []).length > 0); };
const avg = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);

/* numbers of a period (inclusive dates) */
export function periodSummary(from, to) {
  const days = range(from, to), fd = foodDays(from, to), t = targets();
  const sums = fd.map(d => dayFood(d).sum);
  const pick = k => days.map(d => getDay(d)[k]).filter(v => v != null && v > 0);
  let planned = 0, done = 0;
  days.forEach(d => { const tr = dayTraining(d); if (tr.planned && d <= today()) planned++; if (tr.trained) done++; });
  const weights = days.map(d => ({ d, v: getDay(d).bw })).filter(p => p.v != null);
  return {
    from, to, t, foodDays: fd.length,
    kcal: avg(sums.map(s => s.k)), p: avg(sums.map(s => s.p)), f: avg(sums.map(s => s.f)), c: avg(sums.map(s => s.c)),
    water: avg(pick("water")), sleep: avg(pick("sleep")), steps: avg(pick("steps")),
    planned, done, weights,
    weightDelta: weights.length >= 2 ? round(weights[weights.length - 1].v - weights[0].v, 1) : null,
  };
}

/* all body-weight entries, oldest first: [{ d, v }] */
export function weightSeries(from = "0000") {
  return [...S.days.entries()].filter(([d, r]) => r.bw != null && d >= from).map(([d, r]) => ({ d, v: r.bw })).sort((a, b) => (a.d < b.d ? -1 : 1));
}
/* kg per week over the last entries (least squares), null with too little data */
export function weightRate(series, days = 28) {
  if (series.length < 3) return null;
  const end = series[series.length - 1].d, pts = series.filter(p => diffDays(p.d, end) <= days);
  if (pts.length < 3 || diffDays(pts[0].d, end) < 6) return null;
  const xs = pts.map(p => diffDays(pts[0].d, p.d)), ys = pts.map(p => p.v), mx = avg(xs), my = avg(ys);
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return den ? round(xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / den * 7, 2) : null;
}

/* Conclusions for a week, the way a coach and a dietitian would say them.
   Each: { tone: good | warn | info, ico, title, text }. At most six, the most useful first. */
export function insights(weekIso) {
  const from = weekStart(weekIso), to = addDays(from, 6), s = periodSummary(from, to), t = s.t, goal = S.profile ? S.profile.goal : "keep";
  const out = [];
  const add = (tone, ico, title, text, w) => out.push({ tone, ico, title, text, w });

  if (s.planned) {
    if (s.done >= s.planned) add("good", "trophy", "План по тренировкам закрыт", `${s.done} из ${s.planned} — так и растёт результат.`, 9);
    else if (to <= today() || s.done < s.planned - 1) add("info", "dumbbell", `Тренировки: ${s.done} из ${s.planned}`, s.done ? "Пропущенную можно перенести на свободный день." : "Начни с одной — потом втянешься.", 6);
  }
  const tr = trends(from, to), up = tr.filter(x => x.kind === "up"), down = tr.filter(x => x.kind === "down");
  if (up.length) add("good", "trend", `Растёшь в ${up.length} ${plural(up.length, "упражнении", "упражнениях", "упражнениях")}`, up.slice(0, 3).map(x => x.e.name).join(", ") + ".", 8);
  if (down.length) add("warn", "info", "Просадка два раза подряд", down.slice(0, 2).map(x => x.e.name).join(", ") + ". Проверь сон и калории, либо сбрось вес на шаг.", 7);

  if (s.foodDays >= 3) {
    const dk = s.kcal / t.kcal - 1;
    if (Math.abs(dk) <= 0.08) add("good", "flame", "Калории в цели", `В среднем ${num(s.kcal)} из ${num(t.kcal)} ккал.`, 7);
    else if (dk < -0.2) add("warn", "flame", "Ешь заметно меньше нормы", `В среднем ${num(s.kcal)} из ${num(t.kcal)} ккал. ${goal === "lose" ? "Слишком большой дефицит съедает мышцы и силу." : "На таком питании сила расти не будет."}`, 9);
    else if (dk < -0.08) add("info", "flame", "Чуть ниже цели по калориям", `В среднем ${num(s.kcal)} из ${num(t.kcal)} ккал.`, 4);
    else if (dk > 0.1) add("warn", "flame", "Перебор по калориям", `В среднем ${num(s.kcal)} при цели ${num(t.kcal)} ккал — это примерно +${num((s.kcal - t.kcal) * 7 / 7700, 1)} кг жира в неделю.`, 8);
    if (s.p < t.p * 0.85) add("warn", "dumbbell", "Мало белка", `В среднем ${num(s.p)} г из ${num(t.p)} г. Добавь творог, яйца, курицу, рыбу или порцию протеина.`, 8);
    else if (s.p >= t.p * 0.95) add("good", "dumbbell", "Белок в норме", `В среднем ${num(s.p)} г в день — мышцам есть из чего расти.`, 5);
  } else if (s.foodDays > 0) add("info", "food", "Мало записей о еде", "Запиши хотя бы 3–4 дня — тогда выводы по питанию будут честными.", 3);

  if (s.sleep != null && s.sleep < 7) add("warn", "moon", `Сон ${num(s.sleep, 1)} ч`, "Меньше 7 часов — восстановление и сила падают, аппетит растёт.", 7);
  if (s.water != null && s.water < t.water * 0.7) add("info", "drop", "Мало воды", `В среднем ${litres(Math.round(s.water / 50) * 50)} из ${litres(t.water)} л.`, 3);

  const rate = weightRate(weightSeries(addDays(to, -35))), bw = bwOn(to);
  if (rate != null && bw) {
    const share = rate / bw;
    if (goal === "lose" && share < -0.012) add("warn", "scale", "Вес уходит слишком быстро", `${signed(rate, 1)} кг в неделю. Безопасный темп — до 1% веса тела, добавь 150–200 ккал.`, 8);
    else if (goal === "lose" && rate > -0.1) add("info", "scale", "Вес стоит", "Если так две-три недели подряд — убери 100–150 ккал или добавь шагов.", 5);
    else if (goal === "lose") add("good", "scale", "Вес снижается в хорошем темпе", `${signed(rate, 1)} кг в неделю.`, 6);
    else if (goal === "gain" && share > 0.006) add("warn", "scale", "Набор слишком быстрый", `${signed(rate, 1)} кг в неделю — часть уйдёт в жир. Убери 100–150 ккал.`, 6);
    else if (goal === "gain" && rate < 0.05) add("info", "scale", "Вес не растёт", "Добавь 150–200 ккал в день, лучше углеводами вокруг тренировки.", 5);
  }

  const low = weekMuscles(from).filter(m => m.sets > 0 && m.sets < 6 && m.group !== "Кардио" && m.group !== "Комплексные");
  /* only once the week's workouts are done — mid-week the volume is simply not there yet */
  if (low.length && s.done >= 2 && (to < today() || (s.planned && s.done >= weekPlan(from).filter(x => x.planned).length))) add("info", "layers", "Мало объёма", `${low.slice(0, 3).map(m => `${m.group} — ${num(m.sets, 1)}`).join(", ")} подх. за неделю при ориентире 10–20.`, 2);

  return out.sort((a, b) => b.w - a.w).slice(0, 6);
}

/* weeks in a row where the whole plan was done (for the profile) */
export function planStreak() {
  let w = weekStart(today()), n = 0;
  for (let i = 0; i < 104; i++) {
    const wp = weekPlan(w), planned = wp.filter(x => x.planned).length, done = wp.filter(x => x.trained).length;
    if (i === 0 && done < planned) { w = addDays(w, -7); continue; }
    if (!planned || done < planned) break;
    n++; w = addDays(w, -7);
  }
  return n;
}
export const totals = () => {
  let workouts = 0, foodDaysN = 0;
  for (const [, d] of S.days) { if (hasWorkout(d)) workouts++; if ((d.food || []).length) foodDaysN++; }
  return { workouts, foodDays: foodDaysN, days: S.days.size };
};
