/**
 * /api/plans — ordres à cours limité et achats récurrents.
 *
 * ── Pourquoi ce fichier n'est pas dans orderEngine ──────────────────────────
 *
 * `submitOrder()` est le seul chemin par lequel un ordre part chez le courtier,
 * et il porte déjà tous les garde-fous : idempotence, kill-switch, heures de
 * marché, valeur maximale, exposition du portefeuille, mode paper/live. Il
 * n'accepte que `market` et `stop`, en liste blanche stricte, et refuse tout le
 * reste — « jamais de repli silencieux vers un ordre market réel », dit le
 * commentaire d'origine. C'est une bonne décision.
 *
 * Plutôt que d'ouvrir cette liste blanche, ce module construit les deux
 * fonctions demandées PAR-DESSUS :
 *
 *   • Cours limité — un plan garde le prix voulu. Quand la cotation le
 *     franchit, on envoie un ordre `market` par `submitOrder()`.
 *   • Achat récurrent — un plan garde une cadence. Quand l'échéance tombe,
 *     même chose.
 *
 * Conséquence à assumer, écrite aussi à l'écran : **ce n'est pas un vrai ordre
 * limite**. Il ne dort pas dans le carnet du courtier, il ne garantit pas le
 * prix, et il ne se déclenche que quand ce code tourne. Un vrai limite exige de
 * toucher `orderEngine` et la couche SnapTrade — un lot à part, à faire quand
 * les tests peuvent tourner.
 *
 * ── Ce qui ne peut pas arriver ──────────────────────────────────────────────
 *
 *   • Un plan naît `enabled = false`. Rien ne part tant qu'on ne l'allume pas.
 *   • `executerPlansDus()` n'est appelé que par une route explicite. Rien ne
 *     s'auto-planifie à l'import de ce fichier.
 *   • Une exécution par plan et par passage, au maximum.
 *   • Tout passe par `submitOrder()`. Aucun nouveau chemin vers le courtier.
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { submitOrder, OrderValidationError } from "../lib/orderEngine";
import { getQuotes } from "../lib/yahoo";
import { logAudit } from "../lib/audit";
import { logger } from "../lib/logger";

const router = Router();

export type GenrePlan = "limit" | "recurring";
export type Cadence = "daily" | "weekly" | "monthly";

const CADENCES: readonly Cadence[] = ["daily", "weekly", "monthly"];

/**
 * La table est créée à la demande plutôt que par un fichier de migration :
 * la numérotation des migrations diffère entre le dépôt et le conteneur, et
 * une migration au mauvais numéro casse plus de choses qu'elle n'en répare.
 * `CREATE TABLE IF NOT EXISTS` est idempotent et sans effet si elle existe.
 */
