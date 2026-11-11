/* One recipe: cover, numbers per serving, ingredients scaled to the chosen number of servings,
   steps, a dietitian's tip, and "add to the diary". */

import { S } from "../core/store.js";
import { back, go } from "../core/router.js";
import { $, esc, actions } from "../core/dom.js";
import { icon } from "../ui/icons.js";
import { toast, choiceSheet } from "../ui/sheet.js";
import { recipeById, recipeMacros, recipeFlags, foodById, isFav, toggleFav, logFood, MEALS, mealName, mealNow, RECIPE_CATS, COLLECTIONS } from "../domain/nutrition.js";
import { num, kg, plural } from "../core/format.js";
import { dayTitle } from "../core/dates.js";

let root, r, serv;

function draw() {
  const m = recipeMacros(r), fav = isFav(r.id), k = serv / r.serv, flags = recipeFlags(r);
  const tags = COLLECTIONS.filter(c => flags.has(c.k)).map(c => `<span class="badge">${c.n}</span>`).join("");
  const stat = (v, l, c) => `<div class="rstat"${c ? ` style="--c:${c}"` : ""}><b class="num">${v}</b><span>${l}</span></div>`;
  root.innerHTML = `<div class="topbar topbar--over"><button class="iconbtn iconbtn--card" data-act="back" aria-label="Назад">${icon("left", 22)}</button><span class="grow"></span><button class="iconbtn iconbtn--card rfav${fav ? " is-on" : ""}" data-act="fav" aria-label="${fav ? "Убрать из избранного" : "В избранное"}">${icon("heart", 21, { filled: fav })}</button></div>
<div class="rhero" style="--hue:${r.hue}"><span class="rhero__emoji">${r.emoji}</span></div>
<div class="rinfo">
  <div class="eyebrow">${(RECIPE_CATS.find(c => c.k === r.cat) || {}).n || ""} · ${r.time} мин</div>
  <h1 class="h1 mt4">${esc(r.n)}</h1>
  <p class="c2 mt8">${esc(r.desc)}</p>
  ${tags ? `<div class="row g6 mt12" style="flex-wrap:wrap">${tags}</div>` : ""}
</div>
<section class="rstats">${stat(num(m.k), "ккал", "var(--m-food)")}${stat(num(m.p), "белки, г", "var(--mp)")}${stat(num(m.f), "жиры, г", "var(--mf)")}${stat(num(m.c), "углев., г", "var(--mc)")}</section>
<p class="c3 t13 center mt8">На одну порцию, около ${num(m.g)} г</p>
<section class="section"><div class="section__head"><h2 class="h2">Продукты</h2><div class="stepper"><button data-act="dec" aria-label="Меньше порций">${icon("minus", 18)}</button><span class="stepper__val num">${serv}</span><button data-act="inc" aria-label="Больше порций">${icon("plus", 18)}</button></div></div>
<p class="c3 t13" style="margin:-4px 2px 10px">на ${serv} ${plural(serv, "порцию", "порции", "порций")}</p>
<div class="list">${r.ing.map(([fid, g, note]) => { const fd = foodById(fid); return `<div class="item"><span class="grow"><span class="b5">${esc(fd ? fd.n.replace(/\s*\((сыр[а-яё]+|сух[а-яё]+)\)/i, "") : fid)}</span>${note ? `<span class="c3 t13" style="display:block">${esc(note)}</span>` : ""}</span><b class="num">${kg(Math.round(g * k))} г</b></div>`; }).join("")}</div></section>
<section class="section"><div class="section__head"><h2 class="h2">Как готовить</h2></div>
<ol class="rsteps">${r.steps.map((s, i) => `<li><span class="num">${i + 1}</span><p>${esc(s)}</p></li>`).join("")}</ol></section>
${r.tip ? `<div class="card rtip mt16">${icon("spark", 20)}<div><b>Совет нутрициолога</b><p class="c2 mt4">${esc(r.tip)}</p></div></div>` : ""}
<div class="fab-bar"><button class="btn" data-act="log">${icon("plus", 20)} Добавить в дневник · ${num(m.k)} ккал</button></div>`;
}

export default {
  depth: 1,
  mount(el, params) {
    root = el; r = recipeById(params.id);
    if (!r) { el.innerHTML = `<div class="topbar"><button class="iconbtn" data-act="back">${icon("left", 22)}</button></div><div class="card empty"><div class="h3">Рецепт не найден</div></div>`; actions(el, { back: () => back("recipes") }); return; }
    serv = r.serv;
    actions(el, {
      back: () => back("recipes"),
      fav: () => { const on = toggleFav(r.id); draw(); toast(on ? "В избранном" : "Убрано из избранного", { ico: "heart" }); },
      inc: () => { serv = Math.min(8, serv + 1); draw(); },
      dec: () => { serv = Math.max(1, serv - 1); draw(); },
      async log() {
        const meal = await choiceSheet({ title: `Куда записать · ${dayTitle(S.ui.date).toLowerCase()}`, options: MEALS.map(x => ({ k: x.k, n: x.n, ico: x.ico })), value: (RECIPE_CATS.find(c => c.k === r.cat) || {}).meal || mealNow() });
        if (!meal) return;
        const m = recipeMacros(r);
        logFood(S.ui.date, meal, { rid: r.id, n: r.n, g: m.g, k: m.k, p: m.p, f: m.f, c: m.c });
        toast(`${mealName(meal)}: одна порция · ${num(m.k)} ккал`, { action: { label: "Дневник", fn: () => go("food") } });
      },
    });
    draw();
  },
};
