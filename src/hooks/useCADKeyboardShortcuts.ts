// src/hooks/useCADKeyboardShortcuts.ts
import { useEffect, useCallback, useState, useRef } from 'react';

// Define all possible shortcut action types for better type safety
export type ShortcutAction = 
  // Selection & Basic Editing
  | 'delete' | 'escape' | 'selectAll' | 'deselectAll' | 'invertSelection'
  
  // Clipboard Operations
  | 'copy' | 'paste' | 'cut' | 'duplicate'
  
  // History Operations
  | 'undo' | 'redo' | 'clearHistory'
  
  // Transform Operations
  | 'translate' | 'rotate' | 'scale' | 'mirror' | 'resetTransform'
  
  // View Operations
  | 'zoomIn' | 'zoomOut' | 'zoomToFit' | 'zoomToSelection'
  | 'viewPerspective' | 'viewTop' | 'viewFront' | 'viewRight' | 'viewIsometric'
  
  // UI Operations
  | 'toggleSidebar' | 'toggleLayers' | 'toggleProperties' | 'toggleToolbar'
  | 'toggleGrid' | 'toggleSnap' | 'toggleWireframe' | 'toggleFullscreen'
  
  // Layer Operations
  | 'createLayer' | 'hideSelectedLayer' | 'showAllLayers' | 'lockSelectedLayer' | 'unlockAllLayers'
  
  // Alignment Operations
  | 'alignLeft' | 'alignRight' | 'alignTop' | 'alignBottom' | 'alignCenter' | 'alignMiddle' | 'distributeHorizontal' | 'distributeVertical'
  
  // Model Operations
  | 'groupSelected' | 'ungroupSelected' | 'booleanUnion' | 'booleanSubtract' | 'booleanIntersect'
  
  // File Operations
  | 'save' | 'saveAs' | 'open' | 'new' | 'import' | 'export'
  
  // Tool Operations
  | 'selectTool' | 'panTool' | 'lineTool' | 'rectangleTool' | 'circleTool' | 'polygonTool' 
  | 'cubeTool' | 'sphereTool' | 'cylinderTool' | 'textTool' | 'measureTool'
  
  // Snapping Operations
  | 'snapToGrid' | 'snapToPoint' | 'snapToMidpoint' | 'snapToIntersection'
  
  // Miscellaneous
  | 'help' | 'showShortcuts' | 'toggleDarkMode' | 'preferences' | 'search';

// Define interface for the handlers
export interface KeyboardShortcutHandlers {
  // Selection & Basic Editing
  onDelete?: () => void;
  onEscape?: () => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  onInvertSelection?: () => void;
  
  // Clipboard Operations
  onCopy?: () => void;
  onPaste?: () => void;
  onCut?: () => void;
  onDuplicate?: () => void;
  
  // History Operations
  onUndo?: () => void;
  onRedo?: () => void;
  onClearHistory?: () => void;
  
  // Transform Operations
  onTransform?: (mode: 'translate' | 'rotate' | 'scale' ) => void;
  onResetTransform?: () => void;
  
  // View Operations
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomToFit?: () => void;
  onZoomToSelection?: () => void;
  onViewChange?: (view: 'perspective' | 'top' | 'front' | 'right' | 'isometric') => void;
  onViewModeToggle?: (mode: '3d' | '2d') => void;
  
  // UI Operations
  onToggleSidebar?: () => void;
  onToggleLayers?: () => void;
  onToggleProperties?: () => void;
  onToggleToolbar?: () => void;
  onToggleGrid?: () => void;
  onToggleAxis?: () => void;
  onToggleSnap?: () => void;
  onToggleWireframe?: () => void;
  onToggleFullscreen?: () => void;
  
  // Layer Operations
  onCreateLayer?: () => void;
  onHideSelectedLayer?: () => void;
  onShowAllLayers?: () => void;
  onLockSelectedLayer?: () => void;
  onUnlockAllLayers?: () => void;
  
