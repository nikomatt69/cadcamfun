// src/store/cursorStore.ts
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import {
  CursorConfig,
  ElementType,
  getContextualCursor,
  getEnhancedContextualCursor,
  EnhancedCursorConfig,
  CursorPriority,
  InteractionState,
  ToolCursorType,
  preloadCursors,
} from "../lib/utils/cursorUtils";

interface CursorState {
  cursorConfig: CursorConfig;
  targetElement: HTMLElement | null;
  cursorStack: EnhancedCursorConfig[]; // Stack for priority-based cursor management
  isAnimating: boolean;
  animationId: string | null;

  // Enhanced methods
  setCursor: (config: Partial<CursorConfig>) => void;
  pushCursor: (config: EnhancedCursorConfig) => void; // Push to stack with priority
  popCursor: (priority?: number) => void; // Pop from stack
  resetCursor: () => void;
  setTarget: (element: HTMLElement | null) => void;

  // Performance methods
  batchUpdate: (updates: (() => void)[]) => void;
  preloadAllCursors: () => Promise<void>;

  // Helper methods
  setTool: (tool: ToolCursorType | undefined) => void;
  setInteraction: (state: InteractionState) => void;
  setHover: (isHovered: boolean, elementType?: ElementType) => void;
  setSelected: (
    isSelected: boolean,
    options?: { elementType?: ElementType; isEditable?: boolean }
  ) => void;
  setLocked: (isLocked: boolean) => void;

  // Animation methods
  startCursorAnimation: (
    animationType: "processing" | "calculating" | "simulating"
  ) => void;
  stopCursorAnimation: () => void;

  // Computed
  currentCursor: string;
}

const defaultConfig: CursorConfig = {
  isSelected: false,
  isHovered: false,
  isEditable: true,
  isLocked: false,
  elementType: ElementType.NODE,
  activeTool: undefined,
  interactionState: InteractionState.DEFAULT,
};

