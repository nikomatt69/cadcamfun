import { prisma } from "./prisma";
import { BetterAuthStripeService } from "./better-auth-stripe";

export async function syncBetterAuthSubscriptionData(userId: string): Promise<boolean> {
  try {
    const betterAuthSub = await BetterAuthStripeService.getSubscriptionInfo(userId);
    if (!betterAuthSub) return false;

    await prisma.subscription.upsert({
      where: { id: userId },
      update: {
        plan: betterAuthSub.plan,
        status: betterAuthSub.status,
        stripeCustomerId: betterAuthSub.stripeCustomerId,
        stripeSubscriptionId: betterAuthSub.stripeSubscriptionId,
        stripeCurrentPeriodEnd: betterAuthSub.currentPeriodEnd,
        cancelAtPeriodEnd: betterAuthSub.cancelAtPeriodEnd,
        updatedAt: new Date(),
      },
      create: {
        user: { connect: { id: userId } },
        plan: betterAuthSub.plan,
        status: betterAuthSub.status,
        stripeCustomerId: betterAuthSub.stripeCustomerId,
        stripeSubscriptionId: betterAuthSub.stripeSubscriptionId,
        stripeCurrentPeriodEnd: betterAuthSub.currentPeriodEnd,
        cancelAtPeriodEnd: betterAuthSub.cancelAtPeriodEnd,
      },
    });

    return true;
  } catch (error) {
    console.error("Error syncing subscription data:", error);
    return false;
  }
}
