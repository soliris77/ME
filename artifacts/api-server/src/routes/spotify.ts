/**
 * Intégration Spotify — OAuth Authorization Code + PKCE côté serveur.
 *
 * Flux :
 *   GET  /api/integrations/spotify/login      → redirige vers accounts.spotify.com/authorize
 *   GET  /api/integrations/spotify/callback   → échange le code, stocke le refresh_token chiffré
 *   GET  /api/integrations/spotify/token      → renvoie un access_token valide (refresh auto)
 *   DELETE /api/integrations/spotify/disconnect → supprime la connexion
 *
 * Secrets requis (Replit) : SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
 * La clé de chiffrement ENCRYPTION_KEY est partagée avec MetaTrader.
 */
import { Router, type Request } from "express";
import crypto from "node:crypto";
import { db } from "@workspace/db";
import { spotifyConnectionsTable } from "@workspace/db";
import { encrypt, decrypt } from "../lib/integrations/metatrader/crypto";

const router = Router();

const SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-modify-playback-state",
  "user-read-playback-state",
].join(" ");

/** Construit l'URI de redirection OAuth.
 *  Priorité : REPLIT_DEV_DOMAIN (fiable en dev Replit) → x-forwarded-host → host du serveur. */
function getRedirectUri(_req: Request): string {
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}/api/integrations/spotify/callback`;
  }
  const proto = (_req.headers["x-forwarded-proto"] as string) || _req.protocol;
  const host  = (_req.headers["x-forwarded-host"] as string) || _req.get("host") || "localhost";
  return `${proto}://${host}/api/integrations/spotify/callback`;
}

// ─── GET /api/integrations/spotify/login ──────────────────────────────────
router.get("/integrations/spotify/login", (req, res) => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    return res.status(503).json({ error: "SPOTIFY_CLIENT_ID non configuré. Ajoutez-le comme secret Replit." });
  }

  // Génère code_verifier (PKCE) et le stocke en session
  const verifier = crypto.randomBytes(64).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  (req.session as unknown as Record<string, unknown>).spotifyPkceVerifier = verifier;

  const redirectUri = getRedirectUri(req);
  console.info("[Spotify] redirect_uri envoyé à Spotify :", redirectUri);

  const params = new URLSearchParams({
    response_type:         "code",
    client_id:             clientId,
    scope:                 SCOPES,
    redirect_uri:          redirectUri,
    code_challenge_method: "S256",
    code_challenge:        challenge,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

// ─── GET /api/integrations/spotify/callback ───────────────────────────────
router.get("/integrations/spotify/callback", async (req, res) => {
  const { code, error } = req.query as Record<string, string>;

  if (error || !code) {
    console.warn("[Spotify] OAuth refusé :", error);
    return res.redirect("/dashboard?spotify_error=access_denied");
  }

  const session = req.session as unknown as Record<string, unknown>;
  const verifier = session.spotifyPkceVerifier as string | undefined;
  if (!verifier) {
    return res.redirect("/dashboard?spotify_error=session_expired");
  }
  delete session.spotifyPkceVerifier;

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    return res.redirect("/dashboard?spotify_error=missing_config");
  }

  try {
    // Échange du code contre les tokens
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        grant_type:    "authorization_code",
        code,
        redirect_uri:  getRedirectUri(req),
        client_id:     clientId,
        code_verifier: verifier,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[Spotify] Échec échange de token :", errText);
      return res.redirect("/dashboard?spotify_error=token_exchange_failed");
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    // Récupère le profil utilisateur Spotify
    const profileRes = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!profileRes.ok) {
      return res.redirect("/dashboard?spotify_error=profile_fetch_failed");
    }

    const profile = await profileRes.json() as {
      id: string;
      display_name?: string;
      email?: string;
      product?: string;
    };

    // Stocke (ou met à jour) la connexion — single-user, on remplace tout
    await db.delete(spotifyConnectionsTable);
    await db.insert(spotifyConnectionsTable).values({
      spotifyUserId:         profile.id,
      encryptedRefreshToken: encrypt(tokens.refresh_token),
      isPremium:             profile.product === "premium",
      displayName:           profile.display_name ?? null,
      email:                 profile.email ?? null,
    });

    console.info(`[Spotify] Connexion établie — ${profile.display_name} (Premium: ${profile.product === "premium"})`);
    res.redirect("/dashboard?spotify_connected=1");
  } catch (err) {
    console.error("[Spotify] Erreur inattendue dans le callback :", err);
    res.redirect("/dashboard?spotify_error=unexpected");
  }
});

// ─── GET /api/integrations/spotify/token ──────────────────────────────────
router.get("/integrations/spotify/token", async (req, res) => {
  const [conn] = await db.select().from(spotifyConnectionsTable).limit(1);
  if (!conn) {
    return res.status(404).json({ error: "Aucune connexion Spotify enregistrée." });
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    return res.status(503).json({ error: "SPOTIFY_CLIENT_ID non configuré." });
  }

  try {
    const refreshToken = decrypt(conn.encryptedRefreshToken);

    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        grant_type:    "refresh_token",
        refresh_token: refreshToken,
        client_id:     clientId,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[Spotify] Échec du refresh token :", errText);
      return res.status(502).json({ error: "Échec du renouvellement du token Spotify." });
    }

    const data = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    // Si Spotify renvoie un nouveau refresh_token, on le met à jour
    if (data.refresh_token) {
      await db
        .update(spotifyConnectionsTable)
        .set({ encryptedRefreshToken: encrypt(data.refresh_token) });
    }

    res.json({
      accessToken:  data.access_token,
      expiresIn:    data.expires_in,
      isPremium:    conn.isPremium,
      displayName:  conn.displayName,
      email:        conn.email,
    });
  } catch (err) {
    console.error("[Spotify] Erreur lors du refresh :", err);
    res.status(500).json({ error: "Erreur interne." });
  }
});

// ─── DELETE /api/integrations/spotify/disconnect ──────────────────────────
router.delete("/integrations/spotify/disconnect", async (req, res) => {
  await db.delete(spotifyConnectionsTable);
  console.info("[Spotify] Connexion supprimée.");
  res.json({ ok: true });
});

export default router;
