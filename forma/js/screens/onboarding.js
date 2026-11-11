/* First run: a short welcome, who you are, your goal, the calculated targets, a starting program. */

import { S, save, importData } from "../core/store.js";
import { replace } from "../core/router.js";
import { account } from "../core/account.js";
import { esc, actions, countUp } from "../core/dom.js";
import { icon } from "../ui/icons.js";
import { toast } from "../ui/sheet.js";
import { ACTIVITY, GOALS, calcTargets } from "../domain/nutrition.js";
import { TEMPLATES, buildTemplate, saveProgram } from "../domain/training.js";
import { num, parseNum, litres, plural } from "../core/format.js";
import { today } from "../core/dates.js";

const STEPS = 5;
let root, step, f;

const dots = () => `<div class="ob__dots">${Array.from({ length: STEPS }, (_, i) => `<i class="${i < step ? "is-done" : i === step ? "is-on" : ""}"></i>`).join("")}</div>`;
const head = (title, text) => `<div class="ob__top">${step > 0 ? `<button class="iconbtn" data-act="back" aria-label="Назад">${icon("left", 22)}</button>` : `<span class="topbar__spacer"></span>`}${dots()}<span class="topbar__spacer"></span></div>
<h1 class="h1 ob__title">${title}</h1>${text ? `<p class="c2 mt8">${text}</p>` : ""}`;

const VIEWS = [
  () => `<div class="ob__hero">
  <div class="ob__logo"><svg viewBox="0 0 64 64" width="64" height="64"><path d="M18 46V18h28M18 32h20" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
  <div class="ob__brand">ФОРМА</div>
  <p class="ob__tag">Тренировки, питание и прогресс —<br>в одном месте и по-человечески.</p>
</div>
<div class="ob__feats stagger">
  <div class="ob__feat"><span style="--c:var(--m-gym)">${icon("dumbbell", 22)}</span><div><b>Зал без гаданий</b><small>Помнит прошлые веса и говорит, когда пора прибавить</small></div></div>
  <div class="ob__feat"><span style="--c:var(--m-food)">${icon("flame", 22)}</span><div><b>Еда за пару касаний</b><small>Калории и БЖУ под твою цель, рецепты с готовым расчётом</small></div></div>
  <div class="ob__feat"><span style="--c:var(--m-sleep)">${icon("spark", 22)}</span><div><b>Понятные итоги</b><small>Что получилось за неделю и что поправить — простыми словами</small></div></div>
</div>
<div class="ob__foot"><button class="btn" data-act="next">Начать</button>
<label class="link ob__import">У меня есть копия данных<input type="file" accept="application/json,.json" hidden data-import></label></div>`,

  () => `${head("Давай знакомиться", "Имя — чтобы здороваться. Пол нужен для расчёта калорий.")}
<div class="stack mt24">
  <label class="field"><span class="field__label">Как тебя зовут</span><input class="input" data-f="name" maxlength="24" autocomplete="given-name" enterkeyhint="next" placeholder="Имя" value="${esc(f.name)}"></label>
  <div class="field"><span class="field__label">Пол</span><div class="seg"><button data-act="sex" data-v="m" class="${f.sex === "m" ? "is-on" : ""}">Мужской</button><button data-act="sex" data-v="f" class="${f.sex === "f" ? "is-on" : ""}">Женский</button></div></div>
</div>
<div class="ob__foot"><button class="btn" data-act="next">Дальше</button></div>`,

  () => `${head("Твои параметры", "По ним считаются калории, белок и вода. Потом можно поменять.")}
<div class="ob__nums mt24">
  <label class="field"><span class="field__label">Возраст</span><input class="input input--num" data-f="age" inputmode="numeric" placeholder="28" value="${f.age ?? ""}"><small>лет</small></label>
  <label class="field"><span class="field__label">Рост</span><input class="input input--num" data-f="height" inputmode="numeric" placeholder="178" value="${f.height ?? ""}"><small>см</small></label>
  <label class="field"><span class="field__label">Вес</span><input class="input input--num" data-f="weight" inputmode="decimal" placeholder="75" value="${f.weight ?? ""}"><small>кг</small></label>
</div>
<div class="ob__foot"><button class="btn" data-act="next">Дальше</button></div>`,

  () => `${head("Какая цель", "От неё зависят калории и то, как приложение оценивает неделю.")}
<div class="choices mt20">${GOALS.map(g => `<button class="choice${f.goal === g.k ? " is-on" : ""}" data-act="goal" data-v="${g.k}"><span class="choice__ico">${icon(g.ico, 20)}</span><span class="grow"><b>${g.n}</b><small>${g.d}</small></span><span class="choice__mark">${icon("check", 18)}</span></button>`).join("")}</div>
<div class="eyebrow mt24">Активность</div>
<div class="choices mt8">${ACTIVITY.map(a => `<button class="choice choice--sm${f.activity === a.k ? " is-on" : ""}" data-act="activity" data-v="${a.k}"><span class="grow"><b>${a.n}</b><small>${a.d}</small></span><span class="choice__mark">${icon("check", 18)}</span></button>`).join("")}</div>
<div class="ob__foot"><button class="btn" data-act="next">Посчитать</button></div>`,

  () => {
    const t = calcTargets(f);
    return `${head("Твой план на день", "Посчитано по формуле Миффлина — Сан-Жеора под твою цель.")}
<div class="card ob__plan mt20">
  <div class="ob__kcal"><b class="num" data-count="${t.kcal}">0</b><span>ккал в день</span></div>
  <div class="ob__macros">
    <div style="--c:var(--mp)"><b class="num">${t.p}</b><small>белки, г</small></div>
    <div style="--c:var(--mf)"><b class="num">${t.f}</b><small>жиры, г</small></div>
    <div style="--c:var(--mc)"><b class="num">${t.c}</b><small>углеводы, г</small></div>
  </div>
  <div class="hr"></div>
  <div class="kv"><span>Вода</span><b>${litres(t.water)} л</b></div>
  <div class="kv"><span>Сон</span><b>${t.sleep} ч</b></div>
  <div class="kv"><span>Шаги</span><b>${num(t.steps)}</b></div>
</div>
<p class="c3 t13 mt12">Цифры — ориентир, а не диагноз. Через 2–3 недели приложение подскажет, если их стоит поправить.</p>
<div class="eyebrow mt24">С чего начать в зале</div>
<div class="choices mt8">${TEMPLATES.map(tp => `<button class="choice${f.tpl === tp.key ? " is-on" : ""}" data-act="tpl" data-v="${tp.key}"><span class="choice__ico">${icon("dumbbell", 20)}</span><span class="grow"><b>${tp.name} · ${tp.per} ${plural(tp.per, "день", "дня", "дней")}</b><small>${tp.level}. ${tp.note}</small></span><span class="choice__mark">${icon("check", 18)}</span></button>`).join("")}
<button class="choice${f.tpl === "" ? " is-on" : ""}" data-act="tpl" data-v=""><span class="choice__ico">${icon("edit", 20)}</span><span class="grow"><b>Соберу свою позже</b><small>Программу можно составить из 1045 упражнений</small></span><span class="choice__mark">${icon("check", 18)}</span></button></div>
<div class="ob__foot"><button class="btn" data-act="finish">Поехали</button></div>`;
  },
];

