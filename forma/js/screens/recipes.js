/* Recipe catalogue: collections, meal categories, calorie filter, favourites, search.
   Numbers on the cards are computed from the ingredients, per serving. */

import { go } from "../core/router.js";
import { $, esc, actions, on } from "../core/dom.js";
import { icon } from "../ui/icons.js";
import { foodTabs } from "./food.js";
import { RECIPES, RECIPE_CATS, COLLECTIONS, recipeMacros, recipeFlags, isFav, toggleFav } from "../domain/nutrition.js";
import { num, nWord } from "../core/format.js";

const KCAL = [{ k: "", n: "Любые ккал" }, { k: "lo", n: "до 300", f: m => m.k <= 300 }, { k: "mid", n: "300–500", f: m => m.k > 300 && m.k <= 500 }, { k: "hi", n: "от 500", f: m => m.k > 500 }];
let root, f = { q: "", cat: "", col: "", kcal: "" };

export function recipeCard(r) {
  const m = recipeMacros(r), fav = isFav(r.id);
  return `<article class="rc" data-act="open" data-id="${r.id}" tabindex="0" role="button">
  <div class="rc__cover" style="--hue:${r.hue}"><span class="rc__emoji">${r.emoji}</span>
    <button class="rc__fav${fav ? " is-on" : ""}" data-act="fav" data-id="${r.id}" aria-label="${fav ? "Убрать из избранного" : "В избранное"}">${icon("heart", 18, { filled: fav })}</button>
    <span class="rc__time">${icon("clock", 13)} ${r.time} мин</span></div>
  <div class="rc__body"><h3 class="rc__name">${esc(r.n)}</h3>
  <div class="rc__meta"><b class="num">${num(m.k)}</b> ккал<span class="rc__p">Б ${num(m.p)}</span></div></div>
</article>`;
}

function filtered() {
  const q = f.q.trim().toLowerCase().replace(/ё/g, "е"), kc = KCAL.find(x => x.k === f.kcal);
  return RECIPES.filter(r => {
    if (f.cat === "fav" ? !isFav(r.id) : f.cat && r.cat !== f.cat) return false;
    if (f.col && !recipeFlags(r).has(f.col)) return false;
    if (kc && kc.f && !kc.f(recipeMacros(r))) return false;
    return !q || r.n.toLowerCase().replace(/ё/g, "е").includes(q);
  });
}

function grid() {
  const list = filtered();
  if (!list.length) return `<div class="card empty"><div class="empty__ico">${icon(f.cat === "fav" ? "heart" : "search", 26)}</div><div class="h3">${f.cat === "fav" && !f.q && !f.col && !f.kcal ? "В избранном пока пусто" : "Под такие условия ничего нет"}</div><p>${f.cat === "fav" && !f.q ? "Нажми на сердечко у рецепта — он появится здесь." : "Убери один из фильтров."}</p>${f.col || f.kcal || f.q ? `<button class="btn btn--soft btn--sm mt16" data-act="reset">Сбросить фильтры</button>` : ""}</div>`;
  return `<div class="c3 t13" style="margin:0 2px 10px">${nWord(list.length, "рецепт", "рецепта", "рецептов")}</div><div class="rgrid">${list.map(recipeCard).join("")}</div>`;
}
const chipsHtml = () => `<div class="chips">${[{ k: "", n: "Все" }, ...RECIPE_CATS, { k: "fav", n: "Избранное", ico: "heart" }].map(c => `<button class="chip chip--accent${f.cat === c.k ? " is-on" : ""}" data-act="cat" data-v="${c.k}">${c.ico ? icon(c.ico, 15) : ""}${c.n}</button>`).join("")}</div>
<div class="chips mt8">${KCAL.map(c => `<button class="chip${f.kcal === c.k ? " is-on" : ""}" data-act="kcal" data-v="${c.k}">${c.n}</button>`).join("")}</div>`;
const colsHtml = () => `<div class="cols">${COLLECTIONS.map(c => `<button class="col-card${f.col === c.k ? " is-on" : ""}" data-act="col" data-v="${c.k}" style="--hue:${c.hue}"><span class="col-card__ico">${icon(c.ico, 20)}</span><b>${c.n}</b><small>${c.d}</small></button>`).join("")}</div>`;

function refresh() {
  $("[data-cols]", root).innerHTML = colsHtml();
  $("[data-chips]", root).innerHTML = chipsHtml();
  $("[data-grid]", root).innerHTML = grid();
}

export default {
  tab: "food", depth: 0,
  mount(el) {
    root = el;
    actions(el, {
      tab: t => { if (t.dataset.t !== "recipes") go("food"); },
      coach: () => go("coach/nutri"),
      open: t => go("recipe/" + t.dataset.id),
      fav(t, e) { e.stopPropagation(); toggleFav(t.dataset.id); refresh(); },
      cat: t => { f.cat = t.dataset.v; refresh(); },
      kcal: t => { f.kcal = t.dataset.v; refresh(); },
      col: t => { f.col = f.col === t.dataset.v ? "" : t.dataset.v; refresh(); },
      reset: () => { f = { q: "", cat: f.cat, col: "", kcal: "" }; $("[data-q]", root).value = ""; refresh(); },
    });
    let timer = 0;
    on(el, "input", "[data-q]", (e, t) => { f.q = t.value; clearTimeout(timer); timer = setTimeout(() => { $("[data-grid]", root).innerHTML = grid(); }, 160); });
    el.innerHTML = `<header class="hdr"><div class="grow"><div class="eyebrow">${RECIPES.length} блюд с расчётом</div><h1 class="h1">Еда</h1></div>
  <button class="iconbtn iconbtn--card" data-act="coach" aria-label="Спросить нутрициолога">${icon("spark", 21)}</button></header>
${foodTabs("recipes")}
<div class="search mt12"><input class="input" type="search" data-q placeholder="Сырники, плов, смузи…" autocomplete="off" enterkeyhint="search" value="${esc(f.q)}">${icon("search", 20)}</div>
<div class="mt16" data-cols></div><div class="mt16" data-chips></div><div class="mt16" data-grid></div>`;
    refresh();
  },
};
