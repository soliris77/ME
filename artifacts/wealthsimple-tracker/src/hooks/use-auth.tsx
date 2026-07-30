/**
 * Authentification — état de session côté client
 * ─────────────────────────────────────────────────────────────────────────
 * Source de vérité unique : GET /api/auth/me (session cookie httpOnly gérée
 * par le navigateur, jamais lue en JS). Le contexte expose l'état courant et
 * les actions login/logout ; AuthGuard (dans App.tsx) s'en sert pour
 * rediriger vers /login toute route protégée sans session active.
 */
import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface AuthState {
  authenticated: boolean;
  needsSetup: boolean;
  isLoading: boolean;
  login: (password: string) => Promise<void>;
  loginError: string | null;
  isLoggingIn: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Fetch avec timeout — évite un écran de chargement infini si l'API est lente
 * à démarrer (typiquement après un remix : build + schema push prennent
 * quelques secondes). Après le délai, la promesse est rejetée proprement et
 * React Query sort de l'état "loading".
 */
function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function fetchMe(): Promise<{ authenticated: boolean }> {
  try {
    const res = await fetchWithTimeout(`${BASE}/api/auth/me`, { credentials: "same-origin" });
    if (!res.ok) return { authenticated: false };
    return res.json();
  } catch {
    // API indisponible (timeout, réseau, etc.) → non authentifié
    return { authenticated: false };
  }
}

async function fetchNeedsSetup(): Promise<{ needsSetup: boolean }> {
  try {
    const res = await fetchWithTimeout(`${BASE}/api/auth/needs-setup`, { credentials: "same-origin" });
    if (!res.ok) return { needsSetup: false };
    return res.json();
  } catch {
    return { needsSetup: false };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  const meQ = useQuery({
    queryKey: ["auth-me"],
    queryFn: fetchMe,
    staleTime: 30_000,
    retry: false,
  });

  const setupQ = useQuery({
    queryKey: ["auth-needs-setup"],
    queryFn: fetchNeedsSetup,
    staleTime: Infinity, // une fois configuré, pas besoin de re-vérifier
    retry: false,
    // Ne re-vérifier que si l'app n'est pas encore authentifiée
    enabled: !meQ.data?.authenticated,
  });

  const loginMut = useMutation({
    mutationFn: async (password: string) => {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error ?? "Erreur de connexion.");
      }
      return payload;
    },
    onSuccess: () => {
      qc.setQueryData(["auth-me"], { authenticated: true });
    },
  });

  const logoutMut = useMutation({
    mutationFn: async () => {
      await fetch(`${BASE}/api/auth/logout`, { method: "POST", credentials: "same-origin" });
    },
    onSuccess: () => {
      qc.setQueryData(["auth-me"], { authenticated: false });
      qc.clear();
    },
  });

  const value: AuthState = {
    authenticated: meQ.data?.authenticated ?? false,
    needsSetup: setupQ.data?.needsSetup ?? false,
    isLoading: meQ.isLoading || setupQ.isLoading,
    login: async (password: string) => {
      await loginMut.mutateAsync(password);
    },
    loginError: loginMut.error ? String((loginMut.error as Error).message) : null,
    isLoggingIn: loginMut.isPending,
    logout: () => logoutMut.mutate(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé à l'intérieur de <AuthProvider>.");
  return ctx;
}
