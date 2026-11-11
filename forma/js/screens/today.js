/* Home: the day at a glance — week strip, rings, today's workout, nutrition, trackers, timeline. */

import { S, getDay, setDate } from "../core/store.js";
import { go } from "../core/router.js";
import { esc, actions, countUp, typingIn } from "../core/dom.js";
import { icon } from "../ui/icons.js";
import { rings, ring, playRings } from "../ui/ring.js";
import { addWater, askWater, askSleep, askSteps, askWeight } from "../ui/trackers.js";
import { dayRings, miniRings, weightSeries } from "../domain/summary.js";
import { dayTraining, nextPlanned, minutesFor } from "../domain/training.js";
import { targets, dayFood, MEALS, mealName } from "../domain/nutrition.js";
import { today, weekDays, longDate, greeting, WD_S, parse, dayTitle } from "../core/dates.js";
import { num, litres, hours, kg, initials, nWord, signed } from "../core/format.js";

let root;

function header(date) {
  const isToday = date === today();
  return `<header class="hdr">
  <button class="avatar" data-act="profile" aria-label="Профиль">${esc(initials(S.profile.name))}</button>
  <div class="grow"><div class="eyebrow clip">${longDate(date)}</div><div class="h3 clip">${isToday ? `${greeting()}, ${esc(S.profile.name)}` : dayTitle(date)}</div></div>
  <button class="iconbtn iconbtn--card" data-act="coach" aria-label="Помощники">${icon("spark", 21)}</button>
  <button class="iconbtn iconbtn--card" data-act="calendar" aria-label="Календарь">${icon("calendar", 21)}</button>
</header>`;
}

function weekStrip(date) {
  const now = today();
  return `<div class="week">${weekDays(date).map((d, i) => {
    const n = parse(d).getDate(), future = d > now;
    return `<button class="week__day${d === date ? " is-sel" : ""}${d === now ? " is-today" : ""}${future ? " is-future" : ""}" data-act="day" data-d="${d}" aria-label="${longDate(d)}">
  <span class="week__wd">${WD_S[i]}</span>
  ${rings({ size: 36, sw: 3.2, gap: 1.4, items: future ? [{ pct: 0, color: "var(--text-3)" }] : miniRings(d), inner: `<b class="num">${n}</b>` })}
</button>`;
  }).join("")}</div>${date !== now ? `<button class="chip chip--accent is-on week__back" data-act="today">${icon("left", 16)} К сегодняшнему дню</button>` : ""}`;
}

const SCORE_WORD = p => (p >= 1 ? "День закрыт" : p >= 0.75 ? "Почти всё" : p >= 0.4 ? "Хороший темп" : p > 0 ? "Разгоняемся" : "Начнём?");

function hero(date) {
  const { items, score } = dayRings(date), n = items.length;
  const geo = n <= 3 ? { sw: 14, gap: 5 } : n === 4 ? { sw: 11, gap: 4 } : { sw: 9, gap: 3.5 };
  /* value / goal, with a unit only where the number alone is unclear (litres, hours) */
  const val = i => {
    if (i.key === "food") return `<b class="num">${num(i.v)}</b> / ${num(i.goal)}`;
    if (i.key === "gym") return i.rest ? "отдых" : `<b class="num">${i.v}</b> / ${i.goal}`;
    if (i.key === "water") return `<b class="num">${litres(i.v)}</b> / ${litres(i.goal)} л`;
    if (i.key === "sleep") return i.v == null ? "—" : `<b class="num">${num(i.v, 1)}</b> / ${i.goal} ч`;
    return i.v == null ? "—" : `<b class="num">${num(i.v)}</b> / ${num(i.goal)}`;
  };
  return `<section class="card hero">
  ${rings({ key: "hero", size: 136, ...geo, items: items.map(i => ({ pct: i.pct == null ? 0 : i.pct, color: i.color })) })}
  <div class="hero__side">
    <div class="hero__score"><b class="num" data-count="${Math.round(score * 100)}" data-from="${hero.last ?? 0}">0</b><i>%</i></div>
    <div class="hero__word">${SCORE_WORD(score)}</div>
    <ul class="hero__legend">${items.map(i => `<li><i class="dot" style="color:${i.color}"></i><span>${i.short}</span><em>${val(i)}</em></li>`).join("")}</ul>
  </div>
</section>`;
}

