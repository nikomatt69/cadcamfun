// WASM Module Optimizer for CAD/CAM operations
// Enhanced version with proper npm package integration

import init, { CADCAMOptimizer } from "cad-cam-optimizer";

// Type definitions for WASM module
interface WasmGCodePoint {
  x: number;
  y: number;
  z: number;
  feed_rate?: number;
  is_rapid: boolean;
  is_arc: boolean;
  line_number: number;
  command: string;
}

interface WasmMeshData {
  vertices: Float32Array;
  indices: Uint32Array;
  normals?: Float32Array;
}

let wasmModule: any = null;
let wasmOptimizer: CADCAMOptimizer | null = null;
let isInitialized = false;
let isLoading = false;
let isThreadingSupported = false;

/**
 * Check if WASM threading is supported in the current environment
 */
function checkThreadingSupport(): boolean {
  try {
    // Check if SharedArrayBuffer is available (required for threading)
    if (typeof SharedArrayBuffer === "undefined") {
      if (process.env.NODE_ENV === "development") {
        console.log("🔄 SharedArrayBuffer not available - threading disabled");
      }
      return false;
    }

    // Check if Atomics is available
    if (typeof Atomics === "undefined") {
      if (process.env.NODE_ENV === "development") {
        console.log("🔄 Atomics not available - threading disabled");
      }
      return false;
    }

    // Check COEP/COOP headers (required for SharedArrayBuffer)
    if (typeof window !== "undefined") {
      try {
        new SharedArrayBuffer(1);
        console.log("✅ Threading support detected");
        return true;
      } catch (e) {
        console.log("🔄 SharedArrayBuffer blocked - threading disabled");
        return false;
      }
    }

    return false;
  } catch (error) {
    console.log("🔄 Threading check failed - threading disabled");
    return false;
  }
}

/**
 * Inizializza il modulo WASM ottimizzato
 */
export async function initWasmOptimizer(): Promise<void> {
  if (isInitialized) return;
  if (isLoading) {
    // Wait for ongoing initialization
    while (isLoading && !isInitialized) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return;
  }

  isLoading = true;

  try {
    // Browser environment check
    if (typeof window === "undefined") {
      throw new Error("WASM initialization only supported in browser environment");
    }

    // Check threading support first
    isThreadingSupported = checkThreadingSupport();

    if (process.env.NODE_ENV === "development") {
      console.log("🔄 Initializing WASM from npm package...");
    }

    // Initialize WASM using the npm package
    wasmModule = await init();
    wasmOptimizer = new CADCAMOptimizer();
    isInitialized = true;
    isLoading = false;

    console.log("✅ Enhanced WASM optimizer initialized successfully from npm package");
    if (isThreadingSupported) {
      console.log("🧵 Threading support enabled");
    } else {
      console.log("⚡ Single-threaded mode enabled");
    }
  } catch (error) {
    isLoading = false;
    console.error("❌ Failed to initialize enhanced WASM optimizer:", error);

    // Try to detect specific threading-related errors
    if (error instanceof Error && error.message.includes("workerHelpers")) {
      console.warn("⚠️ Threading features not available - will use single-threaded fallback");

      // Try to initialize without threading features
      try {
        console.log("🔄 Attempting fallback initialization...");
        wasmModule = await init();
        wasmOptimizer = new CADCAMOptimizer();
        isInitialized = true;
        isThreadingSupported = false;
        console.log("✅ WASM optimizer initialized in fallback mode");
      } catch (fallbackError) {
        console.error("❌ Fallback initialization also failed:", fallbackError);
      }
    } else {
      console.warn("⚠️ WASM optimization will not be available");
    }
    // Don't throw error to allow fallback to non-WASM operations
  }
}

/**
 * Get current WASM status for debugging
 */
export function getWasmStatus() {
  return {
    isInitialized,
    isLoading,
    isThreadingSupported,
    hasOptimizer: !!wasmOptimizer
  };
}

/**
 * Interfaccia per mesh data compatibile con Three.js
 */
export interface MeshDataInterface {
  vertices: Float32Array;
  indices: Uint32Array;
  normals?: Float32Array;
}

/**
 * Interfaccia per G-Code point
 */
export interface GCodePointInterface {
  x: number;
  y: number;
  z: number;
  feedRate?: number;
  isRapid: boolean;
  isArc: boolean;
  lineNumber: number;
  command: string;
}

/**
 * Ottimizza una mesh Three.js usando WASM
 */
