/* Workout log of one day: every exercise with last time's result, weight and reps per set, warm-ups,
   a note for next time, skip. Saves as you type (per exercise, debounced) without redrawing the fields.
   Verdicts and tips come from shared/progress.js: better / same / weaker than last time, "time to add weight". */

import { S, getDay, updateDay } from "../core/store.js";
import { go, back } from "../core/router.js";
import { $, $$, esc, actions, on } from "../core/dom.js";
import { icon } from "../ui/icons.js";
import { exThumb } from "../ui/thumb.js";
import { confirmSheet } from "../ui/sheet.js";
import { askWeight } from "../ui/trackers.js";
import { P, workoutOn, prevEntry, suggest, norm, bwOn, targetText, groupName, dayTraining } from "../domain/training.js";
import { dayTitle, shortDate, longDate, nowHM, diffDays } from "../core/dates.js";
import { kg, parseNum, nWord } from "../core/format.js";

const MAX_SETS = 8, MAX_WU = 4, NOTE_MAX = 300;
let root, date, wid, timers, ui;   /* ui: per-exercise view state { extra, wu, note, bump } kept while the screen is open */

const workout = () => (S.program ? S.program.workouts.find(w => w.id === wid) || null : null);
const recOf = id => { const d = getDay(date); return d.w && d.w.ex ? d.w.ex[id] : null; };
const st = id => (ui[id] || (ui[id] = { extra: 0, wu: 0, note: false, bump: null }));
const intOf = t => { const v = parseNum(t, 999); return v == null ? null : Math.round(v); };
const unitWord = e => (e.unit === "секунды" ? "с" : e.unit === "минуты" ? "мин" : "повт.");

/* what to say under the sets: verdict against last time once every planned set is in, tips, last note */
function hints(e, prev, cur) {
  const out = [], doneN = cur.r.filter(r => r != null && r > 0).length, bw = bwOn(date);
  if (prev && doneN >= e.sets) {
    const j = P.judge(e, prev, cur, bw, { gap: diffDays(prev.d, date) });
    if (j) {
      const delta = P.deltaText(e, j);
      if (j.v > 0) out.push(`<span class="badge badge--good">${icon("trend", 14)} Лучше прошлого${delta !== "=" ? " · " + delta : ""}</span>`);
      else if (j.v < 0) out.push(`<span class="badge badge--warn">Слабее прошлого${delta !== "=" ? " · " + delta : ""}</span>`);
      else out.push(`<span class="badge">${j.why === "break" ? "После перерыва — без оценки" : "На уровне прошлого раза"}</span>`);
    }
    const tip = P.rampTip(e, cur, bw);
    if (tip) out.push(`<p class="ex__tip">${icon("zap", 15)}<span>${esc(tip)}</span></p>`);
  } else if (!prev && doneN >= e.sets) {
    out.push(`<span class="badge badge--accent">Первая запись — от неё и пойдём</span>`);
  }
  if (prev && doneN === 0 && st(e.id).bump == null) {
    const lv = P.levelUp(e, prev);
    if (lv) out.push(`<div class="ex__up"><span>${lv.kind === "up" ? `В прошлый раз все подходы по ${e.hi} — пора прибавить.` : `Тяжёлый подход прошёл в диапазоне — начни сразу с него.`}</span><button class="btn btn--soft btn--sm" data-act="bump" data-v="${lv.to}">Взять ${P.wtText(e, lv.to)}</button></div>`);
  }
  if (prev && prev.nt) out.push(`<p class="ex__tip">${icon("note", 15)}<span>С прошлого раза: ${esc(prev.nt)}</span></p>`);
  return out.join("");
}

function setRow(e, i, w, r, sug, prevR, wu = false) {
  const time = P.isTime(e), body = P.isBody(e), done = r != null && r > 0;
  const wIn = time ? "" : `<input class="set__in" data-k="w" inputmode="decimal" autocomplete="off" aria-label="Вес, подход ${i + 1}" data-sug="${sug != null ? sug : ""}" placeholder="${sug != null ? kg(sug) : body ? "+0" : "кг"}" value="${w != null ? kg(w) : ""}"><span class="set__x">×</span>`;
  return `<div class="set${wu ? " set--wu" : ""}${done ? " is-done" : ""}">
  <span class="set__n num">${wu ? "Р" : i + 1}</span>${wIn}
  <input class="set__in" data-k="r" inputmode="numeric" autocomplete="off" aria-label="${time ? "Время" : "Повторы"}, подход ${i + 1}" placeholder="${prevR != null ? prevR : wu ? "" : e.lo === e.hi ? e.hi : e.lo + "–" + e.hi}" value="${r != null ? r : ""}">
  <span class="set__unit">${unitWord(e)}</span>
  ${wu ? `<button class="set__rm" data-act="rm-wu" aria-label="Убрать разминку">${icon("x", 16)}</button>` : `<span class="set__ok">${icon("check", 15, { sw: 3 })}</span>`}
</div>`;
}

