/* Offline cache for FORMA. Code and styles: network first (a fresh version always wins, the cache is the
   fallback without a connection). Exercise photos and fonts: cache first — they never change.
   Other origins' API calls (Open Food Facts, the FORMA server) are not touched. */

const VERSION = "forma-v1";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png",
  "css/base.css", "css/components.css", "css/screens-day.css", "css/screens-gym.css", "css/screens-food.css", "css/screens-more.css",
  "shared/cat.js", "shared/progress.js", "js/main.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const isStatic = url => /\/img\/ex\//.test(url.pathname) || url.hostname === "fonts.gstatic.com";
const isFontCss = url => url.hostname === "fonts.googleapis.com";

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  const own = url.origin === self.location.origin;
  if (!own && !isStatic(url) && !isFontCss(url)) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (isStatic(url)) {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") cache.put(req, res.clone());
      return res;
    }
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: own });
      if (hit) return hit;
      throw err;
    }
  })());
});
