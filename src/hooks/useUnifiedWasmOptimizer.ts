// Unified WASM Optimizer Hook
// Combines the best features from both legacy and enhanced WASM systems
// Eliminates conflicts and provides a single source of truth

import { useState, useEffect, useCallback, useRef } from "react";
import * as THREE from "three";

// Enhanced WASM imports (prioritized)
import {
  initWasmOptimizer as initEnhanced,
  optimizeMesh,
  performCSGOperation,
  parseGCode,
  optimizeToolpath,
  calculateNormals,
  frustumCull,
  calculateLODLevels,
  getWasmStatus,
  MeshDataInterface,
  GCodePointInterface
} from "@/src/lib/wasm/enhanced/wasmOptimizer";

// Legacy WASM imports (as fallback)
import {
  initWasmOptimizer as initLegacy,
  configureOptimizer,
  getPerformanceStats,
  updatePerformanceStats,
  calculateOptimalSettings,
  isOptimizerInitialized
} from "@/src/lib/wasm/wasmBridge";
import { PerformanceSettings, PerformanceStats } from "../types/typeswasm";

interface UnifiedWasmState {
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  enhancedAvailable: boolean;
  legacyAvailable: boolean;
  activeSystem: "enhanced" | "legacy" | "none";
}

interface UnifiedWasmOptions {
  preferEnhanced?: boolean;
  enablePerformanceMonitoring?: boolean;
  enableLOD?: boolean;
  enableCSG?: boolean;
  enableToolpathOptimization?: boolean;
  targetFps?: number;
  adaptiveResolution?: boolean;
  enableFrustumCulling?: boolean;
  enableGeometryOptimization?: boolean;
  enableInstancing?: boolean;
  memoryManagement?: boolean;
}

interface UseUnifiedWasmOptimizerResult {
  // State
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  activeSystem: "enhanced" | "legacy" | "none";
  enhancedAvailable: boolean;
  legacyAvailable: boolean;
  stats: PerformanceStats;
  settings: PerformanceSettings;

  // Core Methods
  initialize: () => Promise<void>;

  // Enhanced Features (CAD/CAM specific)
  optimizeMesh: (vertices: Float32Array, indices: Uint32Array, reductionFactor: number) => Promise<MeshDataInterface>;
  performCSGOperation: (
    operation: "union" | "subtract" | "intersect",
    meshA: MeshDataInterface,
    meshB: MeshDataInterface
  ) => Promise<MeshDataInterface>;
  parseGCode: (gcode: string) => Promise<GCodePointInterface[]>;
  optimizeToolpath: (points: GCodePointInterface[]) => Promise<GCodePointInterface[]>;
  calculateNormals: (vertices: Float32Array, indices: Uint32Array) => Promise<Float32Array>;
  frustumCull: (
    viewProjectionMatrix: Float32Array,
    boundingBoxes: Array<{ min: [number, number, number]; max: [number, number, number] }>
  ) => Promise<boolean[]>;
  calculateLODLevels: (cameraDistance: number, objectSizes: Float32Array) => Promise<Uint8Array>;

  // Performance Features (from legacy system)
  updatePerformanceStats: (fps: number, frameTime: number, triangles: number, drawCalls: number) => Promise<void>;
  calculateOptimalSettings: () => Promise<PerformanceSettings>;
  applySettings: (settings: PerformanceSettings) => Promise<void>;

  // Utility
  getDebugInfo: () => any;
}

const DEFAULT_SETTINGS: PerformanceSettings = {
  targetFps: 60,
  resolutionScale: 1.0,
  lodBias: 1.0,
  maxTriangles: 1000000,
  frustumCulling: true
};

const DEFAULT_STATS: PerformanceStats = {
  fps: 0,
  frameTime: 0,
  triangleCount: 0,
  drawCalls: 0,
  memoryUsage: 0,
  gpuUsage: 0
};

