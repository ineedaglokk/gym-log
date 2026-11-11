/* Food diary of the selected day: calories and macros against the targets, four meals, quick edits. */

import { S, getDay, setDate, updateDay } from "../core/store.js";
import { go } from "../core/router.js";
import { $, esc, actions, countUp, typingIn } from "../core/dom.js";
import { icon } from "../ui/icons.js";
import { ring, playRings } from "../ui/ring.js";
import { sheet, toast, confirmSheet } from "../ui/sheet.js";
import { targets, dayFood, MEALS, removeFood, editFood } from "../domain/nutrition.js";
import { addDays, dayTitle, longDate, today } from "../core/dates.js";
import { num, parseNum, kg, uid, round } from "../core/format.js";

let root;

export const foodTabs = on => `<div class="seg mt12"><button class="${on === "food" ? "is-on" : ""}" data-act="tab" data-t="food">Дневник</button><button class="${on === "recipes" ? "is-on" : ""}" data-act="tab" data-t="recipes">Рецепты</button></div>`;

function summary(date) {
  const t = targets(), f = dayFood(date), left = t.kcal - f.sum.k, over = left < 0;
  const col = (n, v, goal, c) => `<div class="fsum__m" style="--c:${c}"><span class="c2 t13">${n}</span><b class="num">${num(v)}<small> / ${goal} г</small></b><div class="bar bar--thin"><i class="bar__fill" style="--w:${Math.min(100, Math.round(v / goal * 100))}%"></i></div></div>`;
  return `<section class="card fsum">
  <div class="fsum__top">
    <div class="fsum__side"><b class="num">${num(f.sum.k)}</b><span>съедено</span></div>
    ${ring({ key: "fsum", size: 138, sw: 12, pct: f.sum.k / t.kcal, color: over ? "var(--bad)" : "var(--m-food)", inner: `<div><b class="num fsum__left" data-count="${Math.abs(left)}" data-from="${summary.last ?? Math.abs(left)}">0</b><div class="t13 ${over ? "cb" : "c2"}">${over ? "перебор, ккал" : "осталось, ккал"}</div></div>` })}
    <div class="fsum__side"><b class="num">${num(t.kcal)}</b><span>цель</span></div>
  </div>
  <div class="fsum__macros">${col("Белки", f.sum.p, t.p, "var(--mp)")}${col("Жиры", f.sum.f, t.f, "var(--mf)")}${col("Углеводы", f.sum.c, t.c, "var(--mc)")}</div>
</section>`;
}

function meal(m, data) {
  const items = data.items;
  return `<section class="card meal">
  <div class="meal__head"><span class="meal__ico">${icon(m.ico, 20)}</span><div class="grow"><div class="b6 t17">${m.n}</div><div class="c3 t13">${items.length ? `${num(data.sum.k)} ккал · Б ${num(data.sum.p)} · Ж ${num(data.sum.f)} · У ${num(data.sum.c)}` : "пока ничего"}</div></div>
  <button class="iconbtn iconbtn--soft" data-act="add" data-m="${m.k}" aria-label="Добавить в ${m.n.toLowerCase()}">${icon("plus", 22)}</button></div>
  ${items.length ? `<div class="meal__items">${items.map(i => `<button class="meal__it" data-act="edit" data-id="${esc(i.id)}"><span class="grow"><span class="meal__n">${esc(i.n)}</span><span class="c3 t13">${i.g ? `${num(i.g)} г · ` : ""}Б ${num(i.p)} · Ж ${num(i.f)} · У ${num(i.c)}</span></span><b class="num">${num(i.k)}</b></button>`).join("")}</div>` : ""}
</section>`;
}

