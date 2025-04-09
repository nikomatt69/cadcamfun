// src/pages/api/analytics/chart.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { prisma } from '@/src/lib/prisma';
import { requireAuth } from '@/src/lib/api/auth';
import { Prisma } from '@prisma/client';

interface ActivityLogData {
  date: Date;
  count: bigint;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Check authentication
    const userId = await requireAuth(req, res);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Check if user is an admin
    const adminEmails = ['nicola.mattioli.95@gmail.com', 'nicom.19@icloud.com'];
    const isAdmin = adminEmails.includes(userId);

    if (req.method !== 'GET') {
      return res.status(405).json({ message: 'Method not allowed' });
    }

    // Parse query parameters with type safety
    const { 
      startDate, 
      endDate, 
      itemType, 
      action, 
      groupBy = 'day',
      userFilter 
    } = req.query;

    // Validate groupBy parameter
    if (groupBy && !['day', 'week', 'month'].includes(groupBy as string)) {
      return res.status(400).json({ message: 'Invalid groupBy parameter' });
    }

    // Parse and validate dates
    const startDateTime = startDate 
      ? new Date(startDate as string) 
      : new Date(new Date().setDate(new Date().getDate() - 30));
    
    const endDateTime = endDate 
      ? new Date(endDate as string) 
      : new Date();

    // Validate dates
    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' });
    }

    // Prepare SQL parameters safely
    const params: (Date | string[] | string)[] = [startDateTime, endDateTime];
    let sql = `
      SELECT 
        ${groupBy === 'week' 
          ? 'DATE_TRUNC(\'week\', timestamp)'
          : groupBy === 'month'
            ? 'DATE_TRUNC(\'month\', timestamp)'
            : 'DATE(timestamp)'
        } as date,
        COUNT(*) as count
      FROM "ActivityLog"
      WHERE timestamp >= $1 AND timestamp <= $2
    `;

    // Add user filter
    if (!isAdmin) {
      params.push(userId);
      sql += ` AND "userId" = $${params.length}`;
    } else if (userFilter) {
      params.push(userFilter as string);
      sql += ` AND "userId" = $${params.length}`;
    }

    // Add itemType filter with type safety
    const itemTypes = itemType 
      ? (Array.isArray(itemType) ? itemType : [itemType]) as string[]
      : undefined;

    if (itemTypes?.length) {
      params.push(itemTypes);
      sql += ` AND "itemType" = ANY($${params.length}::text[])`;
    }

    // Add action filter with type safety
    const actions = action
      ? (Array.isArray(action) ? action : [action]) as string[]
      : undefined;

    if (actions?.length) {
      params.push(actions);
      sql += ` AND "action" = ANY($${params.length}::text[])`;
    }

    // Add group by and order by
    sql += ` GROUP BY date ORDER BY date ASC`;

    // Execute the query with proper parameter binding
    const activityData = await prisma.$queryRawUnsafe<ActivityLogData[]>(sql, ...params);

    // Format the response data with type safety
    const formattedData = activityData.map((item) => ({
      date: item.date.toISOString().split('T')[0],
      count: Number(item.count)
    }));

    return res.status(200).json(formattedData);
  } catch (error) {
    console.error('Failed to get activity chart data:', error);
    
    // Send appropriate error response
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return res.status(400).json({ 
        message: 'Database query error', 
        code: error.code 
      });
    }
    
    return res.status(500).json({ 
      message: 'Internal server error while fetching activity data'
    });
  }
}