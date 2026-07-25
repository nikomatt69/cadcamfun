import { NextApiRequest, NextApiResponse } from "next";
import { BetterAuthStripeService } from "../../../lib/better-auth-stripe";
import { withApiAuth } from "../../../middlewares/withApiAuth";
import { FeatureFlag } from "../../../types/featureFlags";

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
    const { feature, features } = req.body;

    if (!feature && !features) {
      return res.status(400).json({ error: "feature or features array is required" });
    }

    // Controlla singola feature
    if (feature) {
      if (!Object.values(FeatureFlag).includes(feature)) {
        return res.status(400).json({ error: "Invalid feature flag" });
      }

      const hasAccess = await BetterAuthStripeService.hasFeatureAccess(user.id, feature);
      
      return res.status(200).json({
        feature,
        hasAccess,
        source: "better-auth",
      });
    }

    // Controlla multiple features
    if (features && Array.isArray(features)) {
      const accessResults = await Promise.all(
        features.map(async (f) => {
          if (!Object.values(FeatureFlag).includes(f)) {
            return { feature: f, hasAccess: false, error: "Invalid feature flag" };
          }
          
          const hasAccess = await BetterAuthStripeService.hasFeatureAccess(user.id, f);
          return { feature: f, hasAccess };
        })
      );

      return res.status(200).json({
        features: accessResults,
        source: "better-auth",
      });
    }

    return res.status(400).json({ error: "Invalid request format" });
  } catch (error) {
    console.error("Better Auth feature access error:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      details: process.env.NODE_ENV === "development" ? error : undefined,
    });
  }
}

export default withApiAuth(handler);