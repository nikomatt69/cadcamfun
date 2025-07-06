// src/components/cad/OptimizedCADCanvas.tsx
import React, { useEffect, useRef, useState } from "react";
import CADCanvas from "./CADCanvas";
import useThreeJsOptimizer from "../../hooks/useThreeJsOptimizer"; // Restore this hook
import { useLOD } from "src/hooks/useLodWasm"; // Keep the LOD hook
import { useWasmConfig } from "@/src/hooks/wasm/useWasmConfig"; // 🚀 NEW: Centralized WASM config
import { useCADStore } from "src/store/cadStore";
import { createManagedRenderer } from "src/lib/webgl/webglContextManager";
import * as THREE from "three";

interface OptimizedCADCanvasProps {
  width?: string | number;
  height?: string | number;
  previewComponent?: string | null;
  onComponentPlaced?: (component: string, position: { x: number; y: number; z: number }) => void;
  allowDragDrop?: boolean;

  // Optimization options (will be split between hooks)
  optimizationOptions?: {
    targetFps?: number; // For useThreeJsOptimizer
    adaptiveResolution?: boolean; // For useThreeJsOptimizer
    enableLod?: boolean; // Controls useLOD activation
    enableFrustumCulling?: boolean; // Note: Frustum culling is in useLOD
    enableGeometryOptimization?: boolean; // Note: Geometry optimization is useLOD
    enableInstancing?: boolean; // For useThreeJsOptimizer
    memoryManagement?: boolean; // For useThreeJsOptimizer (disposeUnused is separate in useLOD)
    monitorPerformance?: boolean; // General flag
    // LOD Specific Options
    highDetailThreshold?: number;
    mediumDetailThreshold?: number;
    lowDetailReduction?: number;
    mediumDetailReduction?: number;
    updateInterval?: number; // LOD update interval
    optimizeTextures?: boolean;
    disposeUnused?: boolean; // LOD specific disposal
    frustumMargin?: number;
  };
}

/**
 * Optimized CADCanvas using both useThreeJsOptimizer and useLOD (WASM).
 */
