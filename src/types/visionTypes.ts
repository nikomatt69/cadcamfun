// src/types/visionTypes.ts - Tipi specifici per Vision API
import type { Element } from "@/src/store/elementsStore";

export interface ImageData {
  url: string;
  name: string;
  type: string;
  content?: string; // base64 se necessario
  size?: number;
}

export interface VisionAnalysisResult {
  analysis: string;
  confidence: number;
  extractedData?: {
    dimensions?: Dimension[];
    materials?: string[];
    components?: Component[];
    measurements?: Measurement[];
  };
  cadRecommendations?: string;
  extractedElements?: Element[];
  suggestions?: string[];
  manufacturingInsights?: string;
  designOptimizations?: string[];
  compatibilityCheck?: {
    compatible: boolean;
    issues?: string[];
  };
}

export interface CADVisionResult extends VisionAnalysisResult {
  cadSpecificAnalysis: {
    detectedShapes: DetectedShape[];
    suggestedOperations: SuggestedOperation[];
    materialRecommendations: MaterialRecommendation[];
    manufacturabilityScore: number;
  };
}

export interface DetectedShape {
  type: string;
  confidence: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  properties?: Record<string, any>;
}

export interface SuggestedOperation {
  operation: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  estimatedTime?: number;
}

export interface MaterialRecommendation {
  material: string;
  reasoning: string;
  confidence: number;
  properties?: Record<string, any>;
}

export interface Dimension {
  type: 'length' | 'width' | 'height' | 'radius' | 'diameter' | 'angle';
  value: number;
  unit: string;
  confidence: number;
  location?: {
    x: number;
    y: number;
  };
}

export interface Component {
  name: string;
  type: string;
  confidence: number;
  properties?: Record<string, any>;
}

export interface Measurement {
  type: string;
  value: number;
  unit: string;
  accuracy: number;
  location?: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  };
}

export interface ImageAnalysisRequest {
  images: ImageData[];
  prompt: string;
  cadContext?: {
    elements: Element[];
    projectName?: string;
    currentTool?: string;
    material?: string;
    machineType?: string;
  };
  analysisType: 'design' | 'manufacturing' | 'measurement' | 'general';
  options?: {
    extractDimensions?: boolean;
    suggestCADElements?: boolean;
    analyzeManufacturability?: boolean;
    detectMaterials?: boolean;
  };
}

export interface VisionAPIResponse {
  success: boolean;
  result?: string;
  error?: string;
  metadata?: {
    model: string;
    processingTime: number;
    confidence?: number;
  };
}

export type VisionAnalysisType = 'design' | 'manufacturing' | 'measurement' | 'general';

export interface VisionServiceConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
  retryAttempts: number;
}
