/* Add food to a meal: recent foods, the built-in base by category, own foods, recipes, search
   (local first, then the open Open Food Facts base on request), and a quick "calories only" entry. */

import { S } from "../core/store.js";
import { go, back } from "../core/router.js";
import { $, esc, actions, on } from "../core/dom.js";
import { icon } from "../ui/icons.js";
import { sheet, toast, choiceSheet } from "../ui/sheet.js";
import { MEALS, mealName, FOOD_CATS, BUILTIN, searchFoods, foodById, recentFoods, portion, logFood, addOwnFood, RECIPES, recipeMacros } from "../domain/nutrition.js";
import { num, parseNum, kg, round } from "../core/format.js";
import { dayTitle } from "../core/dates.js";

const OFF_URL = "https://world.openfoodfacts.org/cgi/search.pl";
let root, meal, tab, q, cat, added, online, seq;

const date = () => S.ui.date;
const frow = (f, g) => `<button class="frow" data-act="food" data-id="${esc(f.id)}"${g ? ` data-g="${g}"` : ""}><span class="grow"><span class="frow__n">${esc(f.n)}</span><span class="c3 t13">${g ? `${num(g)} г` : `${esc(f.pl)} ${num(f.pg)} г`} · ${num(f.k)} ккал на 100 г</span></span><b class="num frow__k">${num(f.k * (g || f.pg) / 100)}</b><span class="frow__plus">${icon("plus", 18)}</span></button>`;
const rrow = r => { const m = recipeMacros(r); return `<button class="frow" data-act="recipe" data-id="${r.id}"><span class="frow__emoji">${r.emoji}</span><span class="grow"><span class="frow__n">${esc(r.n)}</span><span class="c3 t13">порция ${num(m.g)} г · Б ${num(m.p)} · Ж ${num(m.f)} · У ${num(m.c)}</span></span><b class="num frow__k">${num(m.k)}</b><span class="frow__plus">${icon("plus", 18)}</span></button>`; };
const empty = (ico, title, text) => `<div class="card empty"><div class="empty__ico">${icon(ico, 26)}</div><div class="h3">${title}</div><p>${text}</p></div>`;

function onlineBlock() {
  if (online.state === "idle") return `<button class="btn btn--line mt12" data-act="online">${icon("globe", 18)} Искать «${esc(q)}» в открытой базе</button><p class="c3 t13 center mt8">Open Food Facts — продукты из магазинов. Нужен интернет.</p>`;
  if (online.state === "loading") return `<div class="skel mt12" style="height:58px"></div><div class="skel mt8" style="height:58px"></div>`;
  if (online.state === "error") return `<p class="c2 t13 center mt16">Открытая база не ответила. Проверь интернет или создай продукт вручную.</p>`;
  return online.items.length ? `<div class="eyebrow mt20" style="margin-left:2px">Из открытой базы</div><div class="list mt8">${online.items.map(f => `<button class="frow" data-act="off" data-id="${esc(f.id)}"><span class="grow"><span class="frow__n">${esc(f.n)}</span><span class="c3 t13">${num(f.k)} ккал · Б ${num(f.p)} · Ж ${num(f.f)} · У ${num(f.c)} на 100 г</span></span><span class="frow__plus">${icon("plus", 18)}</span></button>`).join("")}</div>` : `<p class="c2 t13 center mt16">В открытой базе тоже пусто. Создай продукт вручную — это полминуты.</p>`;
}

