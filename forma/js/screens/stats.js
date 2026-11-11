/* Results: conclusions of the week in plain words, calories, body weight, workouts and strength, habits.
   Period: a week (with navigation), the last 30 days, or the last 13 weeks. */

import { S, getDay, hasWorkout } from "../core/store.js";
import { go } from "../core/router.js";
import { esc, actions, typingIn } from "../core/dom.js";
import { icon } from "../ui/icons.js";
import { barChart, lineChart, spark } from "../ui/chart.js";
import { askWeight } from "../ui/trackers.js";
import { insights, periodSummary, weightSeries, weightRate } from "../domain/summary.js";
import { dayFood } from "../domain/nutrition.js";
import { P, trends, weekPlan } from "../domain/training.js";
import { today, addDays, weekStart, range, WD_S, shortDate, diffDays, parse } from "../core/dates.js";
import { num, litres, signed, plural, hours } from "../core/format.js";

const PERIODS = [["w", "Неделя"], ["m", "30 дней"], ["q", "13 недель"]];
/* "3.11" — a short day.month label for chart axes */
const dm = d => { const x = parse(d); return `${x.getDate()}.${String(x.getMonth() + 1).padStart(2, "0")}`; };
let root, period = "w", ref = today();

export const statsTabs = on => `<div class="seg mt12"><button class="${on === "stats" ? "is-on" : ""}" data-act="view" data-t="stats">Обзор</button><button class="${on === "calendar" ? "is-on" : ""}" data-act="view" data-t="calendar">Календарь</button></div>`;

function bounds() {
  if (period === "w") { const from = weekStart(ref); return { from, to: addDays(from, 6) }; }
  const to = today();
  return { from: addDays(to, period === "m" ? -29 : -90), to };
}

function insightCards(from) {
  const list = insights(from);
  if (!list.length) return `<div class="card empty"><div class="empty__ico">${icon("spark", 26)}</div><div class="h3">Выводы появятся с записями</div><p>Потренируйся и запиши еду хотя бы три дня — подскажу, что получается и что поправить.</p></div>`;
  return `<div class="stack">${list.map(i => `<article class="ins ins--${i.tone}"><span class="ins__ico">${icon(i.ico, 20)}</span><div><b>${esc(i.title)}</b><p>${esc(i.text)}</p></div></article>`).join("")}</div>`;
}

function kcalSection(from, to, s) {
  const t = s.t, now = today();
  let data;
  if (period === "q") {
    data = Array.from({ length: 13 }, (_, i) => {
      const a = addDays(weekStart(to), -7 * (12 - i)), ks = range(a, addDays(a, 6)).map(d => dayFood(d).sum.k).filter(k => k > 0);
      return { l: i % 3 === 0 ? dm(a) : "", v: ks.length ? ks.reduce((x, y) => x + y, 0) / ks.length : null, on: i === 12 };
    });
  } else {
    data = range(from, to).map((d, i) => ({ l: period === "w" ? WD_S[i] : (i % 5 === 4 || i === 0 ? String(parse(d).getDate()) : ""), v: dayFood(d).sum.k || null, on: d === now }));
  }
  const m = (n, v, goal, c) => `<div class="smac" style="--c:${c}"><span>${n}</span><b class="num">${v != null ? num(v) : "—"}</b><small>из ${goal} г</small></div>`;
  return `<section class="section"><div class="section__head"><h2 class="h2">Калории</h2><span class="c3 t13">${s.foodDays ? `в среднем ${num(s.kcal)} ккал` : "нет записей"}</span></div>
<div class="card">${barChart({ data, goal: t.kcal, color: "var(--m-food)" })}
<div class="smacs">${m("Белки", s.p, t.p, "var(--mp)")}${m("Жиры", s.f, t.f, "var(--mf)")}${m("Углеводы", s.c, t.c, "var(--mc)")}</div>
<p class="c3 t13 mt12">${s.foodDays ? `Среднее считается по дням с записями: ${s.foodDays} ${plural(s.foodDays, "день", "дня", "дней")}.` : "Запиши еду — здесь появится картина по дням."}</p></div></section>`;
}

