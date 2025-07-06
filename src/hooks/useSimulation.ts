import { useState, useCallback, useRef } from "react";
import * as THREE from "three";
import { useElementsStore } from "../store/elementsStore";

export interface SimulationHookState {
  isSimulationOpen: boolean;
  selectedElementsForSimulation: string[];
  simulationMode: "idle" | "selecting" | "configuring" | "running";
  simulationResults: any | null;
}

export interface SimulationHookActions {
  openSimulation: () => void;
  closeSimulation: () => void;
  toggleSimulationMode: () => void;
  selectElementsForSimulation: (elementIds: string[]) => void;
  addElementToSimulation: (elementId: string) => void;
  removeElementFromSimulation: (elementId: string) => void;
  clearSimulationSelection: () => void;
  canSimulateElement: (elementId: string) => boolean;
  getSimulatableElements: () => string[];
}

export const useSimulation = (): SimulationHookState & SimulationHookActions => {
  const [isSimulationOpen, setIsSimulationOpen] = useState(false);
  const [selectedElementsForSimulation, setSelectedElementsForSimulation] = useState<string[]>([]);
  const [simulationMode, setSimulationMode] = useState<"idle" | "selecting" | "configuring" | "running">("idle");
  const [simulationResults, setSimulationResults] = useState<any | null>(null);
  
  const { elements, selectedElement } = useElementsStore();
  
  // List of element types that can be simulated
  const simulatableTypes = [
    "cube", "sphere", "cylinder", "cone", "torus",
    "extrude", "revolve", "loft", "sweep",
    "component", "mesh", "imported"
  ];
  
  const openSimulation = useCallback(() => {
    setIsSimulationOpen(true);
    
    // Auto-select current selected element if it's simulatable
    if (selectedElement && simulatableTypes.includes(selectedElement.type)) {
      setSelectedElementsForSimulation([selectedElement.id]);
      setSimulationMode("configuring");
    } else {
      setSimulationMode("selecting");
    }
  }, [selectedElement]);
  
  const closeSimulation = useCallback(() => {
    setIsSimulationOpen(false);
    setSelectedElementsForSimulation([]);
    setSimulationMode("idle");
    setSimulationResults(null);
  }, []);
  
  const toggleSimulationMode = useCallback(() => {
    if (simulationMode === "selecting") {
      setSimulationMode("configuring");
    } else if (simulationMode === "configuring") {
      setSimulationMode("selecting");
    }
  }, [simulationMode]);
  
  const selectElementsForSimulation = useCallback((elementIds: string[]) => {
    // Filter only simulatable elements
    const validElementIds = elementIds.filter(id => {
      const element = elements.find(el => el.id === id);
      return element && simulatableTypes.includes(element.type);
    });
    
    setSelectedElementsForSimulation(validElementIds);
    
    if (validElementIds.length > 0 && simulationMode === "selecting") {
      setSimulationMode("configuring");
    }
  }, [elements, simulationMode]);
  
  const addElementToSimulation = useCallback((elementId: string) => {
    const element = elements.find(el => el.id === elementId);
    if (!element || !simulatableTypes.includes(element.type)) {
      console.warn(`Element ${elementId} cannot be simulated`);
      return;
    }
    
    if (!selectedElementsForSimulation.includes(elementId)) {
      setSelectedElementsForSimulation(prev => [...prev, elementId]);
      
      if (simulationMode === "selecting") {
        setSimulationMode("configuring");
      }
    }
  }, [elements, selectedElementsForSimulation, simulationMode]);
  
  const removeElementFromSimulation = useCallback((elementId: string) => {
    setSelectedElementsForSimulation(prev => prev.filter(id => id !== elementId));
  }, []);
  
  const clearSimulationSelection = useCallback(() => {
    setSelectedElementsForSimulation([]);
    setSimulationMode("selecting");
  }, []);
  
  const canSimulateElement = useCallback((elementId: string): boolean => {
    const element = elements.find(el => el.id === elementId);
    return element ? simulatableTypes.includes(element.type) : false;
  }, [elements]);
  
  const getSimulatableElements = useCallback((): string[] => {
    return elements
      .filter(element => simulatableTypes.includes(element.type))
      .map(element => element.id);
  }, [elements]);
  
  return {
    // State
    isSimulationOpen,
    selectedElementsForSimulation,
    simulationMode,
    simulationResults,
    
    // Actions
    openSimulation,
    closeSimulation,
    toggleSimulationMode,
    selectElementsForSimulation,
    addElementToSimulation,
    removeElementFromSimulation,
    clearSimulationSelection,
    canSimulateElement,
    getSimulatableElements
  };
};

