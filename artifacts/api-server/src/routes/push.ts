/**
 * Routes Web Push — abonnement des navigateurs aux notifications poussées
 * (fonctionnent même navigateur complètement fermé). Routes protégées :
 * seul l'utilisateur authentifié peut s'abonner.
 */
import { Router, type IRouter } from "express";
import { ensureVapidKeys, saveSubscription, removeSubscription } from "../lib/webPush";

const router: IRouter = Router();

// Clé publique VAPID — nécessaire côté navigateur pour pushManager.subscribe.
router.get("/push/vapid-public-key", async (req, res) => {
  try {
    const publicKey = await ensureVapidKeys();
    return res.json({ publicKey });
  } catch (err) {
    req.log.error({ err }, "Failed to get VAPID public key");
    return res.status(500).json({ error: "Failed to get VAPID public key" });
  }
});

router.post("/push/subscribe", async (req, res) => {
  const body = req.body as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return res.status(400).json({ error: "Invalid push subscription: endpoint and keys (p256dh, auth) required" });
  }
  try {
    await saveSubscription(
      { endpoint: body.endpoint, keys: { p256dh: body.keys.p256dh, auth: body.keys.auth } },
      req.headers["user-agent"] ?? null,
    );
    return res.status(201).json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to save push subscription");
    return res.status(500).json({ error: "Failed to save push subscription" });
  }
});

router.post("/push/unsubscribe", async (req, res) => {
  const body = req.body as { endpoint?: string };
  if (!body?.endpoint) return res.status(400).json({ error: "endpoint required" });
  try {
    await removeSubscription(body.endpoint);
    return res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to remove push subscription");
    return res.status(500).json({ error: "Failed to remove push subscription" });
  }
});

export default router;
