/**
 * /api/whop/* — tarif public et ouverture du paiement.
 * ─────────────────────────────────────────────────────────────────────────────
 * Ces deux routes sont PUBLIQUES à dessein : la page tarifs doit être lisible
 * et l'abonnement souscriptible par quelqu'un qui n'a pas encore de session.
 * Elles étaient jusqu'ici derrière requireAuth, ce qui renvoyait 401 à tout
 * visiteur : le prix ne s'affichait pas et le bouton « S'abonner » échouait.
 *
 * La vérification d'abonnement ne vit PAS ici. L'ancienne /api/whop/verify
 * acceptait un identifiant d'adhésion fourni par le client — donc n'importe
 * qui pouvait se déclarer abonné. Elle est remplacée par /api/subscription,
 * qui n'interroge que Whop et la base. Voir lib/subscription.ts.
 */
import { Router } from "express";
import { getWhopClient } from "../whopClient";

const router = Router();

// Identifiants de configuration, pas des secrets.
const PLAN_ID = process.env.WHOP_PLAN_ID ?? "plan_JrkAsnIXuyaK6";

/**
 * L'URL de retour vient du navigateur : sans contrôle, on offrirait une
 * redirection ouverte depuis un domaine de paiement — exactement le genre de
 * lien dont se servent les campagnes d'hameçonnage. On n'accepte donc qu'une
 * URL du même hôte que la requête.
 */
function isSameOrigin(candidate: string, req: { headers: Record<string, unknown>; protocol: string }): boolean {
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "");
    return host !== "" && url.host === host;
  } catch {
    return false;
  }
}

// ─── GET /api/whop/plans ───────────────────────────────────────────────────
router.get("/whop/plans", async (req, res) => {
  try {
    const client = await getWhopClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plan = await (client as any).plans.retrieve(PLAN_ID);
    return res.json({
      id: plan.id,
      renewalPrice: plan.renewal_price,
      billingPeriod: plan.billing_period,
      currency: plan.currency,
      productTitle: plan.product?.title ?? "Accès Premium",
      purchaseUrl: plan.purchase_url,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch Whop plan");
    // La page tarifs doit rester lisible même si Whop est injoignable : elle
    // affiche alors son prix de repli plutôt qu'une page en erreur.
    return res.status(503).json({ error: "Tarif indisponible pour le moment." });
  }
});

// ─── POST /api/whop/checkout ───────────────────────────────────────────────
router.post("/whop/checkout", async (req, res) => {
  const { redirectUrl } = req.body as { redirectUrl?: string };
  if (!redirectUrl) {
    return res.status(400).json({ error: "redirectUrl is required" });
  }
  if (!isSameOrigin(redirectUrl, req)) {
    req.log.warn({ redirectUrl }, "whop: URL de retour refusée (hôte différent)");
    return res.status(400).json({ error: "URL de retour invalide." });
  }

  try {
    const client = await getWhopClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const checkout = await (client as any).checkoutConfigurations.create({
      plan_id: PLAN_ID,
      redirect_url: redirectUrl,
    });

    return res.json({
      checkoutId: checkout.id,
      purchaseUrl: checkout.purchase_url,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create Whop checkout");
    return res.status(502).json({ error: "Impossible d'ouvrir le paiement pour le moment." });
  }
});

export default router;
