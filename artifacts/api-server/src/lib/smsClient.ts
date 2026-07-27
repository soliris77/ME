import { logger } from "./logger";

/**
 * Minimal SMS sender using the Twilio REST API directly (no SDK dependency),
 * following the same pattern as emailClient.ts.
 *
 * Required env vars:
 * - TWILIO_ACCOUNT_SID
 * - TWILIO_AUTH_TOKEN
 * - TWILIO_FROM_NUMBER: numéro Twilio expéditeur, au format E.164 (ex. +15145551234)
 *
 * Best-effort, comme l'email : si les identifiants ne sont pas configurés, ou
 * si l'envoi échoue, on journalise et on retourne false — un échec de SMS ne
 * doit jamais faire échouer l'action critique qu'il documente.
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
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !from) {
    logger.warn(
      { to },
      "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN ou TWILIO_FROM_NUMBER non configuré — envoi SMS ignoré",
    );
    return false;
  }

  if (!isValidE164(to)) {
    logger.error({ to }, "Numéro de destination invalide (format E.164 attendu, ex. +15145551234) — envoi SMS annulé");
    return false;
  }

  try {
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      const respBody = await resp.text().catch(() => "");
      logger.error({ status: resp.status, body: respBody }, "Erreur de l'API Twilio lors de l'envoi du SMS");
      return false;
    }

    return true;
  } catch (err) {
    logger.error({ err }, "Échec de l'envoi du SMS");
    return false;
  }
}
