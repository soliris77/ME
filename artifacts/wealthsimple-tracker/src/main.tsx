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

// Enregistre le service worker (installation PWA + cache offline léger des
// pages déjà visitées). Non bloquant, échoue silencieusement si non supporté.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${BASE}/sw.js`).catch(() => {});
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
