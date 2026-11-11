/* Gym tab: pick a program on first visit; then the week plan, workouts, weekly volume per muscle. */

import { S, setDate } from "../core/store.js";
import { go } from "../core/router.js";
import { esc, actions, typingIn } from "../core/dom.js";
import { icon } from "../ui/icons.js";
import { hBars } from "../ui/chart.js";
import { toast } from "../ui/sheet.js";
import { exThumb } from "../ui/thumb.js";
import { TEMPLATES, buildTemplate, saveProgram, emptyProgram, weekPlan, weekMuscles, minutesFor, weekStreak, workoutDays, groupName } from "../domain/training.js";
import { today, WD_S, weekStart, addDays, ymOf } from "../core/dates.js";
import { nWord, plural, num } from "../core/format.js";

let root;

const daysText = w => (w.days.length ? w.days.map(d => WD_S[d]).join(", ") : "без дня");

function chooser() {
  return `<header class="hdr"><div class="grow"><div class="eyebrow">Зал</div><h1 class="h1">Выбери программу</h1></div></header>
<p class="c2">Готовый план — самый быстрый старт. Упражнения, подходы и дни потом можно менять как угодно.</p>
<div class="stack stagger mt16">${TEMPLATES.map(t => {
    const p = buildTemplate(t), n = p.workouts.reduce((s, w) => s + w.ex.length, 0);
    return `<button class="card card--tap tpl" data-act="tpl" data-k="${t.key}">
  <div class="tpl__thumbs">${p.workouts[0].ex.slice(0, 4).map(e => exThumb(e, "thumb--sm")).join("")}</div>
  <div class="row between mt12"><h2 class="h2">${t.name}</h2><span class="badge badge--accent">${t.per} ${plural(t.per, "день", "дня", "дней")} в неделю</span></div>
  <p class="c2 t13 mt4">${t.level}. ${t.note}</p>
  <p class="c3 t13 mt8">${nWord(p.workouts.length, "тренировка", "тренировки", "тренировок")} · ${nWord(n, "упражнение", "упражнения", "упражнений")}</p>
</button>`;
  }).join("")}
<button class="card card--tap tpl tpl--own" data-act="own"><span class="wcard__ico">${icon("edit", 22)}</span><div class="grow"><div class="h3">Собрать свою</div><p class="c2 t13 mt4">С нуля, из каталога на 1045 упражнений</p></div>${icon("right", 20)}</button></div>`;
}

function weekCard() {
  const wp = weekPlan(today()), done = wp.filter(x => x.trained).length, planned = wp.filter(x => x.planned).length;
  return `<section class="card">
  <div class="card__head"><div class="card__title">Эта неделя</div><span class="badge ${planned && done >= planned ? "badge--good" : ""}">${done} из ${planned || done} ${plural(planned || done, "тренировки", "тренировок", "тренировок")}</span></div>
  <div class="wk">${wp.map((x, i) => `<button class="wk__day wk__day--${x.state}" data-act="open" data-d="${x.date}" aria-label="${WD_S[i]}">
    <span class="wk__wd">${WD_S[i]}</span>
    <span class="wk__mark">${x.state === "done" ? icon("check", 18, { sw: 2.6 }) : x.planned ? esc(x.planned.name.slice(0, 1).toUpperCase()) : ""}</span>
    <span class="wk__name clip">${x.planned ? esc(x.planned.name) : x.trained ? "вне плана" : "отдых"}</span>
  </button>`).join("")}</div>
</section>`;
}

function statsRow() {
  const days = workoutDays(), ym = ymOf(today()), month = days.filter(d => ymOf(d) === ym).length, streak = weekStreak();
  const cell = (v, l) => `<div class="mini"><b class="num">${v}</b><span>${l}</span></div>`;
  return `<section class="minis">${cell(streak, plural(streak, "неделя подряд", "недели подряд", "недель подряд"))}${cell(month, "в этом месяце")}${cell(days.length, "всего тренировок")}</section>`;
}

