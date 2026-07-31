// Service worker Soliris Market :
//  1. Installabilité PWA + cache léger du shell applicatif (network-first,
//     jamais de cache pour /api/* — données de marché toujours fraîches).
//  2. Alertes : vérification de /api/alerts avec notification pour chaque
//     alerte nouvellement déclenchée. Le chemin FIABLE en arrière-plan est le
//     watcher de la page (App.tsx, poll 60 s tant qu'un onglet est ouvert,
//     même inactif). Ici le SW ajoute deux compléments opportunistes :
//     - un timer tant que le SW est vivant (le navigateur peut le suspendre
//       à tout moment — ce n'est PAS une garantie de poll 60 s) ;
//     - Periodic Background Sync (Chrome/Edge avec PWA installée uniquement,
//       fréquence décidée par le navigateur) qui peut réveiller le SW même
//       onglet fermé. Les tags de notification sont partagés avec la page
//       pour ne jamais afficher de doublon.
const CACHE_NAME = "soliris-market-shell-v2";
const SHELL_ASSETS = ["/", "/manifest.json", "/favicon-32.png", "/icon-192.png"];

const ALERT_POLL_INTERVAL_MS = 60_000;
const DB_NAME = "soliris-sw";
const DB_STORE = "kv";
const SEEN_KEY = "seen-triggered-alert-ids";

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
  startAlertPolling();
});

// ---------------------------------------------------------------------------
// Cache shell — network-first, /api/* exclus
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Persistance légère (IndexedDB) — mémorise les alertes déjà notifiées pour
// ne jamais notifier deux fois, même si le SW est tué puis relancé.
// ---------------------------------------------------------------------------
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kvGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kvSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// Vérification des alertes + notifications
// ---------------------------------------------------------------------------
function formatAlertBody(a) {
  if (a.alertType === "pattern") {
    return `Pattern ${a.patternSignal || "détecté"} sur ${a.symbol}`;
  }
  if (a.alertType === "signal") {
    return `Signal technique ${a.patternSignal || "composite"} sur ${a.symbol}`;
  }
  const dir = a.condition === "above" ? "au-dessus" : "en dessous";
  const target = a.targetPrice != null ? ` de ${a.targetPrice} $` : "";
  return `${a.symbol} est passé ${dir}${target}`;
}

async function checkAlerts() {
  let alerts;
  try {
    const res = await fetch("/api/alerts", { credentials: "same-origin" });
    if (!res.ok) return; // non connecté ou API indisponible — on réessaiera
    alerts = await res.json();
  } catch {
    return; // hors-ligne — on réessaiera au prochain tick
  }
  if (!Array.isArray(alerts)) return;

  const triggered = alerts.filter((a) => !a.active && a.triggeredAt);
  const seenRaw = await kvGet(SEEN_KEY).catch(() => null);
  const firstRun = !Array.isArray(seenRaw);
  const seen = new Set(firstRun ? [] : seenRaw);
  const fresh = firstRun ? [] : triggered.filter((a) => !seen.has(a.id));

  for (const a of fresh) {
    try {
      await self.registration.showNotification(`🔔 Alerte ${a.symbol}`, {
        body: formatAlertBody(a),
        icon: "/icon-192.png",
        badge: "/favicon-32.png",
        tag: `soliris-alert-${a.id}`,
        data: { url: "/alerts" },
      });
    } catch {
      // Permission absente ou plateforme sans notifications — ignoré
    }
  }

  // Au premier passage on mémorise l'existant sans notifier (évite une rafale
  // de notifications historiques à l'installation).
  const nextSeen = triggered.map((a) => a.id);
  await kvSet(SEEN_KEY, nextSeen).catch(() => {});
}

// Timer best-effort tant que le SW est vivant. Le navigateur termine les SW
// inactifs : ce timer ne survit ni à la suspension ni à un onglet fermé — la
// couverture fiable vient du watcher de la page (App.tsx) et, quand dispo,
// de periodicsync ci-dessous.
let pollTimer = null;
function startAlertPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => { checkAlerts(); }, ALERT_POLL_INTERVAL_MS);
  checkAlerts();
}
startAlertPolling();

// Periodic Background Sync — amélioration opportuniste : uniquement
// Chrome/Edge avec la PWA installée, et la fréquence réelle est décidée par
// le navigateur (souvent bien plus espacée que le minimum demandé).
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "soliris-check-alerts") {
    event.waitUntil(checkAlerts());
  }
});

// Messages depuis la page (démarrage explicite / vérification immédiate)
self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;
  if (type === "start-alert-polling") startAlertPolling();
  if (type === "check-alerts-now") checkAlerts();
});

// Clic sur une notification → focus (ou ouverture) de la page Alertes
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/alerts";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(url).catch(() => {});
          return;
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
