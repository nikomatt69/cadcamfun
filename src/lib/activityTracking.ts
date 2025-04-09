// src/lib/activityTracking.ts
import { prisma } from './prisma';

export type ActivityItemType = 
  | 'project'
  | 'drawing'
  | 'component'
  | 'material'
  | 'tool'
  | 'toolpath'
  | 'organization'
  | 'machine'
  | 'login'
  | 'export'
  | 'import'
  | 'page_view';

export type ActivityAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'viewed'
  | 'exported'
  | 'imported'
  | 'shared'
  | 'login'
  | 'logout'
  | 'generate_gcode'
  | 'analyze_gcode'
  | 'run_simulation';

// Function to log user activity
export async function logActivity(
  userId: string,
  itemId: string,
  itemType: ActivityItemType,
  action: ActivityAction,
  details?: any
) {
  try {
    const activityLog = await prisma.activityLog.create({
      data: {
        userId,
        itemId,
        itemType,
        action,
        details: details || {},
        timestamp: new Date()
      }
    });
    
    return activityLog;
  } catch (error) {
    console.error('Failed to log activity:', error);
    // Don't throw - we don't want activity logging to break application flow
    return null;
  }
}

// Function to log page views
export async function logPageView(
  userId: string,
  path: string,
  query?: Record<string, string>
) {
  return logActivity(
    userId,
    path, // Use path as itemId for page views
    'page_view',
    'viewed',
    { path, query }
  );
}

// Get user activity history
export async function getUserActivityHistory(
  userId: string,
  limit: number = 50,
  offset: number = 0,
  filters?: {
    itemType?: ActivityItemType[];
    action?: ActivityAction[];
    startDate?: Date;
    endDate?: Date;
  }
) {
  const where: any = { userId };
  
  // Apply filters if provided
  if (filters) {
    if (filters.itemType?.length) {
      where.itemType = { in: filters.itemType };
    }
    
    if (filters.action?.length) {
      where.action = { in: filters.action };
    }
    
    if (filters.startDate || filters.endDate) {
      where.timestamp = {};
      
      if (filters.startDate) {
        where.timestamp.gte = filters.startDate;
      }
      
      if (filters.endDate) {
        where.timestamp.lte = filters.endDate;
      }
    }
  }
  
  // Get activity logs
  const activityLogs = await prisma.activityLog.findMany({
    where,
    orderBy: {
      timestamp: 'desc'
    },
    skip: offset,
    take: limit,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true
        }
      }
    }
  });
  
  // Get total count for pagination
  const totalCount = await prisma.activityLog.count({ where });
  
  return {
    logs: activityLogs,
    total: totalCount
  };
}

// Get aggregated activity statistics
export async function getActivityStatistics(
  filters?: {
    userId?: string;
    itemType?: ActivityItemType[];
    action?: ActivityAction[];
    startDate?: Date;
    endDate?: Date;
    groupBy?: 'day' | 'week' | 'month';
  }
) {
  const where: any = {};
  
  // Apply filters
  if (filters) {
    if (filters.userId) {
      where.userId = filters.userId;
    }
    
    if (filters.itemType?.length) {
      where.itemType = { in: filters.itemType };
    }
    
    if (filters.action?.length) {
      where.action = { in: filters.action };
    }
    
    if (filters.startDate || filters.endDate) {
      where.timestamp = {};
      
      if (filters.startDate) {
        where.timestamp.gte = filters.startDate;
      }
      
      if (filters.endDate) {
        where.timestamp.lte = filters.endDate;
      }
    }
  }
  
  // Get activity count by type
  const countByType = await prisma.activityLog.groupBy({
    by: ['itemType'],
    _count: true,
    where
  });
  
  // Get activity count by action
  const countByAction = await prisma.activityLog.groupBy({
    by: ['action'],
    _count: true,
    where
  });
  
  // For time-based statistics, we'll need to use raw SQL or 
  // more complex aggregation logic depending on the database
  
  return {
    countByType,
    countByAction,
    // Add more aggregated statistics as needed
  };
}