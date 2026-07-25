import { prisma } from "@/src/lib/prisma";
import { SUBSCRIPTION_PLANS } from "@/src/lib/stripe";

export async function updateExpiredTrials() {
  const now = new Date();
  console.log(`[${now.toISOString()}] Running updateExpiredTrials task...`);

  try {
    // Find subscriptions that are 'trialing' and whose trialEndsAt is in the past
    const expiredTrials = await prisma.subscription.findMany({
      where: {
        status: "trialing",
        trialEndsAt: {
          lte: now, // Less than or equal to now
        },
      },
      select: {
        id: true, // Select only userId to update
      },
    });

    if (expiredTrials.length === 0) {
      console.log("No expired trials found.");
      return { success: true, updatedCount: 0 };
    }

    const userIdsToExpire = expiredTrials.map((sub) => sub.id);
    console.log(
      `Found ${expiredTrials.length} expired trials for users:`,
      userIdsToExpire
    );

    // Update the found subscriptions
    const updateResult = await prisma.subscription.updateMany({
      where: {
        id: {
          in: userIdsToExpire,
        },
        // Add extra condition to be safe
        status: "trialing",
        trialEndsAt: {
          lte: now,
        },
      },
      data: {
        status: "expired", // Or 'active' if you want them to default straight to Free active
        plan: SUBSCRIPTION_PLANS.FREE,
        trialEndsAt: null, // Optionally clear the trial end date
        // Clear LS fields if they shouldn't have had LS info during trial
        lsSubscriptionId: null,
        lsVariantId: null,
        lsCurrentPeriodEnd: null,
      },
    });

    console.log(
      `Successfully updated ${updateResult.count} expired trial records.`
    );
    return { success: true, updatedCount: updateResult.count };
  } catch (error) {
    console.error("Error updating expired trials:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
