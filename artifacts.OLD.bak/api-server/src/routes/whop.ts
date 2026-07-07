import { Router } from "express";
import { getWhopClient } from "../whopClient";

const router = Router();

// Non-sensitive config IDs (not secrets)
const COMPANY_ID = process.env.WHOP_COMPANY_ID ?? "biz_jWeofD0XtU4iRH";
const PLAN_ID = process.env.WHOP_PLAN_ID ?? "plan_JrkAsnIXuyaK6";

router.get("/whop/plans", async (req, res) => {
  try {
    const client = await getWhopClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plan = await (client as any).plans.retrieve(PLAN_ID);
    return res.json({
      id: plan.id,
      renewalPrice: plan.renewal_price,
      billingPeriod: plan.billing_period,
      currency: plan.currency,
      productTitle: plan.product?.title ?? "Accès Premium",
      purchaseUrl: plan.purchase_url,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch Whop plan");
    return res.status(500).json({ error: "Failed to fetch plan" });
  }
});

router.post("/whop/checkout", async (req, res) => {
  const { redirectUrl } = req.body as { redirectUrl?: string };
  if (!redirectUrl) {
    return res.status(400).json({ error: "redirectUrl is required" });
  }

  try {
    const client = await getWhopClient();

    // Create a checkout configuration for this session
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const checkout = await (client as any).checkoutConfigurations.create({
      plan_id: PLAN_ID,
      redirect_url: redirectUrl,
    });

    return res.json({
      checkoutId: checkout.id,
      purchaseUrl: checkout.purchase_url,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create Whop checkout");
    return res.status(500).json({ error: "Failed to create checkout" });
  }
});

router.get("/whop/verify", async (req, res) => {
  const { membershipId } = req.query as { membershipId?: string };
  if (!membershipId) {
    return res.status(400).json({ error: "membershipId required" });
  }

  try {
    const client = await getWhopClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const membership = await (client as any).memberships.retrieve(membershipId);
    const hasAccess =
      membership?.valid &&
      membership?.product?.id === "prod_Vm5BtK32mmOY2";

    return res.json({ hasAccess, status: membership?.status ?? "unknown" });
  } catch (err) {
    req.log.error({ err }, "Failed to verify Whop membership");
    return res.status(500).json({ error: "Verification failed" });
  }
});

export default router;
