import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { prisma } from 'src/lib/prisma';
import { sendErrorResponse, sendSuccessResponse, handleApiError } from 'src/lib/api/helpers';
import { requireAuth } from '@/src/lib/api/auth';



export async function handleComponentLibrary(req: NextApiRequest, res: NextApiResponse) {
    try {
      // Ensure user is authenticated
      const userId = await requireAuth(req, res);
  if (!userId) return;
  
  const { id } = req.query;
  
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ message: 'Drawing ID is required' });
  }
  
      
      // Only support GET for library access
      if (req.method !== 'GET') {
        return sendErrorResponse(res, 'Method not allowed', 405);
      }
      
      // Import CAD components library
      const cadComponentsLibrary = require('src/lib/cadComponentsLibrary.json');
      
      // Extract query parameters
      const { type, category, search } = req.query;
      
      // Filter components if needed
      let components = cadComponentsLibrary;
      
      if (type) {
        components = components.filter((comp: any) => 
          comp.type === type
        );
      }
      
      if (category) {
        components = components.filter((comp: any) => 
          comp.category === category
        );
      }
      
      if (search && typeof search === 'string') {
        const searchTerm = search.toLowerCase();
        components = components.filter((comp: any) => 
          comp.name.toLowerCase().includes(searchTerm) ||
          comp.description.toLowerCase().includes(searchTerm) ||
          comp.tags.some((tag: string) => tag.toLowerCase().includes(searchTerm))
        );
      }
      
      return sendSuccessResponse(res, components);
    } catch (error) {
      return handleApiError(error, res);
    }
  }
  export default handleComponentLibrary;