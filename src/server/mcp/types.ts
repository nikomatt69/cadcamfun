/**
 * Type definitions for the Model Context Protocol
 */

// Raw context from application to MCP server
export interface RawApplicationContext {
  // Session information
  sessionId: string;
  userId?: string;

  // Application state
  mode: "cad" | "cam" | "gcode" | "toolpath" | "analysis";
  activeView: "2d" | "3d" | "split" | "code";

  // Selection state
  selectedElements: {
    id: string;
    type: string;
    properties?: Record<string, any>;
  }[];

  // Tool state
  activeTool?: {
    name: string;
    parameters?: Record<string, any>;
  };

  // Project state
  currentProject?: {
    name: string;
    path?: string;
    fileType?: string;
  };

  // View state
  viewState?: {
    cameraPosition?: [number, number, number];
    target?: [number, number, number];
    zoom?: number;
  };

  // Recent operations (limited history)
  recentOperations?: {
    type: string;
    timestamp: number;
    parameters?: Record<string, any>;
  }[];

  // Optional session history (added by the server)
  sessionHistory?: SessionHistoryItem[];
}

// Processed context from MCP server to AI
export interface EnrichedContext {
  // Human-readable summary of the context
  summary: string;

  // Detailed information about selected elements
  selectedElements: {
    id: string;
    type: string;
    name?: string;
    description?: string;
    dimensions?: {
      width?: number;
      height?: number;
      depth?: number;
      radius?: number;
      // Other dimensions as needed
    };
    position?: {
      x: number;
      y: number;
      z: number;
    };
    material?: string;
    // Other properties specific to element types
  }[];

  // Available actions based on the current context
  availableActions: AvailableAction[];

  // Relevant application constraints
  constraints: {
    type: string;
    description: string;
    value: any;
  }[];

  // User preferences and settings relevant to the current context
  preferences?: Record<string, any>;

  // Workspace statistics
  statistics?: {
    elementCount: number;
    complexityScore?: number;
    // Other relevant metrics
  };
}

// Action definition
export interface AvailableAction {
  name: string;
  description: string;
  parameters: ActionParameter[];
  contextualHints?: string[];
  applicableElementTypes?: string[];
}

export interface ActionParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
  defaultValue?: any;
  enum?: string[];
  min?: number;
  max?: number;
  pattern?: string;
}

// Action request from AI to MCP server
export interface ActionRequest {
  sessionId: string;
  action: string;
  parameters: Record<string, any>;
}

// Action response from MCP server to AI
export interface ActionResponse {
  success: boolean;
  result?: any;
  error?: string;
}

// Session history item
export interface SessionHistoryItem {
  type: "context_update" | "action_execution" | "user_operation";
  timestamp: number;
  data: any;
}

// Session interface
export interface Session {
  getId(): string;
  getContext(): EnrichedContext | null;
  updateContext(context: EnrichedContext): void;
  getHistory(): SessionHistoryItem[];
  recordAction(action: string, parameters: any, result: any): void;
}
