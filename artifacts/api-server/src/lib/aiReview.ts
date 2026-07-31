/**
 * Second avis — revue de risque locale (gratuite) avant soumission d'un ordre auto.
 * ─────────────────────────────────────────────────────────────────────────────
 * Un réviseur DÉTERMINISTE et LOCAL (aucun appel réseau) examine le contexte
 * d'un trade et peut le BLOQUER avec une explication en français. C'est un
 * garde-fou supplémentaire : les règles techniques verrouillent déjà les entrées.
 *
 * Si OPENAI_API_KEY est présente, on tente d'abord OpenAI (meilleure qualité) et
 * on RETOMBE sur le réviseur local en cas d'erreur — jamais null. Sans clé, on
 * utilise directement le réviseur local. getAiSecondOpinion ne renvoie donc
 * essentiellement jamais null : un avis est toujours rendu.
 */
import { logger } from "./logger";

export interface AiReviewContext {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  changePercent?: number | null;
  signalScore?: number | null;
  signalVerdict?: string | null;
  ruleName?: string | null;
  sideMode?: string | null;
  minScore?: number | null;
  /** Résumés des ~5 derniers auto_trade_logs de cette règle (contexte historique, texte libre). */
  recentOutcomes: string[];
  /**
   * Classification structurée des derniers déclenchements (du plus récent au plus
   * ancien) : "loss" = stop-loss touché ou ordre rejeté/bloqué/en erreur ;
   * "win" = take-profit ; "neutral" = autre. Fournie par le worker pour un
   * verdict local fiable sans re-parsing du texte libre.
   */
  recentTradeOutcomes?: ("win" | "loss" | "neutral")[];
  /** Score du signal hebdomadaire s'il a déjà été calculé par le worker (sinon absent). */
  weeklySignalScore?: number | null;
  source?: "technical" | "copy";
}

export interface AiReviewResult {
  verdict: "approve" | "block";
  reason: string;
}

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";
const TIMEOUT_MS = 10_000;

// ── Seuils du réviseur local (conservateurs : bloquer uniquement les signaux
// d'alerte clairs) ────────────────────────────────────────────────────────────
const EXTREME_MOVE_PCT = 8;        // mouvement du jour extrême contre le trade
const HIGH_VOLATILITY_PCT = 5;     // volatilité du jour élevée
const NEAR_THRESHOLD_MARGIN = 5;   // score « à peine » au-dessus du seuil (± points)
const LOSING_STREAK = 3;           // nb de pertes/échecs consécutifs → pause

/**
 * Réviseur LOCAL déterministe : même forme de sortie que l'IA, raisons en
 * français. Ne fait aucun appel réseau. Bloque uniquement sur des signaux
 * d'alerte clairs, approuve sinon.
 */
export function localSecondOpinion(ctx: AiReviewContext): AiReviewResult {
  const score = typeof ctx.signalScore === "number" ? ctx.signalScore : null;
  const verdict = (ctx.signalVerdict ?? "").toUpperCase();
  const change = typeof ctx.changePercent === "number" && Number.isFinite(ctx.changePercent)
    ? ctx.changePercent : null;
  const minScore = typeof ctx.minScore === "number" ? ctx.minScore : null;

  // ── 1. Signal contradictoire ────────────────────────────────────────────────
  // ACHAT avec score négatif / VENTE avec score positif, ou verdict opposé au sens.
  if (score != null) {
    if (ctx.side === "BUY" && score < 0) {
      return { verdict: "block", reason: `Signal contradictoire : ordre d'achat alors que le score technique est négatif (${score}). Trade bloqué par prudence.` };
    }
    if (ctx.side === "SELL" && score > 0) {
      return { verdict: "block", reason: `Signal contradictoire : ordre de vente alors que le score technique est positif (${score}). Trade bloqué par prudence.` };
    }
  }
  const verdictSaysSell = verdict.includes("VENTE");
  const verdictSaysBuy = verdict.includes("ACHAT");
  if (ctx.side === "BUY" && verdictSaysSell) {
    return { verdict: "block", reason: `Signal contradictoire : le verdict « ${ctx.signalVerdict} » s'oppose à un achat. Trade bloqué par prudence.` };
  }
  if (ctx.side === "SELL" && verdictSaysBuy) {
    return { verdict: "block", reason: `Signal contradictoire : le verdict « ${ctx.signalVerdict} » s'oppose à une vente. Trade bloqué par prudence.` };
  }

  // ── 2. Mouvement extrême du jour contre le sens du trade ────────────────────
  // Achat pendant un plongeon violent (≤ -8 %) ou vente pendant une flambée (≥ +8 %).
  if (change != null && Math.abs(change) >= EXTREME_MOVE_PCT) {
    if (ctx.side === "BUY" && change <= -EXTREME_MOVE_PCT) {
      return { verdict: "block", reason: `Mouvement extrême : ${ctx.symbol} plonge de ${change.toFixed(1)} % aujourd'hui. Acheter en pleine chute est risqué, trade bloqué par prudence.` };
    }
    if (ctx.side === "SELL" && change >= EXTREME_MOVE_PCT) {
      return { verdict: "block", reason: `Mouvement extrême : ${ctx.symbol} bondit de +${change.toFixed(1)} % aujourd'hui. Vendre en pleine flambée est risqué, trade bloqué par prudence.` };
    }
  }

  // ── 3. Série perdante : 3 derniers déclenchements en perte/échec ────────────
  const outcomes = ctx.recentTradeOutcomes ?? [];
  if (outcomes.length >= LOSING_STREAK && outcomes.slice(0, LOSING_STREAK).every((o) => o === "loss")) {
    return { verdict: "block", reason: `3 trades perdants d'affilée sur cette règle, faites une pause. Trade bloqué par prudence.` };
  }

  // ── 4. Score à peine au seuil ET forte volatilité du jour ───────────────────
  if (score != null && minScore != null && change != null) {
    const nearThreshold = Math.abs(score) <= minScore + NEAR_THRESHOLD_MARGIN;
    if (nearThreshold && Math.abs(change) >= HIGH_VOLATILITY_PCT) {
      return { verdict: "block", reason: `Signal tout juste au seuil (score ${Math.abs(score)} pour un minimum de ${minScore}) alors que la volatilité du jour est forte (${change.toFixed(1)} %). Trade bloqué par prudence.` };
    }
  }

  // ── Sinon : approbation avec une raison courte et positive ──────────────────
  const dir = ctx.side === "BUY" ? "achat" : "vente";
  const scorePart = score != null ? ` (score ${score})` : "";
  return { verdict: "approve", reason: `Contexte cohérent pour cet ordre d'${dir}${scorePart}, aucun signal d'alerte détecté.` };
}