  // Alignment Operations
  onAlign?: (alignment: 'left' | 'right' | 'top' | 'bottom' | 'center' | 'middle') => void;
  onDistribute?: (direction: 'horizontal' | 'vertical') => void;
  
  // Model Operations
  onGroupSelected?: () => void;
  onUngroupSelected?: () => void;
  onBoolean?: (operation: 'union' | 'subtract' | 'intersect') => void;
  
  // File Operations
  onSave?: () => void;
  onSaveAs?: () => void;
  onOpen?: () => void;
  onNew?: () => void;
  onImport?: () => void;
  onExport?: () => void;
  
  // Tool Operations
  onSelectTool?: (tool: string) => void;
  
  // Snapping Operations
  onSnapMode?: (mode: 'grid' | 'point' | 'midpoint' | 'intersection') => void;
  
  // Miscellaneous
  onHelp?: () => void;
  onShowShortcuts?: () => void;
  onToggleDarkMode?: () => void;
  onPreferences?: () => void;
  onSearch?: () => void;
}

export interface KeyboardShortcutsOptions extends KeyboardShortcutHandlers {
  disabled?: boolean;
  enableNumpadSupport?: boolean;
  preventDefaultForAll?: boolean;
  logKeyEvents?: boolean;
  ignoredTargets?: string[];
  customShortcuts?: Record<string, () => void>;
}

/**
 * A hook for handling keyboard shortcuts in CAD/CAM applications
 */