function card(e) {
  const d = getDay(date), s = st(e.id), skipped = ((d.w && d.w.sk) || []).includes(e.id);
  if (skipped) return `<article class="card ex ex--skipped" data-ex="${esc(e.id)}"><div class="row">${exThumb(e, "thumb--sm")}<div class="grow"><div class="b6 clip">${esc(e.name)}</div><div class="c3 t13">Пропущено сегодня</div></div><button class="btn btn--ghost btn--sm" data-act="skip">Вернуть</button></div></article>`;
  const prev = prevEntry(e.id, date, e.sets), stored = recOf(e.id), cur = norm(stored, e.sets + s.extra);
  /* suggested weight per row: the chosen "add weight" value, else last time's weights (extra rows repeat the last one) */
  const base = suggest(e, prev), sug = cur.r.map((_, i) => (s.bump != null ? s.bump : base[Math.min(i, base.length - 1)] ?? null));
  const wuN = Math.max(s.wu, cur.wu ? cur.wu.r.length : 0);
  const rows = cur.r.map((r, i) => setRow(e, i, cur.w[i], r, sug[i] ?? null, prev ? prev.r[i] : null)).join("");
  const wuRows = Array.from({ length: wuN }, (_, i) => setRow(e, i, cur.wu ? cur.wu.w[i] ?? null : null, cur.wu ? cur.wu.r[i] ?? null : null, null, null, true)).join("");
  const showNote = s.note || !!cur.nt;
  return `<article class="card ex" data-ex="${esc(e.id)}">
  <button class="ex__head" data-act="card">${exThumb(e)}<span class="grow"><b class="ex__name">${esc(e.name)}</b><span class="ex__meta">${targetText(e)} · ${e.unit}${groupName(e) ? " · " + groupName(e) : ""}</span></span>${icon("right", 18)}</button>
  ${prev ? `<div class="ex__prev"><span class="c3">${shortDate(prev.d)}</span>${P.setsOf(e, prev, null).map(x => `<i>${P.setChip(e, x)}</i>`).join("")}</div>` : `<div class="ex__prev"><span class="c3">Первый раз — подбери вес, с которым ${e.lo}–${e.hi} даются с усилием</span></div>`}
  <div class="sets">${wuRows}${rows}</div>
  <div class="ex__hint" data-hint>${hints(e, prev, cur)}</div>
  ${showNote ? `<textarea class="input ex__note" maxlength="${NOTE_MAX}" rows="2" placeholder="Заметка на следующий раз: хват, высота сиденья, ощущения">${esc(cur.nt)}</textarea>` : ""}
  <div class="ex__tools">
    ${cur.r.length < MAX_SETS ? `<button data-act="add-set">${icon("plus", 15)} подход</button>` : ""}
    ${wuN < MAX_WU ? `<button data-act="add-wu">${icon("plus", 15)} разминка</button>` : ""}
    ${showNote ? "" : `<button data-act="note">${icon("note", 15)} заметка</button>`}
    <button data-act="skip">${icon("skip", 15)} пропустить</button>
  </div>
</article>`;
}

function progress() {
  const tr = dayTraining(date);
  return `<div class="wlog__prog"><div class="row between"><span class="b6">${tr.done >= tr.total && tr.total ? "Все подходы сделаны" : `${tr.done} из ${nWord(tr.total, "подхода", "подходов", "подходов")}`}</span><span class="c3 t13">${Math.round((tr.pct || 0) * 100)}%</span></div>
<div class="bar mt8"><i class="bar__fill" style="--w:${Math.round((tr.pct || 0) * 100)}%;--c:${tr.pct >= 1 ? "var(--good)" : "var(--m-gym)"}"></i></div></div>`;
}

