/**
 * Préférences de notification — remplace l'ancienne variable d'environnement
 * ALERT_NOTIFY_EMAIL par une vraie configuration persistée : coordonnées
 * (email, téléphone) + canal choisi (email / sms / both / none) pour chaque
 * type d'événement critique.
 * ─────────────────────────────────────────────────────────────────────────────
 * Une seule ligne en base (mono-utilisateur), même pattern que
 * lib/settings.ts : créée au premier accès avec des valeurs par défaut
 * ("email" pour tout, coordonnées vides), mise en cache en mémoire, cache
 * invalidé à chaque écriture.
 */
import {
  db,
  notificationPreferencesTable,
  type NotificationPreferences,
  type NotificationChannel,
  type NotificationEventType,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { isValidE164 } from "./smsClient";

const CHANNELS: readonly NotificationChannel[] = ["email", "sms", "both", "none"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface NotificationPrefsOut {
  email: string | null;
  phone: string | null;
  killSwitchChannel: NotificationChannel;
  largeOrderChannel: NotificationChannel;
  thresholdChangeChannel: NotificationChannel;
  priceAlertChannel: NotificationChannel;
  patternAlertChannel: NotificationChannel;
  updatedAt: string;
}

let cache: NotificationPrefsOut | null = null;

function toOut(row: NotificationPreferences): NotificationPrefsOut {
  return {
    email: row.email ?? null,
    phone: row.phone ?? null,
    killSwitchChannel: row.killSwitchChannel as NotificationChannel,
    largeOrderChannel: row.largeOrderChannel as NotificationChannel,
    thresholdChangeChannel: row.thresholdChangeChannel as NotificationChannel,
    priceAlertChannel: row.priceAlertChannel as NotificationChannel,
    patternAlertChannel: row.patternAlertChannel as NotificationChannel,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function ensureRow(): Promise<NotificationPreferences> {
  const [existing] = await db.select().from(notificationPreferencesTable).limit(1);
  if (existing) return existing;

  const [created] = await db.insert(notificationPreferencesTable).values({}).returning();
  return created;
}

export async function getNotificationPreferences(): Promise<NotificationPrefsOut> {
  if (cache) return cache;
  const row = await ensureRow();
  cache = toOut(row);
  return cache;
}

export interface UpdateNotificationPrefsInput {
  email?: string | null;
  phone?: string | null;
  killSwitchChannel?: NotificationChannel;
  largeOrderChannel?: NotificationChannel;
  thresholdChangeChannel?: NotificationChannel;
  priceAlertChannel?: NotificationChannel;
  patternAlertChannel?: NotificationChannel;
}

const CHANNEL_FIELDS = [
  "killSwitchChannel",
  "largeOrderChannel",
  "thresholdChangeChannel",
  "priceAlertChannel",
  "patternAlertChannel",
] as const;

export async function updateNotificationPreferences(
  patch: UpdateNotificationPrefsInput,
): Promise<NotificationPrefsOut> {
  const current = await getNotificationPreferences();

  const next: UpdateNotificationPrefsInput = { ...current, ...patch };

  if (next.email !== null && next.email !== undefined && next.email !== "" && !EMAIL_RE.test(next.email)) {
    throw new Error("L'adresse email n'est pas valide.");
  }
  if (next.phone !== null && next.phone !== undefined && next.phone !== "" && !isValidE164(next.phone)) {
    throw new Error("Le numéro de téléphone doit être au format E.164 (ex. +15145551234).");
  }
  for (const field of CHANNEL_FIELDS) {
    const value = next[field];
    if (value !== undefined && !CHANNELS.includes(value)) {
      throw new Error(`Canal invalide pour ${field} — attendu : email, sms, both ou none.`);
    }
    // Le SMS coûte par message — on refuse silencieusement de l'activer sans
    // numéro configuré plutôt que de laisser un canal qui ne pourra jamais envoyer.
    if ((value === "sms" || value === "both") && !next.phone) {
      throw new Error("Configure d'abord un numéro de téléphone avant d'activer le SMS pour un événement.");
    }
  }

  const [row] = await db.select().from(notificationPreferencesTable).limit(1);

  const values = {
    email: next.email === "" ? null : next.email ?? current.email,
    phone: next.phone === "" ? null : next.phone ?? current.phone,
    killSwitchChannel: next.killSwitchChannel ?? current.killSwitchChannel,
    largeOrderChannel: next.largeOrderChannel ?? current.largeOrderChannel,
    thresholdChangeChannel: next.thresholdChangeChannel ?? current.thresholdChangeChannel,
    priceAlertChannel: next.priceAlertChannel ?? current.priceAlertChannel,
    patternAlertChannel: next.patternAlertChannel ?? current.patternAlertChannel,
  };

  const [updated] = row
    ? await db
        .update(notificationPreferencesTable)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(notificationPreferencesTable.id, row.id))
        .returning()
    : [await ensureRow()];

  cache = toOut(updated);
  return cache;
}

/** Résout le ou les canaux configurés pour un type d'événement en une liste de destinations à notifier. */
export async function resolveDestinations(
  eventType: NotificationEventType,
): Promise<{ email: string | null; phone: string | null; sendEmail: boolean; sendSms: boolean }> {
  const prefs = await getNotificationPreferences();
  const channelField = `${eventType}Channel` as const as
    | "killSwitchChannel"
    | "largeOrderChannel"
    | "thresholdChangeChannel"
    | "priceAlertChannel"
    | "patternAlertChannel";
  const channel = prefs[channelField];
  return {
    email: prefs.email,
    phone: prefs.phone,
    sendEmail: channel === "email" || channel === "both",
    sendSms: channel === "sms" || channel === "both",
  };
}
