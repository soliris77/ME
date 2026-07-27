/**
 * /api/notification-preferences — coordonnées (email, téléphone) et canal
 * choisi par type d'événement critique (kill-switch, gros ordre, changement
 * de seuils, alerte de prix, alerte de pattern). Protégé par requireAuth
 * (monté dans routes/index.ts), suit le même pattern que /api/settings.
 */
import { Router } from "express";
import { getNotificationPreferences, updateNotificationPreferences } from "../lib/notificationPrefs";
import { logAudit } from "../lib/audit";

const router = Router();

router.get("/notification-preferences", async (_req, res) => {
  const prefs = await getNotificationPreferences();
  return res.json(prefs);
});

router.put("/notification-preferences", async (req, res) => {
  try {
    const {
      email,
      phone,
      killSwitchChannel,
      largeOrderChannel,
      thresholdChangeChannel,
      priceAlertChannel,
      patternAlertChannel,
    } = req.body as {
      email?: string | null;
      phone?: string | null;
      killSwitchChannel?: string;
      largeOrderChannel?: string;
      thresholdChangeChannel?: string;
      priceAlertChannel?: string;
      patternAlertChannel?: string;
    };

    const before = await getNotificationPreferences();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await updateNotificationPreferences({
      email,
      phone,
      killSwitchChannel,
      largeOrderChannel,
      thresholdChangeChannel,
      priceAlertChannel,
      patternAlertChannel,
    } as any);

    if (JSON.stringify(before) !== JSON.stringify(updated)) {
      await logAudit(
        "notification_preferences.update",
        "Préférences de notification modifiées",
        { before, after: updated },
      );
    }

    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: String(err instanceof Error ? err.message : err) });
  }
});

export default router;
