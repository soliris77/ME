/**
 * Web Push — notifications garanties même navigateur fermé.
 * ─────────────────────────────────────────────────────────────────────────────
 * Les clés VAPID sont générées au premier besoin puis persistées dans
 * app_settings (les abonnements des navigateurs sont liés à la clé publique :
 * la régénérer invaliderait tous les abonnements existants). Les abonnements
 * sont stockés dans push_subscriptions (un par navigateur/appareil) et purgés
 * automatiquement quand le service push répond 404/410 (abonnement expiré).
 */
import webpush from "web-push";
import { db, appSettingsTable, pushSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

let vapidReady: Promise<string> | null = null;

/** Génère (si besoin), persiste et configure les clés VAPID. Retourne la clé publique. */
export function ensureVapidKeys(): Promise<string> {
  if (!vapidReady) {
    vapidReady = (async () => {
      let [row] = await db.select().from(appSettingsTable).limit(1);
      if (!row) {
        // Ligne créée normalement par lib/settings.ts au premier accès — on la
        // crée ici si le push est sollicité avant, avec les mêmes défauts.
        [row] = await db
          .insert(appSettingsTable)
          .values({
            maxOrderValue: String(Number(process.env.MAX_ORDER_VALUE ?? 5000)),
            maxPortfolioExposure: String(Number(process.env.MAX_PORTFOLIO_EXPOSURE ?? 25000)),
            largeOrderFrictionPct: "0.5",
          })
          .returning();
      }

      let { vapidPublicKey, vapidPrivateKey } = row;
      if (!vapidPublicKey || !vapidPrivateKey) {
        const keys = webpush.generateVAPIDKeys();
        vapidPublicKey = keys.publicKey;
        vapidPrivateKey = keys.privateKey;
        await db
          .update(appSettingsTable)
          .set({ vapidPublicKey, vapidPrivateKey, updatedAt: new Date() })
          .where(eq(appSettingsTable.id, row.id));
        logger.info("Web Push: nouvelles clés VAPID générées et persistées");
      }

      webpush.setVapidDetails("mailto:alerts@soliris.local", vapidPublicKey, vapidPrivateKey);
      return vapidPublicKey;
    })().catch((err) => {
      vapidReady = null; // permet de réessayer au prochain appel
      throw err;
    });
  }
  return vapidReady;
}

export interface BrowserPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Enregistre (upsert par endpoint) un abonnement push envoyé par le navigateur. */
export async function saveSubscription(sub: BrowserPushSubscription, userAgent?: string | null): Promise<void> {
  await db
    .insert(pushSubscriptionsTable)
    .values({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent ?? null })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: { p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent ?? null },
    });
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, endpoint));
}

export interface PushPayload {
  title: string;
  body: string;
  /** Tag de notification — partagé avec la page/SW pour dédupliquer. */
  tag?: string;
  url?: string;
}

/**
 * Envoie une notification push à tous les navigateurs abonnés. Les échecs
 * individuels ne bloquent pas les autres envois ; les abonnements expirés
 * (HTTP 404/410) sont supprimés de la base.
 */
export async function sendPushToAll(payload: PushPayload): Promise<void> {
  const subs = await db.select().from(pushSubscriptionsTable);
  if (subs.length === 0) return;

  await ensureVapidKeys();
  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 * 60 }, // 1h — au-delà, l'alerte est périmée
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await removeSubscription(s.endpoint).catch(() => {});
          logger.info({ endpoint: s.endpoint.slice(0, 60) }, "Web Push: abonnement expiré supprimé");
        } else {
          logger.error({ err, endpoint: s.endpoint.slice(0, 60) }, "Web Push: échec d'envoi");
        }
      }
    }),
  );
}
