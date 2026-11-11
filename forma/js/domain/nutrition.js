/* Nutrition logic: daily targets from the profile, the food database (built-in + own), diary sums, recipes.
   Built-in foods: js/data/foods.js, values per 100 g. A diary item stores the numbers of its portion,
   so later edits of a food never rewrite history. */

import { FOODS, FOOD_CATS } from "../data/foods.js";
import { RECIPES_A } from "../data/recipes-a.js";
import { RECIPES_B } from "../data/recipes-b.js";
import { S, getDay, save, updateDay } from "../core/store.js";
import { round, uid } from "../core/format.js";
import { nowHM } from "../core/dates.js";

export { FOOD_CATS };

export const MEALS = [
  { k: "b", n: "Завтрак", ico: "sun" },
  { k: "l", n: "Обед", ico: "food" },
  { k: "d", n: "Ужин", ico: "moon" },
  { k: "s", n: "Перекус", ico: "leaf" },
];
export const mealName = k => (MEALS.find(m => m.k === k) || MEALS[3]).n;
export const mealNow = (h = new Date().getHours()) => (h >= 5 && h < 11 ? "b" : h >= 11 && h < 16 ? "l" : h >= 17 && h < 22 ? "d" : "s");

export const ACTIVITY = [
  { k: "1.2", n: "Почти не двигаюсь", short: "минимальная", d: "Сидячая работа, мало ходьбы" },
  { k: "1.375", n: "Лёгкая активность", short: "лёгкая", d: "1–3 тренировки в неделю" },
  { k: "1.55", n: "Средняя активность", short: "средняя", d: "3–5 тренировок в неделю" },
  { k: "1.725", n: "Высокая активность", short: "высокая", d: "6–7 тренировок или физическая работа" },
];
export const GOALS = [
  { k: "lose", n: "Похудеть", d: "Минус жир, мышцы сохранить", ico: "flame" },
  { k: "keep", n: "Держать форму", d: "Вес на месте, сила растёт", ico: "target" },
  { k: "gain", n: "Набрать массу", d: "Больше мышц и силы", ico: "trend" },
];

/* Mifflin–St Jeor resting energy, kcal/day */
export const bmr = p => 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === "f" ? -161 : 5);
export const tdee = p => bmr(p) * Number(p.activity || 1.375);

/* Daily targets. Calories: maintenance −15% to lose (about 0.5% of body weight a week), +10% to gain;
   never below resting energy. Protein 2.0 / 1.6 / 1.8 g per kg (lose / keep / gain), fat 0.9 g per kg
   (at least 0.6), the rest is carbs. Water 30 ml per kg. */
export function calcTargets(p) {
  const base = tdee(p), k = p.goal === "lose" ? 0.85 : p.goal === "gain" ? 1.1 : 1;
  const kcal = Math.round(Math.max(base * k, bmr(p), p.sex === "f" ? 1200 : 1500) / 10) * 10;
  const prot = Math.round(p.weight * (p.goal === "lose" ? 2 : p.goal === "gain" ? 1.8 : 1.6));
  let fat = Math.round(p.weight * 0.9);
  let carbs = Math.round((kcal - prot * 4 - fat * 9) / 4);
  if (carbs < 80) { fat = Math.max(Math.round(p.weight * 0.6), Math.round((kcal - prot * 4 - 80 * 4) / 9)); carbs = Math.max(0, Math.round((kcal - prot * 4 - fat * 9) / 4)); }
  return { kcal, p: prot, f: fat, c: carbs, water: Math.round(p.weight * 30 / 100) * 100, steps: 8000, sleep: 8 };
}
const FALLBACK = { kcal: 2200, p: 120, f: 70, c: 270, water: 2500, steps: 8000, sleep: 8 };
/* the targets in force: typed by hand in the profile, else calculated, else a neutral default */
export function targets() {
  const p = S.profile;
  if (!p) return { ...FALLBACK };
  const auto = p.weight && p.height && p.age ? calcTargets(p) : FALLBACK;
  return { ...auto, ...(p.targets || {}) };
}

/* ---------- foods ---------- */
const fromRow = r => ({ id: r[0], n: r[1], cat: r[2], k: r[3], p: r[4], f: r[5], c: r[6], pg: r[7] || 100, pl: r[8] || "порция" });
export const BUILTIN = FOODS.map(fromRow);
const BUILTIN_MAP = new Map(BUILTIN.map(f => [f.id, f]));
export const foodById = id => BUILTIN_MAP.get(id) || S.foods.find(f => f.id === id) || null;
export const portion = (food, g) => ({ k: Math.round(food.k * g / 100), p: round(food.p * g / 100, 1), f: round(food.f * g / 100, 1), c: round(food.c * g / 100, 1) });