const SYSTEM_PROMPT = [
  "Tu es un réviseur prudent de gestion du risque pour un investisseur particulier.",
  "On te transmet le contexte d'un ordre boursier automatique sur le point d'être soumis.",
  "Les règles techniques ont DÉJÀ validé l'entrée : tu es un garde-fou supplémentaire.",
  "Tu dois répondre STRICTEMENT en JSON : {\"verdict\":\"approve\"|\"block\",\"reason\":\"1-2 phrases en français\"}.",
  "Bloque UNIQUEMENT en cas de signal d'alerte clair : signal contradictoire,",
  "contexte de marché très défavorable, ou quantité manifestement incohérente.",
  "Dans le doute, approuve. Ne bloque jamais un ordre simplement parce que le trading comporte un risque.",
].join(" ");

function buildUserMessage(ctx: AiReviewContext): string {
  const lines = [
    `Symbole : ${ctx.symbol}`,
    `Direction : ${ctx.side === "BUY" ? "ACHAT" : "VENTE"}`,
    `Quantité : ${ctx.quantity}`,
    `Prix courant : ${ctx.price}`,
  ];
  if (ctx.changePercent != null && Number.isFinite(ctx.changePercent)) {
    lines.push(`Variation du jour : ${ctx.changePercent.toFixed(2)} %`);
  }
  if (ctx.signalScore != null) lines.push(`Score du signal : ${ctx.signalScore}`);
  if (ctx.signalVerdict) lines.push(`Verdict du signal : ${ctx.signalVerdict}`);
  if (ctx.weeklySignalScore != null) lines.push(`Score du signal hebdomadaire : ${ctx.weeklySignalScore}`);
  if (ctx.ruleName) lines.push(`Règle : ${ctx.ruleName}`);
  if (ctx.sideMode) lines.push(`Direction autorisée par la règle : ${ctx.sideMode}`);
  if (ctx.minScore != null) lines.push(`Score minimum de la règle : ${ctx.minScore}`);
  if (ctx.source) lines.push(`Source du signal : ${ctx.source === "copy" ? "copy-trading" : "technique"}`);
  if (ctx.recentOutcomes.length > 0) {
    lines.push("Déclenchements récents de cette règle :");
    for (const o of ctx.recentOutcomes) lines.push(`- ${o}`);
  }
  lines.push("Ce trade doit-il être approuvé ou bloqué ?");
  return lines.join("\n");
}

/**
 * Tente OpenAI. Retourne un avis exploitable, ou null en cas d'erreur/timeout/
 * réponse illisible (l'appelant retombe alors sur le réviseur local).
 */
async function tryOpenAiOpinion(ctx: AiReviewContext, apiKey: string): Promise<AiReviewResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserMessage(ctx) },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, "aiReview: réponse OpenAI non OK — repli sur le réviseur local");
      return null;
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      logger.warn("aiReview: réponse OpenAI sans contenu — repli sur le réviseur local");
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      logger.warn("aiReview: réponse OpenAI illisible (JSON invalide) — repli sur le réviseur local");
      return null;
    }

    const obj = parsed as { verdict?: unknown; reason?: unknown };
    if (obj.verdict !== "approve" && obj.verdict !== "block") {
      logger.warn({ verdict: obj.verdict }, "aiReview: verdict OpenAI inattendu — repli sur le réviseur local");
      return null;
    }
    const reason = typeof obj.reason === "string" && obj.reason.trim()
      ? obj.reason.trim()
      : (obj.verdict === "block" ? "Trade bloqué par le second avis." : "Approuvé par le second avis.");

    return { verdict: obj.verdict, reason };
  } catch (err) {
    logger.warn({ err: String(err) }, "aiReview: appel OpenAI échoué ou expiré — repli sur le réviseur local");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Second avis. Renvoie TOUJOURS un avis exploitable ({ verdict, reason }) :
 *   - avec OPENAI_API_KEY : tente OpenAI, retombe sur le réviseur local en cas d'échec.
 *   - sans clé : réviseur local directement.
 * Ne renvoie null que si une exception totalement inattendue survient (défense
 * en profondeur ; l'appelant traite alors ce cas en fail-open).
 */
export async function getAiSecondOpinion(ctx: AiReviewContext): Promise<AiReviewResult | null> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      const remote = await tryOpenAiOpinion(ctx, apiKey);
      if (remote) return remote;
      // Échec OpenAI → repli local (jamais null).
      return localSecondOpinion(ctx);
    }
    // Pas de clé → réviseur local gratuit directement.
    return localSecondOpinion(ctx);
  } catch (err) {
    logger.warn({ err: String(err) }, "aiReview: erreur inattendue — fail-open");
    return null;
  }
}
