// CAD Hooks - Consolidated Hook System
// Phase 3 - Step 3.2: UseEffect Consolidation - Main Integration Hook

export * from './useSceneLifecycle';
export * from './useElementsRendering';
export * from './useUserInteractions';

import { useWasmCore, WasmCore } from './useWasmCore';
import { useSceneLifecycle, SceneLifecycleConfig, SceneRefs } from './useSceneLifecycle';
import { useElementsRendering, ElementsRenderingConfig, ElementUpdateStats } from './useElementsRendering';
import { useUserInteractions, UserInteractionsConfig, InteractionStats } from './useUserInteractions';
import { CADEventSystem } from '../events';
import { useEffect, useRef } from 'react';

/**
 * Complete CAD Canvas configuration
 */
export interface CADCanvasHooksConfig {
  // Scene configuration
  scene: SceneLifecycleConfig;
  
  // Elements configuration
  elements: ElementsRenderingConfig;
  
  // Interactions configuration
  interactions: UserInteractionsConfig;
  
  // Feature flags
  enableWasmOptimization?: boolean;
  enableConsolidatedHooks?: boolean;
  enablePerformanceMonitoring?: boolean;
}

/**
 * Complete CAD Canvas hook return type
 */
export interface CADCanvasHooksReturn {
  // WASM Core
  wasmCore: WasmCore;
  wasmReady: boolean;
  wasmError: string | null;
  
  // Scene references
  sceneRefs: SceneRefs;
  
  // Element management
  elementStats: ElementUpdateStats;
  updateElement: (elementId: string, updates: any) => void;
  refreshAllElements: () => void;
  clearScene: () => void;
  
  // User interactions
  interactionStats: InteractionStats;
  eventSystem: CADEventSystem | null;
  addShortcut: (keys: string, action: string, handler: Function) => void;
  removeShortcut: (keys: string) => void;
  enableEventSystem: (enabled: boolean) => void;
  rollbackToOriginal: () => void;
  
  // Performance and debugging
  getPerformanceMetrics: () => {
    wasm: { isReady: boolean; error: string | null };
    elements: ElementUpdateStats;
    interactions: InteractionStats;
    memoryUsage: number;
  };
  
  // Safety functions
  rollbackAll: () => void;
  enableConsolidatedMode: (enabled: boolean) => void;
}

/**
 * Main CAD Canvas hook that consolidates all CAD functionality
 * This replaces multiple useEffects in the original CADCanvas component
 */
export function useCADCanvas(config: CADCanvasHooksConfig): CADCanvasHooksReturn {
  // Always call hooks unconditionally first
  // 1. Initialize WASM Core (base layer) - Now returns sync result
  const { wasmCore, isReady: wasmReady, error: wasmError } = useWasmCore();
  
  // 2. Initialize Scene Lifecycle (replaces multiple scene-related useEffects)
  const sceneRefs = useSceneLifecycle(wasmCore, config.scene);
  
  // 3. Initialize Elements Rendering (replaces multiple element-related useEffects)
  const {
    stats: elementStats,
    updateElement,
    refreshAllElements,
    clearScene
  } = useElementsRendering(wasmCore, sceneRefs, config.elements);
  
  // 4. Initialize User Interactions (replaces multiple event-related useEffects)
  const {
    stats: interactionStats,
    eventSystem,
    addShortcut,
    removeShortcut,
    enableEventSystem,
    rollbackToOriginal
  } = useUserInteractions(wasmCore, sceneRefs, config.interactions);
  
  // Feature flag check after hooks are called
  const consolidatedEnabled = config.enableConsolidatedHooks ?? (process.env.CAD_CONSOLIDATED_EFFECTS !== 'false');
  
  if (!consolidatedEnabled) {
    console.log('🔄 Consolidated hooks disabled, falling back to original implementation');
    // Return minimal interface for fallback
    return createFallbackReturn();
  }
  
  console.log('🚀 Initializing consolidated CAD Canvas hooks...');
  
  // Performance metrics aggregation
  const getPerformanceMetrics = () => ({
    wasm: {
      isReady: wasmReady,
      error: wasmError
    },
    elements: elementStats,
    interactions: interactionStats,
    memoryUsage: wasmCore.getMemoryUsage()
  });
  
  // Safety rollback functions
  const rollbackAll = () => {
    console.log('🔄 Rolling back all consolidated hooks...');
    rollbackToOriginal();
    clearScene();
    // Additional cleanup would go here
  };
  
  const enableConsolidatedMode = (enabled: boolean) => {
    if (!enabled) {
      rollbackAll();
    }
    enableEventSystem(enabled);
  };
  
  console.log('✅ Consolidated CAD Canvas hooks initialized successfully');
  
  return {
    // WASM Core
    wasmCore,
    wasmReady,
    wasmError,
    
    // Scene references
    sceneRefs,
    
    // Element management
    elementStats,
    updateElement,
    refreshAllElements,
    clearScene,
    
    // User interactions
    interactionStats,
    eventSystem,
    addShortcut,
    removeShortcut,
    enableEventSystem,
    rollbackToOriginal,
    
    // Performance and debugging
    getPerformanceMetrics,
    
    // Safety functions
    rollbackAll,
    enableConsolidatedMode
  };
}

