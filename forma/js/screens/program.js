/* Program editor: workouts, their weekdays, exercises and each exercise's settings.
   Every change is saved at once (saveProgram) — there is no "save" button to forget. */

import { S } from "../core/store.js";
import { go, back } from "../core/router.js";
import { $, esc, actions, on, typingIn } from "../core/dom.js";
import { icon } from "../ui/icons.js";
import { exThumb } from "../ui/thumb.js";
import { sheet, toast, confirmSheet } from "../ui/sheet.js";
import { TEMPLATES, buildTemplate, saveProgram, emptyProgram, targetText, MAX_EX, MAX_W } from "../domain/training.js";
import { UNITS } from "../domain/catalog.js";
import { WD_S } from "../core/dates.js";
import { uid, kg, parseNum, plural, clamp } from "../core/format.js";

let root, wi = 0;
const mutate = fn => { const p = structuredClone(S.program); fn(p); saveProgram(p); };
const cur = () => S.program.workouts[Math.min(wi, S.program.workouts.length - 1)];
const isTime = e => e.unit === "секунды" || e.unit === "минуты";

function draw() {
  if (!S.program) { saveProgram(emptyProgram()); return; }
  wi = Math.min(wi, S.program.workouts.length - 1);
  const p = S.program, w = cur();
  const owner = d => p.workouts.find(x => x !== w && x.days.includes(d));
  root.innerHTML = `<div class="topbar"><button class="iconbtn" data-act="back" aria-label="Назад">${icon("left", 22)}</button><div class="topbar__title">Программа</div><button class="iconbtn" data-act="templates" aria-label="Готовые программы">${icon("layers", 21)}</button></div>
<div class="chips">${p.workouts.map((x, i) => `<button class="chip chip--accent${i === wi ? " is-on" : ""}" data-act="tab" data-i="${i}">${esc(x.name)}</button>`).join("")}${p.workouts.length < MAX_W ? `<button class="chip" data-act="add-w" aria-label="Добавить тренировку">${icon("plus", 16)} тренировка</button>` : ""}</div>
<div class="card mt16">
  <label class="field"><span class="field__label">Название тренировки</span><input class="input" data-name maxlength="30" enterkeyhint="done" value="${esc(w.name)}"></label>
  <div class="field__label mt16">Дни недели</div>
  <div class="pdays">${WD_S.map((n, d) => { const o = owner(d); return `<button class="pday${w.days.includes(d) ? " is-on" : ""}${o ? " is-other" : ""}" data-act="day" data-d="${d}"><b>${n}</b><small>${o ? esc(o.name.slice(0, 5)) : "&nbsp;"}</small></button>`; }).join("")}</div>
  <p class="c3 t13 mt8">В один день — одна тренировка. Занятый день можно забрать сюда касанием.</p>
</div>
<section class="section"><div class="section__head"><h2 class="h2">Упражнения</h2><span class="c3 t13">${w.ex.length} из ${MAX_EX}</span></div>
${w.ex.length ? `<div class="list">${w.ex.map((e, i) => `<button class="item pex" data-act="ex" data-i="${i}"><span class="pill-num">${i + 1}</span>${exThumb(e, "thumb--sm")}<span class="grow"><span class="b6 pex__name">${esc(e.name)}</span><span class="c3 t13">${targetText(e)} · ${e.unit}</span></span><span class="item__chev">${icon("more", 20)}</span></button>`).join("")}</div>` : `<div class="card empty"><div class="empty__ico">${icon("dumbbell", 26)}</div><div class="h3">Пока пусто</div><p>Добавь 5–9 упражнений: сначала тяжёлые базовые, потом изолирующие.</p></div>`}
${w.ex.length < MAX_EX ? `<button class="btn btn--soft mt12" data-act="add-ex">${icon("plus", 20)} Добавить упражнение</button>` : ""}
</section>
${p.workouts.length > 1 ? `<button class="btn btn--line mt24" data-act="del-w">${icon("trash", 18)} Удалить тренировку «${esc(w.name)}»</button>` : ""}`;
}

