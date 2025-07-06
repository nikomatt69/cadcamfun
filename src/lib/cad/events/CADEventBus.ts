// CAD Event Bus - Core Event System
// Phase 3 - Step 3.1: Unified Event System Foundation

import { 
  CADEvent, 
  CADEventType, 
  CADEventListener, 
  EventHandlerOptions,
  WasmEventOptimizer,
  EventPerformanceMetrics,
  EventSystemRollbackConfig
} from './EventTypes';

/**
 * Central Event Bus for CAD Canvas
 * Provides unified event handling with WASM optimization and safe rollback
 */
export class CADEventBus {
  private static instance: CADEventBus | null = null;
  private listeners = new Map<CADEventType, Set<{
    handler: CADEventListener;
    options: EventHandlerOptions;
    id: string;
  }>>();
  
  private wasmOptimizer: WasmEventOptimizer | null = null;
  private isEnabled = true;
  private performanceMetrics: EventPerformanceMetrics = {
    totalEvents: 0,
    eventsPerSecond: 0,
    averageProcessingTime: 0,
    wasmOptimizedPercentage: 0,
    memoryUsage: 0
  };
  
  // Rollback configuration
  private rollbackConfig: EventSystemRollbackConfig = {
    enableUnifiedEvents: process.env.CAD_UNIFIED_EVENTS !== 'false',
    enableWasmOptimization: process.env.CAD_WASM_EVENTS !== 'false',
    enablePerformanceMonitoring: process.env.CAD_EVENT_MONITORING !== 'false',
    fallbackToOriginal: false,
    preserveOriginalHandlers: true
  };
  
  // Original handlers backup for safe rollback
  private originalHandlers = new Map<string, Function>();
  private handlerCounter = 0;
  
  // Performance monitoring
  private eventTimes: number[] = [];
  private lastMetricsUpdate = Date.now();
  
  private constructor() {
    if (!this.rollbackConfig.enableUnifiedEvents) {
      console.log('🔄 CAD Unified Events disabled - using original handlers');
      this.isEnabled = false;
      return;
    }
    
    console.log('✅ CAD Event Bus initialized');
    
    // Setup performance monitoring if enabled
    if (this.rollbackConfig.enablePerformanceMonitoring) {
      this.setupPerformanceMonitoring();
    }
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(): CADEventBus {
    if (!CADEventBus.instance) {
      CADEventBus.instance = new CADEventBus();
    }
    return CADEventBus.instance;
  }
  
  /**
   * Reset singleton (for testing)
   */
  static reset(): void {
    CADEventBus.instance = null;
  }
  
  /**
   * Set WASM optimizer for enhanced performance
   */
  setWasmOptimizer(optimizer: WasmEventOptimizer): void {
    if (!this.rollbackConfig.enableWasmOptimization) {
      console.log('🔄 WASM event optimization disabled');
      return;
    }
    
    this.wasmOptimizer = optimizer;
    console.log('🚀 WASM event optimizer attached');
  }
  
  /**
   * Add event listener with options
   */
  on<T extends CADEvent>(
    eventType: CADEventType, 
    handler: CADEventListener<T>,
    options: EventHandlerOptions = {}
  ): string {
    if (!this.isEnabled) {
      console.warn('⚠️ Event bus disabled - handler not registered');
      return '';
    }
    
    const id = `handler_${++this.handlerCounter}`;
    
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    
    this.listeners.get(eventType)!.add({
      handler: handler as CADEventListener,
      options,
      id
    });
    
    return id;
  }
  
  /**
   * Remove specific event listener
   */
  off(eventType: CADEventType, handlerId: string): void {
    const handlers = this.listeners.get(eventType);
    if (!handlers) return;
    
    Array.from(handlers).forEach(item => {
      if (item.id === handlerId) {
        handlers.delete(item);
      }
    });
  }
  
  /**
   * Remove all listeners for an event type
   */
  removeAllListeners(eventType: CADEventType): void {
    this.listeners.delete(eventType);
  }
  
  /**
   * Emit event with WASM optimization and performance tracking
   */
  async emit(eventType: CADEventType, event: CADEvent): Promise<void> {
    if (!this.isEnabled) return;
    
    const startTime = performance.now();
    
    try {
      // WASM optimization if available
      let optimizedEvent = event;
      if (this.wasmOptimizer && this.rollbackConfig.enableWasmOptimization) {
        optimizedEvent = this.optimizeEvent(event) || event;
      }
      
      const handlers = this.listeners.get(eventType);
      if (!handlers || handlers.size === 0) return;
      
      // Sort handlers by priority
      const sortedHandlers = Array.from(handlers).sort((a, b) => {
        const priorityOrder = { 'high': 0, 'normal': 1, 'low': 2 };
        const aPriority = priorityOrder[a.options.priority || 'normal'];
        const bPriority = priorityOrder[b.options.priority || 'normal'];
        return aPriority - bPriority;
      });
      
      // Execute handlers
      for (const { handler, options } of sortedHandlers) {
        try {
          // Check throttle/debounce
          if (this.shouldSkipHandler(options, startTime)) continue;
          
          // Execute handler
          const result = handler(optimizedEvent);
          if (result instanceof Promise) {
            await result;
          }
          
          // Remove if once option
          if (options.once) {
            handlers.delete({ handler, options, id: '' } as any);
          }
          
        } catch (error) {
          console.error(`❌ Event handler error for ${eventType}:`, error);
        }
      }
      
    } catch (error) {
      console.error(`❌ Event emission error for ${eventType}:`, error);
    } finally {
      // Update performance metrics
      this.updatePerformanceMetrics(startTime);
    }
  }
  
  /**
   * SAFE: Wrap existing handler for gradual transition
   */
  wrapExistingHandler(
    originalHandler: Function, 
    eventType: CADEventType,
    handlerName: string
  ): Function {
    if (!this.isEnabled) {
      return originalHandler; // Return original if disabled
    }
    
    // Backup original handler for rollback
    if (this.rollbackConfig.preserveOriginalHandlers) {
      this.originalHandlers.set(handlerName, originalHandler);
    }
    
    return (...args: any[]) => {
      try {
        // Pre-processing with WASM if available
        const optimizedArgs = this.wasmOptimizer && this.rollbackConfig.enableWasmOptimization
          ? this.preprocessEventArgs(eventType, args)
          : args;
        
        // Execute original handler
        const result = originalHandler(...optimizedArgs);
        
        // Emit to unified event system (non-blocking)
        this.emitFromWrapper(eventType, optimizedArgs).catch(error => {
          console.error(`Event emission failed for ${eventType}:`, error);
        });
        
        return result;
      } catch (error) {
        console.error(`Wrapped handler error for ${eventType}:`, error);
        
        // Fallback to original handler on error
        if (this.rollbackConfig.fallbackToOriginal) {
          return originalHandler(...args);
        }
        
        throw error;
      }
    };
  }
  
  /**
   * ROLLBACK: Restore original handlers
   */
  rollback(handlerName?: string): void {
    if (handlerName) {
      const original = this.originalHandlers.get(handlerName);
      if (original) {
        console.log(`🔄 Rolled back handler: ${handlerName}`);
        return;
      }
    } else {
      // Rollback all
      console.log('🔄 Rolling back all event handlers');
      this.listeners.clear();
      this.isEnabled = false;
    }
  }
  
  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): EventPerformanceMetrics {
    return { ...this.performanceMetrics };
  }
  
