/* Numbers and words the Russian way: "1 240", "7,5", "3 подхода". */

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const round = (v, d = 0) => { const k = 10 ** d; return Math.round(v * k) / k; };

/* 1240.4 → "1 240"; num(7.52, 1) → "7,5" */
export function num(v, d = 0) {
  if (v == null || !isFinite(v)) return "—";
  return round(v, d).toLocaleString("ru-RU", { maximumFractionDigits: d }).replace(/ | /g, " ");
}

/* weights: "7,5", "60" */
export const kg = v => v == null ? "—" : String(round(v, 2)).replace(".", ",");

/* "7,5" or "7.5" typed by hand → 7.5; empty or bad → null */
export function parseNum(t, max = 100000) {
  t = String(t ?? "").trim().replace(",", ".").replace(/\s/g, "");
  if (t === "") return null;
  const v = parseFloat(t);
  return isFinite(v) && v >= 0 && v <= max ? round(v, 2) : null;
}

export function plural(n, one, few, many) {
  const m10 = Math.abs(n) % 10, m100 = Math.abs(n) % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
export const nWord = (n, one, few, many) => `${num(n)} ${plural(n, one, few, many)}`;

export const pct = (v, total) => total > 0 ? clamp(v / total, 0, 1) : 0;
export const signed = (v, d = 1) => (v > 0 ? "+" : v < 0 ? "−" : "") + num(Math.abs(v), d);

/* litres from millilitres: 1250 → "1,25" */
export const litres = ml => num(ml / 1000, ml % 1000 === 0 ? 0 : ml % 100 === 0 ? 1 : 2);

/* hours as "7 ч 30 мин" */
export function hours(h) {
  if (h == null) return "—";
  const m = Math.round(h * 60), hh = Math.floor(m / 60), mm = m % 60;
  return mm ? `${hh} ч ${mm} мин` : `${hh} ч`;
}

export const uid = (p = "") => p + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6);
export const initials = name => String(name || "").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "Я";
