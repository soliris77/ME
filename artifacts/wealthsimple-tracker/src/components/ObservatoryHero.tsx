import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Activity,
  ArrowUpRight,
  ChevronRight,
  Clock3,
  Gauge,
  Layers3,
  Radio,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  EXCHANGES,
  getExchangeOpenStatus,
} from "@/lib/marketHours";

const MarketGlobe = lazy(() => import("@/components/MarketGlobe"));

type ObservatoryHeroVariant = "dashboard" | "page";

type ObservatorySnapshot = {
  openCount: number;
  totalCount: number;
  checkedAt: Date;
};

function readSnapshot(): ObservatorySnapshot {
  return {
    openCount: EXCHANGES.filter((exchange) => getExchangeOpenStatus(exchange) === "open").length,
    totalCount: EXCHANGES.length,
    checkedAt: new Date(),
  };
}

function useObservatorySnapshot() {
  const [snapshot, setSnapshot] = useState<ObservatorySnapshot>(() => readSnapshot());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSnapshot(readSnapshot());
    }, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  return snapshot;
}

function Metric({
  icon: Icon,
  label,
  value,
  context,
  tone = "gold",
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  context: string;
  tone?: "gold" | "teal" | "muted";
}) {
  return (
    <div className="observatory-hero-metric">
      <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <Icon className={`h-3.5 w-3.5 ${tone === "teal" ? "text-teal-300" : tone === "muted" ? "text-muted-foreground" : "text-primary"}`} />
        {label}
      </div>
      <div className="mt-3 font-mono text-xl tracking-tight text-foreground">{value}</div>
      <div className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{context}</div>
    </div>
  );
}

export default function ObservatoryHero({
  variant = "dashboard",
}: {
  variant?: ObservatoryHeroVariant;
}) {
  const snapshot = useObservatorySnapshot();
  const isDashboard = variant === "dashboard";
  const isActive = snapshot.openCount > 0;
  const updateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("fr-FR", {
        timeZone: "UTC",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(snapshot.checkedAt),
    [snapshot.checkedAt],
  );

  return (
    <section
      className={`observatory-hero ${isDashboard ? "observatory-hero-dashboard" : "observatory-hero-page"}`}
      aria-labelledby="observatory-hero-title"
    >
      <div className="observatory-hero-grid pointer-events-none" aria-hidden="true" />
      <div className="observatory-hero-glow observatory-hero-glow-gold pointer-events-none" aria-hidden="true" />
      <div className="observatory-hero-glow observatory-hero-glow-blue pointer-events-none" aria-hidden="true" />

      <div className="relative z-10 flex flex-col gap-6 border-b border-primary/15 px-5 py-5 sm:px-7 sm:py-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.24em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Centre de vision Soliris
            </div>
            <div className="observatory-hero-status">
              <span className="observatory-hero-status-dot" />
              {isActive ? "Surveillance active" : "Veille mondiale"}
            </div>
          </div>
          <h2 id="observatory-hero-title" className="mt-4 font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
            Observatoire
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Une lecture globale des fuseaux, des séances et des relais en cours.
            Le centre de vision transforme le marché mondial en instrument lisible.
          </p>
        </div>

        <Link
          href="/observatoire"
          className="group inline-flex w-fit items-center gap-2 rounded-full border border-primary/40 bg-primary/[0.08] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary transition-all hover:border-primary/75 hover:bg-primary/[0.16] hover:shadow-[0_0_28px_hsl(var(--primary)/0.16)]"
        >
          {isDashboard ? "Ouvrir l’Observatoire" : "Entrer dans la salle"}
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </Link>
      </div>

      <div className="relative z-10 grid gap-0 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <div className={`observatory-hero-visual ${isDashboard ? "observatory-hero-visual-preview" : ""}`}>
          <div className="observatory-hero-visual-label">
            <span className="flex items-center gap-2">
              <Radio className="h-3.5 w-3.5 text-primary" />
              Visualisation centrale
            </span>
            <span className="hidden text-[9px] uppercase tracking-[0.16em] text-muted-foreground sm:inline">
              {isDashboard ? "Aperçu en lecture seule" : "Interaction active"}
            </span>
          </div>
          <div className="observatory-hero-globe">
            <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-muted-foreground">Chargement de la visualisation…</div>}>
              <MarketGlobe variant="hero" interactive={!isDashboard} />
            </Suspense>
          </div>
          <div className="observatory-hero-visual-footer">
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-300 shadow-[0_0_10px_rgba(125,215,199,0.9)]" />
              Nœuds de séance
            </span>
            <span className="flex items-center gap-2">
              <Layers3 className="h-3.5 w-3.5" />
              Fuseaux · statut · relais
            </span>
          </div>
        </div>

        <aside className="observatory-hero-panel">
          <div className="border-b border-primary/15 p-5 sm:p-6">
            <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-primary">
              <Gauge className="h-3.5 w-3.5" />
              Lecture instantanée
            </div>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <div className="font-mono text-3xl tracking-tight text-foreground">
                  {snapshot.openCount.toString().padStart(2, "0")}
                  <span className="text-base text-muted-foreground">/{snapshot.totalCount}</span>
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  places ouvertes maintenant
                </div>
              </div>
              <div className="rounded-full border border-teal-300/30 bg-teal-300/[0.08] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-teal-200">
                Temps réel
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px border-b border-primary/15 bg-primary/10">
            <Metric
              icon={Activity}
              label="Activité"
              value={isActive ? "EN SÉANCE" : "VEILLE"}
              context="état calculé par horaires locaux"
              tone={isActive ? "teal" : "muted"}
            />
            <Metric
              icon={ShieldCheck}
              label="Signal"
              value="FIABLE"
              context="données de séance, sans estimation"
              tone="gold"
            />
            <Metric
              icon={Clock3}
              label="Mise à jour"
              value={updateLabel}
              context="heure UTC de la dernière lecture"
              tone="muted"
            />
            <Metric
              icon={ChevronRight}
              label="Prochaine lecture"
              value="30 s"
              context="actualisation automatique du statut"
              tone="gold"
            />
          </div>

          <div className="p-5 sm:p-6">
            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-primary/80">
              Ce que vous voyez
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {isDashboard
                ? "Un aperçu vivant du système. Ouvrez l’Observatoire pour faire tourner la Terre, sélectionner un nœud et suivre les ondulations du relais actif."
                : "Les ondulations partent du relais actuellement ouvert et se distribuent vers les autres nœuds actifs. Elles décrivent une séance, pas une prédiction de prix."}
            </p>
            <Link
              href="/observatoire"
              className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary transition-colors hover:text-foreground"
            >
              Voir les instruments
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </aside>
      </div>
    </section>
  );
}