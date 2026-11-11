/* Month calendar: every day as three rings (food, workout, water), month totals, a tap opens the day. */

import { S, getDay, setDate, hasWorkout } from "../core/store.js";
import { go } from "../core/router.js";
import { esc, actions, typingIn } from "../core/dom.js";
import { icon } from "../ui/icons.js";
import { rings, playRings } from "../ui/ring.js";
import { sheet } from "../ui/sheet.js";
import { statsTabs } from "./stats.js";
import { miniRings, dayRings, METRICS } from "../domain/summary.js";
import { dayTraining, plannedFor } from "../domain/training.js";
import { dayFood } from "../domain/nutrition.js";
import { today, monthGrid, monthTitle, addMonths, ymOf, WD_S, parse, longDate } from "../core/dates.js";
import { num, litres, hours, kg, plural } from "../core/format.js";

let root, ym = ymOf(today());

function monthStats(days) {
  const now = today(), past = days.filter(d => d <= now);
  const workouts = past.filter(d => hasWorkout(getDay(d))).length, food = past.filter(d => (getDay(d).food || []).length).length;
  const scores = past.map(d => dayRings(d)).filter(r => r.any).map(r => r.score);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100) : 0;
  const cell = (v, l) => `<div class="mini"><b class="num">${v}</b><span>${l}</span></div>`;
  return `<section class="minis mt12">${cell(workouts, plural(workouts, "тренировка", "тренировки", "тренировок"))}${cell(food, plural(food, "день с едой", "дня с едой", "дней с едой"))}${cell(avg + "%", "средний день")}</section>`;
}

function draw() {
  const rows = monthGrid(ym), now = today(), sel = S.ui.date, days = rows.flat().filter(Boolean);
  root.innerHTML = `<header class="hdr"><div class="grow"><div class="eyebrow">История по дням</div><h1 class="h1">Итоги</h1></div>
  <button class="iconbtn iconbtn--card" data-act="report" aria-label="Отчёт">${icon("file", 21)}</button></header>
${statsTabs("calendar")}
<div class="daynav mt8"><button class="iconbtn" data-act="prev" aria-label="Предыдущий месяц">${icon("left", 20)}</button><button class="daynav__t cal__title" data-act="now">${monthTitle(ym)}</button><button class="iconbtn" data-act="next" aria-label="Следующий месяц">${icon("right", 20)}</button></div>
<section class="card cal mt12">
  <div class="cal__wd">${WD_S.map(w => `<span>${w}</span>`).join("")}</div>
  ${rows.map(r => `<div class="cal__row">${r.map(d => {
    if (!d) return `<span></span>`;
    const future = d > now, planned = future && plannedFor(d).length > 0;
    return `<button class="cal__day${d === now ? " is-today" : ""}${d === sel ? " is-sel" : ""}${future ? " is-future" : ""}" data-act="day" data-d="${d}" aria-label="${longDate(d)}">${rings({ size: 36, sw: 3.2, gap: 1.4, items: future ? [{ pct: 0, color: "var(--text-3)" }] : miniRings(d), inner: `<b class="num">${parse(d).getDate()}</b>` })}${planned ? `<i class="cal__plan"></i>` : ""}</button>`;
  }).join("")}</div>`).join("")}
  <div class="cal__legend">${["food", "gym", "water"].map(k => `<span><i class="dot" style="color:${METRICS[k].color}"></i>${METRICS[k].n}</span>`).join("")}<span><i class="cal__plan"></i>по плану</span></div>
</section>
${monthStats(days)}`;
}

function daySheet(d) {
  const r = dayRings(d), doc = getDay(d), tr = dayTraining(d), f = dayFood(d).sum, future = d > today();
  const line = (ico, c, name, val) => `<div class="item"><span class="item__ico" style="color:${c}">${icon(ico, 19)}</span><span class="grow b5">${name}</span><span class="item__val">${val}</span></div>`;
  const gymVal = tr.trained ? `${tr.workout ? "«" + esc(tr.workout.name) + "» · " : ""}${tr.done} подх.` : tr.planned ? (future ? `по плану «${esc(tr.planned.name)}»` : "пропущена") : "отдых";
  sheet({
    title: longDate(d).replace(/^./, c => c.toUpperCase()),
    body: `<div class="calsheet">${rings({ key: "calsheet", size: 124, sw: 11, gap: 4, items: r.items.slice(0, 4).map(i => ({ pct: i.pct == null ? 0 : i.pct, color: i.color })) })}<div><b class="num calsheet__score">${Math.round(r.score * 100)}<i>%</i></b><div class="c2 t13">${future ? "день ещё впереди" : r.any ? "дня закрыто" : "записей нет"}</div></div></div>
<div class="list mt16">${line("flame", "var(--m-food)", "Питание", f.k ? `${num(f.k)} ккал · Б ${num(f.p)}` : "—")}${line("dumbbell", "var(--m-gym)", "Тренировка", gymVal)}${line("drop", "var(--m-water)", "Вода", doc.water ? litres(doc.water) + " л" : "—")}${doc.sleep != null ? line("moon", "var(--m-sleep)", "Сон", hours(doc.sleep)) : ""}${doc.steps != null ? line("steps", "var(--m-steps)", "Шаги", num(doc.steps)) : ""}${doc.bw != null ? line("scale", "var(--accent)", "Вес", kg(doc.bw) + " кг") : ""}</div>
<div class="row mt16"><button class="btn btn--ghost" data-act="gym">Тренировка</button><button class="btn" data-act="open">Открыть день</button></div>`,
    onMount: api => {
      actions(api.el, {
        open: () => { api.close(); setDate(d); go("today"); },
        gym: () => { api.close(); setDate(d); go("workout/" + d); },
      });
      playRings(api.el);
    },
  });
}

export default {
  tab: "stats", depth: 0,
  mount(el) {
    root = el;
    actions(el, {
      view: t => { if (t.dataset.t !== "calendar") go("stats"); },
      report: () => go("report"),
      prev: () => { ym = addMonths(ym, -1); draw(); },
      next: () => { ym = addMonths(ym, 1); draw(); },
      now: () => { ym = ymOf(today()); draw(); },
      day: t => daySheet(t.dataset.d),
    });
    draw();
  },
  update(topic) { if (["day", "date", "import", "program", "settings"].includes(topic) && !typingIn(root)) draw(); },
};