function workoutCards() {
  return S.program.workouts.map(w => {
    const groups = [...new Set(w.ex.map(groupName).filter(Boolean))].slice(0, 4);
    return `<button class="card card--tap wrow" data-act="start" data-w="${esc(w.id)}">
  <div class="wrow__thumbs">${w.ex.slice(0, 3).map(e => exThumb(e, "thumb--sm")).join("")}${w.ex.length > 3 ? `<span class="wrow__more num">+${w.ex.length - 3}</span>` : ""}</div>
  <div class="row between mt12"><h3 class="h2 clip">${esc(w.name)}</h3><span class="c3 t13 nowrap">${daysText(w)}</span></div>
  <p class="c2 t13 mt4">${w.ex.length ? `${nWord(w.ex.length, "упражнение", "упражнения", "упражнений")} · ≈ ${minutesFor(w)} мин` : "Пока без упражнений"}</p>
  ${groups.length ? `<div class="wrow__tags">${groups.map(g => `<span class="badge">${g}</span>`).join("")}</div>` : ""}
</button>`;
  }).join("");
}

function volume() {
  const from = weekStart(today()), rows = weekMuscles(from), prev = new Map(weekMuscles(addDays(from, -7)).map(m => [m.gi, m.sets]));
  if (!rows.length) return `<div class="card empty"><div class="empty__ico">${icon("layers", 26)}</div><div class="h3">Объём появится после тренировки</div><p>Считаем рабочие подходы на каждую группу мышц. Ориентир для роста — 10–20 в неделю.</p></div>`;
  return `<div class="card">${hBars({ rows: rows.map(m => ({ l: m.group, v: m.sets })), band: [10, 20], max: 22 })}
  <p class="c3 t13 mt12">Зелёная зона — 10–20 подходов в неделю на группу. ${rows.some(m => (prev.get(m.gi) || 0) > 0) ? `На прошлой неделе: ${rows.filter(m => prev.get(m.gi)).slice(0, 3).map(m => `${m.group.toLowerCase()} ${num(prev.get(m.gi), 1)}`).join(", ")}.` : ""}</p></div>`;
}

function draw() {
  if (!S.program) { root.innerHTML = chooser(); return; }
  root.innerHTML = `<header class="hdr"><div class="grow"><div class="eyebrow">Твоя программа</div><h1 class="h1">Зал</h1></div>
  <button class="iconbtn iconbtn--card" data-act="coach" aria-label="Спросить тренера">${icon("spark", 21)}</button>
  <button class="iconbtn iconbtn--card" data-act="edit" aria-label="Изменить программу">${icon("sliders", 21)}</button></header>
<div class="stack stagger">${weekCard()}${statsRow()}</div>
<section class="section"><div class="section__head"><h2 class="h2">Тренировки</h2><button class="section__link" data-act="edit">Изменить</button></div><div class="stack">${workoutCards()}</div></section>
<section class="section"><div class="section__head"><h2 class="h2">Объём за неделю</h2></div>${volume()}</section>
<section class="section"><div class="list">
  <button class="item" data-act="lib"><span class="item__ico">${icon("book", 20)}</span><span class="grow b5">Все упражнения</span><span class="item__val">1045</span><span class="item__chev">${icon("right", 18)}</span></button>
  <button class="item" data-act="edit"><span class="item__ico">${icon("sliders", 20)}</span><span class="grow b5">Программа и дни</span><span class="item__chev">${icon("right", 18)}</span></button>
</div></section>`;
}

export default {
  tab: "gym", depth: 0,
  mount(el) {
    root = el;
    actions(el, {
      tpl(t) {
        const tp = TEMPLATES.find(x => x.key === t.dataset.k);
        saveProgram(buildTemplate(tp));
        toast(`Программа «${tp.name}» готова`);
      },
      own() { saveProgram(emptyProgram()); go("program"); },
      edit: () => go("program"),
      coach: () => go("coach/trainer"),
      lib: () => go("library", { pick: null }),
      open: t => { setDate(t.dataset.d); go("workout/" + t.dataset.d); },
      start: t => go("workout/" + today(), { wid: t.dataset.w }),
    });
    draw();
  },
  update(topic) { if (["program", "day", "import", "gone"].includes(topic) && !typingIn(root)) draw(); },
};
