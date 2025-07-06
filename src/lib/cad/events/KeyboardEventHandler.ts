// Keyboard Event Handler - Unified Keyboard Event Management
// Phase 3 - Step 3.1: Unified Event System

import { CADEventBus, cadEventBus } from './CADEventBus';
import { 
  CADKeyboardEvent, 
  CADEventType,
  WasmEventOptimizer
} from './EventTypes';

/**
 * Keyboard shortcut definitions for CAD operations
 */
interface CADShortcut {
  keys: string; // e.g., "Ctrl+S", "Delete", "Escape"
  action: string;
  description: string;
  handler?: (event: CADKeyboardEvent) => void;
}

/**
 * Unified Keyboard Event Handler for CAD Canvas
 * Handles all keyboard interactions, shortcuts, and text input with WASM optimization
 */
export class KeyboardEventHandler {
  private eventBus: CADEventBus;
  private isAttached = false;
  
  // Original handlers backup for rollback
  private originalHandlers = new Map<string, Function>();
  private eventListeners = new Map<string, EventListener>();
  
  // WASM optimizer reference
  private wasmOptimizer: WasmEventOptimizer | null = null;
  
  // Keyboard state tracking
  private pressedKeys = new Set<string>();
  private shortcuts = new Map<string, CADShortcut>();
  private keySequence: string[] = [];
  private sequenceTimeout: NodeJS.Timeout | null = null;
  
  // Default CAD shortcuts
  private defaultShortcuts: CADShortcut[] = [
    // File operations
    { keys: 'Ctrl+S', action: 'save', description: 'Save project' },
    { keys: 'Ctrl+O', action: 'open', description: 'Open project' },
    { keys: 'Ctrl+N', action: 'new', description: 'New project' },
    { keys: 'Ctrl+Z', action: 'undo', description: 'Undo last action' },
    { keys: 'Ctrl+Y', action: 'redo', description: 'Redo last action' },
    { keys: 'Ctrl+Shift+Z', action: 'redo', description: 'Redo last action' },
    
    // Selection and editing
    { keys: 'Delete', action: 'delete', description: 'Delete selected elements' },
    { keys: 'Backspace', action: 'delete', description: 'Delete selected elements' },
    { keys: 'Escape', action: 'escape', description: 'Cancel current operation' },
    { keys: 'Ctrl+A', action: 'selectAll', description: 'Select all elements' },
    { keys: 'Ctrl+C', action: 'copy', description: 'Copy selected elements' },
    { keys: 'Ctrl+V', action: 'paste', description: 'Paste elements' },
    { keys: 'Ctrl+X', action: 'cut', description: 'Cut selected elements' },
    { keys: 'Ctrl+D', action: 'duplicate', description: 'Duplicate selected elements' },
    
    // Transform operations
    { keys: 'G', action: 'move', description: 'Move selected elements' },
    { keys: 'R', action: 'rotate', description: 'Rotate selected elements' },
    { keys: 'S', action: 'scale', description: 'Scale selected elements' },
    { keys: 'T', action: 'transform', description: 'Transform selected elements' },
    
    // View operations
    { keys: 'F', action: 'focus', description: 'Focus on selected elements' },
    { keys: 'F11', action: 'fullscreen', description: 'Toggle fullscreen' },
    { keys: 'Home', action: 'resetView', description: 'Reset camera view' },
    { keys: 'NumpadPlus', action: 'zoomIn', description: 'Zoom in' },
    { keys: 'NumpadMinus', action: 'zoomOut', description: 'Zoom out' },
    { keys: 'Plus', action: 'zoomIn', description: 'Zoom in' },
    { keys: 'Minus', action: 'zoomOut', description: 'Zoom out' },
    
    // Grid and snapping
    { keys: 'Ctrl+G', action: 'toggleGrid', description: 'Toggle grid visibility' },
    { keys: 'Ctrl+Shift+S', action: 'toggleSnap', description: 'Toggle snapping' },
    
    // Tools
    { keys: '1', action: 'selectTool', description: 'Select tool' },
    { keys: '2', action: 'moveTool', description: 'Move tool' },
    { keys: '3', action: 'rotateTool', description: 'Rotate tool' },
    { keys: '4', action: 'scaleTool', description: 'Scale tool' },
    { keys: 'L', action: 'lineTool', description: 'Line tool' },
    { keys: 'C', action: 'circleTool', description: 'Circle tool' },
    { keys: 'B', action: 'boxTool', description: 'Box tool' },
    
    // Help and debugging
    { keys: 'F1', action: 'help', description: 'Show keyboard shortcuts' },
    { keys: 'F12', action: 'debug', description: 'Toggle debug mode' },
    
    // Navigation
    { keys: 'Tab', action: 'nextElement', description: 'Select next element' },
    { keys: 'Shift+Tab', action: 'previousElement', description: 'Select previous element' },
    
    // Multi-key sequences
    { keys: 'Ctrl+Shift+P', action: 'commandPalette', description: 'Open command palette' }
  ];
  
