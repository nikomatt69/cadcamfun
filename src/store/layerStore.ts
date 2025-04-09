import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  color: string;
}

interface LayerState {
  layers: Layer[];
  activeLayer: string;
  // Actions
  addLayer: (layer: Omit<Layer, 'id'>) => void;
  updateLayer: (id: string, updates: Partial<Layer>) => void;
  deleteLayer: (id: string) => void;
  setActiveLayer: (id: string) => void;
}

export const useLayerStore = create<LayerState>((set, get) => {
  // Create default layer
  const defaultLayerId = uuidv4();
  
  return {
    layers: [
      {
        id: defaultLayerId,
        name: 'Default Layer',
        visible: true,
        locked: false,
        color: '#1e88e5'
      }
    ],
    activeLayer: defaultLayerId,

    addLayer: (layer) => {
      const newLayer = {
        ...layer,
        id: uuidv4()
      };
      set((state) => ({
        layers: [...state.layers, newLayer]
      }));
      return newLayer.id;
    },

    updateLayer: (id, updates) => {
      set((state) => ({
        layers: state.layers.map((layer) =>
          layer.id === id ? { ...layer, ...updates } : layer
        )
      }));
    },

    deleteLayer: (id) => {
      const { layers, activeLayer } = get();
      
      // Don't delete if it's the last layer
      if (layers.length <= 1) {
        return;
      }
      
      // If deleting active layer, set another one as active
      let newActiveLayer = activeLayer;
      if (activeLayer === id) {
        const remainingLayers = layers.filter(layer => layer.id !== id);
        newActiveLayer = remainingLayers[0].id;
      }
      
      set((state) => ({
        layers: state.layers.filter((layer) => layer.id !== id),
        activeLayer: newActiveLayer
      }));
    },

    setActiveLayer: (id) => {
      set({ activeLayer: id });
    }
  };
});