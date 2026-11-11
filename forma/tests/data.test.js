/* Sanity checks for the built-in nutrition data: foods.js, recipes-a.js, recipes-b.js. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FOOD_CATS, FOODS } from "../js/data/foods.js";
import { RECIPES_A } from "../js/data/recipes-a.js";
import { RECIPES_B } from "../js/data/recipes-b.js";

/* Foods whose label energy legitimately differs from 4·P + 9·F + 4·C:
   alcohol (7 kcal/g, not a macro here) and fibre-rich seeds (carbs are net, fibre still adds energy). */
const ENERGY_EXCEPTIONS = ["beer", "wine_dry", "vodka", "cognac", "flax_seeds", "chia_seeds"];

const RECIPES = [...RECIPES_A, ...RECIPES_B];
const RECIPE_CATS = ["breakfast", "snack", "lunch", "dinner"];
const TAGS = ["veg", "fish", "prep", "sweet"];
/* Per-serving kcal band for each meal type (the spread the recipe set is designed for). */
const KCAL_BANDS = { breakfast: [250, 450], snack: [120, 300], lunch: [400, 650], dinner: [350, 550] };
const EMOJI = /\p{Extended_Pictographic}/u;

const foodById = new Map(FOODS.map((f) => [f[0], f]));
const atwater = (p, f, c) => 4 * p + 9 * f + 4 * c;
const graphemes = (s) => [...new Intl.Segmenter("ru", { granularity: "grapheme" }).segment(s)].length;

/* Per-serving kcal and protein, computed the same way the app does: from raw ingredients, divided by serv. */
function perServing(r) {
  let kcal = 0, protein = 0;
  for (const [id, grams] of r.ing) {
    const food = foodById.get(id);
    kcal += (food[3] * grams) / 100;
    protein += (food[4] * grams) / 100;
  }
  return { kcal: kcal / r.serv, protein: protein / r.serv };
}

test("food categories: 15 unique non-empty names", () => {
  assert.equal(FOOD_CATS.length, 15);
  assert.equal(new Set(FOOD_CATS).size, FOOD_CATS.length);
  for (const c of FOOD_CATS) assert.ok(typeof c === "string" && c.length > 0);
});

test("foods: at least 260 rows, every category is used", () => {
  assert.ok(FOODS.length >= 260, `only ${FOODS.length} foods`);
  const used = new Set(FOODS.map((f) => f[2]));
  FOOD_CATS.forEach((name, i) => assert.ok(used.has(i), `no foods in category "${name}"`));
});

test("foods: ids are unique and well-formed, names are unique", () => {
  const ids = new Set(), names = new Set();
  for (const f of FOODS) {
    assert.equal(f.length, 9, `${f[0]}: row must have 9 fields`);
    const [id, name] = f;
    assert.match(id, /^[a-z0-9_]{2,32}$/, `bad id "${id}"`);
    assert.ok(!ids.has(id), `duplicate id "${id}"`);
    ids.add(id);
    assert.ok(typeof name === "string" && name.trim().length > 1, `${id}: empty name`);
    assert.ok(!names.has(name), `duplicate name "${name}"`);
    names.add(name);
    assert.ok(!EMOJI.test(name), `${id}: emoji in name`);
  }
});

test("foods: category, numbers and portion are in sane ranges", () => {
  for (const [id, , cat, kcal, p, f, c, portion, label] of FOODS) {
    assert.ok(Number.isInteger(cat) && cat >= 0 && cat < FOOD_CATS.length, `${id}: bad category ${cat}`);
    for (const v of [kcal, p, f, c, portion]) assert.ok(Number.isFinite(v), `${id}: non-finite number`);
    assert.ok(kcal >= 0 && kcal <= 900, `${id}: kcal ${kcal}`);
    for (const v of [p, f, c]) assert.ok(v >= 0 && v <= 100, `${id}: macro ${v}`);
    assert.ok(p + f + c <= 101, `${id}: macros sum to ${p + f + c}`);
    assert.ok(portion >= 1 && portion <= 600, `${id}: portion ${portion}`);
    assert.ok(typeof label === "string" && label.length > 0 && label.length <= 20, `${id}: bad portion label`);
    assert.ok(!EMOJI.test(label), `${id}: emoji in portion label`);
  }
});

test("foods: kcal matches 4P + 9F + 4C within 12% or 12 kcal", () => {
  for (const id of ENERGY_EXCEPTIONS) assert.ok(foodById.has(id), `unknown exception id "${id}"`);
  for (const [id, , , kcal, p, f, c] of FOODS) {
    if (ENERGY_EXCEPTIONS.includes(id)) continue;
    const est = atwater(p, f, c);
    const tolerance = Math.max(12, 0.12 * est);
    assert.ok(Math.abs(kcal - est) <= tolerance, `${id}: kcal ${kcal} vs ${est.toFixed(1)} from macros`);
  }
});

test("recipes: exactly 48, 12 per category, split between the two files", () => {
  assert.equal(RECIPES.length, 48);
  for (const cat of RECIPE_CATS) {
    assert.equal(RECIPES.filter((r) => r.cat === cat).length, 12, `category ${cat}`);
  }
  assert.ok(RECIPES_A.every((r) => r.cat === "breakfast" || r.cat === "snack"));
  assert.ok(RECIPES_B.every((r) => r.cat === "lunch" || r.cat === "dinner"));
});

