/* Quick entries shared by the Today screen and the "+" menu: water, sleep, steps, body weight. */

import { S, getDay, updateDay, save } from "../core/store.js";
import { numberSheet, toast } from "./sheet.js";
import { litres, num, kg } from "../core/format.js";
import { dayTitle } from "../core/dates.js";

const when = date => dayTitle(date).toLowerCase();

export function addWater(date, ml) {
  const d = updateDay(date, x => { x.water = Math.max(0, (x.water || 0) + ml); });
  return d.water || 0;
}
export async function askWater(date) {
  const v = await numberSheet({
    title: "Сколько воды выпито", unit: "мл", value: getDay(date).water || null, max: 10000, clearable: true,
    hint: "Всего за день. Чай и кофе без сахара тоже считаются.",
    quick: [500, 1000, 1500, 2000, 2500, 3000].map(x => ({ v: x, l: litres(x) + " л" })),
  });
  if (v == null) return;
  updateDay(date, x => { x.water = v === "clear" ? 0 : Math.round(v); });
}
export async function askSleep(date) {
  const v = await numberSheet({
    title: "Сколько спал", unit: "ч", value: getDay(date).sleep ?? null, max: 24, clearable: true,
    hint: "Сон в ночь на этот день. Можно дробью: 7,5.",
    quick: [6, 6.5, 7, 7.5, 8, 8.5, 9].map(x => ({ v: x, l: kg(x) + " ч" })),
  });
  if (v == null) return;
  updateDay(date, x => { if (v === "clear") delete x.sleep; else x.sleep = v; });
}
export async function askSteps(date) {
  const v = await numberSheet({
    title: "Шаги за день", unit: "шагов", value: getDay(date).steps ?? null, max: 100000, clearable: true,
    hint: "Посмотри в «Здоровье» или на часах и впиши число.",
    quick: [4000, 6000, 8000, 10000, 12000].map(x => ({ v: x, l: num(x) })),
  });
  if (v == null) return;
  updateDay(date, x => { if (v === "clear") delete x.steps; else x.steps = Math.round(v); });
}
export async function askWeight(date) {
  const cur = getDay(date).bw ?? null;
  const v = await numberSheet({
    title: "Вес тела", unit: "кг", value: cur ?? (S.profile ? S.profile.weight : null), max: 300, clearable: cur != null,
    hint: "Лучше взвешиваться утром натощак, в одно и то же время.",
  });
  if (v == null) return;
  if (v !== "clear" && (v < 25 || v > 300)) { toast("Вес — от 25 до 300 кг", { ico: "info" }); return; }
  updateDay(date, x => { if (v === "clear") delete x.bw; else x.bw = v; });
  /* the latest weigh-in drives the calorie and protein targets */
  if (v !== "clear" && S.profile) {
    let latest = "";
    for (const [d, r] of S.days) if (r.bw != null && d > latest) latest = d;
    if (latest === date && S.profile.weight !== v) save("profile", { ...S.profile, weight: v });
  }
  if (v !== "clear") toast(`Вес ${kg(v)} кг записан на ${when(date)}`);
}
