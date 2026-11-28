const shell = "corpo-shell-v4";
const assets = ["./","./app.js","./ui.js","./admin.js","./styles.css","./icon-192.png","./icon-512.png","./favicon.svg"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(shell).then((cache) => cache.addAll(assets)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) =>
  Promise.all(keys.filter((key) => key.startsWith("corpo-shell-") && key !== shell).map((key) => caches.delete(key)))
).then(() => self.clients.claim())));
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (event.request.method !== "GET" || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (!assets.some((path) => new URL(path, scope).pathname === url.pathname)) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