export function useUnifiedWasmOptimizer(
  sceneRef?: React.RefObject<THREE.Scene | null>,
  cameraRef?: React.RefObject<THREE.Camera | null>,
  rendererRef?: React.RefObject<THREE.WebGLRenderer | null>,
  options: UnifiedWasmOptions = {}
): UseUnifiedWasmOptimizerResult {
  const {
    preferEnhanced = true,
    enablePerformanceMonitoring = true,
    targetFps = 60,
    adaptiveResolution = true,
    enableLOD = true,
    enableCSG = true,
    enableToolpathOptimization = true,
    enableFrustumCulling = true,
    enableGeometryOptimization = true,
    enableInstancing = true,
    memoryManagement = true
  } = options;

  const [state, setState] = useState<UnifiedWasmState>({
    isLoading: false,
    isInitialized: false,
    error: null,
    enhancedAvailable: false,
    legacyAvailable: false,
    activeSystem: "none"
  });

  const [stats, setStats] = useState<PerformanceStats>(DEFAULT_STATS);
  const [settings, setSettings] = useState<PerformanceSettings>({
    ...DEFAULT_SETTINGS,
    targetFps
  });

  // Performance monitoring
  const frameCount = useRef(0);
  const lastFrameTime = useRef(performance.now());
  const frameTimeHistory = useRef<number[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  // Unified initialization that tries enhanced first, falls back to legacy
  const initialize = useCallback(async () => {
    if (state.isInitialized || state.isLoading) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      let enhancedSuccess = false;
      let legacySuccess = false;

      // Try enhanced system first (if preferred)
      if (preferEnhanced) {
        try {
          if (process.env.NODE_ENV === "development") {
            console.log("🔄 Attempting enhanced WASM initialization...");
          }
          await initEnhanced();
          const status = getWasmStatus();
          if (status.isInitialized) {
            enhancedSuccess = true;
            console.log("✅ Enhanced WASM system initialized successfully");
          }
        } catch (error) {
          console.warn("⚠️ Enhanced WASM initialization failed, trying legacy...", error);
        }
      }

      // Try legacy system if enhanced failed or not preferred
      if (!enhancedSuccess) {
        try {
          if (process.env.NODE_ENV === "development") {
            console.log("🔄 Attempting legacy WASM initialization...");
          }
          await initLegacy();
          if (isOptimizerInitialized()) {
            legacySuccess = true;
            console.log("✅ Legacy WASM system initialized successfully");

            // Configure legacy system
            await configureOptimizer({
              ...DEFAULT_SETTINGS,
              targetFps
            });
          }
        } catch (error) {
          console.warn("⚠️ Legacy WASM initialization failed", error);
        }
      }

      // Update state based on what succeeded
      setState(prev => ({
        ...prev,
        isLoading: false,
        isInitialized: enhancedSuccess || legacySuccess,
        enhancedAvailable: enhancedSuccess,
        legacyAvailable: legacySuccess,
        activeSystem: enhancedSuccess ? "enhanced" : legacySuccess ? "legacy" : "none",
        error: !enhancedSuccess && !legacySuccess ? "Both WASM systems failed to initialize" : null
      }));

      if (!enhancedSuccess && !legacySuccess) {
        throw new Error("No WASM system could be initialized");
      }
    } catch (error) {
      console.error("❌ Unified WASM initialization failed:", error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Unknown error"
      }));
    }
  }, [state.isInitialized, state.isLoading, preferEnhanced, targetFps]);

  // Auto-initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Performance monitoring loop
  useEffect(() => {
    if (!enablePerformanceMonitoring || !state.isInitialized) return;

    const updateStats = async () => {
      try {
        // Calculate current scene stats
        let triangleCount = 0;
        let drawCalls = 0;

        if (sceneRef?.current && rendererRef?.current) {
          sceneRef.current.traverse(object => {
            if (object instanceof THREE.Mesh) {
              const geometry = object.geometry;
              if (geometry.index) {
                triangleCount += geometry.index.count / 3;
              } else if (geometry.attributes.position) {
                triangleCount += geometry.attributes.position.count / 3;
              }
              if (object.visible) drawCalls++;
            }
          });

          // Calculate FPS
          const now = performance.now();
          const deltaTime = now - lastFrameTime.current;
          lastFrameTime.current = now;

          frameCount.current++;
          frameTimeHistory.current.push(deltaTime);

          if (frameTimeHistory.current.length > 60) {
            frameTimeHistory.current.shift();
          }

          const avgFrameTime =
            frameTimeHistory.current.reduce((sum, time) => sum + time, 0) / frameTimeHistory.current.length;
          const fps = 1000 / avgFrameTime;

          const currentStats = {
            fps,
            frameTime: avgFrameTime,
            triangleCount: Math.floor(triangleCount),
            drawCalls,
            memoryUsage: (typeof window !== 'undefined' && window.performance?.memory?.usedJSHeapSize) || 0,
            gpuUsage: rendererRef.current.info.memory.textures + rendererRef.current.info.memory.geometries
          };

          // Update stats in WASM module if available
          if (state.legacyAvailable) {
            await updatePerformanceStats(fps, avgFrameTime, triangleCount, drawCalls);
            const wasmStats = await getPerformanceStats();
            setStats(wasmStats);
          } else {
            setStats(currentStats);
          }
        }

        animationFrameRef.current = requestAnimationFrame(updateStats);
      } catch (error) {
        console.error("Error updating performance stats:", error);
      }
    };

    updateStats();

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [enablePerformanceMonitoring, state.isInitialized, state.legacyAvailable, sceneRef, rendererRef]);

  // Wrapper methods that ensure initialization and use the best available system
  const wrappedOptimizeMesh = useCallback(
    async (vertices: Float32Array, indices: Uint32Array, reductionFactor: number): Promise<MeshDataInterface> => {
      if (!state.isInitialized) await initialize();

      if (state.enhancedAvailable) {
        return optimizeMesh(vertices, indices, reductionFactor);
      } else {
        console.warn("⚠️ Enhanced mesh optimization not available, returning original mesh");
        return { vertices, indices };
      }
    },
    [state.isInitialized, state.enhancedAvailable, initialize]
  );

  const wrappedPerformCSG = useCallback(
    async (
      operation: "union" | "subtract" | "intersect",
      meshA: MeshDataInterface,
      meshB: MeshDataInterface
    ): Promise<MeshDataInterface> => {
      if (!state.isInitialized) await initialize();

      if (state.enhancedAvailable) {
        return performCSGOperation(operation, meshA, meshB);
      } else {
        console.warn("⚠️ Enhanced CSG operations not available, returning first mesh");
        return meshA;
      }
    },
    [state.isInitialized, state.enhancedAvailable, initialize]
  );

  const wrappedParseGCode = useCallback(
    async (gcode: string): Promise<GCodePointInterface[]> => {
      if (!state.isInitialized) await initialize();

      if (state.enhancedAvailable) {
        return parseGCode(gcode);
      } else {
        console.warn("⚠️ Enhanced G-Code parsing not available, returning empty array");
        return [];
      }
    },
    [state.isInitialized, state.enhancedAvailable, initialize]
  );

  const wrappedOptimizeToolpath = useCallback(
    async (points: GCodePointInterface[]): Promise<GCodePointInterface[]> => {
      if (!state.isInitialized) await initialize();

      if (state.enhancedAvailable) {
        return optimizeToolpath(points);
      } else {
        console.warn("⚠️ Enhanced toolpath optimization not available, returning original points");
        return points;
      }
    },
    [state.isInitialized, state.enhancedAvailable, initialize]
  );

  const wrappedCalculateNormals = useCallback(
    async (vertices: Float32Array, indices: Uint32Array): Promise<Float32Array> => {
      if (!state.isInitialized) await initialize();

      if (state.enhancedAvailable) {
        return calculateNormals(vertices, indices);
      } else {
        console.warn("⚠️ Enhanced normal calculation not available, using Three.js fallback");
        // Fallback to Three.js normal calculation
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeVertexNormals();
        return geometry.attributes.normal.array as Float32Array;
      }
    },
    [state.isInitialized, state.enhancedAvailable, initialize]
  );

  const wrappedFrustumCull = useCallback(
    async (
      viewProjectionMatrix: Float32Array,
      boundingBoxes: Array<{ min: [number, number, number]; max: [number, number, number] }>
    ): Promise<boolean[]> => {
      if (!state.isInitialized) await initialize();

      if (state.enhancedAvailable) {
        return frustumCull(viewProjectionMatrix, boundingBoxes);
      } else {
        console.warn("⚠️ Enhanced frustum culling not available, returning all visible");
        return boundingBoxes.map(() => true);
      }
    },
    [state.isInitialized, state.enhancedAvailable, initialize]
  );

  const wrappedCalculateLOD = useCallback(
    async (cameraDistance: number, objectSizes: Float32Array): Promise<Uint8Array> => {
      if (!state.isInitialized) await initialize();

      if (state.enhancedAvailable) {
        return calculateLODLevels(cameraDistance, objectSizes);
      } else {
        console.warn("⚠️ Enhanced LOD calculation not available, using simple fallback");
        // Simple fallback LOD calculation
        const lodLevels = new Uint8Array(objectSizes.length);
        for (let i = 0; i < objectSizes.length; i++) {
          if (cameraDistance < 50)
            lodLevels[i] = 0; // High detail
          else if (cameraDistance < 200)
            lodLevels[i] = 1; // Medium detail
          else lodLevels[i] = 2; // Low detail
        }
        return lodLevels;
      }
    },
    [state.isInitialized, state.enhancedAvailable, initialize]
  );

  const wrappedUpdatePerformanceStats = useCallback(
    async (fps: number, frameTime: number, triangles: number, drawCalls: number): Promise<void> => {
      if (!state.isInitialized) await initialize();

      if (state.legacyAvailable) {
        await updatePerformanceStats(fps, frameTime, triangles, drawCalls);
      } else {
        // Update local stats if WASM not available
        setStats(prev => ({
          ...prev,
          fps,
          frameTime,
          triangleCount: triangles,
          drawCalls
        }));
      }
    },
    [state.isInitialized, state.legacyAvailable, initialize]
  );

  const wrappedCalculateOptimalSettings = useCallback(async (): Promise<PerformanceSettings> => {
    if (!state.isInitialized) await initialize();

    if (state.legacyAvailable) {
      return calculateOptimalSettings();
    } else {
      console.warn("⚠️ Optimal settings calculation not available, returning current settings");
      return settings;
    }
  }, [state.isInitialized, state.legacyAvailable, settings, initialize]);

  const wrappedApplySettings = useCallback(
    async (newSettings: PerformanceSettings): Promise<void> => {
      if (!state.isInitialized) await initialize();

      if (state.legacyAvailable) {
        await configureOptimizer(newSettings);
      }

      setSettings(newSettings);

      // Apply resolution scale if renderer is available
      if (rendererRef?.current && adaptiveResolution) {
        rendererRef.current.setPixelRatio(window.devicePixelRatio * newSettings.resolutionScale);
      }
    },
    [state.isInitialized, state.legacyAvailable, adaptiveResolution, rendererRef, initialize]
  );

  const getDebugInfo = useCallback(() => {
    return {
      state,
      stats,
      settings,
      wasmStatus: state.enhancedAvailable ? getWasmStatus() : null,
      options: {
        preferEnhanced,
        enablePerformanceMonitoring,
        enableLOD,
        enableCSG,
        enableToolpathOptimization,
        targetFps,
        adaptiveResolution,
        enableFrustumCulling,
        enableGeometryOptimization,
        enableInstancing,
        memoryManagement
      }
    };
  }, [
    state,
    stats,
    settings,
    preferEnhanced,
    enablePerformanceMonitoring,
    enableLOD,
    enableCSG,
    enableToolpathOptimization,
    targetFps,
    adaptiveResolution,
    enableFrustumCulling,
    enableGeometryOptimization,
    enableInstancing,
    memoryManagement
  ]);

  return {
    // State
    isLoading: state.isLoading,
    isInitialized: state.isInitialized,
    error: state.error,
    activeSystem: state.activeSystem,
    enhancedAvailable: state.enhancedAvailable,
    legacyAvailable: state.legacyAvailable,
    stats,
    settings,

    // Methods
    initialize,
    optimizeMesh: wrappedOptimizeMesh,
    performCSGOperation: wrappedPerformCSG,
    parseGCode: wrappedParseGCode,
    optimizeToolpath: wrappedOptimizeToolpath,
    calculateNormals: wrappedCalculateNormals,
    frustumCull: wrappedFrustumCull,
    calculateLODLevels: wrappedCalculateLOD,
    updatePerformanceStats: wrappedUpdatePerformanceStats,
    calculateOptimalSettings: wrappedCalculateOptimalSettings,
    applySettings: wrappedApplySettings,
    getDebugInfo
  };
}
