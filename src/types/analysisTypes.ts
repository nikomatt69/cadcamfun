/**
 * Tipi per l'Analisi Geometrica CAD
 * Sistema di analisi dimensionale e posizionale
 */

import { CADElement } from "./ai";

export interface AnalysisContext {
  projectId?: string;
  sessionId: string;
  timestamp: number;
  userPreferences?: UserAnalysisPreferences;
  constraints?: AnalysisConstraints;
}

export interface UserAnalysisPreferences {
  units: "mm" | "cm" | "m" | "in" | "ft";
  precision: number; // decimal places
  analysisDepth: "quick" | "standard" | "thorough" | "exhaustive";
  priorityWeights: {
    position: number;
    dimension: number;
    quality: number;
    manufacturing: number;
  };
  autoFix: boolean;
  realTimeAnalysis: boolean;
}

export interface AnalysisConstraints {
  maxDimensions?: {
    width: number;
    height: number;
    depth: number;
  };
  minDimensions?: {
    width: number;
    height: number;
    depth: number;
  };
  allowedPositions?: BoundingBox;
  materialConstraints?: MaterialConstraint[];
  manufacturingConstraints?: ManufacturingConstraint[];
  tolerances?: ToleranceSpec[];
}

export interface BoundingBox {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

export interface MaterialConstraint {
  type: string; // 'density', 'strength', 'elasticity', etc.
  value: number;
  operator: "min" | "max" | "exact" | "range";
  unit: string;
}

export interface ManufacturingConstraint {
  process: "milling" | "turning" | "3d_printing" | "casting" | "forming";
  parameter: string;
  value: number | { min: number; max: number };
  critical: boolean;
}

export interface ToleranceSpec {
  parameter: "position" | "dimension" | "angle" | "surface_finish";
  value: number;
  type: "bilateral" | "unilateral_plus" | "unilateral_minus";
}

// Analisi dimensionale dettagliata
export interface DimensionalAnalysis {
  elementId: string;
  elementType: string;
  dimensions: ElementDimensions;
  measurements: MeasurementResult[];
  deviations: DimensionalDeviation[];
  recommendations: DimensionalRecommendation[];
  confidence: number;
}

export interface ElementDimensions {
  width?: number;
  height?: number;
  depth?: number;
  radius?: number;
  diameter?: number;
  length?: number;
  area?: number;
  volume?: number;
  perimeter?: number;
  customDimensions?: Record<string, number>;
}

export interface MeasurementResult {
  parameter: string;
  measured: number;
  expected?: number;
  tolerance?: number;
  unit: string;
  method: "calculated" | "approximated" | "user_specified";
  accuracy: number; // 0-1
}

export interface DimensionalDeviation {
  parameter: string;
  deviation: number;
  percentage: number;
  severity: "acceptable" | "warning" | "critical";
  impact: string;
}

export interface DimensionalRecommendation {
  parameter: string;
  currentValue: number;
  suggestedValue: number;
  reason: string;
  priority: number;
  estimatedImprovement: number;
}

// Analisi posizionale dettagliata
export interface PositionalAnalysis {
  elementId: string;
  position: Position3D;
  orientation: Orientation3D;
  relationships: SpatialRelationship[];
  alignments: AlignmentCheck[];
  intersections: IntersectionAnalysis[];
  recommendations: PositionalRecommendation[];
  confidence: number;
}

export interface Position3D {
  x: number;
  y: number;
  z: number;
  coordinateSystem: "global" | "local" | "relative";
  reference?: string; // ID of reference element
}

export interface Orientation3D {
  rotation: { x: number; y: number; z: number }; // Euler angles in degrees
  quaternion?: { x: number; y: number; z: number; w: number };
  normal?: { x: number; y: number; z: number };
}

export interface SpatialRelationship {
  relatedElementId: string;
  type: "adjacent" | "overlapping" | "contained" | "containing" | "separate" | "touching";
  distance: number;
  closestPoints?: {
    onThis: Position3D;
    onRelated: Position3D;
  };
  isValid: boolean;
  issues?: string[];
}

export interface AlignmentCheck {
  type: "edge" | "face" | "center" | "axis";
  referenceElementId?: string;
  alignment: "aligned" | "misaligned" | "partially_aligned";
  deviation: number; // degrees or distance
  tolerance: number;
}

export interface IntersectionAnalysis {
  intersectedElementId: string;
  intersectionType: "penetration" | "surface_contact" | "edge_contact" | "point_contact";
  intersectionVolume?: number;
  intersectionArea?: number;
  isIntentional: boolean;
  severity: "info" | "warning" | "error";
}

export interface PositionalRecommendation {
  type: "move" | "rotate" | "align" | "distribute";
  description: string;
  currentPosition: Position3D;
  suggestedPosition: Position3D;
  currentOrientation?: Orientation3D;
  suggestedOrientation?: Orientation3D;
  reason: string;
  priority: number;
}

// Analisi qualità geometrica
export interface GeometricQualityAnalysis {
  elementId: string;
  meshQuality?: MeshQualityMetrics;
  surfaceQuality?: SurfaceQualityMetrics;
  solidQuality?: SolidQualityMetrics;
  topologyIssues: TopologyIssue[];
  recommendations: QualityRecommendation[];
  overallScore: number; // 0-100
}

export interface MeshQualityMetrics {
  triangleCount: number;
  quadCount: number;
  aspectRatio: { min: number; max: number; average: number };
  skewness: { min: number; max: number; average: number };
  edgeLength: { min: number; max: number; average: number };
  manifoldness: boolean;
  watertight: boolean;
  selfIntersections: number;
}

export interface SurfaceQualityMetrics {
  continuity: "C0" | "C1" | "C2" | "G0" | "G1" | "G2";
  smoothness: number; // 0-1
  curvature: {
    gaussian: { min: number; max: number; mean: number };
    mean: { min: number; max: number; mean: number };
  };
  distortion: number;
  parameterization: "good" | "acceptable" | "poor";
}

export interface SolidQualityMetrics {
  volume: number;
  surfaceArea: number;
  boundingBox: BoundingBox;
  centerOfMass: Position3D;
  momentOfInertia?: {
    xx: number;
    yy: number;
    zz: number;
    xy: number;
    xz: number;
    yz: number;
  };
  isValid: boolean;
  isClosed: boolean;
  isManifold: boolean;
}

export interface TopologyIssue {
  type:
    | "non_manifold_edge"
    | "non_manifold_vertex"
    | "degenerate_face"
    | "duplicate_vertex"
    | "hole"
    | "self_intersection";
  severity: "info" | "warning" | "error" | "critical";
  location?: Position3D;
  description: string;
  autoFixable: boolean;
}

export interface QualityRecommendation {
  issue: string;
  suggestion: string;
  action: "remesh" | "smooth" | "repair" | "rebuild" | "manual_fix";
  parameters?: Record<string, any>;
  expectedImprovement: number;
  priority: number;
}

// Risultati di analisi aggregati
export interface ComprehensiveAnalysisResult {
  sessionId: string;
  timestamp: number;
  elements: CADElement[];
  dimensionalAnalysis: DimensionalAnalysis[];
  positionalAnalysis: PositionalAnalysis[];
  qualityAnalysis: GeometricQualityAnalysis[];
  overallMetrics: {
    totalElements: number;
    averageQuality: number;
    criticalIssues: number;
    warningIssues: number;
    recommendationCount: number;
    analysisTime: number;
  };
  summary: AnalysisSummary;
  nextSteps: NextStepRecommendation[];
}

export interface AnalysisSummary {
  status: "excellent" | "good" | "acceptable" | "needs_improvement" | "critical_issues";
  majorFindings: string[];
  keyRecommendations: string[];
  priorityActions: string[];
  estimatedImprovementPotential: number; // 0-100
}

export interface NextStepRecommendation {
  action: string;
  description: string;
  priority: "high" | "medium" | "low";
  estimatedTime: number; // minutes
  requiredTools?: string[];
  automatable: boolean;
}

// Interfacce per l'analisi in tempo reale
export interface RealTimeAnalysisConfig {
  enabled: boolean;
  updateInterval: number; // milliseconds
  sensitivityThreshold: number; // minimum change to trigger analysis
  analysisScope: "modified_elements" | "affected_elements" | "all_elements";
  callbacks: {
    onIssueDetected?: (issue: AnalysisIssue) => void;
    onIssueResolved?: (issue: AnalysisIssue) => void;
    onQualityChange?: (oldScore: number, newScore: number) => void;
  };
}

export interface AnalysisIssue {
  id: string;
  elementId: string;
  type: "dimensional" | "positional" | "quality";
  severity: "info" | "warning" | "error" | "critical";
  message: string;
  detectedAt: number;
  resolvedAt?: number;
  autoFixAttempted?: boolean;
  userAction?: string;
}

// Configurazione per analisi batch
export interface BatchAnalysisConfig {
  elements: CADElement[];
  analysisTypes: ("dimensional" | "positional" | "quality")[];
  constraints?: AnalysisConstraints;
  parallel: boolean;
  maxConcurrency?: number;
  progressCallback?: (progress: number, stage: string) => void;
  resultCallback?: (elementId: string, result: any) => void;
}
