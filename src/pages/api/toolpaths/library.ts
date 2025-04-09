// src/pages/api/toolpaths/library.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { sendErrorResponse, sendSuccessResponse, handleApiError } from 'src/lib/api/helpers';
import { requireAuth } from '@/src/lib/api/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Ensure user is authenticated
    const userId = await requireAuth(req, res);
    if (!userId) return;
    
    // Only support GET for library access
    if (req.method !== 'GET') {
      return sendErrorResponse(res, 'Method not allowed', 405);
    }
    
    // Import toolpath library
    const toolpathsLibrary = require('src/components/library/toolpathsLibrary.json');
    
    // Extract query parameters
    const { type, operationType, category, search, projectId } = req.query;
    
    if (!projectId) {
      return sendErrorResponse(res, 'Project ID is required', 400);
    }
    
    // Ensure toolpathsLibrary is an array
    let toolpaths = Array.isArray(toolpathsLibrary) ? toolpathsLibrary : [];
    
    // Add projectId to each toolpath
    toolpaths = toolpaths.map(tp => ({
      ...tp,
      projectId: projectId as string
    }));
    
    if (type) {
      toolpaths = toolpaths.filter((tp: any) => 
        tp.type === type
      );
    }
    
    if (operationType) {
      toolpaths = toolpaths.filter((tp: any) => 
        tp.operationType === operationType
      );
    }
    
    if (category) {
      toolpaths = toolpaths.filter((tp: any) => 
        tp.category === category
      );
    }
    
    if (search && typeof search === 'string') {
      const searchTerm = search.toLowerCase();
      toolpaths = toolpaths.filter((tp: any) => 
        tp.name.toLowerCase().includes(searchTerm) ||
        tp.description.toLowerCase().includes(searchTerm) ||
        tp.tags.some((tag: string) => tag.toLowerCase().includes(searchTerm))
      );
    }
    
    return sendSuccessResponse(res, toolpaths);
  } catch (error) {
    return handleApiError(error, res);
  }
}