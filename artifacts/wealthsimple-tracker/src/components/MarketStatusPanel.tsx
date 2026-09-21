import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Database,
  Info,
  RefreshCw,
  TimerReset,
} from "lucide-react";
import {
  EXCHANGES,
  getExchangeSessionSnapshot,
  type ExchangeSessionSnapshot,
} from "@/lib/marketHours";

function formatCountdown(totalSeconds: number | null): string {
  if (totalSeconds === null) return "—";
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function statusCopy(snapshot: ExchangeSessionSnapshot | null) {
  if (!snapshot) {
    return {
      label: "VÉRIFICATION…",
      title: "Vérification du statut…",
      tone: "checking" as const,
    };
  }
  if (snapshot.status === "open") {
    return {
      label: "OUVERT",
      title: "Le marché est actuellement ouvert",
      tone: "open" as const,
    };
  }
  return {
    label: "FERMÉ",
    title: "Le marché est actuellement fermé",
    tone: "closed" as const,
  };
}

function StatusDot({ tone }: { tone: "open" | "closed" | "checking" }) {
  return (
    <span
      className={`market-status-dot market-status-dot-${tone}`}
      aria-hidden="true"
    />
  );
}

function MetadataRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Clock3;
}) {
  return (
    <div className="market-status-metadata-row">
      <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary/75" />
        {label}
      </div>
      <div className="mt-1 text-xs font-medium text-foreground">{value}</div>
    </div>
  );
}

export default function MarketStatusPanel() {
  const [selectedId, setSelectedId] = useState("nyse_nasdaq");
  const [now, setNow] = useState<Date | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!detailsOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detailsOpen]);

  const selectedExchange = useMemo(
    () => EXCHANGES.find((exchange) => exchange.id === selectedId) ?? EXCHANGES[0],
    [selectedId],
  );
  const snapshot = now ? getExchangeSessionSnapshot(selectedExchange, now) : null;
  const copy = statusCopy(snapshot);

  return (
    <>
      <section
        className="market-status-panel"
        aria-labelledby="market-status-title"
      >
        <div className="market-status-main">
          <div className="market-status-kicker">
            <span className="flex items-center gap-2">
              <CalendarClock className="h-3.5 w-3.5 text-primary" />
              Statut de marché
            </span>
            <span className="market-status-source">
              <Database className="h-3 w-3" />
              Horaires de séance Soliris
            </span>
          </div>

          <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className={`market-status-state market-status-state-${copy.tone}`}>
                <StatusDot tone={copy.tone} />
                <span>{copy.label}</span>
              </div>
              <h2 id="market-status-title" className="mt-3 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {copy.title}
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {snapshot
                  ? `${selectedExchange.name} · ${snapshot.statusSinceLabel} · prochaine étape : ${snapshot.nextEventLabel.toLowerCase()}`
                  : "Le calendrier de séance est en cours de lecture."}
              </p>
            </div>

            <label className="market-status-select-wrap">
              <span className="sr-only">Choisir le marché surveillé</span>
              <select
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                className="market-status-select"
              >
                {EXCHANGES.map((exchange) => (
                  <option key={exchange.id} value={exchange.id}>
                    {exchange.name} · {exchange.location}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-primary/75" />
            </label>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetadataRow
              icon={Info}
              label="Marché"
              value={selectedExchange.name}
            />
            <MetadataRow
              icon={Clock3}
              label="Heure locale"
              value={snapshot?.localTime ?? "Vérification…"}
            />
            <MetadataRow
              icon={RefreshCw}
              label="Dernière vérification"
              value={snapshot?.checkedAt.toLocaleTimeString("fr-FR") ?? "—"}
            />
            <MetadataRow
              icon={TimerReset}
              label={snapshot?.nextEvent === "close" ? "Fermeture dans" : "Réouverture dans"}
              value={formatCountdown(snapshot?.remainingSeconds ?? null)}
            />
          </div>
        </div>

        <div className="market-status-timing">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-primary/80">
                Prochain événement
              </div>
              <div className="mt-2 font-mono text-2xl tracking-tight text-foreground">
                {snapshot?.nextEventLabel ?? "Vérification…"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {snapshot?.nextEventTimeLabel ? `À ${snapshot.nextEventTimeLabel} · heure locale` : "—"}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-lg text-primary">
                {formatCountdown(snapshot?.remainingSeconds ?? null)}
              </div>
              <div className="mt-1 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                compte à rebours
              </div>
            </div>
          </div>

          <div className="market-status-timeline mt-6" aria-label="Position dans la session">
            <div className="market-status-timeline-track">
              <span
                className="market-status-timeline-progress"
                style={{ width: `${Math.max(0, Math.min(100, (snapshot?.progress ?? 0) * 100))}%` }}
              />
              <span
                className="market-status-timeline-marker"
                style={{ left: `${Math.max(0, Math.min(100, (snapshot?.progress ?? 0) * 100))}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between gap-4 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              <span>Ouverture · {selectedExchange.hoursLabel.split(" – ")[0]}</span>
              <span>Fermeture · {selectedExchange.hoursLabel.split(" – ")[1]}</span>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-primary/15 pt-4">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              {snapshot ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-teal-300" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 text-primary" />
              )}
              {snapshot ? "Statut calculé depuis le fuseau de la place" : "Vérification du statut…"}
            </div>
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className="market-status-details-button"
              aria-haspopup="dialog"
            >
              Voir les détails
              <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
            </button>
          </div>
        </div>
      </section>

      {detailsOpen && snapshot && (
        <div
          className="market-status-dialog-backdrop"
          role="presentation"
          onClick={() => setDetailsOpen(false)}
        >
          <section
            className="market-status-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="market-status-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-4">
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-primary">
                  Détails du marché surveillé
                </div>
                <h3 id="market-status-dialog-title" className="mt-2 text-xl font-semibold text-foreground">
                  {selectedExchange.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="rounded-full border border-border/60 px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:border-primary/50 hover:text-primary"
              >
                Fermer
              </button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <MetadataRow icon={Info} label="Statut" value={copy.label} />
              <MetadataRow icon={Clock3} label="Fuseau" value={snapshot.timezoneLabel} />
              <MetadataRow icon={CalendarClock} label="Horaires" value={`${snapshot.hoursLabel} · lun–ven`} />
              <MetadataRow icon={RefreshCw} label="Synchronisation" value={snapshot.checkedAt.toLocaleTimeString("fr-FR")} />
              <MetadataRow icon={TimerReset} label="Prochain événement" value={`${snapshot.nextEventLabel} à ${snapshot.nextEventTimeLabel}`} />
              <MetadataRow icon={Database} label="Source" value={snapshot.sourceLabel} />
            </div>
            <p className="mt-5 rounded-lg border border-primary/15 bg-primary/[0.04] p-3 text-xs leading-relaxed text-muted-foreground">
              Ce calendrier connaît les horaires réguliers et les fuseaux horaires.
              Les jours fériés, suspensions et séances étendues ne sont pas affirmés
              ici lorsqu’aucune source dédiée ne les fournit.
            </p>
          </section>
        </div>
      )}
    </>
  );
}