/* Exercise card: photo, records by reps, a chart of the best set over time, history with verdicts,
   a link to the technique page. Works for program exercises (by their id) and catalog entries. */

import { back } from "../core/router.js";
import { esc, actions } from "../core/dom.js";
import { icon } from "../ui/icons.js";
import { lineChart } from "../ui/chart.js";
import { P, exDef, sessions, bwOn, targetText, groupName } from "../domain/training.js";
import { LIBMAP, photoOf, techUrl, GROUP_HUE, groupIndex } from "../domain/catalog.js";
import { shortDate, diffDays, today } from "../core/dates.js";
import { kg, plural } from "../core/format.js";

function body(id) {
  const e = exDef(id);
  if (!e) return `<div class="card empty"><div class="empty__ico">${icon("info", 26)}</div><div class="h3">Упражнение не найдено</div></div>`;
  const x = e.lib ? LIBMAP[e.lib] : null, src = photoOf(x), all = sessions(e.id), bw = bwOn(today());
  const time = P.isTime(e), bodyW = P.isBody(e);
  const hero = src
    ? `<div class="exh"><img src="${src}" alt="${esc(e.name)}"><div class="exh__fade"></div></div>`
    : `<div class="exh exh--plain" style="--hue:${GROUP_HUE[groupIndex(e)] ?? 220}">${icon("dumbbell", 56, { sw: 1.4 })}</div>`;
  const tags = [groupName(e), x ? x.equip : "", x && x.sub ? x.sub : ""].filter(Boolean).map(t => `<span class="badge">${esc(t)}</span>`).join("");

  let stats = "", chart = "", records = "", history = "";
  if (all.length) {
    const best = all.map(s => ({ d: s.d, b: P.bestAll(e, s.x, bw) })).filter(p => p.b);
    /* what the chart shows: the best set's time, added weight / reps for bodyweight moves, or kilos */
    const extra = bodyW && best.some(p => p.b.w > 0);
    const val = b => (time ? b.r : bodyW ? (extra ? b.w : b.r) : b.w);
    const unit = time ? (e.unit === "минуты" ? "мин" : "с") : bodyW && !extra ? "повт." : "кг";
    const first = best[0], last = best[best.length - 1];
    stats = `<section class="minis"><div class="mini"><b class="num">${all.length}</b><span>${plural(all.length, "тренировка", "тренировки", "тренировок")}</span></div><div class="mini"><b class="num">${kg(Math.max(...best.map(p => val(p.b))))}</b><span>максимум, ${unit}</span></div><div class="mini"><b class="num">${shortDate(last.d)}</b><span>последний раз</span></div></section>`;
    if (best.length >= 2) chart = `<section class="section"><div class="section__head"><h2 class="h2">Лучший подход</h2><span class="c3 t13">${unit}</span></div><div class="card">${lineChart({ pts: best.map(p => ({ x: diffDays(first.d, p.d), y: val(p.b), l: shortDate(p.d) })), color: "var(--m-gym)", fmt: v => kg(Math.round(v * 10) / 10) })}</div></section>`;
    const rec = P.repRecords(e, all, bw);
    if (rec.length) records = `<section class="section"><div class="section__head"><h2 class="h2">Рекорды</h2><span class="c3 t13">${time ? "самое долгое" : "по числу повторов"}</span></div><div class="recs">${rec.slice(-8).map(r => `<div class="rec"><b class="num">${time ? r.r + (e.unit === "минуты" ? " мин" : " с") : (bodyW ? (r.w ? "+" + kg(r.w) : "свой вес") : kg(r.w) + " кг")}</b>${time ? "" : `<span>× ${r.r}</span>`}<small>${shortDate(r.d)}</small></div>`).join("")}</div></section>`;
    const rows = all.slice().reverse().slice(0, 14).map((s, i, arr) => {
      const prev = arr[i + 1], j = prev ? P.judge(e, prev.x, s.x, bw, { gap: diffDays(prev.d, s.d) }) : null;
      const mark = !j ? "" : j.v > 0 ? `<span class="badge badge--good">${icon("trend", 13)} ${P.deltaText(e, j)}</span>` : j.v < 0 ? `<span class="badge badge--warn">${P.deltaText(e, j)}</span>` : "";
      return `<div class="item hist"><span class="hist__date">${shortDate(s.d)}</span><span class="grow hist__sets">${P.setsOf(e, s.x, null).map(q => `<i>${P.setChip(e, q)}</i>`).join("")}${s.x.nt ? `<small>${esc(s.x.nt)}</small>` : ""}</span>${mark}</div>`;
    }).join("");
    history = `<section class="section"><div class="section__head"><h2 class="h2">История</h2><span class="c3 t13">${all.length > 14 ? "последние 14" : ""}</span></div><div class="list">${rows}</div></section>`;
  } else {
    history = `<section class="section"><div class="card empty"><div class="empty__ico">${icon("chart", 26)}</div><div class="h3">Истории пока нет</div><p>После первой записи здесь появятся рекорды, график и все подходы.</p></div></section>`;
  }
  const url = techUrl(x);
  return `${hero}<div class="exinfo"><h1 class="h1">${esc(e.name)}</h1><div class="row g6 mt8" style="flex-wrap:wrap">${tags}</div>
<p class="c2 mt12">План: <b class="num t17" style="color:var(--text)">${targetText(e)}</b> · ${e.unit}${!time && e.step ? ` · шаг ${kg(e.step)} кг` : ""}</p></div>
${stats}${chart}${records}${history}
${url ? `<a class="btn btn--soft mt24" href="${url}" target="_blank" rel="noopener">${icon("external", 18)} Техника выполнения</a><p class="c3 t13 center mt8">Откроется страница упражнения на fitpush.ru</p>` : ""}`;
}

export default {
  depth: 3,
  mount(el, params) {
    actions(el, { back: () => back("gym") });
    el.innerHTML = `<div class="topbar topbar--over"><button class="iconbtn iconbtn--card" data-act="back" aria-label="Назад">${icon("left", 22)}</button></div>${body(params.id)}`;
  },
};
