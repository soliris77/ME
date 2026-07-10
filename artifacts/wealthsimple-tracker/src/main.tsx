import { createRoot } from "react-dom/client";
import { Component, type ReactNode } from "react";
import App from "./App";
import "./index.css";

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
  showFatalError("Erreur JS (window.error)", e.message, e.error?.stack);
});

window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason;
  showFatalError(
    "Erreur JS (promesse rejetée)",
    reason?.message || String(reason),
    reason?.stack
  );
});

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
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
