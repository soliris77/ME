import { logger } from "./logger";
import { resolveCred } from "./persistCreds";

/**
 * Client SMS via l'API REST Twilio.
 *
 * Credentials résolus dans cet ordre :
 *   1. DB (app_settings) — persistés au démarrage depuis les secrets Replit
 *   2. Variables d'environnement Replit (fallback)
 *
 * Best-effort : un échec SMS ne fait jamais échouer l'action critique qu'il documente.
 */

const E164_RE = /^\+[1-9]\d{1,14}$/;

export function isValidE164(phone: string): boolean {
  return E164_RE.test(phone.trim());
}

interface SendSmsParams {
  to: string;
  body: string;
}

export async function sendSms({ to, body }: SendSmsParams): Promise<boolean> {
  const [accountSid, authToken, from] = await Promise.all([
    resolveCred("twilioAccountSid", "TWILIO_ACCOUNT_SID"),
    resolveCred("twilioAuthToken",  "TWILIO_AUTH_TOKEN"),
    resolveCred("twilioFromNumber", "TWILIO_FROM_NUMBER"),
  ]);

  if (!accountSid || !authToken || !from) {
    logger.warn(
      { to },
      "Credentials Twilio absents (DB et env var) — envoi SMS ignoré",
    );
    return false;
  }

  if (!isValidE164(to)) {
    logger.error({ to }, "Numéro de destination invalide (format E.164 attendu, ex. +15145551234) — envoi SMS annulé");
    return false;
  }

  try {
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!resp.ok) {
      const respBody = await resp.text().catch(() => "");
      logger.error({ status: resp.status, body: respBody }, "Erreur de l'API Twilio lors de l'envoi du SMS");
      return false;
    }

    logger.info({ to }, "SMS envoyé avec succès");
    return true;
  } catch (err) {
    logger.error({ err }, "Échec de l'envoi du SMS");
    return false;
  }
}
