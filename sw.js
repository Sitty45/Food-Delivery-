/* สั่ง/ส่ง — offline shell + phone notifications.
   The page itself is network-first so a new deploy always wins; the cached copy
   is only used when the network fails. Fonts, libraries and map tiles stay
   cache-first because they don't change. */
const V = "dr-v4";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600&display=swap",
  "https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.47.0/tabler-icons.min.css",
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
      .then(ks => Promise.all(ks.filter(k => k !== V && k !== V + "-tiles").map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isPage = req =>
  req.mode === "navigate" ||
  (req.headers.get("accept") || "").includes("text/html");

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.hostname.endsWith("supabase.co")) return;

  // The app itself: always try the network, so a redeploy lands immediately.
  if (isPage(e.request)) {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          const copy = r.clone();
          caches.open(V).then(c => c.put("./index.html", copy));
          return r;
        })
        .catch(() => caches.match("./index.html").then(hit => hit || caches.match("./")))
    );
    return;
  }

  // Map tiles: keep whatever we've already seen.
  if (url.hostname.includes("tile.openstreetmap")) {
    e.respondWith(
      caches.open(V + "-tiles").then(c =>
        c.match(e.request).then(hit =>
          hit || fetch(e.request).then(r => { c.put(e.request, r.clone()); return r; })
                                 .catch(() => hit)))
    );
    return;
  }

  // Fonts, libraries, icons: cache-first, they don't change.
  e.respondWith(
    caches.match(e.request).then(hit =>
      hit || fetch(e.request).then(r => {
        if (r && r.status === 200) {
          const copy = r.clone();
          caches.open(V).then(c => c.put(e.request, copy));
        }
        return r;
      }))
  );
});

/* ---------- phone notifications ----------
   Every push is shown (iPhone requires it). The app icon shows how many are waiting;
   opening the app clears it. Tapping a notification opens the app on the right tab. */
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : "" }; }
  const title = d.title || "สั่ง/ส่ง";
  const opts = { body: d.body || "", icon: "icon-192.png", badge: "icon-192.png", lang: d.lang || "th",
                 data: { url: d.url || "./" } };
  if (d.tag) { opts.tag = d.tag; opts.renotify = true; }
  e.waitUntil(
    self.registration.showNotification(title, opts)
      .then(() => self.registration.getNotifications())
      .then(list => (self.navigator && self.navigator.setAppBadge) ? self.navigator.setAppBadge(list.length).catch(() => {}) : null)
      .catch(() => {})
  );
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(ws => {
      for (const w of ws) {
        if ("focus" in w) { w.postMessage({ type: "open", url }); return w.focus(); }
      }
      return self.clients.openWindow(url);
    })
  );
});
