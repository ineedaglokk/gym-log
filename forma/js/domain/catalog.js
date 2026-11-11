/* Exercise library built from shared/cat.js (window.CAT — the same catalog the Shlyopa mini app uses:
   1045 exercises, 11 muscle groups, equipment, photo names, technique pages on fitpush.ru).
   Ids are a hash of the name (SID), exactly as in the mini app, so programs stay compatible. */

const CAT = globalThis.CAT || { g: [], e: [], x: [], m: [] };

export const GROUPS = CAT.g;
export const EQUIP = CAT.e;
export const UNITS = ["кг", "кг в руке", "свой вес + кг", "секунды", "минуты"];
/* colour of a muscle group (hue), used for thumbnails without a photo and for charts */
export const GROUP_HUE = [212, 262, 12, 38, 330, 288, 168, 190, 142, 232, 52];

export const norm1 = t => String(t || "").toLowerCase().replace(/ё/g, "е");
const hash36 = t => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
export const SID = name => "s" + hash36(name);

/* sensible defaults by muscle group and equipment: sets, rep range, weight step, unit */
export function catDefaults(g, eq, u) {
  if (u === 2) return { sets: 1, lo: 10, hi: 20, step: 0, unit: "минуты" };
  if (u === 1) return { sets: 3, lo: 20, hi: 45, step: 0, unit: "секунды" };
  const small = ["Плечи", "Бицепс", "Трицепс", "Пресс", "Икры", "Предплечья"].includes(g);
  const rep = g === "Икры" || g === "Предплечья" ? [12, 15] : g === "Пресс" || g === "Бицепс" || g === "Трицепс" ? [10, 15] : g === "Плечи" ? [10, 12] : g === "Кардио" ? [15, 25] : [8, 12];
  const body = ["Свой вес", "Турник/брусья", "TRX", "Коврик", "Скамья", "Резинка", "Инвентарь"].includes(eq);
  const hand = eq === "Гантели" || eq === "Гиря";
  const step = body ? 2.5 : hand ? (small ? 1 : 2) : eq === "Штанга" ? (small ? 2.5 : 5) : g === "Ноги" ? 5 : 2.5;
  return { sets: 3, lo: rep[0], hi: rep[1], step, unit: body ? "свой вес + кг" : hand ? "кг в руке" : "кг" };
}

export const LIB = [], LIBMAP = {};
CAT.x.forEach(r => {
  const g = GROUPS[r[1]] || "", eq = EQUIP[r[2]] || "";
  const x = { id: SID(r[0]), name: r[0], group: g, gi: r[1], equip: eq, ei: r[2], img: r[4] || null, slug: r[5] || null, sub: r[6] || "", ...catDefaults(g, eq, r[3]) };
  x.sk = norm1(`${x.name} ${eq} ${g} ${x.sub}`);
  LIBMAP[x.id] = x; LIB.push(x);
});
export const BYNAME = {};
LIB.forEach(x => { BYNAME[norm1(x.name)] = x.id; });

export const photoOf = x => (x && x.img ? `img/ex/${x.img}_0.jpg` : null);
export const techUrl = x => (x && x.slug ? `https://fitpush.ru/exercises/${x.slug}/` : null);

/* muscle group index of a program exercise: from the catalog, or the one chosen for an own exercise */
export function groupIndex(e) {
  const x = e && e.lib ? LIBMAP[e.lib] : null;
  if (x) return x.gi;
  return e && Number.isInteger(e.g) && e.g >= 0 && e.g < GROUPS.length ? e.g : -1;
}

/* search by words (every word must be found), optional group / equipment filter; photos first */
export function searchLib(q, { group = -1, equip = -1, limit = 60 } = {}) {
  const words = norm1(q).split(/\s+/).filter(Boolean);
  const out = [];
  for (const x of LIB) {
    if (group >= 0 && x.gi !== group) continue;
    if (equip >= 0 && x.ei !== equip) continue;
    if (words.length && !words.every(w => x.sk.includes(w))) continue;
    out.push(x);
  }
  const starts = x => (words.length && norm1(x.name).startsWith(words[0]) ? 0 : 1);
  out.sort((a, b) => starts(a) - starts(b) || (a.img ? 0 : 1) - (b.img ? 0 : 1) || a.name.localeCompare(b.name, "ru"));
  return { total: out.length, items: out.slice(0, limit) };
}
