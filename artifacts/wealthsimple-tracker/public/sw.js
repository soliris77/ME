// Service worker minimal — installabilité PWA + mise en cache légère du shell
// applicatif pour un chargement plus rapide hors-ligne. Volontairement
// simple : aucune notification push, aucun cache des données de marché
// (toujours en temps réel via l'API, jamais servies depuis le cache).
const CACHE_NAME = "soliris-market-shell-v1";
const SHELL_ASSETS = ["/", "/manifest.json", "/favicon-32.png", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Stratégie "network-first" : on tente toujours le réseau (données/marché en
// temps réel), on ne retombe sur le cache que si la requête réseau échoue
// (hors-ligne) — et jamais pour les appels /api/* qui doivent rester frais
// ou échouer explicitement plutôt que servir des données de marché périmées.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Promise.reject("offline-and-uncached")))
  );
});