export const useCursorStore = create<CursorState>()(
  subscribeWithSelector((set, get) => ({
    cursorConfig: defaultConfig,
    targetElement: null,
    cursorStack: [],
    isAnimating: false,
    animationId: null,

    setCursor: (config) =>
      set((state) => {
        const newConfig = { ...state.cursorConfig, ...config };
        const cursor = getContextualCursor(newConfig);

        // Apply cursor to target element or document
        if (state.targetElement) {
          state.targetElement.style.cursor = cursor;
        } else {
          document.documentElement.style.cursor = cursor;
        }

        return { cursorConfig: newConfig };
      }),

    pushCursor: (config) =>
      set((state) => {
        const newStack = [...state.cursorStack, config];
        const cursor = getEnhancedContextualCursor(newStack);

        // Apply cursor
        if (state.targetElement) {
          state.targetElement.style.cursor = cursor;
        } else {
          document.documentElement.style.cursor = cursor;
        }

        return { cursorStack: newStack };
      }),

    popCursor: (priority) =>
      set((state) => {
        let newStack = [...state.cursorStack];

        if (priority !== undefined) {
          // Remove specific priority
          newStack = newStack.filter((config) => config.priority !== priority);
        } else {
          // Remove last item
          newStack.pop();
        }

        const cursor =
          newStack.length > 0
            ? getEnhancedContextualCursor(newStack)
            : getContextualCursor(state.cursorConfig);

        // Apply cursor
        if (state.targetElement) {
          state.targetElement.style.cursor = cursor;
        } else {
          document.documentElement.style.cursor = cursor;
        }

        return { cursorStack: newStack };
      }),

    resetCursor: () =>
      set((state) => {
        // Reset cursor on target element or document
        if (state.targetElement) {
          state.targetElement.style.cursor = "";
        } else {
          document.documentElement.style.cursor = "";
        }

        return {
          cursorConfig: defaultConfig,
          cursorStack: [],
          isAnimating: false,
          animationId: null,
        };
      }),

    setTarget: (element) => set({ targetElement: element }),

    batchUpdate: (updates) => {
      // Batch multiple cursor updates to prevent flickering
      set((state) => {
        const currentElement = state.targetElement || document.documentElement;
        const initialCursor = currentElement.style.cursor;

        // Temporarily hide cursor
        currentElement.style.cursor = "none";

        // Apply all updates
        let newState = state;
        updates.forEach((update) => {
          update();
        });

        // Apply final cursor
        const finalCursor =
          state.cursorStack.length > 0
            ? getEnhancedContextualCursor(state.cursorStack)
            : getContextualCursor(state.cursorConfig);

        currentElement.style.cursor = finalCursor;

        return newState;
      });
    },

    preloadAllCursors: async () => {
      try {
        await preloadCursors();
        console.log("✅ All cursors preloaded successfully");
      } catch (error) {
        console.warn("⚠️ Failed to preload some cursors:", error);
      }
    },

    // Helper methods
    setTool: (tool) => {
      const config: EnhancedCursorConfig = {
        ...get().cursorConfig,
        activeTool: tool,
        priority: CursorPriority.TOOL_ACTIVE,
      };
      get().pushCursor(config);
    },

    setInteraction: (interactionState) => {
      const config: EnhancedCursorConfig = {
        ...get().cursorConfig,
        interactionState,
        priority: CursorPriority.INTERACTION,
      };
      get().pushCursor(config);
    },

    setHover: (isHovered, elementType) => {
      const config: EnhancedCursorConfig = {
        ...get().cursorConfig,
        isHovered,
        elementType: elementType || get().cursorConfig.elementType,
        priority: CursorPriority.HOVER,
      };

      if (isHovered) {
        get().pushCursor(config);
      } else {
        get().popCursor(CursorPriority.HOVER);
      }
    },

    setSelected: (isSelected, options) => {
      const config: EnhancedCursorConfig = {
        ...get().cursorConfig,
        isSelected,
        elementType: options?.elementType || get().cursorConfig.elementType,
        isEditable:
          options?.isEditable !== undefined
            ? options.isEditable
            : get().cursorConfig.isEditable,
        priority: CursorPriority.SELECTION,
      };

      if (isSelected) {
        get().pushCursor(config);
      } else {
        get().popCursor(CursorPriority.SELECTION);
      }
    },

    setLocked: (isLocked) => {
      if (isLocked) {
        const config: EnhancedCursorConfig = {
          ...get().cursorConfig,
          isLocked: true,
          priority: CursorPriority.SYSTEM,
        };
        get().pushCursor(config);
      } else {
        get().popCursor(CursorPriority.SYSTEM);
      }
    },

    startCursorAnimation: (animationType) => {
      set({ isAnimating: true });

      const element = get().targetElement || document.documentElement;
      let frame = 0;
      const totalFrames = 8;

      const animate = () => {
        if (!get().isAnimating) return;

        const cursorUrl = `/cursors/animations/${animationType}/frame-${frame}.svg`;
        element.style.cursor = `url('${cursorUrl}') 12 12, progress`;

        frame = (frame + 1) % totalFrames;

        const id = setTimeout(animate, 125);
        set({ animationId: id.toString() });
      };

      animate();
    },

    stopCursorAnimation: () => {
      const state = get();

      if (state.animationId) {
        clearTimeout(parseInt(state.animationId));
      }

      set({ isAnimating: false, animationId: null });

      // Restore normal cursor
      const cursor =
        state.cursorStack.length > 0
          ? getEnhancedContextualCursor(state.cursorStack)
          : getContextualCursor(state.cursorConfig);

      const element = state.targetElement || document.documentElement;
      element.style.cursor = cursor;
    },

    // Computed properties
    get currentCursor() {
      const state = get();
      return state.cursorStack.length > 0
        ? getEnhancedContextualCursor(state.cursorStack)
        : getContextualCursor(state.cursorConfig);
    },
  }))
);

// Subscribe to cursor changes for debugging
if (process.env.NODE_ENV === "development") {
  useCursorStore.subscribe(
    (state) => state.currentCursor,
    (cursor) => {
      console.log("🖱️ Cursor changed to:", cursor);
    }
  );
}
