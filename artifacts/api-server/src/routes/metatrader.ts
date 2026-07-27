/**
 * /api/integrations/metatrader/* — Connexion compte MetaTrader via MetaApi.cloud
 *
 * POST   /api/integrations/metatrader/connect     → provisionne le compte MT
 * DELETE /api/integrations/metatrader/disconnect  → révoque et supprime les identifiants
 * GET    /api/integrations/metatrader/status       → statut de la connexion MT
 */
import { Router } from "express";
import { db, mtConnectionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "../lib/integrations/metatrader/crypto";
import { provisionMtAccount, deleteMtAccount } from "../lib/integrations/metatrader/client";
import { logger } from "../lib/logger";

const router = Router();

// ─── Helper — connexion MT active ────────────────────────────────────────────
async function getActiveConnection() {
  const rows = await db
    .select()
    .from(mtConnectionsTable)
    .where(eq(mtConnectionsTable.isActive, true))
    .limit(1);
  return rows[0] ?? null;
}

// ─── GET /api/integrations/metatrader/status ──────────────────────────────────
router.get("/integrations/metatrader/status", async (_req, res) => {
  try {
    const conn = await getActiveConnection();
    if (!conn) {
      return res.json({
        connected: false,
        hasApiToken: !!process.env.METAAPI_TOKEN,
        hasEncryptionKey: !!process.env.ENCRYPTION_KEY,
      });
    }
    return res.json({
      connected: true,
      hasApiToken: !!process.env.METAAPI_TOKEN,
      hasEncryptionKey: !!process.env.ENCRYPTION_KEY,
      metaApiAccountId: conn.metaApiAccountId,
      brokerServer: conn.brokerServer,
      connectedAt: conn.connectedAt.toISOString(),
      lastSyncAt: conn.lastSyncAt?.toISOString() ?? null,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
});

// ─── POST /api/integrations/metatrader/connect ───────────────────────────────
// Body : { login, investorPassword, server, platform }
// L'investorPassword est le MOT DE PASSE INVESTISSEUR (lecture seule), jamais
// le mot de passe maître. Ce point est documenté et affiché dans l'UI.
router.post("/integrations/metatrader/connect", async (req, res) => {
  try {
    const { login, investorPassword, server, platform } = req.body as {
      login?: string;
      investorPassword?: string;
      server?: string;
      platform?: "mt4" | "mt5";
    };

    if (!login || !investorPassword || !server) {
      return res.status(400).json({
        error: "login, investorPassword et server sont requis.",
      });
    }

    // Vérifier qu'une connexion n'existe pas déjà
    const existing = await getActiveConnection();
    if (existing) {
      return res.status(409).json({
        error: "Un compte MetaTrader est déjà connecté. Déconnecte-le d'abord.",
      });
    }

    // Vérifier que la clé de chiffrement est configurée AVANT de stocker quoi que ce soit
    if (!process.env.ENCRYPTION_KEY) {
      return res.status(503).json({
        error:
          "ENCRYPTION_KEY n'est pas configuré. Ajoute-le dans les secrets Replit avant de connecter un compte.",
      });
    }

    // Chiffrer les identifiants avant tout stockage
    const encryptedLogin = encrypt(login);
    const encryptedInvestorPassword = encrypt(investorPassword);

    // Provisionner côté MetaApi si le token est configuré
    let metaApiAccountId: string | null = null;
    if (process.env.METAAPI_TOKEN) {
      try {
        const account = await provisionMtAccount({
          login,
          investorPassword,
          server,
          platform: platform ?? "mt4",
        });
        metaApiAccountId = account._id;
        logger.info({ metaApiAccountId }, "metatrader: account provisioned");
      } catch (err) {
        logger.error({ err }, "metatrader: MetaApi provisioning failed");
        return res.status(502).json({
          error: `Échec du provisioning MetaApi : ${String(err)}`,
        });
      }
    } else {
      logger.warn("metatrader: METAAPI_TOKEN absent — connexion en mode dégradé (identifiants stockés sans provisioning)");
    }

    const [row] = await db
      .insert(mtConnectionsTable)
      .values({
        encryptedLogin,
        encryptedInvestorPassword,
        brokerServer: server,
        metaApiAccountId,
        isActive: true,
      })
      .returning();

    logger.info({ id: row?.id, metaApiAccountId }, "metatrader: connection saved");

    return res.status(201).json({
      message: "Compte MetaTrader connecté.",
      brokerServer: server,
      metaApiAccountId,
      connectedAt: row?.connectedAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "metatrader: connect failed");
    return res.status(500).json({ error: String(err) });
  }
});

// ─── DELETE /api/integrations/metatrader/disconnect ──────────────────────────
router.delete("/integrations/metatrader/disconnect", async (req, res) => {
  try {
    const conn = await getActiveConnection();
    if (!conn) {
      return res.status(404).json({ error: "Aucun compte MetaTrader connecté." });
    }

    // Révoquer côté MetaApi si possible
    if (conn.metaApiAccountId && process.env.METAAPI_TOKEN) {
      try {
        await deleteMtAccount(conn.metaApiAccountId);
      } catch (err) {
        // Log mais ne bloque pas la déconnexion locale
        logger.warn({ err, metaApiAccountId: conn.metaApiAccountId }, "metatrader: MetaApi revocation failed — continuing with local deletion");
      }
    }

    // Supprimer de la DB (les identifiants chiffrés disparaissent avec la ligne)
    await db.delete(mtConnectionsTable).where(eq(mtConnectionsTable.id, conn.id));
    logger.info({ id: conn.id }, "metatrader: connection deleted");

    return res.json({ message: "Compte MetaTrader déconnecté et identifiants supprimés." });
  } catch (err) {
    logger.error({ err }, "metatrader: disconnect failed");
    return res.status(500).json({ error: String(err) });
  }
});

export default router;