export async function optimizeMesh(
  vertices: Float32Array,
  indices: Uint32Array,
  reductionFactor: number
): Promise<MeshDataInterface> {
  if (!isInitialized) await initWasmOptimizer();
  if (!wasmOptimizer) {
    console.warn("⚠️ WASM optimizer not available, returning original mesh");
    return { vertices, indices };
  }

  try {
    const result = wasmOptimizer.optimize_mesh(vertices, indices, reductionFactor);

    return {
      vertices: result.vertices,
      indices: result.indices,
      normals: result.normals
    };
  } catch (error) {
    console.error("Mesh optimization failed, returning original mesh:", error);
    return { vertices, indices };
  }
}

/**
 * Esegue operazioni CSG accelerate
 */
export async function performCSGOperation(
  operation: "union" | "subtract" | "intersect",
  meshA: MeshDataInterface,
  meshB: MeshDataInterface
): Promise<MeshDataInterface> {
  if (!isInitialized) await initWasmOptimizer();
  if (!wasmOptimizer) {
    console.warn(`⚠️ WASM CSG not available, returning meshA for ${operation}`);
    return meshA;
  }

  try {
    const result = wasmOptimizer.csg_operation(operation, meshA.vertices, meshA.indices, meshB.vertices, meshB.indices);

    return {
      vertices: result.vertices,
      indices: result.indices,
      normals: result.normals
    };
  } catch (error) {
    console.error(`CSG ${operation} failed, returning meshA:`, error);
    return meshA;
  }
}

/**
 * Calcola normali ottimizzate
 */
export async function calculateNormals(vertices: Float32Array, indices: Uint32Array): Promise<Float32Array> {
  if (!isInitialized) await initWasmOptimizer();
  if (!wasmOptimizer) {
    console.warn("⚠️ WASM normals calculation not available");
    return new Float32Array(vertices.length); // Return zeros as fallback
  }

  try {
    return wasmOptimizer.calculate_normals(vertices, indices);
  } catch (error) {
    console.error("Normal calculation failed:", error);
    return new Float32Array(vertices.length); // Return zeros as fallback
  }
}

/**
 * Batch processing di geometrie
 */
export async function batchGeometries(
  geometries: Array<{ vertices: Float32Array; indices: Uint32Array }>
): Promise<MeshDataInterface> {
  if (!isInitialized) await initWasmOptimizer();
  if (!wasmOptimizer) {
    console.warn("⚠️ WASM batch processing not available, returning first geometry");
    return geometries[0] || { vertices: new Float32Array(), indices: new Uint32Array() };
  }

  try {
    const result = wasmOptimizer.batch_geometries(geometries);

    return {
      vertices: result.vertices,
      indices: result.indices,
      normals: result.normals
    };
  } catch (error) {
    console.error("Geometry batching failed:", error);
    return geometries[0] || { vertices: new Float32Array(), indices: new Uint32Array() };
  }
}

/**
 * Parser veloce per G-Code
 */
export async function parseGCode(gcode: string): Promise<GCodePointInterface[]> {
  if (!isInitialized) await initWasmOptimizer();
  if (!wasmOptimizer) {
    console.warn("⚠️ WASM G-Code parsing not available, returning empty array");
    return [];
  }

  try {
    const points = wasmOptimizer.parse_gcode(gcode);
    return points.map((p: WasmGCodePoint) => ({
      x: p.x,
      y: p.y,
      z: p.z,
      feedRate: p.feed_rate,
      isRapid: p.is_rapid,
      isArc: p.is_arc,
      lineNumber: p.line_number,
      command: p.command
    }));
  } catch (error) {
    console.error("G-Code parsing failed:", error);
    return [];
  }
}

/**
 * Ottimizza un percorso toolpath
 */
export async function optimizeToolpath(points: GCodePointInterface[]): Promise<GCodePointInterface[]> {
  if (!isInitialized) await initWasmOptimizer();
  if (!wasmOptimizer) {
    console.warn("⚠️ WASM toolpath optimization not available, returning original points");
    return points;
  }

  try {
    const optimized = wasmOptimizer.optimize_toolpath(points);
    return optimized.map((p: WasmGCodePoint) => ({
      x: p.x,
      y: p.y,
      z: p.z,
      feedRate: p.feed_rate,
      isRapid: p.is_rapid,
      isArc: p.is_arc,
      lineNumber: p.line_number,
      command: p.command
    }));
  } catch (error) {
    console.error("Toolpath optimization failed:", error);
    return points;
  }
}

/**
 * Esegue frustum culling
 */
export async function frustumCull(
  viewProjectionMatrix: Float32Array,
  boundingBoxes: Array<{ min: [number, number, number]; max: [number, number, number] }>
): Promise<boolean[]> {
  if (!isInitialized) await initWasmOptimizer();
  if (!wasmOptimizer) {
    console.warn("⚠️ WASM frustum culling not available, returning all visible");
    return new Array(boundingBoxes.length).fill(true);
  }

  try {
    const result = wasmOptimizer.frustum_cull(viewProjectionMatrix, boundingBoxes);
    return Array.from(result);
  } catch (error) {
    console.error("Frustum culling failed:", error);
    return new Array(boundingBoxes.length).fill(true);
  }
}