  constructor(eventBus?: CADEventBus) {
    this.eventBus = eventBus || cadEventBus;
    this.initializeDefaultShortcuts();
    console.log('⌨️ Keyboard Event Handler initialized with', this.shortcuts.size, 'shortcuts');
  }
  
  /**
   * Set WASM optimizer for enhanced keyboard event processing
   */
  setWasmOptimizer(optimizer: WasmEventOptimizer): void {
    this.wasmOptimizer = optimizer;
    console.log('🚀 Keyboard events WASM optimization enabled');
  }
  
  /**
   * SAFE: Inject into CAD Canvas by wrapping existing handlers
   */
  injectIntoCADCanvas(
    element: HTMLElement | Window, 
    existingHandlers: {
      handleKeyDown?: Function;
      handleKeyUp?: Function;
    }
  ): void {
    if (this.isAttached) {
      console.warn('⚠️ Keyboard handler already attached');
      return;
    }
    
    // BACKUP: Store original handlers for safe rollback
    if (existingHandlers.handleKeyDown) {
      this.originalHandlers.set('keydown', existingHandlers.handleKeyDown);
    }
    if (existingHandlers.handleKeyUp) {
      this.originalHandlers.set('keyup', existingHandlers.handleKeyUp);
    }
    
    // WRAP: Create optimized handlers that call original + emit unified events
    const wrappedKeyDown = this.createWrappedHandler('keydown', existingHandlers.handleKeyDown);
    const wrappedKeyUp = this.createWrappedHandler('keyup', existingHandlers.handleKeyUp);
    
    // ATTACH: Replace original event listeners with wrapped versions
    if (wrappedKeyDown) {
      element.addEventListener('keydown', wrappedKeyDown, { passive: false });
      this.eventListeners.set('keydown', wrappedKeyDown);
    }
    
    if (wrappedKeyUp) {
      element.addEventListener('keyup', wrappedKeyUp, { passive: false });
      this.eventListeners.set('keyup', wrappedKeyUp);
    }
    
    this.isAttached = true;
    console.log('✅ Keyboard events successfully injected into CAD Canvas');
  }
  
  /**
   * DIRECT: Attach unified keyboard handlers (without wrapping existing ones)
   */
  attachDirect(element: HTMLElement | Window = window): void {
    if (this.isAttached) {
      console.warn('⚠️ Keyboard handler already attached');
      return;
    }
    
    // Create pure unified handlers
    const keyDown = this.createUnifiedKeyDownHandler();
    const keyUp = this.createUnifiedKeyUpHandler();
    
    // Attach direct handlers
    element.addEventListener('keydown', keyDown, { passive: false });
    element.addEventListener('keyup', keyUp, { passive: false });
    
    // Store for cleanup
    this.eventListeners.set('keydown', keyDown);
    this.eventListeners.set('keyup', keyUp);
    
    this.isAttached = true;
    console.log('✅ Direct unified keyboard handlers attached');
  }
  
  /**
   * Add or update a keyboard shortcut
   */
  addShortcut(shortcut: CADShortcut): void {
    const normalizedKeys = this.normalizeShortcut(shortcut.keys);
    this.shortcuts.set(normalizedKeys, shortcut);
    console.log(`⌨️ Added shortcut: ${shortcut.keys} → ${shortcut.action}`);
  }
  
  /**
   * Remove a keyboard shortcut
   */
  removeShortcut(keys: string): void {
    const normalizedKeys = this.normalizeShortcut(keys);
    if (this.shortcuts.delete(normalizedKeys)) {
      console.log(`⌨️ Removed shortcut: ${keys}`);
    }
  }
  
  /**
   * Get all registered shortcuts
   */
  getShortcuts(): CADShortcut[] {
    return Array.from(this.shortcuts.values());
  }
  
  /**
   * Check if a key combination is currently pressed
   */
  isPressed(keys: string): boolean {
    const normalizedKeys = this.normalizeShortcut(keys);
    const keyParts = normalizedKeys.split('+');
    return keyParts.every(key => this.pressedKeys.has(key));
  }
  