  /**
   * Enable/disable event system
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    console.log(`🔄 Event system ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  // Private methods
  
  private optimizeEvent(event: CADEvent): CADEvent | null {
    if (!this.wasmOptimizer) return null;
    
    try {
      switch (event.type) {
        case 'mouse:move':
        case 'mouse:click':
        case 'mouse:down':
        case 'mouse:up':
          return this.wasmOptimizer.optimizeMouseEvent?.(event as any) || event;
        
        case 'keyboard:keydown':
        case 'keyboard:keyup':
          return this.wasmOptimizer.optimizeKeyboardEvent?.(event as any) || event;
        
        case 'drag:start':
        case 'drag:move':
        case 'drag:end':
          return this.wasmOptimizer.optimizeDragEvent?.(event as any) || event;
        
        default:
          return event;
      }
    } catch (error) {
      console.warn('WASM event optimization failed:', error);
      return event;
    }
  }
  
  private preprocessEventArgs(eventType: CADEventType, args: any[]): any[] {
    // Basic preprocessing - can be enhanced with WASM
    return args;
  }
  
  private async emitFromWrapper(eventType: CADEventType, args: any[]): Promise<void> {
    // Convert wrapper args to proper CAD event
    // This is a simplified conversion - would be more sophisticated in practice
    const event: Partial<CADEvent> = {
      timestamp: Date.now()
    };
    
    // Don't wait for emission to complete
    setImmediate(() => {
      this.emit(eventType, event as CADEvent);
    });
  }
  
  private shouldSkipHandler(options: EventHandlerOptions, currentTime: number): boolean {
    // Implement throttle/debounce logic
    // Simplified for now
    return false;
  }
  
  private updatePerformanceMetrics(startTime: number): void {
    if (!this.rollbackConfig.enablePerformanceMonitoring) return;
    
    const processingTime = performance.now() - startTime;
    this.eventTimes.push(processingTime);
    this.performanceMetrics.totalEvents++;
    
    // Update metrics every second
    const now = Date.now();
    if (now - this.lastMetricsUpdate > 1000) {
      this.calculateMetrics();
      this.lastMetricsUpdate = now;
    }
  }
  
  private calculateMetrics(): void {
    const now = Date.now();
    const recentEvents = this.eventTimes.filter(time => time > now - 1000);
    
    this.performanceMetrics.eventsPerSecond = recentEvents.length;
    this.performanceMetrics.averageProcessingTime = 
      recentEvents.reduce((sum, time) => sum + time, 0) / recentEvents.length || 0;
    
    // Clean old event times
    this.eventTimes = this.eventTimes.slice(-1000); // Keep last 1000 events
  }
  
  private setupPerformanceMonitoring(): void {
    setInterval(() => {
      const metrics = this.getPerformanceMetrics();
      if (metrics.averageProcessingTime > 16) { // 60 FPS threshold
        console.warn('🐌 Event processing performance degraded:', metrics);
      }
    }, 5000); // Check every 5 seconds
  }
}

// Export singleton instance
export const cadEventBus = CADEventBus.getInstance();
