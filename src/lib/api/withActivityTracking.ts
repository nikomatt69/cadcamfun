// src/lib/api/withActivityTracking.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { ActivityItemType, ActivityAction, logActivity } from '@/src/lib/activityTracking';

type ApiHandler = (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

interface TrackingOptions {
  itemIdExtractor?: (req: NextApiRequest) => string;
  itemType: ActivityItemType;
  actions: {
    GET?: ActivityAction;
    POST?: ActivityAction;
    PUT?: ActivityAction;
    DELETE?: ActivityAction;
    PATCH?: ActivityAction;
  };
  detailsExtractor?: (req: NextApiRequest) => any;
}

/**
 * Higher-order function to wrap API handlers with activity tracking
 * 
 * @param handler The API handler function
 * @param options Configuration for activity tracking
 * @returns Wrapped handler with activity tracking
 */
export function withActivityTracking(handler: ApiHandler, options: TrackingOptions): ApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // Create a custom response object to intercept the status code
    const customRes = Object.create(res);
    let statusCode: number = 200; // Initialize with default status code
    
    // Override the status method
    customRes.status = (code: number) => {
      statusCode = code;
      return res.status(code);
    };
    
    // Get user session
    const session = await getSession({ req });
    const userId = session?.user?.id;
    
    try {
      // Execute the original handler
      await handler(req, customRes);
      // Set default status code to 200 if not set
      if (!statusCode) {
        statusCode = 200;
      }
      
      // Only track successful requests (status 2xx)
      if (userId && statusCode >= 200 && statusCode < 300) {
        const method = req.method || 'GET';
        const action = options.actions[method as keyof typeof options.actions];
        
        if (action) {
          // Extract item ID either from request body, query, or path
          let itemId = '';
          
          if (options.itemIdExtractor) {
            itemId = options.itemIdExtractor(req);
          } else {
            // Default extractors based on request method
            const { id } = req.query;
            
            if (id) {
              itemId = Array.isArray(id) ? id[0] : id;
            } else if (method === 'POST' && req.body?.id) {
              itemId = req.body.id;
            }
          }
          
          // Extract details if configured
          let details;
          if (options.detailsExtractor) {
            details = options.detailsExtractor(req);
          } else {
            // Default details based on request method
            if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
              details = req.body ? { ...req.body } : undefined;
              
              // Remove sensitive fields if present
              if (details) {
                delete details.password;
                delete details.token;
                delete details.accessToken;
                delete details.refreshToken;
              }
            } else if (method === 'GET' || method === 'DELETE') {
              details = req.query ? { ...req.query } : undefined;
            }
          }
          
          // Log the activity
          await logActivity(
            userId,
            itemId,
            options.itemType,
            action,
            details
          );
        }
      }
    } catch (error) {
      // If there was an error, don't prevent the original error from propagating
      console.error('Error in activity tracking:', error);
    }
  };
}

/**
 * Example usage:
 * 
 * export default withActivityTracking(
 *   async function handler(req, res) {
 *     // Your API logic here
 *   },
 *   {
 *     itemType: 'project',
 *     actions: {
 *       GET: 'viewed',
 *       POST: 'created',
 *       PUT: 'updated',
 *       DELETE: 'deleted'
 *     },
 *     itemIdExtractor: (req) => req.query.id as string
 *   }
 * );
 */
