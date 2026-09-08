/**
 * TradingModeBanner
 * ─────────────────
 * Bandeau discret en haut de l'app indiquant le mode de trading actif.
 * Mode live : indicateur pulsant doré — lisible sans être agressif.
 * Mode paper : barre très subtile, presque invisible.
 */
import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface TradingModeInfo {
  mode: "paper" | "live";
  hasCredentials?: boolean;
}

export default function TradingModeBanner() {
  const { data } = useQuery<TradingModeInfo>({
    queryKey: ["trading-mode"],
    queryFn: () => fetch(`${BASE}/api/broker/trading-mode`).then((r) => r.json()),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (!data || (data.hasCredentials === false)) return null;

  if (data.mode === "live") {
    return (
      <div className="relative z-20 flex items-center justify-center gap-2.5 px-4 py-1.5"
        style={{ background: "linear-gradient(90deg, transparent, rgba(201,160,64,0.08) 30%, rgba(201,160,64,0.08) 70%, transparent)", borderBottom: "1px solid rgba(201,160,64,0.2)" }}>
        {/* Dot pulsant */}
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: "#c9a040" }} />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "#c9a040" }} />
        </span>
        <span className="text-[10px] font-medium tracking-[0.28em] uppercase" style={{ color: "#c9a040" }}>
          Live · Ordres réels actifs
        </span>
      </div>
    );
  }

  return (
    <div className="relative z-20 flex items-center justify-center gap-2 px-4 py-1"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <span className="inline-flex h-1.5 w-1.5 rounded-full shrink-0 bg-muted-foreground/30" />
      <span className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground/50">
        Paper · Simulation
      </span>
    </div>
  );
}