function weightSection(to) {
  const all = weightSeries(), from = addDays(to, period === "q" ? -90 : -34), pts = all.filter(p => p.d >= from && p.d <= to);
  if (!pts.length) return `<section class="section"><div class="section__head"><h2 class="h2">Вес тела</h2></div><div class="card empty"><div class="empty__ico">${icon("scale", 26)}</div><div class="h3">Взвесься пару раз в неделю</div><p>Утром натощак. По тренду видно, работает ли питание, — один замер ничего не значит.</p><button class="btn btn--soft btn--sm mt16" data-act="weigh">Записать вес</button></div></section>`;
  const rate = weightRate(all.filter(p => p.d <= to)), first = pts[0], last = pts[pts.length - 1], delta = last.v - first.v;
  return `<section class="section"><div class="section__head"><h2 class="h2">Вес тела</h2><span class="c3 t13">${rate != null ? `${signed(rate, 2)} кг в неделю` : `${pts.length} ${plural(pts.length, "замер", "замера", "замеров")}`}</span></div>
<div class="card"><div class="row between"><div><b class="num t26">${num(last.v, 1)}</b> <span class="c3">кг</span></div>${pts.length > 1 ? `<span class="badge ${S.profile.goal === "lose" ? (delta < 0 ? "badge--good" : "") : S.profile.goal === "gain" ? (delta > 0 ? "badge--good" : "") : ""}">${signed(delta, 1)} кг с ${shortDate(first.d)}</span>` : ""}</div>
<div class="mt8">${lineChart({ pts: pts.map(p => ({ x: diffDays(first.d, p.d), y: p.v, l: shortDate(p.d) })), color: "var(--accent)" })}</div></div></section>`;
}

function gymSection(from, to, s) {
  const weeks = period === "q" ? 13 : 8, end = weekStart(period === "w" ? from : to), per = S.program ? S.program.workouts.reduce((n, w) => n + w.days.length, 0) : 0;
  const data = Array.from({ length: weeks }, (_, i) => {
    const a = addDays(end, -7 * (weeks - 1 - i));
    return { l: i % 2 === (weeks - 1) % 2 ? dm(a) : "", v: weekPlan(a).filter(x => x.trained).length || null, on: i === weeks - 1 };
  });
  const tr = trends(from, to), up = tr.filter(x => x.kind === "up"), down = tr.filter(x => x.kind === "down"), flat = tr.length - up.length - down.length;
  const row = (x, tone) => `<button class="item" data-act="ex" data-id="${esc(x.e.id)}"><span class="item__ico ${tone === "up" ? "cg" : "cw"}">${icon(tone === "up" ? "trend" : "info", 18)}</span><span class="grow"><span class="b5 clip" style="display:block">${esc(x.e.name)}</span><span class="c3 t13">${esc(x.t.j.was)} → ${esc(x.t.j.now)}</span></span><span class="badge badge--${tone === "up" ? "good" : "warn"}">${esc(P.deltaText(x.e, x.t.j))}</span></button>`;
  return `<section class="section"><div class="section__head"><h2 class="h2">Тренировки</h2><span class="c3 t13">${s.done} ${s.planned ? `из ${s.planned} по плану` : plural(s.done, "тренировка", "тренировки", "тренировок")}</span></div>
<div class="card">${barChart({ data, goal: per || null, color: "var(--m-gym)", h: 120, goalLabel: "план", fmt: v => num(v) })}<p class="c3 t13 mt8">Тренировок в неделю, последние ${weeks} недель.</p></div>
${tr.length ? `<div class="minis mt12"><div class="mini"><b class="num cg">${up.length}</b><span>растут</span></div><div class="mini"><b class="num">${flat}</b><span>на месте</span></div><div class="mini"><b class="num ${down.length ? "cw" : ""}">${down.length}</b><span>просели</span></div></div>` : ""}
${up.length || down.length ? `<div class="list mt12">${up.slice(0, 5).map(x => row(x, "up")).join("")}${down.slice(0, 3).map(x => row(x, "down")).join("")}</div>` : ""}</section>`;
}