let tablePrete = false;
async function assurerTable(): Promise<void> {
  if (tablePrete) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS trade_plans (
      id            serial PRIMARY KEY,
      kind          text NOT NULL,
      symbol        text NOT NULL,
      side          text NOT NULL DEFAULT 'buy',
      quantity      numeric(20, 8) NOT NULL,
      limit_price   numeric(20, 8),
      cadence       text,
      account_id    text,
      enabled       boolean NOT NULL DEFAULT false,
      runs_done     integer NOT NULL DEFAULT 0,
      max_runs      integer,
      last_run_at   timestamptz,
      next_run_at   timestamptz,
      last_status   text,
      last_message  text,
      created_at    timestamptz NOT NULL DEFAULT now()
    )
  `);
  tablePrete = true;
}

export interface Plan {
  id: number;
  kind: GenrePlan;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  limitPrice: number | null;
  cadence: Cadence | null;
  accountId: string | null;
  enabled: boolean;
  runsDone: number;
  maxRuns: number | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: string | null;
  lastMessage: string | null;
  createdAt: string;
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function versPlan(r: any): Plan {
  return {
    id: Number(r.id),
    kind: r.kind === "recurring" ? "recurring" : "limit",
    symbol: String(r.symbol),
    side: r.side === "sell" ? "sell" : "buy",
    quantity: Number(r.quantity),
    limitPrice: r.limit_price === null ? null : Number(r.limit_price),
    cadence: (CADENCES as readonly string[]).includes(r.cadence) ? (r.cadence as Cadence) : null,
    accountId: r.account_id ?? null,
    enabled: r.enabled === true,
    runsDone: Number(r.runs_done ?? 0),
    maxRuns: r.max_runs === null || r.max_runs === undefined ? null : Number(r.max_runs),
    lastRunAt: r.last_run_at ? new Date(r.last_run_at).toISOString() : null,
    nextRunAt: r.next_run_at ? new Date(r.next_run_at).toISOString() : null,
    lastStatus: r.last_status ?? null,
    lastMessage: r.last_message ?? null,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function lignes(resultat: any): any[] {
  // node-postgres rend { rows }, d'autres pilotes rendent directement un tableau.
  return Array.isArray(resultat) ? resultat : (resultat?.rows ?? []);
}

function prochaineEcheance(cadence: Cadence, depuis: Date): Date {
  const d = new Date(depuis.getTime());
  if (cadence === "daily") d.setUTCDate(d.getUTCDate() + 1);
  else if (cadence === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

// ─── GET /api/plans ───────────────────────────────────────────────────────────
router.get("/plans", async (_req, res) => {
  try {
    await assurerTable();
    const r = await db.execute(sql`SELECT * FROM trade_plans ORDER BY created_at DESC`);
    return res.json({ plans: lignes(r).map(versPlan) });
  } catch (err) {
    logger.error({ err }, "plans: lecture echouee");
    return res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/plans ──────────────────────────────────────────────────────────
// Crée un plan. Toujours éteint à la naissance — allumer est un geste séparé.
router.post("/plans", async (req, res) => {
  try {
    await assurerTable();
    const { kind, symbol, side, quantity, limitPrice, cadence, accountId, maxRuns } =
      req.body as Record<string, unknown>;

    if (kind !== "limit" && kind !== "recurring") {
      return res.status(400).json({ error: "kind doit être 'limit' ou 'recurring'." });
    }
    const sym = String(symbol ?? "").trim().toUpperCase();
    if (sym === "") return res.status(400).json({ error: "Le symbole est requis." });

    const cote = side === "sell" ? "sell" : "buy";
    const qte = Number(quantity);
    if (!Number.isFinite(qte) || qte <= 0) {
      return res.status(400).json({ error: "La quantité doit être un nombre positif." });
    }

    let prix: number | null = null;
    let cad: Cadence | null = null;
    let prochaine: Date | null = null;

    if (kind === "limit") {
      prix = Number(limitPrice);
      if (!Number.isFinite(prix) || prix <= 0) {
        return res.status(400).json({ error: "Un plan à cours limité exige un prix positif." });
      }
    } else {
      if (!CADENCES.includes(cadence as Cadence)) {
        return res.status(400).json({ error: "cadence doit être 'daily', 'weekly' ou 'monthly'." });
      }
      cad = cadence as Cadence;
      // Première échéance : à la prochaine période, jamais immédiatement.
      // Un plan qui s'exécute à la seconde où on le crée surprend toujours.
      prochaine = prochaineEcheance(cad, new Date());
    }

    const limite = maxRuns === undefined || maxRuns === null ? null : Number(maxRuns);
    if (limite !== null && (!Number.isInteger(limite) || limite <= 0)) {
      return res.status(400).json({ error: "maxRuns doit être un entier positif, ou absent." });
    }

    const r = await db.execute(sql`
      INSERT INTO trade_plans (kind, symbol, side, quantity, limit_price, cadence, account_id, max_runs, next_run_at)
      VALUES (${kind}, ${sym}, ${cote}, ${qte}, ${prix}, ${cad}, ${accountId ?? null}, ${limite}, ${prochaine})
      RETURNING *
    `);
    const plan = versPlan(lignes(r)[0]);
    await logAudit("plan.create", `Plan ${kind} créé sur ${sym} (éteint).`, { planId: plan.id });
    return res.status(201).json({ plan });
  } catch (err) {
    logger.error({ err }, "plans: creation echouee");
    return res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/plans/:id/enabled ──────────────────────────────────────────────
// Allumer exige une confirmation explicite ; éteindre n'a aucune condition et
// ne peut pas échouer — c'est la même règle que le bouton DÉSARMER des perps.
router.post("/plans/:id/enabled", async (req, res) => {
  try {
    await assurerTable();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Identifiant invalide." });
    }
    const { enabled, acknowledged } = req.body as { enabled?: unknown; acknowledged?: unknown };
    const allumer = enabled === true;

    if (allumer && acknowledged !== true) {
      return res.status(400).json({
        error: "Allumer un plan envoie de vrais ordres : la confirmation doit être cochée.",
      });
    }

    const r = await db.execute(sql`
      UPDATE trade_plans SET enabled = ${allumer} WHERE id = ${id} RETURNING *
    `);
    const row = lignes(r)[0];
    if (row === undefined) return res.status(404).json({ error: "Plan introuvable." });

    await logAudit(
      allumer ? "plan.enable" : "plan.disable",
      `Plan #${id} ${allumer ? "allumé" : "éteint"}.`,
      { planId: id },
    );
    return res.json({ plan: versPlan(row) });
  } catch (err) {
    logger.error({ err }, "plans: bascule echouee");
    return res.status(500).json({ error: String(err) });
  }
});

