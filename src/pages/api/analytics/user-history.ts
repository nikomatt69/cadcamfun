// src/pages/api/analytics/user-history.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { getUserActivityHistory } from '@/src/lib/activityTracking';
import { requireAuth } from '@/src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check authentication
 
  
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  
  
  if (req.method === 'GET') {
    try {
      // Parse query parameters
      const { 
        limit = '50', 
        offset = '0', 
        itemType, 
        action, 
        startDate, 
        endDate 
      } = req.query;
      
      // Parse dates
      const startDateTime = startDate ? new Date(startDate as string) : undefined;
      const endDateTime = endDate ? new Date(endDate as string) : undefined;
      
      // Build filters
      const filters: any = {
        startDate: startDateTime,
        endDate: endDateTime
      };
      
      // Add itemType filter if provided
      if (itemType) {
        const itemTypes = Array.isArray(itemType) ? itemType : [itemType];
        filters.itemType = itemTypes;
      }
      
      // Add action filter if provided
      if (action) {
        const actions = Array.isArray(action) ? action : [action];
        filters.action = actions;
      }
      
      // Get the user's activity history
      const activityHistory = await getUserActivityHistory(
        userId,
        parseInt(limit as string),
        parseInt(offset as string),
        filters
      );
      
      return res.status(200).json(activityHistory);
    } catch (error) {
      console.error('Failed to get user activity history:', error);
      return res.status(500).json({ message: 'Failed to get user activity history' });
    }
  } else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
}