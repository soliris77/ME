import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "wouter";
import {
  Activity,
  ArrowUpRight,
  ChevronRight,
  Clock3,
  Gauge,
  Layers3,
  Maximize2,
  Minimize2,
  Radio,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  EXCHANGES,
  getExchangeOpenStatus,
} from "@/lib/marketHours";
import type { GlobeSelection } from "@/components/MarketGlobe";

const MarketGlobe = lazy(() => import("@/components/MarketGlobe"));

type ObservatoryHeroVariant = "dashboard" | "page";

type ObservatorySnapshot = {
  openCount: number;
  totalCount: number;
  checkedAt: Date;
};

const OBSERVATORY_STARS = [
  { x: 8, y: 18, size: 1.4, delay: -1.2, duration: 3.8, tier: "back", tone: "gold" },
  { x: 17, y: 44, size: 1.1, delay: -2.7, duration: 4.5, tier: "back", tone: "blue" },
  { x: 26, y: 14, size: 1.6, delay: -0.8, duration: 3.2, tier: "mid", tone: "gold" },
  { x: 32, y: 73, size: 1.2, delay: -3.4, duration: 4.9, tier: "back", tone: "blue" },
  { x: 40, y: 24, size: 1.8, delay: -1.9, duration: 3.6, tier: "front", tone: "gold" },
  { x: 48, y: 11, size: 1.1, delay: -4.2, duration: 5.2, tier: "back", tone: "blue" },
  { x: 54, y: 78, size: 1.5, delay: -2.2, duration: 4.1, tier: "mid", tone: "gold" },
  { x: 62, y: 29, size: 1.2, delay: -0.5, duration: 3.9, tier: "back", tone: "blue" },
  { x: 69, y: 12, size: 1.7, delay: -2.9, duration: 4.4, tier: "front", tone: "gold" },
  { x: 77, y: 48, size: 1.2, delay: -1.6, duration: 3.5, tier: "mid", tone: "blue" },
  { x: 84, y: 24, size: 1.5, delay: -3.8, duration: 4.7, tier: "back", tone: "gold" },
  { x: 91, y: 68, size: 1.1, delay: -2.1, duration: 5.4, tier: "back", tone: "blue" },
  { x: 12, y: 82, size: 1.7, delay: -4.5, duration: 3.7, tier: "front", tone: "gold" },
  { x: 23, y: 61, size: 1.3, delay: -1.4, duration: 4.2, tier: "mid", tone: "blue" },
  { x: 73, y: 84, size: 1.6, delay: -3.1, duration: 3.4, tier: "front", tone: "gold" },
  { x: 88, y: 87, size: 1.3, delay: -0.9, duration: 4.8, tier: "mid", tone: "blue" },
] as const;

