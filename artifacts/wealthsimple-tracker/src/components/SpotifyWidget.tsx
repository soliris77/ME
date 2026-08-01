/**
 * SpotifyWidget — lecteur Spotify compact intégré dans la sidebar.
 *
 * Implémentation 100 % REST (aucun Web Playback SDK) : les contrôles agissent
 * sur l'appareil Spotify actif de l'utilisateur (téléphone, ordinateur, enceinte…)
 * via des routes serveur qui rafraîchissent elles-mêmes l'access_token.
 * Aucun token n'est jamais stocké côté client.
 *
 * États :
 *   checking      → montage, vérification silencieuse
 *   disconnected  → pas de connexion → bouton « Connecter Spotify »
 *   connected     → connexion établie, affichage de la lecture en cours
 *
 * Le widget interroge /now-playing toutes les 5 s tant que l'onglet est visible,
 * avec un « tick » optimiste local entre deux sondages pour une barre fluide.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { LogOut, Play, Pause, SkipBack, SkipForward, ExternalLink } from "lucide-react";
import { playSound } from "@/lib/sounds";

type WidgetState = "checking" | "disconnected" | "connected";

interface NowPlaying {
  playing: boolean;
  isPlaying?: boolean;
  trackName?: string;
  artists?: string;
  albumArtUrl?: string | null;
  progressMs?: number;
  durationMs?: number;
  deviceName?: string | null;
  trackUrl?: string | null;
}

const POLL_MS = 5_000;

function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SpotifyWidget() {
  const [state, setState]     = useState<WidgetState>("checking");
  const [now, setNow]         = useState<NowPlaying | null>(null);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice]   = useState<string | null>(null);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const nowRef    = useRef<NowPlaying | null>(null);

  /** Récupère la lecture en cours. Renvoie false si non connecté (→ disconnected). */
  const fetchNowPlaying = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/integrations/spotify/now-playing");
      if (res.status === 404) {
        return false; // aucune connexion enregistrée
      }
      if (!res.ok) {
        return true; // connecté mais erreur transitoire : on garde l'état
      }
      const data = (await res.json()) as NowPlaying;
      nowRef.current = data;
      setNow(data);
      setProgress(data.progressMs ?? 0);
      return true;
    } catch {
      return true;
    }
  }, []);

  // Vérification initiale
  useEffect(() => {
    let mounted = true;
    (async () => {
      const ok = await fetchNowPlaying();
      if (!mounted) return;
      setState(ok ? "connected" : "disconnected");
    })();
    return () => {
      mounted = false;
    };
  }, [fetchNowPlaying]);

  // Sondage toutes les 5 s + tick optimiste local, uniquement onglet visible
  useEffect(() => {
    if (state !== "connected") return;

    const startTimers = () => {
      if (!pollTimer.current) {
        pollTimer.current = setInterval(() => {
          void fetchNowPlaying();
        }, POLL_MS);
      }
      if (!tickTimer.current) {
        tickTimer.current = setInterval(() => {
          const cur = nowRef.current;
          if (cur?.playing && cur.isPlaying) {
            setProgress((p) => {
              const dur = cur.durationMs ?? 0;
              return dur > 0 ? Math.min(p + 1000, dur) : p + 1000;
            });
          }
        }, 1000);
      }
    };

    const stopTimers = () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      if (tickTimer.current) {
        clearInterval(tickTimer.current);
        tickTimer.current = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchNowPlaying();
        startTimers();
      } else {
        stopTimers();
      }
    };

    if (document.visibilityState === "visible") startTimers();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stopTimers();
    };
  }, [state, fetchNowPlaying]);

  const handleConnect = () => {
    playSound("click");
    window.location.href = "/api/integrations/spotify/login";
  };

  const handleDisconnect = async () => {
    playSound("click");
    await fetch("/api/integrations/spotify/disconnect", { method: "DELETE" });
    nowRef.current = null;
    setNow(null);
    setProgress(0);
    setNotice(null);
    setState("disconnected");
  };

  /** Envoie une commande de contrôle et traduit les erreurs Spotify en FR. */
  const sendControl = useCallback(
    async (action: "play" | "pause" | "next" | "previous") => {
      setNotice(null);
      try {
        const res = await fetch(`/api/integrations/spotify/${action}`, { method: "POST" });
        if (res.status === 404) {
          setNotice("Lance la lecture sur un appareil Spotify d'abord.");
          return;
        }
        if (res.status === 403) {
          setNotice("Contrôles réservés aux comptes Premium.");
          return;
        }
        if (!res.ok) {
          setNotice("Commande Spotify indisponible pour le moment.");
          return;
        }
        // Optimisme local pour play/pause, puis re-synchro rapide
        if (action === "play" || action === "pause") {
          setNow((prev) => (prev ? { ...prev, isPlaying: action === "play", playing: true } : prev));
          if (nowRef.current) nowRef.current = { ...nowRef.current, isPlaying: action === "play", playing: true };
        }
        setTimeout(() => void fetchNowPlaying(), 350);
      } catch {
        setNotice("Commande Spotify indisponible pour le moment.");
      }
    },
    [fetchNowPlaying],
  );

  const handleToggle = () => {
    playSound("toggle");
    void sendControl(now?.isPlaying ? "pause" : "play");
  };
  const handleNext = () => {
    playSound("click");
    void sendControl("next");
  };
  const handlePrev = () => {
    playSound("click");
    void sendControl("previous");
  };

  // Rien pendant la vérification silencieuse
  if (state === "checking") return null;

  // ─── Non connecté ────────────────────────────────────────────────────────
  if (state === "disconnected") {
    return (
      <div className="px-3 py-2.5 border-t border-sidebar-border">
        <p className="text-[10px] text-sidebar-foreground/35 leading-snug mb-1.5 px-0.5">
          Musique de fond via{" "}
          <span className="text-[#1DB954] font-medium">Spotify</span>
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

  // ─── Connecté ─────────────────────────────────────────────────────────────
  const isPlaying = now?.isPlaying ?? false;
  const hasTrack  = now?.playing && !!now.trackName;
  const duration  = now?.durationMs ?? 0;
  const pct       = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;

  return (
    <div className="px-3 py-2.5 border-t border-sidebar-border">
      {/* Ligne titre + déconnexion */}
      <div className="flex items-center gap-1.5 mb-2">
        <SpotifyIcon className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/40 flex-1 min-w-0 truncate">
          {now?.deviceName ? now.deviceName : "Spotify"}
        </span>
        {now?.trackUrl && (
          <a
            href={now.trackUrl}
            target="_blank"
            rel="noreferrer"
            title="Ouvrir dans Spotify"
            className="p-0.5 text-sidebar-foreground/25 hover:text-sidebar-foreground/60 rounded transition-colors flex-shrink-0"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
        <button
          onClick={handleDisconnect}
          title="Déconnecter Spotify"
          className="p-0.5 text-sidebar-foreground/25 hover:text-sidebar-foreground/60 rounded transition-colors flex-shrink-0"
        >
          <LogOut className="w-3 h-3" />
        </button>
      </div>

      {/* Pochette + titre / artistes */}
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-10 h-10 rounded-md bg-sidebar-accent flex-shrink-0 overflow-hidden flex items-center justify-center">
          {now?.albumArtUrl ? (
            <img
              src={now.albumArtUrl}
              alt=""
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <SpotifyIcon className="w-4 h-4 opacity-40" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          {hasTrack ? (
            <>
              <div className="text-[12px] text-sidebar-foreground/80 truncate font-medium">
                {now?.trackName}
              </div>
              <div className="text-[10.5px] text-sidebar-foreground/45 truncate">
                {now?.artists}
              </div>
            </>
          ) : (
            <div className="text-[11px] text-sidebar-foreground/45 leading-snug">
              Rien en cours de lecture
            </div>
          )}
        </div>
      </div>

      {/* Barre de progression */}
      {hasTrack && (
        <div className="mb-2 px-0.5">
          <div className="h-1 rounded-full bg-sidebar-accent overflow-hidden">
            <div
              className="h-full bg-[#1DB954] transition-[width] duration-1000 ease-linear"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between mt-0.5 text-[9px] text-sidebar-foreground/35 tabular-nums">
            <span>{formatTime(progress)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      )}

      {/* Contrôles */}
      <div className="flex items-center justify-center gap-1">
        <button
          onClick={handlePrev}
          className="p-1.5 text-sidebar-foreground/55 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent rounded-md transition-all flex-shrink-0"
          title="Précédent"
        >
          <SkipBack className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleToggle}
          className="p-2 text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent rounded-full transition-all flex-shrink-0"
          title={isPlaying ? "Pause" : "Lecture"}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button
          onClick={handleNext}
          className="p-1.5 text-sidebar-foreground/55 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent rounded-md transition-all flex-shrink-0"
          title="Suivant"
        >
          <SkipForward className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Message d'erreur contextuel */}
      {notice && (
        <p className="text-[10px] text-amber-500/80 mt-1.5 leading-snug px-0.5 text-center">
          {notice}
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
