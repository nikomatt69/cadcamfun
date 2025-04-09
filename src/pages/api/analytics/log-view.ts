// src/pages/api/analytics/log-view.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { getToken } from 'next-auth/jwt';
import { logPageView } from '@/src/lib/activityTracking';
import { getSession } from 'next-auth/react';
import { requireAuth } from '@/src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession({ req });
  if (!session || !session.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  
  
  try {
    // Verify authentication
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token || !token.sub) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const { userId, path, query } = req.body;
    
    // Ensure the user ID matches the token subject
    if (userId !== token.sub) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    // Log the page view
    await logPageView(userId, path, query);
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Failed to log page view:', error);
    return res.status(500).json({ message: 'Failed to log page view' });
  }
}