function ObservatorySpaceBackdrop() {
  return (
    <div className="observatory-hero-space pointer-events-none" aria-hidden="true">
      <div className="observatory-space-nebula observatory-space-nebula-gold" />
      <div className="observatory-space-nebula observatory-space-nebula-blue" />
      <div className="observatory-space-core" />
      <div className="observatory-space-stars-field observatory-space-stars-field-back" />
      <div className="observatory-space-stars-field observatory-space-stars-field-mid" />
      <div className="observatory-space-orbit observatory-space-orbit-one" />
      <div className="observatory-space-orbit observatory-space-orbit-two" />
      {OBSERVATORY_STARS.map((star, index) => (
        <span
          key={`${star.x}-${star.y}-${index}`}
          className={`observatory-space-star observatory-space-star-${star.tier} observatory-space-star-${star.tone}`}
          style={
            {
              "--star-x": `${star.x}%`,
              "--star-y": `${star.y}%`,
              "--star-size": `${star.size}px`,
              "--star-delay": `${star.delay}s`,
              "--star-duration": `${star.duration}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

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
  isImmersive = false,
  onToggleImmersive,
  onSelectionChange,
}: {
  variant?: ObservatoryHeroVariant;
  isImmersive?: boolean;
  onToggleImmersive?: () => void;
  onSelectionChange?: (selection: GlobeSelection) => void;
}) {
  const snapshot = useObservatorySnapshot();
  const isDashboard = variant === "dashboard";
  const isActive = snapshot.openCount > 0;
  const [selectedNode, setSelectedNode] = useState<GlobeSelection | null>(null);
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

      <div className="observatory-hero-heading relative z-10 flex flex-col gap-6 border-b border-primary/15 px-5 py-5 sm:px-7 sm:py-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="observatory-hero-heading-copy">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.24em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
               Vision globale · Soliris
            </div>
            <div className="observatory-hero-status">
              <span className="observatory-hero-status-dot" />
              {isActive ? "Séances actives" : "Veille mondiale"}
            </div>
          </div>
           <h2 id="observatory-hero-title" className="mt-4 font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
             OBSERVATOIRE MONDIAL
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Une lecture globale des fuseaux, des séances et des relais en cours.
            Le centre de vision transforme le marché mondial en instrument lisible.
          </p>
        </div>

        {isDashboard ? (
          <Link
            href="/observatoire"
            className="observatory-hero-cta group inline-flex w-fit items-center gap-2 rounded-full border border-primary/40 bg-primary/[0.08] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary transition-all hover:border-primary/75 hover:bg-primary/[0.16] hover:shadow-[0_0_28px_hsl(var(--primary)/0.16)]"
          >
            Ouvrir l’Observatoire
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onToggleImmersive}
            className="observatory-hero-cta group inline-flex w-fit items-center gap-2 rounded-full border border-primary/40 bg-primary/[0.08] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary transition-all hover:border-primary/75 hover:bg-primary/[0.16] hover:shadow-[0_0_28px_hsl(var(--primary)/0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-pressed={isImmersive}
          >
            {isImmersive ? "Réduire l’Observatoire" : "Mode immersif"}
            {isImmersive ? (
              <Minimize2 className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
            )}
          </button>
        )}
      </div>

      <div className="relative z-10 grid gap-0 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <div className={`observatory-hero-visual ${isDashboard ? "observatory-hero-visual-preview" : ""}`}>
          <ObservatorySpaceBackdrop />
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
               <MarketGlobe
                 variant="hero"
                 interactive={!isDashboard}
                onSelectionChange={isDashboard ? undefined : (selection) => {
                  setSelectedNode(selection);
                  onSelectionChange?.(selection);
                }}
               />
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
              <div className="rounded-full border border-primary/30 bg-primary/[0.08] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-primary">
                Horaires locaux
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
              value="CALENDRIER"
              context="horaires locaux calculés ici"
              tone="gold"
            />
            <Metric
              icon={Clock3}
              label="Calcul local"
              value={updateLabel}
              context="horodatage de calcul en UTC"
              tone="muted"
            />
            <Metric
              icon={ChevronRight}
              label="Prochaine lecture"
              value="30 s"
              context="nouveau calcul des séances"
              tone="gold"
            />
          </div>

          {selectedNode && !isDashboard && (
            <div className="observatory-selected-node border-b border-primary/15 px-5 py-4 sm:px-6" aria-live="polite">
              <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                Point de vue sélectionné
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-3">
                <div className="text-sm font-semibold text-foreground">{selectedNode.name}</div>
                <div className="font-mono text-[10px] text-muted-foreground">{selectedNode.localTime}</div>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
                <span>{selectedNode.location}</span>
                <span className={selectedNode.status === "open" ? "text-teal-300" : "text-primary/75"}>
                  {selectedNode.status === "open" ? "Ouvert" : selectedNode.status === "holiday" ? "Fermé · férié" : "Fermé"}
                </span>
              </div>
            </div>
          )}

          <div className="p-5 sm:p-6">
            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-primary/80">
              Ce que vous voyez
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {isDashboard
                ? "Un aperçu vivant du calendrier mondial. Ouvrez l’Observatoire pour faire tourner la Terre, sélectionner une place et lire les séances ouvertes."
                : isActive
                  ? "Les ondulations de lecture partent d’une place actuellement ouverte et se distribuent vers les autres places ouvertes. Elles décrivent une séance, pas une prédiction de prix."
                  : "Aucune place n’est actuellement ouverte dans le calendrier observé. Le prochain relais se prépare hors champ."}
            </p>
            {isDashboard && (
              <Link
                href="/observatoire"
                className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary transition-colors hover:text-foreground"
              >
                Voir les instruments
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}