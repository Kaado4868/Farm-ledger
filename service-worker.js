const CACHE_NAME = "farm-ledger-v16";
const BASE = "/Farm-ledger/";
const APP_SHELL = [
  BASE,
  BASE + "index.html",
  BASE + "manifest.webmanifest",
  BASE + "icon-192.png",
  BASE + "icon-512.png",
  BASE + "icon-512-maskable.png",
  BASE + "apple-touch-icon-180.png",
  BASE + "css/farm-ledger.css",
  BASE + "js/app.js",
  BASE + "js/pwa.js",
  BASE + "index.html",
  BASE + "dashboard.html",
  BASE + "manage.html",
  BASE + "chat.html",
  BASE + "admin.html",
  BASE + "notifications.html",
  BASE + "admin-chat.html",
  BASE + "add-record.html",
  BASE + "handover.html"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith("farm-ledger-") && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(BASE)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, {cache:"no-cache"})
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(BASE + "index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match(BASE + "index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
