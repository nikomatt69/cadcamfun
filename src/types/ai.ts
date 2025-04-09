// src/types/ai.ts (Enhanced)

// Existing interfaces from your project
export interface AIDesignSuggestion {
  id: string;
  type: 'optimization' | 'alternative' | 'improvement';
  description: string;
  confidence: number;
  potentialImpact: {
    performanceGain: number;
    costReduction: number;
    manufacturabilityScore: number;
  };
  suggestedModifications: any[];
}

export interface AIMaterialAnalysis {
  materialName: string;
  processCompatibility: number;
  recommendedParameters: {
    temperature: number;
    pressure: number;
    processingSpeed: number;
  };
  potentialChallenges: string[];
}

export interface ToolpathParameters {
  operation: string;
  tool: {
    type: string;
    diameter: number;
  };
  cutting: {
    speed: number;
    feedRate: number;
  };
}

export interface Toolpath {
  id?: string;
  name?: string;
  points?: { x: number; y: number; z: number }[];
  segments?: { start: number; end: number; type: string }[];
  aiOptimizations?: {
    description: string;
    optimizationScore: number;
    suggestedModifications: ToolpathModification[];
  };
}

export interface ToolpathModification {
  id: string;
  type: 'path' | 'speed' | 'feedRate' | 'toolChange';
  description: string;
  priority: number;
  impact: {
    timeReduction?: number;
    toolWearReduction?: number;
    surfaceQualityImprovement?: number;
  };
}

// New interfaces for enhanced AI integration

/**
 * Configuration options for AI services
 */
export interface AIConfig {
  apiKey?: string;
  allowBrowser: boolean;
  defaultModel: AIModelType;  // Using AIModelType instead of string
  maxTokens: number;
  temperature: number;
  cacheEnabled: boolean;
  analyticsEnabled: boolean;
  customPrompts?: Record<string, string>;
  retryAttempts?: number;
}

/**
 * AI model types supported by the application
 */
export type AIModelType = 
  | 'claude-3-5-sonnet-20240229'
  | 'claude-3-opus-20240229'
  | 'claude-3-haiku-20240229'
  | 'claude-3-7-sonnet-20250219'; // Added future model

/**
 * Standard AI request parameters
 */
export interface AIRequest {
  prompt: string;
  model?: AIModelType;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  parseResponse?: (text: string) => any;
  onProgress?: (text: string) => void;
  retryCount?: number;
}

/**
 * Standard AI response structure
 */
export interface AIResponse<T> {
  rawResponse: string | null;
  data: T | null;
  error?: string;
  parsingError?: Error | null;
  processingTime?: number;
  model?: AIModelType;
  success: boolean;
  fromCache?: boolean;
  warnings?: string[];
  suggestions?: string[];
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    cost?: number;
  };
}

/**
 * Request parameters for text-to-CAD conversion
 */
export interface TextToCADRequest {
  description: string;
  constraints?: {
    maxElements?: number;
    maxDimensions?: {
      width: number;
      height: number;
      depth: number;
    };
    preferredTypes?: string[];
    mustInclude?: string[];
    mustExclude?: string[];
    [key: string]: any;
  };
  style?: 'precise' | 'artistic' | 'mechanical' | 'organic';
  complexity?: 'simple' | 'moderate' | 'complex' | 'creative';
}

/**
 * Response from text-to-CAD conversion
 */
export interface TextToCADResponse {
  elements: any[];
  conversionScore: number;
  interpretationNotes?: string[];
  warnings?: string[];
  suggestions?: string[];
}

/**
 * Parameters for G-code optimization
 */
export interface GCodeOptimizationRequest {
  gcode: string;
  machineType: string;
  material?: string;
  toolDiameter?: number;
  optimizationGoal?: 'speed' | 'quality' | 'toolLife' | 'balanced';
  constraints?: {
    maxFeedRate?: number;
    maxSpindleSpeed?: number;
    minToolLife?: number;
    [key: string]: any;
  };
}

/**
 * Response from G-code optimization
 */
export interface GCodeOptimizationResponse {
  optimizedGCode: string;
  improvements: string[];
  optimizationScore: number;
  timeReduction?: number;
  toolLifeImprovement?: number;
  qualityImprovement?: number;
}

/**
 * Parameters for AI design analysis
 */
