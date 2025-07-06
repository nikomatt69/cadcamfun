// src/components/cam/OptimizedToolpathVisualizer.tsx
import React, { useEffect, useRef, useState } from "react";

import * as THREE from "three";
import { useThreeJsOptimizer } from "src/hooks/useThreeJsOptimizer";
import { useWasmConfig } from "@/src/hooks/wasm/useWasmConfig"; // 🚀 NEW: Centralized WASM config
import { PerformanceMetrics } from "src/lib/wasm/types";
import ToolpathVisualizer from "./ToolpathVisualizer2";

interface OptimizedToolpathVisualizerProps {
  width: string;
  height: string;
  gcode: string;
  isSimulating: boolean;
  selectedTool?: string | null;
  showWorkpiece?: boolean;
  onSimulationComplete?: () => void;
  onSimulationProgress?: (progress: number) => void;
  onToolChange?: (toolName: string) => void;
  cadElements: any[];
  // Optimization options
  optimizationOptions?: {
    targetFps?: number;
    adaptiveResolution?: boolean;
    enableLod?: boolean;
    enableFrustumCulling?: boolean;
    enableGeometryOptimization?: boolean;
    enableInstancing?: boolean;
    memoryManagement?: boolean;
    monitorPerformance?: boolean;
  };
}

/**
 * Optimized version of ToolpathVisualizer that uses WebAssembly modules
 * to improve rendering performance for complex toolpaths.
 */
