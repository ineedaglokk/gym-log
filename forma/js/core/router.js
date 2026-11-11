/* Hash router. A screen is { tab?, depth?, mount(el, params, state), update?(topic), unmount?() }.
   tab — the bottom-nav item it belongs to (screens without it hide the nav);
   depth — 0 for tab roots, 1+ for inner screens: decides the slide direction. */

import { subscribe } from "./store.js";

const routes = [], scrollPos = new Map();
let view = null, cur = null, pending = null, inApp = 0, selfNav = false, guard = null, onChange = null;

export function route(pattern, screen) {
  const keys = [];
  const rx = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "$");
  routes.push({ rx, keys, screen });
}

/* state is handed to the next screen's mount() once (things too big or too private for the URL) */
export function go(path, state = null) {
  pending = state;
  if (location.hash === "#/" + path) { render(); return; }
  selfNav = true; inApp++;
  location.hash = "#/" + path;
}
export function replace(path, state = null) {
  pending = state;
  history.replaceState(null, "", "#/" + path);
  render();
}
export function back(fallback = "today") {
  if (inApp > 0) history.back(); else replace(fallback);
}
export const current = () => cur;

function render() {
  const path = decodeURI(location.hash.replace(/^#\/?/, "")) || "today";
  let hit = null, m = null;
  for (const r of routes) { m = r.rx.exec(path); if (m) { hit = r; break; } }
  if (!hit) { replace("today"); return; }
  const redirect = guard ? guard(path, hit.screen) : null;
  if (redirect && redirect !== path) { replace(redirect); return; }

  const params = Object.fromEntries(hit.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
  const depth = hit.screen.depth || 0, prev = cur;
  if (prev) { scrollPos.set(prev.path, window.scrollY); if (prev.screen.unmount) prev.screen.unmount(); }

  const el = document.createElement("section");
  const dir = !prev ? "" : depth > prev.depth ? "push" : depth < prev.depth ? "pop" : "";
  el.className = "screen is-entering " + dir;
  view.replaceChildren(el);
  document.body.classList.toggle("no-nav", !hit.screen.tab);
  cur = { path, screen: hit.screen, el, depth, params };
  const state = pending; pending = null;
  hit.screen.mount(el, params, state);
  setTimeout(() => el.classList.remove("is-entering"), 1400);
  /* going back or switching tabs returns to where the screen was; opening a new screen starts at the top */
  window.scrollTo(0, dir === "push" ? 0 : scrollPos.get(path) || 0);
  if (onChange) onChange(hit.screen.tab || null, path);
}

export function start({ viewEl, guard: g, onChange: cb }) {
  view = viewEl; guard = g || null; onChange = cb || null;
  window.addEventListener("hashchange", () => {
    if (selfNav) selfNav = false; else inApp = Math.max(0, inApp - 1);
    render();
  });
  subscribe(topic => { if (cur && cur.screen.update) cur.screen.update(topic, cur.el); });
  render();
}