  /**
   * Get currently pressed keys
   */
  getPressedKeys(): string[] {
    return Array.from(this.pressedKeys);
  }
  
  /**
   * ROLLBACK: Remove unified handlers and restore originals
   */
  rollback(element: HTMLElement | Window = window): void {
    if (!this.isAttached) {
      console.warn('⚠️ No keyboard handlers to rollback');
      return;
    }
    
    // Remove unified event listeners
    this.eventListeners.forEach((listener, eventType) => {
      element.removeEventListener(eventType, listener);
    });
    this.eventListeners.clear();
    
    // Clear pressed keys state
    this.pressedKeys.clear();
    if (this.sequenceTimeout) {
      clearTimeout(this.sequenceTimeout);
      this.sequenceTimeout = null;
    }
    
    this.isAttached = false;
    console.log('🔄 Keyboard handlers rolled back successfully');
  }
  
  /**
   * Cleanup all handlers and references
   */
  cleanup(): void {
    this.rollback();
    this.originalHandlers.clear();
    this.shortcuts.clear();
    this.wasmOptimizer = null;
  }
  
  // Private methods
  
  private initializeDefaultShortcuts(): void {
    this.defaultShortcuts.forEach(shortcut => {
      this.addShortcut(shortcut);
    });
  }
  
  private createWrappedHandler(eventType: string, originalHandler?: Function): EventListener | null {
    if (!originalHandler) return null;
    
    return (event: Event) => {
      try {
        // PRE-PROCESSING: WASM optimization
        const keyboardEvent = event as KeyboardEvent;
        const cadEvent = this.createCADKeyboardEvent(keyboardEvent, this.getCADEventType(eventType));
        
        // WASM optimization if available
        const optimizedEvent = this.wasmOptimizer?.optimizeKeyboardEvent?.(cadEvent) || cadEvent;
        
        // Check for shortcuts before executing original handler
        const shortcutHandled = this.handleShortcuts(optimizedEvent);
        
        // EXECUTE: Original handler (unless shortcut was handled and prevented default)
        let result;
        if (!shortcutHandled || !keyboardEvent.defaultPrevented) {
          result = originalHandler(event);
        }
        
        // EMIT: To unified event system (async, non-blocking)
        this.eventBus.emit(this.getCADEventType(eventType), optimizedEvent).catch(error => {
          console.error(`Failed to emit ${eventType} event:`, error);
        });
        
        // UPDATE: Internal state tracking
        this.updateKeyState(eventType, keyboardEvent);
        
        return result;
      } catch (error) {
        console.error(`Error in wrapped ${eventType} handler:`, error);
        
        // FALLBACK: Execute original handler on error
        return originalHandler(event);
      }
    };
  }
  
  private createUnifiedKeyDownHandler(): EventListener {
    return (event: Event) => {
      const keyboardEvent = event as KeyboardEvent;
      const cadEvent = this.createCADKeyboardEvent(keyboardEvent, 'keyboard:keydown');
      
      // WASM optimization
      const optimizedEvent = this.wasmOptimizer?.optimizeKeyboardEvent?.(cadEvent) || cadEvent;
      
      // Handle shortcuts
      this.handleShortcuts(optimizedEvent);
      
      // Emit to event system
      this.eventBus.emit('keyboard:keydown', optimizedEvent);
      
      // Update state
      this.updateKeyState('keydown', keyboardEvent);
    };
  }
  
  private createUnifiedKeyUpHandler(): EventListener {
    return (event: Event) => {
      const keyboardEvent = event as KeyboardEvent;
      const cadEvent = this.createCADKeyboardEvent(keyboardEvent, 'keyboard:keyup');
      
      // WASM optimization
      const optimizedEvent = this.wasmOptimizer?.optimizeKeyboardEvent?.(cadEvent) || cadEvent;
      
      // Emit to event system
      this.eventBus.emit('keyboard:keyup', optimizedEvent);
      
      // Update state
      this.updateKeyState('keyup', keyboardEvent);
    };
  }
  
  private createCADKeyboardEvent(keyboardEvent: KeyboardEvent, type: CADEventType): CADKeyboardEvent {
    // Build shortcut string
    const shortcut = this.buildShortcutString(keyboardEvent);
    
    const cadEvent: CADKeyboardEvent = {
      type: type as any,
      originalEvent: keyboardEvent,
      key: keyboardEvent.key,
      code: keyboardEvent.code,
      timestamp: Date.now(),
      modifiers: {
        shift: keyboardEvent.shiftKey,
        ctrl: keyboardEvent.ctrlKey,
        alt: keyboardEvent.altKey,
        meta: keyboardEvent.metaKey
      },
      shortcut: shortcut
    };
    
    return cadEvent;
  }
  
