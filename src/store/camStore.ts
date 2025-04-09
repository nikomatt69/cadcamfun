import { create } from 'zustand';
import { useElementsStore } from './elementsStore';
import { generateToolpathFromEntities } from 'src/lib/toolpathGenerator';
import { generateGcode } from 'src/lib/gcodeGenerator';
import { v4 as uuidv4 } from 'uuid';

type MachineStatus = 'disconnected' | 'connected' | 'running' | 'paused' | 'error';

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
  type: 'tool' | 'machine' | 'workpiece' | 'setup';
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

interface CAMState {
  toolpaths: Toolpath[];
  gcode: string;
  selectedEntities: string[];
  machineStatus: MachineStatus;
  machinePosition: { x: number; y: number; z: number };
  camItems: CAMItem[];
  // Actions
  generateToolpath: (params: any) => void;
  setGcode: (gcode: string) => void;
  toggleEntitySelection: (id: string) => void;
  clearSelectedEntities: () => void;
  addItem: (item: Omit<CAMItem, 'id'>) => string; // New method to add CAM items
  removeItem: (id: string) => void; // Method to remove CAM items
  updateItem: (id: string, updates: Partial<CAMItem>) => void; // Method to update CAM items
  // Machine control
  connectMachine: () => void;
  disconnectMachine: () => void;
  runGcode: () => void;
  pauseMachine: () => void;
  stopMachine: () => void;
  homeMachine: () => void;
  jogMachine: (x: number, y: number, z: number, speed: number) => void;
}

export const useCAMStore = create<CAMState>((set, get) => ({
  toolpaths: [],
  gcode: '',
  selectedEntities: [],
  machineStatus: 'disconnected',
  machinePosition: { x: 0, y: 0, z: 0 },
  camItems: [],

  // Method to add a new CAM item
  addItem: (item) => {
    const newItem: CAMItem = {
      id: uuidv4(),
      ...item
    };

    set(state => ({
      camItems: [...state.camItems, newItem]
    }));

    return newItem.id;
  },

  // Method to remove a CAM item
  removeItem: (id) => {
    set(state => ({
      camItems: state.camItems.filter(item => item.id !== id)
    }));
  },

  // Method to update a CAM item
  updateItem: (id, updates) => {
    set(state => ({
      camItems: state.camItems.map(item => 
        item.id === id ? { ...item, ...updates } : item
      )
    }));
  },

  // Existing generateToolpath method remains the same
  generateToolpath: (params) => {
    const { selectedEntities } = get();
    const elements = useElementsStore.getState().elements;
    const selectedElements = elements.filter(element => 
      selectedEntities.includes(element.id)
    );

    if (selectedElements.length === 0) {
      console.warn('No elements selected for toolpath generation');
      return;
    }

    try {
      // Generate toolpath from selected entities
      const toolpath = generateToolpathFromEntities(selectedElements, params);
      
      if (!toolpath) {
        console.warn('Failed to generate toolpath');
        return;
      }
      
      // Prepare machine parameters for the advanced G-code generator
      const machineParams = {
        tool: {
          id: params.toolId || 'default',
          name: params.toolName || 'Default Tool',
          diameter: params.toolDiameter || 6,
          numberOfFlutes: params.numberOfFlutes || 2,
          material: params.toolMaterial || 'HSS',
          type: params.toolType || 'endmill',
        },
        operation: params.operation || 'profile',
        depth: params.depth || 5,
        feedrate: params.feedrate || 1000,
        plungerate: params.plungerate || 300,
        spindleSpeed: params.spindleSpeed || 12000,
        coolant: params.coolant || false,
        safeHeight: params.safeHeight || 5,
        clearanceHeight: params.clearanceHeight || 10,
        machineType: params.machineType || 'mill',
        coordinateSystem: params.coordinateSystem || 'G54',
        useInches: params.useInches || false,
        arcTolerance: params.arcTolerance || 0.01,
        optimization: {
          removeRedundantMoves: params.removeRedundantMoves !== false,
          optimizePath: params.optimizePath === true,
          minimizeToolChanges: params.minimizeToolChanges === true,
        }
      };
      
      // Genera G-code dal percorso utensile utilizzando il nuovo generatore avanzato
      // Aggiunge la profondità mancante alle operazioni del percorso utensile
      toolpath.operations.forEach(operation => {
        operation.type = machineParams.depth;
      });
      const gcode = generateGcode(toolpath, machineParams);
      
      set(state => ({
        toolpaths: [...state.toolpaths, toolpath],
        gcode
      }));
    } catch (error) {
      console.error('Error generating toolpath:', error);
    }
  },

  // Remaining methods remain the same as in the original implementation
  setGcode: (gcode) => {
    set({ gcode });
  },

  toggleEntitySelection: (id) => {
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

  // Machine control methods remain the same
  connectMachine: () => {
    console.log('Connecting to machine...');
    set({ machineStatus: 'connected' });
  },

  disconnectMachine: () => {
    console.log('Disconnecting from machine...');
    set({ machineStatus: 'disconnected' });
  },

  runGcode: () => {
    const { machineStatus, gcode } = get();
    
    if (machineStatus !== 'connected' && machineStatus !== 'paused') {
      console.warn('Cannot run G-code: Machine not connected or already running');
      return;
    }
    
    if (!gcode) {
      console.warn('Cannot run G-code: No G-code generated');
      return;
    }
    
    console.log('Running G-code...');
    set({ machineStatus: 'running' });
    
    setTimeout(() => {
      if (get().machineStatus === 'running') {
        console.log('G-code execution completed');
        set({ machineStatus: 'connected' });
      }
    }, 5000);
  },

  pauseMachine: () => {
    if (get().machineStatus !== 'running') {
      console.warn('Cannot pause: Machine not running');
      return;
    }
    
    console.log('Pausing machine...');
    set({ machineStatus: 'paused' });
  },

  stopMachine: () => {
    if (get().machineStatus !== 'running' && get().machineStatus !== 'paused') {
      console.warn('Cannot stop: Machine not running or paused');
      return;
    }
    
    console.log('Stopping machine...');
    set({ machineStatus: 'connected' });
  },

  homeMachine: () => {
    if (get().machineStatus !== 'connected') {
      console.warn('Cannot home: Machine not connected');
      return;
    }
    
    console.log('Homing machine...');
    set({ machinePosition: { x: 0, y: 0, z: 0 } });
  },

  jogMachine: (x, y, z, speed) => {
    if (get().machineStatus !== 'connected') {
      console.warn('Cannot jog: Machine not connected');
      return;
    }
    
    console.log(`Jogging machine: X${x}, Y${y}, Z${z} at ${speed}mm/min`);
    set(state => ({
      machinePosition: {
        x: state.machinePosition.x + x,
        y: state.machinePosition.y + y,
        z: state.machinePosition.z + z
      }
    }));
  }
}));