import { NextApiRequest, NextApiResponse } from "next";
import { auth } from "@/src/lib/auth";
import { prisma } from "src/lib/prisma";
import { SUBSCRIPTION_PLANS, PLAN_FEATURES } from "src/lib/stripe";

/**
 * Middleware to check if user's subscription allows access to the requested feature
 */
export function withSubscription(requiredPlan: string = SUBSCRIPTION_PLANS.FREE) {
  return async (handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>) => {
    return async (req: NextApiRequest, res: NextApiResponse) => {
      try {
        // Get session from Better Auth
        const session = await auth.api.getSession({
          headers: req.headers as any,
        });

        // If no session exists, user is not authenticated
        if (!session) {
          return res.status(401).json({
            success: false,
            message: "Authentication required"
          });
        }

        const userId = (session.user as any).id;

        // Get user's subscription
        const subscription = await prisma.subscription.findUnique({
          where: { userId }
        });

        const now = new Date();
        let userPlan = SUBSCRIPTION_PLANS.PRO;
        let isActiveOrTrialing = false;

        if (subscription) {
          userPlan = subscription.plan;

          // Check if trial is active
          if (subscription.status === "trialing") {
            if (subscription.id && subscription.cancelAtPeriodEnd === false && subscription.updatedAt > now) {
              // Trial is still valid
              isActiveOrTrialing = true;
            } else {
              // Trial has expired, consider it as not active for paid plans
              // You might want to update the DB status to 'inactive' here or via a cron job
              isActiveOrTrialing = false;
              userPlan = SUBSCRIPTION_PLANS.FREE; // Fallback to FREE plan if trial expires
            }
          } else if (subscription.status === "active") {
            // Subscription is active (not in trial)
            isActiveOrTrialing = true;
          }
        }

        // If status is neither active nor in valid trial, deny access if required plan is not FREE
        if (!isActiveOrTrialing && requiredPlan !== SUBSCRIPTION_PLANS.FREE) {
          return res.status(403).json({
            success: false,
            message:
              subscription?.status === "trialing"
                ? "Your trial period has expired. Please subscribe to continue."
                : "Your subscription is not active."
          });
        }

        // Check if user's plan has access to the required plan
        const hasAccess = checkPlanAccess(
          userPlan as keyof typeof SUBSCRIPTION_PLANS,
          requiredPlan as keyof typeof SUBSCRIPTION_PLANS
        );

        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            message: "Your current plan does not include access to this feature"
          });
        }

        // Add subscription info to the request
        const currentLimits = PLAN_FEATURES[userPlan]?.limits || PLAN_FEATURES[SUBSCRIPTION_PLANS.FREE].limits;
        req.subscription = {
          plan: userPlan,
          status: subscription?.status || "free", // 'free' if no subscription
          limits: currentLimits
        } as NextApiRequest["subscription"];

        // Call the original handler
        return handler(req, res);
      } catch (error) {
        console.error("Subscription check error:", error);
        return res.status(500).json({
          success: false,
          message: "Internal server error during subscription check"
        });
      }
    };
  };
}

// Helper function to check if user's plan has access to the required plan
function checkPlanAccess(
  userPlan: keyof typeof SUBSCRIPTION_PLANS,
  requiredPlan: keyof typeof SUBSCRIPTION_PLANS
): boolean {
  // Ensure plans exist to avoid errors
  if (!SUBSCRIPTION_PLANS[userPlan] || !SUBSCRIPTION_PLANS[requiredPlan]) {
    console.warn(`Plan check warning: Plan ${userPlan} or ${requiredPlan} not found.`);
    return false; // Or handle as you see fit
  }
  // Define a plan hierarchy for comparison
  const planHierarchy = [SUBSCRIPTION_PLANS.FREE, SUBSCRIPTION_PLANS.PRO, SUBSCRIPTION_PLANS.ENTERPRISE]; // Example
  const userPlanIndex = planHierarchy.indexOf(userPlan);
  const requiredPlanIndex = planHierarchy.indexOf(requiredPlan);

  // If any of the plans are not in the defined hierarchy, handle it
  if (userPlanIndex === -1 || requiredPlanIndex === -1) {
    console.warn(`Plan hierarchy issue: ${userPlan} or ${requiredPlan}`);
    return false;
  }

  return userPlanIndex >= requiredPlanIndex;
}

// Extend the NextApiRequest interface to include subscription
declare module "next" {
  interface NextApiRequest {
    plan: string;
    status: string; // e.g., 'trialing', 'active', 'free', 'inactive'

    trialEndsAt?: Date | null; // Keep for potential future use or clarity

    limits: {
      maxProjects?: number;
      maxComponents?: number;
      maxStorage?: number;
      // Allow other potential limits from PLAN_FEATURES
      [key: string]: any;
    };
  }
}
