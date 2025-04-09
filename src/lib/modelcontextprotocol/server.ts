import { NextApiRequest, NextApiResponse } from 'next';
import { ServerConfig, Server, Resource, Tool } from './types';

// Store sessioni attive
const activeSessions: Record<string, { createdAt: Date, lastAccess: Date }> = {};

// Pulizia delle sessioni inattive ogni 10 minuti
const SESSION_CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minuti
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minuti

// Avvia timer di pulizia
if (typeof window === 'undefined') { // Esegui solo lato server
  setInterval(() => {
    const now = new Date();
    Object.keys(activeSessions).forEach(sessionId => {
      const session = activeSessions[sessionId];
      if (now.getTime() - session.lastAccess.getTime() > SESSION_TIMEOUT) {
        console.log(`Cleaning up inactive session: ${sessionId}`);
        delete activeSessions[sessionId];
      }
    });
  }, SESSION_CLEANUP_INTERVAL);
}

export class MCPServer implements Server {
  private resources: Resource[];
  private tools: Tool[];

  constructor(config: ServerConfig) {
    this.resources = config.resources || [];
    this.tools = config.tools || [];
  }

  async handleRequest(req: NextApiRequest, res: NextApiResponse): Promise<void> {
    try {
      // Check if it's a valid MCP request
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      const body = req.body;
      
      // Handle session creation
      if (body.type === 'create-session') {
        return this.handleCreateSession(body.sessionId, res);
      }
      
      // Check session validity for all other requests
      if (body.sessionId && body.type !== 'create-session') {
        if (!this.validateSession(body.sessionId)) {
          return res.status(401).json({ error: 'Invalid or expired session' });
        }
      }
      
      // Handle session closure
      if (body.type === 'close') {
        return this.handleCloseSession(body.sessionId, res);
      }
      
      // Handle resource requests
      if (body.type === 'resource') {
        return await this.handleResourceRequest(body, res);
      }
      
      // Handle tool calls
      if (body.type === 'tool') {
        return await this.handleToolCall(body, res);
      }

      // Handle initial schema request
      if (body.type === 'schema') {
        return this.respondWithSchema(res);
      }

      // Default response for unrecognized requests
      return res.status(400).json({ error: 'Invalid request type' });
    } catch (error) {
      console.error('MCP Server error:', error);
      return res.status(500).json({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private handleCreateSession(sessionId: string, res: NextApiResponse): void {
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    // Registra la nuova sessione
    activeSessions[sessionId] = {
      createdAt: new Date(),
      lastAccess: new Date()
    };
    
    return res.status(200).json({ 
      success: true, 
      message: 'Session created successfully',
      sessionId
    });
  }

  private handleCloseSession(sessionId: string, res: NextApiResponse): void {
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }
    
    // Elimina la sessione se esiste
    if (activeSessions[sessionId]) {
      delete activeSessions[sessionId];
    }
    
    return res.status(200).json({ 
      success: true, 
      message: 'Session closed successfully' 
    });
  }

  private validateSession(sessionId: string): boolean {
    const session = activeSessions[sessionId];
    if (!session) {
      return false;
    }
    
    // Aggiorna il timestamp di ultimo accesso
    session.lastAccess = new Date();
    return true;
  }

  private async handleResourceRequest(body: any, res: NextApiResponse): Promise<void> {
    const resourceName = body.name;
    const resource = this.resources.find(r => r.name === resourceName);
    
    if (!resource) {
      return res.status(404).json({ error: `Resource "${resourceName}" not found` });
    }

    try {
      const result = await resource.resolver();
      return res.status(200).json(result);
    } catch (error) {
      console.error(`Error resolving resource "${resourceName}":`, error);
      return res.status(500).json({ 
        error: 'Resource resolver error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleToolCall(body: any, res: NextApiResponse): Promise<void> {
    const toolName = body.name;
    const params = body.params || {};
    
    const tool = this.tools.find(t => t.name === toolName);
    
    if (!tool) {
      return res.status(404).json({ error: `Tool "${toolName}" not found` });
    }

    try {
      const result = await tool.handler(params);
      return res.status(200).json(result);
    } catch (error) {
      console.error(`Error executing tool "${toolName}":`, error);
      return res.status(500).json({ 
        error: 'Tool execution error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private respondWithSchema(res: NextApiResponse): void {
    // Generate schema from resources and tools
    const schema = {
      protocol: 'modelcontext-v1',
      resources: this.resources.map(r => ({
        name: r.name,
        description: r.description
      })),
      tools: this.tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }))
    };

    return res.status(200).json(schema);
  }
}