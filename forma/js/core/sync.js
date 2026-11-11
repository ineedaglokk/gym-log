/* Keeps the journal on this device and in the account the same.

   Every local change marks its key as "dirty". A moment later the dirty keys go to the server and
   whatever other devices changed since the last exchange comes back — one request, POST /sync
   (see server/sync.js). Without a connection the dirty keys simply wait; nothing blocks the app.

   The same key changed here and in the account (a conflict): a day is merged (mergeDay), for
   everything else the account's value wins.

   Device-only records: "@sync" { cursor } — where the last exchange stopped; "@dirty" [keys]. */

import { getMeta, setMeta, onLocalChange, applyRemote, valueOf, localKeys, emit } from "./store.js";
import { api, signedIn, ApiError } from "./account.js";

const PUSH_DELAY = 2500;      /* a local change is sent this long after it was made */
const PULL_EVERY = 90000;     /* while the app is open, ask for other devices' changes this often */
const BATCH_KEYS = 100, BATCH_CHARS = 300000, MAX_ROUNDS = 40;

const dirty = new Map();      /* key → how many times it changed here since it was last sent */
let cursor = 0, running = null, again = false, timer = null, fails = 0, wired = false;
let info = { state: "idle", at: 0 };

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const saveDirty = () => setMeta("@dirty", dirty.size ? [...dirty.keys()] : null);
function setState(state) { info = { state, at: state === "ok" ? Date.now() : info.at }; emit("sync"); }

/* for the profile: state "idle" | "syncing" | "ok" | "offline" | "error", pending — keys not sent yet,
   at — when the last exchange succeeded */
export const syncInfo = () => ({ ...info, pending: dirty.size });

/* The same day changed on this device (mine) and in the account (theirs): nothing typed is lost.
   Food and exercises are united (for the same item this device's version wins), water takes the
   larger number, steps / sleep / weight take this device's value when it has one.
   A day deleted on one side and changed on the other stays. */
export function mergeDay(mine, theirs) {
  if (!mine || !theirs) return mine || theirs || null;
  const out = { ...theirs, ...mine };
  const own = new Map((mine.food || []).map(i => [i.id, i])), had = new Set((theirs.food || []).map(i => i.id));
  out.food = [...(theirs.food || []).map(i => own.get(i.id) || i), ...(mine.food || []).filter(i => !had.has(i.id))];
  out.water = Math.max(mine.water || 0, theirs.water || 0);
  for (const k of ["steps", "sleep", "bw"]) { const v = mine[k] ?? theirs[k]; if (v == null) delete out[k]; else out[k] = v; }
  if (mine.w && theirs.w) {
    out.w = { ...theirs.w, ...mine.w, ex: { ...(theirs.w.ex || {}), ...(mine.w.ex || {}) } };
    const done = new Set(Object.keys(out.w.ex)), sk = [...new Set([...(theirs.w.sk || []), ...(mine.w.sk || [])])].filter(id => !done.has(id));
    if (sk.length) out.w.sk = sk; else delete out.w.sk;
  }
  return out;
}

function mark(key) {
  const fresh = !dirty.has(key);
  dirty.set(key, (dirty.get(key) || 0) + 1);
  if (fresh) saveDirty();
  if (signedIn()) schedule(PUSH_DELAY);
}
function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(syncNow, ms);
  if (timer.unref) timer.unref();   /* Node (tests): a waiting timer must not keep the process alive */
}

/* the next portion of dirty keys: [[key, change counter]], limited by count and by size */
function nextBatch() {
  const out = [];
  let chars = 0;
  for (const [k, n] of dirty) {
    const size = JSON.stringify(valueOf(k)).length;
    if (out.length && (out.length >= BATCH_KEYS || chars + size > BATCH_CHARS)) break;
    out.push([k, n]); chars += size;
  }
  return out;
}

/* one exchange with the server */
async function exchange() {
  const batch = nextBatch();
  const res = await api("/sync", { since: cursor, changes: batch.map(([k]) => ({ k, v: valueOf(k) })) });
  const topics = new Set(), refused = new Set(res.conflicts);
  for (const c of res.changes) {
    if (!dirty.has(c.k)) { topics.add(applyRemote(c.k, c.v)); continue; }
    /* changed both here and in the account */
    if (c.k.startsWith("d:")) {
      const merged = mergeDay(valueOf(c.k), c.v);
      topics.add(applyRemote(c.k, merged));
      if (same(merged, c.v)) dirty.delete(c.k); else dirty.set(c.k, dirty.get(c.k) + 1);   /* the merged day is sent next */
    } else {
      topics.add(applyRemote(c.k, c.v));
      dirty.delete(c.k);
    }
  }
  /* a sent key is clean now — unless the server refused it or it changed again while the request was on its way */
  for (const [k, n] of batch) if (!refused.has(k) && dirty.get(k) === n) dirty.delete(k);
  cursor = res.cursor;
  setMeta("@sync", { cursor });
  saveDirty();
  topics.forEach(t => { if (t) emit(t); });
}

/* Sends what is dirty and takes what is new. Resolves true when the device and the account agree,
   false when the server could not be reached (the dirty keys stay and are retried later). */
export function syncNow() {
  if (!signedIn()) return Promise.resolve(false);
  if (running) { again = true; return running; }
  clearTimeout(timer);
  running = (async () => {
    setState("syncing");
    try {
      let rounds = 0;
      do { again = false; await exchange(); } while ((dirty.size || again) && ++rounds < MAX_ROUNDS && signedIn());
      fails = 0;
      setState("ok");
      if (dirty.size && signedIn()) schedule(PUSH_DELAY);   /* a very long queue continues in the next run */
      return true;
    } catch (err) {
      const offline = err instanceof ApiError && err.status === 0, ended = !signedIn();
      /* a session that ended (401) is handled by api(): the app goes to the sign-in screen, nothing is retried */
      if (!offline && !ended) console.error("sync failed", err);
      setState(offline ? "offline" : ended ? "idle" : "error");
      if (!ended && dirty.size) schedule(Math.min(300000, 5000 * 2 ** fails++));
      return false;
    } finally { running = null; }
  })();
  return running;
}

/* Called at boot and again whenever the device's storage was replaced (sign-in, sign-out): reads
   where the last exchange stopped and starts listening to local changes. In a browser it also syncs
   when the app comes back to the screen, when the connection returns, and every PULL_EVERY while open.
   It does not sync by itself: call syncNow(). */
export function startSync() {
  cursor = (getMeta("@sync") || {}).cursor || 0;
  dirty.clear();
  (getMeta("@dirty") || []).forEach(k => dirty.set(k, 1));
  fails = 0; info = { state: "idle", at: 0 };
  onLocalChange(mark);
  if (!wired && typeof document !== "undefined") {
    wired = true;
    addEventListener("online", () => syncNow());
    /* coming back: take what other devices wrote; leaving: send what is not sent yet */
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" || dirty.size) syncNow(); });
    setInterval(() => { if (document.visibilityState === "visible") syncNow(); }, PULL_EVERY);
  }
}

/* records made on this device before it had an account go into the account on the first exchange */
export function adoptLocal() {
  if (getMeta("@sync")) return;
  localKeys().forEach(k => { if (!dirty.has(k)) dirty.set(k, 1); });
  saveDirty();
}
