// Event Types for CAD Canvas Event System
// Phase 3 - Step 3.1: Unified Event System

import * as THREE from 'three';

/**
 * Core event types for CAD operations
 */
export type CADEventType = 
  | 'mouse:move'
  | 'mouse:click' 
  | 'mouse:down'
  | 'mouse:up'
  | 'mouse:wheel'
  | 'keyboard:keydown'
  | 'keyboard:keyup'
  | 'keyboard:shortcut'
  | 'drag:start'
  | 'drag:move'
  | 'drag:end'
  | 'touch:start'
  | 'touch:move'
  | 'touch:end'
  | 'canvas:resize'
  | 'canvas:fullscreen'
  | 'element:select'
  | 'element:hover'
  | 'element:transform'
  | 'scene:update'
  | 'performance:optimize';

/**
 * Mouse event data structure
 */
export interface CADMouseEvent {
  type: 'mouse:move' | 'mouse:click' | 'mouse:down' | 'mouse:up' | 'mouse:wheel';
  originalEvent: MouseEvent | WheelEvent;
  position: {
    screen: { x: number; y: number };
    normalized: { x: number; y: number };
    world?: { x: number; y: number; z: number };
  };
  button?: number;
  buttons?: number;
  delta?: number; // For wheel events
  target?: THREE.Object3D | null;
  timestamp: number;
  modifiers: {
    shift: boolean;
    ctrl: boolean;
    alt: boolean;
    meta: boolean;
  };
}

/**
 * Keyboard event data structure
 */
export interface CADKeyboardEvent {
  type: 'keyboard:keydown' | 'keyboard:keyup' | 'keyboard:shortcut';
  originalEvent: KeyboardEvent;
  key: string;
  code: string;
  timestamp: number;
  modifiers: {
    shift: boolean;
    ctrl: boolean;
    alt: boolean;
    meta: boolean;
  };
  shortcut?: string; // For shortcut events like "Ctrl+S"
}

/**
 * Drag event data structure
 */
export interface CADDragEvent {
  type: 'drag:start' | 'drag:move' | 'drag:end';
  startPosition: { x: number; y: number; z?: number };
  currentPosition: { x: number; y: number; z?: number };
  deltaPosition: { x: number; y: number; z?: number };
  target?: THREE.Object3D | null;
  dragType: 'element' | 'component' | 'control-point' | 'selection';
  timestamp: number;
}

/**
 * Touch event data structure
 */
export interface CADTouchEvent {
  type: 'touch:start' | 'touch:move' | 'touch:end';
  originalEvent: TouchEvent;
  touches: Array<{
    id: number;
    position: { x: number; y: number };
    force?: number;
  }>;
  timestamp: number;
}

/**
 * Element interaction events
 */
export interface CADElementEvent {
  type: 'element:select' | 'element:hover' | 'element:transform';
  elementId: string;
  element?: any; // CAD element data
  target?: THREE.Object3D;
  position?: { x: number; y: number; z: number };
  previousValue?: any; // For transform events
  newValue?: any; // For transform events
  timestamp: number;
}

/**
 * Scene and canvas events
 */
export interface CADSceneEvent {
  type: 'canvas:resize' | 'canvas:fullscreen' | 'scene:update' | 'performance:optimize';
  data?: {
    width?: number;
    height?: number;
    isFullscreen?: boolean;
    elementCount?: number;
    performanceMetrics?: {
      fps: number;
      triangleCount: number;
      drawCalls: number;
    };
  };
  timestamp: number;
}

/**
 * Union type for all CAD events
 */
export type CADEvent = 
  | CADMouseEvent 
  | CADKeyboardEvent 
  | CADDragEvent 
  | CADTouchEvent 
  | CADElementEvent 
  | CADSceneEvent;

/**
 * Event listener function type
 */
export type CADEventListener<T extends CADEvent = CADEvent> = (event: T) => void | Promise<void>;

/**
 * Event handler options
 */
export interface EventHandlerOptions {
  once?: boolean; // Execute only once
  passive?: boolean; // Never calls preventDefault
  priority?: 'high' | 'normal' | 'low'; // Execution order
  wasmOptimized?: boolean; // Use WASM optimization if available
  debounce?: number; // Debounce time in ms
  throttle?: number; // Throttle time in ms
}

/**
 * WASM event optimization interface
 */
export interface WasmEventOptimizer {
  optimizeMouseEvent?(event: CADMouseEvent): CADMouseEvent;
  optimizeKeyboardEvent?(event: CADKeyboardEvent): CADKeyboardEvent;
  optimizeDragEvent?(event: CADDragEvent): CADDragEvent;
  batchProcessEvents?(events: CADEvent[]): CADEvent[];
  calculateWorldPosition?(screenPos: { x: number; y: number }, camera: THREE.Camera): { x: number; y: number; z: number } | null;
}

/**
 * Event performance metrics
 */
export interface EventPerformanceMetrics {
  totalEvents: number;
  eventsPerSecond: number;
  averageProcessingTime: number;
  wasmOptimizedPercentage: number;
  memoryUsage: number;
}

/**
 * Rollback configuration for safe event system transition
 */
export interface EventSystemRollbackConfig {
  enableUnifiedEvents: boolean;
  enableWasmOptimization: boolean;
  enablePerformanceMonitoring: boolean;
  fallbackToOriginal: boolean;
  preserveOriginalHandlers: boolean;
}
