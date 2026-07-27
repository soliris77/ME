import { Router } from "express";
import { yahooFinance } from "../lib/yahoo";

const router = Router();

/**
 * Calendrier économique — deux sources gratuites combinées :
 *  - Dates de résultats (earnings) par symbole, via yahoo-finance2 quoteSummary
 *    (module calendarEvents), pour les titres demandés (ex: watchlist).
 *  - Macro-événements récurrents connus à l'avance (réunions FOMC, rapport
 *    mensuel de l'emploi américain) — calculés, aucune clé API nécessaire.
 */

interface CalendarEvent {
  id: string;
  date: string; // ISO
  type: "earnings" | "fomc" | "jobs_report";
  title: string;
  symbol?: string;
}

// Réunions du FOMC (dates de décision, jour 2 de la réunion) — calendrier
// publié à l'avance par la Fed pour 2026.
const FOMC_2026_DATES = [
  "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17",
  "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09",
];

// Rapport mensuel de l'emploi américain (Nonfarm Payrolls) — publié le
// premier vendredi de chaque mois (règle approximative mais fiable).
function jobsReportDates(year: number): string[] {
  const dates: string[] = [];
  for (let month = 0; month < 12; month++) {
    const d = new Date(Date.UTC(year, month, 1));
    while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

router.get("/calendar", async (req, res) => {
  const { symbols } = req.query as { symbols?: string };
  const symbolList = (symbols ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 15);

  const events: CalendarEvent[] = [];
  const now = new Date();
  const year = now.getUTCFullYear();

  for (const d of FOMC_2026_DATES) {
    events.push({ id: `fomc-${d}`, date: d, type: "fomc", title: "Décision de taux — Réserve fédérale (FOMC)" });
  }
  for (const d of [...jobsReportDates(year), ...jobsReportDates(year + 1)]) {
    events.push({ id: `jobs-${d}`, date: d, type: "jobs_report", title: "Rapport sur l'emploi américain (Nonfarm Payrolls)" });
  }

  await Promise.all(
    symbolList.map(async (symbol) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const summary: any = await yahooFinance.quoteSummary(symbol, { modules: ["calendarEvents"] }, { validateResult: false });
        const earnings = summary?.calendarEvents?.earnings;
        const earningsDates: Date[] = earnings?.earningsDate ?? [];
        for (const ed of earningsDates) {
          const iso = new Date(ed).toISOString();
          events.push({
            id: `earnings-${symbol}-${iso.slice(0, 10)}`,
            date: iso,
            type: "earnings",
            title: `Publication des résultats — ${symbol}`,
            symbol,
          });
        }
      } catch (err) {
        req.log.warn({ err, symbol }, "calendar: failed to fetch earnings date");
      }
    })
  );

  events.sort((a, b) => a.date.localeCompare(b.date));
  return res.json(events);
});

export default router;
