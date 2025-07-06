import { create } from "zustand";
import { useElementsStore, Element } from "./elementsStore";
import { generateToolpathFromEntities } from "src/lib/toolpathGenerator";
import { generateGcode } from "src/lib/gcodeGenerator";
import { v4 as uuidv4 } from "uuid";
import { useCADStore } from "./cadStore";
import { generateFromSelectedElements } from "../lib/toolpath";

type MachineStatus = "disconnected" | "connected" | "running" | "paused" | "error";

// Definizioni di interfacce compatibili con entrambi i generatori
interface ToolpathOperation {
  type: string;
  points: { x: number; y: number; z: number }[];
  depth?: number;
  stepdown?: number;
}

interface CAMItem {
  id: string;
  name: string;
  type: "tool" | "machine" | "workpiece" | "setup";
  details: any;
}

interface Toolpath {
  id: string;
  name: string;
  elements: any[];
  operations: ToolpathOperation[];
  parameters: any;
  workpiece?: {
    width: number;
    height: number;
    thickness: number;
    material: string;
  };
}

// Interfaccia per le dimensioni del pezzo grezzo derivate
interface DerivedWorkpieceDimensions {
  width: number;
  height: number;
  depth: number;
}

// Interfaccia aggiornata per lo stato dello store CAM
interface CAMStoreState {
  // Stato esistente
  toolpaths: Toolpath[];
  gcode: string;
  selectedEntities: string[];
  machineStatus: MachineStatus;
  machinePosition: { x: number; y: number; z: number };
  camItems: CAMItem[];
  // Stato nuovo/modificato per workpiece setup
  selectedWorkpieceElementId: string | null;
  derivedWorkpieceDimensions: DerivedWorkpieceDimensions | null; // Dimensioni derivate dall'elemento selezionato
  stockAllowance: number;
  isLatheSetup: boolean; // Indica se il setup corrente è per tornio (influenzato dalla macchina)
  isLoading: boolean; // Potrebbe essere già presente, se no aggiungilo
  error: string | null; // Potrebbe essere già presente, se no aggiungilo
  workpieceElements: Element[]; // Nuova proprietà per mantenere gli elementi dal CAD
  preserveGeometry: boolean; // Flag per indicare di preservare la geometria completa

  // Azioni esistenti
  generateToolpath: (params: any) => void;
  setGcode: (gcode: string) => void;
  toggleEntitySelection: (id: string) => void;
  clearSelectedEntities: () => void;
  addItem: (item: Omit<CAMItem, "id">) => string;
  removeItem: (id: string) => void;
  updateItem: (id: string, updates: Partial<CAMItem>) => void;
  // Machine control
  connectMachine: () => void;
  disconnectMachine: () => void;
  runGcode: () => void;
  pauseMachine: () => void;
  stopMachine: () => void;
  homeMachine: () => void;
  jogMachine: (x: number, y: number, z: number, speed: number) => void;
  // Azioni nuove per workpiece setup
  setSelectedWorkpieceElementId: (id: string | null) => void;
  setDerivedWorkpieceDimensions: (dimensions: DerivedWorkpieceDimensions | null) => void;
  setStockAllowance: (allowance: number) => void;
  setIsLatheSetup: (isLathe: boolean) => void;
  setLoading: (loading: boolean) => void; // Assicurati sia definita
  setError: (error: string | null) => void; // Assicurati sia definita
  resetWorkpieceSelection: () => void; // Azione specifica per resettare la selezione workpiece

  // Nuove azioni per la sincronizzazione CAD-CAM
  syncWorkpieceFromCAD: () => void;
  setWorkpieceElements: (elements: Element[]) => void;
  getWorkpieceGeometry: () => { dimensions: DerivedWorkpieceDimensions; elementId: string | null } | null;
}

