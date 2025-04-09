// src/pages/api/analytics/track.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { logActivity, ActivityItemType, ActivityAction } from '@/src/lib/activityTracking';
import { requireAuth } from '@/src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;


  
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  
  
  
  
 
  try {
    const { itemId, itemType, action, details } = req.body;
    
    // Validate required fields
    if (!itemId || !itemType || !action) {
      return res.status(400).json({ message: 'Missing required fields: itemId, itemType, and action are required' });
    }
    
    // Validate itemType
    const validItemTypes: ActivityItemType[] = [
      'project',
      'drawing',
      'component',
      'material',
      'tool',
      'toolpath',
      'organization',
      'machine',
      'login',
      'export',
      'import',
      'page_view'
    ];
    
    if (!validItemTypes.includes(itemType as ActivityItemType)) {
      return res.status(400).json({ message: `Invalid itemType. Must be one of: ${validItemTypes.join(', ')}` });
    }
    
    // Validate action
    const validActions: ActivityAction[] = [
      'created',
      'updated',
      'deleted',
      'viewed',
      'exported',
      'imported',
      'shared',
      'login',
      'logout',
      'generate_gcode',
      'analyze_gcode',
      'run_simulation'
    ];
    
    if (!validActions.includes(action as ActivityAction)) {
      return res.status(400).json({ message: `Invalid action. Must be one of: ${validActions.join(', ')}` });
    }
    
    // Log the activity
    await logActivity(
      userId,
      itemId,
      itemType as ActivityItemType,
      action as ActivityAction,
      details
    );
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Failed to track activity:', error);
    return res.status(500).json({ message: 'Failed to track activity' });
  }
}