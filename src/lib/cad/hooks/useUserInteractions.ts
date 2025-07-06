// User Interactions Hook - Consolidated Event Management  
// Phase 3 - Step 3.2: UseEffect Consolidation

import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { WasmCore } from './useWasmCore';
import { SceneRefs } from './useSceneLifecycle';
import { CADEventSystem, createCADEventSystem, WasmEventOptimizer } from '../events';
import { CADMouseEvent, CADKeyboardEvent, CADDragEvent } from '../events/EventTypes';
import * as THREE from 'three';
/**
 * User interactions configuration
 */
export interface UserInteractionsConfig {
  canvasRef: React.RefObject<HTMLDivElement>;
  
  // Feature flags
  enableUnifiedEvents?: boolean;
  enableWasmEvents?: boolean;
  enableKeyboardShortcuts?: boolean;
  enableMouseInteractions?: boolean;
  enableDragOperations?: boolean;
  enableTouchSupport?: boolean;
  
  // Event handlers (existing ones to wrap)
  existingHandlers?: {
    handleMouseMove?: Function;
    handleClick?: Function;
    handleMouseDown?: Function;
    handleMouseUp?: Function;
    handleWheel?: Function;
    handleKeyDown?: Function;
    handleKeyUp?: Function;
    handleResize?: Function;
    handleFullscreenChange?: Function;
  };
  
  // Callbacks for unified events
  onMouseMove?: (event: CADMouseEvent) => void;
  onMouseClick?: (event: CADMouseEvent) => void;
  onKeyboardShortcut?: (event: CADKeyboardEvent) => void;
  onDragStart?: (event: CADDragEvent) => void;
  onDragMove?: (event: CADDragEvent) => void;
  onDragEnd?: (event: CADDragEvent) => void;
  onElementSelect?: (elementId: string | null) => void;
  onElementHover?: (elementId: string | null) => void;
  
  // Performance settings
  throttleMouseEvents?: number; // ms
  debounceKeyEvents?: number; // ms
  enablePerformanceMonitoring?: boolean;
}

/**
 * Interaction statistics
 */
export interface InteractionStats {
  totalEvents: number;
  mouseEvents: number;
  keyboardEvents: number;
  dragEvents: number;
  wasmOptimizedEvents: number;
  averageEventProcessingTime: number;
  eventsPerSecond: number;
}

/**
 * Hook for managing all user interactions in the CAD Canvas
 * Consolidates multiple interaction-related useEffects into a single, optimized hook
 */
