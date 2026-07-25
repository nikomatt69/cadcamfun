import { NextApiRequest, NextApiResponse } from "next";
import { BetterAuthStripeService } from "../../../lib/better-auth-stripe";
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
    const { returnUrl } = req.body;

    if (!returnUrl) {
      return res.status(400).json({ error: "returnUrl is required" });
    }

    const portalSession = await BetterAuthStripeService.createBillingPortalSession(
      user.id,
      returnUrl
    );

    if (!portalSession) {
      return res.status(500).json({ error: "Failed to create billing portal session" });
    }

    return res.status(200).json({
      url: portalSession.url,
      source: "better-auth",
    });
  } catch (error) {
    console.error("Better Auth billing portal error:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      details: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
}

export default withApiAuth(handler);