test("recipes: ids are unique, fields are well-formed", () => {
  const ids = new Set(), names = new Set();
  for (const r of RECIPES) {
    assert.match(r.id, /^r_[a-z0-9_]{2,30}$/, `bad id "${r.id}"`);
    assert.ok(!ids.has(r.id), `duplicate id "${r.id}"`);
    ids.add(r.id);
    assert.ok(typeof r.n === "string" && r.n.trim().length > 2, `${r.id}: empty name`);
    assert.ok(!names.has(r.n), `duplicate name "${r.n}"`);
    names.add(r.n);
    assert.ok(RECIPE_CATS.includes(r.cat), `${r.id}: bad cat "${r.cat}"`);
    assert.ok(Number.isInteger(r.serv) && r.serv >= 1 && r.serv <= 4, `${r.id}: serv ${r.serv}`);
    assert.ok(Number.isInteger(r.time) && r.time >= 1 && r.time <= 180, `${r.id}: time ${r.time}`);
    assert.ok(Number.isFinite(r.hue) && r.hue >= 0 && r.hue <= 360, `${r.id}: hue ${r.hue}`);
    assert.ok(EMOJI.test(r.emoji) && graphemes(r.emoji) === 1, `${r.id}: emoji must be exactly one`);
    assert.ok(typeof r.desc === "string" && r.desc.length > 10 && r.desc.length <= 110, `${r.id}: desc length ${r.desc?.length}`);
    if (r.tip !== undefined) {
      assert.ok(typeof r.tip === "string" && r.tip.length > 10 && r.tip.length <= 120, `${r.id}: tip length ${r.tip.length}`);
    }
    assert.ok(Array.isArray(r.steps) && r.steps.length >= 3 && r.steps.length <= 6, `${r.id}: ${r.steps?.length} steps`);
    for (const s of r.steps) assert.ok(typeof s === "string" && s.trim().length > 5, `${r.id}: empty step`);
    assert.ok(Array.isArray(r.tags), `${r.id}: tags must be an array`);
    assert.equal(new Set(r.tags).size, r.tags.length, `${r.id}: duplicate tags`);
    for (const t of r.tags) assert.ok(TAGS.includes(t), `${r.id}: unknown tag "${t}"`);
  }
});

test("recipes: every ingredient exists, has grams > 0 and is a raw/dry product", () => {
  for (const r of RECIPES) {
    assert.ok(Array.isArray(r.ing) && r.ing.length >= 2, `${r.id}: needs at least 2 ingredients`);
    const seen = new Set();
    for (const row of r.ing) {
      const [id, grams, note] = row;
      assert.ok(row.length === 2 || row.length === 3, `${r.id}: bad ingredient row`);
      const food = foodById.get(id);
      assert.ok(food, `${r.id}: unknown food "${id}"`);
      assert.ok(!seen.has(id), `${r.id}: ingredient "${id}" listed twice`);
      seen.add(id);
      assert.ok(Number.isFinite(grams) && grams > 0, `${r.id}: grams for "${id}"`);
      if (note !== undefined) assert.ok(typeof note === "string" && note.length > 0, `${r.id}: empty note for "${id}"`);
      // Ready dishes, fast food and cooked variants would double-count cooking losses.
      assert.ok(food[2] !== 12 && food[2] !== 13, `${r.id}: "${id}" is a ready dish, not an ingredient`);
      assert.doesNotMatch(id, /_(boiled|cooked|fried|baked)(_|$)/, `${r.id}: "${id}" is a cooked variant`);
    }
  }
});

test("recipes: per-serving kcal is within 80–900 and fits the meal band", () => {
  for (const r of RECIPES) {
    const { kcal } = perServing(r);
    assert.ok(kcal >= 80 && kcal <= 900, `${r.id}: ${kcal.toFixed(0)} kcal per serving`);
    const [lo, hi] = KCAL_BANDS[r.cat];
    assert.ok(kcal >= lo && kcal <= hi, `${r.id}: ${kcal.toFixed(0)} kcal, expected ${lo}–${hi} for ${r.cat}`);
  }
});

test("recipes: veg has no meat or fish, fish contains fish or seafood", () => {
  for (const r of RECIPES) {
    const cats = r.ing.map(([id]) => foodById.get(id)[2]);
    if (r.tags.includes("veg")) {
      assert.ok(!cats.includes(0) && !cats.includes(1), `${r.id}: tagged veg but contains meat or fish`);
      assert.ok(!r.tags.includes("fish"), `${r.id}: veg and fish together`);
    }
    if (r.tags.includes("fish")) assert.ok(cats.includes(1), `${r.id}: tagged fish without fish`);
  }
});

test("recipes: useful spread for someone who trains", () => {
  const highProtein = RECIPES.filter((r) => perServing(r).protein >= 25).length;
  const count = (tag) => RECIPES.filter((r) => r.tags.includes(tag)).length;
  const quick = RECIPES.filter((r) => r.time <= 15).length;
  assert.ok(highProtein >= 24, `only ${highProtein} recipes with ≥ 25 g protein per serving`);
  assert.ok(count("veg") >= 12, `only ${count("veg")} veg recipes`);
  assert.ok(count("fish") >= 8, `only ${count("fish")} fish recipes`);
  assert.ok(quick >= 15, `only ${quick} recipes take ≤ 15 minutes`);
});

test("data files stay under 600 lines", () => {
  for (const name of ["foods.js", "recipes-a.js", "recipes-b.js"]) {
    const lines = readFileSync(new URL(`../js/data/${name}`, import.meta.url), "utf8").split("\n").length;
    assert.ok(lines <= 600, `${name}: ${lines} lines`);
  }
});
