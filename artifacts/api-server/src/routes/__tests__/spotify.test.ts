/**
 * Tests de contrat pour les routes proxy Spotify (routes/spotify.ts).
 *
 * On monte le routeur isolément (comme les tests frères broker et autoTrader) et on
 * vérifie le CONTRAT : forme de /now-playing, transmission des statuts des
 * contrôles (play/pause/next/previous) et le cas « non connecté ».
 *
 * Seuls les appels sortants vers Spotify (accounts.spotify.com / api.spotify.com)
 * sont interceptés ; les requêtes du test vers le serveur local passent par le
 * vrai fetch. Pour chaque route, le PREMIER appel Spotify est le refresh de token,
 * le SECOND l'appel à l'API Web. Aucun token réel n'est utilisé.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const h = vi.hoisted(() => ({
  // Connexion(s) Spotify renvoyées par db.select().from().limit().
  connections: [] as Record<string, unknown>[],
}));

const spotifyConnTable = { __t: "spotifyConn" };

function makeQuery() {
  const q: Record<string, unknown> = {};
  q.from = () => q;
  q.where = () => q;
  q.orderBy = () => q;
  q.limit = () => Promise.resolve(h.connections);
  q.then = (res: (v: unknown[]) => unknown) => res(h.connections);
  return q;
}

vi.mock("@workspace/db", () => ({
  db: {
    select: () => makeQuery(),
    update: () => ({ set: () => Promise.resolve() }),
    delete: () => Promise.resolve(),
    insert: () => ({ values: () => Promise.resolve() }),
  },
  spotifyConnectionsTable: spotifyConnTable,
}));

vi.mock("../../lib/integrations/metatrader/crypto", () => ({
  encrypt: (s: string) => `enc:${s}`,
  decrypt: (s: string) => s.replace(/^enc:/, ""),
}));

/** Petit utilitaire pour fabriquer une Response-like minimale. */
function makeRes(opts: { status?: number; ok?: boolean; body?: unknown; text?: string }) {
  const status = opts.status ?? 200;
  return {
    ok: opts.ok ?? (status >= 200 && status < 300),
    status,
    json: async () => opts.body,
    text: async () => (opts.text !== undefined ? opts.text : opts.body != null ? JSON.stringify(opts.body) : ""),
  } as unknown as Response;
}

const TOKEN_OK = makeRes({ status: 200, body: { access_token: "tok", expires_in: 3600 } });

let server: Server;
let base: string;
let realFetch: typeof fetch;
/** File d'attente des réponses Spotify à renvoyer, dans l'ordre des appels. */
let spotifyResponses: Response[] = [];

