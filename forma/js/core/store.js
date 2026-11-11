/* App state and persistence. Everything lives in memory (S) and is written through to the storage
   backend key by key, in order. Screens read S directly and change it only through save() / updateDay().

   Keys in storage:
     profile, program, settings, foods, favs, recent, gone, chats — one value each (see DEFAULTS)
     d:YYYY-MM-DD — one day:
       { v:1,
         w:    { id: workoutId, ex: { <exerciseId>: { w:[kg…], r:[reps…], wu:{w:[],r:[]}, nt:"note" } }, sk:[skipped ids] },
         food: [ { id, m:"b|l|d|s", n:name, g:grams, k,p,f,c (for this portion), fid?, rid?, t:"HH:MM" } ],
         water: ml, steps: n, sleep: hours, bw: kg }
   The exercise record {w, r, wu, nt} and the program shape are the same as in the Shlyopa mini app,
   so shared/progress.js works on them as is and a journal can be moved over later.

   Keys that start with "@" are device-only records (the sign-in, the sync cursor): they are never
   exported, never sent to the account, and are read and written with getMeta() / setMeta().
   Every local change is reported to onLocalChange() — the sync layer (core/sync.js) listens there. */

import { today } from "./dates.js";

const clone = v => structuredClone(v);

export const DEFAULTS = {
  profile: null,
  program: null,
  settings: { theme: "auto", trackers: { water: true, sleep: true, steps: true, weight: true }, glass: 250 },
  foods: [],
  favs: { recipes: [], foods: [] },
  recent: [],
  gone: {},
  chats: { trainer: [], nutri: [] },
};
const KEYS = Object.keys(DEFAULTS);

export const S = { ready: false, days: new Map(), ui: { date: today() }, ...clone(DEFAULTS) };

let be = null, chain = Promise.resolve(), errorHandler = null, changeHook = null;
const listeners = new Set(), META = new Map();

export const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const emit = topic => listeners.forEach(fn => fn(topic));
export const onSaveError = fn => { errorHandler = fn; };
/* resolves when every write queued so far has reached the storage */
export const flush = () => chain;

function write(op) {
  chain = chain.then(op).catch(err => { console.error("save failed", err); if (errorHandler) errorHandler(err); });
  return chain;
}
/* fn(key) is called before every local change of a journal key is written */
export const onLocalChange = fn => { changeHook = fn; };
function put(key, value) { if (changeHook) changeHook(key); write(() => be.put(key, clone(value))); }
function del(key) { if (changeHook) changeHook(key); write(() => be.del(key)); }

/* device-only records */
export const getMeta = key => META.get(key) ?? null;
export function setMeta(key, value) {
  if (value == null) { META.delete(key); write(() => be.del(key)); }
  else { META.set(key, value); write(() => be.put(key, clone(value))); }
}

/* settings saved by an older version keep working: missing fields come from DEFAULTS */
const withDefaults = (def, v) =>
  def && typeof def === "object" && !Array.isArray(def) && v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries([...new Set([...Object.keys(def), ...Object.keys(v)])].map(k => [k, k in v ? withDefaults(def[k], v[k]) : clone(def[k])]))
    : v;

export async function init(backend) {
  be = backend;
  S.days = new Map();
  META.clear();
  KEYS.forEach(k => { S[k] = clone(DEFAULTS[k]); });
  for (const [k, v] of await be.all()) {
    if (k.startsWith("d:")) S.days.set(k.slice(2), v);
    else if (k.startsWith("@")) META.set(k, v);
    else if (KEYS.includes(k)) S[k] = withDefaults(DEFAULTS[k], v);
  }
  S.ready = true;
}

export function save(key, value) {
  if (!KEYS.includes(key)) throw new Error("unknown store key: " + key);
  S[key] = value;
  put(key, value);
  emit(key);
}

/* ---------- days ---------- */
export const blankDay = () => ({ v: 1, food: [], water: 0 });
export const getDay = date => S.days.get(date) || blankDay();
export const hasWorkout = d => !!(d && d.w && d.w.ex && Object.values(d.w.ex).some(x => x && Array.isArray(x.r) && x.r.some(r => r != null && r > 0)));

