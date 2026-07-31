import { createRoot } from "react-dom/client";
import { Component, type ReactNode } from "react";
import App from "./App";
import { reportClientError } from "@/lib/report-error";
import "./index.css";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function showFatalError(title: string, message: string, stack?: string) {
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = "";
  const box = document.createElement("div");
  box.style.cssText = "padding:24px;font-family:monospace;white-space:pre-wrap;color:#c0392b;background:#fff;";
  box.innerHTML = `<h2>${title}</h2><p>${message}</p><pre style="font-size:12px;opacity:0.7">${stack || ""}</pre>`;
  root.appendChild(box);
}

window.addEventListener("error", (e) => {
  reportClientError("window.error", e.message, e.error?.stack);
  showFatalError("Erreur JS (window.error)", e.message, e.error?.stack);
});

window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason;
  const message = reason?.message || String(reason);
  reportClientError("unhandledrejection", message, reason?.stack);
  showFatalError(
    "Erreur JS (promesse rejetée)",
    message,
    reason?.stack
  );
});

// Enregistre le service worker (installation PWA + cache offline léger +
// alertes prix en arrière-plan). Non bloquant, échoue silencieusement si non
// supporté. Enregistré aussi en dev pour que les alertes en arrière-plan
// fonctionnent dans l'aperçu.
// Convertit la clé publique VAPID (base64 URL-safe) au format attendu par
// pushManager.subscribe (Uint8Array).
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Abonne ce navigateur au Web Push (notifications même navigateur fermé).
// Silencieux : ne demande jamais la permission ici — elle est demandée depuis
// la page Alertes ; on s'abonne seulement si elle est déjà accordée.
async function subscribeToWebPush(reg: ServiceWorkerRegistration) {
  try {
    if (!("PushManager" in window) || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await (async () => {
        const res = await fetch("/api/push/vapid-public-key", { credentials: "same-origin" });
        if (!res.ok) return null; // non connecté — on réessaiera au prochain chargement
        const { publicKey } = await res.json();
        return reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
      })());
    if (!sub) return;

    // (Ré)envoie l'abonnement au serveur — idempotent (upsert par endpoint).
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(sub.toJSON()),
    });
  } catch {
    /* push non supporté ou refusé — les autres canaux d'alerte restent actifs */
  }
}

// Ré-essaie l'abonnement quand la permission vient d'être accordée depuis la
// page Alertes (événement émis par le bouton d'activation des notifications).
window.addEventListener("soliris:notifications-granted", async () => {
  try {
    const reg = await navigator.serviceWorker.ready;
    await subscribeToWebPush(reg);
  } catch {
    /* ignoré */
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register(`${BASE}/sw.js`);
      // Démarre le polling des alertes dans le SW (60 s)
      (reg.active ?? reg.waiting ?? reg.installing)?.postMessage({ type: "start-alert-polling" });
      navigator.serviceWorker.ready.then((r) => {
        r.active?.postMessage({ type: "start-alert-polling" });
      });
      // Periodic Background Sync — réveille le SW même onglet fermé
      // (Chrome/Edge, PWA installée). Ignoré silencieusement ailleurs.
      const anyReg = reg as ServiceWorkerRegistration & {
        periodicSync?: { register: (tag: string, opts: { minInterval: number }) => Promise<void> };
      };
      if (anyReg.periodicSync) {
        anyReg.periodicSync.register("soliris-check-alerts", { minInterval: 60_000 }).catch(() => {});
      }
      // Web Push — notifications même navigateur fermé (si permission déjà accordée)
      navigator.serviceWorker.ready.then((r) => subscribeToWebPush(r));
    } catch {
      /* SW non supporté ou enregistrement refusé — l'app fonctionne sans */
    }
  });
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    reportClientError("react-root-boundary", error.message, error.stack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "monospace", whiteSpace: "pre-wrap", color: "#c0392b" }}>
          <h2>Erreur React (render)</h2>
          <p>{this.state.error.message}</p>
          <pre style={{ fontSize: 12, opacity: 0.7 }}>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

try {
  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
} catch (e: any) {
  showFatalError("Erreur au démarrage (createRoot)", e?.message || String(e), e?.stack);
}