const OptimizedToolpathVisualizer: React.FC<OptimizedToolpathVisualizerProps> = ({
  width,
  height,
  gcode,
  isSimulating,
  selectedTool = null,
  showWorkpiece = true,
  onSimulationComplete,
  onSimulationProgress,
  onToolChange,
  cadElements,
  optimizationOptions = {}
}) => {
  // References to Three.js entities
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  // Reference to the inner ToolpathVisualizer component
  const toolpathVisualizerRef = useRef<any>(null);

  // 🚀 MEMORY: Geometry cache for toolpath optimization
  const geometryCache = useRef(new Map<string, THREE.BufferGeometry>());
  const materialCache = useRef(new Map<string, THREE.Material>());

  // 🚀 NEW: Use centralized WASM configuration for CAM operations
  const { config: wasmConfig, isLoading: configLoading, updateMetrics, getPerformanceScore } = useWasmConfig("cam");

  // --- Centralized Configuration Integration ---
  const options = wasmConfig
    ? {
      // Use centralized WASM configuration as base (optimized for CAM)
      targetFps: wasmConfig.targetFps,
      adaptiveResolution: wasmConfig.adaptiveResolution,
      enableLod: wasmConfig.enableLOD,
      enableFrustumCulling: wasmConfig.enableFrustumCulling,
      enableGeometryOptimization: wasmConfig.enableGeometryOptimization,
      enableInstancing: wasmConfig.enableInstancing,
      memoryManagement: wasmConfig.memoryManagement,
      monitorPerformance: wasmConfig.enablePerformanceMonitoring,

      // Apply component-specific overrides
      ...optimizationOptions
    }
    : {
      // Fallback configuration optimized for CAM workloads
      targetFps: 30,
      adaptiveResolution: true,
      enableLod: true,
      enableFrustumCulling: true,
      enableGeometryOptimization: true,
      enableInstancing: false,
      memoryManagement: true,
      monitorPerformance: false,
      ...optimizationOptions
    };

  // Use the optimizer
  const { stats, settings, isOptimizing, optimizeSceneNow } = useThreeJsOptimizer(
    sceneRef,
    cameraRef,
    rendererRef,
    options
  );

  // Get references to scene, camera, and renderer from ToolpathVisualizer
  useEffect(() => {
    if (toolpathVisualizerRef.current) {
      // Wait for ToolpathVisualizer to be initialized
      const checkForReferences = () => {
        // Access Three.js entities from ToolpathVisualizer
        if (window.toolpathVisualizerScene && window.toolpathVisualizerCamera) {
          sceneRef.current = window.toolpathVisualizerScene;
          cameraRef.current = window.toolpathVisualizerCamera;

          // Look for the renderer in the DOM
          const canvasElement = document.querySelector("canvas");
          if (canvasElement) {
            // The renderer is associated with the canvas
            const contextAttributes =
              (canvasElement as any).__proto__.getContext.call(canvasElement, "webgl2") ||
              (canvasElement as any).__proto__.getContext.call(canvasElement, "webgl");

            if (contextAttributes) {
              // Find the renderer instance associated with the canvas
              rendererRef.current = (window as any).__THREEJS_RENDERER__ || null;

              // If we don't find the renderer globally, try to extract it from events
              if (!rendererRef.current) {
                console.warn("Renderer not found in global scope, extracting from canvas");

                // Alternative technique: create a new renderer that reuses the same context
                const extractedRenderer = new THREE.WebGLRenderer({
                  canvas: canvasElement,
                  context: contextAttributes
                });

                rendererRef.current = extractedRenderer;
              }

              console.log("Three.js references acquired, initializing optimizer");

              // Force an optimization once references are obtained
              setTimeout(() => {
                optimizeSceneNow();
              }, 1000);
            }
          }
        } else {
          // Try again after a short delay
          setTimeout(checkForReferences, 500);
        }
      };

      // Enable exposure of ToolpathVisualizer API
      window.exposeToolpathVisualizerAPI = true;

      // Start checking for references
      checkForReferences();
    }
  }, [toolpathVisualizerRef, optimizeSceneNow]);

  // 🚀 PERFORMANCE: CAM-specific performance monitoring and optimization
  useEffect(() => {
    if (stats && updateMetrics) {
      // Report performance metrics to centralized system for adaptive adjustments
      updateMetrics({
        triangleCount: stats.triangleCount,
        drawCalls: stats.drawCalls,
        fps: stats.fps,
        memoryUsage: performance.memory ? (performance as any).memory.usedJSHeapSize : 0
      });

      // CAM-specific optimization: trigger when FPS is poor during simulation
      const performanceScore = getPerformanceScore();
      if (performanceScore < 30 && isSimulating && !isOptimizing) {
        console.log("🔥 CAM Performance critical during simulation - triggering optimization");
        optimizeSceneNow();
      }
    }
  }, [stats, updateMetrics, getPerformanceScore, isSimulating, isOptimizing, optimizeSceneNow]);

  // 🚀 MEMORY: CAM-specific memory management (toolpaths generate many geometries)
  useEffect(() => {
    if (!wasmConfig?.memoryManagement) return;

    const camMemoryCleanupInterval = setInterval(() => {
      const now = Date.now();
      const maxCacheAge = 3 * 60 * 1000; // 3 minutes for CAM (shorter than CAD)

      // Clean geometry cache (more aggressive for CAM)
      Array.from(geometryCache.current.entries()).forEach(([key, geometry]) => {
        const lastUsed = geometry.userData.lastUsed || 0;
        if (now - lastUsed > maxCacheAge) {
          geometry.dispose();
          geometryCache.current.delete(key);
          console.log(`🧹 CAM: Disposed cached toolpath geometry: ${key}`);
        }
      });

      // Clean material cache
      Array.from(materialCache.current.entries()).forEach(([key, material]) => {
        const lastUsed = material.userData.lastUsed || 0;
        if (now - lastUsed > maxCacheAge) {
          material.dispose();
          materialCache.current.delete(key);
          console.log(`🧹 CAM: Disposed cached material: ${key}`);
        }
      });

      // Aggressive toolpath line cleanup (CAM generates many line segments)
      if (sceneRef.current) {
        const linesToRemove: THREE.Object3D[] = [];

        sceneRef.current.traverse(object => {
          if (object instanceof THREE.Line || object instanceof THREE.LineSegments) {
            // Mark usage
            if (object.geometry) {
              object.geometry.userData.lastUsed = now;
            }

            // Remove very old toolpath lines that are far from camera
            if (cameraRef.current) {
              const distance = object.position.distanceTo(cameraRef.current.position);
              const age = now - (object.userData.createdAt || now);

              // Remove lines older than 2 minutes and far away
              if (age > 2 * 60 * 1000 && distance > 500) {
                linesToRemove.push(object);
              }
            }
          }
        });

        // Remove old toolpath lines
        linesToRemove.forEach(line => {
          if (line.parent) {
            line.parent.remove(line);
            if (line instanceof THREE.Line || line instanceof THREE.LineSegments) {
              line.geometry?.dispose();
              if (Array.isArray(line.material)) {
                line.material.forEach(mat => mat.dispose());
              } else {
                line.material?.dispose();
              }
            }
          }
        });

        if (linesToRemove.length > 0) {
          console.log(`🧹 CAM: Removed ${linesToRemove.length} old toolpath lines for memory optimization`);
        }
      }

      // Force garbage collection for CAM (more aggressive)
      if (window.gc) {
        window.gc();
      }
    }, 8000); // Every 8 seconds (more frequent than CAD)

    return () => clearInterval(camMemoryCleanupInterval);
  }, [wasmConfig?.memoryManagement]);

  // Handle changes in visualization mode or scene content
  useEffect(() => {
    // Re-run optimization when gcode or simulation state changes
    if (sceneRef.current && cameraRef.current) {
      // Wait for changes to be applied
      setTimeout(() => {
        optimizeSceneNow();
      }, 100);
    }
  }, [gcode, isSimulating, optimizeSceneNow]);

  // 🚀 CLEANUP: CAM-specific resource disposal on unmount
  useEffect(() => {
    return () => {
      // Clear all caches
      for (const geometry of Array.from(geometryCache.current.values())) {
        geometry.dispose();
      }
      for (const material of Array.from(materialCache.current.values())) {
        material.dispose();
      }
      geometryCache.current.clear();
      materialCache.current.clear();

      // Dispose toolpath-specific resources
      if (sceneRef.current) {
        sceneRef.current.traverse(object => {
          if (object instanceof THREE.Line || object instanceof THREE.LineSegments || object instanceof THREE.Mesh) {
            object.geometry?.dispose();
            if (Array.isArray(object.material)) {
              object.material.forEach(mat => mat.dispose());
            } else {
              object.material?.dispose();
            }
          }
        });
      }

      console.log("🧹 OptimizedToolpathVisualizer: All CAM resources disposed");
    };
  }, []);

  // Show stats overlay if monitoring is enabled
  const renderStatsOverlay = () => {
    if (!options.monitorPerformance) return null;

    return (
      <div className="absolute bottom-2 left-2 bg-black bg-opacity-90 text-white text-xs p-2 rounded font-mono shadow-lg border border-gray-600 w-40 z-40">
        <div className="text-blue-300 font-semibold mb-1 border-b border-gray-600 pb-1 text-xs">⚡ Stats</div>
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-300">FPS:</span>
            <span
              className={`${stats.fps > 55 ? "text-green-400" : stats.fps > 30 ? "text-yellow-400" : "text-red-400"} text-xs`}
            >
              {stats.fps.toFixed(1)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-300">Tri:</span>
            <span className="text-white text-xs">{(stats.triangleCount / 1000).toFixed(1)}K</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-300">DC:</span>
            <span className="text-white text-xs">{stats.drawCalls}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-300">Res:</span>
            <span className="text-white text-xs">{(settings.resolutionScale * 100).toFixed(0)}%</span>
          </div>
          {isOptimizing && <div className="text-green-400 animate-pulse mt-1 text-center text-xs">⚡ Optimizing</div>}
        </div>
      </div>
    );
  };

  // Register a global reference to expose Scene and Camera
  useEffect(() => {
    return () => {
      // Clean up global references on unmount
      if (window.toolpathVisualizerScene) {
        window.toolpathVisualizerScene = undefined;
      }
      if (window.toolpathVisualizerCamera) {
        window.toolpathVisualizerCamera = undefined;
      }
    };
  }, []);

  // Add manual optimization button for toolpath debugging
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);

  return (
    <div className="relative w-full rounded-xl h-full">
      {/* Original ToolpathVisualizer */}
      <ToolpathVisualizer
        cadElements={cadElements}
        width={width}
        height={height}
        gcode={gcode}
        isSimulating={isSimulating}
        selectedTool={selectedTool}
        showWorkpiece={showWorkpiece}
        onSimulationComplete={onSimulationComplete}
        onSimulationProgress={onSimulationProgress}
        onToolChange={onToolChange}
      />

      {/* Stats overlay */}

      {/* Advanced controls toggle button */}
      <button
        className="absolute top-32 right-2 bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded shadow transition-all duration-200 z-50"
        onClick={() => setShowAdvancedControls(!showAdvancedControls)}
      >
        {showAdvancedControls ? "🔧" : "⚙️"}
      </button>

      {/* Advanced optimization controls */}
      {showAdvancedControls && (
        <div className="absolute top-8 right-2 bg-gray-900 bg-opacity-95 text-white text-xs p-2 rounded shadow border border-gray-600 w-48 z-40">
          <div className="text-blue-300 font-semibold mb-1 border-b border-gray-600 pb-1 text-xs">🚀 Controls</div>

          <button
            className={`w-full text-xs px-2 py-1 rounded mb-2 transition-all duration-200 ${isOptimizing
                ? "bg-gray-600 cursor-not-allowed text-gray-400"
                : "bg-green-600 hover:bg-green-700 text-white"
              }`}
            onClick={optimizeSceneNow}
            disabled={isOptimizing}
          >
            {isOptimizing ? (
              <span className="flex items-center justify-center space-x-1">
                <div className="animate-spin rounded-full h-2 w-2 border-b border-white"></div>
                <span>Optimizing</span>
              </span>
            ) : (
              "⚡ Optimize"
            )}
          </button>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-gray-300 text-xs">FPS:</label>
              <span
                className={`${stats.fps > 55 ? "text-green-400" : stats.fps > 30 ? "text-yellow-400" : "text-red-400"} text-xs`}
              >
                {stats.fps.toFixed(1)}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <label className="text-gray-300 text-xs">Res:</label>
              <span className="text-white text-xs">{(settings.resolutionScale * 100).toFixed(0)}%</span>
            </div>

            <div className="flex justify-between items-center">
              <label className="text-gray-300 text-xs">LOD:</label>
              <span className="text-white text-xs">{settings.lodBias.toFixed(1)}</span>
            </div>

            <div className="flex justify-between items-center">
              <label className="text-gray-300 text-xs">Mem:</label>
              <span className="text-white text-xs">{(stats.memoryUsage / 1024 / 1024).toFixed(1)}MB</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OptimizedToolpathVisualizer;