/**
 * Fallback return for when consolidated hooks are disabled
 */
function createFallbackReturn(): CADCanvasHooksReturn {
  const fallbackWasmCore: WasmCore = {
    isReady: false,
    isThreadingSupported: false,
    createOptimizedScene: () => { throw new Error('Fallback mode'); },
    createOptimizedRenderer: () => { throw new Error('Fallback mode'); },
    disposeScene: () => {},
    createOptimizedThreeObject: () => null,
    batchUpdateElements: () => {},
    optimizeGeometry: (geo) => geo,
    optimizeEventArgs: (type, args) => args,
    cleanup: () => {},
    getMemoryUsage: () => 0
  };
  
  const fallbackSceneRefs: SceneRefs = {
    sceneRef: { current: null },
    rendererRef: { current: null },
    cameraRef: { current: null },
    controlsRef: { current: null },
    transformControlsRef: { current: null },
    animationFrameIdRef: { current: null }
  };
  
  const fallbackElementStats: ElementUpdateStats = {
    totalElements: 0,
    updatedElements: 0,
    batchedUpdates: 0,
    wasmOptimized: 0,
    lastUpdateTime: 0,
    averageUpdateTime: 0
  };
  
  const fallbackInteractionStats: InteractionStats = {
    totalEvents: 0,
    mouseEvents: 0,
    keyboardEvents: 0,
    dragEvents: 0,
    wasmOptimizedEvents: 0,
    averageEventProcessingTime: 0,
    eventsPerSecond: 0
  };
  
  return {
    wasmCore: fallbackWasmCore,
    wasmReady: false,
    wasmError: 'Consolidated hooks disabled',
    sceneRefs: fallbackSceneRefs,
    elementStats: fallbackElementStats,
    updateElement: () => console.warn('Fallback mode: updateElement'),
    refreshAllElements: () => console.warn('Fallback mode: refreshAllElements'),
    clearScene: () => console.warn('Fallback mode: clearScene'),
    interactionStats: fallbackInteractionStats,
    eventSystem: null,
    addShortcut: () => console.warn('Fallback mode: addShortcut'),
    removeShortcut: () => console.warn('Fallback mode: removeShortcut'),
    enableEventSystem: () => console.warn('Fallback mode: enableEventSystem'),
    rollbackToOriginal: () => console.warn('Fallback mode: rollbackToOriginal'),
    getPerformanceMetrics: () => ({
      wasm: { isReady: false, error: 'Consolidated hooks disabled' },
      elements: fallbackElementStats,
      interactions: fallbackInteractionStats,
      memoryUsage: 0
    }),
    rollbackAll: () => console.warn('Fallback mode: rollbackAll'),
    enableConsolidatedMode: () => console.warn('Fallback mode: enableConsolidatedMode')
  };
}

/**
 * Utility hook for monitoring consolidated hooks performance
 */
export function useCADPerformanceMonitor(cadHooks: CADCanvasHooksReturn) {
  const metricsRef = useRef<any[]>([]);
  
  useEffect(() => {
    if (!cadHooks.wasmReady) return;
    
    const interval = setInterval(() => {
      const metrics = cadHooks.getPerformanceMetrics();
      metricsRef.current.push({
        timestamp: Date.now(),
        ...metrics
      });
      
      // Keep only last 100 entries
      if (metricsRef.current.length > 100) {
        metricsRef.current = metricsRef.current.slice(-100);
      }
      
      // Log performance warnings
      if (metrics.elements.averageUpdateTime > 100) {
        console.warn('🐌 Element update performance degraded:', metrics.elements.averageUpdateTime + 'ms');
      }
      
      if (metrics.interactions.averageEventProcessingTime > 16) {
        console.warn('🐌 Event processing performance degraded:', metrics.interactions.averageEventProcessingTime + 'ms');
      }
      
      if (metrics.memoryUsage > 500 * 1024 * 1024) { // 500MB
        console.warn('🧠 High memory usage detected:', (metrics.memoryUsage / 1024 / 1024).toFixed(2) + 'MB');
      }
      
    }, 5000); // Check every 5 seconds
    
    return () => clearInterval(interval);
  }, [cadHooks]);
  
  return {
    getHistoricalMetrics: () => metricsRef.current,
    getCurrentMetrics: cadHooks.getPerformanceMetrics
  };
}

// Export types for external use
export type {
  CADCanvasHooksConfig as CADCanvasHooksConfigs,
  CADCanvasHooksReturn as CADCanvasHooksReturns,
  SceneLifecycleConfig,
  ElementsRenderingConfig,
  UserInteractionsConfig,
  ElementUpdateStats,
  InteractionStats
};
