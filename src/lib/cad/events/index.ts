// CAD Events System - Main Export File
// Phase 3 - Step 3.1: Unified Event System

export * from './EventTypes';
export * from './CADEventBus';
export * from './MouseEventHandler';
export * from './KeyboardEventHandler';

// Singleton instances for easy access
export { cadEventBus } from './CADEventBus';
export { mouseEventHandler } from './MouseEventHandler';
export { keyboardEventHandler } from './KeyboardEventHandler';

// Convenience factory function for complete event system setup
import { CADEventBus } from './CADEventBus';
import { MouseEventHandler } from './MouseEventHandler';
import { KeyboardEventHandler } from './KeyboardEventHandler';
import { WasmEventOptimizer } from './EventTypes';

/**
 * Unified CAD Event System
 * Combines all event handlers into a single, easy-to-use interface
 */
export class CADEventSystem {
  private eventBus: CADEventBus;
  private mouseHandler: MouseEventHandler;
  private keyboardHandler: KeyboardEventHandler;
  private isInitialized = false;
  
  constructor(wasmOptimizer?: WasmEventOptimizer) {
    this.eventBus = CADEventBus.getInstance();
    this.mouseHandler = new MouseEventHandler(this.eventBus);
    this.keyboardHandler = new KeyboardEventHandler(this.eventBus);
    
    // Set WASM optimizer if provided
    if (wasmOptimizer) {
      this.setWasmOptimizer(wasmOptimizer);
    }
  }
  
  /**
   * Initialize the complete event system for CAD Canvas
   */
  async initialize(options: {
    canvasElement: HTMLElement;
    camera?: THREE.Camera;
    existingHandlers?: {
      mouse?: {
        handleMouseMove?: Function;
        handleClick?: Function;
        handleMouseDown?: Function;
        handleMouseUp?: Function;
        handleWheel?: Function;
      };
      keyboard?: {
        handleKeyDown?: Function;
        handleKeyUp?: Function;
      };
    };
    wasmOptimizer?: WasmEventOptimizer;
  }): Promise<void> {
    if (this.isInitialized) {
      console.warn('⚠️ CAD Event System already initialized');
      return;
    }
    
    try {
      // Set camera for world coordinate calculations
      if (options.camera) {
        this.mouseHandler.setCamera(options.camera);
      }
      
      // Set WASM optimizer
      if (options.wasmOptimizer) {
        this.setWasmOptimizer(options.wasmOptimizer);
      }
      
      // Initialize mouse events
      if (options.existingHandlers?.mouse) {
        this.mouseHandler.injectIntoCADCanvas(
          options.canvasElement,
          options.existingHandlers.mouse
        );
      } else {
        this.mouseHandler.attachDirect(options.canvasElement);
      }
      
      // Initialize keyboard events
      if (options.existingHandlers?.keyboard) {
        this.keyboardHandler.injectIntoCADCanvas(
          window,
          options.existingHandlers.keyboard
        );
      } else {
        this.keyboardHandler.attachDirect(window);
      }
      
      this.isInitialized = true;
      console.log('✅ CAD Event System fully initialized');
      
    } catch (error) {
      console.error('❌ Failed to initialize CAD Event System:', error);
      throw error;
    }
  }
  
  /**
   * Set WASM optimizer for all event handlers
   */
  setWasmOptimizer(optimizer: WasmEventOptimizer): void {
    this.eventBus.setWasmOptimizer(optimizer);
    this.mouseHandler.setWasmOptimizer(optimizer);
    this.keyboardHandler.setWasmOptimizer(optimizer);
  }
  
  /**
   * Add event listener to the unified system
   */
  on<T extends import('./EventTypes').CADEvent>(
    eventType: import('./EventTypes').CADEventType,
    handler: import('./EventTypes').CADEventListener<T>,
    options?: import('./EventTypes').EventHandlerOptions
  ): string {
    return this.eventBus.on(eventType, handler, options);
  }
  
  /**
   * Remove event listener
   */
  off(eventType: import('./EventTypes').CADEventType, handlerId: string): void {
    this.eventBus.off(eventType, handlerId);
  }
  
  /**
   * Emit event manually
   */
  emit(eventType: import('./EventTypes').CADEventType, event: import('./EventTypes').CADEvent): void {
    this.eventBus.emit(eventType, event);
  }
  
  /**
   * Add keyboard shortcut
   */
  addShortcut(shortcut: {
    keys: string;
    action: string;
    description: string;
    handler?: (event: import('./EventTypes').CADKeyboardEvent) => void;
  }): void {
    this.keyboardHandler.addShortcut(shortcut);
  }
  
  /**
   * Get performance metrics
   */
  getMetrics(): import('./EventTypes').EventPerformanceMetrics {
    return this.eventBus.getPerformanceMetrics();
  }
  
  /**
   * Get current state of all handlers
   */
  getState() {
    return {
      eventBus: this.eventBus.getPerformanceMetrics(),
      mouse: this.mouseHandler.getState(),
      keyboard: this.keyboardHandler.getState(),
      isInitialized: this.isInitialized
    };
  }
  
  /**
   * ROLLBACK: Safely restore to original event handling
   */
  rollback(): void {
    console.log('🔄 Rolling back CAD Event System...');
    
    this.mouseHandler.rollback();
    this.keyboardHandler.rollback();
    this.eventBus.rollback();
    
    this.isInitialized = false;
    console.log('✅ CAD Event System rollback completed');
  }
  
  /**
   * Complete cleanup and disposal
   */
  cleanup(): void {
    this.rollback();
    this.mouseHandler.cleanup();
    this.keyboardHandler.cleanup();
  }
  
  /**
   * Enable/disable the entire event system
   */
  setEnabled(enabled: boolean): void {
    this.eventBus.setEnabled(enabled);
    console.log(`🔄 CAD Event System ${enabled ? 'enabled' : 'disabled'}`);
  }
}

/**
 * Create a new CAD Event System instance
 */
export function createCADEventSystem(wasmOptimizer?: WasmEventOptimizer): CADEventSystem {
  return new CADEventSystem(wasmOptimizer);
}

/**
 * Feature flag check for unified events
 */
export function isUnifiedEventsEnabled(): boolean {
  return process.env.CAD_UNIFIED_EVENTS !== 'false';
}

/**
 * Feature flag check for WASM optimization
 */
export function isWasmEventsEnabled(): boolean {
  return process.env.CAD_WASM_EVENTS !== 'false';
}
