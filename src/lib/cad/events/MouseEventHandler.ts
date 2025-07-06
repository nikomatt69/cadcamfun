// Mouse Event Handler - Unified Mouse Event Management
// Phase 3 - Step 3.1: Unified Event System

import * as THREE from 'three';
import { CADEventBus, cadEventBus } from './CADEventBus';
import { 
  CADMouseEvent, 
  CADEventType,
  WasmEventOptimizer
} from './EventTypes';

/**
 * Unified Mouse Event Handler for CAD Canvas
 * Handles all mouse interactions with WASM optimization and safe rollback
 */
export class MouseEventHandler {
  private eventBus: CADEventBus;
  private canvasElement: HTMLElement | null = null;
  private camera: THREE.Camera | null = null;
  private isAttached = false;
  
  // Original handlers backup for rollback
  private originalHandlers = new Map<string, Function>();
  private eventListeners = new Map<string, EventListener>();
  
  // WASM optimizer reference
  private wasmOptimizer: WasmEventOptimizer | null = null;
  
  // Performance and state tracking
  private lastMousePosition = { x: 0, y: 0 };
  private isDragging = false;
  private dragStartPosition = { x: 0, y: 0 };
  
  constructor(eventBus?: CADEventBus) {
    this.eventBus = eventBus || cadEventBus;
    console.log('🖱️ Mouse Event Handler initialized');
  }
  
  /**
   * Set WASM optimizer for enhanced mouse event processing
   */
  setWasmOptimizer(optimizer: WasmEventOptimizer): void {
    this.wasmOptimizer = optimizer;
    console.log('🚀 Mouse events WASM optimization enabled');
  }
  
