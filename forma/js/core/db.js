/* Storage backends with one shape: all() → [[key, value]…], put(key, value), del(key), clear().
   The app uses IndexedDB (one key-value store); localStorage is the fallback when IndexedDB is not
   available (some private modes); memory() is for tests. All methods return promises. */

const DB_NAME = "forma", STORE = "kv";

export function indexedBackend() {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const rq = indexedDB.open(DB_NAME, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
    rq.onblocked = () => rej(new Error("IndexedDB is blocked"));
  }));
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(STORE, mode), out = fn(t.objectStore(STORE));
      t.oncomplete = () => res(out && "result" in out ? out.result : undefined);
      t.onerror = t.onabort = () => rej(t.error || new Error("IndexedDB write failed"));
    });
  };
  return {
    kind: "indexeddb",
    async all() {
      const db = await open();
      return new Promise((res, rej) => {
        const out = [], rq = db.transaction(STORE, "readonly").objectStore(STORE).openCursor();
        rq.onsuccess = () => { const c = rq.result; if (c) { out.push([c.key, c.value]); c.continue(); } else res(out); };
        rq.onerror = () => rej(rq.error);
      });
    },
    put: (k, v) => tx("readwrite", s => s.put(v, k)),
    del: k => tx("readwrite", s => s.delete(k)),
    clear: () => tx("readwrite", s => s.clear()),
  };
}

export function localBackend(prefix = "forma:") {
  const ls = globalThis.localStorage;
  return {
    kind: "localstorage",
    async all() {
      const out = [];
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k.startsWith(prefix)) out.push([k.slice(prefix.length), JSON.parse(ls.getItem(k))]);
      }
      return out;
    },
    async put(k, v) { ls.setItem(prefix + k, JSON.stringify(v)); },
    async del(k) { ls.removeItem(prefix + k); },
    async clear() { Object.keys(ls).filter(k => k.startsWith(prefix)).forEach(k => ls.removeItem(k)); },
  };
}

export function memoryBackend(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    kind: "memory", map: m,
    async all() { return [...m.entries()].map(([k, v]) => [k, structuredClone(v)]); },
    async put(k, v) { m.set(k, structuredClone(v)); },
    async del(k) { m.delete(k); },
    async clear() { m.clear(); },
  };
}

/* the best backend this browser has; never throws */
export async function openBackend() {
  if (globalThis.indexedDB) {
    try { const b = indexedBackend(); await b.all(); return b; } catch (e) { console.warn("IndexedDB unavailable, using localStorage", e); }
  }
  try { globalThis.localStorage.setItem("forma:probe", "1"); globalThis.localStorage.removeItem("forma:probe"); return localBackend(); }
  catch (e) { console.warn("localStorage unavailable, data lives until the tab closes", e); return memoryBackend(); }
}
