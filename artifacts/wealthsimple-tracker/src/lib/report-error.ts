const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Centralise toute erreur client vers le serveur (journalisée via pino, donc
 * consultable dans les logs du workflow/déploiement) — best-effort, ne doit
 * jamais elle-même faire planter la page qu'elle documente.
 */
export function reportClientError(source: string, message: string, stack?: string, pageName?: string) {
  try {
    fetch(`${BASE}/api/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, message, stack, pageName, url: window.location.href }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // best-effort — jamais bloquant
  }
}
