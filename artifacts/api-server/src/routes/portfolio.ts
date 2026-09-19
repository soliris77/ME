/**
 * /api/portfolio — ce que tu possèdes, ce que tu l'as payé, ce que ça vaut.
 *
 * La route `/api/broker/allocation` répond déjà à « comment est réparti mon
 * argent ». Elle ne répond pas à « est-ce que ça monte », parce qu'elle ne lit
 * pas le prix moyen d'achat que SnapTrade fournit sur chaque position. C'est
 * exactement ce que cette route ajoute — sans rien changer à l'autre, qui
 * continue d'alimenter la page Courtier telle quelle.
 *
 * Deux principes tenus ici :
 *
 *  1. On ne mélange jamais deux devises en silence. Chaque montant existe en
 *     devise native ET en CAD ; quand un taux manque, on le dit (`fxWarning`)
 *     et on exclut le montant des totaux plutôt que de le convertir au pif.
 *
 *  2. Une position dont SnapTrade ne donne pas le prix moyen n'est pas une
 *     position à gain nul : elle est marquée `hasCost: false` et reste hors
 *     des totaux de gain. Un faux zéro est pire qu'un trou déclaré.
 */
import { Router } from "express";
import { listPositions, listBalances } from "../lib/snaptrade";
import { getQuotes } from "../lib/yahoo";
import { resolveAuthoritativeConnection } from "../lib/connectionResolver";
import { logger } from "../lib/logger";

const router = Router();

interface Connexion {
  readonly status: string;
  readonly snaptradeUserId: string | null;
  readonly snaptradeUserSecret: string | null;
  readonly accounts: unknown;
  readonly lastSyncedAt: Date | null;
}

async function connexion(): Promise<Connexion | null> {
  try {
    return (await resolveAuthoritativeConnection()) as unknown as Connexion;
  } catch {
    return null;
  }
}

function identifiants(conn: Connexion): { userId: string; userSecret: string } {
  if (!conn.snaptradeUserId || !conn.snaptradeUserSecret) {
    throw new Error("Identifiants SnapTrade manquants");
  }
  return { userId: conn.snaptradeUserId, userSecret: conn.snaptradeUserSecret };
}

/** Premier nombre fini et non nul parmi les candidats, sinon `null`. */
function premierNombre(...candidats: unknown[]): number | null {
  for (const c of candidats) {
    const n = Number(c);
    if (Number.isFinite(n) && n !== 0) return n;
  }
  return null;
}

interface PositionBrute {
  symbol: string;
  description: string | null;
  units: number;
  price: number;
  currency: string;
  /** Prix moyen payé par unité, quand le courtier le donne. */
  avgCost: number | null;
}

/**
 * SnapTrade ne normalise pas complètement la forme d'une position : selon le
 * courtier, le symbole et la devise vivent à des profondeurs différentes. Ces
 * chaînes de repli viennent de la route `allocation`, qui les a déjà éprouvées
 * sur des données réelles.
 */
function lirePosition(raw: unknown): PositionBrute | null {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const p = raw as any;
  const symbol: string = String(
    p?.symbol?.symbol?.symbol ?? p?.symbol?.symbol?.ticker ?? p?.symbol?.ticker ?? "",
  ).toUpperCase();
  const units = Number(p?.units ?? p?.quantity ?? 0);
  const price = Number(p?.price ?? p?.current_price ?? 0);
  if (!symbol || !Number.isFinite(units) || units === 0) return null;
  // Les équivalents de trésorerie sont déjà comptés dans le solde espèces.
  if (p?.cash_equivalent === true) return null;

  const currency = String(
    p?.currency?.code
      ?? p?.symbol?.symbol?.currency?.code
      ?? p?.symbol?.currency?.code
      ?? "USD",
  ).toUpperCase();

  const description: string | null =
    p?.symbol?.symbol?.description ?? p?.symbol?.description ?? null;

  // Le champ canonique est `average_purchase_price`. Les autres sont des
  // replis observés chez certains courtiers.
  const avgCost = premierNombre(
    p?.average_purchase_price,
    p?.averagePurchasePrice,
    p?.average_buy_price,
    p?.averageBuyPrice,
    p?.cost_basis,
  );

  return { symbol, description, units, price, currency, avgCost };
}