// Helper per calcolare le dimensioni di un elemento
const calculateElementDimensions = (element: Element): DerivedWorkpieceDimensions | null => {
  if (!element) return null;

  // Gestione elementi di base
  if (element.type === "box" || element.type === "cube") {
    return {
      width: element.width || 100,
      height: element.height || 100,
      depth: element.depth || 20
    };
  }

  // Gestione per elementi cilindrici
  if (element.type === "cylinder") {
    const diameter = element.radius ? element.radius * 2 : 100;
    return {
      width: diameter,
      height: diameter,
      depth: element.height || 100
    };
  }

  // Per forme più complesse, cerca di estrarre le dimensioni o usa valori di default
  if (element.boundingBox) {
    return {
      width: element.boundingBox.max.x - element.boundingBox.min.x,
      height: element.boundingBox.max.y - element.boundingBox.min.y,
      depth: element.boundingBox.max.z - element.boundingBox.min.z
    };
  }

  // Default per elementi senza dimensioni specifiche
  return {
    width: 100,
    height: 100,
    depth: 20
  };
};

// Stato iniziale aggiornato
const initialState: Pick<
  CAMStoreState,
  | "selectedWorkpieceElementId"
  | "derivedWorkpieceDimensions"
  | "stockAllowance"
  | "isLatheSetup"
  | "isLoading"
  | "error"
  | "toolpaths"
  | "gcode"
  | "selectedEntities"
  | "machineStatus"
  | "machinePosition"
  | "camItems"
  | "workpieceElements"
  | "preserveGeometry"
> = {
  selectedWorkpieceElementId: null,
  derivedWorkpieceDimensions: null,
  stockAllowance: 1.0, // Valore di default
  isLatheSetup: false,
  isLoading: false, // Stato iniziale per isLoading
  error: null, // Stato iniziale per error
  // Stati iniziali esistenti
  toolpaths: [],
  gcode: "",
  selectedEntities: [],
  machineStatus: "disconnected",
  machinePosition: { x: 0, y: 0, z: 0 },
  camItems: [],
  workpieceElements: [], // Inizializza la nuova proprietà
  preserveGeometry: true // Per default, preserva la geometria completa
};

