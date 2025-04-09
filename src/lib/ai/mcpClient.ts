import { Element } from '@/src/store/elementsStore';

export interface MCPSettings {
  mcpEndpoint: string;
  mcpApiKey?: string;
  mcpStrategy: 'aggressive' | 'balanced' | 'conservative';
  mcpCacheLifetime: number;
}

export interface MCPTestResult {
  success: boolean;
  message: string;
}

/**
 * Client per comunicare con l'API Model Context Protocol
 */
export class MCPClient {
  private endpoint: string;
  private apiKey?: string;
  private strategy: string;
  private cacheLifetime: number;

  constructor(settings: MCPSettings) {
    this.endpoint = settings.mcpEndpoint || '/api/mcp-protocol';
    this.apiKey = settings.mcpApiKey;
    this.strategy = settings.mcpStrategy || 'balanced';
    this.cacheLifetime = settings.mcpCacheLifetime || 86400000; // 24 ore di default
  }

  /**
   * Testa la connessione con l'endpoint MCP
   */
  async testConnection(): Promise<MCPTestResult> {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {})
        },
        body: JSON.stringify({
          type: 'schema'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          message: `Errore di connessione: ${response.status} - ${errorText}`
        };
      }

      const data = await response.json();
      
      if (data.protocol && data.resources && data.tools) {
        return {
          success: true,
          message: `Connessione riuscita. Protocollo: ${data.protocol}, ${data.resources.length} risorse, ${data.tools.length} strumenti disponibili.`
        };
      } else {
        return {
          success: false,
          message: 'Risposta ricevuta ma il formato non è valido.'
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Errore durante il test della connessione: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Recupera informazioni su una risorsa specifica
   */
  async getResource(resourceName: string): Promise<any> {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {})
        },
        body: JSON.stringify({
          type: 'resource',
          resource: resourceName,
          strategy: this.strategy
        })
      });

      if (!response.ok) {
        throw new Error(`Errore HTTP: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Errore durante il recupero della risorsa ${resourceName}:`, error);
      throw error;
    }
  }

  /**
   * Esegue uno strumento specifico
   */
  async executeTool(toolName: string, parameters: Record<string, any>): Promise<any> {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {})
        },
        body: JSON.stringify({
          type: 'tool',
          tool: toolName,
          parameters,
          strategy: this.strategy
        })
      });

      if (!response.ok) {
        throw new Error(`Errore HTTP: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Errore durante l'esecuzione dello strumento ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * Crea un nuovo elemento CAD
   */
  async createCADElement(
    type: string,
    name: string,
    properties: Record<string, any>,
    material?: string,
    color?: string
  ): Promise<any> {
    return this.executeTool('create-cad-element', {
      type,
      name,
      properties,
      material,
      color
    });
  }

  /**
   * Analizza il design corrente
   */
  async analyzeDesign(
    analysisType: 'structural' | 'manufacturability' | 'cost' | 'performance' | 'comprehensive',
    specificConcerns?: string[]
  ): Promise<any> {
    return this.executeTool('analyze-design', {
      analysisType,
      specificConcerns
    });
  }

  /**
   * Genera un componente basato su una descrizione testuale
   */
  async generateComponent(
    description: string,
    constraints?: {
      maxElements?: number;
      dimensions?: Record<string, any>;
      material?: string;
    }
  ): Promise<any> {
    return this.executeTool('generate-component', {
      description,
      constraints
    });
  }
} 