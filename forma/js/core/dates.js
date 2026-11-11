/* Dates as "YYYY-MM-DD" strings in the phone's local time. Weeks start on Monday (index 0). */

const pad = n => String(n).padStart(2, "0");

export const MON = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
export const MON_G = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
export const MON_S = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
export const WD_S = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
export const WD_L = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];

export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const today = () => iso(new Date());
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
export const wdOf = s => (parse(s).getDay() + 6) % 7;
export const weekStart = s => addDays(s, -wdOf(s));
export const weekDays = s => { const a = weekStart(s); return Array.from({ length: 7 }, (_, i) => addDays(a, i)); };
export const ymOf = s => s.slice(0, 7);
export const addMonths = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
export const daysInMonth = ym => { const [y, m] = ym.split("-").map(Number); return new Date(y, m, 0).getDate(); };
export const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/* every date from a to b inclusive */
export function range(a, b) {
  const out = [];
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
  return out;
}

/* a month as rows of 7 cells (Monday first); cells outside the month are null */
export function monthGrid(ym) {
  const first = ym + "-01", lead = wdOf(first), n = daysInMonth(ym), cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= n; d++) cells.push(`${ym}-${pad(d)}`);
  while (cells.length % 7) cells.push(null);
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

export const monthTitle = ym => { const [y, m] = ym.split("-").map(Number); return `${MON[m - 1]} ${y}`; };
export const shortDate = s => { const d = parse(s); return `${d.getDate()} ${MON_S[d.getMonth()]}`; };
export const longDate = s => { const d = parse(s); return `${WD_L[wdOf(s)]}, ${d.getDate()} ${MON_G[d.getMonth()]}`; };

/* "Сегодня", "Вчера", "Завтра" or "10 ноября" */
export function dayTitle(s) {
  const n = diffDays(today(), s);
  if (n === 0) return "Сегодня";
  if (n === -1) return "Вчера";
  if (n === 1) return "Завтра";
  const d = parse(s);
  return `${d.getDate()} ${MON_G[d.getMonth()]}`;
}

export function greeting(h = new Date().getHours()) {
  if (h < 5) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}