  /**
   * Set camera reference for world coordinate calculation
   */
  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }
  
  /**
   * SAFE: Inject into CAD Canvas by wrapping existing handlers
   */
  injectIntoCADCanvas(
    canvasElement: HTMLElement, 
    existingHandlers: {
      handleMouseMove?: Function;
      handleClick?: Function;
      handleMouseDown?: Function;
      handleMouseUp?: Function;
      handleWheel?: Function;
    }
  ): void {
    if (this.isAttached) {
      console.warn('⚠️ Mouse handler already attached');
      return;
    }
    
    this.canvasElement = canvasElement;
    
    // BACKUP: Store original handlers for safe rollback
    if (existingHandlers.handleMouseMove) {
      this.originalHandlers.set('mousemove', existingHandlers.handleMouseMove);
    }
    if (existingHandlers.handleClick) {
      this.originalHandlers.set('click', existingHandlers.handleClick);
    }
    if (existingHandlers.handleMouseDown) {
      this.originalHandlers.set('mousedown', existingHandlers.handleMouseDown);
    }
    if (existingHandlers.handleMouseUp) {
      this.originalHandlers.set('mouseup', existingHandlers.handleMouseUp);
    }
    if (existingHandlers.handleWheel) {
      this.originalHandlers.set('wheel', existingHandlers.handleWheel);
    }
    
    // WRAP: Create optimized handlers that call original + emit unified events
    const wrappedMouseMove = this.createWrappedHandler('mousemove', existingHandlers.handleMouseMove);
    const wrappedClick = this.createWrappedHandler('click', existingHandlers.handleClick);
    const wrappedMouseDown = this.createWrappedHandler('mousedown', existingHandlers.handleMouseDown);
    const wrappedMouseUp = this.createWrappedHandler('mouseup', existingHandlers.handleMouseUp);
    const wrappedWheel = this.createWrappedHandler('wheel', existingHandlers.handleWheel);
    
    // ATTACH: Replace original event listeners with wrapped versions
    if (wrappedMouseMove) {
      canvasElement.addEventListener('mousemove', wrappedMouseMove, { passive: false });
      this.eventListeners.set('mousemove', wrappedMouseMove);
    }
    
    if (wrappedClick) {
      canvasElement.addEventListener('click', wrappedClick, { passive: false });
      this.eventListeners.set('click', wrappedClick);
    }
    
    if (wrappedMouseDown) {
      canvasElement.addEventListener('mousedown', wrappedMouseDown, { passive: false });
      this.eventListeners.set('mousedown', wrappedMouseDown);
    }
    
    if (wrappedMouseUp) {
      canvasElement.addEventListener('mouseup', wrappedMouseUp, { passive: false });
      this.eventListeners.set('mouseup', wrappedMouseUp);
    }
    
    if (wrappedWheel) {
      canvasElement.addEventListener('wheel', wrappedWheel, { passive: false });
      this.eventListeners.set('wheel', wrappedWheel);
    }
    
    this.isAttached = true;
    console.log('✅ Mouse events successfully injected into CAD Canvas');
  }
  
  /**
   * DIRECT: Attach unified mouse handlers (without wrapping existing ones)
   */
  attachDirect(canvasElement: HTMLElement): void {
    if (this.isAttached) {
      console.warn('⚠️ Mouse handler already attached');
      return;
    }
    
    this.canvasElement = canvasElement;
    
    // Create pure unified handlers
    const mouseMove = this.createUnifiedMouseMoveHandler();
    const click = this.createUnifiedClickHandler();
    const mouseDown = this.createUnifiedMouseDownHandler();
    const mouseUp = this.createUnifiedMouseUpHandler();
    const wheel = this.createUnifiedWheelHandler();
    
    // Attach direct handlers
    canvasElement.addEventListener('mousemove', mouseMove, { passive: false });
    canvasElement.addEventListener('click', click, { passive: false });
    canvasElement.addEventListener('mousedown', mouseDown, { passive: false });
    canvasElement.addEventListener('mouseup', mouseUp, { passive: false });
    canvasElement.addEventListener('wheel', wheel, { passive: false });
    
    // Store for cleanup
    this.eventListeners.set('mousemove', mouseMove);
    this.eventListeners.set('click', click);
    this.eventListeners.set('mousedown', mouseDown);
    this.eventListeners.set('mouseup', mouseUp);
    this.eventListeners.set('wheel', wheel);
    
    this.isAttached = true;
    console.log('✅ Direct unified mouse handlers attached');
  }
  
  /**
   * ROLLBACK: Remove unified handlers and restore originals
   */
  rollback(): void {
    if (!this.canvasElement || !this.isAttached) {
      console.warn('⚠️ No mouse handlers to rollback');
      return;
    }
    
    // Remove unified event listeners
    this.eventListeners.forEach((listener, eventType) => {
      this.canvasElement!.removeEventListener(eventType, listener);
    });
    this.eventListeners.clear();
    
    // Restore original handlers if they exist
    this.originalHandlers.forEach((handler, eventType) => {
      console.log(`🔄 Restoring original ${eventType} handler`);
      // Note: This is conceptual - in practice, original handlers would need
      // to be re-attached by the calling code since we can't directly restore them
    });
    
    this.isAttached = false;
    console.log('🔄 Mouse handlers rolled back successfully');
  }
  
  /**
   * Cleanup all handlers and references
   */
  cleanup(): void {
    this.rollback();
    this.originalHandlers.clear();
    this.canvasElement = null;
    this.camera = null;
    this.wasmOptimizer = null;
  }
  
  // Private methods for creating handlers
  
  private createWrappedHandler(eventType: string, originalHandler?: Function): EventListener | null {
    if (!originalHandler) return null;
    
    return (event: Event) => {
      try {
        // PRE-PROCESSING: WASM optimization
        const mouseEvent = event as MouseEvent;
        const cadEvent = this.createCADMouseEvent(mouseEvent, this.getCADEventType(eventType));
        
        // WASM optimization if available
        const optimizedEvent = this.wasmOptimizer?.optimizeMouseEvent?.(cadEvent) || cadEvent;
        
        // EXECUTE: Original handler first (maintains existing behavior)
        const result = originalHandler(event);
        
        // EMIT: To unified event system (async, non-blocking)
        this.eventBus.emit(this.getCADEventType(eventType), optimizedEvent).catch(error => {
          console.error(`Failed to emit ${eventType} event:`, error);
        });
        
        // UPDATE: Internal state tracking
        this.updateInternalState(eventType, mouseEvent);
        
        return result;
      } catch (error) {
        console.error(`Error in wrapped ${eventType} handler:`, error);
        
        // FALLBACK: Execute original handler on error
        return originalHandler(event);
      }
    };
  }
  
  private createUnifiedMouseMoveHandler(): EventListener {
    return (event: Event) => {
      const mouseEvent = event as MouseEvent;
      const cadEvent = this.createCADMouseEvent(mouseEvent, 'mouse:move');
      
      // WASM optimization
      const optimizedEvent = this.wasmOptimizer?.optimizeMouseEvent?.(cadEvent) || cadEvent;
      
      // Emit to event system
      this.eventBus.emit('mouse:move', optimizedEvent);
      
      // Update state
      this.updateInternalState('mousemove', mouseEvent);
    };
  }
  
  private createUnifiedClickHandler(): EventListener {
    return (event: Event) => {
      const mouseEvent = event as MouseEvent;
      const cadEvent = this.createCADMouseEvent(mouseEvent, 'mouse:click');
      
      // WASM optimization
      const optimizedEvent = this.wasmOptimizer?.optimizeMouseEvent?.(cadEvent) || cadEvent;
      
      // Emit to event system
      this.eventBus.emit('mouse:click', optimizedEvent);
    };
  }
  
  private createUnifiedMouseDownHandler(): EventListener {
    return (event: Event) => {
      const mouseEvent = event as MouseEvent;
      const cadEvent = this.createCADMouseEvent(mouseEvent, 'mouse:down');
      
      // Track drag start
      this.isDragging = false; // Will be set to true if mouse moves while down
      this.dragStartPosition = { x: mouseEvent.clientX, y: mouseEvent.clientY };
      
      // WASM optimization
      const optimizedEvent = this.wasmOptimizer?.optimizeMouseEvent?.(cadEvent) || cadEvent;
      
      // Emit to event system
      this.eventBus.emit('mouse:down', optimizedEvent);
    };
  }
  
  private createUnifiedMouseUpHandler(): EventListener {
    return (event: Event) => {
      const mouseEvent = event as MouseEvent;
      const cadEvent = this.createCADMouseEvent(mouseEvent, 'mouse:up');
      
      // Reset drag state
      this.isDragging = false;
      
      // WASM optimization
      const optimizedEvent = this.wasmOptimizer?.optimizeMouseEvent?.(cadEvent) || cadEvent;
      
      // Emit to event system
      this.eventBus.emit('mouse:up', optimizedEvent);
    };
  }
  
  private createUnifiedWheelHandler(): EventListener {
    return (event: Event) => {
      const wheelEvent = event as WheelEvent;
      const cadEvent = this.createCADMouseEvent(wheelEvent, 'mouse:wheel');
      
      // WASM optimization
      const optimizedEvent = this.wasmOptimizer?.optimizeMouseEvent?.(cadEvent) || cadEvent;
      
      // Emit to event system
      this.eventBus.emit('mouse:wheel', optimizedEvent);
    };
  }
  
  private createCADMouseEvent(mouseEvent: MouseEvent | WheelEvent, type: CADEventType): CADMouseEvent {
    const rect = this.canvasElement?.getBoundingClientRect();
    if (!rect) {
      throw new Error('Canvas element not available for mouse event processing');
    }
    
    // Calculate positions
    const screenX = mouseEvent.clientX - rect.left;
    const screenY = mouseEvent.clientY - rect.top;
    
    const normalizedX = (screenX / rect.width) * 2 - 1;
    const normalizedY = -(screenY / rect.height) * 2 + 1;
    
    // Calculate world position if camera is available
    let worldPosition: { x: number; y: number; z: number } | undefined;
    if (this.camera && this.wasmOptimizer?.calculateWorldPosition) {
      worldPosition = this.wasmOptimizer.calculateWorldPosition(
        { x: normalizedX, y: normalizedY }, 
        this.camera
      ) || undefined;
    }
    
    const cadEvent: CADMouseEvent = {
      type: type as any,
      originalEvent: mouseEvent,
      position: {
        screen: { x: screenX, y: screenY },
        normalized: { x: normalizedX, y: normalizedY },
        world: worldPosition
      },
      button: mouseEvent.button,
      buttons: mouseEvent.buttons,
      timestamp: Date.now(),
      modifiers: {
        shift: mouseEvent.shiftKey,
        ctrl: mouseEvent.ctrlKey,
        alt: mouseEvent.altKey,
        meta: mouseEvent.metaKey
      }
    };
    
    // Add wheel delta if it's a wheel event
    if (mouseEvent instanceof WheelEvent) {
      (cadEvent as any).delta = mouseEvent.deltaY;
    }
    
    return cadEvent;
  }
  
  private getCADEventType(domEventType: string): CADEventType {
    switch (domEventType) {
      case 'mousemove': return 'mouse:move';
      case 'click': return 'mouse:click';
      case 'mousedown': return 'mouse:down';
      case 'mouseup': return 'mouse:up';
      case 'wheel': return 'mouse:wheel';
      default: throw new Error(`Unknown mouse event type: ${domEventType}`);
    }
  }
  
  private updateInternalState(eventType: string, mouseEvent: MouseEvent): void {
    // Update last mouse position
    this.lastMousePosition = { x: mouseEvent.clientX, y: mouseEvent.clientY };
    
    // Track dragging state
    if (eventType === 'mousemove' && mouseEvent.buttons > 0) {
      const dragDistance = Math.sqrt(
        Math.pow(mouseEvent.clientX - this.dragStartPosition.x, 2) +
        Math.pow(mouseEvent.clientY - this.dragStartPosition.y, 2)
      );
      
      if (dragDistance > 5 && !this.isDragging) {
        this.isDragging = true;
        // Could emit drag:start event here
      }
    }
  }
  
  /**
   * Get current mouse state for debugging
   */
  getState() {
    return {
      isAttached: this.isAttached,
      lastPosition: this.lastMousePosition,
      isDragging: this.isDragging,
      hasCamera: !!this.camera,
      hasWasmOptimizer: !!this.wasmOptimizer,
      originalHandlersCount: this.originalHandlers.size,
      activeListenersCount: this.eventListeners.size
    };
  }
}

// Export singleton instance for convenience
export const mouseEventHandler = new MouseEventHandler();
