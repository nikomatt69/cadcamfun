// src/lib/wasm/types.ts

/**
 * Impostazioni di performance per l'ottimizzatore
 */
export interface PerformanceSettings {
  targetFps: number;
  resolutionScale: number;
  lodBias: number;
  maxTriangles: number;
  frustumCulling: boolean;
}

/**
 * Statistiche di performance per il monitoraggio
 */
export interface PerformanceStats {
  fps: number;
  frameTime: number;
  triangleCount: number;
  drawCalls: number;
  memoryUsage: number;
  gpuUsage: number;
}

/**
 * Dati di mesh per operazioni geometriche
 */
export interface MeshData {
  vertices: Float32Array;
  indices: Uint32Array;
}

/**
 * Livello di dettaglio (LOD) per gestione della complessità
 */
export interface LodLevel {
  distance: number;
  detailRatio: number;
}

/**
 * Configurazione geometrica per un livello LOD
 */
export interface LodGeometryConfig {
  level: number;
  distance: number;
  geometryId: string;
  triangleReduction: number;
}

/**
 * Informazioni GPU rilevate
 */
export interface GpuInfo {
  tier: number; // 1-3, dove 3 è high-end
  vendor: string;
  renderer: string;
  isMobile: boolean;
}

/**
 * Opzioni per ottimizzare il rendering
 */
export interface RenderingOptions {
  enableInstancing: boolean;
  enableFrustumCulling: boolean;
  enableAdaptiveResolution: boolean;
  enableLodSystem: boolean;
  enableGeometryBatching: boolean;
  enableMaterialOptimization: boolean;
  maxDrawCalls: number;
}
