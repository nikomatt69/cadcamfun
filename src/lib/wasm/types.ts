/**
 * WASM Configuration Types
 * Production-ready TypeScript interfaces for WASM system
 */

export interface WasmConfig {
  // Base configuration
  preferEnhanced: boolean;
  enablePerformanceMonitoring: boolean;
  memoryManagement: boolean;
  adaptiveResolution: boolean;
  targetFps: number;

  // Feature toggles
  enableCSG: boolean;
  enableMeshOptimization: boolean;
  enableSnapping: boolean;
  enableConstraints: boolean;
  enableLOD: boolean;
  enableFrustumCulling: boolean;
  enableGeometryOptimization: boolean;
  enableInstancing: boolean;
  enableToolpathOptimization: boolean;

  // Performance thresholds
  highDetailThreshold: number;
  mediumDetailThreshold: number;
  lowDetailReduction: number;
  mediumDetailReduction: number;
  maxTriangles: number;
}

export interface DeviceCapabilities {
  isMobile: boolean;
  hasSharedArrayBuffer: boolean;
  hasWebAssembly: boolean;
  hasWebGL2: boolean;
  memoryGB: number;
  hardwareConcurrency: number;
  canUseWasm: boolean;
  canUseThreading: boolean;
  isHighEndDevice: boolean;
  isLowEndDevice: boolean;
}

export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  memoryUsage: number;
  triangleCount: number;
  drawCalls: number;
  wasmHeapSize: number;
  gpuMemoryUsage: number;
  timestamp: number;
}

export interface QualityAdjustments {
  lodReduction?: number;
  triangleLimit?: number;
  enableInstancing?: boolean;
  enableFrustumCulling?: boolean;
  adaptiveResolution?: boolean;
}

export interface AdaptiveSettings {
  enabled: boolean;
  adjustmentInterval: number;
  fpsThreshold: number;
  recoveryThreshold: number;
  currentAdjustments: QualityAdjustments;
}

export interface GlobalMetrics {
  averageFps: number;
  memoryTrend: "increasing" | "decreasing" | "stable";
  performanceScore: number;
  deviceEfficiency: number;
}

export type OperationType = "cad" | "cam" | "mixed";
export type PerformanceMode = "balanced" | "high-performance" | "mobile";
export type DeviceClass = "high-end" | "mid-range" | "low-end" | "mobile";

export interface WasmConfigContext {
  isMobile?: boolean;
  isDevelopment?: boolean;
  operationType?: OperationType;
  performanceMode?: PerformanceMode;
}

export interface DeviceProfile {
  deviceClass: DeviceClass;
  recommendedConfig: WasmConfig;
  capabilities: DeviceCapabilities;
  benchmarkScore: number;
}

export interface PerformanceAlert {
  type: "fps" | "memory" | "triangles" | "drawCalls";
  severity: "warning" | "critical";
  message: string;
  suggestedAction: string;
  timestamp: number;
}
