/* Report for a coach or a doctor: the period on one page — print it to PDF, copy as text or share. */

import { back } from "../core/router.js";
import { esc, actions } from "../core/dom.js";
import { icon } from "../ui/icons.js";
import { toast } from "../ui/sheet.js";
import { buildReport, reportText } from "../domain/report.js";
import { shortDate } from "../core/dates.js";
import { num, litres, signed, kg } from "../core/format.js";

let root, days = 30;

function draw() {
  const r = buildReport(days), { s, t, p } = r;
  const kv = (a, b) => `<div class="kv"><span>${a}</span><b>${b}</b></div>`;
  const a = r.weights[0], b = r.weights[r.weights.length - 1];
  root.innerHTML = `<div class="topbar"><button class="iconbtn" data-act="back" aria-label="Назад">${icon("left", 22)}</button><div class="topbar__title">Отчёт</div><span class="topbar__spacer"></span></div>
<div class="seg no-print">${[7, 30, 90].map(n => `<button class="${days === n ? "is-on" : ""}" data-act="days" data-n="${n}">${n} дней</button>`).join("")}</div>
<article class="report mt16">
  <header class="report__head"><div class="report__brand">ФОРМА</div><div><h1 class="h2">${esc(p.name)}</h1><div class="c2 t13">${shortDate(r.from)} — ${shortDate(r.to)} · ${r.days} дней</div></div></header>
  <section class="card"><div class="card__title">Профиль и цели</div><div class="mt8">${kv("Параметры", `${p.sex === "f" ? "жен." : "муж."}, ${p.age} лет, ${p.height} см, ${kg(p.weight)} кг`)}${kv("Калории в день", `${num(t.kcal)} ккал`)}${kv("Белки / жиры / углеводы", `${t.p} / ${t.f} / ${t.c} г`)}</div></section>
  <section class="card mt12"><div class="card__title">Питание</div><div class="mt8">${s.foodDays ? `${kv("Дней с записями", s.foodDays)}${kv("В среднем калорий", `${num(s.kcal)} ккал`)}${kv("Белки / жиры / углеводы", `${num(s.p)} / ${num(s.f)} / ${num(s.c)} г`)}` : `<p class="c2">Записей нет.</p>`}</div></section>
  <section class="card mt12"><div class="card__title">Тело и привычки</div><div class="mt8">${a ? kv("Вес", `${kg(a.v)} → ${kg(b.v)} кг (${signed(b.v - a.v, 1)})`) : kv("Вес", "нет замеров")}${r.rate != null ? kv("Темп", `${signed(r.rate, 2)} кг в неделю`) : ""}${s.sleep != null ? kv("Сон", `${num(s.sleep, 1)} ч`) : ""}${s.water != null ? kv("Вода", `${litres(Math.round(s.water / 50) * 50)} л`) : ""}${s.steps != null ? kv("Шаги", num(Math.round(s.steps / 10) * 10)) : ""}</div></section>
  <section class="card mt12"><div class="card__title">Тренировки</div><div class="mt8">${kv("Сделано", `${s.done}${s.planned ? ` из ${s.planned} по плану` : ""}`)}${r.up.length ? kv("Растут", r.up.length) : ""}${r.down.length ? kv("Просели", r.down.length) : ""}</div>
  ${r.up.concat(r.down).length ? `<ul class="report__list">${r.up.map(x => `<li><b>${esc(x.name)}</b> — ${esc(x.was)} → ${esc(x.now)} ↑</li>`).join("")}${r.down.map(x => `<li><b>${esc(x.name)}</b> — ${esc(x.was)} → ${esc(x.now)} ↓</li>`).join("")}</ul>` : ""}</section>
  ${r.workouts.length ? `<section class="card mt12"><div class="card__title">Журнал тренировок</div><div class="report__log">${r.workouts.slice().reverse().map(w => `<div><b>${shortDate(w.d)} · ${esc(w.name)}</b>${w.ex.map(e => `<p>${esc(e.name)} <span class="num">${esc(e.sets)}</span></p>`).join("")}</div>`).join("")}</div></section>` : ""}
</article>
<div class="stack mt20 no-print">
  <button class="btn" data-act="print">${icon("printer", 20)} Сохранить как PDF</button>
  <div class="row"><button class="btn btn--ghost" data-act="copy">${icon("copy", 18)} Текстом</button><button class="btn btn--ghost" data-act="share">${icon("share", 18)} Поделиться</button></div>
  <p class="c3 t13 center">PDF: в окне печати выбери «Сохранить в PDF». Текст удобно отправить тренеру или вставить в ChatGPT и Claude.</p>
</div>`;
}

export default {
  depth: 2,
  mount(el) {
    root = el;
    actions(el, {
      back: () => back("profile"),
      days: t => { days = Number(t.dataset.n); draw(); },
      print: () => window.print(),
      async copy() {
        try { await navigator.clipboard.writeText(reportText(buildReport(days))); toast("Отчёт скопирован"); }
        catch (e) { console.warn("clipboard unavailable", e); toast("Не удалось скопировать — попробуй «Поделиться»", { ico: "info" }); }
      },
      async share() {
        const text = reportText(buildReport(days));
        if (!navigator.share) { toast("На этом устройстве нет меню «Поделиться» — скопируй текстом", { ico: "info" }); return; }
        try { await navigator.share({ title: "ФОРМА — отчёт", text }); } catch (e) { if (e.name !== "AbortError") console.warn("share failed", e); }
      },
    });
    draw();
  },
};