beforeAll(async () => {
  process.env.SPOTIFY_CLIENT_ID = "test-client";
  process.env.ENCRYPTION_KEY = "a".repeat(64);

  realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("spotify.com")) {
      const next = spotifyResponses.shift();
      if (!next) return Promise.reject(new Error(`Aucune réponse Spotify en file pour ${url}`));
      return Promise.resolve(next);
    }
    return realFetch(input, init);
  });

  const { default: router } = await import("../spotify");
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/api`;
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
});

beforeEach(() => {
  h.connections = [
    { encryptedRefreshToken: "enc:refresh", isPremium: true, displayName: "Moi", email: "a@b.c" },
  ];
  spotifyResponses = [];
});

/** Empile les réponses Spotify simulées (dans l'ordre d'appel). */
function queueSpotify(...responses: Response[]) {
  spotifyResponses.push(...responses);
}

describe("GET /api/integrations/spotify/now-playing", () => {
  it("renvoie la forme attendue quand une piste joue", async () => {
    queueSpotify(
      TOKEN_OK,
      makeRes({
        status: 200,
        body: {
          is_playing: true,
          progress_ms: 12000,
          device: { name: "iPhone" },
          item: {
            name: "Ma chanson",
            duration_ms: 200000,
            external_urls: { spotify: "https://open.spotify.com/track/xyz" },
            artists: [{ name: "Artiste A" }, { name: "Artiste B" }],
            album: { images: [{ url: "big.jpg" }, { url: "small.jpg" }] },
          },
        },
      }),
    );

    const r = await fetch(`${base}/integrations/spotify/now-playing`);
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(body.playing).toBe(true);
    expect(body.isPlaying).toBe(true);
    expect(body.trackName).toBe("Ma chanson");
    expect(body.artists).toBe("Artiste A, Artiste B");
    expect(body.albumArtUrl).toBe("small.jpg"); // plus petite image (dernière)
    expect(body.progressMs).toBe(12000);
    expect(body.durationMs).toBe(200000);
    expect(body.deviceName).toBe("iPhone");
    expect(body.trackUrl).toBe("https://open.spotify.com/track/xyz");
  });

  it("204 de Spotify → { playing: false }", async () => {
    queueSpotify(TOKEN_OK, makeRes({ status: 204, text: "" }));

    const r = await fetch(`${base}/integrations/spotify/now-playing`);
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(body).toEqual({ playing: false });
  });

  it("corps vide (200 sans item) → { playing: false }", async () => {
    queueSpotify(TOKEN_OK, makeRes({ status: 200, text: "" }));

    const r = await fetch(`${base}/integrations/spotify/now-playing`);
    const body = await r.json();
    expect(body).toEqual({ playing: false });
  });
});

describe("Contrôles de lecture — transmission des statuts", () => {
  const controls: [string, number][] = [
    ["play", 204],
    ["pause", 204],
    ["next", 204],
    ["previous", 200],
  ];

  for (const [action, spotifyStatus] of controls) {
    it(`POST ${action} → 200 { ok: true } quand Spotify répond ${spotifyStatus}`, async () => {
      queueSpotify(TOKEN_OK, makeRes({ status: spotifyStatus, ok: spotifyStatus < 300 }));

      const r = await fetch(`${base}/integrations/spotify/${action}`, { method: "POST" });
      const body = await r.json();
      expect(r.status).toBe(200);
      expect(body).toEqual({ ok: true });
    });
  }

  it("403 de Spotify → 403 « Premium requis »", async () => {
    queueSpotify(TOKEN_OK, makeRes({ status: 403, ok: false, text: "Premium required" }));

    const r = await fetch(`${base}/integrations/spotify/play`, { method: "POST" });
    const body = await r.json();
    expect(r.status).toBe(403);
    expect(body.error).toMatch(/Premium/i);
  });

  it("404 de Spotify → 404 « aucun appareil actif »", async () => {
    queueSpotify(TOKEN_OK, makeRes({ status: 404, ok: false, text: "No active device" }));

    const r = await fetch(`${base}/integrations/spotify/next`, { method: "POST" });
    const body = await r.json();
    expect(r.status).toBe(404);
    expect(body.error).toMatch(/appareil/i);
  });

  it("autre erreur Spotify (500) → statut transmis tel quel", async () => {
    queueSpotify(TOKEN_OK, makeRes({ status: 500, ok: false, text: "boom" }));

    const r = await fetch(`${base}/integrations/spotify/pause`, { method: "POST" });
    expect(r.status).toBe(500);
  });
});

describe("Non connecté", () => {
  beforeEach(() => {
    h.connections = [];
  });

  it("now-playing → 404 avec message FR quand aucune connexion", async () => {
    const r = await fetch(`${base}/integrations/spotify/now-playing`);
    const body = await r.json();
    expect(r.status).toBe(404);
    expect(typeof body.error).toBe("string");
    expect(body.error).toMatch(/connexion/i);
  });

  it("un contrôle → 404 quand aucune connexion", async () => {
    const r = await fetch(`${base}/integrations/spotify/play`, { method: "POST" });
    expect(r.status).toBe(404);
  });
});
