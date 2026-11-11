/* The "+" in the bottom nav: one sheet with the things logged most often. */

import { S } from "../core/store.js";
import { go } from "../core/router.js";
import { actions } from "../core/dom.js";
import { icon } from "../ui/icons.js";
import { sheet, toast } from "../ui/sheet.js";
import { addWater, askSleep, askSteps, askWeight } from "../ui/trackers.js";
import { mealNow, mealName } from "../domain/nutrition.js";
import { litres } from "../core/format.js";
import { dayTitle } from "../core/dates.js";

export function openQuickAdd() {
  const date = S.ui.date, tk = S.settings.trackers, meal = mealNow(), glass = S.settings.glass || 250;
  const btn = (act, ico, c, name, sub) => `<button class="qa__btn" data-act="${act}" style="--c:${c}"><span class="qa__ico">${icon(ico, 24)}</span><b>${name}</b><small>${sub}</small></button>`;
  sheet({
    title: `Записать · ${dayTitle(date).toLowerCase()}`,
    body: `<div class="qa">
${btn("food", "food", "var(--m-food)", "Еду", mealName(meal))}
${btn("workout", "dumbbell", "var(--m-gym)", "Тренировку", S.program ? "открыть журнал" : "собрать программу")}
${tk.water ? btn("water", "drop", "var(--m-water)", "Воду", `+ ${glass} мл`) : ""}
${tk.weight ? btn("weight", "scale", "var(--accent)", "Вес", "взвеситься") : ""}
${tk.sleep ? btn("sleep", "moon", "var(--m-sleep)", "Сон", "часы сна") : ""}
${tk.steps ? btn("steps", "steps", "var(--m-steps)", "Шаги", "число за день") : ""}
${btn("recipes", "chef", "var(--mp)", "Рецепт", "что приготовить")}
${btn("coach", "spark", "var(--m-sleep)", "Спросить", "тренер и нутрициолог")}
</div>`,
    onMount: s => actions(s.el, {
      food: () => { s.close(); go("food/add/" + meal); },
      workout: () => { s.close(); go(S.program ? "workout/" + date : "gym"); },
      water: () => {
        const total = addWater(date, glass);
        s.close();
        toast(`Вода: ${litres(total)} л`, { ico: "drop", action: { label: "Отменить", fn: () => addWater(date, -glass) } });
      },
      weight: () => { s.close(); setTimeout(() => askWeight(date), 250); },
      sleep: () => { s.close(); setTimeout(() => askSleep(date), 250); },
      steps: () => { s.close(); setTimeout(() => askSteps(date), 250); },
      recipes: () => { s.close(); go("recipes"); },
      coach: () => { s.close(); go("coach/trainer"); },
    }),
  });
}
