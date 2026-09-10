/**
 * Contrat de livraison de notify() (via notifyDailyLossWarning) :
 * sendEmail/sendSms retournent `false` pour les échecs ordinaires (sans lever
 * d'exception) — un canal ne compte comme livré QUE si l'appel retourne true.
 * Ce contrat conditionne la libération de la réclamation anti-doublon de
 * l'avertissement de perte journalière (re-tentative au cycle suivant).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  sendEmail: vi.fn<() => Promise<boolean>>(),
  sendSms: vi.fn<() => Promise<boolean>>(),
  resolveDestinations: vi.fn(),
}));

vi.mock("../emailClient", () => ({ sendEmail: h.sendEmail }));
vi.mock("../smsClient", () => ({ sendSms: h.sendSms }));
vi.mock("../notificationPrefs", () => ({ resolveDestinations: h.resolveDestinations }));

import {
  notifyDailyLossWarning,
  notifyKillSwitchActivated,
  notifyProtectivePlacementFailure,
  notifyBrokerAuthenticationError,
  notifyStaleData,
} from "../notifications";

const bothChannels = {
  email: "a@b.c", phone: "+15551234567", sendEmail: true, sendSms: true,
};
const params = { loss: 200, maxLoss: 250, pct: 80 };

describe("notifyDailyLossWarning — contrat de livraison des canaux", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.resolveDestinations.mockResolvedValue(bothChannels);
  });

  it("tous les canaux livrent (true) → succès", async () => {
    h.sendEmail.mockResolvedValue(true);
    h.sendSms.mockResolvedValue(true);
    await expect(notifyDailyLossWarning(params)).resolves.toBe(true);
  });

  it("tous les canaux retournent false (échec ordinaire, sans exception) → échec", async () => {
    h.sendEmail.mockResolvedValue(false);
    h.sendSms.mockResolvedValue(false);
    await expect(notifyDailyLossWarning(params)).resolves.toBe(false);
  });

  it("un canal échoue (false), l'autre livre → succès partiel accepté", async () => {
    h.sendEmail.mockResolvedValue(false);
    h.sendSms.mockResolvedValue(true);
    await expect(notifyDailyLossWarning(params)).resolves.toBe(true);
  });

  it("exceptions sur tous les canaux → échec (sans propager)", async () => {
    h.sendEmail.mockRejectedValue(new Error("réseau"));
    h.sendSms.mockRejectedValue(new Error("Twilio down"));
    await expect(notifyDailyLossWarning(params)).resolves.toBe(false);
  });

  it("exception sur un canal, l'autre livre → succès", async () => {
    h.sendEmail.mockRejectedValue(new Error("réseau"));
    h.sendSms.mockResolvedValue(true);
    await expect(notifyDailyLossWarning(params)).resolves.toBe(true);
  });

  it("aucun canal configuré → succès (rien à livrer, pas de re-tentative)", async () => {
    h.resolveDestinations.mockResolvedValue({ email: null, phone: null, sendEmail: false, sendSms: false });
    await expect(notifyDailyLossWarning(params)).resolves.toBe(true);
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.sendSms).not.toHaveBeenCalled();
  });

  it("canal configuré mais destination absente → aucun envoi tenté, succès (rien de livrable)", async () => {
    h.resolveDestinations.mockResolvedValue({ email: null, phone: null, sendEmail: true, sendSms: true });
    await expect(notifyDailyLossWarning(params)).resolves.toBe(true);
    expect(h.sendEmail).not.toHaveBeenCalled();
    expect(h.sendSms).not.toHaveBeenCalled();
  });
});

describe("Lot 6 acceptance 5 — critical events use the configured email/SMS channel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.resolveDestinations.mockResolvedValue({
      email: "configured@example.test",
      phone: "+15550001111",
      sendEmail: true,
      sendSms: false,
    });
    h.sendEmail.mockResolvedValue(true);
    h.sendSms.mockResolvedValue(true);
  });

  it.each([
    ["kill-switch activation", () => notifyKillSwitchActivated("loss threshold")],
    ["protective placement failure", () => notifyProtectivePlacementFailure({ symbol: "AAPL", kind: "stop_loss", error: "broker unavailable" })],
    ["broker authentication error", () => notifyBrokerAuthenticationError(new Error("unauthorized"))],
    ["stale data", () => notifyStaleData("AAPL", 16)],
  ])("%s is delivered without a hardcoded destination", async (_event, send) => {
    await send();
    expect(h.resolveDestinations).toHaveBeenCalledWith("killSwitch");
    expect(h.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "configured@example.test" }));
    expect(h.sendEmail).not.toHaveBeenCalledWith(expect.objectContaining({ to: "ALERT_NOTIFY_EMAIL" }));
    expect(h.sendSms).not.toHaveBeenCalled();
  });

  it("supports the configured SMS channel for every critical event", async () => {
    h.resolveDestinations.mockResolvedValue({
      email: null,
      phone: "+15550002222",
      sendEmail: false,
      sendSms: true,
    });

    await notifyBrokerAuthenticationError("unauthorized");

    expect(h.sendSms).toHaveBeenCalledWith(expect.objectContaining({ to: "+15550002222" }));
    expect(h.sendEmail).not.toHaveBeenCalled();
  });
});
