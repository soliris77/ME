import { useEffect, useId, useState, type ReactNode } from "react";
import { Maximize2, Minimize2, RotateCcw } from "lucide-react";

export const SOLIRIS_CHART_COLORS = {
  accent: "hsl(var(--primary))",
  positive: "hsl(142 68% 48%)",
  negative: "hsl(0 72% 55%)",
  neutral: "hsl(42 50% 52%)",
  muted: "hsl(var(--muted-foreground))",
  grid: "hsl(var(--border) / 0.28)",
  surface: "hsl(var(--card))",
} as const;

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}

export type ChartPeriodOption<T extends string = string> = {
  value: T;
  label: string;
};

export function formatChartDate(value: string | number | Date, intraday = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("fr-CA", intraday
    ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "2-digit" });
}

export function formatChartNumber(value: number | null | undefined, maximumFractionDigits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("fr-CA", { maximumFractionDigits });
}

export function formatChartVolume(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)} G`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)} M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)} K`;
  return value.toLocaleString("fr-CA");
}

export function ChartTooltipShell({
  label,
  children,
  className = "",
}: {
  label?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={`min-w-[9rem] rounded-lg border border-border/70 bg-card/95 px-3 py-2.5 text-xs shadow-2xl backdrop-blur-md ${className}`}
    >
      {label && <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>}
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

export function ChartTooltipRow({
  label,
  value,
  color,
  tone,
}: {
  label: string;
  value: ReactNode;
  color?: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  const toneClass = tone === "positive"
    ? "text-emerald-400"
    : tone === "negative"
      ? "text-red-400"
      : tone === "neutral"
        ? "text-primary"
        : "text-foreground";

  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
        {label}
      </span>
      <span className={`font-mono font-semibold tabular-nums ${toneClass}`}>{value}</span>
    </div>
  );
}

export function ChartPeriodSelector<T extends string>({
  options,
  value,
  onChange,
  disabled,
  label = "Période",
}: {
  options: ReadonlyArray<ChartPeriodOption<T>>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="shrink-0 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/65">{label}</span>
      <div className="flex min-w-0 max-w-full gap-1 overflow-x-auto rounded-lg bg-muted/35 p-0.5" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            disabled={disabled}
            aria-pressed={value === option.value}
            className={`shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
              value === option.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            } disabled:cursor-wait disabled:opacity-50`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChartViewport({
  title,
  description,
  children,
  controls,
  onReset,
  resetLabel = "Réinitialiser la vue",
  fullscreenLabel = "Ouvrir en plein écran",
  className = "",
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  controls?: ReactNode;
  onReset?: () => void;
  resetLabel?: string;
  fullscreenLabel?: string;
  className?: string;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [fullscreen]);

  return (
    <section
      aria-labelledby={title ? titleId : undefined}
      data-chart-surface="soliris"
      className={`soliris-chart-viewport ${fullscreen ? "is-fullscreen" : ""} ${className}`}
    >
      <div className="soliris-chart-toolbar">
        <div className="min-w-0">
          {title && <h2 id={titleId} className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/85">{title}</h2>}
          {description && <p className="mt-1 hidden text-[11px] text-muted-foreground sm:block">{description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {controls}
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              title={resetLabel}
              aria-label={resetLabel}
            >
              <RotateCcw className="h-3 w-3" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setFullscreen((current) => !current)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            title={fullscreen ? "Quitter le plein écran" : fullscreenLabel}
            aria-label={fullscreen ? "Quitter le plein écran" : fullscreenLabel}
            aria-pressed={fullscreen}
          >
            {fullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            <span className="hidden sm:inline">{fullscreen ? "Fermer" : "Plein écran"}</span>
          </button>
        </div>
      </div>
      <div className="soliris-chart-viewport-content">{children}</div>
    </section>
  );
}

export function ChartLoadingState({ label = "Chargement des données…" }: { label?: string }) {
  return (
    <div className="soliris-chart-state" role="status" aria-label={label}>
      <div className="soliris-chart-skeleton" />
      <span>{label}</span>
    </div>
  );
}

export function ChartEmptyState({ label = "Données historiques indisponibles." }: { label?: string }) {
  return <div className="soliris-chart-state" role="status">{label}</div>;
}

export function ChartErrorState({
  label = "Données temporairement indisponibles.",
  onRetry,
}: {
  label?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="soliris-chart-state" role="alert">
      <span>{label}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-border/60 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          Réessayer
        </button>
      )}
    </div>
  );
}