  private getCADEventType(domEventType: string): CADEventType {
    switch (domEventType) {
      case 'keydown': return 'keyboard:keydown';
      case 'keyup': return 'keyboard:keyup';
      default: throw new Error(`Unknown keyboard event type: ${domEventType}`);
    }
  }
  
  private updateKeyState(eventType: string, keyboardEvent: KeyboardEvent): void {
    const key = this.normalizeKey(keyboardEvent.key);
    
    if (eventType === 'keydown') {
      this.pressedKeys.add(key);
      
      // Add modifiers
      if (keyboardEvent.ctrlKey) this.pressedKeys.add('Ctrl');
      if (keyboardEvent.shiftKey) this.pressedKeys.add('Shift');
      if (keyboardEvent.altKey) this.pressedKeys.add('Alt');
      if (keyboardEvent.metaKey) this.pressedKeys.add('Meta');
      
    } else if (eventType === 'keyup') {
      this.pressedKeys.delete(key);
      
      // Remove modifiers if they're released
      if (!keyboardEvent.ctrlKey) this.pressedKeys.delete('Ctrl');
      if (!keyboardEvent.shiftKey) this.pressedKeys.delete('Shift');
      if (!keyboardEvent.altKey) this.pressedKeys.delete('Alt');
      if (!keyboardEvent.metaKey) this.pressedKeys.delete('Meta');
    }
  }
  
  private handleShortcuts(cadEvent: CADKeyboardEvent): boolean {
    if (cadEvent.type !== 'keyboard:keydown' || !cadEvent.shortcut) {
      return false;
    }
    
    const shortcut = this.shortcuts.get(cadEvent.shortcut);
    if (!shortcut) {
      return false;
    }
    
    try {
      // Execute shortcut handler if it exists
      if (shortcut.handler) {
        shortcut.handler(cadEvent);
      }
      
      // Emit shortcut event
      const shortcutEvent: CADKeyboardEvent = {
        ...cadEvent,
        type: 'keyboard:shortcut'
      };
      
      this.eventBus.emit('keyboard:shortcut', shortcutEvent);
      
      // Prevent default browser behavior for handled shortcuts
      cadEvent.originalEvent.preventDefault();
      
      console.log(`⌨️ Shortcut executed: ${cadEvent.shortcut} → ${shortcut.action}`);
      return true;
      
    } catch (error) {
      console.error(`Error executing shortcut ${cadEvent.shortcut}:`, error);
      return false;
    }
  }
  
  private buildShortcutString(event: KeyboardEvent): string {
    const parts: string[] = [];
    
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.shiftKey) parts.push('Shift');
    if (event.altKey) parts.push('Alt');
    if (event.metaKey) parts.push('Meta');
    
    const key = this.normalizeKey(event.key);
    if (key && !['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
      parts.push(key);
    }
    
    return parts.join('+');
  }
  
  private normalizeShortcut(shortcut: string): string {
    return shortcut
      .split('+')
      .map(key => this.normalizeKey(key.trim()))
      .join('+');
  }
  
  private normalizeKey(key: string): string {
    // Normalize key names for consistency
    const keyMap: { [key: string]: string } = {
      'Control': 'Ctrl',
      'Command': 'Meta',
      'Cmd': 'Meta',
      'Option': 'Alt',
      'Opt': 'Alt',
      ' ': 'Space',
      'Escape': 'Escape',
      'Esc': 'Escape',
      'Enter': 'Enter',
      'Return': 'Enter',
      'ArrowUp': 'Up',
      'ArrowDown': 'Down',
      'ArrowLeft': 'Left',
      'ArrowRight': 'Right',
      'Delete': 'Delete',
      'Del': 'Delete',
      'Backspace': 'Backspace'
    };
    
    return keyMap[key] || key;
  }
  
  /**
   * Get current keyboard state for debugging
   */
  getState() {
    return {
      isAttached: this.isAttached,
      pressedKeys: Array.from(this.pressedKeys),
      shortcutsCount: this.shortcuts.size,
      hasWasmOptimizer: !!this.wasmOptimizer,
      originalHandlersCount: this.originalHandlers.size,
      activeListenersCount: this.eventListeners.size
    };
  }
}

// Export singleton instance for convenience
export const keyboardEventHandler = new KeyboardEventHandler();
