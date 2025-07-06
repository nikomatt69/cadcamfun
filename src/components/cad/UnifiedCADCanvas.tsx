// Unified CAD Canvas
// Uses the new unified WASM optimizer to eliminate conflicts and maximize performance

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useUnifiedWasmOptimizer } from "@/src/hooks/useUnifiedWasmOptimizer";
import { DynamicCADCanvas, DynamicOptimizedCADCanvas } from "../dynamic-imports";

interface UnifiedCADCanvasProps {
  width?: string | number;
  height?: string | number;
  previewComponent?: string | null;
  onComponentPlaced?: (component: string, position: { x: number; y: number; z: number }) => void;
  allowDragDrop?: boolean;
  onElementsChange?: (elements: any[]) => void;

  // Unified optimization options
  optimizationOptions?: {
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

    // CAD-specific options
    enableSnapping?: boolean;
    enableConstraints?: boolean;
    enableMeshOptimization?: boolean;
    highDetailThreshold?: number;
    mediumDetailThreshold?: number;
    lowDetailReduction?: number;
    mediumDetailReduction?: number;
  };
}

/**
 * Unified CAD Canvas that eliminates WASM conflicts
 * and provides optimal performance for CAD operations
 */
const UnifiedCADCanvas: React.FC<UnifiedCADCanvasProps> = ({
  width = "100%",
  height = "100%",
  previewComponent = null,
  onComponentPlaced,
  allowDragDrop = true,
  onElementsChange,
  optimizationOptions = {}
}) => {
  // References to Three.js entities
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cadCanvasRef = useRef<any>(null);

  // Default optimization options optimized for CAD workflows
  const defaultOptions = {
    preferEnhanced: true,
    enablePerformanceMonitoring: true,
    enableLOD: true,
    enableCSG: true,
    enableToolpathOptimization: false, // Usually not needed for CAD
    targetFps: 60,
    adaptiveResolution: true,
    enableFrustumCulling: true,
    enableGeometryOptimization: true,
    enableInstancing: true,
    memoryManagement: true,

    // CAD-specific defaults
    enableSnapping: true,
    enableConstraints: true,
    enableMeshOptimization: true,
    highDetailThreshold: 100,
    mediumDetailThreshold: 300,
    lowDetailReduction: 0.3,
    mediumDetailReduction: 0.6
  };

  // Merge options
  const options = { ...defaultOptions, ...optimizationOptions };

  // Use the unified WASM optimizer
  const {
    isLoading,
    isInitialized,
    error,
    activeSystem,
    enhancedAvailable,
    legacyAvailable,
    stats,
    settings,
    optimizeMesh,
    performCSGOperation,
    calculateNormals,
    frustumCull,
    calculateLODLevels,
    applySettings,
    getDebugInfo
  } = useUnifiedWasmOptimizer(sceneRef, cameraRef, rendererRef, options);

  // Track CAD-specific optimization state
  const [isOptimizingCAD, setIsOptimizingCAD] = useState(false);
  const [meshOptimizationQueue, setMeshOptimizationQueue] = useState<
    Array<{
      id: string;
      vertices: Float32Array;
      indices: Uint32Array;
    }>
  >([]);
  const [showDebugControls, setShowDebugControls] = useState(false);

  // Performance tracking for CAD operations
  const [cadStats, setCadStats] = useState({
    csgOperations: 0,
    meshOptimizations: 0,
    snapCalculations: 0,
    constraintsSolved: 0
  });

  // Determine which canvas type is being used
  const usingOptimizedCanvas = options.preferEnhanced && enhancedAvailable;

  // Get references from CADCanvas when available
  useEffect(() => {
    if (cadCanvasRef.current) {
      const checkForReferences = () => {
        // Try to get references from global scope or DOM
        if (window.cadCanvasScene && window.cadCanvasCamera) {
          sceneRef.current = window.cadCanvasScene;
          cameraRef.current = window.cadCanvasCamera;

          // Find renderer from canvas
          const canvasElement = document.querySelector("canvas");
          if (canvasElement && (window as any).__THREEJS_RENDERER__) {
            rendererRef.current = (window as any).__THREEJS_RENDERER__;
          }

          console.log("📊 CAD Canvas references acquired for unified optimization");
        } else {
          setTimeout(checkForReferences, 500);
        }
      };

      window.exposeCADCanvasAPI = true;
      checkForReferences();
    }
  }, [cadCanvasRef]);

  // Process mesh optimization queue
  useEffect(() => {
    if (!isInitialized || !enhancedAvailable || meshOptimizationQueue.length === 0) return;

    const processMeshOptimization = async () => {
      if (isOptimizingCAD) return;

      setIsOptimizingCAD(true);
      try {
        const meshesToOptimize = [...meshOptimizationQueue];
        setMeshOptimizationQueue([]);

        console.log(`🔄 Optimizing ${meshesToOptimize.length} CAD meshes...`);

        for (const mesh of meshesToOptimize) {
          try {
            // Optimize mesh using WASM
            const optimized = await optimizeMesh(mesh.vertices, mesh.indices, 0.8);

            // Find the corresponding Three.js object and update it
            if (sceneRef.current) {
              const object = sceneRef.current.getObjectByProperty("userData.cadId", mesh.id);
              if (object && object instanceof THREE.Mesh) {
                // Create new geometry
                const newGeometry = new THREE.BufferGeometry();
                newGeometry.setAttribute("position", new THREE.BufferAttribute(optimized.vertices, 3));
                newGeometry.setIndex(new THREE.BufferAttribute(optimized.indices, 1));

                if (optimized.normals) {
                  newGeometry.setAttribute("normal", new THREE.BufferAttribute(optimized.normals, 3));
                } else {
                  newGeometry.computeVertexNormals();
                }

                // Replace geometry
                object.geometry.dispose();
                object.geometry = newGeometry;

                console.log(`✅ Optimized mesh ${mesh.id}`);
              }
            }
          } catch (error) {
            console.error(`❌ Failed to optimize mesh ${mesh.id}:`, error);
          }
        }

        setCadStats(prev => ({
          ...prev,
          meshOptimizations: prev.meshOptimizations + meshesToOptimize.length
        }));
      } catch (error) {
        console.error("❌ Mesh optimization batch failed:", error);
      } finally {
        setIsOptimizingCAD(false);
      }
    };

    const timeout = setTimeout(processMeshOptimization, 500); // Batch optimizations
    return () => clearTimeout(timeout);
  }, [meshOptimizationQueue, isInitialized, enhancedAvailable, isOptimizingCAD, optimizeMesh]);

  // Expose CAD optimization functions globally for CADCanvas to use
  useEffect(() => {
    if (isInitialized) {
      (window as any).unifiedCADOptimizer = {
        optimizeMesh: async (vertices: Float32Array, indices: Uint32Array, id: string) => {
          if (enhancedAvailable) {
            setMeshOptimizationQueue(prev => [...prev, { id, vertices, indices }]);
            return true;
          }
          return false;
        },

        performCSG: async (operation: string, meshA: any, meshB: any) => {
          if (enhancedAvailable) {
            try {
              const result = await performCSGOperation(operation as any, meshA, meshB);
              setCadStats(prev => ({ ...prev, csgOperations: prev.csgOperations + 1 }));
              return result;
            } catch (error) {
              console.error("❌ CSG operation failed:", error);
              return null;
            }
          }
          return null;
        },

        calculateNormals: async (vertices: Float32Array, indices: Uint32Array) => {
          if (enhancedAvailable) {
            return calculateNormals(vertices, indices);
          }
          return null;
        },

        updateStats: (type: string) => {
          setCadStats(prev => ({
            ...prev,
            [type]: prev[type as keyof typeof prev] + 1
          }));
        }
      };
    }

    return () => {
      delete (window as any).unifiedCADOptimizer;
    };
  }, [isInitialized, enhancedAvailable, performCSGOperation, calculateNormals]);

  // Apply CAD-specific adaptive settings
  useEffect(() => {
    if (!isInitialized || !options.adaptiveResolution) return;

    const applyCADAdaptiveSettings = async () => {
      try {
        // CAD-specific performance thresholds
        const complexityThreshold = stats.triangleCount > 100000;
        const performanceThreshold = stats.fps < settings.targetFps * 0.85;

        if (complexityThreshold && performanceThreshold) {
          // High complexity + low performance: aggressive optimization
          const newSettings = {
            ...settings,
            resolutionScale: Math.max(0.6, settings.resolutionScale * 0.85),
            lodBias: Math.min(1.8, settings.lodBias * 1.2),
            maxTriangles: Math.max(50000, settings.maxTriangles * 0.8)
          };
          await applySettings(newSettings);
          console.log("📉 CAD adaptive optimization applied (aggressive)");
        } else if (stats.fps > settings.targetFps * 1.15 && settings.resolutionScale < 1.0) {
          // Good performance: restore quality
          const newSettings = {
            ...settings,
            resolutionScale: Math.min(1.0, settings.resolutionScale * 1.1),
            lodBias: Math.max(0.8, settings.lodBias * 0.9),
            maxTriangles: Math.min(1000000, settings.maxTriangles * 1.1)
          };
          await applySettings(newSettings);
          console.log("📈 CAD adaptive quality restoration applied");
        }
      } catch (error) {
        console.error("Error applying CAD adaptive settings:", error);
      }
    };

    // Apply CAD adaptive settings every 3 seconds (less frequent for CAD)
    const interval = setInterval(applyCADAdaptiveSettings, 3000);
    return () => clearInterval(interval);
  }, [isInitialized, stats, settings, applySettings, options.adaptiveResolution]);

  // Render CAD performance overlay
  const renderCADPerformanceOverlay = () => {
    if (!options.enablePerformanceMonitoring) return null;

    const systemColor =
      activeSystem === "enhanced" ? "text-green-400" : activeSystem === "legacy" ? "text-yellow-400" : "text-red-400";

    return (
      <div className="absolute bottom-20 left-4 bg-black bg-opacity-75 text-white text-xs p-3 rounded font-mono space-y-1">
        <div className="flex justify-between">
          <span>CAD System:</span>
          <span className={systemColor}>{activeSystem.toUpperCase()}</span>
        </div>
        <div className="flex justify-between">
          <span>Canvas:</span>
          <span className={usingOptimizedCanvas ? "text-purple-400" : "text-blue-400"}>
            {usingOptimizedCanvas ? "Optimized" : "Standard"}
          </span>
        </div>
        <div className="flex justify-between">
          <span>FPS:</span>
          <span className={stats.fps > 55 ? "text-green-400" : stats.fps > 30 ? "text-yellow-400" : "text-red-400"}>
            {stats.fps.toFixed(1)}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Triangles:</span>
          <span>{stats.triangleCount.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span>Resolution:</span>
          <span>{(settings.resolutionScale * 100).toFixed(0)}%</span>
        </div>

        {/* CAD-specific stats */}
        <div className="border-t border-gray-600 pt-1 mt-1">
          <div className="flex justify-between">
            <span>CSG Ops:</span>
            <span>{cadStats.csgOperations}</span>
          </div>
          <div className="flex justify-between">
            <span>Mesh Opts:</span>
            <span>{cadStats.meshOptimizations}</span>
          </div>
          <div className="flex justify-between">
            <span>Queue:</span>
            <span>{meshOptimizationQueue.length}</span>
          </div>
        </div>

        {isOptimizingCAD && <div className="text-blue-400 animate-pulse">Optimizing CAD meshes...</div>}
        {error && <div className="text-red-400 text-xs">Error: {error}</div>}
      </div>
    );
  };

  // Render system status for CAD
  const renderCADStatusIndicators = () => (
    <div className="absolute top-4 left-4 flex space-x-2">
      {enhancedAvailable && options.enableCSG && (
        <div className="bg-green-500 bg-opacity-75 text-white text-xs px-2 py-1 rounded">CSG Ready</div>
      )}
      {enhancedAvailable && options.enableMeshOptimization && (
        <div className="bg-blue-500 bg-opacity-75 text-white text-xs px-2 py-1 rounded">Mesh Opt</div>
      )}
      {legacyAvailable && (
        <div className="bg-yellow-500 bg-opacity-75 text-white text-xs px-2 py-1 rounded">Legacy WASM</div>
      )}
      {isLoading && (
        <div className="bg-gray-500 bg-opacity-75 text-white text-xs px-2 py-1 rounded animate-pulse">Loading...</div>
      )}
    </div>
  );

  const renderCADDebugControls = () => {
    if (!showDebugControls) return null;

    const debugInfo = {
      ...getDebugInfo(),
      cadStats,
      meshOptimizationQueue: meshOptimizationQueue.length,
      isOptimizingCAD
    };

    return (
      <div className="absolute top-4 right-4 bg-gray-800 bg-opacity-90 text-white text-xs p-3 rounded max-w-xs max-h-64 overflow-y-auto">
        <h4 className="font-bold mb-2">CAD Debug Info</h4>
        <div className="space-y-1">
          <button
            className="w-full bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs"
            onClick={() => {
              // Trigger manual mesh optimization for testing
              if (sceneRef.current) {
                sceneRef.current.traverse(object => {
                  if (object instanceof THREE.Mesh && object.geometry) {
                    const vertices = object.geometry.attributes.position.array as Float32Array;
                    const indices = object.geometry.index?.array as Uint32Array;
                    if (vertices && indices) {
                      setMeshOptimizationQueue(prev => [
                        ...prev,
                        {
                          id: object.uuid,
                          vertices,
                          indices
                        }
                      ]);
                    }
                  }
                });
              }
            }}
          >
            Force Mesh Optimization
          </button>

          <button
            className="w-full bg-green-500 hover:bg-green-600 text-white px-2 py-1 rounded text-xs"
            onClick={() => {
              setCadStats({
                csgOperations: 0,
                meshOptimizations: 0,
                snapCalculations: 0,
                constraintsSolved: 0
              });
            }}
          >
            Reset CAD Stats
          </button>
        </div>

        <pre className="whitespace-pre-wrap text-xs mt-2 max-h-32 overflow-y-auto">
          {JSON.stringify(debugInfo, null, 2)}
        </pre>
      </div>
    );
  };

  return (
    <div className="relative w-full h-full">
      {/* Choose between CADCanvas and OptimizedCADCanvas based on settings */}
      <div ref={cadCanvasRef}>
        {options.preferEnhanced && enhancedAvailable ? (
          <DynamicOptimizedCADCanvas
            width={width}
            height={height}
            previewComponent={previewComponent}
            onComponentPlaced={onComponentPlaced}
            allowDragDrop={allowDragDrop}
            optimizationOptions={{
              targetFps: options.targetFps,
              adaptiveResolution: options.adaptiveResolution,
              enableLod: options.enableLOD,
              enableFrustumCulling: options.enableFrustumCulling,
              enableGeometryOptimization: options.enableGeometryOptimization,
              enableInstancing: options.enableInstancing,
              memoryManagement: options.memoryManagement,
              monitorPerformance: options.enablePerformanceMonitoring,
              highDetailThreshold: options.highDetailThreshold,
              mediumDetailThreshold: options.mediumDetailThreshold,
              lowDetailReduction: options.lowDetailReduction,
              mediumDetailReduction: options.mediumDetailReduction
            }}
          />
        ) : (
          <DynamicCADCanvas
            width={width}
            height={height}
            previewComponent={previewComponent}
            onComponentPlaced={onComponentPlaced}
            allowDragDrop={allowDragDrop}
            onElementsChange={onElementsChange}
          />
        )}
      </div>

      {/* CAD performance overlay */}
      {renderCADPerformanceOverlay()}

      {/* System status indicators */}
      {renderCADStatusIndicators()}

      {/* Debug toggle button */}
      <button
        className="absolute top-4 right-4 bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-1 rounded opacity-60 hover:opacity-100 z-10"
        onClick={() => setShowDebugControls(!showDebugControls)}
      >
        {showDebugControls ? "Hide Debug" : "CAD Debug"}
      </button>

      {/* Debug controls */}
      {renderCADDebugControls()}

      {/* Optimization status overlay */}
      {isOptimizingCAD && (
        <div className="absolute inset-0 bg-black bg-opacity-25 flex items-center justify-center z-20">
          <div className="bg-green-500 text-white px-4 py-2 rounded flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            <span>
              Optimizing CAD meshes with {activeSystem} WASM... ({meshOptimizationQueue.length} queued)
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedCADCanvas;
