/**
 * Validation des exercices pratiques du parcours guidé « Apprendre à trader ».
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque leçon a un critère CONCRET vérifié côté serveur, basé soit sur les
 * vraies données de l'app (alertes, ordres stop, règles auto-trader, journal
 * des ordres), soit sur les événements de pratique (table practice_events)
 * enregistrés quand un outil sans persistance propre est réellement utilisé
 * (calculateur, corrélation) ou consulté (débriefing, performance).
 *
 * La liste des slugs doit rester alignée avec LESSONS dans
 * artifacts/wealthsimple-tracker/src/data/parcoursContent.ts.
 */
import {
  db,
  alertsTable,
  ordersTable,
  autoTradeRulesTable,
  practiceEventsTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

export interface PracticeStatus {
  slug: string;
  done: boolean;
  /** Critère en français, affiché tel quel dans l'UI. */
  criteria: string;
  /** Détail de ce qui a été détecté (ou de ce qui manque). */
  detail: string;
}

/** Outils autorisés dans POST /learn-practice/events (outils purement client). */
export const CLIENT_PRACTICE_TOOLS = ["calculator", "calculator-rr", "correlation"] as const;
export type ClientPracticeTool = (typeof CLIENT_PRACTICE_TOOLS)[number];

/** Outils enregistrés côté serveur lors de la consultation des routes GET. */
export type ServerPracticeTool = "debrief" | "performance";

export async function recordPracticeEvent(tool: ClientPracticeTool | ServerPracticeTool): Promise<void> {
  await db.insert(practiceEventsTable).values({ tool });
}

/** Début du jour courant en UTC — même convention que le débriefing quotidien. */
function todayStartUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function getPracticeStatuses(): Promise<PracticeStatus[]> {
  const [alerts, stopOrders, anyOrders, rules, events] = await Promise.all([
    db.select({ symbol: alertsTable.symbol }).from(alertsTable),
    db
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(and(eq(ordersTable.orderType, "stop"), sql`upper(${ordersTable.side}) = 'SELL'`))
      .limit(1),
    db.select({ id: ordersTable.id }).from(ordersTable).limit(1),
    db.select({ enabled: autoTradeRulesTable.enabled }).from(autoTradeRulesTable),
    db.select({ tool: practiceEventsTable.tool, createdAt: practiceEventsTable.createdAt }).from(practiceEventsTable),
  ]);

  const todayStart = todayStartUTC();
  const countTool = (tool: string) => events.filter((e) => e.tool === tool).length;
  const calculatorCount = countTool("calculator");
  const hasCalculatorRR = countTool("calculator-rr") > 0;
  const debriefToday = events.some((e) => e.tool === "debrief" && e.createdAt >= todayStart);
  const debriefDays = new Set(
    events.filter((e) => e.tool === "debrief").map((e) => e.createdAt.toISOString().slice(0, 10)),
  ).size;

  // ≥ 2 alertes sur le même titre = deux niveaux de sortie posés (sorties partielles).
  const alertsBySymbol = new Map<string, number>();
  for (const a of alerts) alertsBySymbol.set(a.symbol, (alertsBySymbol.get(a.symbol) ?? 0) + 1);
  const hasTwoAlertsSameSymbol = [...alertsBySymbol.values()].some((n) => n >= 2);

  const hasRule = rules.length > 0;
  const hasEnabledRule = rules.some((r) => r.enabled);
  const hasStopOrder = stopOrders.length > 0;
  const hasAnyOrder = anyOrders.length > 0;
  const hasCorrelation = countTool("correlation") > 0;
  const hasPerformance = countTool("performance") > 0;

  return [
    {
      slug: "plan-de-trade",
      done: alerts.length > 0,
      criteria: "Créer au moins une alerte de prix (objectif ou stop).",
      detail: alerts.length > 0 ? `${alerts.length} alerte(s) créée(s).` : "Aucune alerte créée pour l'instant.",
    },
    {
      slug: "taille-de-position",
      done: calculatorCount > 0,
      criteria: "Effectuer un calcul complet dans le calculateur de position.",
      detail: calculatorCount > 0 ? `${calculatorCount} calcul(s) effectué(s).` : "Aucun calcul effectué pour l'instant.",
    },
    {
      slug: "stop-loss",
      done: hasStopOrder,
      criteria: "Poser un ordre stop de protection (vente) sur la page Courtier.",
      detail: hasStopOrder ? "Un ordre stop de protection a été posé." : "Aucun ordre stop posé pour l'instant.",
    },
    {
      slug: "risque-rendement",
      done: hasCalculatorRR,
      criteria: "Calculer un ratio R:R dans le calculateur (entrée + stop + objectif).",
      detail: hasCalculatorRR ? "Un ratio R:R a été calculé." : "Aucun calcul avec objectif (R:R) pour l'instant.",
    },
    {
      slug: "psychologie",
      done: debriefToday,
      criteria: "Consulter le débriefing quotidien aujourd'hui.",
      detail: debriefToday ? "Débriefing du jour consulté." : "Le débriefing d'aujourd'hui n'a pas encore été consulté.",
    },
    {
      slug: "journal-de-trading",
      done: hasAnyOrder,
      criteria: "Avoir au moins un ordre dans le journal à relire.",
      detail: hasAnyOrder ? "Le journal contient des ordres à analyser." : "Le journal des ordres est vide pour l'instant.",
    },
    {
      slug: "coupe-circuit",
      done: hasRule,
      criteria: "Créer au moins une règle Auto-Trader.",
      detail: hasRule ? `${rules.length} règle(s) Auto-Trader créée(s).` : "Aucune règle Auto-Trader pour l'instant.",
    },
    {
      slug: "esperance-mathematique",
      done: hasPerformance,
      criteria: "Consulter la page Performance (espérance réelle).",
      detail: hasPerformance ? "Page Performance consultée." : "La page Performance n'a pas encore été consultée.",
    },
    {
      slug: "sorties-partielles",
      done: hasTwoAlertsSameSymbol,
      criteria: "Poser au moins deux alertes sur le même titre (deux niveaux de sortie).",
      detail: hasTwoAlertsSameSymbol
        ? "Deux niveaux d'alerte détectés sur un même titre."
        : "Pas encore deux alertes sur un même titre.",
    },
    {
      slug: "correlation-exposition",
      done: hasCorrelation,
      criteria: "Analyser la corrélation d'au moins deux titres sur la page Corrélation.",
      detail: hasCorrelation ? "Analyse de corrélation effectuée." : "Aucune analyse de corrélation pour l'instant.",
    },
    {
      slug: "pyramider",
      done: calculatorCount >= 2,
      criteria: "Effectuer au moins deux calculs de taille (position initiale + ajout).",
      detail: `${calculatorCount} calcul(s) effectué(s) sur 2 requis.`,
    },
    {
      slug: "biais-cognitifs",
      done: debriefDays >= 2,
      criteria: "Consulter le débriefing sur au moins deux jours différents (routine).",
      detail: `${debriefDays} jour(s) de débriefing sur 2 requis.`,
    },
    {
      slug: "drawdown",
      done: hasEnabledRule,
      criteria: "Avoir au moins une règle Auto-Trader active (protection automatique).",
      detail: hasEnabledRule ? "Une règle Auto-Trader est active." : "Aucune règle Auto-Trader active pour l'instant.",
    },
  ];
}
