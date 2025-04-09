// src/pages/api/analytics/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { getActivityStatistics } from '@/src/lib/activityTracking';
import { prisma } from '@/src/lib/prisma';
import { requireAuth } from '@/src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Check authentication
  const session = await getSession({ req });
  if (!session || !session.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  
  const userId = await requireAuth(req, res);
  if (!userId) return;
  

  
  // Check if user is an admin (you might want to add an isAdmin field to your User model)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { 
      email: true,
      // Add any admin-specific fields you have
    }
  });
  
  // Define admin emails or use another method to check for admin status
  // This is just a placeholder - replace with your actual admin check
  const adminEmails = ['nicola.mattioli.95@gmail.com','nicom.19@icloud.com'];
  const isAdmin = adminEmails.includes(user?.email || '');
  
  if (req.method === 'GET') {
    try {
      // Parse query parameters
      const { 
        startDate, 
        endDate, 
        itemType, 
        action, 
        groupBy = 'day',
        userFilter
      } = req.query;
      
      // Parse dates
      const startDateTime = startDate ? new Date(startDate as string) : undefined;
      const endDateTime = endDate ? new Date(endDate as string) : undefined;
      
      // Build filters
      const filters: any = {
        startDate: startDateTime,
        endDate: endDateTime,
        groupBy: groupBy as 'day' | 'week' | 'month'
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
      
      // If user is not an admin, only allow viewing their own analytics
      if (!isAdmin) {
        filters.userId = userId;
      } 
      // For admins, allow filtering by user if provided
      else if (userFilter && isAdmin) {
        filters.userId = userFilter;
      }
      
      // Get activity statistics
      const statistics = await getActivityStatistics(filters);
      
      // Get user count
      const userCount = await prisma.user.count();
      
      // Get active users in the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const activeUsers = await prisma.activityLog.groupBy({
        by: ['userId'],
        _count: true,
        where: {
          timestamp: {
            gte: thirtyDaysAgo
          }
        },
        orderBy: {
          _count: {
            userId: 'desc'
          }
        },
        take: 10
      });
      
      // Get recent activity
      const recentActivity = await prisma.activityLog.findMany({
        where: isAdmin ? {} : { userId },
        orderBy: {
          timestamp: 'desc'
        },
        take: 10,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });
      
      // Return the analytics data
      return res.status(200).json({
        statistics,
        userCount,
        activeUsers,
        recentActivity,
        isAdmin
      });
    } catch (error) {
      console.error('Failed to get analytics data:', error);
      return res.status(500).json({ message: 'Failed to get analytics data' });
    }
  } else {
    return res.status(405).json({ message: 'Method not allowed' });
  }
}