export interface DesignAnalysisRequest {
  elements: any[];
  analysisType: 'structural' | 'manufacturability' | 'cost' | 'performance' | 'comprehensive';
  materialContext?: string;
  manufacturingMethod?: string;
  specificConcerns?: string[];
}

/**
 * Response from AI design analysis
 */
export interface DesignAnalysisResponse {
  overallScore: number;
  suggestions: AIDesignSuggestion[];
  criticalIssues: string[];
  improvements: string[];
  insights: string[];
}

export type ComponentType = 'mechanical' | 'electronic' | 'structural' | 'fixture' | 'enclosure' | 'fastener';
export type ManufacturingMethod = '3d-printing' | 'cnc-machining' | 'injection-molding' | 'laser-cutting' | 'sheet-metal' | 'extrusion';
export type MaterialCategory = 'metal' | 'plastic' | 'composite' | 'wood' | 'ceramic';

export interface Dimensions {
  maxWidth: number;
  maxHeight: number;
  maxDepth: number;
  minWallThickness: number;
}

export interface GeneratedComponent {
  id: string;
  prompt: string;
  elements: any[];
  timestamp: string;
  confidence: number;
  warnings: string[];
  suggestions: string[];
  metadata: {
    type: ComponentType | null;
    manufacturingMethod: ManufacturingMethod | null;
    material: MaterialCategory | null;
    dimensions: Dimensions;
  };
}



export type AIMode = 'cad' | 'cam' | 'gcode' | 'toolpath' | 'analysis';

export interface AIServiceConfig {
  apiKey?: string;
  defaultModel: AIModelType;
  maxTokens: number;
  temperature: number;
  cacheEnabled: boolean;
  analyticsEnabled: boolean;
  allowBrowser: boolean;
  customPrompts?: Record<string, string>;
  retryAttempts?: number;
}

export interface AIRequest {
  prompt: string;
  model?: AIModelType;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  mode?: AIMode;
  context?: any;
  parseResponse?: (text: string) => any;
  onProgress?: (text: string) => void;
}

export interface AIResponse<T = any> {
  rawResponse: string | null;
  data: T | null;
  error?: string;
  success: boolean;
  suggestions?: string[];
  fromCache?: boolean;
  metadata?: {
    model: AIModelType;
    processingTime: number;
    tokenUsage: {
      prompt: number;
      completion: number;
      total: number;
    };
    cost?: number;
  };
}

export interface AIPerformanceMetrics {
  averageResponseTime: number;
  successRate: number;
  tokenUsage: number;
  costEfficiency: number;
  modelUsage: Record<AIModelType, number>;
  errors: {
    count: number;
    types: Record<string, number>;
  };
}

export interface AIOptimizationStrategy {
  modelSelection: {
    preferredModel: AIModelType;
    fallbackModel: AIModelType;
    switchingThreshold: number;
  };
  tokenOptimization: {
    maxTokens: number;
    compressionEnabled: boolean;
  };
  caching: {
    enabled: boolean;
    ttl: number;
  };
}
export interface CADElement {
  id: string;
  type: ElementType;
  name: string;
  position: Point3D;
  material: Material;
  color: string;
  surfaceFinish?: string;
  tolerance?: number;
  visible?: boolean;
  locked?: boolean;
  metadata?: Record<string, any>;
}

export type ElementType = 
  // Primitive di base
  | 'cube' | 'sphere' | 'cylinder' | 'cone' | 'torus' 
  // Primitive avanzate
  | 'pyramid' | 'prism' | 'hemisphere' | 'ellipsoid' | 'capsule'
  // 2D Elements
  | 'circle' | 'rectangle' | 'triangle' | 'polygon' | 'ellipse' | 'arc'
  // Curve
  | 'line' | 'spline' | 'bezier' | 'nurbs'
  // Operazioni booleane
  | 'boolean-union' | 'boolean-subtract' | 'boolean-intersect'
  // Operazioni di trasformazione
  | 'extrusion' | 'revolution' | 'sweep' | 'loft'
  // Elementi industriali
  | 'thread' | 'chamfer' | 'fillet' | 'gear' | 'spring'
  // Elementi di assemblaggio
  | 'screw' | 'nut' | 'bolt' | 'washer' | 'rivet'
  // Elementi architettonici
  | 'wall' | 'floor' | 'roof' | 'window' | 'door' | 'stair' | 'column'
  // Elementi speciali
  | 'text3d' | 'path3d' | 'point-cloud' | 'mesh' | 'group';

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Material {
  type: string;
  name: string;
  density: number;  // kg/m³
  color: string;
  shininess?: number;
  roughness?: number;
  metallic?: boolean;
  transparency?: number;
  refractionIndex?: number;
  thermalConductivity?: number;
  youngsModulus?: number;  // Pa
  tensileStrength?: number; // Pa
  compressiveStrength?: number; // Pa
}