const norm = t => String(t || "").toLowerCase().replace(/ё/g, "е");
/* own foods first, then built-in; every typed word must start some word of the name */
export function searchFoods(q, { cat = -1, limit = 60 } = {}) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  const hit = f => {
    if (cat >= 0 && f.cat !== cat) return false;
    if (!words.length) return true;
    const name = " " + norm(f.n).replace(/[(),.]/g, " ");
    return words.every(w => name.includes(" " + w));
  };
  const rank = f => (words.length && norm(f.n).startsWith(words[0]) ? 0 : 1);
  const own = S.foods.filter(hit), base = BUILTIN.filter(hit).sort((a, b) => rank(a) - rank(b));
  return [...own, ...base].slice(0, limit);
}
export function addOwnFood({ n, k, p, f, c, pg }) {
  const food = { id: uid("u_"), n: String(n).trim().slice(0, 60), cat: -1, k: Math.round(k), p: round(p || 0, 1), f: round(f || 0, 1), c: round(c || 0, 1), pg: pg || 100, pl: "порция", own: true };
  save("foods", [food, ...S.foods]);
  return food;
}

/* ---------- diary ---------- */
export const sumItems = items => items.reduce((t, i) => ({ k: t.k + (i.k || 0), p: t.p + (i.p || 0), f: t.f + (i.f || 0), c: t.c + (i.c || 0) }), { k: 0, p: 0, f: 0, c: 0 });
export function dayFood(date) {
  const items = getDay(date).food || [];
  const byMeal = Object.fromEntries(MEALS.map(m => [m.k, { items: items.filter(i => i.m === m.k) }]));
  MEALS.forEach(m => { byMeal[m.k].sum = sumItems(byMeal[m.k].items); });
  return { items, sum: sumItems(items), byMeal };
}
/* item: { n, g, k, p, f, c, fid?, rid? }; remembers the food in "recent" */
export function logFood(date, meal, item) {
  const rec = { id: uid("f"), m: meal, t: nowHM(), ...item, k: Math.round(item.k), p: round(item.p || 0, 1), f: round(item.f || 0, 1), c: round(item.c || 0, 1) };
  updateDay(date, d => { d.food = [...(d.food || []), rec]; });
  if (item.fid) {
    const recent = [{ fid: item.fid, g: item.g }, ...S.recent.filter(r => r.fid !== item.fid)].slice(0, 24);
    save("recent", recent);
  }
  return rec;
}
export const removeFood = (date, id) => updateDay(date, d => { d.food = (d.food || []).filter(i => i.id !== id); });
export const editFood = (date, id, patch) => updateDay(date, d => { d.food = (d.food || []).map(i => (i.id === id ? { ...i, ...patch } : i)); });
export const recentFoods = () => S.recent.map(r => ({ food: foodById(r.fid), g: r.g })).filter(r => r.food);

/* ---------- recipes ---------- */
export const RECIPES = [...RECIPES_A, ...RECIPES_B];
export const RECIPE_CATS = [
  { k: "breakfast", n: "Завтраки", meal: "b" },
  { k: "lunch", n: "Обеды", meal: "l" },
  { k: "dinner", n: "Ужины", meal: "d" },
  { k: "snack", n: "Перекусы", meal: "s" },
];
export const COLLECTIONS = [
  { k: "protein", n: "Много белка", d: "от 25 г на порцию", ico: "dumbbell", hue: 342 },
  { k: "fast", n: "До 15 минут", d: "когда некогда", ico: "zap", hue: 38 },
  { k: "light", n: "Лёгкие", d: "до 350 ккал", ico: "leaf", hue: 150 },
  { k: "veg", n: "Без мяса", d: "овощи, крупы, молочное", ico: "heart", hue: 96 },
  { k: "fish", n: "С рыбой", d: "омега-3 и белок", ico: "drop", hue: 200 },
  { k: "prep", n: "Готовим заранее", d: "хранится 2–3 дня", ico: "layers", hue: 268 },
];
const macroCache = new Map();
/* per serving: { k, p, f, c, g } computed from the ingredients */
export function recipeMacros(r) {
  if (macroCache.has(r.id)) return macroCache.get(r.id);
  const t = { k: 0, p: 0, f: 0, c: 0, g: 0 };
  r.ing.forEach(([fid, g]) => { const f = BUILTIN_MAP.get(fid); if (!f) return; t.k += f.k * g / 100; t.p += f.p * g / 100; t.f += f.f * g / 100; t.c += f.c * g / 100; t.g += g; });
  const s = r.serv || 1, m = { k: Math.round(t.k / s), p: round(t.p / s, 1), f: round(t.f / s, 1), c: round(t.c / s, 1), g: Math.round(t.g / s) };
  macroCache.set(r.id, m);
  return m;
}
/* which collections a recipe belongs to */
export function recipeFlags(r) {
  const m = recipeMacros(r), out = new Set(r.tags || []);
  if (m.p >= 25) out.add("protein");
  if (m.k <= 350) out.add("light");
  if (r.time <= 15) out.add("fast");
  return out;
}
export const recipeById = id => RECIPES.find(r => r.id === id) || null;
export const isFav = id => S.favs.recipes.includes(id);
export function toggleFav(id) {
  const list = isFav(id) ? S.favs.recipes.filter(x => x !== id) : [id, ...S.favs.recipes];
  save("favs", { ...S.favs, recipes: list });
  return list.includes(id);
}