function listHtml() {
  if (q.trim()) {
    const foods = searchFoods(q, { limit: 40 }), nq = q.trim().toLowerCase().replace(/ё/g, "е");
    const recs = RECIPES.filter(r => r.n.toLowerCase().replace(/ё/g, "е").includes(nq)).slice(0, 6);
    return `${foods.length || recs.length ? `<div class="list">${foods.map(f => frow(f)).join("")}${recs.map(rrow).join("")}</div>` : empty("search", "В базе не нашлось", "Поищи в открытой базе или создай свой продукт.")}${onlineBlock()}`;
  }
  if (tab === "recent") {
    const r = recentFoods();
    return r.length ? `<div class="list">${r.map(x => frow(x.food, x.g)).join("")}</div>` : empty("clock", "Здесь будет то, что ты ешь часто", "Добавь продукт из базы — в следующий раз он будет под рукой.");
  }
  if (tab === "mine") return `${S.foods.length ? `<div class="list">${S.foods.map(f => frow(f)).join("")}</div>` : empty("edit", "Своих продуктов пока нет", "Добавь то, чего нет в базе: данные — с этикетки.")}<button class="btn btn--soft mt12" data-act="own">${icon("plus", 20)} Создать продукт</button>`;
  if (tab === "recipes") return `<div class="list">${RECIPES.map(rrow).join("")}</div>`;
  if (cat < 0) return `<div class="cats">${FOOD_CATS.map((n, i) => `<button class="cats__it" data-act="cat" data-v="${i}"><b>${n}</b><small>${BUILTIN.filter(f => f.cat === i).length}</small></button>`).join("")}</div>`;
  return `<button class="link" data-act="cat" data-v="-1">${icon("left", 16)} Все категории</button><div class="list">${searchFoods("", { cat, limit: 200 }).filter(f => !f.own).map(f => frow(f)).join("")}</div>`;
}
const redraw = () => { $("[data-list]", root).innerHTML = listHtml(); $("[data-tabs]", root).hidden = !!q.trim(); };
const footer = () => { $("[data-done]", root).innerHTML = added ? `Готово · добавлено ${added}` : "Готово"; };

function draw() {
  root.innerHTML = `<div class="topbar"><button class="iconbtn" data-act="back" aria-label="Назад">${icon("left", 22)}</button><button class="topbar__title" data-act="meal"><span>${mealName(meal)} ${icon("down", 14)}</span><div class="c3 t13 b5">${dayTitle(date()).toLowerCase()}</div></button><button class="iconbtn" data-act="quick" aria-label="Вписать только калории">${icon("zap", 20)}</button></div>
<div class="search"><input class="input" type="search" data-q placeholder="Курица, гречка, банан…" autocomplete="off" enterkeyhint="search" value="${esc(q)}">${icon("search", 20)}</div>
<div class="seg mt12" data-tabs>${[["recent", "Недавние"], ["base", "База"], ["mine", "Мои"], ["recipes", "Рецепты"]].map(([k, n]) => `<button class="${tab === k ? "is-on" : ""}" data-act="tab" data-t="${k}">${n}</button>`).join("")}</div>
<div class="mt12" data-list></div>
<div class="fab-bar"><button class="btn" data-act="back" data-done></button></div>`;
  redraw(); footer();
}

function afterAdd(name, kcal) {
  added++; footer();
  toast(`${mealName(meal)}: ${name} · ${num(kcal)} ккал`);
}

/* how much of a food: grams with quick portions and live numbers */
function portionSheet(food, g0, { saveOwn = false } = {}) {
  sheet({
    title: food.n,
    body: `<div class="pm" data-pm></div>
<div class="numsheet mt16"><input class="input input--num" data-g inputmode="decimal" enterkeyhint="done" value="${kg(g0 || food.pg)}"><span class="c3">г</span></div>
<div class="chips chips--wrap mt12">${[[food.pg, `${food.pl} · ${num(food.pg)} г`], [50, "50 г"], [100, "100 г"], [150, "150 г"], [200, "200 г"], [250, "250 г"]].filter(([v], i) => i === 0 || v !== food.pg).map(([v, l]) => `<button class="chip" data-act="g" data-v="${v}">${esc(l)}</button>`).join("")}</div>
<p class="c3 t13 mt12">На 100 г: ${num(food.k)} ккал · Б ${num(food.p, 1)} · Ж ${num(food.f, 1)} · У ${num(food.c, 1)}</p>
<button class="btn mt16" data-act="add">Добавить в ${mealName(meal).toLowerCase()}</button>`,
    onMount(api) {
      const inp = $("[data-g]", api.el);
      const calc = () => {
        const g = parseNum(inp.value, 5000) || 0, m = portion(food, g);
        $("[data-pm]", api.el).innerHTML = `<div class="pm__k"><b class="num">${num(m.k)}</b><span>ккал</span></div><div class="pm__m" style="--c:var(--mp)"><b class="num">${num(m.p, 1)}</b><span>белки</span></div><div class="pm__m" style="--c:var(--mf)"><b class="num">${num(m.f, 1)}</b><span>жиры</span></div><div class="pm__m" style="--c:var(--mc)"><b class="num">${num(m.c, 1)}</b><span>углеводы</span></div>`;
        return { g, m };
      };
      const add = () => {
        const { g, m } = calc();
        if (!g) { inp.focus(); return; }
        const fid = saveOwn ? addOwnFood(food).id : food.id;
        logFood(date(), meal, { fid, n: food.n, g, ...m });
        api.close(); afterAdd(food.n, m.k);
        if (saveOwn || tab === "recent") redraw();
      };
      actions(api.el, { g: t => { inp.value = kg(Number(t.dataset.v)); calc(); }, add });
      inp.addEventListener("input", calc);
      inp.addEventListener("keydown", e => { if (e.key === "Enter") add(); });
      calc();
    },
  });
}

