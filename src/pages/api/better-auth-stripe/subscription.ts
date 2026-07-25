import { NextApiRequest, NextApiResponse } from "next";
import { BetterAuthStripeService } from "../../../lib/better-auth-stripe";
import { withApiAuth } from "../../../middlewares/withApiAuth";
import { SubscriptionPlan } from "../../../types/subscription";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;
  const { user } = req as any;

  if (!user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    switch (method) {
      case "GET":
        // Ottieni informazioni subscription da Better Auth
        const subscriptionInfo = await BetterAuthStripeService.getSubscriptionInfo(user.id);
        
        if (!subscriptionInfo) {
          return res.status(200).json({
            plan: "FREE",
            status: "inactive",
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            source: "better-auth",
          });
        }

        return res.status(200).json({
          ...subscriptionInfo,
          source: "better-auth",
        });

      case "POST":
        // Crea checkout session con Better Auth
        const { plan, successUrl, cancelUrl, trialDays } = req.body;

        if (!plan || !successUrl || !cancelUrl) {
          return res.status(400).json({ 
            error: "Missing required fields: plan, successUrl, cancelUrl" 
          });
        }

        if (!Object.values(["FREE", "BASIC", "PRO", "ENTERPRISE"]).includes(plan)) {
          return res.status(400).json({ error: "Invalid plan" });
        }

        const checkoutSession = await BetterAuthStripeService.createCheckoutSession(
          user.id,
          plan as SubscriptionPlan,
          {
            successUrl,
            cancelUrl,
            trialDays,
          }
        );

        if (!checkoutSession) {
          return res.status(500).json({ error: "Failed to create checkout session" });
        }

        return res.status(200).json({
          url: checkoutSession.url,
          source: "better-auth",
        });

      case "PUT":
        // Aggiorna subscription plan
        const { newPlan } = req.body;

        if (!newPlan || !Object.values(["FREE", "BASIC", "PRO", "ENTERPRISE"]).includes(newPlan)) {
          return res.status(400).json({ error: "Invalid plan" });
        }

        const updateSuccess = await BetterAuthStripeService.updateSubscriptionPlan(
          user.id,
          newPlan as SubscriptionPlan
        );

        if (!updateSuccess) {
          return res.status(500).json({ error: "Failed to update subscription" });
        }

        return res.status(200).json({ 
          success: true,
          message: "Subscription updated successfully",
          source: "better-auth",
        });

      case "DELETE":
        // Cancella subscription
        const cancelSuccess = await BetterAuthStripeService.cancelSubscription(user.id);

        if (!cancelSuccess) {
          return res.status(500).json({ error: "Failed to cancel subscription" });
        }

        return res.status(200).json({ 
          success: true,
          message: "Subscription cancelled successfully",
          source: "better-auth",
        });

      default:
        res.setHeader("Allow", ["GET", "POST", "PUT", "DELETE"]);
        return res.status(405).json({ error: `Method ${method} not allowed` });
    }
  } catch (error) {
    console.error("Better Auth Stripe API error:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      details: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
}

export default withApiAuth(handler);