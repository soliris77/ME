/**
 * Second avis IA — revue de risque optionnelle avant soumission d'un ordre auto.
 * ─────────────────────────────────────────────────────────────────────────────
 * Une LLM (OpenAI Chat Completions) examine le contexte d'un trade et peut le
 * BLOQUER avec une explication en français. Conçu FAIL-OPEN : si l'IA est
 * indisponible / non configurée / en erreur / en timeout, on renvoie null et le
 * trade suit son cours normal (les règles techniques verrouillent déjà les
 * entrées). L'IA n'est qu'un garde-fou supplémentaire, jamais un point de panne.
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
  /** Résumés des ~5 derniers auto_trade_logs de cette règle (contexte historique). */
  recentOutcomes: string[];
  source?: "technical" | "copy";
}

export interface AiReviewResult {
  verdict: "approve" | "block";
  reason: string;
}

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";
const TIMEOUT_MS = 10_000;

// Anti-spam : on n'avertit qu'une seule fois par process que la clé est absente.
let warnedMissingKey = false;

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
 * Demande un second avis à l'IA. Retourne :
 *   - { verdict, reason } si l'IA a répondu de façon exploitable
 *   - null si l'IA est indisponible / non configurée / en erreur / timeout / réponse illisible
 *     (dans tous ces cas : FAIL-OPEN, le trade doit se poursuivre).
 */
export async function getAiSecondOpinion(ctx: AiReviewContext): Promise<AiReviewResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      logger.debug("aiReview: OPENAI_API_KEY absente — second avis IA désactivé (fail-open, les ordres passent normalement)");
    }
    return null;
  }

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
      logger.warn({ status: res.status }, "aiReview: réponse OpenAI non OK — fail-open");
      return null;
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      logger.warn("aiReview: réponse OpenAI sans contenu — fail-open");
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      logger.warn("aiReview: réponse OpenAI illisible (JSON invalide) — fail-open");
      return null;
    }

    const obj = parsed as { verdict?: unknown; reason?: unknown };
    if (obj.verdict !== "approve" && obj.verdict !== "block") {
      logger.warn({ verdict: obj.verdict }, "aiReview: verdict IA inattendu — fail-open");
      return null;
    }
    const reason = typeof obj.reason === "string" && obj.reason.trim()
      ? obj.reason.trim()
      : (obj.verdict === "block" ? "Trade bloqué par le second avis IA." : "Approuvé par le second avis IA.");

    return { verdict: obj.verdict, reason };
  } catch (err) {
    // AbortError (timeout) ou toute erreur réseau : fail-open.
    logger.warn({ err: String(err) }, "aiReview: appel OpenAI échoué ou expiré — fail-open");
    return null;
  } finally {
    clearTimeout(timer);
  }
}