function recipeSheet(r) {
  const m = recipeMacros(r);
  let n = 1;
  sheet({
    title: r.n,
    onMount(api) {
      const render = () => {
        api.body.innerHTML = `<div class="pm"><div class="pm__k"><b class="num">${num(m.k * n)}</b><span>ккал</span></div><div class="pm__m" style="--c:var(--mp)"><b class="num">${num(m.p * n, 1)}</b><span>белки</span></div><div class="pm__m" style="--c:var(--mf)"><b class="num">${num(m.f * n, 1)}</b><span>жиры</span></div><div class="pm__m" style="--c:var(--mc)"><b class="num">${num(m.c * n, 1)}</b><span>углеводы</span></div></div>
<div class="kv mt12"><span>Сколько порций съедено</span><div class="stepper"><button data-act="dec" aria-label="Меньше">${icon("minus", 18)}</button><span class="stepper__val num">${kg(n)}</span><button data-act="inc" aria-label="Больше">${icon("plus", 18)}</button></div></div>
<p class="c3 t13">Одна порция — около ${num(m.g)} г.</p>
<div class="row mt16"><button class="btn btn--ghost" data-act="open">Рецепт</button><button class="btn" data-act="add">Добавить</button></div>`;
      };
      actions(api.el, {
        inc: () => { n = Math.min(4, n + 0.5); render(); },
        dec: () => { n = Math.max(0.5, n - 0.5); render(); },
        open: () => { api.close(); go("recipe/" + r.id); },
        add: () => { logFood(date(), meal, { rid: r.id, n: r.n, g: Math.round(m.g * n), k: m.k * n, p: m.p * n, f: m.f * n, c: m.c * n }); api.close(); afterAdd(r.n, m.k * n); },
      });
      render();
    },
  });
}