// Additional utility hook for simulation visualization effects
export const useSimulationEffects = () => {
  const visualEffectsRef = useRef<{
    stressColorMap?: THREE.DataTexture;
    temperatureColorMap?: THREE.DataTexture;
    deformationMesh?: THREE.Mesh;
    forceArrows?: THREE.Group;
    constraintMarkers?: THREE.Group;
  }>({});
  
  const createStressColorMap = useCallback((stressValues: number[], maxStress: number) => {
    const width = 256;
    const height = 1;
    const data = new Uint8Array(width * height * 4);
    
    for (let i = 0; i < width; i++) {
      const t = i / (width - 1);
      
      // Blue to red color mapping for stress
      let r, g, b;
      if (t < 0.5) {
        r = 0;
        g = Math.floor(t * 2 * 255);
        b = 255 - Math.floor(t * 2 * 255);
      } else {
        r = Math.floor((t - 0.5) * 2 * 255);
        g = 255 - Math.floor((t - 0.5) * 2 * 255);
        b = 0;
      }
      
      const index = i * 4;
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = 255;
    }
    
    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    texture.needsUpdate = true;
    
    visualEffectsRef.current.stressColorMap = texture;
    return texture;
  }, []);
  
  const createTemperatureColorMap = useCallback((temperatureValues: number[], minTemp: number, maxTemp: number) => {
    const width = 256;
    const height = 1;
    const data = new Uint8Array(width * height * 4);
    
    for (let i = 0; i < width; i++) {
      const t = i / (width - 1);
      
      // Cool to hot color mapping
      let r, g, b;
      if (t < 0.25) {
        // Black to blue
        r = 0;
        g = 0;
        b = Math.floor(t * 4 * 255);
      } else if (t < 0.5) {
        // Blue to cyan
        r = 0;
        g = Math.floor((t - 0.25) * 4 * 255);
        b = 255;
      } else if (t < 0.75) {
        // Cyan to yellow
        r = Math.floor((t - 0.5) * 4 * 255);
        g = 255;
        b = 255 - Math.floor((t - 0.5) * 4 * 255);
      } else {
        // Yellow to red
        r = 255;
        g = 255 - Math.floor((t - 0.75) * 4 * 255);
        b = 0;
      }
      
      const index = i * 4;
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = 255;
    }
    
    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    texture.needsUpdate = true;
    
    visualEffectsRef.current.temperatureColorMap = texture;
    return texture;
  }, []);
  
  const createForceArrows = useCallback((forces: Array<{
    position: THREE.Vector3;
    direction: THREE.Vector3;
    magnitude: number;
  }>) => {
    const group = new THREE.Group();
    group.name = "ForceArrows";
    
    forces.forEach((force, index) => {
      const arrowHelper = new THREE.ArrowHelper(
        force.direction.normalize(),
        force.position,
        Math.min(Math.max(force.magnitude / 100, 0.2), 2),
        0xff0000, // Red color
        undefined,
        undefined
      );
      
      arrowHelper.name = `Force_${index}`;
      group.add(arrowHelper);
    });
    
    visualEffectsRef.current.forceArrows = group;
    return group;
  }, []);
  
  const createConstraintMarkers = useCallback((constraints: Array<{
    position: THREE.Vector3;
    fullyFixed: boolean;
  }>) => {
    const group = new THREE.Group();
    group.name = "ConstraintMarkers";
    
    constraints.forEach((constraint, index) => {
      const geometry = new THREE.SphereGeometry(0.1, 16, 16);
      const material = new THREE.MeshBasicMaterial({
        color: constraint.fullyFixed ? 0x1e88e5 : 0x42a5f5,
        transparent: true,
        opacity: 0.7
      });
      
      const marker = new THREE.Mesh(geometry, material);
      marker.position.copy(constraint.position);
      marker.name = `Constraint_${index}`;
      
      group.add(marker);
    });
    
    visualEffectsRef.current.constraintMarkers = group;
    return group;
  }, []);
  
  const clearAllEffects = useCallback(() => {
    Object.values(visualEffectsRef.current).forEach(effect => {
      if (effect instanceof THREE.Object3D) {
        effect.parent?.remove(effect);
      } else if (effect instanceof THREE.Texture) {
        effect.dispose();
      }
    });
    
    visualEffectsRef.current = {};
  }, []);
  
  return {
    createStressColorMap,
    createTemperatureColorMap,
    createForceArrows,
    createConstraintMarkers,
    clearAllEffects,
    visualEffectsRef
  };
}; 