function draw() {
  const w = workout(), ws = S.program ? S.program.workouts : [];
  const top = `<div class="topbar"><button class="iconbtn" data-act="back" aria-label="Назад">${icon("left", 22)}</button><div class="topbar__title"><div>${dayTitle(date)}</div><div class="c3 t13 b5">${longDate(date)}</div></div>${w && recAny() ? `<button class="iconbtn" data-act="clear" aria-label="Очистить запись">${icon("trash", 20)}</button>` : `<span class="topbar__spacer"></span>`}</div>`;
  if (!S.program) { root.innerHTML = `${top}<div class="card empty"><div class="empty__ico">${icon("dumbbell", 26)}</div><div class="h3">Сначала нужна программа</div><p>Выбери готовую или собери свою.</p><button class="btn mt16" data-act="gym">К программам</button></div>`; return; }
  const chips = ws.length > 1 || !w ? `<div class="chips wlog__chips">${ws.map(x => `<button class="chip chip--accent${x.id === wid ? " is-on" : ""}" data-act="pick" data-w="${esc(x.id)}">${esc(x.name)}</button>`).join("")}</div>` : "";
  if (!w) { root.innerHTML = `${top}<h1 class="h1">Что тренируем?</h1><p class="c2 mt8">На этот день тренировка не запланирована — выбери любую.</p><div class="mt16">${chips}</div>`; return; }
  const bw = getDay(date).bw;
  root.innerHTML = `${top}<h1 class="h1 clip">${esc(w.name)}</h1>${chips ? `<div class="mt12">${chips}</div>` : ""}
<div data-prog class="mt16">${progress()}</div>
<div class="stack stagger mt16">${w.ex.length ? w.ex.map(card).join("") : `<div class="card empty"><div class="empty__ico">${icon("plus", 26)}</div><div class="h3">В тренировке нет упражнений</div><p>Добавь их в программе.</p><button class="btn btn--soft mt16" data-act="program">Открыть программу</button></div>`}</div>
<button class="card card--tap wlog__bw mt12" data-act="bw"><span class="item__ico">${icon("scale", 20)}</span><span class="grow"><b>Вес тела</b><span class="c3 t13" style="display:block">Нужен для упражнений со своим весом</span></span><b class="num t20">${bw != null ? kg(bw) + " кг" : "—"}</b></button>
<div class="fab-bar"><button class="btn" data-act="back">Готово</button></div>`;
}
const recAny = () => { const d = getDay(date); return !!(d.w && ((d.w.ex && Object.keys(d.w.ex).length) || (d.w.sk && d.w.sk.length))); };

/* reads one exercise card from the page and stores it; an untouched card stores nothing */
function saveEx(id) {
  clearTimeout(timers.get(id)); timers.delete(id);
  const el = $(`[data-ex="${CSS.escape(id)}"]`, root), w = workout(), e = w && w.ex.find(x => x.id === id);
  if (!el || !e || el.classList.contains("ex--skipped")) return;
  const body = P.isBody(e), read = rows => {
    const out = { w: [], r: [] };
    rows.forEach(row => {
      const ri = $('[data-k="r"]', row), wi = $('[data-k="w"]', row);
      const r = intOf(ri.value);
      let wv = wi ? parseNum(wi.value, 2000) : null;
      /* reps typed, weight left as suggested: the suggestion becomes the weight */
      if (r != null && wv == null && wi && !body && wi.dataset.sug !== "") { wv = Number(wi.dataset.sug); if (document.activeElement !== wi) wi.value = kg(wv); }
      row.classList.toggle("is-done", r != null && r > 0);
      out.r.push(r); out.w.push(wv);
    });
    return out;
  };
  const main = read($$(".set:not(.set--wu)", el)), wuAll = read($$(".set--wu", el));
  /* rows added and left empty are not stored */
  while (main.r.length && main.r.at(-1) == null && main.w.at(-1) == null) { main.r.pop(); main.w.pop(); }
  const wu = { w: [], r: [] };
  wuAll.r.forEach((r, i) => { if (r != null) { wu.r.push(r); wu.w.push(wuAll.w[i]); } });
  const noteEl = $(".ex__note", el), nt = noteEl ? noteEl.value.trim().slice(0, NOTE_MAX) : (recOf(id) || {}).nt || "";
  const any = main.r.some(v => v != null) || main.w.some(v => v != null) || wu.r.length || nt;
  updateDay(date, d => {
    d.w = d.w || { id: wid, ex: {} };
    d.w.id = wid; d.w.ex = d.w.ex || {};
    if (any) {
      const rec = { ...(d.w.ex[id] || {}), w: main.w, r: main.r };   /* fields this screen does not know stay as they were */
      if (wu.r.length) rec.wu = wu; else delete rec.wu;
      if (nt) rec.nt = nt; else delete rec.nt;
      d.w.ex[id] = rec;
      if (!d.w.t0) d.w.t0 = nowHM();
    } else delete d.w.ex[id];
    if (!Object.keys(d.w.ex).length && !(d.w.sk && d.w.sk.length)) delete d.w;
  }, { silent: true });
  const hint = $("[data-hint]", el);
  if (hint) hint.innerHTML = hints(e, prevEntry(id, date, e.sets), norm(recOf(id), e.sets));
  $("[data-prog]", root).innerHTML = progress();
}
const flushAll = () => [...timers.keys()].forEach(saveEx);
const redrawCard = id => { const el = $(`[data-ex="${CSS.escape(id)}"]`, root), e = workout().ex.find(x => x.id === id); if (el && e) el.outerHTML = card(e); };
const idOf = t => t.closest("[data-ex]").dataset.ex;

