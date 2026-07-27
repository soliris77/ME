import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePageMeta } from "@/hooks/use-page-meta";
import { useGetWatchlist } from "@workspace/api-client-react";
import { CalendarDays, Landmark, Briefcase, TrendingUp, Loader2 } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface CalendarEvent {
  id: string;
  date: string;
  type: "earnings" | "fomc" | "jobs_report";
  title: string;
  symbol?: string;
}

const TYPE_META: Record<CalendarEvent["type"], { label: string; icon: typeof Landmark; cls: string }> = {
  fomc: { label: "Banque centrale", icon: Landmark, cls: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20" },
  jobs_report: { label: "Emploi (macro)", icon: Briefcase, cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  earnings: { label: "Résultats", icon: TrendingUp, cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
};

function groupByMonth(events: CalendarEvent[]): { key: string; label: string; events: CalendarEvent[] }[] {
  const groups = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = e.date.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, evts]) => ({
      key,
      label: new Date(`${key}-01T12:00:00Z`).toLocaleDateString("fr-CA", { month: "long", year: "numeric" }),
      events: evts,
    }));
}

export default function CalendarPage() {
  usePageMeta("Calendrier économique — Soliris Market", "Réunions de la Fed, rapport de l'emploi et résultats des titres suivis.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: watchlist = [] } = useGetWatchlist({ query: {} as any });
  const symbols = useMemo(() => watchlist.map((w) => w.symbol).join(","), [watchlist]);

  const q = useQuery<CalendarEvent[]>({
    queryKey: ["calendar", symbols],
    queryFn: () => fetch(`${BASE}/api/calendar?symbols=${encodeURIComponent(symbols)}`).then((r) => r.json()),
    staleTime: 60 * 60 * 1000,
  });

  const upcoming = useMemo(() => {
    const now = new Date().toISOString().slice(0, 10);
    return (q.data ?? []).filter((e) => e.date.slice(0, 10) >= now);
  }, [q.data]);

  const months = useMemo(() => groupByMonth(upcoming), [upcoming]);

  return (
    <div className="p-6 sm:p-8 max-w-3xl mx-auto animate-fadeUp">
      <div className="mb-6">
        <div className="section-rule mb-4"><span>CALENDRIER</span></div>
        <h1 className="text-2xl font-semibold brand-mark tracking-[0.08em] flex items-center gap-2.5">
          <CalendarDays className="w-5 h-5 text-primary" />
          Calendrier économique
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
          Réunions de la Réserve fédérale, publication du rapport sur l'emploi américain, et dates
          de résultats trimestriels pour les titres de votre liste de suivi.
        </p>
      </div>

      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
        </div>
      ) : months.length === 0 ? (
        <div className="text-sm text-muted-foreground border border-dashed border-card-border rounded-xl p-8 text-center">
          Aucun événement à venir.
        </div>
      ) : (
        <div className="space-y-8">
          {months.map((month) => (
            <div key={month.key}>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 mb-3 capitalize">
                {month.label}
              </h2>
              <div className="space-y-2">
                {month.events.map((e) => {
                  const meta = TYPE_META[e.type];
                  const Icon = meta.icon;
                  const d = new Date(e.date);
                  return (
                    <div key={e.id} className="flex items-center gap-3 bg-card border border-card-border rounded-xl px-4 py-3">
                      <div className="w-11 text-center shrink-0">
                        <div className="text-[10px] uppercase text-muted-foreground/60">
                          {d.toLocaleDateString("fr-CA", { weekday: "short" })}
                        </div>
                        <div className="text-lg font-bold font-mono leading-none">{d.getUTCDate()}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{e.title}</p>
                        {e.symbol && <p className="text-xs text-muted-foreground font-mono">{e.symbol}</p>}
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border shrink-0 ${meta.cls}`}>
                        <Icon className="w-3 h-3" />
                        {meta.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