interface PositionSortie extends PositionBrute {
  marketValue: number;
  marketValueCad: number | null;
  costBasis: number | null;
  costBasisCad: number | null;
  pnl: number | null;
  pnlCad: number | null;
  pnlPct: number | null;
  /** `false` quand le courtier ne donne pas le prix moyen payé. */
  hasCost: boolean;
}

// ─── GET /api/portfolio ───────────────────────────────────────────────────────
router.get("/portfolio", async (req, res) => {
  try {
    const conn = await connexion();
    if (!conn) {
      return res.json({
        connected: false,
        reason: "not_setup",
        message: "Courtier non configuré. Configure la connexion sur la page Courtier.",
      });
    }
    if (conn.status !== "connected") {
      return res.json({
        connected: false,
        reason: conn.status,
        message: "Connexion courtier pas encore active. Termine la liaison puis synchronise.",
      });
    }

    const comptes = ((conn.accounts as { id?: string; name?: string }[] | null) ?? [])
      .filter((a) => typeof a?.id === "string");
    if (comptes.length === 0) {
      return res.json({
        connected: true,
        empty: true,
        message: "Aucun compte synchronisé. Clique « Synchroniser maintenant » sur la page Courtier.",
      });
    }

    const { userId, userSecret } = identifiants(conn);
    const erreurs: { accountId: string; name: string | null; error: string }[] = [];
    const brutes: PositionBrute[] = [];
    const especes = new Map<string, number>();

    await Promise.all(comptes.map(async (compte) => {
      const accountId = compte.id as string;
      try {
        const [positions, soldes] = await Promise.all([
          listPositions(userId, userSecret, accountId),
          listBalances(userId, userSecret, accountId),
        ]);
        for (const raw of positions as unknown[]) {
          const lue = lirePosition(raw);
          if (lue !== null) brutes.push(lue);
        }
        for (const raw of soldes as unknown[]) {
          /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
          const b = raw as any;
          const devise = String(b?.currency?.code ?? b?.currency ?? "").toUpperCase();
          const montant = Number(b?.cash ?? 0);
          if (!devise || !Number.isFinite(montant)) continue;
          especes.set(devise, (especes.get(devise) ?? 0) + montant);
        }
      } catch (err) {
        erreurs.push({ accountId, name: compte.name ?? null, error: String(err) });
      }
    }));

    if (brutes.length === 0 && especes.size === 0 && erreurs.length > 0) {
      return res.status(502).json({
        connected: true,
        error: "Impossible de récupérer les positions depuis SnapTrade.",
        accountErrors: erreurs,
      });
    }

    // ── Taux de change vers le CAD ──
    const etrangeres = new Set<string>();
    for (const p of brutes) if (p.currency !== "CAD") etrangeres.add(p.currency);
    for (const c of especes.keys()) if (c !== "CAD") etrangeres.add(c);

    const taux = new Map<string, number>([["CAD", 1]]);
    let fxWarning: string | null = null;
    if (etrangeres.size > 0) {
      const quotes = await getQuotes([...etrangeres].map((c) => `${c}CAD=X`));
      for (const q of quotes) {
        const devise = q.symbol.replace("CAD=X", "");
        if (q.price > 0) taux.set(devise, q.price);
      }
      const manquantes = [...etrangeres].filter((c) => !taux.has(c));
      if (manquantes.length > 0) {
        fxWarning = `Taux de change indisponible pour : ${manquantes.join(", ")}. `
          + "Ces montants sont exclus des totaux.";
      }
    }
    const versCad = (montant: number, devise: string): number | null => {
      const t = taux.get(devise);
      return t === undefined ? null : montant * t;
    };

    // ── Regroupement par symbole : une même action détenue dans deux comptes
    //    est une seule ligne, avec un prix moyen pondéré par les unités. ──
    const parSymbole = new Map<string, PositionBrute>();
    for (const p of brutes) {
      const cle = `${p.symbol}|${p.currency}`;
      const deja = parSymbole.get(cle);
      if (deja === undefined) {
        parSymbole.set(cle, { ...p });
        continue;
      }
      const unites = deja.units + p.units;
      // Le prix moyen n'a de sens que si les deux côtés en ont un.
      const avgCost =
        deja.avgCost !== null && p.avgCost !== null && unites !== 0
          ? (deja.avgCost * deja.units + p.avgCost * p.units) / unites
          : null;
      parSymbole.set(cle, {
        ...deja,
        units: unites,
        price: p.price > 0 ? p.price : deja.price,
        avgCost,
      });
    }

    const positions: PositionSortie[] = [...parSymbole.values()].map((p) => {
      const marketValue = p.units * p.price;
      const hasCost = p.avgCost !== null;
      const costBasis = hasCost ? p.units * (p.avgCost as number) : null;
      const pnl = costBasis === null ? null : marketValue - costBasis;
      return {
        ...p,
        marketValue,
        marketValueCad: versCad(marketValue, p.currency),
        costBasis,
        costBasisCad: costBasis === null ? null : versCad(costBasis, p.currency),
        pnl,
        pnlCad: pnl === null ? null : versCad(pnl, p.currency),
        pnlPct: costBasis === null || costBasis === 0 ? null : ((pnl as number) / Math.abs(costBasis)) * 100,
        hasCost,
      };
    }).sort((a, b) => (b.marketValueCad ?? 0) - (a.marketValueCad ?? 0));

    // ── Totaux. Le gain total ne compte que les lignes dont on connaît le
    //    prix payé — sinon on afficherait un gain trop beau, gratuitement. ──
    let marketValueCad = 0;
    let costBasisCad = 0;
    let marketValueAvecCoutCad = 0;
    let positionsSansCout = 0;
    for (const p of positions) {
      if (p.marketValueCad !== null) marketValueCad += p.marketValueCad;
      if (p.hasCost && p.costBasisCad !== null && p.marketValueCad !== null) {
        costBasisCad += p.costBasisCad;
        marketValueAvecCoutCad += p.marketValueCad;
      } else {
        positionsSansCout += 1;
      }
    }

    let cashCad = 0;
    for (const [devise, montant] of especes) {
      const v = versCad(montant, devise);
      if (v !== null) cashCad += v;
    }

    const pnlCad = costBasisCad > 0 ? marketValueAvecCoutCad - costBasisCad : null;
    const totalCad = marketValueCad + cashCad;

    return res.json({
      connected: true,
      empty: positions.length === 0 && especes.size === 0,
      asOf: new Date().toISOString(),
      lastSyncedAt: conn.lastSyncedAt?.toISOString() ?? null,
      baseCurrency: "CAD",
      /** Multiplicateur devise → CAD. Pour afficher en USD : montantCad / fxRates.USD. */
      fxRates: Object.fromEntries(taux),
      fxWarning,
      accountErrors: erreurs,
      totals: {
        marketValueCad,
        cashCad,
        totalCad,
        costBasisCad: costBasisCad > 0 ? costBasisCad : null,
        pnlCad,
        pnlPct: pnlCad !== null && costBasisCad > 0 ? (pnlCad / costBasisCad) * 100 : null,
        cashPct: totalCad > 0 ? (cashCad / totalCad) * 100 : 0,
        positionsSansCout,
      },
      cashByCurrency: [...especes.entries()]
        .map(([currency, amount]) => ({ currency, amount, amountCad: versCad(amount, currency) }))
        .sort((a, b) => (b.amountCad ?? 0) - (a.amountCad ?? 0)),
      positions,
    });
  } catch (err) {
    logger.error({ err }, "portfolio: echec");
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
