import { NextApiRequest, NextApiResponse } from 'next';
import { getToken } from 'next-auth/jwt';
import { prisma } from 'src/lib/prisma';
import { SUBSCRIPTION_PLANS, PLAN_FEATURES } from 'src/lib/stripe';

/**
 * Middleware to check if user's subscription allows access to the requested feature
 */
export function withSubscription(requiredPlan: string = SUBSCRIPTION_PLANS.FREE) {
  return async (handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>) => {
    return async (req: NextApiRequest, res: NextApiResponse) => {
      try {
        // Get token from the session
        const token = await getToken({ 
          req, 
          secret: process.env.NEXTAUTH_SECRET
        });
        
        // If no token exists, user is not authenticated
        if (!token) {
          return res.status(401).json({ 
            success: false, 
            message: 'Authentication required' 
          });
        }
        
        const userId = token.id as string;
        
        // Get user's subscription
        const subscription = await prisma.subscription.findUnique({
          where: { userId }
        });
        
        // Default to free plan if no subscription exists
        const userPlan = subscription?.plan || SUBSCRIPTION_PLANS.FREE;
        
        // Check if subscription is active
        if (subscription && subscription.status !== 'active' && subscription.status !== 'trialing') {
          // If subscription is not active and required plan is not free, deny access
          if (requiredPlan !== SUBSCRIPTION_PLANS.FREE) {
            return res.status(403).json({
              success: false,
              message: 'Your subscription is not active'
            });
          }
        }
        
        // Check if user's plan has access to the required plan
        const hasAccess = checkPlanAccess(userPlan, requiredPlan);
        
        if (!hasAccess) {
          return res.status(403).json({ 
            success: false, 
            message: 'Your subscription does not include access to this feature' 
          });
        }
        
        // Add subscription info to the request
        req.subscription = {
          plan: userPlan,
          limits: PLAN_FEATURES[userPlan]?.limits
        };
        
        // Call the original handler
        return handler(req, res);
      } catch (error) {
        console.error('Subscription check error:', error);
        return res.status(500).json({ 
          success: false, 
          message: 'Internal server error during subscription check'
        });
      }
    };
  };
}

// Helper function to check if user's plan has access to the required plan
function checkPlanAccess(userPlan: string, requiredPlan: string) {
  const plans = Object.keys(SUBSCRIPTION_PLANS);
  const userPlanIndex = plans.indexOf(userPlan);
  const requiredPlanIndex = plans.indexOf(requiredPlan);
  
  return userPlanIndex >= requiredPlanIndex;
}

// Extend the NextApiRequest interface to include subscription
declare module 'next' {
  interface NextApiRequest {
    subscription?: {
      plan: string;
      limits: {
        maxProjects: number;
        maxComponents: number;
        maxStorage: number;
      };
    };
  }
}