import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { memoryBackend } from "../js/core/db.js";
import { S, init, save, getDay, flush } from "../js/core/store.js";
import { bmr, calcTargets, targets, portion, searchFoods, foodById, BUILTIN, addOwnFood, logFood, removeFood, editFood, dayFood, sumItems, recentFoods,
  RECIPES, recipeMacros, recipeFlags, toggleFav, isFav, mealNow } from "../js/domain/nutrition.js";

const man = { sex: "m", age: 27, height: 180, weight: 82.5, activity: "1.55", goal: "lose" };

test("Mifflin–St Jeor and the daily targets for a known case", () => {
  assert.equal(bmr(man), 10 * 82.5 + 6.25 * 180 - 5 * 27 + 5);
  const t = calcTargets(man);
  assert.equal(t.kcal, 2400);            /* 1820 × 1.55 × 0.85 = 2398 → rounded to 10 */
  assert.equal(t.p, 165);                /* 2 g per kg when losing */
  assert.equal(t.f, 74);
  assert.equal(t.c, Math.round((2400 - 165 * 4 - 74 * 9) / 4));
  assert.equal(t.water, 2500);
  assert.equal(calcTargets({ ...man, goal: "keep" }).kcal, 2820);
  assert.equal(calcTargets({ ...man, goal: "gain" }).p, Math.round(82.5 * 1.8));
});

test("calories never drop below resting energy or the safe floor, carbs never go negative", () => {
  const small = { sex: "f", age: 30, height: 155, weight: 46, activity: "1.2", goal: "lose" };
  const t = calcTargets(small);
  assert.ok(t.kcal >= Math.round(bmr(small) / 10) * 10 && t.kcal >= 1200);
  const heavy = calcTargets({ sex: "m", age: 45, height: 170, weight: 150, activity: "1.2", goal: "lose" });
  assert.ok(heavy.c >= 0 && heavy.f >= Math.round(150 * 0.6));
  assert.ok(Math.abs(heavy.p * 4 + heavy.f * 9 + heavy.c * 4 - heavy.kcal) <= 40);
});

test("targets(): defaults without a profile, hand-typed values override the calculated ones", async () => {
  await init(memoryBackend());
  assert.equal(targets().kcal, 2200);
  save("profile", { ...man, name: "V" });
  assert.equal(targets().kcal, 2400);
  save("profile", { ...man, name: "V", targets: { kcal: 2100, water: 3000 } });
  assert.equal(targets().kcal, 2100);
  assert.equal(targets().water, 3000);
  assert.equal(targets().p, 165);
});

test("portion scales per-100 g values", () => {
  const f = foodById("chicken_breast_raw");
  assert.deepEqual(portion(f, 150), { k: Math.round(f.k * 1.5), p: Math.round(f.p * 15) / 10, f: Math.round(f.f * 15) / 10, c: Math.round(f.c * 15) / 10 });
  assert.deepEqual(portion(f, 0), { k: 0, p: 0, f: 0, c: 0 });
});

test("food search: word prefixes, ё = е, own foods first", async () => {
  await init(memoryBackend());
  assert.ok(searchFoods("кури гру").length >= 3);
  assert.ok(searchFoods("кури гру").every(f => /кури/i.test(f.n) && /гру/i.test(f.n)));
  assert.equal(searchFoods("zzzz").length, 0);
  assert.ok(searchFoods("", { cat: 0 }).every(f => f.cat === 0));
  const own = addOwnFood({ n: "Курица гриль из ларька", k: 210, p: 22, f: 13, c: 1, pg: 200 });
  assert.equal(searchFoods("кури")[0].id, own.id);
  assert.equal(foodById(own.id).n, "Курица гриль из ларька");
  assert.ok(BUILTIN.length >= 260);
});

test("diary: log, sums by meal, recent foods, edit and remove", async () => {
  await init(memoryBackend());
  const f = foodById("chicken_breast_raw"), d = "2026-11-10";
  const a = logFood(d, "l", { fid: f.id, n: f.n, g: 200, ...portion(f, 200) });
  logFood(d, "b", { n: "Быстрая запись", g: 0, k: 300, p: 10, f: 10, c: 40 });
  await flush();
  const day = dayFood(d);
  assert.equal(day.items.length, 2);
  assert.equal(day.sum.k, Math.round(f.k * 2) + 300);
  assert.equal(day.byMeal.l.items.length, 1);
  assert.equal(day.byMeal.d.items.length, 0);
  assert.deepEqual(sumItems([]), { k: 0, p: 0, f: 0, c: 0 });
  assert.equal(recentFoods().length, 1);
  assert.equal(recentFoods()[0].g, 200);
  editFood(d, a.id, { m: "d" });
  assert.equal(dayFood(d).byMeal.d.items.length, 1);
  removeFood(d, a.id);
  assert.equal(getDay(d).food.length, 1);
});

test("recipes: numbers per serving come from the ingredients; flags follow the numbers", async () => {
  await init(memoryBackend());
  assert.equal(RECIPES.length, 48);
  for (const r of RECIPES) {
    const m = recipeMacros(r);
    const total = r.ing.reduce((s, [fid, g]) => s + foodById(fid).k * g / 100, 0);
    assert.equal(m.k, Math.round(total / r.serv), r.id);
    const flags = recipeFlags(r);
    assert.equal(flags.has("protein"), m.p >= 25, r.id);
    assert.equal(flags.has("fast"), r.time <= 15, r.id);
    assert.equal(flags.has("light"), m.k <= 350, r.id);
  }
  const id = RECIPES[0].id;
  assert.equal(toggleFav(id), true); assert.equal(isFav(id), true);
  assert.equal(toggleFav(id), false); assert.equal(S.favs.recipes.length, 0);
});

test("the meal offered by the clock", () => {
  assert.equal(mealNow(8), "b"); assert.equal(mealNow(13), "l"); assert.equal(mealNow(19), "d");
  assert.equal(mealNow(16), "s"); assert.equal(mealNow(2), "s");
});
