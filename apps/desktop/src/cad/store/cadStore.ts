// src/store/cadStore.ts
import { create } from "../../state/zustand.ts";
import { useElementsStore } from "./elementsStore.ts";

type ViewMode = "2d" | "3d";
type OriginPreset =
  | "center"
  | "bottomLeft"
  | "topRight"
  | "bottomRight"
  | "topLeft";

interface MachineConfig {
  id: string;
  name: string;
  config: {
    workVolume?: {
      x: number;
      y: number;
      z: number;
    };
    type: string;
    maxSpindleSpeed?: number;
    maxFeedRate?: number;
  };
}

interface Workpiece {
  width: number;
  height: number;
  depth: number;
  radius: number;
  material: string;

  elementId?: string; // Riferimento all'elemento collegato
}

interface OriginOffset {
  x: number;
  y: number;
  z: number;
}

interface CADState {
  viewMode: ViewMode;
  activeTool: string;
  gridVisible: boolean;
  axisVisible: boolean;
  workpiece: Workpiece;
  selectedMachine: MachineConfig | null;
  originOffset: OriginOffset;
  layerPanelVisible: boolean;
  elementsPanelVisible: boolean;
  propertiesPanelVisible: boolean;
  // Actions
  setViewMode: (mode: ViewMode) => void;
  setActiveTool: (tool: string) => void;
  toggleGrid: () => void;
  toggleAxis: () => void;
  setWorkpiece: (workpiece: Workpiece) => void;
  setSelectedMachine: (machine: MachineConfig | null) => void;

  // OrisCtrlKeyPressed: boolean;
  isCtrlKeyPressed: boolean;
  isShiftKeyPressed: boolean;
  isAltKeyPressed: boolean;

  // Actions aggiuntivi
  setLayerPanelVisible: (visible: boolean) => void;
  setElementsPanelVisible: (visible: boolean) => void;
  setPropertiesPanelVisible: (visible: boolean) => void;
  setCtrlKeyPressed: (pressed: boolean) => void;
  setShiftKeyPressed: (pressed: boolean) => void;
  setAltKeyPressed: (pressed: boolean) => void;
  setOriginOffset: (offset: OriginOffset) => void;
  resetOrigin: () => void;
  setOriginPreset: (preset: OriginPreset) => void;

  // State and action for dimension visibility
  showDimensions: boolean;
  toggleDimensions: () => void;
  setWorkpieceFromElement: (elementId: string) => void;
}

export const useCADStore = create<CADState>((set, get) => ({
  viewMode: "3d",
  activeTool: "select",
  gridVisible: true,
  axisVisible: true,
  workpiece: {
    width: 100,
    height: 200,
    depth: 20,
    radius: 0,
    material: "aluminum",
  },
  selectedMachine: null,
  originOffset: { x: 0, y: 0, z: 0 },
  layerPanelVisible: false,
  elementsPanelVisible: false,
  propertiesPanelVisible: false,
  isCtrlKeyPressed: false,
  isShiftKeyPressed: false,
  isAltKeyPressed: false,
  showDimensions: false, // Default to false

  // Nuovi action
  setLayerPanelVisible: (visible) => set({ layerPanelVisible: visible }),
  setElementsPanelVisible: (visible) => set({ elementsPanelVisible: visible }),
  setPropertiesPanelVisible: (visible) =>
    set({ propertiesPanelVisible: visible }),
  setCtrlKeyPressed: (pressed) => set({ isCtrlKeyPressed: pressed }),
  setShiftKeyPressed: (pressed) => set({ isShiftKeyPressed: pressed }),
  setAltKeyPressed: (pressed) => set({ isAltKeyPressed: pressed }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  toggleGrid: () => set((state) => ({ gridVisible: !state.gridVisible })),
  toggleAxis: () => set((state) => ({ axisVisible: !state.axisVisible })),
  setWorkpiece: (workpiece: Workpiece) => set({ workpiece }),
  setSelectedMachine: (machine: MachineConfig | null) =>
    set({ selectedMachine: machine }),

  // New action to set workpiece from selected element
  setWorkpieceFromElement: (elementId: string) => {
    const element = useElementsStore
      .getState()
      .elements.find((el) => el.id === elementId);
    if (!element) return;

    set((state) => ({
      workpiece: {
        ...state.workpiece,
        width: element.width || state.workpiece.width,
        height: element.height || state.workpiece.height,
        depth: element.depth || state.workpiece.depth,
        material: element.material || state.workpiece.material,
        elementId: element.id,
      },
    }));
  },

  setOriginOffset: (offset) => set({ originOffset: offset }),

  resetOrigin: () => set({ originOffset: { x: 0, y: 0, z: 0 } }),

  setOriginPreset: (preset) => {
    const { workpiece } = get();
    const halfWidth = workpiece.width / 2;
    const halfHeight = workpiece.height / 2;
    const halfDepth = workpiece.depth / 2;

    switch (preset) {
      case "center":
        set({ originOffset: { x: 0, y: 0, z: 0 } });
        break;
      case "bottomLeft":
        set({ originOffset: { x: halfWidth, y: halfHeight, z: -halfDepth } });
        break;
      case "topRight":
        set({ originOffset: { x: halfWidth, y: halfHeight, z: halfDepth } });
        break;
      case "bottomRight":
        set({ originOffset: { x: halfWidth, y: -halfHeight, z: -halfDepth } });
        break;
      case "topLeft":
        set({ originOffset: { x: halfWidth, y: halfHeight, z: halfDepth } });
        break;
    }
  },

  // Action to toggle dimension visibility
  toggleDimensions: () =>
    set((state) => ({ showDimensions: !state.showDimensions })),
}));
