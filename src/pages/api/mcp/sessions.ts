import { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "src/lib/api/auth";

interface McpSession {
  id: string;
  serverName: string;
  status: 'connected' | 'disconnected' | 'error';
  connectedAt: string;
  lastActivity: string;
  messageCount: number;
  capabilities: string[];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);

  if (!userId) {
    return; // requireAuth already sent the response
  }

  if (req.method === 'GET') {
    try {
      // Mock MCP sessions - in production, get from actual MCP connection manager
      const mcpSessions: McpSession[] = [
        {
          id: 'mcp-filesystem',
          serverName: 'filesystem',
          status: 'connected',
          connectedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          lastActivity: new Date().toISOString(),
          messageCount: 42,
          capabilities: ['read', 'write', 'list', 'search']
        },
        {
          id: 'mcp-puppeteer',
          serverName: 'puppeteer',
          status: 'connected',
          connectedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          lastActivity: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          messageCount: 18,
          capabilities: ['navigate', 'screenshot', 'click', 'fill']
        },
        {
          id: 'mcp-memory',
          serverName: 'memory',
          status: 'connected',
          connectedAt: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
          lastActivity: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          messageCount: 95,
          capabilities: ['create_entities', 'search_nodes', 'add_observations']
        }
      ];

      return res.status(200).json({ sessions: mcpSessions });
    } catch (error) {
      console.error('Error fetching MCP sessions:', error);
      return res.status(500).json({ error: 'Failed to fetch MCP sessions' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
} 