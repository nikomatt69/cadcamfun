// src/lib/wasm/wasmBridge.ts
import { PerformanceSettings } from "@/src/types/typeswasm";
import type { CADOptimizer } from "cad-optimizer";

let wasmModule: typeof import("cad-optimizer");
let optimizer: CADOptimizer | null = null;
let isInitialized = false;
let isInitializing = false;
let initPromise: Promise<void> | null = null;

/**
 * Interfaccia delle statistiche di performance
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
 * Interfaccia per i dati di una mesh
 */
export interface MeshData {
  vertices: Float32Array;
  indices: Uint32Array;
}

/**
 * Interfaccia per un livello di dettaglio (LOD)
 */
export interface LodLevel {
  distance: number;
  detailRatio: number;
}

/**
 * Inizializza il modulo WASM
 */
export async function initWasmOptimizer(): Promise<void> {
  if (isInitialized) return;
  if (isInitializing) return initPromise!;

  isInitializing = true;

  initPromise = (async () => {
    try {
      // Importa dinamicamente il modulo WASM
      wasmModule = await import("cad-optimizer");

      // Add this line (adjust 'default' or 'init' based on the package)
      await wasmModule.default(); // Or await wasmModule.init();

      // Inizializza l'ottimizzatore
      optimizer = new wasmModule.CADOptimizer();

      isInitialized = true;
      console.log("WASM CAD Optimizer initialized successfully");
    } catch (error) {
      console.error("Failed to initialize WASM CAD Optimizer:", error);
      isInitialized = false;
      throw error;
    } finally {
      isInitializing = false;
    }
  })();

  return initPromise;
}

/**
 * Verifica se l'ottimizzatore è inizializzato
 */
export function isOptimizerInitialized(): boolean {
  return isInitialized && optimizer !== null;
}

/**
 * Configura l'ottimizzatore
 */
export async function configureOptimizer(settings: PerformanceSettings): Promise<void> {
  if (!isInitialized) await initWasmOptimizer();

  try {
    // Map all TypeScript camelCase names to the Rust snake_case names
    const wasmSettings = {
      target_fps: settings.targetFps,
      resolution_scale: settings.resolutionScale,
      lod_bias: settings.lodBias,
      max_triangles: settings.maxTriangles,
      frustum_culling: settings.frustumCulling
    };

    // Note: Removed the spread operator (...settings) to ensure only
    // the explicitly mapped snake_case keys are passed to the WASM module.

    optimizer!.configure(wasmSettings);
  } catch (error) {
    console.error("Failed to configure CAD Optimizer:", error);
    throw error;
  }
}

/**
 * Ottiene le statistiche correnti
 */
export async function getPerformanceStats(): Promise<PerformanceStats> {
  if (!isInitialized) await initWasmOptimizer();

  try {
    return optimizer!.get_stats() as unknown as PerformanceStats;
  } catch (error) {
    console.error("Failed to get performance stats:", error);
    throw error;
  }
}

/**
 * Aggiorna le statistiche di performance
 */
export async function updatePerformanceStats(
  fps: number,
  frameTime: number,
  triangles: number,
  drawCalls: number
): Promise<void> {
  if (!isInitialized) await initWasmOptimizer();

  try {
    optimizer!.update_stats(fps, frameTime, triangles, drawCalls);
  } catch (error) {
    console.error("Failed to update performance stats:", error);
    throw error;
  }
}

/**
 * Calcola le impostazioni ottimali
 */
export async function calculateOptimalSettings(): Promise<PerformanceSettings> {
  if (!isInitialized) await initWasmOptimizer();

  try {
    return optimizer!.calculate_optimal_settings() as unknown as PerformanceSettings;
  } catch (error) {
    console.error("Failed to calculate optimal settings:", error);
    throw error;
  }
}

/**
 * Decima una mesh (riduce il numero di triangoli)
 */
export async function decimateMesh(vertices: Float32Array, indices: Uint32Array, ratio: number): Promise<MeshData> {
  if (!isInitialized) await initWasmOptimizer();

  try {
    return optimizer!.decimate_mesh(vertices, indices, ratio) as unknown as MeshData;
  } catch (error) {
    console.error("Failed to decimate mesh:", error);
    throw error;
  }
}

/**
 * Esegue un'operazione booleana tra due mesh
 */
export async function booleanOperation(
  operation: "union" | "subtract" | "intersect",
  meshA: MeshData,
  meshB: MeshData
): Promise<MeshData> {
  if (!isInitialized) await initWasmOptimizer();

  try {
    return optimizer!.boolean_operation(operation, meshA, meshB) as unknown as MeshData;
  } catch (error) {
    console.error(`Failed to perform boolean operation "${operation}":`, error);
    throw error;
  }
}

/**
 * Calcola i livelli LOD ottimali per una mesh
 */
export async function calculateLodLevels(complexity: number): Promise<LodLevel[]> {
  if (!isInitialized) await initWasmOptimizer();

  try {
    return optimizer!.calculate_lod_levels(complexity) as unknown as LodLevel[];
  } catch (error) {
    console.error("Failed to calculate LOD levels:", error);
    throw error;
  }
}

/**
 * Calcola le normali per una mesh
 */
export async function calculateNormals(vertices: Float32Array, indices: Uint32Array): Promise<Float32Array> {
  if (!isInitialized) await initWasmOptimizer();

  try {
    return optimizer!.calculate_normals(vertices, indices);
  } catch (error) {
    console.error("Failed to calculate normals:", error);
    throw error;
  }
}

/**
 * Verifica se un oggetto è visibile nel frustum della camera
 */
export async function isInFrustum(
  bboxMin: [number, number, number],
  bboxMax: [number, number, number],
  viewProjectionMatrix: Float32Array
): Promise<boolean> {
  if (!isInitialized) await initWasmOptimizer();

  try {
    return optimizer!.is_in_frustum(
      bboxMin[0],
      bboxMin[1],
      bboxMin[2],
      bboxMax[0],
      bboxMax[1],
      bboxMax[2],
      viewProjectionMatrix
    );
  } catch (error) {
    console.error("Failed to check frustum visibility:", error);
    return true; // In caso di errore, presumi che l'oggetto sia visibile
  }
}
