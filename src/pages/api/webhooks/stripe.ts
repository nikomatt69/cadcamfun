import { NextApiRequest, NextApiResponse } from "next";
import { buffer } from "micro";
import Stripe from "stripe";
import stripe, {
  logStripeEvent,
  executeStripeOperation,
} from "src/lib/stripe-server";
import { prisma } from "src/lib/prisma";
import { stripeService } from "src/lib/stripe/stripeService";
import { SUBSCRIPTION_PLANS } from "@/src/lib/stripe";

// Disable body parsing as we need raw body for webhook verification
export const config = {
  api: {
    bodyParser: false,
  },
};

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  let event: Stripe.Event;

  try {
    const buf = await buffer(req);
    const sig = req.headers["stripe-signature"];

    if (!sig || !webhookSecret) {
      console.error("Missing Stripe signature or webhook secret");
      return res
        .status(400)
        .json({ message: "Missing signature or webhook secret" });
    }

    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).json({ message: `Webhook Error: ${err.message}` });
  }

  // Handle the event with enterprise logging
  try {
    logStripeEvent("webhook_received", {
      eventType: event.type,
      eventId: event.id,
    });

    switch (event.type) {
      case "customer.subscription.created":
        await handleSubscriptionCreated(
          event.data.object as Stripe.Subscription
        );
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription
        );
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription
        );
        break;

      case "checkout.session.completed":
        await handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session
        );
        break;

      case "checkout.session.async_payment_succeeded":
        await handleAsyncPaymentSucceeded(
          event.data.object as Stripe.Checkout.Session
        );
        break;

      case "checkout.session.async_payment_failed":
        await handleAsyncPaymentFailed(
          event.data.object as Stripe.Checkout.Session
        );
        break;

      case "invoice.payment_succeeded":
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case "customer.subscription.trial_will_end":
        await handleTrialWillEnd(event.data.object as Stripe.Subscription);
        break;

      case "invoice.upcoming":
        await handleUpcomingInvoice(event.data.object as Stripe.Invoice);
        break;

      default:
        logStripeEvent(
          "unhandled_webhook_event",
          {
            eventType: event.type,
            eventId: event.id,
          },
          "warn"
        );
    }

    logStripeEvent("webhook_processed", {
      eventType: event.type,
      eventId: event.id,
    });

    res.status(200).json({ received: true });
  } catch (error: any) {
    // Enhanced error handling with specific error types
    const errorDetails = {
      eventType: event.type,
      eventId: event.id,
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      code: error.code,
    };

    // Log error with enhanced details
    logStripeEvent("webhook_error", errorDetails, "error");

    // Send appropriate status code based on error type
    if (
      error.code === "RESOURCE_MISSING" ||
      error.type === "StripeInvalidRequestError"
    ) {
      return res
        .status(404)
        .json({ message: "Resource not found", error: error.message });
    } else if (error.type === "StripePermissionError") {
      return res
        .status(403)
        .json({ message: "Permission denied", error: error.message });
    } else if (error.type === "StripeRateLimitError") {
      return res
        .status(429)
        .json({ message: "Rate limit exceeded", error: error.message });
    } else {
      return res
        .status(500)
        .json({ message: "Webhook handler failed", error: error.message });
    }
  }
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;

  logStripeEvent("subscription_created", {
    subscriptionId: subscription.id,
    customerId,
    priceId,
    status: subscription.status,
  });

  // Find user by Stripe customer ID
  const existingSubscription = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!existingSubscription) {
    logStripeEvent(
      "subscription_create_failed",
      {
        customerId,
        reason: "No subscription record found",
      },
      "error"
    );
    return;
  }

  await executeStripeOperation(
    () =>
      prisma.subscription.update({
        where: { id: existingSubscription.id },
        data: {
          stripeSubscriptionId: subscription.id,
          stripePriceId: priceId,
          status: subscription.status,
          stripeCurrentPeriodStart: new Date(
            subscription.current_period_start * 1000
          ),
          stripeCurrentPeriodEnd: new Date(
            subscription.current_period_end * 1000
          ),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          // Clear trial data if subscription is active
          trialEndsAt:
            subscription.status === "active"
              ? null
              : existingSubscription.trialEndsAt,
        },
      }),
    "update_subscription_db"
  );
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;

  logStripeEvent("subscription_updated", {
    subscriptionId: subscription.id,
    customerId,
    priceId,
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });

  const existingSubscription = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!existingSubscription) {
    logStripeEvent(
      "subscription_update_failed",
      {
        customerId,
        reason: "No subscription record found",
      },
      "error"
    );
    return;
  }

  await executeStripeOperation(
    () =>
      prisma.subscription.update({
        where: { id: existingSubscription.id },
        data: {
          stripePriceId: priceId,
          status: subscription.status,
          stripeCurrentPeriodStart: new Date(
            subscription.current_period_start * 1000
          ),
          stripeCurrentPeriodEnd: new Date(
            subscription.current_period_end * 1000
          ),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          // Clear trial data if subscription is now active
          trialEndsAt:
            subscription.status === "active"
              ? null
              : existingSubscription.trialEndsAt,
        },
      }),
    "update_subscription_db"
  );
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  const existingSubscription = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!existingSubscription) {
    console.error("No subscription found for customer:", customerId);
    return;
  }

  await prisma.subscription.update({
    where: { id: existingSubscription.id },
    data: {
      status: "canceled",
      stripeSubscriptionId: null,
      stripePriceId: null,
      stripeCurrentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    },
  });

  console.log(`Deleted subscription for customer ${customerId}`);
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.client_reference_id || session.metadata?.userId;
  const customerId = session.customer as string;

  if (!userId) {
    console.error("No user ID found in checkout session");
    return;
  }

  // Create or update subscription record
  await prisma.subscription.upsert({
    where: { id: userId },
    update: {
      stripeCustomerId: customerId,
    },
    create: {
      id: userId,
      user: { connect: { id: userId } },
      stripeCustomerId: customerId,
      plan: SUBSCRIPTION_PLANS.FREE,
      status: "active",
    },
  });

  console.log(`Checkout completed for user ${userId}, customer ${customerId}`);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  const existingSubscription = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (existingSubscription) {
    await prisma.subscription.update({
      where: { id: existingSubscription.id },
      data: {
        status: "active",
      },
    });
    console.log(`Payment succeeded for customer ${customerId}`);
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  logStripeEvent(
    "payment_failed",
    {
      invoiceId: invoice.id,
      customerId,
      amount: invoice.amount_due,
      currency: invoice.currency,
      attemptCount: invoice.attempt_count,
    },
    "error"
  );

  // Use the enterprise service to handle failed payment
  await stripeService.handleFailedPayment(invoice.id);
}

