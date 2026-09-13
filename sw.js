/* Dessert run — offline shell.
   Caches the app itself so it opens with no signal. Data writes are queued
   in the page (see flushQueue in index.html), not here. */
const V = "dr-v1";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "https://fonts.googleapis.com/css2?family=Anuphan:wght@400;500;600&display=swap",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(V)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;                 // writes go straight through
  if (url.hostname.endsWith("supabase.co")) return;       // never cache data
  if (url.hostname.includes("tile.openstreetmap")) {      // map tiles: cache what we've seen
    e.respondWith(
      caches.open(V + "-tiles").then(c =>
        c.match(e.request).then(hit =>
          hit || fetch(e.request).then(r => { c.put(e.request, r.clone()); return r; })
                                 .catch(() => hit)))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit =>
      hit || fetch(e.request).then(r => {
        if (r && r.status === 200) {
          const copy = r.clone();
          caches.open(V).then(c => c.put(e.request, copy));
        }
        return r;
      }).catch(() => caches.match("./index.html")))
  );
});
