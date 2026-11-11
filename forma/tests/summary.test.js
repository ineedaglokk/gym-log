import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { memoryBackend } from "../js/core/db.js";
import { S, init, save, updateDay } from "../js/core/store.js";
import { dayRings, miniRings, periodSummary, foodDays, weightRate, weightSeries, insights, totals } from "../js/domain/summary.js";
import { buildReport, reportText } from "../js/domain/report.js";
import { TEMPLATES, buildTemplate, saveProgram } from "../js/domain/training.js";
import { today, addDays, weekStart, monthGrid, addMonths, wdOf, range, dayTitle } from "../js/core/dates.js";
import { num, kg, parseNum, plural, litres, hours, signed } from "../js/core/format.js";

const profile = { name: "Влад", sex: "m", age: 27, height: 180, weight: 82.5, activity: "1.55", goal: "lose" };
const food = (k, p) => [{ id: "f" + Math.random(), m: "l", n: "Еда", g: 100, k, p, f: 10, c: 50 }];

test("dates and number formats", () => {
  assert.equal(wdOf("2026-11-01"), 6);                       /* a Sunday */
  assert.equal(weekStart("2026-11-11"), "2026-11-09");
  const g = monthGrid("2026-11");
  assert.equal(g[0].filter(Boolean).length, 1);
  assert.equal(g.flat().filter(Boolean).length, 30);
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(range("2026-11-09", "2026-11-11").length, 3);
  assert.equal(dayTitle(today()), "Сегодня");
  assert.equal(num(1240.4), "1 240");
  assert.equal(kg(7.5), "7,5");
  assert.equal(parseNum("7,5"), 7.5);
  assert.equal(parseNum(""), null);
  assert.equal(parseNum("abc"), null);
  assert.equal(plural(21, "день", "дня", "дней"), "день");
  assert.equal(plural(12, "день", "дня", "дней"), "дней");
  assert.equal(litres(1250), "1,25");
  assert.equal(hours(7.5), "7 ч 30 мин");
  assert.equal(signed(-1.2, 1), "−1,2");
});

test("day rings: only switched-on trackers count, a rest day does not pull the score down", async () => {
  await init(memoryBackend());
  save("profile", profile);
  save("settings", { ...S.settings, trackers: { water: true, sleep: false, steps: false, weight: true } });
  const d = "2026-11-10";
  updateDay(d, x => { x.food = food(1200, 80); x.water = 2500; });
  const r = dayRings(d);
  assert.deepEqual(r.items.map(i => i.key), ["food", "gym", "water"]);
  assert.equal(r.items[1].pct, null);
  assert.equal(r.score, (0.5 + 1) / 2);
  assert.equal(miniRings(d).length, 3);
  assert.equal(dayRings("2026-11-09").any, false);
  /* 150% of the calorie target: the ring is full and red, but the food part of the score is zero */
  updateDay(d, x => { x.food = food(3600, 200); });
  const over = dayRings(d);
  assert.equal(over.items[0].pct, 1);
  assert.equal(over.items[0].over, true);
  assert.equal(over.items[0].color, "var(--bad)");
  assert.ok(Math.abs(over.score - 0.5) < 1e-9);
});

test("food averages skip today and days without a diary", async () => {
  await init(memoryBackend());
  save("profile", profile);
  const t = today();
  updateDay(t, x => { x.food = food(300, 10); });
  updateDay(addDays(t, -1), x => { x.food = food(2000, 150); });
  updateDay(addDays(t, -3), x => { x.food = food(2400, 170); });
  assert.deepEqual(foodDays(addDays(t, -6), t), [addDays(t, -3), addDays(t, -1)]);
  const s = periodSummary(addDays(t, -6), t);
  assert.equal(s.kcal, 2200);
  assert.equal(s.foodDays, 2);
});

test("weight trend in kg per week", async () => {
  await init(memoryBackend());
  for (let i = 0; i <= 4; i++) updateDay(addDays("2026-10-01", i * 7), x => { x.bw = 84 - i * 0.5; });
  const series = weightSeries();
  assert.equal(series.length, 5);
  assert.equal(weightRate(series), -0.5);
  assert.equal(weightRate(series.slice(0, 2)), null);
});

test("conclusions of a past week: low protein and too few calories are called out", async () => {
  await init(memoryBackend());
  save("profile", profile);
  saveProgram(buildTemplate(TEMPLATES[0]));
  const from = addDays(weekStart(today()), -7);
  for (let i = 0; i < 5; i++) updateDay(addDays(from, i), x => { x.food = food(1500, 70); x.sleep = 6; });
  const list = insights(from), titles = list.map(i => i.title);
  assert.ok(titles.includes("Мало белка"));
  assert.ok(titles.includes("Ешь заметно меньше нормы"));
  assert.ok(titles.some(t => t.startsWith("Сон")));
  assert.ok(list.length <= 6 && list.every(i => ["good", "warn", "info"].includes(i.tone) && i.text));
  assert.deepEqual(totals(), { workouts: 0, foodDays: 5, days: 5 });
});

test("conclusions do not crash on an empty journal; the report reads as text", async () => {
  await init(memoryBackend());
  save("profile", profile);
  assert.deepEqual(insights(today()), []);
  updateDay(addDays(today(), -2), x => { x.food = food(2300, 160); x.bw = 82; });
  const text = reportText(buildReport(30));
  assert.ok(text.includes("Влад") && text.includes("2 400 ккал") && text.includes("Питание"));
  assert.ok(!text.includes("undefined") && !text.includes("NaN"));
});