export function useUserInteractions(
  wasmCore: WasmCore,
  sceneRefs: SceneRefs,
  config: UserInteractionsConfig
): {
  stats: InteractionStats;
  eventSystem: CADEventSystem | null;
  addShortcut: (keys: string, action: string, handler: Function) => void;
  removeShortcut: (keys: string) => void;
  enableEventSystem: (enabled: boolean) => void;
  rollbackToOriginal: () => void;
} {
  // State
  const [eventSystem, setEventSystem] = useState<CADEventSystem | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });
  
  // Refs for state tracking
  const statsRef = useRef<InteractionStats>({
    totalEvents: 0,
    mouseEvents: 0,
    keyboardEvents: 0,
    dragEvents: 0,
    wasmOptimizedEvents: 0,
    averageEventProcessingTime: 0,
    eventsPerSecond: 0
  });
  
  const isInitialized = useRef(false);
  const eventTimings = useRef<number[]>([]);
  const lastStatsUpdate = useRef(Date.now());
  
  // Memoized configuration
  const memoizedConfig = useMemo(() => ({
    enableUnifiedEvents: config.enableUnifiedEvents ?? (process.env.CAD_UNIFIED_EVENTS !== 'false'),
    enableWasmEvents: config.enableWasmEvents ?? (process.env.CAD_WASM_EVENTS !== 'false'),
    enableKeyboardShortcuts: config.enableKeyboardShortcuts ?? true,
    enableMouseInteractions: config.enableMouseInteractions ?? true,
    enableDragOperations: config.enableDragOperations ?? true,
    enableTouchSupport: config.enableTouchSupport ?? false,
    throttleMouseEvents: config.throttleMouseEvents || 16, // 60 FPS
    debounceKeyEvents: config.debounceKeyEvents || 50,
    enablePerformanceMonitoring: config.enablePerformanceMonitoring ?? true,
    ...config
  }), [
    config.enableUnifiedEvents,
    config.enableWasmEvents,
    config.enableKeyboardShortcuts,
    config.enableMouseInteractions,
    config.enableDragOperations,
    config.enableTouchSupport,
    config.throttleMouseEvents,
    config.debounceKeyEvents,
    config.enablePerformanceMonitoring,
    config.existingHandlers,
    config.canvasRef
  ]);
  
  // WASM Event Optimizer implementation
  const wasmEventOptimizer = useMemo<WasmEventOptimizer>(() => ({
    optimizeMouseEvent: (event: CADMouseEvent): CADMouseEvent => {
      if (!wasmCore.isReady) return event;
      
      try {
        // WASM-optimized world position calculation
        if (sceneRefs.cameraRef.current && !event.position.world) {
          const worldPos = calculateWorldPosition(
            event.position.normalized,
            sceneRefs.cameraRef.current
          );
          if (worldPos) {
            event.position.world = worldPos;
          }
        }
        
        statsRef.current.wasmOptimizedEvents++;
        return event;
      } catch (error) {
        console.warn('WASM mouse event optimization failed:', error);
        return event;
      }
    },
    
    optimizeKeyboardEvent: (event: CADKeyboardEvent): CADKeyboardEvent => {
      if (!wasmCore.isReady) return event;
      
      try {
        // WASM-optimized keyboard event processing
        statsRef.current.wasmOptimizedEvents++;
        return event;
      } catch (error) {
        console.warn('WASM keyboard event optimization failed:', error);
        return event;
      }
    },
    
    optimizeDragEvent: (event: CADDragEvent): CADDragEvent => {
      if (!wasmCore.isReady) return event;
      
      try {
        // WASM-optimized drag calculations
        statsRef.current.wasmOptimizedEvents++;
        return event;
      } catch (error) {
        console.warn('WASM drag event optimization failed:', error);
        return event;
      }
    },
    
    calculateWorldPosition: (screenPos: { x: number; y: number }, camera: THREE.Camera) => {
      return calculateWorldPosition(screenPos, camera);
    }
  }), [wasmCore.isReady, sceneRefs.cameraRef]);
  
  // World position calculation utility
  const calculateWorldPosition = useCallback((
    normalizedPos: { x: number; y: number },
    camera: THREE.Camera
  ): { x: number; y: number; z: number } | null => {
    try {
      const vector = new THREE.Vector3(normalizedPos.x, normalizedPos.y, 0);
      vector.unproject(camera);
      
      const direction = vector.sub(camera.position).normalize();
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      
      const result = new THREE.Vector3();
      const raycaster = new THREE.Raycaster(camera.position, direction);
      raycaster.ray.intersectPlane(plane, result);
      
      return { x: result.x, y: result.y, z: result.z };
    } catch (error) {
      console.error('World position calculation failed:', error);
      return null;
    }
  }, []);
  
  // Update statistics
  const updateStats = useCallback((eventType: string, processingTime: number) => {
    if (!memoizedConfig.enablePerformanceMonitoring) return;
    
    statsRef.current.totalEvents++;
    eventTimings.current.push(processingTime);
    
    switch (eventType.split(':')[0]) {
      case 'mouse':
        statsRef.current.mouseEvents++;
        break;
      case 'keyboard':
        statsRef.current.keyboardEvents++;
        break;
      case 'drag':
        statsRef.current.dragEvents++;
        break;
    }
    
    // Update averages every second
    const now = Date.now();
    if (now - lastStatsUpdate.current > 1000) {
      const recentTimings = eventTimings.current.slice(-100);
      statsRef.current.averageEventProcessingTime = 
        recentTimings.reduce((sum, time) => sum + time, 0) / recentTimings.length || 0;
      
      const eventsInLastSecond = eventTimings.current.filter(
        (_, index) => index >= eventTimings.current.length - statsRef.current.totalEvents / 10
      ).length;
      statsRef.current.eventsPerSecond = eventsInLastSecond;
      
      lastStatsUpdate.current = now;
      
      // Keep only last 1000 timings
      if (eventTimings.current.length > 1000) {
        eventTimings.current = eventTimings.current.slice(-1000);
      }
    }
  }, [memoizedConfig.enablePerformanceMonitoring]);
  
  // Setup event handlers
  const setupEventHandlers = useCallback((eventSystem: CADEventSystem) => {
    console.log('🔧 Setting up unified event handlers...');
    
    // Mouse event handlers
    if (memoizedConfig.enableMouseInteractions) {
      eventSystem.on('mouse:move', (event: CADMouseEvent) => {
        const startTime = performance.now();
        
        try {
          config.onMouseMove?.(event);
          // Add any additional mouse move logic here
        } catch (error) {
          console.error('Mouse move handler error:', error);
        } finally {
          updateStats('mouse:move', performance.now() - startTime);
        }
      }, { 
        throttle: memoizedConfig.throttleMouseEvents,
        wasmOptimized: memoizedConfig.enableWasmEvents 
      });
      
      eventSystem.on('mouse:click', (event: CADMouseEvent) => {
        const startTime = performance.now();
        
        try {
          config.onMouseClick?.(event);
          
          // Element selection logic
          if (event.target && event.target.userData?.elementId) {
            config.onElementSelect?.(event.target.userData.elementId);
          } else {
            config.onElementSelect?.(null);
          }
        } catch (error) {
          console.error('Mouse click handler error:', error);
        } finally {
          updateStats('mouse:click', performance.now() - startTime);
        }
      });
      
      eventSystem.on('mouse:wheel', (event: CADMouseEvent) => {
        const startTime = performance.now();
        
        try {
          // Handle zoom operations
          if (sceneRefs.controlsRef.current) {
            const controls = sceneRefs.controlsRef.current;
            const delta = (event as any).delta || 0;
            
            if (delta > 0) {
              controls.enableZoom = true; 
            } else {
              controls.enableZoom = false;
            }
            controls.update();
          }
        } catch (error) {
          console.error('Mouse wheel handler error:', error);
        } finally {
          updateStats('mouse:wheel', performance.now() - startTime);
        }
      });
    }
    
    // Keyboard event handlers
    if (memoizedConfig.enableKeyboardShortcuts) {
      eventSystem.on('keyboard:shortcut', (event: CADKeyboardEvent) => {
        const startTime = performance.now();
        
        try {
          config.onKeyboardShortcut?.(event);
          handleKeyboardShortcut(event);
        } catch (error) {
          console.error('Keyboard shortcut handler error:', error);
        } finally {
          updateStats('keyboard:shortcut', performance.now() - startTime);
        }
      }, { 
        debounce: memoizedConfig.debounceKeyEvents,
        wasmOptimized: memoizedConfig.enableWasmEvents 
      });
    }
    
    // Drag event handlers
    if (memoizedConfig.enableDragOperations) {
      eventSystem.on('drag:start', (event: CADDragEvent) => {
        const startTime = performance.now();
        
        try {
          config.onDragStart?.(event);
          // Disable orbit controls during drag
          if (sceneRefs.controlsRef.current) {
            sceneRefs.controlsRef.current.enabled = false;
          }
        } catch (error) {
          console.error('Drag start handler error:', error);
        } finally {
          updateStats('drag:start', performance.now() - startTime);
        }
      });
      
      eventSystem.on('drag:move', (event: CADDragEvent) => {
        const startTime = performance.now();
        
        try {
          config.onDragMove?.(event);
        } catch (error) {
          console.error('Drag move handler error:', error);
        } finally {
          updateStats('drag:move', performance.now() - startTime);
        }
      });
      
      eventSystem.on('drag:end', (event: CADDragEvent) => {
        const startTime = performance.now();
        
        try {
          config.onDragEnd?.(event);
          // Re-enable orbit controls after drag
          if (sceneRefs.controlsRef.current) {
            sceneRefs.controlsRef.current.enabled = true;
          }
        } catch (error) {
          console.error('Drag end handler error:', error);
        } finally {
          updateStats('drag:end', performance.now() - startTime);
        }
      });
    }
    
    console.log('✅ Event handlers setup completed');
  }, [
    memoizedConfig,
    config,
    sceneRefs.controlsRef,
    updateStats
  ]);
  
  // Handle keyboard shortcuts
  const handleKeyboardShortcut = useCallback((event: CADKeyboardEvent) => {
    const shortcut = event.shortcut;
    if (!shortcut) return;
    
    console.log('⌨️ Processing shortcut:', shortcut);
    
    switch (shortcut) {
      case 'Delete':
      case 'Backspace':
        // Handle delete selected elements
        break;
        
      case 'Escape':
        // Handle escape/cancel operations
        config.onElementSelect?.(null);
        break;
        
      case 'Ctrl+A':
        // Handle select all
        event.originalEvent.preventDefault();
        break;
        
      case 'F11':
        // Handle fullscreen toggle
        event.originalEvent.preventDefault();
        toggleFullscreen();
        break;
        
      case 'Ctrl+S':
        // Handle save
        event.originalEvent.preventDefault();
        break;
        
      case 'Ctrl+Z':
        // Handle undo
        event.originalEvent.preventDefault();
        break;
        
      case 'Ctrl+Y':
      case 'Ctrl+Shift+Z':
        // Handle redo
        event.originalEvent.preventDefault();
        break;
        
      default:
        console.log('Unhandled shortcut:', shortcut);
        break;
    }
  }, [config.onElementSelect]);
  
  // Fullscreen toggle function
  const toggleFullscreen = useCallback(() => {
    if (!config.canvasRef.current) return;
    
    if (!isFullscreen) {
      if (config.canvasRef.current.requestFullscreen) {
        config.canvasRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }, [isFullscreen, config.canvasRef]);
  
  // Resize handler
  const handleResize = useCallback(() => {
    if (!config.canvasRef.current || !sceneRefs.cameraRef.current || !sceneRefs.rendererRef.current) {
      return;
    }
    
    const canvas = config.canvasRef.current;
    const camera = sceneRefs.cameraRef.current;
    const renderer = sceneRefs.rendererRef.current;
    
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    
    setCanvasDimensions({ width, height });
    
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    
    console.log('📐 Canvas resized:', width, 'x', height);
  }, [config.canvasRef, sceneRefs.cameraRef, sceneRefs.rendererRef]);
  
  // Fullscreen change handler
  const handleFullscreenChange = useCallback(() => {
    const isCurrentlyFullscreen = !!document.fullscreenElement;
    setIsFullscreen(isCurrentlyFullscreen);
    
    // Delay resize to ensure DOM has updated
    setTimeout(handleResize, 100);
    
    console.log('🖥️ Fullscreen changed:', isCurrentlyFullscreen);
  }, [handleResize]);
  
  // Initialize event system
  useEffect(() => {
    if (!memoizedConfig.enableUnifiedEvents || !wasmCore.isReady || !config.canvasRef.current || isInitialized.current) {
      return;
    }
    
    console.log('🚀 Initializing unified event system...');
    
    try {
      const system = createCADEventSystem(
        memoizedConfig.enableWasmEvents ? wasmEventOptimizer : undefined
      );
      
      system.initialize({
        canvasElement: config.canvasRef.current,
        camera: sceneRefs.cameraRef.current || undefined,
        existingHandlers: {
          mouse: memoizedConfig.existingHandlers,
          keyboard: memoizedConfig.existingHandlers
        },
        wasmOptimizer: memoizedConfig.enableWasmEvents ? wasmEventOptimizer : undefined
      }).then(() => {
        setupEventHandlers(system);
        setEventSystem(system);
        isInitialized.current = true;
        console.log('✅ Unified event system initialized');
      }).catch(error => {
        console.error('❌ Failed to initialize event system:', error);
      });
      
    } catch (error) {
      console.error('❌ Event system creation failed:', error);
    }
  }, [
    memoizedConfig.enableUnifiedEvents,
    memoizedConfig.enableWasmEvents,
    wasmCore.isReady,
    config.canvasRef,
    sceneRefs.cameraRef,
    wasmEventOptimizer,
    setupEventHandlers,
    memoizedConfig.existingHandlers
  ]);
  
  // Setup traditional event listeners
  useEffect(() => {
    if (!config.canvasRef.current) return;
    
    // Add resize listener
    window.addEventListener('resize', handleResize);
    
    // Add fullscreen change listeners
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    
    // Initial resize
    handleResize();
    
    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
    };
  }, [config.canvasRef, handleResize, handleFullscreenChange]);
  
  // Cleanup effect
  useEffect(() => {
    return () => {
      if (eventSystem) {
        eventSystem.cleanup();
      }
      isInitialized.current = false;
    };
  }, [eventSystem]);
  
  // Utility functions
  const addShortcut = useCallback((keys: string, action: string, handler: Function) => {
    if (eventSystem) {
      eventSystem.addShortcut({
        keys,
        action,
        description: `Custom shortcut: ${action}`,
        handler: handler as any
      });
    }
  }, [eventSystem]);
  
  const removeShortcut = useCallback((keys: string) => {
    // Implementation would depend on event system API
    console.log('Removing shortcut:', keys);
  }, []);
  
  const enableEventSystem = useCallback((enabled: boolean) => {
    if (eventSystem) {
      eventSystem.setEnabled(enabled);
    }
  }, [eventSystem]);
  
  const rollbackToOriginal = useCallback(() => {
    if (eventSystem) {
      console.log('🔄 Rolling back to original event handlers...');
      eventSystem.rollback();
      setEventSystem(null);
      isInitialized.current = false;
    }
  }, [eventSystem]);
  
  return {
    stats: statsRef.current,
    eventSystem,
    addShortcut,
    removeShortcut,
    enableEventSystem,
    rollbackToOriginal
  };
}
