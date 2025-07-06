// src/utils/cursorUtils.ts

// Default cursor states
export enum CursorState {
  DEFAULT = "default",
  POINTER = "pointer",
  MOVE = "move",
  GRAB = "grab",
  GRABBING = "grabbing",
  CROSSHAIR = "crosshair",
  TEXT = "text",
  WAIT = "wait",
  NOT_ALLOWED = "not-allowed",
  ZOOM_IN = "zoom-in",
  ZOOM_OUT = "zoom-out",
  NS_RESIZE = "ns-resize",
  EW_RESIZE = "ew-resize",
  NESW_RESIZE = "nesw-resize",
  NWSE_RESIZE = "nwse-resize",
  COL_RESIZE = "col-resize",
  ROW_RESIZE = "row-resize",
}

// Specialized cursor types for CAD/CAM tools
export enum ToolCursorType {
  SELECT = "select",
  PAN = "pan",
  DRAW = "draw",
  DRAW_LINE = "draw-line",
  DRAW_RECTANGLE = "draw-rectangle",
  DRAW_CIRCLE = "draw-circle",
  DRAW_POLYGON = "draw-polygon",
  DRAW_ARC = "draw-arc",
  MEASURE = "measure",
  CUT = "cut",
  EXTRUDE = "extrude",
  REVOLVE = "revolve",
  DRILL = "drill",
  MILL = "mill",
  ADD_TEXT = "add-text",
  DIMENSION = "dimension",
  FILLET = "fillet",
  CHAMFER = "chamfer",
  MIRROR = "mirror",
  SCALE = "scale",
  ROTATE = "rotate",
  ERASE = "erase",
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
  DEFAULT = "default",
  DRAGGING = "dragging",
  RESIZING = "resizing",
  ROTATING = "rotating",
  DRAWING = "drawing",
  MEASURING = "measuring",
  EDITING = "editing",
  SELECTING = "selecting",
  HOVERING = "hovering",
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
  NODE = "node",
  EDGE = "edge",
  FACE = "face",
  HANDLE = "handle",
  GROUP = "group",
  TEXT = "text",
  DIMENSION = "dimension",
  COMPONENT = "component",
  TOOL_PATH = "tool-path",
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
    interactionState,
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
  animationType: "processing" | "calculating" | "simulating"
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

// Enhanced cursor configuration with priority system
export interface EnhancedCursorConfig extends CursorConfig {
  priority: number; // Higher priority = takes precedence
  hotSpot?: { x: number; y: number }; // Custom hotspot for each cursor
  animation?: "pulse" | "rotate" | "bounce" | "none";
  fallback?: string; // Fallback cursor if SVG fails to load
}

// Priority levels for cursor precedence
export enum CursorPriority {
  SYSTEM = 100, // System cursors (loading, not-allowed)
  TOOL_ACTIVE = 90, // Active tool cursors
  INTERACTION = 80, // Drag, resize, rotate
  SELECTION = 70, // Selected elements
  HOVER = 60, // Hover states
  DEFAULT = 50, // Default cursors
}

// Optimized cursor hotspots for different tools
const CURSOR_HOTSPOTS: Record<ToolCursorType, { x: number; y: number }> = {
  [ToolCursorType.SELECT]: { x: 1, y: 1 },
  [ToolCursorType.DRAW_LINE]: { x: 2, y: 22 },
  [ToolCursorType.DRILL]: { x: 12, y: 12 },
  [ToolCursorType.CUT]: { x: 5, y: 5 },
  [ToolCursorType.MEASURE]: { x: 8, y: 20 },
  [ToolCursorType.DIMENSION]: { x: 12, y: 12 },
  // Add all other tools with optimized hotspots
  [ToolCursorType.PAN]: { x: 12, y: 12 },
  [ToolCursorType.DRAW]: { x: 12, y: 12 },
  [ToolCursorType.DRAW_RECTANGLE]: { x: 2, y: 22 },
  [ToolCursorType.DRAW_CIRCLE]: { x: 12, y: 12 },
  [ToolCursorType.DRAW_POLYGON]: { x: 2, y: 22 },
  [ToolCursorType.DRAW_ARC]: { x: 2, y: 22 },
  [ToolCursorType.EXTRUDE]: { x: 12, y: 12 },
  [ToolCursorType.REVOLVE]: { x: 12, y: 12 },
  [ToolCursorType.MILL]: { x: 12, y: 12 },
  [ToolCursorType.ADD_TEXT]: { x: 8, y: 8 },
  [ToolCursorType.FILLET]: { x: 12, y: 12 },
  [ToolCursorType.CHAMFER]: { x: 12, y: 12 },
  [ToolCursorType.MIRROR]: { x: 12, y: 12 },
  [ToolCursorType.SCALE]: { x: 12, y: 12 },
  [ToolCursorType.ROTATE]: { x: 12, y: 12 },
  [ToolCursorType.ERASE]: { x: 5, y: 5 },
};

// Enhanced cursor mapping with hotspots and fallbacks
export const enhancedToolCursorMap: Record<ToolCursorType, string> = {
  [ToolCursorType.SELECT]: CursorState.DEFAULT,
  [ToolCursorType.PAN]: CursorState.MOVE,
  [ToolCursorType.DRAW]: CursorState.CROSSHAIR,
  [ToolCursorType.DRAW_LINE]: `url('/cursors/draw-line.svg') ${CURSOR_HOTSPOTS[ToolCursorType.DRAW_LINE].x} ${CURSOR_HOTSPOTS[ToolCursorType.DRAW_LINE].y}, ${CursorState.CROSSHAIR}`,
  [ToolCursorType.DRAW_RECTANGLE]: `url('/cursors/draw-rectangle.svg') ${CURSOR_HOTSPOTS[ToolCursorType.DRAW_RECTANGLE].x} ${CURSOR_HOTSPOTS[ToolCursorType.DRAW_RECTANGLE].y}, ${CursorState.CROSSHAIR}`,
  [ToolCursorType.DRAW_CIRCLE]: `url('/cursors/draw-circle.svg') ${CURSOR_HOTSPOTS[ToolCursorType.DRAW_CIRCLE].x} ${CURSOR_HOTSPOTS[ToolCursorType.DRAW_CIRCLE].y}, ${CursorState.CROSSHAIR}`,
  [ToolCursorType.DRAW_POLYGON]: `url('/cursors/draw-polygon.svg') ${CURSOR_HOTSPOTS[ToolCursorType.DRAW_POLYGON].x} ${CURSOR_HOTSPOTS[ToolCursorType.DRAW_POLYGON].y}, ${CursorState.CROSSHAIR}`,
  [ToolCursorType.DRAW_ARC]: `url('/cursors/draw-arc.svg') ${CURSOR_HOTSPOTS[ToolCursorType.DRAW_ARC].x} ${CURSOR_HOTSPOTS[ToolCursorType.DRAW_ARC].y}, ${CursorState.CROSSHAIR}`,
  [ToolCursorType.MEASURE]: `url('/cursors/measure.svg') ${CURSOR_HOTSPOTS[ToolCursorType.MEASURE].x} ${CURSOR_HOTSPOTS[ToolCursorType.MEASURE].y}, ${CursorState.CROSSHAIR}`,
  [ToolCursorType.CUT]: `url('/cursors/cut.svg') ${CURSOR_HOTSPOTS[ToolCursorType.CUT].x} ${CURSOR_HOTSPOTS[ToolCursorType.CUT].y}, ${CursorState.CROSSHAIR}`,
  [ToolCursorType.EXTRUDE]: `url('/cursors/extrude.svg') ${CURSOR_HOTSPOTS[ToolCursorType.EXTRUDE].x} ${CURSOR_HOTSPOTS[ToolCursorType.EXTRUDE].y}, ${CursorState.CROSSHAIR}`,
  [ToolCursorType.REVOLVE]: `url('/cursors/revolve.svg') ${CURSOR_HOTSPOTS[ToolCursorType.REVOLVE].x} ${CURSOR_HOTSPOTS[ToolCursorType.REVOLVE].y}, ${CursorState.CROSSHAIR}`,
  [ToolCursorType.DRILL]: `url('/cursors/drill.svg') ${CURSOR_HOTSPOTS[ToolCursorType.DRILL].x} ${CURSOR_HOTSPOTS[ToolCursorType.DRILL].y}, ${CursorState.CROSSHAIR}`,
  [ToolCursorType.MILL]: `url('/cursors/mill.svg') ${CURSOR_HOTSPOTS[ToolCursorType.MILL].x} ${CURSOR_HOTSPOTS[ToolCursorType.MILL].y}, ${CursorState.CROSSHAIR}`,
  [ToolCursorType.ADD_TEXT]: `url('/cursors/text.svg') ${CURSOR_HOTSPOTS[ToolCursorType.ADD_TEXT].x} ${CURSOR_HOTSPOTS[ToolCursorType.ADD_TEXT].y}, ${CursorState.TEXT}`,
  [ToolCursorType.DIMENSION]: `url('/cursors/dimension.svg') ${CURSOR_HOTSPOTS[ToolCursorType.DIMENSION].x} ${CURSOR_HOTSPOTS[ToolCursorType.DIMENSION].y}, ${CursorState.CROSSHAIR}`,
  [ToolCursorType.FILLET]: `url('/cursors/fillet.svg') ${CURSOR_HOTSPOTS[ToolCursorType.FILLET].x} ${CURSOR_HOTSPOTS[ToolCursorType.FILLET].y}, ${CursorState.CROSSHAIR}`,
  [ToolCursorType.CHAMFER]: `url('/cursors/chamfer.svg') ${CURSOR_HOTSPOTS[ToolCursorType.CHAMFER].x} ${CURSOR_HOTSPOTS[ToolCursorType.CHAMFER].y}, ${CursorState.CROSSHAIR}`,
  [ToolCursorType.MIRROR]: `url('/cursors/mirror.svg') ${CURSOR_HOTSPOTS[ToolCursorType.MIRROR].x} ${CURSOR_HOTSPOTS[ToolCursorType.MIRROR].y}, ${CursorState.CROSSHAIR}`,
  [ToolCursorType.SCALE]: `url('/cursors/scale.svg') ${CURSOR_HOTSPOTS[ToolCursorType.SCALE].x} ${CURSOR_HOTSPOTS[ToolCursorType.SCALE].y}, ${CursorState.CROSSHAIR}`,
  [ToolCursorType.ROTATE]: `url('/cursors/rotate.svg') ${CURSOR_HOTSPOTS[ToolCursorType.ROTATE].x} ${CURSOR_HOTSPOTS[ToolCursorType.ROTATE].y}, ${CursorState.CROSSHAIR}`,
  [ToolCursorType.ERASE]: `url('/cursors/erase.svg') ${CURSOR_HOTSPOTS[ToolCursorType.ERASE].x} ${CURSOR_HOTSPOTS[ToolCursorType.ERASE].y}, ${CursorState.CROSSHAIR}`,
};

// Cursor cache for performance
const cursorCache = new Map<string, string>();

// Enhanced function with caching and priority system
export function getEnhancedContextualCursor(
  configs: EnhancedCursorConfig[]
): string {
  // Sort by priority (higher first)
  const sortedConfigs = configs.sort((a, b) => b.priority - a.priority);

  // Find the highest priority config that should be applied
  for (const config of sortedConfigs) {
    const {
      isSelected,
      isHovered,
      isEditable,
      isLocked,
      elementType,
      activeTool,
      interactionState,
    } = config;

    // Create cache key
    const cacheKey = JSON.stringify({
      isSelected,
      isHovered,
      isEditable,
      isLocked,
      elementType,
      activeTool,
      interactionState,
    });

    // Check cache first
    if (cursorCache.has(cacheKey)) {
      return cursorCache.get(cacheKey)!;
    }

    let cursor: string = CursorState.DEFAULT;

    // Lock state overrides everything
    if (isLocked) {
      cursor = CursorState.NOT_ALLOWED;
    }
    // Interaction state takes precedence if active
    else if (
      interactionState &&
      interactionState !== InteractionState.DEFAULT
    ) {
      cursor = interactionCursorMap[interactionState];
    }
    // Active tool takes precedence next
    else if (activeTool) {
      cursor = enhancedToolCursorMap[activeTool];
    }
    // Element-specific cursor for selection/hover states
    else if (isSelected) {
      if (isEditable) {
        cursor = `url('/cursors/selected-editable.svg') 12 12, ${elementCursorMap[elementType]}`;
      } else {
        cursor = `url('/cursors/selected.svg') 12 12, ${elementCursorMap[elementType]}`;
      }
    } else if (isHovered) {
      cursor = elementCursorMap[elementType];
    }

    // Cache the result
    cursorCache.set(cacheKey, cursor);

    if (cursor !== CursorState.DEFAULT) {
      return cursor;
    }
  }

  return CursorState.DEFAULT;
}

// Cursor preloader for better performance
export async function preloadCursors(): Promise<void> {
  const cursorPromises = Object.values(ToolCursorType).map(async (toolType) => {
    const cursorUrl = enhancedToolCursorMap[toolType];
    if (cursorUrl.includes("url(")) {
      const match = cursorUrl.match(/url\('([^']+)'\)/);
      if (match) {
        try {
          const response = await fetch(match[1]);
          if (response.ok) {
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            console.log(`✅ Preloaded cursor: ${toolType}`);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to preload cursor: ${toolType}`, error);
        }
      }
    }
  });

  await Promise.allSettled(cursorPromises);
}

// Cursor debug utility
export function debugCursorState(config: CursorConfig): string {
  return `
🖱️ Cursor Debug Info:
- Selected: ${config.isSelected}
- Hovered: ${config.isHovered}
- Editable: ${config.isEditable}
- Locked: ${config.isLocked}
- Element Type: ${config.elementType}
- Active Tool: ${config.activeTool || "none"}
- Interaction: ${config.interactionState}
- Result: ${getContextualCursor(config)}
  `;
}