function habits(from, to, s) {
  const tk = S.settings.trackers, t = s.t, days = range(from, to), out = [];
  const tile = (key, ico, c, name, val, sub) => `<div class="card tile" style="--c:${c}"><div class="tile__top"><span class="tile__ico">${icon(ico, 19)}</span>${spark({ values: days.map(d => getDay(d)[key] ?? null), color: c, w: 68 })}</div><div class="tile__val">${val}</div><span class="c3 t13">${name} · ${sub}</span></div>`;
  if (tk.water) out.push(tile("water", "drop", "var(--m-water)", "вода", s.water != null ? `${litres(Math.round(s.water / 50) * 50)}<small>л</small>` : "—", `цель ${litres(t.water)} л`));
  if (tk.sleep) out.push(tile("sleep", "moon", "var(--m-sleep)", "сон", s.sleep != null ? hours(Math.round(s.sleep * 4) / 4) : "—", `цель ${t.sleep} ч`));
  if (tk.steps) out.push(tile("steps", "steps", "var(--m-steps)", "шаги", s.steps != null ? num(Math.round(s.steps / 10) * 10) : "—", `цель ${num(t.steps)}`));
  const logged = days.filter(d => d <= today() && (hasWorkout(getDay(d)) || (getDay(d).food || []).length)).length, total = days.filter(d => d <= today()).length;
  out.push(`<div class="card tile" style="--c:var(--good)"><div class="tile__top"><span class="tile__ico">${icon("check", 19)}</span></div><div class="tile__val">${logged}<small>из ${total}</small></div><span class="c3 t13">дней с записями</span></div>`);
  return `<section class="section"><div class="section__head"><h2 class="h2">Привычки</h2><span class="c3 t13">в среднем за день</span></div><div class="grid2">${out.join("")}</div></section>`;
}

function draw() {
  const { from, to } = bounds(), s = periodSummary(from, to), isThisWeek = weekStart(ref) === weekStart(today());
  root.innerHTML = `<header class="hdr"><div class="grow"><div class="eyebrow">Что получается</div><h1 class="h1">Итоги</h1></div>
  <button class="iconbtn iconbtn--card" data-act="report" aria-label="Отчёт">${icon("file", 21)}</button></header>
${statsTabs("stats")}
<div class="seg mt8">${PERIODS.map(([k, n]) => `<button class="${period === k ? "is-on" : ""}" data-act="period" data-p="${k}">${n}</button>`).join("")}</div>
${period === "w" ? `<div class="daynav mt8"><button class="iconbtn" data-act="prev" aria-label="Прошлая неделя">${icon("left", 20)}</button><button class="daynav__t" data-act="now">${isThisWeek ? "Эта неделя" : `${shortDate(from)} — ${shortDate(to)}`}</button><button class="iconbtn" data-act="next"${isThisWeek ? " disabled style=\"opacity:.3\"" : ""} aria-label="Следующая неделя">${icon("right", 20)}</button></div>` : ""}
<section class="section" style="margin-top:16px"><div class="section__head"><h2 class="h2">${period === "w" ? "Выводы недели" : "Выводы последней недели"}</h2></div>${insightCards(period === "w" ? from : to)}</section>
${kcalSection(from, to, s)}${weightSection(to > today() ? today() : to)}${gymSection(from, to, s)}${habits(from, to, s)}`;
}

export default {
  tab: "stats", depth: 0,
  mount(el) {
    root = el;
    actions(el, {
      view: t => { if (t.dataset.t !== "stats") go("calendar"); },
      report: () => go("report"),
      period: t => { period = t.dataset.p; draw(); },
      prev: () => { ref = addDays(weekStart(ref), -7); draw(); },
      next: () => { if (weekStart(ref) < weekStart(today())) { ref = addDays(weekStart(ref), 7); draw(); } },
      now: () => { ref = today(); draw(); },
      ex: t => go("exercise/" + t.dataset.id),
      weigh: () => askWeight(today()),
    });
    draw();
  },
  update(topic) { if (["day", "import", "profile", "settings"].includes(topic) && !typingIn(root)) draw(); },
};
