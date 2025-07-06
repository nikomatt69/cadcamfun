// src/types/CAMTypes.ts
import { AIModelType } from "./AITypes";

// Tipi per percorsi utensile (toolpaths)
export interface ToolpathPoint {
  x: number;
  y: number;
  z: number;
  feedRate?: number;
  spindleSpeed?: number;
  toolId?: string;
  type?: ToolpathSegmentType;
}

export type ToolpathSegmentType =
  | "rapid"
  | "cutting"
  | "plunge"
  | "retract"
  | "approach"
  | "lead-in"
  | "lead-out"
  | "ramp";

export interface Toolpath {
  id: string;
  name: string;
  points: ToolpathPoint[];
  operation: MachiningOperation;
  toolId: string;
  material?: string;
  estimatedTime?: number; // in seconds
  estimatedCost?: number; // in currency units
  metadata?: Record<string, any>;
}

// Tipi per utensili
export interface Tool {
  id: string;
  name: string;
  type: ToolType;
  diameter: number; // in mm
  length?: number; // in mm
  flutes?: number;
  material?: string;
  coating?: string;
  maxFeedRate?: number; // in mm/min
  maxSpindleSpeed?: number; // in RPM
  maxCuttingDepth?: number; // in mm
  maxDocPerPass?: number; // in mm (Depth of Cut)
  maxStepover?: number; // in mm or as percentage
  price?: number; // in currency units
  lifespan?: number; // in minutes of cutting time
  recommendedMaterials?: string[];
}

export type ToolType =
  | "end_mill"
  | "ball_mill"
  | "bull_nose_mill"
  | "face_mill"
  | "chamfer_mill"
  | "v_bit"
  | "drill"
  | "tap"
  | "reamer"
  | "boring_bar"
  | "custom";

// Tipi per operazioni di lavorazione
export interface MachiningOperation {
  id: string;
  name: string;
  type: MachiningOperationType;
  toolId: string;
  materialId?: string;
  feedRate: number; // in mm/min
  spindleSpeed: number; // in RPM
  stepover?: number; // in mm or as percentage
  stepdown?: number; // in mm
  coolant?: CoolantType;
  direction?: CuttingDirection;
  tolerance?: number; // in mm
  stockToLeave?: number; // in mm
  passes?: number;
  finishAllowance?: number; // in mm
}

export type MachiningOperationType =
  | "2d_contour"
  | "2d_pocket"
  | "2d_adaptive"
  | "3d_adaptive"
  | "3d_parallel"
  | "3d_contour"
  | "3d_scallop"
  | "3d_waterline"
  | "drilling"
  | "boring"
  | "reaming"
  | "tapping"
  | "facing"
  | "chamfering"
  | "engraving"
  | "thread_milling"
  | "custom";

export type CoolantType = "none" | "flood" | "mist" | "air_blast" | "through_tool";
export type CuttingDirection = "conventional" | "climb";

// Tipi per materiali
export interface Material {
  id: string;
  name: string;
  type: MaterialType;
  hardness?: number; // HRC, HB, etc.
  density?: number; // g/cm³
  thermalConductivity?: number;
  specificHeatCapacity?: number;
  machinability?: number; // 0-100%
  recommendedToolMaterials?: string[];
  recommendedCoolant?: CoolantType[];
  price?: number; // per unit (e.g., per kg or per cubic cm)
  properties?: Record<string, any>;
}

export type MaterialType =
  | "aluminum"
  | "steel"
  | "stainless_steel"
  | "brass"
  | "copper"
  | "titanium"
  | "plastic"
  | "wood"
  | "composite"
  | "foam"
  | "custom";

// Tipi per analisi CAM
export interface ToolpathAnalysis {
  id: string;
  toolpathId: string;
  machiningTime: number; // in seconds
  rapidMoves: number;
  cuttingMoves: number;
  totalDistance: number; // in mm
  cuttingDistance: number; // in mm
  rapidDistance: number; // in mm
  minFeedRate: number;
  maxFeedRate: number;
  avgFeedRate: number;
  maxDepthPerPass: number; // in mm
  maxStepover: number; // in mm or as percentage
  issues: ToolpathIssue[];
  recommendations: ToolpathRecommendation[];
  efficiency: number; // 0-100%
  quality: number; // 0-100%
}

export interface ToolpathIssue {
  id: string;
  type: ToolpathIssueType;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  location?: {
    startIndex: number;
    endIndex: number;
  };
  suggestedFix?: string;
}

export type ToolpathIssueType =
  | "inefficient_movement"
  | "potential_collision"
  | "feed_rate_issue"
  | "spindle_speed_issue"
  | "excessive_depth"
  | "excessive_stepover"
  | "tool_engagement_issue"
  | "surface_quality_issue"
  | "rapid_through_material"
  | "unoptimized_approach"
  | "unoptimized_retract"
  | "unnecessary_air_cutting"
  | "long_tool_path"
  | "unsafe_entry"
  | "unsafe_exit"
  | "custom";

export interface ToolpathRecommendation {
  id: string;
  type:
    | "feed_rate"
    | "spindle_speed"
    | "depth_of_cut"
    | "stepover"
    | "tool"
    | "approach"
    | "retract"
    | "strategy"
    | "custom";
  description: string;
  currentValue?: string | number;
  recommendedValue?: string | number;
  estimatedImprovement?: {
    time?: number; // in seconds or percentage
    quality?: number; // 0-100%
    toolLife?: number; // in percentage
    cost?: number; // in currency units or percentage
  };
  confidence: number; // 0-1
}