/* a product of one's own (or "calories only" when quick = true) */
function formSheet(quick) {
  const field = (k, label, ph, mode = "decimal") => `<label class="field"><span class="field__label">${label}</span><input class="input" data-k="${k}" inputmode="${mode}" placeholder="${ph}" autocomplete="off"></label>`;
  sheet({
    title: quick ? "Быстрая запись" : "Свой продукт",
    body: `${quick ? `<p class="c2 t13">Когда считать некогда: впиши калории с упаковки или из меню. БЖУ — по желанию.</p>` : `<p class="c2 t13">Цифры на 100 г — с этикетки. Продукт останется во вкладке «Мои».</p>`}
<div class="stack mt12">${field("n", "Название", quick ? "Обед в кафе" : "Например, йогурт Epica", "text")}${field("k", quick ? "Калории, ккал" : "Калории на 100 г", "0")}
<div class="row">${field("p", "Белки, г", "0")}${field("f", "Жиры, г", "0")}${field("c", "Углеводы, г", "0")}</div>
${quick ? "" : field("pg", "Обычная порция, г", "100")}</div>
<button class="btn mt20" data-act="save">${quick ? `Записать в ${mealName(meal).toLowerCase()}` : "Сохранить и добавить"}</button>`,
    onMount(api) {
      const v = k => $(`[data-k="${k}"]`, api.el).value;
      if (!quick && q.trim()) $('[data-k="n"]', api.el).value = q.trim();
      actions(api.el, {
        save() {
          const name = v("n").trim() || (quick ? "Быстрая запись" : ""), k = parseNum(v("k"), 9000);
          if (!name) { toast("Напиши название", { ico: "info" }); return; }
          if (k == null || (!quick && k > 900)) { toast(quick ? "Впиши калории" : "Калории на 100 г — от 0 до 900", { ico: "info" }); return; }
          const m = { k, p: parseNum(v("p"), 500) || 0, f: parseNum(v("f"), 500) || 0, c: parseNum(v("c"), 500) || 0 };
          api.close();
          if (quick) { logFood(date(), meal, { n: name.slice(0, 60), g: 0, ...m }); afterAdd(name, k); return; }
          const food = addOwnFood({ n: name, ...m, pg: parseNum(v("pg"), 2000) || 100 });
          tab = "mine"; draw();
          setTimeout(() => portionSheet(food), 260);
        },
      });
    },
  });
}

async function searchOnline() {
  const mine = ++seq, term = q.trim();
  online = { state: "loading", items: [] }; redraw();
  try {
    const url = `${OFF_URL}?search_terms=${encodeURIComponent(term)}&search_simple=1&action=process&json=1&page_size=24&fields=code,product_name,product_name_ru,brands,nutriments`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const items = (data.products || []).map(p => {
      const n = p.nutriments || {}, k = Number(n["energy-kcal_100g"]), name = String(p.product_name_ru || p.product_name || "").trim();
      if (!name || !isFinite(k) || k < 0 || k > 900) return null;
      const brand = String(p.brands || "").split(",")[0].trim(), val = x => round(Math.min(100, Math.max(0, Number(x) || 0)), 1);
      return { id: "off_" + String(p.code || name).replace(/[^\w]/g, ""), n: (brand ? `${name} (${brand})` : name).slice(0, 60), cat: -1, k: Math.round(k), p: val(n.proteins_100g), f: val(n.fat_100g), c: val(n.carbohydrates_100g), pg: 100, pl: "порция" };
    }).filter(Boolean);
    if (mine === seq) { online = { state: "done", items }; redraw(); }
  } catch (err) {
    console.warn("Open Food Facts search failed", err);
    if (mine === seq) { online = { state: "error", items: [] }; redraw(); }
  }
}

export default {
  depth: 1,
  mount(el, params) {
    root = el; meal = MEALS.some(m => m.k === params.meal) ? params.meal : "s";
    q = ""; cat = -1; added = 0; seq = 0; online = { state: "idle", items: [] };
    tab = recentFoods().length ? "recent" : "base";
    actions(el, {
      back: () => back("food"),
      async meal() { const k = await choiceSheet({ title: "Куда записать", options: MEALS.map(m => ({ k: m.k, n: m.n, ico: m.ico })), value: meal }); if (k) { meal = k; draw(); } },
      quick: () => formSheet(true),
      own: () => formSheet(false),
      tab: t => { tab = t.dataset.t; cat = -1; draw(); },
      cat: t => { cat = Number(t.dataset.v); redraw(); },
      food(t) { const f = foodById(t.dataset.id); if (f) portionSheet(f, t.dataset.g ? Number(t.dataset.g) : null); },
      recipe: t => recipeSheet(RECIPES.find(r => r.id === t.dataset.id)),
      online: searchOnline,
      off(t) { const f = online.items.find(x => x.id === t.dataset.id); if (f) portionSheet(f, null, { saveOwn: true }); },
    });
    let timer = 0;
    on(el, "input", "[data-q]", (e, t) => {
      q = t.value; seq++; online = { state: "idle", items: [] };
      clearTimeout(timer); timer = setTimeout(redraw, 160);
    });
    draw();
  },
};