export const useCADKeyboardShortcuts = (options: KeyboardShortcutsOptions) => {
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const [isMac, setIsMac] = useState(false);
  const inputFocusedRef = useRef<boolean>(false);
  
  // Detect if user is on Mac
  useEffect(() => {
    setIsMac(navigator.platform.toLowerCase().includes('mac') || 
           navigator.userAgent.toLowerCase().includes('mac'));
  }, []);
  
  // Check if an input element is currently focused
  useEffect(() => {
    const checkFocus = () => {
      const activeElement = document.activeElement;
      inputFocusedRef.current = 
        activeElement instanceof HTMLInputElement || 
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement ||
        (activeElement?.getAttribute('contenteditable') === 'true');
    };
    
    // Check initially
    checkFocus();
    
    // Set up event listeners
    document.addEventListener('focusin', checkFocus);
    document.addEventListener('focusout', checkFocus);
    
    return () => {
      document.removeEventListener('focusin', checkFocus);
      document.removeEventListener('focusout', checkFocus);
    };
  }, []);
  
  // Get a string representation of the keyboard shortcut
  const getShortcutString = useCallback((e: KeyboardEvent): string => {
    const keys: string[] = [];
    if (e.ctrlKey) keys.push('ctrl');
    if (e.altKey) keys.push('alt');
    if (e.shiftKey) keys.push('shift');
    if (e.metaKey) keys.push('meta'); // Command key on Mac
    
    // Add the actual key pressed, normalized to lowercase
    keys.push(e.key.toLowerCase());
    
    return keys.join('+');
  }, []);
  
  // Check if a target element should be ignored
  const shouldIgnoreTarget = useCallback((target: EventTarget | null): boolean => {
    if (!target || !(target instanceof Element)) return false;
    
    // Check for ignored target elements
    if (options.ignoredTargets) {
      for (const selector of options.ignoredTargets) {
        if (target.matches(selector)) return true;
      }
    }
    
    // Always ignore inputs, textareas, and contenteditable elements
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target as HTMLElement).isContentEditable ||
      target.getAttribute('contenteditable') === 'true'
    );
  }, [options.ignoredTargets]);
  
  // Handle keydown events
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Skip if disabled
    if (options.disabled) return;
    
    // Skip if target is an input element or explicitly ignored
    if (shouldIgnoreTarget(e.target)) return;
    
    // Skip if document is hidden (tab/window not focused)
    if (document.hidden) return;
    
    // Detect Command key on Mac properly
    const isModifierKey = isMac ? e.metaKey : e.ctrlKey;
    
    // Add to pressed keys
    setPressedKeys(prev => {
      const newSet = new Set(prev);
      newSet.add(e.key.toLowerCase());
      return newSet;
    });
    
    // Log key event if enabled
    if (options.logKeyEvents) {
      console.log('Key down:', getShortcutString(e), 'isMac:', isMac);
    }
    
    // Check for custom shortcuts first
    if (options.customShortcuts) {
      const shortcutString = getShortcutString(e);
      const customHandler = options.customShortcuts[shortcutString];
      if (customHandler) {
        if (options.preventDefaultForAll !== false) e.preventDefault();
        customHandler();
        return;
      }
    }
    
    // Handle shortcuts based on key combinations
    // Selection & Basic Editing
    if ((e.key === 'Delete' || e.key === 'Backspace') && options.onDelete) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onDelete();
    }
    else if (e.key === 'Escape' && options.onEscape) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onEscape();
    }
    else if (isModifierKey && e.key.toLowerCase() === 'a' && options.onSelectAll) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onSelectAll();
    }
    else if (isModifierKey && e.shiftKey && e.key.toLowerCase() === 'a' && options.onDeselectAll) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onDeselectAll();
    }
    else if (isModifierKey && e.key.toLowerCase() === 'i' && options.onInvertSelection) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onInvertSelection();
    }
    
    // Clipboard Operations
    else if (isModifierKey && e.key.toLowerCase() === 'c' && options.onCopy) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onCopy();
    }
    else if (isModifierKey && e.key.toLowerCase() === 'v' && options.onPaste) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onPaste();
    }
    else if (isModifierKey && e.key.toLowerCase() === 'x' && options.onCut) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onCut();
    }
    else if (isModifierKey && e.key.toLowerCase() === 'd' && options.onDuplicate) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onDuplicate();
    }
    
    // History Operations
    else if (isModifierKey && !e.shiftKey && e.key.toLowerCase() === 'z' && options.onUndo) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onUndo();
    }
    else if (
      (isModifierKey && e.shiftKey && e.key.toLowerCase() === 'z') || 
      (isModifierKey && !isMac && e.key.toLowerCase() === 'y')
    ) {
      if (options.onRedo) {
        if (options.preventDefaultForAll !== false) e.preventDefault();
        options.onRedo();
      }
    }
    
    // Transform Operations
    else if (e.key.toLowerCase() === 'g' && options.onTransform) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onTransform('translate');
    }
    else if (e.key.toLowerCase() === 'r' && options.onTransform) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onTransform('rotate');
    }
    else if (e.key.toLowerCase() === 's' && options.onTransform) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onTransform('scale');
    }
  
    else if (e.key.toLowerCase() === 't' && e.altKey && options.onResetTransform) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onResetTransform();
    }
    
    // View Operations
    else if (
      (e.key === '+' || e.key === '=' || 
      (options.enableNumpadSupport && e.key === 'Add')) && 
      options.onZoomIn
    ) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onZoomIn();
    }
    else if (
      (e.key === '-' || e.key === '_' || 
      (options.enableNumpadSupport && e.key === 'Subtract')) && 
      options.onZoomOut
    ) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onZoomOut();
    }
    else if (e.key === 'Home' && options.onZoomToFit) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onZoomToFit();
    }
    else if (e.key.toLowerCase() === 'f' && options.onZoomToSelection) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onZoomToSelection();
    }
    
    // View Changes
    else if (isModifierKey && e.key === '1' && options.onViewChange) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onViewChange('perspective');
    }
    else if (isModifierKey && e.key === '2' && options.onViewChange) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onViewChange('top');
    }
    else if (isModifierKey && e.key === '3' && options.onViewChange) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onViewChange('front');
    }
    else if (isModifierKey && e.key === '4' && options.onViewChange) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onViewChange('right');
    }
    else if (isModifierKey && e.key === '5' && options.onViewChange) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onViewChange('isometric');
    }
    
    // UI Operations
    else if (e.key === 'Tab' && options.onToggleSidebar) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onToggleSidebar();
    }
    else if (e.key.toLowerCase() === 'l' && isModifierKey && options.onToggleLayers) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onToggleLayers();
    }
    else if (e.key.toLowerCase() === 'p' && isModifierKey && e.altKey && options.onToggleProperties) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onToggleProperties();
    }
    else if (e.key.toLowerCase() === 't' && isModifierKey && options.onToggleToolbar) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onToggleToolbar();
    }
    else if (e.key.toLowerCase() === 'g' && isModifierKey && options.onToggleGrid) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onToggleGrid();
    }
    else if (e.key.toLowerCase() === 'x' && isModifierKey && e.altKey && options.onToggleSnap) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onToggleSnap();
    }
    else if (e.key.toLowerCase() === 'w' && isModifierKey && e.altKey && options.onToggleWireframe) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onToggleWireframe();
    }
    else if (e.key === 'F11' && options.onToggleFullscreen) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onToggleFullscreen();
    }
    
    // Layer Operations
    else if (e.key.toLowerCase() === 'n' && e.shiftKey && isModifierKey && options.onCreateLayer) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onCreateLayer();
    }
    else if (e.key.toLowerCase() === 'h' && options.onHideSelectedLayer) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onHideSelectedLayer();
    }
    else if (e.key.toLowerCase() === 'h' && e.altKey && options.onShowAllLayers) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onShowAllLayers();
    }
    else if (e.key.toLowerCase() === 'k' && options.onLockSelectedLayer) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onLockSelectedLayer();
    }
    else if (e.key.toLowerCase() === 'k' && e.altKey && options.onUnlockAllLayers) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onUnlockAllLayers();
    }
    
    // Alignment Operations
    else if (e.key.toLowerCase() === 'a' && e.shiftKey && e.altKey && options.onAlign) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onAlign('left');
    }
    else if (e.key.toLowerCase() === 'd' && e.shiftKey && e.altKey && options.onAlign) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onAlign('right');
    }
    else if (e.key.toLowerCase() === 'w' && e.shiftKey && e.altKey && options.onAlign) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onAlign('top');
    }
    else if (e.key.toLowerCase() === 's' && e.shiftKey && e.altKey && options.onAlign) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onAlign('bottom');
    }
    else if (e.key.toLowerCase() === 'c' && e.shiftKey && e.altKey && options.onAlign) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onAlign('center');
    }
    else if (e.key.toLowerCase() === 'm' && e.shiftKey && e.altKey && options.onAlign) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onAlign('middle');
    }
    
    // Distribution Operations
    else if (e.key.toLowerCase() === 'h' && isModifierKey && e.shiftKey && options.onDistribute) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onDistribute('horizontal');
    }
    else if (e.key.toLowerCase() === 'v' && isModifierKey && e.shiftKey && options.onDistribute) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onDistribute('vertical');
    }
    
    // Model Operations
    else if (e.key.toLowerCase() === 'g' && isModifierKey && !e.shiftKey && options.onGroupSelected) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onGroupSelected();
    }
    else if (e.key.toLowerCase() === 'g' && isModifierKey && e.shiftKey && options.onUngroupSelected) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onUngroupSelected();
    }
    else if (e.key === 'u' && isModifierKey && e.altKey && options.onBoolean) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onBoolean('union');
    }
    else if (e.key === 's' && isModifierKey && e.altKey && options.onBoolean) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onBoolean('subtract');
    }
    else if (e.key === 'i' && isModifierKey && e.altKey && options.onBoolean) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onBoolean('intersect');
    }
    
    // File Operations
    else if (isModifierKey && e.key.toLowerCase() === 's' && !e.shiftKey && options.onSave) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onSave();
    }
    else if (isModifierKey && e.key.toLowerCase() === 's' && e.shiftKey && options.onSaveAs) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onSaveAs();
    }
    else if (isModifierKey && e.key.toLowerCase() === 'o' && options.onOpen) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onOpen();
    }
    else if (isModifierKey && e.key.toLowerCase() === 'n' && options.onNew) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onNew();
    }
    else if (isModifierKey && e.key.toLowerCase() === 'i' && options.onImport) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onImport();
    }
    else if (isModifierKey && e.key.toLowerCase() === 'e' && options.onExport) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onExport();
    }
    
    // Tool Operations
    else if (e.key === 'v' && options.onSelectTool) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onSelectTool('select');
    }
    else if (e.key === 'h' && e.altKey && options.onSelectTool) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onSelectTool('pan');
    }
    else if (e.key === 'l' && options.onSelectTool) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onSelectTool('line');
    }
    else if (e.key === 'r' && e.altKey && options.onSelectTool) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onSelectTool('rectangle');
    }
    else if (e.key === 'c' && e.altKey && options.onSelectTool) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onSelectTool('circle');
    }
    else if (e.key === 'p' && e.altKey && options.onSelectTool) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onSelectTool('polygon');
    }
    else if (e.key === 'b' && options.onSelectTool) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onSelectTool('cube');
    }
    else if (e.key === 'o' && options.onSelectTool) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onSelectTool('sphere');
    }
    else if (e.key === 'y' && options.onSelectTool) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onSelectTool('cylinder');
    }
    else if (e.key === 't' && options.onSelectTool) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onSelectTool('text');
    }
    else if (e.key === 'm' && options.onSelectTool) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onSelectTool('measure');
    }
    
    // Snapping Operations
    else if (e.key === '1' && e.altKey && options.onSnapMode) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onSnapMode('grid');
    }
    else if (e.key === '2' && e.altKey && options.onSnapMode) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onSnapMode('point');
    }
    else if (e.key === '3' && e.altKey && options.onSnapMode) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onSnapMode('midpoint');
    }
    else if (e.key === '4' && e.altKey && options.onSnapMode) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onSnapMode('intersection');
    }
    
    // Miscellaneous
    else if (e.key === 'F1' && options.onHelp) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onHelp();
    }
    else if ((e.key === '?' || e.key === 'F2') && options.onShowShortcuts) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onShowShortcuts();
    }
    else if (e.key.toLowerCase() === 'd' && isModifierKey && e.altKey && options.onToggleDarkMode) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onToggleDarkMode();
    }
    else if (e.key.toLowerCase() === ',' && isModifierKey && options.onPreferences) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onPreferences();
    }
    else if (e.key.toLowerCase() === 'f' && isModifierKey && options.onSearch) {
      if (options.preventDefaultForAll !== false) e.preventDefault();
      options.onSearch();
    }
    
  }, [
    options,
    getShortcutString,
    shouldIgnoreTarget,
    isMac
  ]);
  
  // Handle keyup events
  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    // Remove from pressed keys
    setPressedKeys(prev => {
      const newSet = new Set(prev);
      newSet.delete(e.key.toLowerCase());
      return newSet;
    });
    
    // Log key event if enabled
    if (options.logKeyEvents) {
      console.log('Key up:', e.key);
    }
  }, [options.logKeyEvents]);
  
  // Set up event listeners
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);
  
  // Public API
  return {
    // Return pressed keys set for complex shortcut checking
    pressedKeys,
    
    // Check if an input is focused
    isInputFocused: () => inputFocusedRef.current,
    
    // Check if a specific key is currently pressed
    isKeyPressed: (key: string) => pressedKeys.has(key.toLowerCase()),
    
    // Check if a specific key combination is pressed
    isShortcutPressed: (keys: string[]) => {
      const lowerKeys = keys.map(k => k.toLowerCase());
      return lowerKeys.every(k => pressedKeys.has(k));
    },
    
    // Platform information
    isMacOS: isMac
  };
};