// src/pages/api/subscription/info.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { withApiAuth } from '@/src/middlewares/withApiAuth';
import { prisma } from '@/src/lib/prisma';

async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const userId = req.query.userId as string;

    // Basic validation
    if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
    }

    // Ensure the requesting user is the one asking for info (or an admin)
    // Note: withApiAuth already attaches the authenticated user to `req.user`
    const authenticatedUser = (req as any).user;
    if (authenticatedUser.id !== userId /* && !authenticatedUser.isAdmin */) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    try {
        const subscription = await prisma.subscription.findUnique({
            where: { id: userId },
        });

        if (!subscription) {
            return res.status(404).json({ error: 'Subscription not found' });
        }

        // Return a subset of data to the client
        res.status(200).json({
            id: subscription.id,
            plan: subscription.plan,
            status: subscription.status,
            currentPeriodEnd: subscription.stripeCurrentPeriodEnd?.toISOString() || null,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            stripeCustomerId: subscription.stripeCustomerId,
            stripeSubscriptionId: subscription.stripeSubscriptionId,
        });
    } catch (error) {
        console.error('Error fetching subscription info:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}

export default withApiAuth(handler); 