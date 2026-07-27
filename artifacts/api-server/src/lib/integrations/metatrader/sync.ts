/**
 * Job de synchronisation des trades des leaders suivis.
 *
 * Fréquence : toutes les 5 minutes (configurable via COPY_TRADING_SYNC_INTERVAL_MS).
 * Stratégie : pour chaque trader suivi, récupère les positions ouvertes de son
 * compte MT via MetaApi, détecte les nouveaux trades (idempotence par externalTradeId),
 * crée une entrée `copied_trades` et envoie une notification (email ou in-app).
 *
 * Mode autoExecute=true → la copie est gérée par CopyFactory directement ;
 * le sync reste actif pour le suivi et l'historique dans la DB.
 *
 * ⚠️  Le job ne démarre pas si METAAPI_TOKEN est absent — log d'avertissement,
 *     aucun crash du serveur.
 */
import { db, mtConnectionsTable, followedTradersTable, copiedTradesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { decrypt } from "./crypto";
import { getOpenPositions } from "./client";
import { sendEmail } from "../../emailClient";
import { logger } from "../../logger";

const SYNC_INTERVAL_MS = Number(process.env.COPY_TRADING_SYNC_INTERVAL_MS ?? 5 * 60 * 1000);

// ─── Noyau du job ─────────────────────────────────────────────────────────────

async function syncFollowedTrader(
  followedTrader: typeof followedTradersTable.$inferSelect,
  mtConnection: typeof mtConnectionsTable.$inferSelect,
): Promise<void> {
  const { metaApiAccountId } = mtConnection;
  if (!metaApiAccountId) {
    logger.warn({ followedTraderId: followedTrader.id }, "copytrading: no metaApiAccountId — skip sync");
    return;
  }

  // Récupérer les positions ouvertes du compte subscriber (reflète les copies CopyFactory)
  let positions;
  try {
    positions = await getOpenPositions(metaApiAccountId);
  } catch (err) {
    logger.warn({ err, followedTraderId: followedTrader.id }, "copytrading: failed to fetch positions — skipping");
    return;
  }

  for (const position of positions) {
    // Vérifier si ce trade est déjà connu (idempotence)
    const existing = await db
      .select({ id: copiedTradesTable.id })
      .from(copiedTradesTable)
      .where(
        and(
          eq(copiedTradesTable.followedTraderId, followedTrader.id),
          eq(copiedTradesTable.externalTradeId, position.id),
        ),
      )
      .limit(1);

    if (existing.length > 0) continue; // déjà enregistré

    const direction = position.type === "POSITION_TYPE_BUY" ? "buy" : "sell";

    // Calculer le montant à copier selon les règles de risque
    let copiedAmount: string | null = null;
    if (followedTrader.maxAmountPerTrade) {
      copiedAmount = followedTrader.maxAmountPerTrade;
    }

    // Insérer le trade copié
    await db.insert(copiedTradesTable).values({
      followedTraderId: followedTrader.id,
      externalTradeId: position.id,
      symbol: position.symbol,
      direction,
      originalAmount: String(position.volume),
      copiedAmount,
      status: followedTrader.autoExecute ? "executed" : "notified",
      openedAt: new Date(position.openTime),
    });

    logger.info(
      {
        followedTraderId: followedTrader.id,
        symbol: position.symbol,
        direction,
        autoExecute: followedTrader.autoExecute,
      },
      "copytrading: new trade detected",
    );

    // Envoyer une notification email si mode notification
    if (!followedTrader.autoExecute) {
      const trader = followedTrader.traderDisplayName ?? `Stratégie ${followedTrader.externalStrategyId}`;
      const notifyEmail = process.env.ALERT_NOTIFY_EMAIL;
      if (notifyEmail) {
        await sendEmail({
          to: notifyEmail,
          subject: `📈 Nouveau trade copié — ${trader} (${position.symbol})`,
          html: copyTradeEmailHtml({ trader, position: { symbol: position.symbol, direction, volume: position.volume, openPrice: position.openPrice } }),
        }).catch((err) => logger.warn({ err }, "copytrading: failed to send notification email"));
      }
    }
  }
}

function copyTradeEmailHtml(params: {
  trader: string;
  position: { symbol: string; direction: string; volume: number; openPrice: number };
}): string {
  const { trader, position } = params;
  const dirText = position.direction === "buy" ? "ACHAT" : "VENTE";
  const dirColor = position.direction === "buy" ? "#10b981" : "#ef4444";
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #111;">📈 Nouveau trade copié — ${trader}</h2>
      <p style="font-size: 16px; color: #333;">
        Le trader <strong>${trader}</strong> vient d'ouvrir un trade que tu suis :
      </p>
      <table style="border-collapse: collapse; width: 100%; margin-top: 12px;">
        <tr>
          <td style="padding: 6px 12px; font-weight: bold; background: #f5f5f5;">Instrument</td>
          <td style="padding: 6px 12px;">${position.symbol}</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px; font-weight: bold; background: #f5f5f5;">Direction</td>
          <td style="padding: 6px 12px; color: ${dirColor}; font-weight: bold;">${dirText}</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px; font-weight: bold; background: #f5f5f5;">Volume</td>
          <td style="padding: 6px 12px;">${position.volume} lots</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px; font-weight: bold; background: #f5f5f5;">Prix d'ouverture</td>
          <td style="padding: 6px 12px;">${position.openPrice}</td>
        </tr>
      </table>
      <p style="font-size: 13px; color: #666; margin-top: 20px;">
        Connecte-toi à <strong>Soliris Market</strong> pour voir tous les détails et gérer tes traders suivis.
      </p>
      <p style="font-size: 11px; color: #999; margin-top: 16px;">
        ⚠️ Ce n'est pas un conseil financier. Le trading comporte un risque de perte en capital.
        Soliris Market ne garantit pas les performances passées ou futures des traders suivis.
      </p>
    </div>
  `;
}

// ─── Boucle de synchronisation périodique ────────────────────────────────────

async function runSync(): Promise<void> {
  if (!process.env.METAAPI_TOKEN) {
    logger.debug("copytrading: METAAPI_TOKEN absent — sync skipped");
    return;
  }

  try {
    // Récupérer la connexion MT active
    const connections = await db
      .select()
      .from(mtConnectionsTable)
      .where(eq(mtConnectionsTable.isActive, true));

    if (connections.length === 0) return;

    const connection = connections[0]!;

    // Récupérer tous les traders suivis
    const traders = await db
      .select()
      .from(followedTradersTable)
      .where(eq(followedTradersTable.mtConnectionId, connection.id));

    for (const trader of traders) {
      await syncFollowedTrader(trader, connection).catch((err) =>
        logger.warn({ err, followedTraderId: trader.id }, "copytrading: sync error for trader"),
      );
    }

    // Mettre à jour le lastSyncAt
    await db
      .update(mtConnectionsTable)
      .set({ lastSyncAt: new Date() })
      .where(eq(mtConnectionsTable.id, connection.id));
  } catch (err) {
    logger.error({ err }, "copytrading: sync job failed");
  }
}

/**
 * Démarre le job de synchronisation périodique.
 * Appeler une fois depuis app.ts / server.ts au démarrage.
 */
export function startCopyTradingSync(): void {
  if (!process.env.METAAPI_TOKEN) {
    logger.warn("copytrading: METAAPI_TOKEN non configuré — job de synchronisation désactivé.");
    return;
  }

  logger.info({ intervalMs: SYNC_INTERVAL_MS }, "copytrading: sync job started");

  // Premier run immédiat, puis périodique
  runSync().catch((err) => logger.error({ err }, "copytrading: initial sync failed"));
  setInterval(() => {
    runSync().catch((err) => logger.error({ err }, "copytrading: periodic sync failed"));
  }, SYNC_INTERVAL_MS);
}
