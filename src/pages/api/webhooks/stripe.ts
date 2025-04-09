import { NextApiRequest, NextApiResponse } from 'next';
import { buffer } from 'micro';
import Stripe from 'stripe';
import stripe, { getPlanByPriceId } from 'src/lib/stripe';
import { prisma } from 'src/lib/prisma';

// Disable the default body parser
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  
  const signature = req.headers['stripe-signature'];
  
  if (!signature) {
    return res.status(400).json({ message: 'Missing stripe-signature header' });
  }
  
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    return res.status(500).json({ message: 'Missing STRIPE_WEBHOOK_SECRET' });
  }
  
  let event: Stripe.Event;
  
  try {
    const buf = await buffer(req);
    const payload = buf.toString();
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error: any) {
    console.error(`Webhook Error: ${error.message}`);
    return res.status(400).json({ message: `Webhook Error: ${error.message}` });
  }
  
  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(session);
        break;
      }
      
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentSucceeded(invoice);
        break;
      }
      
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }
    }
    
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error handling webhook event:', error);
    return res.status(500).json({ message: 'Error handling webhook event' });
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  // Get the customer and subscription IDs
  const { customer, subscription } = session;
  
  if (!customer || !subscription || typeof customer !== 'string' || typeof subscription !== 'string') {
    console.error('Missing customer or subscription ID');
    return;
  }
  
  const userId = session.metadata?.userId;
  
  if (!userId) {
    console.error('Missing userId in session metadata');
    return;
  }
  
  // Get subscription details from Stripe
  const subscriptionData = await stripe.subscriptions.retrieve(subscription);
  const priceId = subscriptionData.items.data[0].price.id;
  const planName = getPlanByPriceId(priceId) || 'basic';
  
  // Update user's subscription in the database
  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      stripeCustomerId: customer,
      stripeSubscriptionId: subscription,
      stripePriceId: priceId,
      stripeCurrentPeriodEnd: new Date(subscriptionData.current_period_end * 1000),
      plan: planName,
      status: subscriptionData.status
    },
    update: {
      stripeSubscriptionId: subscription,
      stripePriceId: priceId,
      stripeCurrentPeriodEnd: new Date(subscriptionData.current_period_end * 1000),
      plan: planName,
      status: subscriptionData.status
    }
  });
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  if (!invoice.subscription || typeof invoice.subscription !== 'string' || !invoice.customer || typeof invoice.customer !== 'string') {
    console.error('Missing subscription or customer ID');
    return;
  }
  
  // Get subscription details from Stripe
  const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
  
  // Find the subscription in our database
  const userSubscription = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: invoice.subscription }
  });
  
  if (!userSubscription) {
    console.error('Subscription not found in database');
    return;
  }
  
  // Update the subscription period end date
  await prisma.subscription.update({
    where: { id: userSubscription.id },
    data: {
      stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
      status: subscription.status
    }
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  // Find the subscription in our database
  const userSubscription = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: subscription.id }
  });
  
  if (!userSubscription) {
    console.error('Subscription not found in database');
    return;
  }
  
  const priceId = subscription.items.data[0].price.id;
  const planName = getPlanByPriceId(priceId) || 'basic';
  
  // Update the subscription details
  await prisma.subscription.update({
    where: { id: userSubscription.id },
    data: {
      stripePriceId: priceId,
      plan: planName,
      status: subscription.status,
      stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000)
    }
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  // Find the subscription in our database
  const userSubscription = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: subscription.id }
  });
  
  if (!userSubscription) {
    console.error('Subscription not found in database');
    return;
  }
  
  // Update the subscription status
  await prisma.subscription.update({
    where: { id: userSubscription.id },
    data: {
      status: 'canceled',
      plan: 'free',
      stripeSubscriptionId: null,
      stripePriceId: null
    }
  });
}