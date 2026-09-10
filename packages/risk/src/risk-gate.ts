import type { OrderRequest } from "@workspace/broker";
import type { AuditRepo, RiskContext, RiskDecision, RiskSettingsRepo } from "./types";

/** Final, fail-closed risk passage for every broker order, including protection. */
export class RiskGate {
  constructor(
    private readonly settings: RiskSettingsRepo,
    private readonly audit: AuditRepo,
  ) {}

  async evaluate(req: OrderRequest, ctx: RiskContext): Promise<RiskDecision> {
    const s = await this.settings.get(req.accountId);
    const mode = s.mode;
    if (s.killSwitchActive && !req.reduceOnly) {
      return this.block(req, mode, `kill_switch: ${s.killSwitchReason ?? "activé"}`);
    }
    if (!Number.isFinite(ctx.referencePrice) || ctx.referencePrice <= 0) {
      return this.block(req, mode, "prix de référence invalide");
    }
    if (ctx.dayStartEquity > 0 && !req.reduceOnly) {
      const lossPct = ((ctx.dayStartEquity - ctx.currentEquity) / ctx.dayStartEquity) * 100;
      if (lossPct >= s.maxDailyLossPct) {
        await this.settings.activateKillSwitch(req.accountId, `perte quotidienne ${lossPct.toFixed(2)}%`);
        return this.block(req, mode, "perte quotidienne maximale atteinte");
      }
    }
    if (ctx.ordersLastHour >= s.maxOrdersPerHour && !req.reduceOnly) {
      return this.block(req, mode, "plafond horaire d’ordres atteint");
    }

    const maxNotional = ctx.totalEquity * (s.maxPositionPct / 100);
    const requestedNotional = req.quantity * ctx.referencePrice;
    let quantity = req.quantity;
    if (!req.reduceOnly && requestedNotional > maxNotional) quantity = maxNotional / ctx.referencePrice;
    if (quantity < ctx.limits.minQuantity) return this.block(req, mode, "quantité sous le minimum du marché");
    if (ctx.limits.minNotional != null && quantity * ctx.referencePrice < ctx.limits.minNotional) {
      return this.block(req, mode, "notionnel sous le minimum du marché");
    }
    const adjustedQuantity = quantity !== req.quantity ? quantity : undefined;
    const decision = adjustedQuantity == null ? "allowed" : "adjusted";
    await this.audit.record(req, decision, undefined, {
      mode, referencePrice: ctx.referencePrice, quantity: adjustedQuantity ?? req.quantity,
      simulated: mode === "dry_run",
    });
    return { allowed: true, adjustedQuantity, mode };
  }

  private async block(req: OrderRequest, mode: "dry_run" | "live", reason: string): Promise<RiskDecision> {
    await this.audit.record(req, "blocked", reason, { mode, simulated: mode === "dry_run" });
    return { allowed: false, reason, mode };
  }
}