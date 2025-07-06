import { useState, useEffect, useCallback } from "react";
import {
  initWasmOptimizer,
  optimizeMesh,
  performCSGOperation,
  parseGCode,
  optimizeToolpath,
  calculateNormals,
  frustumCull,
  calculateLODLevels,
  MeshDataInterface,
  GCodePointInterface
} from "@/src/lib/wasm/enhanced/wasmOptimizer";

interface WasmOptimizerState {
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
}

export function useWasmOptimizer() {
  const [state, setState] = useState<WasmOptimizerState>({
    isLoading: false,
    isInitialized: false,
    error: null
  });

  const initialize = useCallback(async () => {
    if (state.isInitialized || state.isLoading) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      await initWasmOptimizer();
      setState(prev => ({
        ...prev,
        isLoading: false,
        isInitialized: true
      }));
      console.log("✅ WASM Optimizer initialized via hook");
    } catch (error) {
      console.error("❌ Failed to initialize WASM Optimizer:", error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Unknown error"
      }));
    }
  }, [state.isInitialized, state.isLoading]);

  // Auto-initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Wrapper methods that ensure initialization
  const wrappedOptimizeMesh = useCallback(
    async (vertices: Float32Array, indices: Uint32Array, reductionFactor: number): Promise<MeshDataInterface> => {
      if (!state.isInitialized) {
        await initialize();
      }
      return optimizeMesh(vertices, indices, reductionFactor);
    },
    [state.isInitialized, initialize]
  );

  const wrappedPerformCSG = useCallback(
    async (
      operation: "union" | "subtract" | "intersect",
      meshA: MeshDataInterface,
      meshB: MeshDataInterface
    ): Promise<MeshDataInterface> => {
      if (!state.isInitialized) {
        await initialize();
      }
      return performCSGOperation(operation, meshA, meshB);
    },
    [state.isInitialized, initialize]
  );

  const wrappedParseGCode = useCallback(
    async (gcode: string): Promise<GCodePointInterface[]> => {
      if (!state.isInitialized) {
        await initialize();
      }
      return parseGCode(gcode);
    },
    [state.isInitialized, initialize]
  );

  const wrappedOptimizeToolpath = useCallback(
    async (points: GCodePointInterface[]): Promise<GCodePointInterface[]> => {
      if (!state.isInitialized) {
        await initialize();
      }
      return optimizeToolpath(points);
    },
    [state.isInitialized, initialize]
  );

  const wrappedCalculateNormals = useCallback(
    async (vertices: Float32Array, indices: Uint32Array): Promise<Float32Array> => {
      if (!state.isInitialized) {
        await initialize();
      }
      return calculateNormals(vertices, indices);
    },
    [state.isInitialized, initialize]
  );

  const wrappedFrustumCull = useCallback(
    async (
      viewProjectionMatrix: Float32Array,
      boundingBoxes: Array<{ min: [number, number, number]; max: [number, number, number] }>
    ): Promise<boolean[]> => {
      if (!state.isInitialized) {
        await initialize();
      }
      return frustumCull(viewProjectionMatrix, boundingBoxes);
    },
    [state.isInitialized, initialize]
  );

  const wrappedCalculateLOD = useCallback(
    async (cameraDistance: number, objectSizes: Float32Array): Promise<Uint8Array> => {
      if (!state.isInitialized) {
        await initialize();
      }
      return calculateLODLevels(cameraDistance, objectSizes);
    },
    [state.isInitialized, initialize]
  );

  return {
    // State
    isLoading: state.isLoading,
    isInitialized: state.isInitialized,
    error: state.error,

    // Methods
    initialize,
    optimizeMesh: wrappedOptimizeMesh,
    performCSGOperation: wrappedPerformCSG,
    parseGCode: wrappedParseGCode,
    optimizeToolpath: wrappedOptimizeToolpath,
    calculateNormals: wrappedCalculateNormals,
    frustumCull: wrappedFrustumCull,
    calculateLODLevels: wrappedCalculateLOD
  };
}