function draw() {
  const date = S.ui.date, f = dayFood(date), y = addDays(date, -1), yItems = getDay(y).food || [];
  root.innerHTML = `<header class="hdr"><div class="grow"><div class="eyebrow">${longDate(date)}</div><h1 class="h1">Еда</h1></div>
  <button class="iconbtn iconbtn--card" data-act="coach" aria-label="Спросить нутрициолога">${icon("spark", 21)}</button></header>
${foodTabs("food")}
<div class="daynav mt12"><button class="iconbtn" data-act="prev" aria-label="Предыдущий день">${icon("left", 20)}</button><button class="daynav__t" data-act="today">${dayTitle(date)}</button><button class="iconbtn" data-act="next" aria-label="Следующий день">${icon("right", 20)}</button></div>
<div class="stack stagger mt12">${summary(date)}${MEALS.map(m => meal(m, f.byMeal[m.k])).join("")}</div>
${!f.items.length && yItems.length ? `<button class="btn btn--line mt16" data-act="copy">${icon("copy", 18)} Повторить вчерашний день</button>` : ""}`;
  summary.last = Math.abs(targets().kcal - f.sum.k);
  playRings(root); countUp(root);
}

/* change the amount, move to another meal or delete one diary line */
function editSheet(id) {
  const date = S.ui.date, item = (getDay(date).food || []).find(i => i.id === id);
  if (!item) return;
  let meal = item.m;
  sheet({
    title: item.n,
    onMount(api) {
      const render = () => {
        api.body.innerHTML = `${item.g ? `<div class="numsheet"><input class="input input--num" data-g inputmode="decimal" value="${kg(item.g)}"><span class="c3">г</span></div>` : `<p class="c2">Запись без веса: ${num(item.k)} ккал.</p>`}
<div class="field__label mt16">Приём пищи</div><div class="chips chips--wrap">${MEALS.map(m => `<button class="chip${meal === m.k ? " is-on" : ""}" data-act="meal" data-m="${m.k}">${m.n}</button>`).join("")}</div>
<div class="row mt20"><button class="btn btn--danger btn--auto" data-act="del" aria-label="Удалить">${icon("trash", 20)}</button><button class="btn" data-act="save">Сохранить</button></div>`;
      };
      actions(api.el, {
        meal: t => { const g = $("[data-g]", api.el); const keep = g ? g.value : null; meal = t.dataset.m; render(); if (keep != null) $("[data-g]", api.el).value = keep; },
        del: () => { removeFood(date, id); api.close(); toast("Удалено", { action: { label: "Вернуть", fn: () => updateDay(date, d => { d.food = [...(d.food || []), item]; }) } }); },
        save() {
          const patch = { m: meal }, gi = $("[data-g]", api.el);
          if (gi && item.g) {
            const g = parseNum(gi.value, 5000);
            if (!g) { gi.focus(); return; }
            const k = g / item.g;
            Object.assign(patch, { g, k: Math.round(item.k * k), p: round(item.p * k, 1), f: round(item.f * k, 1), c: round(item.c * k, 1) });
          }
          editFood(date, id, patch); api.close();
        },
      });
      render();
    },
  });
}

export default {
  tab: "food", depth: 0,
  mount(el) {
    root = el; summary.last = undefined;
    actions(el, {
      tab: t => { if (t.dataset.t !== "food") go("recipes"); },
      coach: () => go("coach/nutri"),
      prev: () => setDate(addDays(S.ui.date, -1)),
      next: () => setDate(addDays(S.ui.date, 1)),
      today: () => setDate(today()),
      add: t => go("food/add/" + t.dataset.m),
      edit: t => editSheet(t.dataset.id),
      async copy() {
        const y = addDays(S.ui.date, -1), items = getDay(y).food || [];
        if (!(await confirmSheet({ title: "Повторить вчерашний день?", text: `Скопируются все ${items.length} записей — потом их можно поправить.`, ok: "Повторить" }))) return;
        updateDay(S.ui.date, d => { d.food = items.map(i => ({ ...i, id: uid("f") })); });
        toast("Скопировано из вчера");
      },
    });
    draw();
  },
  update(topic) { if (["day", "date", "profile", "import"].includes(topic) && !typingIn(root)) draw(); },
};
