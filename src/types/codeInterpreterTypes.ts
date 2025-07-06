// src/types/codeInterpreterTypes.ts
import { AIRequest, AIResponse, AIModelType } from "./AITypes";

// === CODE INTERPRETER CONTAINER TYPES ===
export interface ContainerInfo {
  id: string;
  name?: string;
  status: "active" | "expired" | "creating" | "error";
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  fileCount: number;
  metadata?: Record<string, any>;
}

export interface ContainerFile {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
  downloadUrl?: string;
  metadata?: Record<string, any>;
}

// === CODE INTERPRETER REQUEST TYPES ===
export interface CodeInterpreterRequest extends AIRequest {
  code?: string;
  files?: string[]; // File IDs to include in container
  containerMode?: "auto" | "explicit";
  containerId?: string;
  executionTimeout?: number;
  language?: "python"; // Currently only Python is supported
  codeType?: "analysis" | "visualization" | "computation" | "file_processing" | "cad_processing";
  outputFormat?: "text" | "json" | "image" | "file";
}

export interface CodeInterpreterResponse extends AIResponse<CodeExecutionResult> {
  containerInfo?: ContainerInfo;
  executionResults?: CodeExecutionResult;
  generatedFiles?: ContainerFile[];
  pythonOutput?: string;
  errors?: string[];
}

export interface CodeExecutionResult {
  output: string;
  error?: string;
  executionTime: number;
  memoryUsage?: number;
  generatedFiles: ContainerFile[];
  visualizations: VisualizationFile[];
  dataAnalysis?: DataAnalysisResult;
}

// === VISUALIZATION TYPES ===
export interface VisualizationFile extends ContainerFile {
  type: "plot" | "chart" | "graph" | "3d_model" | "animation";
  format: "png" | "svg" | "html" | "json";
  description?: string;
  parameters?: Record<string, any>;
}

export interface DataAnalysisResult {
  summary: string;
  statistics: Record<string, number>;
  insights: string[];
  recommendations: string[];
  dataQuality: {
    completeness: number;
    accuracy: number;
    consistency: number;
  };
}

// === CAD-SPECIFIC CODE INTERPRETER TYPES ===
export interface CADCodeRequest extends CodeInterpreterRequest {
  cadElements: any[];
  analysisType: "geometry" | "structural" | "optimization" | "validation" | "manufacturing";
  materialProperties?: {
    density: number;
    elasticModulus: number;
    yieldStrength: number;
    [key: string]: any;
  };
  constraints?: {
    forces: any[];
    fixedPoints: any[];
    [key: string]: any;
  };
}

export interface CADAnalysisResult extends CodeExecutionResult {
  geometryAnalysis?: {
    volume: number;
    surfaceArea: number;
    centroid: { x: number; y: number; z: number };
    boundingBox: {
      min: { x: number; y: number; z: number };
      max: { x: number; y: number; z: number };
    };
  };
  structuralAnalysis?: {
    maxStress: number;
    maxDeflection: number;
    safetyFactor: number;
    criticalPoints: any[];
  };
  optimizationResults?: {
    originalWeight: number;
    optimizedWeight: number;
    weightReduction: number;
    modificationSuggestions: string[];
  };
}

// === GCODE PROCESSING TYPES ===
export interface GCodeCodeRequest extends CodeInterpreterRequest {
  gcode: string;
  machineSpecs: {
    maxFeedRate: number;
    maxSpindleSpeed: number;
    workEnvelope: {
      x: number;
      y: number;
      z: number;
    };
  };
  tool: {
    diameter: number;
    material: string;
    coating?: string;
  };
  material: {
    type: string;
    hardness?: number;
    density?: number;
  };
}

export interface GCodeAnalysisResult extends CodeExecutionResult {
  machiningTime: number;
  totalDistance: number;
  toolPath: {
    rapidMoves: number;
    cuttingMoves: number;
    totalLength: number;
  };
  optimization: {
    timeSaved: number;
    proposedChanges: string[];
    estimatedCost: number;
  };
  quality: {
    surfaceFinish: string;
    dimensionalAccuracy: string;
    toolWear: string;
  };
}

// === FILE UPLOAD TYPES ===
export interface FileUploadRequest {
  containerId: string;
  files: {
    name: string;
    content: string | ArrayBuffer;
    contentType: string;
  }[];
}

export interface FileUploadResponse {
  success: boolean;
  uploadedFiles: ContainerFile[];
  errors?: string[];
}

// === CONTAINER MANAGEMENT ===
export interface ContainerCreateRequest {
  name?: string;
  files?: string[]; // Initial file IDs to include
  metadata?: Record<string, any>;
}

export interface ContainerListResponse {
  containers: ContainerInfo[];
  total: number;
  active: number;
  expired: number;
}

// === PREDEFINED CODE TEMPLATES ===
export interface CodeTemplate {
  id: string;
  name: string;
  description: string;
  category: "cad" | "cam" | "analysis" | "visualization" | "utility";
  code: string;
  requiredInputs: string[];
  expectedOutputs: string[];
  examples?: string[];
}

// === EXECUTION CONTEXT ===
export interface ExecutionContext {
  cadElements?: any[];
  gcodeContent?: string;
  analysisParameters?: Record<string, any>;
  userPreferences?: Record<string, any>;
  projectMetadata?: Record<string, any>;
}
