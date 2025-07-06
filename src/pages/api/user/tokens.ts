import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/src/lib/api/auth';
import { prisma } from '@/src/lib/prisma';

interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  permissions: string[];
  createdAt: string;
  lastUsed?: string;
  expiresAt?: string;
  isActive: boolean;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) {
    return; // requireAuth already sent the response
  }

  if (req.method === 'GET') {
    try {
      // Mock API tokens - in production, get from database
      const apiTokens: ApiToken[] = [
        {
          id: 'token-1',
          name: 'Development Token',
          prefix: 'cad_dev_abc123',
          permissions: ['read:projects', 'write:drawings', 'read:toolpaths'],
          createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          lastUsed: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          isActive: true
        },
        {
          id: 'token-2',
          name: 'Mobile App Token',
          prefix: 'cad_mobile_xyz789',
          permissions: ['read:projects', 'write:toolpaths'],
          createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
          lastUsed: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          isActive: true
        },
        {
          id: 'token-3',
          name: 'Analytics Integration',
          prefix: 'cad_analytics_def456',
          permissions: ['read:analytics', 'read:usage'],
          createdAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
          expiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // Expired
          isActive: false
        }
      ];

      return res.status(200).json({ tokens: apiTokens });
    } catch (error) {
      console.error('Error fetching API tokens:', error);
      return res.status(500).json({ error: 'Failed to fetch API tokens' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { name, permissions, expiresIn } = req.body;

      if (!name || !permissions || !Array.isArray(permissions)) {
        return res.status(400).json({ error: 'Name and permissions are required' });
      }

      // Generate token
      const tokenId = `token_${Date.now()}`;
      const tokenPrefix = `cad_${name.toLowerCase().replace(/\s+/g, '_')}_${Math.random().toString(36).substring(2, 8)}`;
      
      const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000) : null;

      const newToken: ApiToken = {
        id: tokenId,
        name,
        prefix: tokenPrefix,
        permissions,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt?.toISOString(),
        isActive: true
      };

      // In production, save to database
      // await prisma.apiToken.create({ data: newToken });

      return res.status(201).json({ 
        token: newToken,
        fullToken: `${tokenPrefix}_${Math.random().toString(36).substring(2, 20)}` // Only show once
      });
    } catch (error) {
      console.error('Error creating API token:', error);
      return res.status(500).json({ error: 'Failed to create API token' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
} 