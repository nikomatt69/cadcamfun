import { NextApiRequest, NextApiResponse } from 'next';

// Resource types
export interface ResourceResolver<T = any> {
  (): Promise<{
    content: T;
    metadata?: Record<string, any>;
  }>;
}

export interface Resource {
  name: string;
  description: string;
  resolver: ResourceResolver;
}

// Tool types
export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
  items?: {
    type: string;
  };
  properties?: Record<string, any>;
}

export interface ToolHandler {
  (params: any): Promise<any>;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  handler: ToolHandler;
}

// Server config
export interface ServerConfig {
  resources: Resource[];
  tools: Tool[];
}

// Server interface
export interface Server {
  handleRequest(req: NextApiRequest, res: NextApiResponse): Promise<void>;
} 