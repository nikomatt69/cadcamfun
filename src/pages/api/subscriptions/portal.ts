import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import stripe from 'src/lib/stripe';
import { requireAuth } from 'src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  // Only handle POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  
  try {
    const { returnUrl } = req.body;
    
    if (!returnUrl) {
      return res.status(400).json({ message: 'Return URL is required' });
    }
    
    // Get user's subscription
    const subscription = await prisma.subscription.findUnique({
      where: { userId }
    });
    
    if (!subscription || !subscription.stripeCustomerId) {
      return res.status(404).json({ message: 'No subscription found' });
    }
    
    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: returnUrl
    });
    
    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Failed to create billing portal session:', error);
    return res.status(500).json({ message: 'Failed to create billing portal session' });
  }
}