import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "src/lib/prisma";
import stripe, {
  executeStripeOperation,
  logStripeEvent,
} from "src/lib/stripe-server";

import { SUBSCRIPTION_PLANS } from "@/src/lib/stripe";
import { stripeService } from "src/lib/stripe/stripeService";
import { requireAuth } from "src/lib/api/auth";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  // GET - Get current subscription
  if (req.method === "GET") {
    try {
      const userSubscription = await prisma.subscription.findUnique({
        where: { id: userId },
      });

      // If no subscription record, create a Free plan and return it
      if (!userSubscription) {
        const newFreeSubscription = await prisma.subscription.upsert({
          where: { id: userId },
          update: {
            plan: SUBSCRIPTION_PLANS.FREE,
            status: "active",
            user: { connect: { id: userId } },
          },
          create: {
            id: userId,
            plan: SUBSCRIPTION_PLANS.FREE,
            status: "active",
            user: { connect: { id: userId } },
          },
        });

        console.log(`Created new FREE plan for user ${userId}`);

        return res.status(200).json({
          plan: SUBSCRIPTION_PLANS.FREE,
          status: "active",
          periodEnd: null,
          cancelAtPeriodEnd: false,
        });
      }

      // Check if it's a Stripe subscription with an active stripeSubscriptionId
      if (userSubscription.stripeSubscriptionId) {
        try {
          // Fetch latest subscription data from Stripe
          const stripeSubscription = await stripe.subscriptions.retrieve(
            userSubscription.stripeSubscriptionId
          );

          // Update local database with latest Stripe data
          await prisma.subscription.update({
            where: { id: userId },
            data: {
              status: stripeSubscription.status,
              stripePriceId: stripeSubscription.items.data[0]?.price.id,
              stripeCurrentPeriodEnd: new Date(
                stripeSubscription.current_period_end * 1000
              ),
              cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
            },
          });

          // Check if trial has ended
          if (stripeSubscription.status === "trialing") {
            return res.status(200).json({
              plan: stripeSubscription.items.data[0]?.price.id,
              status: "trialing",
              periodEnd: new Date(stripeSubscription.current_period_end * 1000),
              cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
              isOnTrial: true,
              trialEnd: new Date(stripeSubscription.trial_end! * 1000),
            });
          }

          return res.status(200).json({
            plan:
              stripeSubscription.items.data[0]?.price.id ||
              SUBSCRIPTION_PLANS.FREE,
            status: stripeSubscription.status,
            periodEnd: new Date(stripeSubscription.current_period_end * 1000),
            cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
          });
        } catch (stripeError) {
          console.error("Failed to fetch Stripe subscription:", stripeError);

          // If the subscription no longer exists in Stripe, update to FREE plan
          if ((stripeError as any)?.code === "resource_missing") {
            await prisma.subscription.update({
              where: { id: userId },
              data: {
                plan: SUBSCRIPTION_PLANS.FREE,
                status: "active",
                stripeSubscriptionId: null,
              },
            });

            return res.status(200).json({
              plan: SUBSCRIPTION_PLANS.FREE,
              status: "active",
              periodEnd: null,
              cancelAtPeriodEnd: false,
            });
          }

          // Otherwise, fallback to database data
          return res.status(200).json({
            plan: userSubscription.stripePriceId || SUBSCRIPTION_PLANS.FREE,
            status: userSubscription.status || "active",
            periodEnd: userSubscription.stripeCurrentPeriodEnd,
            cancelAtPeriodEnd: userSubscription.cancelAtPeriodEnd || false,
          });
        }
      }

      // Check if this is an expired trial
      if (
        userSubscription.status === "trialing" &&
        userSubscription.trialEndsAt
      ) {
        const now = new Date();
        const trialEnds = new Date(userSubscription.trialEndsAt);

        if (trialEnds <= now) {
          // Trial has expired, update to FREE
          await prisma.subscription.update({
            where: { id: userId },
            data: {
              plan: SUBSCRIPTION_PLANS.FREE,
              status: "active",
              trialEndsAt: null,
            },
          });

          console.log(
            `User ${userId} trial expired on ${trialEnds}. Updated to FREE.`
          );

          return res.status(200).json({
            plan: SUBSCRIPTION_PLANS.FREE,
            status: "active",
            periodEnd: null,
            cancelAtPeriodEnd: false,
          });
        } else {
          console.log(`User ${userId} is trialing until ${trialEnds}`);
          return res.status(200).json({
            plan: userSubscription.plan,
            status: "trialing",
            periodEnd: userSubscription.trialEndsAt,
            cancelAtPeriodEnd: false,
            isOnTrial: true,
            trialEnd: userSubscription.trialEndsAt,
          });
        }
      }

      // Return the subscription as is
      return res.status(200).json({
        plan: userSubscription.plan || SUBSCRIPTION_PLANS.FREE,
        status: userSubscription.status || "active",
        periodEnd:
          userSubscription.stripeCurrentPeriodEnd ||
          userSubscription.lsCurrentPeriodEnd,
        cancelAtPeriodEnd: userSubscription.cancelAtPeriodEnd || false,
      });
    } catch (error) {
      console.error("Failed to fetch subscription:", error);
      return res.status(500).json({ message: "Failed to fetch subscription" });
    }
  }

  // POST - Create Stripe checkout session
  else if (req.method === "POST") {
    try {
      const { priceId, startTrial } = req.body;

      if (!priceId) {
        return res
          .status(400)
          .json({ message: "Missing required field: priceId" });
      }

      // Start a trial if requested (for Pro plan only)
      if (startTrial && priceId === SUBSCRIPTION_PLANS.PRO) {
        return await startFreeTrial(userId, priceId, res);
      }

      // Get user data for pre-filling checkout
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Create Stripe checkout session using enterprise service
      const session = await stripeService.createCheckoutSession({
        userId,
        priceId,
        customerEmail: user.email || undefined,
        successUrl: `${process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || "http://localhost:3000"}/settings/subscription?success=true`,
        cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || "http://localhost:3000"}/settings/subscription?canceled=true`,
        allowPromotionCodes: true,
        automaticTax: true,
        billingAddressCollection: "auto",
        metadata: {
          id: userId,
          planType: priceId,
        },
      });

      if (!session.url) {
        throw new Error("Failed to create Stripe checkout session URL");
      }

      return res.status(200).json({ url: session.url });
    } catch (error: any) {
      console.error("Failed to create Stripe checkout session:", error);
      return res
        .status(500)
        .json({ message: "Failed to create checkout session" });
    }
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    return res
      .status(405)
      .json({ message: `Method ${req.method} Not Allowed` });
  }
}

// Helper function to start a free trial
async function startFreeTrial(
  userId: string,
  planPriceId: string,
  res: NextApiResponse
) {
  try {
    // Check if user already has a subscription
    const existingSubscription = await prisma.subscription.findUnique({
      where: { id: userId },
    });

    if (existingSubscription && existingSubscription.status !== "expired") {
      if (existingSubscription.status === "trialing") {
        return res
          .status(400)
          .json({ message: "You already have an active trial" });
      }
      return res
        .status(400)
        .json({ message: "You already have an active subscription" });
    }

    // Get user data for creating Stripe customer
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.email) {
      return res
        .status(404)
        .json({ message: "User not found or missing email" });
    }

    // 1. Create or get Stripe customer
    let stripeCustomerId = existingSubscription?.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await executeStripeOperation(
        () =>
          stripe.customers.create({
            email: user.email!,
            name: user.name || undefined,
            metadata: { userId },
          }),
        "create_customer_for_trial"
      );
      stripeCustomerId = customer.id;
    }

    // 2. Calculate trial end date (14 days from now)
    const trialEndTimestamp = Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60;

    // 3. Create a trial subscription in Stripe
    const subscription = await executeStripeOperation(
      () =>
        stripe.subscriptions.create({
          customer: stripeCustomerId!,
          items: [{ price: planPriceId }],
          trial_end: trialEndTimestamp,
          metadata: { userId },
        }),
      "create_manual_trial"
    );

    // 4. Update local database record
    await prisma.subscription.upsert({
      where: { id: userId },
      update: {
        plan: planPriceId,
        status: "trialing",
        trialEndsAt: new Date(subscription.trial_end! * 1000),
        stripeCustomerId,
        stripeSubscriptionId: subscription.id,
        stripePriceId: planPriceId,
        stripeCurrentPeriodEnd: new Date(
          subscription.current_period_end * 1000
        ),
      },
      create: {
        id: userId,
        plan: planPriceId,
        status: "trialing",
        trialEndsAt: new Date(subscription.trial_end! * 1000),
        stripeCustomerId,
        stripeSubscriptionId: subscription.id,
        stripePriceId: planPriceId,
        stripeCurrentPeriodEnd: new Date(
          subscription.current_period_end * 1000
        ),
        user: { connect: { id: userId } },
      },
    });

    return res.status(200).json({
      success: true,
      message: "Trial started successfully",
      redirectUrl: "/settings/subscription",
    });
  } catch (error) {
    console.error("Failed to start trial:", error);
    return res.status(500).json({ message: "Failed to start trial" });
  }
}