// Tipi per costi
export interface CostEstimation {
  id: string;
  toolpathId: string;
  totalCost: number;
  breakdown: {
    machineCost: number; // Costo della macchina (ammortamento, energia, etc.)
    toolCost: number; // Costo dell'usura utensile
    materialCost: number; // Costo del materiale grezzo
    laborCost: number; // Costo della manodopera
    setupCost: number; // Costo di setup
    overheadCost: number; // Costi generali
  };
  assumptions: Record<string, any>;
  machineCostRate: number; // Costo/ora della macchina
  laborCostRate: number; // Costo/ora della manodopera
  setupTime: number; // in minutes
  machiningTime: number; // in minutes
  totalTime: number; // in minutes
  toolsUsed: {
    toolId: string;
    usageTime: number; // in minutes
    wearPercentage: number; // 0-100%
    cost: number;
  }[];
}

// Tipi per G-code
export interface GCodeAnalysis {
  id: string;
  fileSize: number; // in bytes
  lineCount: number;
  commandCount: Record<string, number>; // Conteggio dei comandi per tipo
  estimatedMachiningTime: number; // in seconds
  toolChanges: number;
  errors: GCodeError[];
  warnings: GCodeWarning[];
  optimization: GCodeOptimization;
}

export interface GCodeError {
  id: string;
  lineNumber: number;
  command: string;
  description: string;
  severity: "warning" | "error" | "critical";
  suggestedFix?: string;
}

export interface GCodeWarning {
  id: string;
  lineNumber: number;
  command: string;
  description: string;
  suggestedFix?: string;
}

export interface GCodeOptimization {
  optimizedSize: number; // in bytes
  optimizedLineCount: number;
  timeSavings: number; // in seconds
  feedRateOptimizations: number;
  unusedCodesRemoved: number;
  redundantMovesOptimized: number;
  recommendations: {
    description: string;
    type: "formatting" | "movement" | "tool" | "settings" | "custom";
    benefit: string;
    confidence: number; // 0-1
  }[];
}

// Tipi per richieste API
export interface CAMAnalysisRequest {
  toolpath?: Toolpath;
  gcode?: string;
  tool?: Tool;
  material?: Material;
  operation?: MachiningOperation;
  model?: AIModelType;
  maxTokens?: number;
  temperature?: number;
}

export interface CAMAnalysisResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  model?: string;
  processingTime?: number;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Tipi per azioni CAM
export type CAMAction =
  | { type: "ANALYZE_TOOLPATH"; payload: Toolpath }
  | {
      type: "OPTIMIZE_TOOLPATH";
      payload: { toolpath: Toolpath; goals?: ("time" | "quality" | "tool_life" | "cost")[] };
    }
  | { type: "ANALYZE_TOOL"; payload: { tool: Tool; material?: Material; operation?: MachiningOperation } }
  | { type: "OPTIMIZE_TOOL"; payload: { toolpath: Toolpath; currentTool: Tool; availableTools?: Tool[] } }
  | { type: "ANALYZE_MATERIAL"; payload: { material: Material; tools?: Tool[]; operation?: MachiningOperation } }
  | {
      type: "CALCULATE_COST";
      payload: { toolpath: Toolpath; tool: Tool; material?: Material; rates?: { machine: number; labor: number } };
    }
  | { type: "ANALYZE_GCODE"; payload: { gcode: string; tool?: Tool; material?: Material } }
  | {
      type: "OPTIMIZE_GCODE";
      payload: {
        gcode: string;
        tool?: Tool;
        material?: Material;
        goals?: ("time" | "quality" | "tool_life" | "cost")[];
      };
    }
  | { type: "SIMULATE_MACHINING"; payload: { toolpath: Toolpath; tool: Tool; material?: Material } }
  | { type: "GENERATE_REPORT"; payload: { analyses: (ToolpathAnalysis | GCodeAnalysis | CostEstimation)[] } };

// Estensione dell'AI Assistant per CAM
export interface CAMAssistantState {
  toolpaths: Toolpath[];
  tools: Tool[];
  materials: Material[];
  operations: MachiningOperation[];
  analyses: {
    toolpath: ToolpathAnalysis[];
    gcode: GCodeAnalysis[];
    cost: CostEstimation[];
  };
  activeTool?: Tool;
  activeMaterial?: Material;
  activeToolpath?: Toolpath;
  activeOperation?: MachiningOperation;
  currentGCode?: string;
  simulationData?: any;
}

export interface CAMAssistantSettings {
  defaultToolLibrary?: Tool[];
  defaultMaterialLibrary?: Material[];
  machineSettings?: {
    maxWorkArea: { x: number; y: number; z: number };
    maxSpindleSpeed: number;
    maxFeedRate: number;
    maxRapidRate: number;
    hasCoolant: boolean;
    coolantTypes: CoolantType[];
    controllerType: string;
    postProcessor: string;
  };
  costSettings?: {
    machineCostRate: number;
    laborCostRate: number;
    overheadRate: number;
    defaultSetupTime: number;
  };
  defaultAIModel?: AIModelType;
}
