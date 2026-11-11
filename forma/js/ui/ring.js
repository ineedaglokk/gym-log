/* Progress rings as inline SVG. A keyed ring remembers its last value, so after a re-render it
   animates from where it was instead of from zero (call playRings(root) after inserting the HTML). */

import { $$, afterPaint } from "../core/dom.js";
import { clamp } from "../core/format.js";

const last = new Map();

function arc({ key, c, r, sw, pct, color }) {
  const len = 2 * Math.PI * r, p = clamp(pct || 0, 0, 1);
  const prev = key ? (last.get(key) ?? 0) : p;
  if (key) last.set(key, p);
  const track = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-opacity=".17" stroke-width="${sw}"/>`;
  if (p <= 0 && prev <= 0) return track;
  const from = len * (1 - prev), to = len * (1 - p);
  return track + `<circle class="ring-arc" cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${len.toFixed(2)}" style="stroke-dashoffset:${from.toFixed(2)}" data-to="${to.toFixed(2)}"/>`;
}

/* one ring; inner is HTML put in the centre */
export function ring({ key = "", size = 96, sw = 10, pct = 0, color = "var(--accent)", inner = "" }) {
  const c = size / 2, r = (size - sw) / 2;
  return `<div class="ringbox" style="width:${size}px;height:${size}px"><svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${arc({ key, c, r, sw, pct, color })}</svg>${inner ? `<div class="ringbox__in">${inner}</div>` : ""}</div>`;
}

/* concentric rings, the first item is the outer one */
export function rings({ key = "", size = 150, sw = 13, gap = 4, items = [], inner = "" }) {
  const c = size / 2;
  const arcs = items.map((it, i) => arc({ key: key ? `${key}:${i}` : "", c, r: (size - sw) / 2 - i * (sw + gap), sw, pct: it.pct, color: it.color })).join("");
  return `<div class="ringbox" style="width:${size}px;height:${size}px"><svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${arcs}</svg>${inner ? `<div class="ringbox__in">${inner}</div>` : ""}</div>`;
}

export function playRings(root) {
  afterPaint(() => $$(".ring-arc[data-to]", root).forEach(n => { n.style.strokeDashoffset = n.dataset.to; }));
}