/**
 * Calcola i livelli LOD
 */
export async function calculateLODLevels(cameraDistance: number, objectSizes: Float32Array): Promise<Uint8Array> {
  if (!isInitialized) await initWasmOptimizer();
  if (!wasmOptimizer) {
    console.warn("⚠️ WASM LOD calculation not available, returning max LOD");
    return new Uint8Array(objectSizes.length).fill(3); // Max LOD level
  }

  try {
    return wasmOptimizer.calculate_lod_levels(cameraDistance, objectSizes);
  } catch (error) {
    console.error("LOD calculation failed:", error);
    return new Uint8Array(objectSizes.length).fill(3); // Max LOD level
  }
}

/**
 * Crea instanze per rendering ottimizzato
 */
export async function createInstances(
  geometries: Array<{
    vertices: Float32Array;
    indices: Uint32Array;
    matrix: Float32Array;
  }>
): Promise<{
  baseGeometry: MeshDataInterface;
  instanceMatrices: Float32Array[];
  instanceCount: number;
}> {
  if (!isInitialized) await initWasmOptimizer();
  if (!wasmOptimizer) {
    console.warn("⚠️ WASM instancing not available, returning first geometry");
    const firstGeom = geometries[0];
    return {
      baseGeometry: {
        vertices: firstGeom?.vertices || new Float32Array(),
        indices: firstGeom?.indices || new Uint32Array()
      },
      instanceMatrices: geometries.map(g => g.matrix),
      instanceCount: geometries.length
    };
  }

  try {
    const result = wasmOptimizer.create_instances(geometries);

    return {
      baseGeometry: {
        vertices: result.base_geometry.vertices,
        indices: result.base_geometry.indices,
        normals: result.base_geometry.normals
      },
      instanceMatrices: result.instance_matrices,
      instanceCount: result.instance_count
    };
  } catch (error) {
    console.error("Instance creation failed:", error);
    const firstGeom = geometries[0];
    return {
      baseGeometry: {
        vertices: firstGeom?.vertices || new Float32Array(),
        indices: firstGeom?.indices || new Uint32Array()
      },
      instanceMatrices: geometries.map(g => g.matrix),
      instanceCount: geometries.length
    };
  }
}

/**
 * Calcola snap points ottimizzati
 */
export async function calculateSnapPoints(vertices: Float32Array, threshold: number): Promise<Float32Array> {
  if (!isInitialized) await initWasmOptimizer();
  if (!wasmOptimizer) {
    console.warn("⚠️ WASM snap points calculation not available");
    return new Float32Array();
  }

  try {
    return wasmOptimizer.calculate_snap_points(vertices, threshold);
  } catch (error) {
    console.error("Snap points calculation failed:", error);
    return new Float32Array();
  }
}

/**
 * Rileva caratteristiche geometriche
 */
export async function detectFeatures(
  vertices: Float32Array,
  indices: Uint32Array
): Promise<{
  vertices: Float32Array;
  edges: Float32Array;
  faceCenters: Float32Array;
}> {
  if (!isInitialized) await initWasmOptimizer();
  if (!wasmOptimizer) {
    console.warn("⚠️ WASM feature detection not available");
    return {
      vertices: new Float32Array(),
      edges: new Float32Array(),
      faceCenters: new Float32Array()
    };
  }

  try {
    const result = wasmOptimizer.detect_features(vertices, indices);

    return {
      vertices: result.vertices,
      edges: result.edges,
      faceCenters: result.face_centers
    };
  } catch (error) {
    console.error("Feature detection failed:", error);
    return {
      vertices: new Float32Array(),
      edges: new Float32Array(),
      faceCenters: new Float32Array()
    };
  }
}

/**
 * Classe wrapper per il WASM optimizer
 */
export class WasmOptimizer {
  async init() {
    await initWasmOptimizer();
  }

  async parseGCode(gcode: string): Promise<GCodePointInterface[]> {
    return parseGCode(gcode);
  }

  async optimizeToolpath(points: GCodePointInterface[]): Promise<GCodePointInterface[]> {
    return optimizeToolpath(points);
  }

  async calculateNormals(vertices: Float32Array, indices: Uint32Array): Promise<Float32Array> {
    return calculateNormals(vertices, indices);
  }

  async expandFixedCycles(gcode: string): Promise<GCodePointInterface[]> {
    // For now, delegate to regular parsing - could be enhanced in the future
    return parseGCode(gcode);
  }
}

// Export per compatibilità
export { initWasmOptimizer as initWasm };