export function isEmptyDay(d) {
  const w = d.w;
  const wEmpty = !w || ((!w.ex || !Object.keys(w.ex).length) && !(w.sk && w.sk.length));
  return wEmpty && !(d.food && d.food.length) && !d.water && d.steps == null && d.sleep == null && d.bw == null;
}

/* fn mutates a copy of the day; an empty day is removed from storage */
export function updateDay(date, fn, { silent = false } = {}) {
  const d = clone(getDay(date));
  fn(d);
  if (isEmptyDay(d)) { S.days.delete(date); del("d:" + date); }
  else { S.days.set(date, d); put("d:" + date, d); }
  if (!silent) emit("day");
  return d;
}

export function setDate(date) {
  if (S.ui.date === date) return;
  S.ui.date = date;
  emit("date");
}

/* ---------- backup ---------- */
export function exportData() {
  return {
    app: "forma", v: 1, at: new Date().toISOString(),
    data: { profile: S.profile, program: S.program, settings: S.settings, foods: S.foods, favs: S.favs, recent: S.recent, gone: S.gone, days: Object.fromEntries(S.days) },
  };
}

/* mode "merge": days and settings already on this device win, missing ones are added.
   mode "replace": the device becomes a copy of the backup. Returns how many days were written. */
export async function importData(obj, mode = "merge") {
  if (!obj || obj.app !== "forma" || !obj.data || typeof obj.data !== "object") throw new Error("Это не копия ФОРМЫ");
  const src = obj.data, days = src.days && typeof src.days === "object" ? src.days : {};
  let written = 0;
  if (mode === "replace") {
    for (const date of [...S.days.keys()]) { S.days.delete(date); del("d:" + date); }
  }
  for (const [date, rec] of Object.entries(days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !rec || typeof rec !== "object") continue;
    if (mode === "merge" && S.days.has(date)) continue;
    S.days.set(date, rec); put("d:" + date, rec); written++;
  }
  for (const k of KEYS) {
    if (k === "chats" || !(k in src) || src[k] == null) continue;
    const empty = S[k] == null || (Array.isArray(S[k]) && !S[k].length) || (k === "gone" && !Object.keys(S[k]).length);
    if (mode === "replace" || empty) {
      const v = withDefaults(DEFAULTS[k], src[k]);
      S[k] = v; put(k, v);
    }
  }
  await flush();
  emit("import");
  return written;
}

/* removes the whole journal — here and, through the sync layer, in the account. The sign-in stays. */
export async function wipe() {
  for (const date of [...S.days.keys()]) { S.days.delete(date); del("d:" + date); }
  for (const k of KEYS) { S[k] = clone(DEFAULTS[k]); del(k); }
  await flush();
  emit("import");
}

/* forgets everything on this device, the sign-in included (signing out). The account's copy is not touched. */
export async function resetLocal() {
  await flush();
  await be.clear();
  await init(be);
  emit("import");
}

/* ---------- for the sync layer ---------- */
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/* the current value of a journal key, null when there is none */
export const valueOf = key => (key.startsWith("d:") ? S.days.get(key.slice(2)) : S[key]) ?? null;
/* the journal keys this device holds (a key still at its default value does not count) */
export const localKeys = () => [...KEYS.filter(k => !same(S[k], DEFAULTS[k])), ...[...S.days.keys()].map(d => "d:" + d)];

/* a value that came from the account: goes to memory and storage without being reported as a local
   change. null = the key was deleted there. Returns the topic to emit once everything is applied. */
export function applyRemote(key, value) {
  if (key.startsWith("d:")) {
    const date = key.slice(2);
    if (value == null) { S.days.delete(date); write(() => be.del(key)); }
    else { S.days.set(date, value); write(() => be.put(key, clone(value))); }
    return "day";
  }
  if (!KEYS.includes(key)) return null;
  if (value == null) { S[key] = clone(DEFAULTS[key]); write(() => be.del(key)); }
  else { S[key] = withDefaults(DEFAULTS[key], value); write(() => be.put(key, clone(value))); }
  return key;
}