function workoutCard(date) {
  if (!S.program) return `<section class="card wcard wcard--empty card--tap" data-act="gym">
  <div class="wcard__ico">${icon("dumbbell", 24)}</div>
  <div class="grow"><div class="h3">Собери программу</div><p class="c2 t13 mt4">Готовый план за минуту или свой из 1045 упражнений</p></div>${icon("right", 20)}
</section>`;
  const tr = dayTraining(date), w = tr.workout, isPast = date < today();
  if (tr.rest) {
    const nx = nextPlanned(date);
    return `<section class="card wcard">
  <div class="row"><div class="wcard__ico wcard__ico--rest">${icon("bed", 24)}</div>
  <div class="grow"><div class="eyebrow">${isPast ? "Был день отдыха" : "День отдыха"}</div><div class="h3 mt4">Мышцы растут, пока отдыхаешь</div>
  ${nx ? `<p class="c2 t13 mt4">Дальше — ${WD_S[(parse(nx.date).getDay() + 6) % 7]}, «${esc(nx.workout.name)}»</p>` : ""}</div></div>
  <button class="btn btn--ghost btn--sm mt12" style="width:100%" data-act="workout">Потренироваться всё равно</button>
</section>`;
  }
  const names = w.ex.slice(0, 3).map(e => esc(e.name)).join(" · ") + (w.ex.length > 3 ? ` и ещё ${w.ex.length - 3}` : "");
  const done = tr.pct >= 1, started = tr.done > 0;
  return `<section class="card wcard${done ? " wcard--done" : ""}">
  <div class="row row--top"><div class="wcard__ico">${icon(done ? "check" : "dumbbell", 24)}</div>
  <div class="grow"><div class="eyebrow">${done ? "Тренировка закрыта" : started ? "Тренировка идёт" : isPast ? "Было по плану" : "По плану"}</div>
  <div class="h2 mt4 clip">${esc(w.name)}</div>
  <p class="c2 t13 mt4">${nWord(w.ex.length, "упражнение", "упражнения", "упражнений")} · ≈ ${minutesFor(w)} мин</p></div>
  <div class="wcard__sets"><b class="num">${tr.done}</b><span>/${tr.total}</span></div></div>
  ${started ? `<div class="bar mt12"><i class="bar__fill" style="--w:${Math.round(tr.pct * 100)}%;--c:${done ? "var(--good)" : "var(--m-gym)"}"></i></div>` : `<p class="wcard__names c3 t13 mt12">${names}</p>`}
  <button class="btn ${done ? "btn--ghost" : ""} mt12" data-act="workout">${done ? "Открыть запись" : started ? "Продолжить" : "Начать тренировку"} ${icon("arrowR", 18)}</button>
</section>`;
}

function foodCard(date) {
  const t = targets(), f = dayFood(date), left = t.kcal - f.sum.k, over = left < 0;
  const macro = (n, v, goal, c) => `<div class="macro"><div class="macro__row"><span class="c2">${n}</span><span><b>${num(v)}</b><span class="c3"> / ${goal} г</span></span></div><div class="bar bar--thin"><i class="bar__fill" style="--w:${Math.min(100, Math.round(v / goal * 100))}%;--c:${c}"></i></div></div>`;
  return `<section class="card fcard">
  <div class="card__head"><div class="card__title">Питание</div><button class="section__link" data-act="diary">Дневник</button></div>
  <div class="row g16">
    ${ring({ key: "fcard", size: 92, sw: 9, pct: f.sum.k / t.kcal, color: over ? "var(--bad)" : "var(--m-food)", inner: `<div><b class="num t20">${num(Math.abs(left))}</b><div class="t11 c3">${over ? "перебор" : "осталось"}</div></div>` })}
    <div class="grow stack">${macro("Белки", f.sum.p, t.p, "var(--mp)")}${macro("Жиры", f.sum.f, t.f, "var(--mf)")}${macro("Углеводы", f.sum.c, t.c, "var(--mc)")}</div>
  </div>
  <div class="fcard__meals">${MEALS.map(m => { const s = f.byMeal[m.k].sum.k; return `<button class="fcard__meal${s ? " is-has" : ""}" data-act="meal" data-m="${m.k}"><span>${icon(s ? m.ico : "plus", 18)}</span><b>${m.n}</b><small>${s ? num(s) + " ккал" : "добавить"}</small></button>`; }).join("")}</div>
</section>`;
}

