import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { prisma } from 'src/lib/prisma';
import stripe, { SUBSCRIPTION_PLANS } from 'src/lib/stripe';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  // GET - Get current subscription
  if (req.method === 'GET') {
    try {
      // Get user's subscription from the database
      const userSubscription = await prisma.subscription.findUnique({
        where: { userId }
      });
      
      if (!userSubscription) {
        // User has no subscription, return free plan details
        return res.status(200).json({
          plan: SUBSCRIPTION_PLANS.FREE,
          status: 'active',
          periodEnd: null,
          cancelAtPeriodEnd: false
        });
      }
      
      // Return subscription details
      return res.status(200).json({
        plan: userSubscription.plan,
        status: userSubscription.status,
        periodEnd: userSubscription.stripeCurrentPeriodEnd,
        cancelAtPeriodEnd: userSubscription.status === 'canceled'
      });
    } catch (error) {
      console.error('Failed to fetch subscription:', error);
      return res.status(500).json({ message: 'Failed to fetch subscription' });
    }
  }
  
  // POST - Create checkout session for subscription
  else if (req.method === 'POST') {
    try {
      const { priceId, successUrl, cancelUrl } = req.body;
      
      if (!priceId || !successUrl || !cancelUrl) {
        return res.status(400).json({ message: 'Missing required fields' });
      }
      
      // Get user data
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { subscription: true }
      });
      
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      // Check if we need to create or use existing Stripe customer
      let stripeCustomerId = user.subscription?.stripeCustomerId;
      
      if (!stripeCustomerId) {
        // Create new customer in Stripe
        const customer = await stripe.customers.create({
          email: user.email!,
          name: user.name || undefined,
          metadata: {
            userId
          }
        });
        stripeCustomerId = customer.id;
        
        // Create or update subscription record
        await prisma.subscription.upsert({
          where: { userId },
          create: {
            userId,
            stripeCustomerId,
            plan: SUBSCRIPTION_PLANS.FREE
          },
          update: {
            stripeCustomerId
          }
        });
      }
      
      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        subscription_data: {
          metadata: {
            userId
          }
        },
        metadata: {
          userId
        }
      });
      
      return res.status(200).json({ url: session.url });
    } catch (error) {
      console.error('Failed to create checkout session:', error);
      return res.status(500).json({ message: 'Failed to create checkout session' });
    }
  }
  
  // DELETE - Cancel subscription
  else if (req.method === 'DELETE') {
    try {
      // Get user's subscription
      const subscription = await prisma.subscription.findUnique({
        where: { userId }
      });
      
      if (!subscription || !subscription.stripeSubscriptionId) {
        return res.status(404).json({ message: 'No active subscription found' });
      }
      
      // Cancel subscription in Stripe
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true
      });
      
      // Update subscription status
      await prisma.subscription.update({
        where: { userId },
        data: {
          status: 'canceled'
        }
      });
      
      return res.status(200).json({ message: 'Subscription canceled successfully' });
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      return res.status(500).json({ message: 'Failed to cancel subscription' });
    }
  }
  
  else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
}