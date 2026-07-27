/**
 * Schéma Drizzle pour la connexion Spotify.
 *
 * Adaptation single-user : pas de FK vers une table `users` — une seule ligne
 * dans `spotify_connections` représente la connexion de l'unique utilisateur.
 * Le `spotifyUserId` est déclaré UNIQUE pour permettre un upsert propre.
 */
import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const spotifyConnectionsTable = pgTable("spotify_connections", {
  id:                     serial("id").primaryKey(),
  /** Identifiant Spotify de l'utilisateur (ex: "31xyz..."). */
  spotifyUserId:          text("spotify_user_id").notNull().unique(),
  /** Refresh token chiffré AES-256-GCM (même clé que MetaTrader). */
  encryptedRefreshToken:  text("encrypted_refresh_token").notNull(),
  isPremium:              boolean("is_premium").default(false).notNull(),
  displayName:            text("display_name"),
  email:                  text("email"),
  connectedAt:            timestamp("connected_at").defaultNow().notNull(),
});