function draw(dir = "") {
  root.innerHTML = `<div class="ob ob--${step}${dir ? " ob--" + dir : ""}">${VIEWS[step]()}</div>`;
  countUp(root);
  window.scrollTo(0, 0);
}

function readFields() {
  root.querySelectorAll("[data-f]").forEach(i => {
    const k = i.dataset.f;
    f[k] = k === "name" ? i.value.trim() : parseNum(i.value, 400);
  });
}
function valid() {
  if (step === 1 && !f.name) return "Напиши имя";
  if (step === 2) {
    if (!(f.age >= 12 && f.age <= 90)) return "Возраст — от 12 до 90 лет";
    if (!(f.height >= 120 && f.height <= 230)) return "Рост — от 120 до 230 см";
    if (!(f.weight >= 30 && f.weight <= 250)) return "Вес — от 30 до 250 кг";
  }
  return null;
}

export default {
  depth: 0,
  mount(el) {
    root = el; step = 0;
    f = { name: (account() || {}).name || "", sex: "m", age: null, height: null, weight: null, goal: "keep", activity: "1.375", tpl: "full" };
    actions(el, {
      next() { readFields(); const err = valid(); if (err) { toast(err, { ico: "info" }); return; } step++; draw("fwd"); },
      back() { readFields(); step--; draw("back"); },
      sex: t => { readFields(); f.sex = t.dataset.v; draw(); },
      goal: t => { f.goal = t.dataset.v; draw(); },
      activity: t => { f.activity = t.dataset.v; draw(); },
      tpl: t => { f.tpl = t.dataset.v; draw(); },
      finish() {
        const tp = TEMPLATES.find(x => x.key === f.tpl);
        if (tp) saveProgram(buildTemplate(tp));
        save("profile", { name: f.name, sex: f.sex, age: f.age, height: f.height, weight: f.weight, goal: f.goal, activity: f.activity, created: today() });
        replace("today");
      },
    });
    el.addEventListener("change", async e => {
      if (!e.target.matches("[data-import]") || !e.target.files[0]) return;
      try {
        await importData(JSON.parse(await e.target.files[0].text()), "replace");
        if (S.profile) replace("today"); else toast("В копии нет профиля — заполни его заново", { ico: "info" });
      } catch (err) { toast(err.message || "Файл не подошёл", { ico: "info", ms: 4000 }); }
    });
    draw();
  },
};
