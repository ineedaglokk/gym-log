/* Bottom sheets, toasts and the small dialogs built on them (confirm, number entry, choice). */

import { $, esc, actions } from "../core/dom.js";
import { icon } from "./icons.js";
import { parseNum, kg } from "../core/format.js";

const host = () => $("#sheets");
let openCount = 0;

/* opens a sheet; returns { el, body, close(result) }. onClose(result) runs once, after the sheet is gone. */
export function sheet({ title = "", body = "", full = false, onMount = null, onClose = null }) {
  const wrap = document.createElement("div");
  wrap.className = "sheet-wrap";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.innerHTML = `<div class="sheet-wrap__scrim" data-close></div>
<div class="sheet${full ? " sheet--full" : ""}">
  <div class="sheet__grab"></div>
  <div class="sheet__head"><div class="sheet__title">${esc(title)}</div><button class="iconbtn" data-close aria-label="Закрыть">${icon("x", 20)}</button></div>
  <div class="sheet__body">${body}</div>
</div>`;
  const prevFocus = document.activeElement;
  let closed = false;
  const close = result => {
    if (closed) return; closed = true;
    wrap.classList.add("is-closing");
    document.removeEventListener("keydown", onKey);
    setTimeout(() => {
      wrap.remove();
      if (--openCount <= 0) { openCount = 0; document.documentElement.style.overflow = ""; }
      if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
      if (onClose) onClose(result);
    }, 230);
  };
  const onKey = e => { if (e.key === "Escape") close(); };
  wrap.addEventListener("click", e => { if (e.target.closest("[data-close]")) close(); });
  document.addEventListener("keydown", onKey);
  host().append(wrap);
  openCount++;
  document.documentElement.style.overflow = "hidden";
  const api = { el: wrap, body: $(".sheet__body", wrap), close };
  if (onMount) onMount(api);
  return api;
}

export function toast(text, { ico = "check", action = null, ms = 2600 } = {}) {
  const n = document.createElement("div");
  n.className = "toast";
  n.innerHTML = `${ico ? icon(ico, 18) : ""}<span>${esc(text)}</span>${action ? `<button>${esc(action.label)}</button>` : ""}`;
  const out = () => { n.classList.add("is-out"); setTimeout(() => n.remove(), 240); };
  if (action) $("button", n).addEventListener("click", () => { action.fn(); out(); });
  $("#toasts").replaceChildren(n);
  setTimeout(out, action ? Math.max(ms, 4500) : ms);
}

/* resolves true / false */
export function confirmSheet({ title, text = "", ok = "Да", cancel = "Отмена", danger = false }) {
  return new Promise(res => {
    sheet({
      title,
      body: `${text ? `<p class="c2">${esc(text)}</p>` : ""}<div class="row mt20"><button class="btn btn--ghost" data-close>${esc(cancel)}</button><button class="btn ${danger ? "btn--danger" : ""}" data-act="ok">${esc(ok)}</button></div>`,
      onMount: s => actions(s.el, { ok: () => s.close(true) }),
      onClose: r => res(r === true),
    });
  });
}

/* one number with optional quick buttons; resolves the number, or null when cancelled, or "clear" */
export function numberSheet({ title, value = null, unit = "", hint = "", quick = [], max = 100000, clearable = false, placeholder = "0" }) {
  return new Promise(res => {
    sheet({
      title,
      body: `${hint ? `<p class="c2 t13">${esc(hint)}</p>` : ""}
<div class="numsheet mt12"><input class="input input--num numsheet__in" inputmode="decimal" enterkeyhint="done" placeholder="${esc(placeholder)}" value="${value != null ? kg(value) : ""}"><span class="c3">${esc(unit)}</span></div>
${quick.length ? `<div class="chips chips--wrap mt12">${quick.map(q => `<button class="chip" data-act="quick" data-v="${q.v}">${esc(q.l)}</button>`).join("")}</div>` : ""}
<div class="row mt20">${clearable && value != null ? `<button class="btn btn--ghost btn--auto" data-act="clear" aria-label="Очистить">${icon("trash", 20)}</button>` : ""}<button class="btn" data-act="ok">Готово</button></div>`,
      onMount: s => {
        const inp = $(".numsheet__in", s.el);
        const done = () => { const v = parseNum(inp.value, max); if (v == null) { inp.focus(); return; } s.close(v); };
        actions(s.el, {
          ok: done,
          clear: () => s.close("clear"),
          quick: t => { inp.value = kg(Number(t.dataset.v)); done(); },
        });
        inp.addEventListener("keydown", e => { if (e.key === "Enter") done(); });
        setTimeout(() => { inp.focus(); inp.select(); }, 320);
      },
      onClose: r => res(r === undefined ? null : r),
    });
  });
}

/* one line of text; resolves the trimmed string or null when cancelled */
export function textSheet({ title, value = "", placeholder = "", max = 60, hint = "", ok = "Готово", type = "text", caps = type === "text" }) {
  return new Promise(res => {
    sheet({
      title,
      body: `${hint ? `<p class="c2 t13">${esc(hint)}</p>` : ""}<input class="input mt12" data-text type="${type}" maxlength="${max}" autocomplete="off" autocapitalize="${caps ? "sentences" : "off"}"${caps ? "" : ' autocorrect="off" spellcheck="false"'} enterkeyhint="done" placeholder="${esc(placeholder)}" value="${esc(value)}"><button class="btn mt16" data-act="ok">${esc(ok)}</button>`,
      onMount: s => {
        const inp = $("[data-text]", s.el), done = () => s.close(inp.value.trim());
        actions(s.el, { ok: done });
        inp.addEventListener("keydown", e => { if (e.key === "Enter") done(); });
        setTimeout(() => inp.focus(), 320);
      },
      onClose: r => res(typeof r === "string" ? r : null),
    });
  });
}

/* a list of options; resolves the chosen key or null. options: [{ k, n, d?, ico? }] */
export function choiceSheet({ title, options, value = null }) {
  return new Promise(res => {
    sheet({
      title,
      body: `<div class="choices">${options.map(o => `<button class="choice${o.k === value ? " is-on" : ""}" data-act="pick" data-k="${esc(o.k)}">
${o.ico ? `<span class="choice__ico">${icon(o.ico, 20)}</span>` : ""}<span class="grow"><b>${esc(o.n)}</b>${o.d ? `<small>${esc(o.d)}</small>` : ""}</span><span class="choice__mark">${icon("check", 18)}</span></button>`).join("")}</div>`,
      onMount: s => actions(s.el, { pick: t => s.close(t.dataset.k) }),
      onClose: r => res(r === undefined ? null : r),
    });
  });
}
