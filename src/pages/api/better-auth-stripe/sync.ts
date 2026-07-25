import { NextApiRequest, NextApiResponse } from "next";
import { BetterAuthStripeService } from "../../../lib/better-auth-stripe";
import { syncBetterAuthSubscriptionData } from "../../../lib/better-auth-stripe-server";
import { withApiAuth } from "../../../middlewares/withApiAuth";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;
  const { user } = req as any;

  if (!user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: `Method ${method} not allowed` });
  }

  try {
    // Sincronizza dati subscription tra Better Auth e sistema esistente
    const syncSuccess = await syncBetterAuthSubscriptionData(user.id);

    if (!syncSuccess) {
      return res.status(500).json({ error: "Failed to sync subscription data" });
    }

    // Ottieni dati aggiornati dopo sincronizzazione
    const subscriptionInfo = await BetterAuthStripeService.getSubscriptionInfo(user.id);

    return res.status(200).json({
      success: true,
      message: "Subscription data synchronized successfully",
      subscription: subscriptionInfo,
      source: "better-auth",
    });
  } catch (error) {
    console.error("Better Auth sync error:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      details: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
}

export default withApiAuth(handler);
