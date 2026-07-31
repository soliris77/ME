/**
 * SpotifyWidget — lecteur Spotify compact intégré dans la sidebar.
 *
 * États :
 *   checking      → montage, vérification silencieuse
 *   disconnected  → pas de connexion → affiche le bouton "Connecter Spotify"
 *   loading-sdk   → connexion trouvée, SDK en cours de chargement
 *   ready         → SDK prêt, contrôles actifs
 *
 * Le widget gère son propre cycle de vie Spotify Web Playback SDK.
 * L'access_token est récupéré (et rafraîchi) via /api/integrations/spotify/token
 * à chaque fois que le SDK en a besoin — jamais stocké en clair dans le state.
 *
 * ⚠️ Spotify Web Playback SDK nécessite un compte Premium.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { Music, LogOut, Play, Pause, Loader2 } from "lucide-react";
import { WaveformVisual } from "./WaveformVisual";
import { playSound } from "@/lib/sounds";

type WidgetState = "checking" | "disconnected" | "loading-sdk" | "ready";

interface SpotifyStatus {
  isPremium: boolean;
  displayName: string | null;
}

export function SpotifyWidget() {
  const [state, setState]           = useState<WidgetState>("checking");
  const [status, setStatus]         = useState<SpotifyStatus | null>(null);
  const [isPlaying, setIsPlaying]   = useState(false);
  const [currentTrack, setTrack]    = useState<string | null>(null);
  const playerRef                   = useRef<unknown>(null);

  /** Toujours appeler le serveur pour avoir un token frais (le serveur gère le refresh). */
  const getFreshToken = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch("/api/integrations/spotify/token");
      if (!res.ok) return null;
      const data = await res.json() as { accessToken: string };
      return data.accessToken;
    } catch {
      return null;
    }
  }, []);

  const initSDK = useCallback(async () => {
    // Le SDK ne se charge qu'une fois
    if (!document.querySelector('script[src*="spotify-player.js"]')) {
      const script    = document.createElement("script");
      script.src      = "https://sdk.scdn.co/spotify-player.js";
      script.async    = true;
      document.body.appendChild(script);
    }

    (window as unknown as Record<string, unknown>).onSpotifyWebPlaybackSDKReady = () => {
      const Spotify = (window as unknown as Record<string, unknown>).Spotify as {
        Player: new (opts: unknown) => unknown;
      };
      const player = new Spotify.Player({
        name:          "Soliris Market",
        getOAuthToken: async (cb: (t: string) => void) => {
          const token = await getFreshToken();
          if (token) cb(token);
        },
        volume: 0.4,
      }) as {
        addListener:  (event: string, cb: (arg: unknown) => void) => void;
        connect:      () => void;
        disconnect:   () => void;
        togglePlay:   () => void;
      };

      player.addListener("ready", () => {
        setState("ready");
      });

      player.addListener("not_ready", () => {
        setState("loading-sdk");
      });

      player.addListener("player_state_changed", (state) => {
        if (!state) return;
        const s = state as {
          paused: boolean;
          track_window?: { current_track?: { name?: string } };
        };
        setIsPlaying(!s.paused);
        setTrack(s.track_window?.current_track?.name ?? null);
      });

      player.connect();
      playerRef.current = player;
    };

    // Si le SDK est déjà chargé (rechargement HMR), déclencher manuellement
    if ((window as unknown as Record<string, unknown>).Spotify) {
      ((window as unknown as Record<string, unknown>).onSpotifyWebPlaybackSDKReady as () => void)?.();
    }
  }, [getFreshToken]);

  // Vérification initiale de la connexion
  useEffect(() => {
    async function check() {
      try {
        const res = await fetch("/api/integrations/spotify/token");
        if (!res.ok) {
          setState("disconnected");
          return;
        }
        const data = await res.json() as {
          isPremium: boolean;
          displayName: string | null;
          accessToken: string;
        };
        setStatus({ isPremium: data.isPremium, displayName: data.displayName });
        setState("loading-sdk");
        await initSDK();
      } catch {
        setState("disconnected");
      }
    }
    check();
  }, [initSDK]);

  // Nettoyage du player au démontage
  useEffect(() => {
    return () => {
      (playerRef.current as { disconnect?: () => void } | null)?.disconnect?.();
    };
  }, []);

  const handleConnect = () => {
    playSound("click");
    window.location.href = "/api/integrations/spotify/login";
  };

  const handleDisconnect = async () => {
    playSound("click");
    await fetch("/api/integrations/spotify/disconnect", { method: "DELETE" });
    (playerRef.current as { disconnect?: () => void } | null)?.disconnect?.();
    playerRef.current = null;
    setState("disconnected");
    setStatus(null);
    setIsPlaying(false);
    setTrack(null);
  };

  const handleToggle = () => {
    playSound("toggle");
    (playerRef.current as { togglePlay?: () => void } | null)?.togglePlay?.();
  };

  // Rien à afficher pendant la vérification silencieuse
  if (state === "checking") return null;

  // ─── Non connecté ────────────────────────────────────────────────────────
  if (state === "disconnected") {
    return (
      <div className="px-3 py-2.5 border-t border-sidebar-border">
        <p className="text-[10px] text-sidebar-foreground/35 leading-snug mb-1.5 px-0.5">
          Musique de fond — nécessite un compte{" "}
          <span className="text-[#1DB954] font-medium">Spotify Premium</span>
        </p>
        <button
          onClick={handleConnect}
          className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-sidebar-foreground/55 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent rounded-lg transition-all"
        >
          <SpotifyIcon className="w-4 h-4 flex-shrink-0" />
          Connecter Spotify
        </button>
      </div>
    );
  }

  // ─── Connecté (SDK en cours ou prêt) ─────────────────────────────────────
  return (
    <div className="px-3 py-2.5 border-t border-sidebar-border">
      {/* Ligne infos + déconnexion */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <SpotifyIcon className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="text-[11px] text-sidebar-foreground/50 truncate flex-1 min-w-0">
          {currentTrack ?? (state === "loading-sdk" ? "Connexion…" : "Prêt")}
        </span>
        <button
          onClick={handleDisconnect}
          title="Déconnecter Spotify"
          className="p-0.5 text-sidebar-foreground/25 hover:text-sidebar-foreground/60 rounded transition-colors flex-shrink-0"
        >
          <LogOut className="w-3 h-3" />
        </button>
      </div>

      {/* Contrôles lecture + onde */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleToggle}
          disabled={state !== "ready"}
          className="p-1.5 text-sidebar-foreground/55 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent rounded-md transition-all disabled:opacity-30 flex-shrink-0"
          title={isPlaying ? "Pause" : "Lecture"}
        >
          {state === "loading-sdk" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-3.5 h-3.5" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
        </button>
        <WaveformVisual active={isPlaying} width={116} height={24} />
      </div>

      {/* Avertissement si pas Premium */}
      {status && !status.isPremium && (
        <p className="text-[10px] text-amber-500/70 mt-1.5 leading-snug px-0.5">
          Premium requis pour la lecture complète.
        </p>
      )}
    </div>
  );
}

/** Icône Spotify officielle (SVG inline, pas de dépendance externe). */
function SpotifyIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="#1DB954"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 0C5.372 0 0 5.373 0 12c0 6.628 5.372 12 12 12 6.629 0 12-5.372 12-12C24 5.373 18.629 0 12 0zm5.52 17.292a.747.747 0 01-1.028.247c-2.815-1.72-6.358-2.11-10.527-1.157a.747.747 0 11-.333-1.457c4.563-1.041 8.477-.593 11.64 1.338.353.215.465.676.248 1.029zm1.473-3.274a.935.935 0 01-1.285.308c-3.224-1.98-8.135-2.554-11.94-1.398a.935.935 0 01-.578-1.782c4.35-1.33 9.757-.687 13.494 1.587a.936.936 0 01.31 1.285zm.127-3.407c-3.864-2.295-10.24-2.506-13.926-1.386a1.122 1.122 0 01-.693-2.14c4.236-1.368 11.273-1.104 15.72 1.603a1.12 1.12 0 01-1.1 1.923z" />
    </svg>
  );
}