// Creazione dello store Zustand aggiornato
export const useCAMStore = create<CAMStoreState>((set, get) => ({
  ...initialState,

  // Implementazione delle azioni nuove/modificate
  setSelectedWorkpieceElementId: id =>
    set({
      selectedWorkpieceElementId: id,
      // Se stiamo cancellando la selezione, non cancellare le dimensioni derivate
      derivedWorkpieceDimensions: id ? get().derivedWorkpieceDimensions : null
    }),
  setDerivedWorkpieceDimensions: dimensions => set({ derivedWorkpieceDimensions: dimensions }),
  setStockAllowance: allowance => set({ stockAllowance: allowance >= 0 ? allowance : 0 }),
  setIsLatheSetup: isLathe => set({ isLatheSetup: isLathe }),
  setLoading: loading => set({ isLoading: loading }),
  setError: error => set({ error: error }),

  // Nuova azione per sincronizzare il workpiece dal CAD
  syncWorkpieceFromCAD: () => {
    const { selectedElement } = useElementsStore.getState();
    const { elements } = useElementsStore.getState();
    const { workpiece } = useCADStore.getState();

    // Prima controlla se il workpiece nel CAD ha un elemento collegato
    if (workpiece) {
      const elementFromWorkpiece = elements.find(el => el.id === workpiece.elementId);
      if (elementFromWorkpiece) {
        // Il CAD ha un elemento collegato, usalo come workpiece nel CAM
        set({
          selectedWorkpieceElementId: elementFromWorkpiece.id,
          derivedWorkpieceDimensions: calculateElementDimensions(elementFromWorkpiece),
          workpieceElements: [elementFromWorkpiece],
          preserveGeometry: true
        });
        console.log("CAM Workpiece sincronizzato dal workpiece CAD:", elementFromWorkpiece.id);
        return; // Abbiamo già sincronizzato, usciamo
      }
    }

    // Se non c'è un elemento collegato nel workpiece CAD, ma c'è un elemento selezionato, usalo
    if (selectedElement) {
      // Preserva tutte le proprietà della geometria, inclusi mesh, buffer, vertici, ecc.
      const threeJSElement = selectedElement.threeJSObject || generateFromSelectedElements(selectedElement, elements);

      // Calcola le dimensioni dell'elemento
      const dimensions = calculateElementDimensions(selectedElement);

      // Aggiorna lo stato con l'elemento selezionato e le sue dimensioni
      set({
        selectedWorkpieceElementId: selectedElement.id,
        derivedWorkpieceDimensions: dimensions,
        workpieceElements: [threeJSElement], // Mantieni l'oggetto ThreeJS completo
        preserveGeometry: true // Flag per indicare di preservare la geometria completa
      });

      // Sincronizza anche con il CADStore per la coerenza
      // Importante: imposta elementId per mantenere il riferimento all'elemento
      useCADStore.getState().setWorkpiece({
        width: dimensions?.width || workpiece.width,
        height: dimensions?.height || workpiece.height,
        depth: dimensions?.depth || workpiece.depth,
        material: selectedElement.material || workpiece?.material,
        radius: selectedElement.radius || workpiece?.radius,
        elementId: selectedElement.id // Aggiungi il riferimento all'elemento
      });

      console.log("CAM Workpiece sincronizzato dal CAD con geometria completa:", selectedElement.id);
    } else {
      // Se non ci sono elementi selezionati, aggiorna comunque la lista degli elementi disponibili
      set({
        workpieceElements: elements,
        // Non resettare l'elemento workpiece selezionato se già presente
        preserveGeometry: true // Mantieni l'impostazione di preservare la geometria
      });
    }
  },

  // Nuova azione per impostare gli elementi del workpiece
  setWorkpieceElements: elements => set({ workpieceElements: elements }),

  // Funzione per ottenere la geometria del workpiece corrente
  getWorkpieceGeometry: () => {
    const { selectedWorkpieceElementId, derivedWorkpieceDimensions } = get();
    const { workpiece } = useCADStore.getState();

    // Se abbiamo un elemento selezionato e dimensioni derivate, usali
    if (selectedWorkpieceElementId && derivedWorkpieceDimensions) {
      return {
        dimensions: derivedWorkpieceDimensions,
        elementId: selectedWorkpieceElementId
      };
    }

    // Altrimenti, usa il workpiece dal CADStore
    if (workpiece) {
      return {
        dimensions: {
          width: workpiece.width,
          height: workpiece.height,
          depth: workpiece.depth
        },
        elementId: null // Nessun elemento specifico
      };
    }

    return null; // Nessuna geometria disponibile
  },

  resetWorkpieceSelection: () =>
    set({
      selectedWorkpieceElementId: initialState.selectedWorkpieceElementId,
      derivedWorkpieceDimensions: initialState.derivedWorkpieceDimensions
      // Non resettare stockAllowance o isLatheSetup qui, potrebbero essere intenzionali
    }),

  // Implementazione delle azioni esistenti (assicurati che siano tutte presenti)
  addItem: item => {
    const newItem: CAMItem = { id: uuidv4(), ...item };
    set(state => ({ camItems: [...state.camItems, newItem] }));
    return newItem.id;
  },
  removeItem: id => {
    set(state => ({ camItems: state.camItems.filter(item => item.id !== id) }));
  },
  updateItem: (id, updates) => {
    set(state => ({
      camItems: state.camItems.map(item => (item.id === id ? { ...item, ...updates } : item))
    }));
  },
  generateToolpath: params => {
    const { selectedEntities } = get();
    const elements = useElementsStore.getState().elements;
    const selectedElements = elements.filter(element => selectedEntities.includes(element.id));
    if (selectedElements.length === 0) {
      console.warn("No elements selected for toolpath generation");
      return;
    }
    try {
      const toolpath = generateToolpathFromEntities(selectedElements, params);
      if (!toolpath) {
        console.warn("Failed to generate toolpath");
        return;
      }
      const machineParams = {
        tool: {
          id: params.toolId || "default",
          name: params.toolName || "Default Tool",
          diameter: params.toolDiameter || 6,
          numberOfFlutes: params.numberOfFlutes || 2,
          material: params.toolMaterial || "HSS",
          type: params.toolType || "endmill"
        },
        operation: params.operation || "profile",
        depth: params.depth || 5,
        feedrate: params.feedrate || 1000,
        plungerate: params.plungerate || 300,
        spindleSpeed: params.spindleSpeed || 12000,
        coolant: params.coolant || false,
        safeHeight: params.safeHeight || 5,
        clearanceHeight: params.clearanceHeight || 10,
        machineType: params.machineType || "mill",
        coordinateSystem: params.coordinateSystem || "G54",
        useInches: params.useInches || false,
        arcTolerance: params.arcTolerance || 0.01,
        optimization: {
          removeRedundantMoves: params.removeRedundantMoves !== false,
          optimizePath: params.optimizePath === true,
          minimizeToolChanges: params.minimizeToolChanges === true
        }
      };
      toolpath.operations.forEach((operation: any) => {
        if (typeof operation === "object" && operation !== null && !operation.depth) {
          operation.depth = machineParams.depth;
        }
      });
      const gcode = generateGcode(toolpath, machineParams);
      set(state => ({ toolpaths: [...state.toolpaths, toolpath], gcode }));
    } catch (error) {
      console.error("Error generating toolpath:", error);
      get().setError("Failed to generate toolpath: " + (error as Error).message);
    }
  },
  setGcode: gcode => {
    set({ gcode });
  },
  toggleEntitySelection: id => {
    set(state => {
      const isSelected = state.selectedEntities.includes(id);
      return {
        selectedEntities: isSelected
          ? state.selectedEntities.filter(entityId => entityId !== id)
          : [...state.selectedEntities, id]
      };
    });
  },
  clearSelectedEntities: () => {
    set({ selectedEntities: [] });
  },
  // Machine control methods
  connectMachine: () => {
    console.log("Connecting to machine...");
    set({ machineStatus: "connected" });
  },
  disconnectMachine: () => {
    console.log("Disconnecting from machine...");
    set({ machineStatus: "disconnected" });
  },
  runGcode: () => {
    const { machineStatus, gcode } = get();
    if (machineStatus !== "connected" && machineStatus !== "paused") {
      console.warn("Cannot run G-code: Machine not connected or already running");
      return;
    }
    if (!gcode) {
      console.warn("No G-code to run");
      return;
    }
    console.log("Running G-code...");
    set({ machineStatus: "running" });
    // Qui andrebbe la logica per inviare il G-code alla macchina
  },
  pauseMachine: () => {
    if (get().machineStatus !== "running") return;
    console.log("Pausing machine...");
    set({ machineStatus: "paused" });
    // Logica per mettere in pausa la macchina
  },
  stopMachine: () => {
    console.log("Stopping machine...");
    set({ machineStatus: "connected" }); // Torna a connesso dopo stop
    // Logica per fermare la macchina
  },
  homeMachine: () => {
    if (get().machineStatus !== "connected") return;
    console.log("Homing machine...");
    // Logica per homing
    set({ machinePosition: { x: 0, y: 0, z: 0 } }); // Simula ritorno a zero
  },
  jogMachine: (x, y, z, speed) => {
    if (get().machineStatus !== "connected") return;
    console.log(`Jogging machine by X:${x} Y:${y} Z:${z} at speed ${speed}`);
    // Logica per jog
    set(state => ({
      machinePosition: {
        x: state.machinePosition.x + x,
        y: state.machinePosition.y + y,
        z: state.machinePosition.z + z
      }
    }));
  }
}));