const OptimizedCADCanvas: React.FC<OptimizedCADCanvasProps> = ({
  width = "100%",
  height = "100%",
  previewComponent = null,
  onComponentPlaced,
  allowDragDrop = true,
  optimizationOptions = {}
}) => {
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cadCanvasRef = useRef<any>(null);
  const [cadElements, setCadElements] = useState<any[]>([]);

  // 🚀 MEMORY: Geometry cache for performance optimization
  const geometryCache = useRef(new Map<string, THREE.BufferGeometry>());
  const materialCache = useRef(new Map<string, THREE.Material>());

  // 🚀 NEW: Use centralized WASM configuration for optimal performance
  const { config: wasmConfig, isLoading: configLoading, updateMetrics, getPerformanceScore } = useWasmConfig("cad");

  // --- Centralized Configuration Integration ---
  const mergedOptions = wasmConfig
    ? {
      // Use centralized WASM configuration as base
      targetFps: wasmConfig.targetFps,
      adaptiveResolution: wasmConfig.adaptiveResolution,
      enableLod: wasmConfig.enableLOD,
      enableFrustumCulling: wasmConfig.enableFrustumCulling,
      enableGeometryOptimization: wasmConfig.enableGeometryOptimization,
      enableInstancing: wasmConfig.enableInstancing,
      memoryManagement: wasmConfig.memoryManagement,
      monitorPerformance: wasmConfig.enablePerformanceMonitoring,

      // Map WASM config to component-specific options
      highDetailThreshold: wasmConfig.highDetailThreshold,
      mediumDetailThreshold: wasmConfig.mediumDetailThreshold,
      lowDetailReduction: wasmConfig.lowDetailReduction,
      mediumDetailReduction: wasmConfig.mediumDetailReduction,

      // Component-specific defaults (not in centralized config)
      updateInterval: 100,
      optimizeTextures: true,
      disposeUnused: true,
      frustumMargin: 1.2,

      // Apply component-specific overrides
      ...optimizationOptions
    }
    : {
      // Fallback configuration while WASM config is loading
      targetFps: 30,
      adaptiveResolution: true,
      enableLod: true,
      enableFrustumCulling: true,
      enableGeometryOptimization: false,
      enableInstancing: false,
      memoryManagement: true,
      monitorPerformance: false,
      highDetailThreshold: 200,
      mediumDetailThreshold: 500,
      lowDetailReduction: 0.2,
      mediumDetailReduction: 0.5,
      updateInterval: 100,
      optimizeTextures: true,
      disposeUnused: true,
      frustumMargin: 1.2,
      ...optimizationOptions
    };

  // --- Hook Setup ---

  // 1. useThreeJsOptimizer Hook (for general optimizations)
  const optimizerOptions = {
    targetFps: mergedOptions.targetFps,
    adaptiveResolution: mergedOptions.adaptiveResolution,
    // Pass flags for LOD/Frustum/Geometry opt, but the actual work is done by useLOD
    enableLod: mergedOptions.enableLod,
    enableFrustumCulling: mergedOptions.enableFrustumCulling,
    enableGeometryOptimization: mergedOptions.enableGeometryOptimization,
    enableInstancing: mergedOptions.enableInstancing,
    memoryManagement: mergedOptions.memoryManagement,
    monitorPerformance: mergedOptions.monitorPerformance
  };

  const {
    stats: optimizerStats,
    settings: optimizerSettings,
    isOptimizing,
    optimizeSceneNow
  } = useThreeJsOptimizer(sceneRef, cameraRef, rendererRef, optimizerOptions);

  // 2. useLOD Hook (for WASM-based Level of Detail) - Optimized for performance
  const lodOptions = {
    highDetailThreshold: mergedOptions.highDetailThreshold,
    mediumDetailThreshold: mergedOptions.mediumDetailThreshold,
    lowDetailReduction: mergedOptions.lowDetailReduction,
    mediumDetailReduction: mergedOptions.mediumDetailReduction,
    updateInterval: Math.max(50, mergedOptions.updateInterval), // Ensure minimum 50ms for performance
    optimizeTextures: mergedOptions.optimizeTextures,
    disposeUnused: mergedOptions.disposeUnused,
    frustumMargin: mergedOptions.frustumMargin
  };

  const { statistics: lodStats } = useLOD(
    sceneRef,
    cameraRef,
    mergedOptions.enableLod ? lodOptions : {} // Only pass options if LOD is enabled
  );

  // 🚀 PERFORMANCE: Dynamic LOD adjustment based on performance metrics
  useEffect(() => {
    if (!mergedOptions.enableLod || !wasmConfig) return;

    const adjustLODSettings = () => {
      const currentFps = optimizerStats.fps;
      const targetFps = wasmConfig.targetFps;
      const memoryUsage = performance.memory ? (performance as any).memory.usedJSHeapSize : 0;

      // If performance is poor, make LOD more aggressive
      if (currentFps < targetFps * 0.7) {
        // More aggressive LOD settings
        lodOptions.highDetailThreshold *= 0.8;
        lodOptions.mediumDetailThreshold *= 0.8;
        lodOptions.lowDetailReduction = Math.max(0.1, lodOptions.lowDetailReduction * 0.8);
        lodOptions.mediumDetailReduction = Math.max(0.2, lodOptions.mediumDetailReduction * 0.8);
        console.log("🔧 LOD: Aggressive settings applied for better performance");
      }

      // If memory usage is high, enable more aggressive disposal
      if (memoryUsage > 200 * 1024 * 1024) {
        // 200MB threshold
        lodOptions.disposeUnused = true;
        lodOptions.updateInterval = Math.max(50, lodOptions.updateInterval * 0.8);
        console.log("🧹 LOD: Memory optimization enabled");
      }
    };

    const lodAdjustmentInterval = setInterval(adjustLODSettings, 5000); // Every 5 seconds
    return () => clearInterval(lodAdjustmentInterval);
  }, [mergedOptions.enableLod, wasmConfig, optimizerStats.fps, lodOptions]);

  // --- Effects ---

  // Get references effect (Remains the same)
  useEffect(() => {
    if (cadCanvasRef.current) {
      const checkForReferences = () => {
        if (window.cadCanvasScene && window.cadCanvasCamera) {
          sceneRef.current = window.cadCanvasScene;
          cameraRef.current = window.cadCanvasCamera;

          const canvasElement = document.querySelector("canvas");
          if (canvasElement) {
            const contextAttributes =
              (canvasElement as any).__proto__.getContext.call(canvasElement, "webgl2") ||
              (canvasElement as any).__proto__.getContext.call(canvasElement, "webgl");

            if (contextAttributes) {
              rendererRef.current = (window as any).__THREEJS_RENDERER__ || null;
              if (!rendererRef.current) {
                console.warn("Renderer not found in global scope, attempting managed fallback.");
                try {
                  const extractedRenderer = createManagedRenderer({
                    contextId: "cadCanvas_fallback",
                    canvas: canvasElement,
                    preserveDrawingBuffer: true,
                    shared: true // CAD canvas can share context
                  });
                  rendererRef.current = extractedRenderer;
                } catch (e) {
                  console.error("Failed to create managed fallback renderer:", e);
                  // Last resort fallback
                  try {
                    const directRenderer = new THREE.WebGLRenderer({
                      canvas: canvasElement,
                      context: contextAttributes,
                      preserveDrawingBuffer: true
                    });
                    rendererRef.current = directRenderer;
                  } catch (e2) {
                    console.error("Failed to create direct fallback renderer:", e2);
                  }
                }
              }
              if (rendererRef.current) {
                console.log("Three.js references acquired for OptimizedCADCanvas");
              } else {
                console.error("Failed to acquire Renderer reference.");
              }
            }
          }
        } else {
          setTimeout(checkForReferences, 500);
        }
      };
      window.exposeCADCanvasAPI = true;
      checkForReferences();
    }
  }, [cadCanvasRef]);

  // 🚀 PERFORMANCE: Update metrics and trigger adaptive optimizations
  useEffect(() => {
    if (optimizerStats && updateMetrics) {
      // Report performance metrics to centralized system for adaptive adjustments
      updateMetrics({
        triangleCount: optimizerStats.triangleCount,
        drawCalls: optimizerStats.drawCalls,
        fps: optimizerStats.fps,
        memoryUsage: performance.memory ? (performance as any).memory.usedJSHeapSize : 0
      });

      // Trigger aggressive optimization if performance is poor
      const performanceScore = getPerformanceScore();
      if (performanceScore < 40 && !isOptimizing) {
        console.log("🔥 Performance critical - triggering aggressive optimization");
        optimizeSceneNow();
      }
    }
  }, [optimizerStats, updateMetrics, getPerformanceScore, isOptimizing, optimizeSceneNow]);

  // 🚀 MEMORY: Advanced memory management and cache optimization
  useEffect(() => {
    if (!wasmConfig?.memoryManagement) return;

    const memoryCleanupInterval = setInterval(() => {
      const now = Date.now();
      const maxCacheAge = 5 * 60 * 1000; // 5 minutes

      // Clean geometry cache
      Array.from(geometryCache.current.entries()).forEach(([key, geometry]) => {
        const lastUsed = geometry.userData.lastUsed || 0;
        if (now - lastUsed > maxCacheAge) {
          geometry.dispose();
          geometryCache.current.delete(key);
          console.log(`🧹 Disposed cached geometry: ${key}`);
        }
      });

      // Clean material cache
      Array.from(materialCache.current.entries()).forEach(([key, material]) => {
        const lastUsed = material.userData.lastUsed || 0;
        if (now - lastUsed > maxCacheAge) {
          material.dispose();
          materialCache.current.delete(key);
          console.log(`🧹 Disposed cached material: ${key}`);
        }
      });

      // Force garbage collection if available (Chrome DevTools)
      if (window.gc) {
        window.gc();
      }

      // Dispose unused geometries and materials in scene
      if (sceneRef.current) {
        const objectsToRemove: THREE.Object3D[] = [];

        sceneRef.current.traverse(object => {
          if (object instanceof THREE.Mesh) {
            // Mark usage for cache management
            if (object.geometry) {
              object.geometry.userData.lastUsed = now;
            }
            if (object.material) {
              if (Array.isArray(object.material)) {
                object.material.forEach(mat => {
                  mat.userData.lastUsed = now;
                });
              } else {
                object.material.userData.lastUsed = now;
              }
            }

            // Remove objects that are too far from camera (aggressive culling)
            if (cameraRef.current && object.position.distanceTo(cameraRef.current.position) > 1000) {
              objectsToRemove.push(object);
            }
          }
        });

        // Remove distant objects to save memory
        objectsToRemove.forEach(obj => {
          if (obj.parent) {
            obj.parent.remove(obj);
            // Dispose geometry and materials
            if (obj instanceof THREE.Mesh) {
              obj.geometry?.dispose();
              if (Array.isArray(obj.material)) {
                obj.material.forEach(mat => mat.dispose());
              } else {
                obj.material?.dispose();
              }
            }
          }
        });

        if (objectsToRemove.length > 0) {
          console.log(`🧹 Removed ${objectsToRemove.length} distant objects for memory optimization`);
        }
      }
    }, 10000); // Every 10 seconds

    return () => clearInterval(memoryCleanupInterval);
  }, [wasmConfig?.memoryManagement]);

  // Effect to re-run optimization when content changes significantly
  // optimizeSceneNow from useThreeJsOptimizer might trigger internal updates
  // including potentially interacting with LOD if designed that way.
  useEffect(() => {
    const handleContentChange = () => {
      console.log("[OptimizedCADCanvas] Content changed, calling optimizeSceneNow...");
      optimizeSceneNow(); // Trigger general optimizer
    };

    const { useElementsStore } = require("src/store/elementsStore");
    const unsubscribeElements = useElementsStore.subscribe((state: any, prevState: any) => {
      const currentLength = state.elements?.length ?? 0;
      const prevLength = prevState.elements?.length ?? 0;
      if (currentLength !== prevLength) {
        handleContentChange();
      }
    });

    const unsubscribeViewMode = useCADStore.subscribe((state, prevState) => {
      if (
        state.viewMode !== prevState.viewMode ||
        state.gridVisible !== prevState.gridVisible ||
        state.axisVisible !== prevState.axisVisible
      ) {
        handleContentChange();
      }
    });

    return () => {
      unsubscribeViewMode();
      unsubscribeElements();
    };
  }, [optimizeSceneNow]);

  // 🚀 CLEANUP: Dispose all resources on unmount for memory optimization
  useEffect(() => {
    return () => {
      // Clear all caches
      Array.from(geometryCache.current.values()).forEach(geometry => {
        geometry.dispose();
      });
      Array.from(materialCache.current.values()).forEach(material => {
        material.dispose();
      });
      geometryCache.current.clear();
      materialCache.current.clear();

      // Dispose scene resources
      if (sceneRef.current) {
        sceneRef.current.traverse(object => {
          if (object instanceof THREE.Mesh) {
            object.geometry?.dispose();
            if (Array.isArray(object.material)) {
              object.material.forEach(mat => mat.dispose());
            } else {
              object.material?.dispose();
            }
          }
        });
      }

      console.log("🧹 OptimizedCADCanvas: All resources disposed");
    };
  }, []);

  // Stats overlay - keeping original simple version for performance monitoring
  const renderStatsOverlay = () => {
    if (!mergedOptions.monitorPerformance) return null;

    return (
      <div className="absolute bottom-14 left-4 bg-black bg-opacity-75 text-white text-xs p-2 rounded font-mono space-y-1">
        {/* Stats from useThreeJsOptimizer */}
        <div>FPS: {optimizerStats.fps.toFixed(1)}</div>
        <div>Triangles: {optimizerStats.triangleCount.toLocaleString()}</div>
        <div>Draw Calls: {optimizerStats.drawCalls}</div>
        <div>Resolution: {(optimizerSettings.resolutionScale * 100).toFixed(0)}%</div>
        {/* LOD Stats from useLOD */}
        {mergedOptions.enableLod && (
          <div className="pt-1 mt-1 border-t border-gray-600">
            <div>LOD High: {lodStats.highDetailCount}</div>
            <div>LOD Medium: {lodStats.mediumDetailCount}</div>
            <div>LOD Low: {lodStats.lowDetailCount}</div>
            <div>LOD Culled: {lodStats.culledCount}</div>
            <div>Mem Reduced: {(lodStats.memoryReduction * 100).toFixed(1)}%</div>
          </div>
        )}
        {isOptimizing && <div className="text-green-400">Optimizing...</div>}
      </div>
    );
  };

  return (
    <div className="relative w-full h-full">
      <CADCanvas
        // ref={cadCanvasRef}
        onElementsChange={elements => setCadElements(elements)} // Needs forwardRef in CADCanvas
        width={width}
        height={height}
        previewComponent={previewComponent}
        onComponentPlaced={onComponentPlaced}
        allowDragDrop={allowDragDrop}
      />

      {/* Keep Optimize Now button, it triggers useThreeJsOptimizer */}

    </div>
  );
};

export default OptimizedCADCanvas;