// Definizioni per i tipi specifici di elementi
export interface CubeElement extends CADElement {
  type: 'cube';
  width: number;
  height: number;
  depth: number;
  roundedCorners?: boolean;
  cornerRadius?: number;
}

export interface SphereElement extends CADElement {
  type: 'sphere';
  radius: number;
  segments?: number;
}

export interface CylinderElement extends CADElement {
  type: 'cylinder';
  radius: number;
  height: number;
  segments?: number;
  capped?: boolean;
}

export interface ConeElement extends CADElement {
  type: 'cone';
  radiusBottom: number;
  radiusTop: number;
  height: number;
  segments?: number;
  capped?: boolean;
}

export interface TorusElement extends CADElement {
  type: 'torus';
  radius: number;
  tubeRadius: number;
  tubularSegments?: number;
  radialSegments?: number;
  arc?: number;
}

export interface ExtrusionElement extends CADElement {
  type: 'extrusion';
  profile: Point2D[];
  depth: number;
  taper?: number;
  bevel?: boolean;
  bevelSize?: number;
}

export interface RevolutionElement extends CADElement {
  type: 'revolution';
  profile: Point2D[];
  angle: number;
  axis: 'x' | 'y' | 'z';
  segments?: number;
}

export interface SweepElement extends CADElement {
  type: 'sweep';
  profile: Point2D[];
  path: Point3D[];
  scale?: number[];
  twist?: number;
  alignToPath?: boolean;
}

export interface LoftElement extends CADElement {
  type: 'loft';
  profiles: Point2D[][];
  positions: Point3D[];
  closed?: boolean;
  smoothing?: number;
}

export interface GearElement extends CADElement {
  type: 'gear';
  moduleValue: number;  // modulo in mm
  teeth: number;
  pressureAngle: number;
  thickness: number;
  holeDiameter?: number;
  profileShift?: number;
  helicalAngle?: number;
}

export interface ThreadElement extends CADElement {
  type: 'thread';
  diameter: number;
  pitch: number;
  length: number;
  handedness: 'right' | 'left';
  standard?: 'metric' | 'imperial' | 'whitworth' | 'acme' | 'npt';
  class?: string;  // e.g. "6g" for external thread
}

export interface BooleanOperation extends CADElement {
  type: 'boolean-union' | 'boolean-subtract' | 'boolean-intersect';
  operands: string[];  // IDs of elements to operate on
  result?: CADElement;
}

export interface FilletElement extends CADElement {
  type: 'fillet';
  radius: number;
  edges: string[];  // IDs of edges to fillet
  variable?: boolean;
  radiusProfile?: number[];
}

export interface ChamferElement extends CADElement {
  type: 'chamfer';
  distance: number;
  angle?: number;
  edges: string[];  // IDs of edges to chamfer
}

export interface Point2D {
  x: number;
  y: number;
}

export interface Text3DElement extends CADElement {
  type: 'text3d';
  text: string;
  height: number;
  depth: number;
  font?: string;
  bold?: boolean;
  italic?: boolean;
  alignment?: 'left' | 'center' | 'right';
}

export interface StandardComponentElement extends CADElement {
  type: 'screw' | 'nut' | 'bolt' | 'washer' | 'rivet';
  standard: string;  // e.g. "ISO 4762", "DIN 934"
  size: string;      // e.g. "M6", "M8x1.25"
  length?: number;   // for screws, bolts
  grade?: string;    // e.g. "8.8", "A2-70"
  thread?: string;   // e.g. "M6x1"
}

export interface GroupElement extends CADElement {
  type: 'group';
  children: string[];  // IDs of child elements
  transformation?: Matrix4x4;
}

export interface Matrix4x4 {
  elements: number[];  // 16 element array
}