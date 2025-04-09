// src/utils/cursorUtils.ts

// Default cursor states
export enum CursorState {
    DEFAULT = 'default',
    POINTER = 'pointer',
    MOVE = 'move',
    GRAB = 'grab',
    GRABBING = 'grabbing',
    CROSSHAIR = 'crosshair',
    TEXT = 'text',
    WAIT = 'wait',
    NOT_ALLOWED = 'not-allowed',
    ZOOM_IN = 'zoom-in',
    ZOOM_OUT = 'zoom-out',
    NS_RESIZE = 'ns-resize',
    EW_RESIZE = 'ew-resize',
    NESW_RESIZE = 'nesw-resize',
    NWSE_RESIZE = 'nwse-resize',
    COL_RESIZE = 'col-resize',
    ROW_RESIZE = 'row-resize',
  }
  
  // Specialized cursor types for CAD/CAM tools
  export enum ToolCursorType {
    SELECT = 'select',
    PAN = 'pan',
    DRAW = 'draw',
    DRAW_LINE = 'draw-line',
    DRAW_RECTANGLE = 'draw-rectangle',
    DRAW_CIRCLE = 'draw-circle',
    DRAW_POLYGON = 'draw-polygon',
    DRAW_ARC = 'draw-arc',
    MEASURE = 'measure',
    CUT = 'cut',
    EXTRUDE = 'extrude',
    REVOLVE = 'revolve',
    DRILL = 'drill',
    MILL = 'mill',
    ADD_TEXT = 'add-text',
    DIMENSION = 'dimension',
    FILLET = 'fillet',
    CHAMFER = 'chamfer',
    MIRROR = 'mirror',
    SCALE = 'scale',
    ROTATE = 'rotate',
    ERASE = 'erase',
  }
  
  // Mapping tool cursor types to actual CSS cursor values
  export const toolCursorMap: Record<ToolCursorType, string> = {
    [ToolCursorType.SELECT]: CursorState.DEFAULT,
    [ToolCursorType.PAN]: CursorState.MOVE,
    [ToolCursorType.DRAW]: CursorState.CROSSHAIR,
    [ToolCursorType.DRAW_LINE]: `url('/cursors/draw-line.svg') 12 12, ${CursorState.CROSSHAIR}`,
    [ToolCursorType.DRAW_RECTANGLE]: `url('/cursors/draw-rectangle.svg') 12 12, ${CursorState.CROSSHAIR}`,
    [ToolCursorType.DRAW_CIRCLE]: `url('/cursors/draw-circle.svg') 12 12, ${CursorState.CROSSHAIR}`,
    [ToolCursorType.DRAW_POLYGON]: `url('/cursors/draw-polygon.svg') 12 12, ${CursorState.CROSSHAIR}`,
    [ToolCursorType.DRAW_ARC]: `url('/cursors/draw-arc.svg') 12 12, ${CursorState.CROSSHAIR}`,
    [ToolCursorType.MEASURE]: `url('/cursors/measure.svg') 12 12, ${CursorState.CROSSHAIR}`,
    [ToolCursorType.CUT]: `url('/cursors/cut.svg') 12 12, ${CursorState.CROSSHAIR}`,
    [ToolCursorType.EXTRUDE]: `url('/cursors/extrude.svg') 12 12, ${CursorState.CROSSHAIR}`,
    [ToolCursorType.REVOLVE]: `url('/cursors/revolve.svg') 12 12, ${CursorState.CROSSHAIR}`,
    [ToolCursorType.DRILL]: `url('/cursors/drill.svg') 12 12, ${CursorState.CROSSHAIR}`,
    [ToolCursorType.MILL]: `url('/cursors/mill.svg') 12 12, ${CursorState.CROSSHAIR}`,
    [ToolCursorType.ADD_TEXT]: `url('/cursors/text.svg') 12 12, ${CursorState.TEXT}`,
    [ToolCursorType.DIMENSION]: `url('/cursors/dimension.svg') 12 12, ${CursorState.CROSSHAIR}`,
    [ToolCursorType.FILLET]: `url('/cursors/fillet.svg') 12 12, ${CursorState.CROSSHAIR}`,
    [ToolCursorType.CHAMFER]: `url('/cursors/chamfer.svg') 12 12, ${CursorState.CROSSHAIR}`,
    [ToolCursorType.MIRROR]: `url('/cursors/mirror.svg') 12 12, ${CursorState.CROSSHAIR}`,
    [ToolCursorType.SCALE]: `url('/cursors/scale.svg') 12 12, ${CursorState.CROSSHAIR}`,
    [ToolCursorType.ROTATE]: `url('/cursors/rotate.svg') 12 12, ${CursorState.CROSSHAIR}`,
    [ToolCursorType.ERASE]: `url('/cursors/erase.svg') 12 12, ${CursorState.CROSSHAIR}`,
  };
  
  // Cursor states for different interaction modes
  export enum InteractionState {
    DEFAULT = 'default',
    DRAGGING = 'dragging',
    RESIZING = 'resizing',
    ROTATING = 'rotating',
    DRAWING = 'drawing',
    MEASURING = 'measuring',
    EDITING = 'editing',
    SELECTING = 'selecting',
    HOVERING = 'hovering',
  }
  
  // Mapping interaction states to cursor styles
  export const interactionCursorMap: Record<InteractionState, string> = {
    [InteractionState.DEFAULT]: CursorState.DEFAULT,
    [InteractionState.DRAGGING]: CursorState.GRABBING,
    [InteractionState.RESIZING]: CursorState.NWSE_RESIZE,
    [InteractionState.ROTATING]: `url('/cursors/rotating.svg') 12 12, ${CursorState.MOVE}`,
    [InteractionState.DRAWING]: CursorState.CROSSHAIR,
    [InteractionState.MEASURING]: `url('/cursors/measuring.svg') 12 12, ${CursorState.CROSSHAIR}`,
    [InteractionState.EDITING]: CursorState.POINTER,
    [InteractionState.SELECTING]: CursorState.DEFAULT,
    [InteractionState.HOVERING]: CursorState.POINTER,
  };
  
  // Cursor styles for different element types
  export enum ElementType {
    NODE = 'node',
    EDGE = 'edge',
    FACE = 'face',
    HANDLE = 'handle',
    GROUP = 'group',
    TEXT = 'text',
    DIMENSION = 'dimension',
    COMPONENT = 'component',
    TOOL_PATH = 'tool-path',
  }
  
  // Define cursors for different element types
  export const elementCursorMap: Record<ElementType, string> = {
    [ElementType.NODE]: CursorState.POINTER,
    [ElementType.EDGE]: `url('/cursors/edge.svg') 12 12, ${CursorState.POINTER}`,
    [ElementType.FACE]: `url('/cursors/face.svg') 12 12, ${CursorState.POINTER}`,
    [ElementType.HANDLE]: CursorState.POINTER,
    [ElementType.GROUP]: CursorState.POINTER,
    [ElementType.TEXT]: CursorState.TEXT,
    [ElementType.DIMENSION]: `url('/cursors/dimension-edit.svg') 12 12, ${CursorState.POINTER}`,
    [ElementType.COMPONENT]: CursorState.MOVE,
    [ElementType.TOOL_PATH]: `url('/cursors/toolpath.svg') 12 12, ${CursorState.POINTER}`,
  };
  
  // Interface for determining cursor based on selection state and context
  export interface CursorConfig {
    isSelected: boolean;
    isHovered: boolean;
    isEditable: boolean;
    isLocked: boolean;
    elementType: ElementType;
    activeTool?: ToolCursorType;
    interactionState?: InteractionState;
  }
  
  // Function to determine the appropriate cursor based on context
  export function getContextualCursor(config: CursorConfig): string {
    const { 
      isSelected, 
      isHovered, 
      isEditable, 
      isLocked, 
      elementType, 
      activeTool, 
      interactionState 
    } = config;
    
    // Lock state overrides everything
    if (isLocked) {
      return CursorState.NOT_ALLOWED;
    }
    
    // Interaction state takes precedence if active
    if (interactionState && interactionState !== InteractionState.DEFAULT) {
      return interactionCursorMap[interactionState];
    }
    
    // Active tool takes precedence next
    if (activeTool) {
      return toolCursorMap[activeTool];
    }
    
    // Element-specific cursor for selection/hover states
    if (isSelected) {
      if (isEditable) {
        return `url('/cursors/selected-editable.svg') 12 12, ${elementCursorMap[elementType]}`;
      }
      return `url('/cursors/selected.svg') 12 12, ${elementCursorMap[elementType]}`;
    }
    
    if (isHovered) {
      return elementCursorMap[elementType];
    }
    
    // Default to regular cursor
    return CursorState.DEFAULT;
  }
  
  // For animated cursor effects during specific operations
  export function setAnimatedCursor(
    element: HTMLElement,
    animationType: 'processing' | 'calculating' | 'simulating'
  ): () => void {
    let frame = 0;
    const frames = 8; // Number of animation frames
    
    // Set initial cursor
    const initialCursor = element.style.cursor;
    element.style.cursor = `url('/cursors/${animationType}/frame-0.svg') 12 12, wait`;
    
    // Animation interval
    const interval = setInterval(() => {
      frame = (frame + 1) % frames;
      element.style.cursor = `url('/cursors/${animationType}/frame-${frame}.svg') 12 12, wait`;
    }, 125); // 8 frames per second
    
    // Return cleanup function
    return () => {
      clearInterval(interval);
      element.style.cursor = initialCursor;
    };
  }