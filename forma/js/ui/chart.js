/* Charts as inline SVG strings (viewBox 320 wide, scales with the card). No dependencies.
   They animate only while the screen is entering (see .is-entering in components.css). */

import { num } from "../core/format.js";

const W = 320;
let gid = 0;

/* data: [{ l: label, v: value|null, c?: colour, on?: highlighted }]; goal draws a dashed line */
export function barChart({ data, goal = null, color = "var(--accent)", h = 138, fmt = v => num(v), goalLabel = "цель" }) {
  const padT = 20, padB = 20, n = data.length || 1;
  const max = Math.max(goal || 0, ...data.map(d => d.v || 0), 1) * 1.1;
  const step = W / n, bw = Math.min(26, step * 0.6), area = h - padT - padB;
  const y = v => h - padB - (v / max) * area;
  const bars = data.map((d, i) => {
    const x = i * step + (step - bw) / 2, has = d.v != null && d.v > 0;
    const top = has ? y(d.v) : h - padB - 3, hh = has ? Math.max(3, h - padB - top) : 3;
    const lab = `<text x="${x + bw / 2}" y="${h - 5}" text-anchor="middle"${d.on ? ' style="fill:var(--text);font-weight:700"' : ""}>${d.l}</text>`;
    const val = d.on && has ? `<text class="chart__val" x="${x + bw / 2}" y="${top - 6}" text-anchor="middle">${fmt(d.v)}</text>` : "";
    return `<rect class="chart__bar" x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${hh.toFixed(1)}" rx="${Math.min(7, bw / 2)}" fill="${d.c || color}" opacity="${has ? (d.on ? 1 : .55) : .18}" style="animation-delay:${(i * 0.035).toFixed(2)}s"/>${lab}${val}`;
  }).join("");
  const gl = goal ? `<line x1="0" x2="${W}" y1="${y(goal)}" y2="${y(goal)}" stroke="var(--text-3)" stroke-width="1" stroke-dasharray="3 5" opacity=".7"/><text x="${W}" y="${y(goal) - 5}" text-anchor="end">${goalLabel} ${fmt(goal)}</text>` : "";
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img">${gl}${bars}</svg>`;
}

/* smooth path through points (Catmull-Rom → Bézier, gentle tension) */
function smooth(p) {
  if (p.length < 3) return p.map((q, i) => (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1)).join("");
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2, t = 0.18;
    d += `C${(p1[0] + (p2[0] - p0[0]) * t).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) * t).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) * t).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) * t).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/* pts: [{ x: number, y: number, l?: label }] sorted by x; goal — a horizontal dashed line */
export function lineChart({ pts, color = "var(--accent)", h = 150, fmt = v => num(v, 1), goal = null, dots = true }) {
  if (!pts.length) return "";
  const padT = 22, padB = 22, padL = 6, padR = 44;
  const ys = pts.map(p => p.y).concat(goal != null ? [goal] : []);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const m = (hi - lo) * 0.14; lo -= m; hi += m;
  const x0 = pts[0].x, x1 = pts[pts.length - 1].x, dx = x1 - x0 || 1;
  const X = x => padL + ((x - x0) / dx) * (W - padL - padR), Y = v => padT + (1 - (v - lo) / (hi - lo)) * (h - padT - padB);
  const P = pts.length === 1 ? [[padL, Y(pts[0].y)], [W - padR, Y(pts[0].y)]] : pts.map(p => [X(p.x), Y(p.y)]);
  const d = smooth(P), id = "lg" + (++gid), last = P[P.length - 1], lastPt = pts[pts.length - 1];
  const grid = [0, 0.5, 1].map(k => {
    const v = lo + m + (hi - lo - 2 * m) * k, yy = Y(v);
    return `<line x1="0" x2="${W - padR + 6}" y1="${yy}" y2="${yy}" stroke="var(--line)" stroke-width="1"/><text x="${W}" y="${yy + 3.5}" text-anchor="end">${fmt(v)}</text>`;
  }).join("");
  const gl = goal != null ? `<line x1="0" x2="${W - padR + 6}" y1="${Y(goal)}" y2="${Y(goal)}" stroke="${color}" stroke-width="1" stroke-dasharray="3 5" opacity=".8"/>` : "";
  const marks = dots && pts.length <= 31 ? P.slice(0, -1).map(q => `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="2.2" fill="var(--card)" stroke="${color}" stroke-width="1.6"/>`).join("") : "";
  const labels = pts[0].l ? `<text x="${padL}" y="${h - 5}">${pts[0].l}</text>${pts.length > 1 ? `<text x="${W - padR}" y="${h - 5}" text-anchor="end">${lastPt.l || ""}</text>` : ""}` : "";
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".30"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
${grid}${gl}
<path class="chart__area" d="${d}L${last[0].toFixed(1)} ${h - padB}L${P[0][0].toFixed(1)} ${h - padB}Z" fill="url(#${id})"/>
<path class="chart__line" d="${d}" pathLength="1" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
${marks}<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="5" fill="${color}" stroke="var(--card)" stroke-width="2.5"/>
${labels}</svg>`;
}

/* a tiny trend line without axes, for tiles */
export function spark({ values, color = "var(--accent)", w = 96, h = 30 }) {
  const v = values.filter(x => x != null);
  if (v.length < 2) return "";
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const P = v.map((y, i) => [2 + (i / (v.length - 1)) * (w - 4), 3 + (1 - (y - lo) / span) * (h - 6)]);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${smooth(P)}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/><circle cx="${P[P.length - 1][0]}" cy="${P[P.length - 1][1]}" r="2.6" fill="${color}"/></svg>`;
}

/* horizontal bars with a target band, e.g. weekly sets per muscle. rows: [{ l, v, sub? }] */
export function hBars({ rows, max, band = null, color = "var(--accent)" }) {
  const top = Math.max(max || 0, ...rows.map(r => r.v), band ? band[1] : 0, 1);
  return `<div class="hbars">${rows.map(r => {
    const inBand = band && r.v >= band[0] && r.v <= band[1];
    return `<div class="hbars__row"><span class="hbars__l clip">${r.l}</span><div class="hbars__track">${band ? `<i class="hbars__band" style="left:${band[0] / top * 100}%;width:${(band[1] - band[0]) / top * 100}%"></i>` : ""}<i class="hbars__fill" style="width:${Math.min(100, r.v / top * 100)}%;background:${inBand ? "var(--good)" : color}"></i></div><b class="num hbars__v">${num(r.v, 1)}</b></div>`;
  }).join("")}</div>`;
}
