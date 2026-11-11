/* Tiny DOM helpers. Screens build HTML strings and listen through one delegated handler per screen. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/* every user-typed or external string goes through esc() before it lands in innerHTML */
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ESC[c]);

export const cls = (...a) => a.filter(Boolean).join(" ");

/* delegated listener: fn(event, matchedElement) */
export function on(root, type, sel, fn, opts) {
  root.addEventListener(type, e => {
    const t = e.target.closest ? e.target.closest(sel) : null;
    if (t && root.contains(t)) fn(e, t);
  }, opts);
}

/* click on [data-act="name"] → map.name(element, event) */
export function actions(root, map) {
  on(root, "click", "[data-act]", (e, t) => {
    const fn = map[t.dataset.act];
    if (fn) { e.preventDefault(); fn(t, e); }
  });
}

export const afterPaint = fn => requestAnimationFrame(() => requestAnimationFrame(fn));

/* counts a number up to its value: <b data-count="1240"></b> */
export function countUp(root) {
  $$("[data-count]", root).forEach(n => {
    const to = Number(n.dataset.count), from = Number(n.dataset.from || 0), d = Number(n.dataset.dec || 0);
    const fmt = v => v.toLocaleString("ru-RU", { maximumFractionDigits: d, minimumFractionDigits: 0 }).replace(/ | /g, " ");
    if (from === to || matchMedia("(prefers-reduced-motion: reduce)").matches) { n.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 700;
    const step = t => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - (1 - k) ** 3;
      n.textContent = fmt(Math.round((from + (to - from) * e) * 10 ** d) / 10 ** d);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/* true while the user is typing inside root — a re-render then would steal the focus */
export const typingIn = root => {
  const a = document.activeElement;
  return !!a && root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
};

export function download(name, text, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
