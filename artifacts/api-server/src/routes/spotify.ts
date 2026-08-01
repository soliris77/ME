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
  "user-read-currently-playing",
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

/** Détecte une absence de ENCRYPTION_KEY sans jamais logguer de secret. */
function isEncryptionKeyMissing(): boolean {
  const hex = process.env.ENCRYPTION_KEY;
  return !hex || hex.length !== 64;
}

type SpotifyConnection = {
  encryptedRefreshToken: string;
  isPremium: boolean;
  displayName: string | null;
  email: string | null;
};

/** Erreur métier renvoyée au client avec un statut HTTP + message français. */
class SpotifyRouteError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

/**
 * Renvoie un access_token Spotify frais en utilisant le refresh_token chiffré.
 * Lève une SpotifyRouteError (statut + message FR) en cas de problème.
 * Ne loggue jamais de token.
 */
async function getFreshAccessToken(): Promise<{ accessToken: string; expiresIn: number; conn: SpotifyConnection }> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    throw new SpotifyRouteError(503, "SPOTIFY_CLIENT_ID non configuré.");
  }
  if (isEncryptionKeyMissing()) {
    throw new SpotifyRouteError(503, "Chiffrement indisponible : ENCRYPTION_KEY manquante côté serveur.");
  }

  const [conn] = await db.select().from(spotifyConnectionsTable).limit(1);
  if (!conn) {
    throw new SpotifyRouteError(404, "Aucune connexion Spotify enregistrée.");
  }

  let refreshToken: string;
  try {
    refreshToken = decrypt(conn.encryptedRefreshToken);
  } catch {
    throw new SpotifyRouteError(503, "Chiffrement indisponible : impossible de déchiffrer le token Spotify.");
  }

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
    throw new SpotifyRouteError(502, "Échec du renouvellement du token Spotify.");
  }

  const data = await tokenRes.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  // Si Spotify renvoie un nouveau refresh_token, on le met à jour.
  if (data.refresh_token) {
    await db
      .update(spotifyConnectionsTable)
      .set({ encryptedRefreshToken: encrypt(data.refresh_token) });
  }

  return {
    accessToken: data.access_token,
    expiresIn:   data.expires_in,
    conn,
  };
}

/** Traduit une SpotifyRouteError (ou erreur inattendue) en réponse JSON FR. */
function sendSpotifyError(res: import("express").Response, err: unknown): void {
  if (err instanceof SpotifyRouteError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  console.error("[Spotify] Erreur inattendue :", err);
  res.status(500).json({ error: "Erreur interne." });
}

// ─── GET /api/integrations/spotify/token ──────────────────────────────────
router.get("/integrations/spotify/token", async (_req, res) => {
  try {
    const { accessToken, expiresIn, conn } = await getFreshAccessToken();
    res.json({
      accessToken,
      expiresIn,
      isPremium:   conn.isPremium,
      displayName: conn.displayName,
      email:       conn.email,
    });
  } catch (err) {
    sendSpotifyError(res, err);
  }
});

// ─── GET /api/integrations/spotify/now-playing ────────────────────────────
router.get("/integrations/spotify/now-playing", async (_req, res) => {
  try {
    const { accessToken } = await getFreshAccessToken();
    const r = await fetch("https://api.spotify.com/v1/me/player", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // 204 (ou corps vide) : rien en cours de lecture.
    if (r.status === 204) {
      return res.json({ playing: false });
    }
    if (!r.ok) {
      const errText = await r.text();
      console.error("[Spotify] now-playing statut", r.status, ":", errText);
      return res.status(502).json({ error: "Impossible de récupérer la lecture en cours." });
    }

    const raw = await r.text();
    if (!raw) {
      return res.json({ playing: false });
    }

    const p = JSON.parse(raw) as {
      is_playing?: boolean;
      progress_ms?: number | null;
      device?: { name?: string } | null;
      item?: {
        name?: string;
        duration_ms?: number;
        external_urls?: { spotify?: string };
        artists?: { name: string }[];
        album?: { images?: { url: string }[] };
      } | null;
    };

    if (!p.item) {
      return res.json({ playing: false });
    }

    const images = p.item.album?.images ?? [];
    res.json({
      playing:      true,
      isPlaying:    p.is_playing ?? false,
      trackName:    p.item.name ?? "",
      artists:      (p.item.artists ?? []).map((a) => a.name).join(", "),
      albumArtUrl:  images.length > 0 ? images[images.length - 1].url : null,
      progressMs:   p.progress_ms ?? 0,
      durationMs:   p.item.duration_ms ?? 0,
      deviceName:   p.device?.name ?? null,
      trackUrl:     p.item.external_urls?.spotify ?? null,
    });
  } catch (err) {
    sendSpotifyError(res, err);
  }
});

/** Proxy générique vers un endpoint de contrôle /v1/me/player/*. */
async function proxyPlayerControl(
  res: import("express").Response,
  method: "PUT" | "POST",
  path: string,
): Promise<void> {
  try {
    const { accessToken } = await getFreshAccessToken();
    const r = await fetch(`https://api.spotify.com/v1/me/player/${path}`, {
      method,
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // Succès Spotify : 204 (No Content) le plus souvent, ou 200/202.
    if (r.ok || r.status === 204) {
      return void res.json({ ok: true });
    }

    // Traduction des erreurs Spotify en messages FR selon le statut.
    if (r.status === 403) {
      return void res.status(403).json({ error: "Premium requis." });
    }
    if (r.status === 404) {
      return void res.status(404).json({ error: "Aucun appareil actif." });
    }

    const errText = await r.text();
    console.error("[Spotify] contrôle", path, "statut", r.status, ":", errText);
    res.status(r.status).json({ error: "Échec de la commande de lecture Spotify." });
  } catch (err) {
    sendSpotifyError(res, err);
  }
}

// ─── POST contrôles de lecture ────────────────────────────────────────────
router.post("/integrations/spotify/play",     (_req, res) => proxyPlayerControl(res, "PUT",  "play"));
router.post("/integrations/spotify/pause",    (_req, res) => proxyPlayerControl(res, "PUT",  "pause"));
router.post("/integrations/spotify/next",     (_req, res) => proxyPlayerControl(res, "POST", "next"));
router.post("/integrations/spotify/previous", (_req, res) => proxyPlayerControl(res, "POST", "previous"));

// ─── DELETE /api/integrations/spotify/disconnect ──────────────────────────
router.delete("/integrations/spotify/disconnect", async (req, res) => {
  await db.delete(spotifyConnectionsTable);
  console.info("[Spotify] Connexion supprimée.");
  res.json({ ok: true });
});

export default router;