/* settings of one exercise, in a sheet that redraws itself after each change */
function exSheet(i) {
  const get = () => cur().ex[i];
  if (!get()) return;
  const change = fn => mutate(p => fn(p.workouts[wi].ex[i], p.workouts[wi]));
  const stepper = (k, v, label) => `<div class="kv"><span>${label}</span><div class="stepper"><button data-act="dec" data-k="${k}" aria-label="Меньше">${icon("minus", 18)}</button><span class="stepper__val num">${v}</span><button data-act="inc" data-k="${k}" aria-label="Больше">${icon("plus", 18)}</button></div></div>`;
  sheet({
    title: get().name,
    onMount(api) {
      const render = () => {
        const e = get(), time = isTime(e), n = cur().ex.length;
        api.body.innerHTML = `${stepper("sets", e.sets, "Подходы")}${stepper("lo", e.lo, time ? `От, ${e.unit === "минуты" ? "мин" : "с"}` : "Повторы от")}${stepper("hi", e.hi, time ? `До, ${e.unit === "минуты" ? "мин" : "с"}` : "Повторы до")}
${time ? "" : `<div class="field__label mt16">Шаг прибавки веса, кг</div><div class="chips chips--wrap">${[1, 2, 2.5, 5, 10].map(v => `<button class="chip${e.step === v ? " is-on" : ""}" data-act="step" data-v="${v}">${kg(v)}</button>`).join("")}</div>
<label class="field mt16"><span class="field__label">Стартовый вес, кг — подставится в первый раз</span><input class="input" data-start inputmode="decimal" placeholder="0" value="${e.start ? kg(e.start) : ""}"></label>`}
<div class="field__label mt16">Как считаем</div><div class="chips chips--wrap">${UNITS.map(u => `<button class="chip${e.unit === u ? " is-on" : ""}" data-act="unit" data-v="${u}">${u}</button>`).join("")}</div>
<div class="row mt20"><button class="btn btn--ghost" data-act="up"${i === 0 ? " disabled" : ""}>${icon("up", 18)} Выше</button><button class="btn btn--ghost" data-act="down"${i >= n - 1 ? " disabled" : ""}>${icon("down", 18)} Ниже</button></div>
<div class="row mt12"><button class="btn btn--soft" data-act="card">${icon("chart", 18)} История</button><button class="btn btn--danger" data-act="remove">${icon("trash", 18)} Убрать</button></div>`;
      };
      const LIM = { sets: [1, 6], lo: [1, 600], hi: [1, 600] };
      const bump = (k, dir) => change(e => {
        const st = isTime(e) && k !== "sets" ? (e.unit === "секунды" ? 5 : 1) : 1;
        e[k] = clamp(e[k] + dir * st, LIM[k][0], LIM[k][1]);
        if (k === "lo" && e.hi < e.lo) e.hi = e.lo;
        if (k === "hi" && e.lo > e.hi) e.lo = e.hi;
      });
      actions(api.el, {
        inc: t => { bump(t.dataset.k, 1); render(); },
        dec: t => { bump(t.dataset.k, -1); render(); },
        step: t => { change(e => { e.step = Number(t.dataset.v); }); render(); },
        unit: t => { change(e => { e.unit = t.dataset.v; if (isTime(e)) { e.step = 0; } else if (!e.step) e.step = 2.5; }); render(); },
        up: () => { mutate(p => { const a = p.workouts[wi].ex; [a[i - 1], a[i]] = [a[i], a[i - 1]]; }); i--; render(); },
        down: () => { mutate(p => { const a = p.workouts[wi].ex; [a[i + 1], a[i]] = [a[i], a[i + 1]]; }); i++; render(); },
        card: () => { const id = get().id; api.close(); go("exercise/" + id); },
        remove: () => { const name = get().name; mutate(p => { p.workouts[wi].ex.splice(i, 1); }); api.close(); toast(`«${name}» убрано. История сохранена`); },
      });
      on(api.el, "change", "[data-start]", (e, t) => { const v = parseNum(t.value, 1000); change(x => { x.start = v || 0; }); });
      render();
    },
  });
}

function templatesSheet() {
  sheet({
    title: "Готовые программы",
    body: `<p class="c2 t13">Программа заменится целиком. Записанные тренировки и история упражнений останутся.</p>
<div class="choices mt12">${TEMPLATES.map(t => `<button class="choice" data-act="use" data-k="${t.key}"><span class="choice__ico">${icon("dumbbell", 20)}</span><span class="grow"><b>${t.name} · ${t.per} ${plural(t.per, "день", "дня", "дней")}</b><small>${t.level}. ${t.note}</small></span>${icon("right", 18)}</button>`).join("")}</div>`,
    onMount: api => actions(api.el, {
      async use(t) {
        const tp = TEMPLATES.find(x => x.key === t.dataset.k);
        api.close();
        if (!(await confirmSheet({ title: `Заменить программу на «${tp.name}»?`, text: "Текущий набор тренировок будет заменён.", ok: "Заменить" }))) return;
        wi = 0; saveProgram(buildTemplate(tp)); toast("Программа заменена");
      },
    }),
  });
}

export default {
  depth: 1,
  mount(el) {
    root = el;
    actions(el, {
      back: () => back("gym"),
      templates: templatesSheet,
      tab: t => { wi = Number(t.dataset.i); draw(); },
      "add-w"() { mutate(p => { p.workouts.push({ id: uid("w"), name: `Тренировка ${"АБВГДЕЖ"[p.workouts.length] || p.workouts.length + 1}`, days: [], ex: [] }); }); wi = S.program.workouts.length - 1; draw(); },
      day(t) {
        const d = Number(t.dataset.d);
        mutate(p => {
          const w = p.workouts[wi], has = w.days.includes(d);
          p.workouts.forEach(x => { x.days = x.days.filter(v => v !== d); });
          if (!has) w.days = [...w.days, d].sort();
        });
      },
      ex: t => exSheet(Number(t.dataset.i)),
      "add-ex": () => go("library", { pick: cur().id }),
      async "del-w"() {
        const w = cur();
        if (!(await confirmSheet({ title: `Удалить «${w.name}»?`, text: "Тренировка уйдёт из программы. Записанные подходы останутся в истории.", ok: "Удалить", danger: true }))) return;
        mutate(p => { p.workouts.splice(wi, 1); }); wi = 0; draw();
      },
    });
    on(el, "change", "[data-name]", (e, t) => { const v = t.value.trim().slice(0, 30); if (v) mutate(p => { p.workouts[wi].name = v; }); else t.value = cur().name; });
    draw();
  },
  update(topic) { if ((topic === "program" || topic === "import") && !typingIn(root)) draw(); },
};