async function handleTrialWillEnd(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  logStripeEvent("trial_will_end", {
    subscriptionId: subscription.id,
    customerId,
    trialEnd: new Date(subscription.trial_end! * 1000).toISOString(),
  });

  // Here you could send notification emails, etc.
  // For now, just log the event
}

async function handleUpcomingInvoice(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  logStripeEvent("upcoming_invoice", {
    invoiceId: invoice.id,
    customerId,
    amount: invoice.amount_due,
    currency: invoice.currency,
    periodStart: new Date(invoice.period_start * 1000).toISOString(),
    periodEnd: new Date(invoice.period_end * 1000).toISOString(),
  });

  // Here you could send invoice preview emails, etc.
}

// New handler for async payment success
async function handleAsyncPaymentSucceeded(session: Stripe.Checkout.Session) {
  logStripeEvent("async_payment_succeeded", {
    sessionId: session.id,
    customerId: session.customer,
    paymentStatus: session.payment_status,
    mode: session.mode,
  });

  try {
    // For subscription payments
    if (session.mode === "subscription" && session.subscription) {
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription.id;

      // Get full subscription details
      const subscription = await executeStripeOperation(
        () => stripe.subscriptions.retrieve(subscriptionId),
        "retrieve_subscription_after_async_payment"
      );

      // Update subscription record in database
      await updateSubscriptionAfterSuccessfulPayment(subscription);
    }

    // For one-time payments
    if (session.mode === "payment") {
      // Handle one-time payment success
      await handleOneTimePaymentSuccess(session);
    }

    // Send success notification to customer
    if (session.customer_details?.email) {
      // In production, you would send an email notification here
      console.log(
        `Payment success notification would be sent to ${session.customer_details.email}`
      );
    }
  } catch (error: any) {
    logStripeEvent(
      "async_payment_success_handling_failed",
      {
        sessionId: session.id,
        error: error.message,
      },
      "error"
    );
    throw error; // Re-throw to be caught by the main error handler
  }
}