function trackers(date) {
  const tk = S.settings.trackers, d = getDay(date), t = targets(), out = [];
  if (tk.water) {
    const glass = S.settings.glass || 250;
    out.push(`<div class="card tile" style="--c:var(--m-water)">
  <button class="tile__top" data-act="water-set"><span class="tile__ico">${icon("drop", 19)}</span><span class="c3 t13">из ${litres(t.water)} л</span></button>
  <button class="tile__main" data-act="water-set"><div class="tile__val">${litres(d.water || 0)}<small>л воды</small></div></button>
  <div class="tile__btns"><button data-act="water" data-v="${-glass}" aria-label="Убрать стакан">${icon("minus", 18)}</button><button class="is-main" data-act="water" data-v="${glass}">+ ${glass} мл</button></div>
</div>`);
  }
  if (tk.sleep) out.push(`<button class="card tile card--tap" style="--c:var(--m-sleep)" data-act="sleep">
  <span class="tile__top"><span class="tile__ico">${icon("moon", 19)}</span><span class="c3 t13">цель ${t.sleep} ч</span></span>
  <span class="tile__val">${d.sleep != null ? hours(d.sleep) : "—"}</span><span class="c3 t13">${d.sleep != null ? "сон" : "записать сон"}</span></button>`);
  if (tk.steps) out.push(`<button class="card tile card--tap" style="--c:var(--m-steps)" data-act="steps">
  <span class="tile__top"><span class="tile__ico">${icon("steps", 19)}</span><span class="c3 t13">цель ${num(t.steps)}</span></span>
  <span class="tile__val">${d.steps != null ? num(d.steps) : "—"}</span><span class="c3 t13">${d.steps != null ? "шагов" : "вписать шаги"}</span></button>`);
  if (tk.weight) {
    const ws = weightSeries().filter(p => p.d <= date), last = ws[ws.length - 1], prev = d.bw != null ? ws[ws.length - 2] : null;
    const delta = d.bw != null && prev ? d.bw - prev.v : null;
    out.push(`<button class="card tile card--tap" style="--c:var(--accent)" data-act="weight">
  <span class="tile__top"><span class="tile__ico">${icon("scale", 19)}</span>${delta ? `<span class="badge ${delta < 0 ? "badge--good" : ""}">${signed(delta, 1)} кг</span>` : `<span class="c3 t13">вес тела</span>`}</span>
  <span class="tile__val">${d.bw != null ? kg(d.bw) : last ? kg(last.v) : "—"}<small>кг</small></span><span class="c3 t13">${d.bw != null ? "записан" : last ? "последний · обновить" : "записать вес"}</span></button>`);
  }
  return out.length ? `<section class="grid2 trk">${out.join("")}</section>` : "";
}

function timeline(date) {
  const d = getDay(date), f = dayFood(date), tr = dayTraining(date), ev = [];
  if (d.sleep != null) ev.push({ t: "", o: 0, ico: "moon", c: "var(--m-sleep)", n: "Сон", s: hours(d.sleep) });
  if (d.bw != null) ev.push({ t: "", o: 1, ico: "scale", c: "var(--accent)", n: "Взвешивание", s: `${kg(d.bw)} кг` });
  MEALS.forEach(m => {
    const items = f.byMeal[m.k].items;
    if (items.length) ev.push({ t: items.map(i => i.t || "").sort()[0], o: 2, ico: m.ico, c: "var(--m-food)", n: mealName(m.k), s: `${items.map(i => i.n).slice(0, 2).join(", ")}${items.length > 2 ? ` +${items.length - 2}` : ""} · ${num(f.byMeal[m.k].sum.k)} ккал` });
  });
  if (tr.trained) ev.push({ t: (d.w && d.w.t0) || "", o: 2, ico: "dumbbell", c: "var(--m-gym)", n: `Тренировка${tr.workout ? ` «${tr.workout.name}»` : ""}`, s: nWord(tr.done, "подход", "подхода", "подходов") });
  if (d.water) ev.push({ t: "", o: 3, ico: "drop", c: "var(--m-water)", n: "Вода", s: `${litres(d.water)} л за день` });
  if (d.steps != null) ev.push({ t: "", o: 3, ico: "steps", c: "var(--m-steps)", n: "Шаги", s: num(d.steps) });
  if (!ev.length) return `<section class="section"><div class="section__head"><h2 class="h2">Лента дня</h2></div>
  <div class="card empty"><div class="empty__ico">${icon("list", 26)}</div><div class="h3">Пока пусто</div><p>Запиши еду, воду или тренировку — день соберётся здесь.</p></div></section>`;
  ev.sort((a, b) => a.o - b.o || (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  return `<section class="section"><div class="section__head"><h2 class="h2">Лента дня</h2></div>
  <ol class="tl">${ev.map(e => `<li class="tl__it"><span class="tl__time num">${e.t || "·"}</span><span class="tl__dot" style="--c:${e.c}">${icon(e.ico, 16)}</span><div class="grow"><b>${esc(e.n)}</b><div class="c2 t13 clip">${esc(e.s)}</div></div></li>`).join("")}</ol></section>`;
}

function draw() {
  const date = S.ui.date;
  root.innerHTML = `${header(date)}${weekStrip(date)}<div class="stack stagger mt16">${hero(date)}${workoutCard(date)}${foodCard(date)}${trackers(date)}</div>${timeline(date)}`;
  hero.last = Math.round(dayRings(date).score * 100);
  playRings(root); countUp(root);
}

export default {
  tab: "today", depth: 0,
  mount(el) {
    root = el; hero.last = 0;
    actions(el, {
      profile: () => go("profile"),
      coach: () => go("coach/trainer"),
      calendar: () => go("calendar"),
      day: t => setDate(t.dataset.d),
      today: () => setDate(today()),
      gym: () => go("gym"),
      workout: () => go("workout/" + S.ui.date),
      diary: () => go("food"),
      meal: t => go("food/add/" + t.dataset.m),
      water: t => addWater(S.ui.date, Number(t.dataset.v)),
      "water-set": () => askWater(S.ui.date),
      sleep: () => askSleep(S.ui.date),
      steps: () => askSteps(S.ui.date),
      weight: () => askWeight(S.ui.date),
    });
    draw();
  },
  update() { if (!typingIn(root)) draw(); },
};