// ─── DELETE /api/plans/:id ────────────────────────────────────────────────────
router.delete("/plans/:id", async (req, res) => {
  try {
    await assurerTable();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Identifiant invalide." });
    }
    await db.execute(sql`DELETE FROM trade_plans WHERE id = ${id}`);
    await logAudit("plan.delete", `Plan #${id} supprimé.`, { planId: id });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

export interface ResultatPassage {
  planId: number;
  symbol: string;
  /** Ce qui s'est passé, en un mot, pour la colonne « dernier passage ». */
  status: "attente" | "envoye" | "refuse" | "doublon" | "erreur";
  message: string;
}

/**
 * Regarde chaque plan allumé et exécute ceux qui sont dus. Une exécution par
 * plan et par passage, au maximum.
 *
 * Exporté pour être branché sur le planificateur existant quand on voudra ;
 * pour l'instant seule la route ci-dessous l'appelle, et le bouton
 * « Vérifier maintenant » de la page Plans.
 */
export async function executerPlansDus(): Promise<ResultatPassage[]> {
  await assurerTable();
  const r = await db.execute(sql`SELECT * FROM trade_plans WHERE enabled = true`);
  const plans = lignes(r).map(versPlan);
  if (plans.length === 0) return [];

  // Une seule requête de cotations pour tous les plans à cours limité.
  const aCoter = [...new Set(plans.filter((p) => p.kind === "limit").map((p) => p.symbol))];
  const cotations = new Map<string, number>();
  if (aCoter.length > 0) {
    try {
      for (const q of await getQuotes(aCoter)) {
        if (q.price > 0) cotations.set(q.symbol.toUpperCase(), q.price);
      }
    } catch (err) {
      logger.warn({ err }, "plans: cotations indisponibles, les plans limite attendent");
    }
  }

  const maintenant = new Date();
  const resultats: ResultatPassage[] = [];

  for (const plan of plans) {
    if (plan.maxRuns !== null && plan.runsDone >= plan.maxRuns) {
      await db.execute(sql`UPDATE trade_plans SET enabled = false WHERE id = ${plan.id}`);
      resultats.push({ planId: plan.id, symbol: plan.symbol, status: "attente", message: "Nombre de passages atteint — plan éteint." });
      continue;
    }

    let declencher = false;
    let prixAttendu: number | undefined;

    if (plan.kind === "limit") {
      const prix = cotations.get(plan.symbol);
      if (prix === undefined) {
        resultats.push({ planId: plan.id, symbol: plan.symbol, status: "attente", message: "Cotation indisponible." });
        continue;
      }
      prixAttendu = prix;
      declencher = plan.side === "buy"
        ? prix <= (plan.limitPrice ?? Number.NEGATIVE_INFINITY)
        : prix >= (plan.limitPrice ?? Number.POSITIVE_INFINITY);
      if (!declencher) {
        resultats.push({
          planId: plan.id, symbol: plan.symbol, status: "attente",
          message: `${prix.toFixed(2)} — seuil ${plan.limitPrice?.toFixed(2)} pas franchi.`,
        });
        continue;
      }
    } else {
      const echeance = plan.nextRunAt === null ? null : new Date(plan.nextRunAt);
      if (echeance === null || echeance.getTime() > maintenant.getTime()) {
        resultats.push({
          planId: plan.id, symbol: plan.symbol, status: "attente",
          message: echeance === null ? "Aucune échéance." : `Prochaine échéance ${echeance.toISOString()}.`,
        });
        continue;
      }
      declencher = true;
    }

    /* Identifiant d'idempotence : si deux passages se chevauchent, le second
       est absorbé par le garde-fou de doublon de submitOrder au lieu de
       doubler la position. Granularité minute, volontairement grossière. */
    const empreinte = maintenant.toISOString().slice(0, 16).replace(/[-:T]/g, "");
    const signalId = `plan-${plan.id}-${empreinte}`;

    let status: ResultatPassage["status"] = "erreur";
    let message = "";
    try {
      const envoi = await submitOrder({
        signalId,
        symbol: plan.symbol,
        side: plan.side,
        quantity: plan.quantity,
        accountId: plan.accountId ?? undefined,
        expectedPrice: prixAttendu,
        source: plan.kind === "limit" ? "plan_limite" : "plan_recurrent",
        orderType: "market",
        brokerConnection: {},
      });

      if (envoi.status === "rejected") {
        status = "refuse";
        message = String(envoi.message ?? envoi.reason ?? "Refusé par les garde-fous.");
      } else if (envoi.status === "duplicate") {
        status = "doublon";
        message = "Doublon absorbé — aucun ordre supplémentaire.";
      } else {
        status = "envoye";
        message = `Ordre ${plan.side} ${plan.quantity} ${plan.symbol} soumis.`;
      }
    } catch (err) {
      status = "erreur";
      message = err instanceof OrderValidationError ? String(err) : String(err);
      logger.error({ err, planId: plan.id }, "plans: echec d'execution");
    }

    // Un refus n'avance pas le compteur : le plan retentera à la prochaine
    // échéance. Un envoi, si.
    const avance = status === "envoye" ? 1 : 0;
    const prochaine = plan.kind === "recurring" && plan.cadence !== null && status === "envoye"
      ? prochaineEcheance(plan.cadence, maintenant)
      : plan.nextRunAt === null ? null : new Date(plan.nextRunAt);

    // Un plan à cours limité ne se déclenche qu'une fois : le seuil franchi,
    // il s'éteint. Sinon il rachèterait à chaque passage tant que le prix
    // reste sous le seuil — ce qui viderait le compte.
    const resteAllume = plan.kind === "limit" && status === "envoye" ? false : true;

    await db.execute(sql`
      UPDATE trade_plans SET
        runs_done    = runs_done + ${avance},
        last_run_at  = ${maintenant},
        next_run_at  = ${prochaine},
        last_status  = ${status},
        last_message = ${message},
        enabled      = ${resteAllume}
      WHERE id = ${plan.id}
    `);

    await logAudit("plan.run", `Plan #${plan.id} (${plan.symbol}) : ${status} — ${message}`, {
      planId: plan.id, status, signalId,
    });
    resultats.push({ planId: plan.id, symbol: plan.symbol, status, message });
  }

  return resultats;
}

// ─── POST /api/plans/run-due ──────────────────────────────────────────────────
// Le seul déclencheur. Appelé par le bouton « Vérifier maintenant », ou par le
// planificateur une fois qu'on l'y aura branché.
router.post("/plans/run-due", async (_req, res) => {
  try {
    const resultats = await executerPlansDus();
    return res.json({ ranAt: new Date().toISOString(), results: resultats });
  } catch (err) {
    logger.error({ err }, "plans: passage echoue");
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