// New handler for async payment failure
async function handleAsyncPaymentFailed(session: Stripe.Checkout.Session) {
  logStripeEvent("async_payment_failed", {
    sessionId: session.id,
    customerId: session.customer,
    paymentStatus: session.payment_status,
    mode: session.mode,
  });

  try {
    // For subscription payments
    if (session.mode === "subscription" && session.subscription) {
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription.id;

      // Get full subscription details
      const subscription = await executeStripeOperation(
        () => stripe.subscriptions.retrieve(subscriptionId),
        "retrieve_subscription_after_failed_payment"
      );

      // Update subscription status in database
      await prisma.subscription.updateMany({
        where: {
          stripeSubscriptionId: subscriptionId,
        },
        data: {
          status: subscription.status,
        },
      });
    }

    // For one-time payments
    if (session.mode === "payment") {
      // Handle one-time payment failure
      await handleOneTimePaymentFailure(session);
    }

    // Send failure notification to customer
    if (session.customer_details?.email) {
      // In production, you would send an email notification here
      console.log(
        `Payment failure notification would be sent to ${session.customer_details.email}`
      );
    }
  } catch (error: any) {
    logStripeEvent(
      "async_payment_failure_handling_failed",
      {
        sessionId: session.id,
        error: error.message,
      },
      "error"
    );
    throw error; // Re-throw to be caught by the main error handler
  }
}

// Helper function to update subscription after successful payment
async function updateSubscriptionAfterSuccessfulPayment(
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;

  // Find subscription in database
  const existingSubscription = await prisma.subscription.findFirst({
    where: { stripeCustomerId: customerId },
  });

  if (!existingSubscription) {
    logStripeEvent(
      "subscription_update_failed",
      {
        customerId,
        subscriptionId: subscription.id,
        reason: "No subscription record found",
      },
      "error"
    );
    return;
  }

  // Update subscription with new payment status
  await executeStripeOperation(
    () =>
      prisma.subscription.update({
        where: { id: existingSubscription.id },
        data: {
          status: subscription.status,
          stripeCurrentPeriodStart: new Date(
            subscription.current_period_start * 1000
          ),
          stripeCurrentPeriodEnd: new Date(
            subscription.current_period_end * 1000
          ),
        },
      }),
    "update_subscription_after_payment_success"
  );
}

// Helper function for one-time payment success
async function handleOneTimePaymentSuccess(session: Stripe.Checkout.Session) {
  // Extract customer and user information
  const customerId = session.customer as string;
  const userId = session.metadata?.userId;

  if (!userId) {
    logStripeEvent(
      "one_time_payment_success_no_user",
      {
        sessionId: session.id,
        customerId,
      },
      "warn"
    );
    return;
  }

  // Log payment success instead of creating a transaction record
  logStripeEvent("payment_success", {
    userId,
    customerId,
    sessionId: session.id,
    paymentIntentId: session.payment_intent,
    amount: session.amount_total,
    currency: session.currency,
    metadata: session.metadata,
  });

  // Handle product fulfillment based on metadata
  if (session.metadata?.productType) {
    // Implement product-specific fulfillment logic here
    console.log(
      `Fulfilling ${session.metadata.productType} for user ${userId}`
    );
  }
}

// Helper function for one-time payment failure
async function handleOneTimePaymentFailure(session: Stripe.Checkout.Session) {
  // Extract customer and user information
  const customerId = session.customer as string;
  const userId = session.metadata?.userId;

  if (!userId) {
    logStripeEvent(
      "one_time_payment_failure_no_user",
      {
        sessionId: session.id,
        customerId,
      },
      "warn"
    );
    return;
  }

  // Log payment failure instead of creating a transaction record
  logStripeEvent(
    "payment_failure",
    {
      userId,
      customerId,
      sessionId: session.id,
      paymentIntentId: session.payment_intent,
      amount: session.amount_total,
      currency: session.currency,
      metadata: session.metadata,
      error: "Asynchronous payment failed",
    },
    "error"
  );
}