export default {
  depth: 1,
  mount(el, params, state) {
    root = el; date = params.date; timers = new Map(); ui = {};
    const planned = workoutOn(date);
    wid = (state && state.wid) || (planned ? planned.id : null);
    actions(el, {
      back: () => { flushAll(); back("gym"); },
      gym: () => go("gym"),
      program: () => go("program"),
      card: t => { flushAll(); go("exercise/" + idOf(t)); },
      bw: () => askWeight(date),
      pick(t) {
        flushAll(); wid = t.dataset.w; ui = {};
        if (recAny()) updateDay(date, d => { d.w.id = wid; }, { silent: true });
        draw();
      },
      bump(t) { const id = idOf(t); st(id).bump = Number(t.dataset.v); redrawCard(id); },
      "add-set"(t) {
        const id = idOf(t), e = workout().ex.find(x => x.id === id), rows = $$(".set:not(.set--wu)", t.closest("[data-ex]")).length;
        saveEx(id); st(id).extra = rows - e.sets + 1; redrawCard(id);
      },
      "add-wu": t => { const id = idOf(t); saveEx(id); const r = recOf(id); st(id).wu = Math.max(st(id).wu, r && r.wu ? r.wu.r.length : 0) + 1; redrawCard(id); const f = $(`[data-ex="${CSS.escape(id)}"] .set--wu:last-of-type .set__in`, root); if (f) f.focus(); },
      "rm-wu"(t) { const id = idOf(t), row = t.closest(".set"); st(id).wu = Math.max(0, $$(".set--wu", row.parentNode).length - 1); row.remove(); saveEx(id); redrawCard(id); },
      note(t) { const id = idOf(t); saveEx(id); st(id).note = true; redrawCard(id); const f = $(`[data-ex="${CSS.escape(id)}"] .ex__note`, root); if (f) f.focus(); },
      skip(t) {
        const id = idOf(t); saveEx(id);
        updateDay(date, d => {
          d.w = d.w || { id: wid, ex: {} };
          const sk = new Set(d.w.sk || []);
          if (sk.has(id)) sk.delete(id); else sk.add(id);
          if (sk.size) d.w.sk = [...sk]; else delete d.w.sk;
          if (!Object.keys(d.w.ex || {}).length && !d.w.sk) delete d.w;
        }, { silent: true });
        redrawCard(id); $("[data-prog]", root).innerHTML = progress();
      },
      async clear() {
        if (!(await confirmSheet({ title: "Очистить запись тренировки?", text: `Подходы за ${dayTitle(date).toLowerCase()} будут удалены. Еда и остальное останутся.`, ok: "Очистить", danger: true }))) return;
        timers.forEach(t => clearTimeout(t)); timers.clear(); ui = {};
        updateDay(date, d => { delete d.w; }, { silent: true });
        draw();
      },
    });
    on(el, "input", ".set__in, .ex__note", (e, t) => {
      const id = idOf(t);
      clearTimeout(timers.get(id));
      timers.set(id, setTimeout(() => saveEx(id), 350));
    });
    /* tidy "7.5" → "7,5" when a weight field is left */
    on(el, "focusout", '.set__in[data-k="w"]', (e, t) => { const v = parseNum(t.value, 2000); if (v != null) t.value = kg(v); });
    draw();
  },
  update(topic) { if (topic === "day" || topic === "profile") { const n = $(".wlog__bw b.num", root); if (n) { const bw = getDay(date).bw; n.textContent = bw != null ? kg(bw) + " кг" : "—"; } } },
  unmount() { flushAll(); },
};
