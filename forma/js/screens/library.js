/* Exercise library: 1045 exercises with search, muscle-group and equipment filters.
   Opened from the program editor it adds exercises to a workout (pick mode); otherwise it is a catalogue. */

import { S } from "../core/store.js";
import { go, back } from "../core/router.js";
import { $, esc, actions, on } from "../core/dom.js";
import { icon } from "../ui/icons.js";
import { exThumb } from "../ui/thumb.js";
import { sheet, toast } from "../ui/sheet.js";
import { GROUPS, EQUIP, LIBMAP, searchLib, UNITS } from "../domain/catalog.js";
import { exFromLib, ownExercise, saveProgram, MAX_EX } from "../domain/training.js";
import { nWord } from "../core/format.js";

const LIMIT = 60;
let root, ctx = { pick: null }, f = { q: "", group: -1, equip: -1 };

const target = () => (ctx.pick && S.program ? S.program.workouts.find(w => w.id === ctx.pick) || null : null);
const inWorkout = x => { const w = target(); return !!w && w.ex.some(e => e.lib === x.id); };

function list() {
  const { total, items } = searchLib(f.q, { group: f.group, equip: f.equip, limit: LIMIT }), pick = !!target();
  if (!total) return `<div class="card empty"><div class="empty__ico">${icon("search", 26)}</div><div class="h3">Ничего не нашлось</div><p>Попробуй короче: «жим», «тяга», «присед». Или добавь своё упражнение.</p></div>`;
  return `<div class="c3 t13 lib__count">${nWord(total, "упражнение", "упражнения", "упражнений")}${total > LIMIT ? ` · показаны первые ${LIMIT}, уточни поиск` : ""}</div>
<div class="list">${items.map(x => { const added = pick && inWorkout(x); return `<div class="item lib__row"><button class="lib__main" data-act="open" data-id="${x.id}">${exThumb(x)}<span class="grow"><span class="b6 lib__name">${esc(x.name)}</span><span class="c3 t13">${x.group} · ${x.equip}</span></span></button>${pick ? `<button class="iconbtn ${added ? "lib__added" : "iconbtn--soft"}" data-act="add" data-id="${x.id}" aria-label="${added ? "Уже в тренировке" : "Добавить"}">${icon(added ? "check" : "plus", 20)}</button>` : `<span class="item__chev">${icon("right", 18)}</span>`}</div>`; }).join("")}</div>`;
}
const redrawList = () => { $("[data-list]", root).innerHTML = list(); };
const chipRow = (act, names, val, all) => `<div class="chips mt8"><button class="chip${val < 0 ? " is-on" : ""}" data-act="${act}" data-v="-1">${all}</button>${names.map((n, i) => `<button class="chip${val === i ? " is-on" : ""}" data-act="${act}" data-v="${i}">${n}</button>`).join("")}</div>`;

function draw() {
  const w = target();
  root.innerHTML = `<div class="topbar"><button class="iconbtn" data-act="back" aria-label="Назад">${icon("left", 22)}</button><div class="topbar__title clip">${w ? `Добавить в «${esc(w.name)}»` : "Упражнения"}</div><button class="iconbtn" data-act="own" aria-label="Своё упражнение">${icon("plus", 22)}</button></div>
<div class="search"><input class="input" type="search" data-q placeholder="Жим, тяга, присед…" autocomplete="off" enterkeyhint="search" value="${esc(f.q)}">${icon("search", 20)}</div>
<div data-groups>${chipRow("group", GROUPS, f.group, "Все мышцы")}</div>
<div data-equip>${chipRow("equip", EQUIP, f.equip, "Любой снаряд")}</div>
<div class="mt16" data-list>${list()}</div>
<button class="btn btn--line mt16" data-act="own">${icon("plus", 18)} Нет нужного — добавить своё</button>`;
}

function addToWorkout(ex) {
  const w = target();
  if (!w) return false;
  if (w.ex.length >= MAX_EX) { toast(`В тренировке уже ${MAX_EX} упражнений`, { ico: "info" }); return false; }
  const p = structuredClone(S.program), pw = p.workouts.find(x => x.id === w.id);
  pw.ex.push(typeof ex === "function" ? ex(p) : ex);
  saveProgram(p);
  return true;
}

function ownSheet() {
  let g = f.group >= 0 ? f.group : 0, unit = UNITS[0];
  sheet({
    title: "Своё упражнение",
    onMount(api) {
      const render = () => {
        const name = $("[data-own]", api.el) ? $("[data-own]", api.el).value : f.q;
        api.body.innerHTML = `<label class="field"><span class="field__label">Название</span><input class="input" data-own maxlength="60" placeholder="Например, тяга в хаммере" value="${esc(name)}"></label>
<div class="field__label mt16">Группа мышц</div><div class="chips chips--wrap">${GROUPS.map((n, i) => `<button class="chip${g === i ? " is-on" : ""}" data-act="g" data-v="${i}">${n}</button>`).join("")}</div>
<div class="field__label mt16">Как считаем</div><div class="chips chips--wrap">${UNITS.map(u => `<button class="chip${unit === u ? " is-on" : ""}" data-act="u" data-v="${u}">${u}</button>`).join("")}</div>
<button class="btn mt20" data-act="save">${target() ? "Добавить в тренировку" : "Сохранить"}</button>
${target() ? "" : `<p class="c3 t13 mt8 center">Своё упражнение добавляется в тренировку: открой библиотеку из программы.</p>`}`;
      };
      actions(api.el, {
        g: t => { g = Number(t.dataset.v); render(); },
        u: t => { unit = t.dataset.v; render(); },
        save() {
          const name = $("[data-own]", api.el).value.trim();
          if (!name) { toast("Напиши название", { ico: "info" }); return; }
          if (!target()) { toast("Открой библиотеку из программы, чтобы добавить", { ico: "info" }); return; }
          if (addToWorkout(ownExercise({ name, g, q: -1, unit }))) { api.close(); toast(`«${name}» добавлено`); }
        },
      });
      render();
    },
  });
}

export default {
  depth: 2,
  mount(el, params, state) {
    root = el;
    if (state) { ctx = { pick: state.pick || null }; f = { q: "", group: -1, equip: -1 }; }
    actions(el, {
      back: () => back(ctx.pick ? "program" : "gym"),
      own: ownSheet,
      group: t => { f.group = Number(t.dataset.v); $("[data-groups]", root).innerHTML = chipRow("group", GROUPS, f.group, "Все мышцы"); redrawList(); },
      equip: t => { f.equip = Number(t.dataset.v); $("[data-equip]", root).innerHTML = chipRow("equip", EQUIP, f.equip, "Любой снаряд"); redrawList(); },
      open: t => go("exercise/" + t.dataset.id),
      add(t) {
        const x = LIBMAP[t.dataset.id];
        if (inWorkout(x)) { toast("Уже в этой тренировке", { ico: "info" }); return; }
        if (addToWorkout(p => exFromLib(x, p))) { toast(`Добавлено: ${x.name}`); redrawList(); }
      },
    });
    let timer = 0;
    on(el, "input", "[data-q]", (e, t) => { f.q = t.value; clearTimeout(timer); timer = setTimeout(redrawList, 160); });
    draw();
  },
};
