import { create } from "zustand";
import { AIAction, AIArtifact } from "@/src/types/AITypes";
import { Element } from "@/src/store/elementsStore";

interface GeneratedComponent {
  id: string;
  name: string;
  description: string;
  timestamp: number;
  elements: Element[];
  preview?: string; // Base64 immagine preview
  source: "ai" | "user" | "imported";
  tags: string[];
  metadata: Record<string, any>;
}

interface AIComponentState {
  components: GeneratedComponent[];
  favoriteComponents: string[]; // IDs dei componenti preferiti
  currentComponent: GeneratedComponent | null;
  filterTags: string[];

  // Actions
  addComponent: (elements: Element[], name?: string, description?: string) => string;
  addComponentFromAction: (action: AIAction) => string;
  addComponentFromArtifact: (artifact: AIArtifact) => string;
  updateComponent: (id: string, updates: Partial<GeneratedComponent>) => void;
  deleteComponent: (id: string) => void;
  toggleFavorite: (id: string) => void;
  setCurrentComponent: (id: string | null) => void;
  addFilterTag: (tag: string) => void;
  removeFilterTag: (tag: string) => void;
  clearFilterTags: () => void;
  exportComponents: (ids: string[]) => Promise<Blob>;
  importComponents: (file: File) => Promise<string[]>;
}

export const useAIComponentStore = create<AIComponentState>((set, get) => ({
  components: [],
  favoriteComponents: [],
  currentComponent: null,
  filterTags: [],

  addComponent: (elements, name = "AI Generated Component", description = "") => {
    const id = `comp_${Date.now()}`;
    const newComponent: GeneratedComponent = {
      id,
      name,
      description,
      timestamp: Date.now(),
      elements,
      source: "user",
      tags: ["custom"],
      metadata: {}
    };

    set(state => ({
      components: [...state.components, newComponent]
    }));

    return id;
  },

  addComponentFromAction: action => {
    if (action.type !== "generateCADElement" || !action.payload?.elements) {
      return "";
    }

    const elements = action.payload.elements;
    const id = `comp_${Date.now()}`;
    const newComponent: GeneratedComponent = {
      id,
      name: action.payload.name || "AI Generated Component",
      description: action.payload.description || `Component with ${elements.length} elements`,
      timestamp: Date.now(),
      elements,
      source: "user",
      tags: ["custom"],
      metadata: {
        originalAction: action.type,
        generationPrompt: action.payload.prompt || ""
      }
    };

    set(state => ({
      components: [...state.components, newComponent]
    }));

    return id;
  },

  addComponentFromArtifact: artifact => {
    if (artifact.type !== "cad_elements" || !artifact.content) {
      return "";
    }

    const elements = artifact.content;
    const id = `comp_${Date.now()}`;
    const newComponent: GeneratedComponent = {
      id,
      name: artifact.title || "Component from Artifact",
      description: "",
      timestamp: Date.now(),
      elements,
      source: "user",
      tags: ["custom"],
      metadata: {}
    };

    set(state => ({
      components: [...state.components, newComponent]
    }));

    return id;
  },

  updateComponent: (id, updates) => {
    set(state => ({
      components: state.components.map(comp => (comp.id === id ? { ...comp, ...updates } : comp))
    }));
  },

  deleteComponent: id => {
    set(state => ({
      components: state.components.filter(comp => comp.id !== id),
      favoriteComponents: state.favoriteComponents.filter(favId => favId !== id),
      currentComponent: state.currentComponent?.id === id ? null : state.currentComponent
    }));
  },

  toggleFavorite: id => {
    set(state => {
      const isFavorite = state.favoriteComponents.includes(id);
      return {
        favoriteComponents: isFavorite
          ? state.favoriteComponents.filter(favId => favId !== id)
          : [...state.favoriteComponents, id]
      };
    });
  },

  setCurrentComponent: id => {
    set(state => ({
      currentComponent: id ? state.components.find(comp => comp.id === id) || null : null
    }));
  },

  addFilterTag: tag => {
    set(state => ({
      filterTags: state.filterTags.includes(tag) ? state.filterTags : [...state.filterTags, tag]
    }));
  },

  removeFilterTag: tag => {
    set(state => ({
      filterTags: state.filterTags.filter(t => t !== tag)
    }));
  },

  clearFilterTags: () => {
    set({ filterTags: [] });
  },

  exportComponents: async ids => {
    const componentsToExport = get().components.filter(comp => ids.includes(comp.id));

    const exportData = JSON.stringify(componentsToExport);
    return new Blob([exportData], { type: "application/json" });
  },

  importComponents: async file => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = event => {
        try {
          const jsonData = JSON.parse(event.target?.result as string);

          if (!Array.isArray(jsonData)) {
            reject(new Error("Invalid file format. Expected an array of components."));
            return;
          }

          const importedIds: string[] = [];
          const newComponents: GeneratedComponent[] = [];

          jsonData.forEach((comp: any) => {
            // Validate basic component structure
            if (!comp.elements || !Array.isArray(comp.elements)) {
              return;
            }

            const newId = `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            importedIds.push(newId);

            newComponents.push({
              ...comp,
              id: newId,
              source: "imported",
              tags: [...(comp.tags || []), "imported"],
              timestamp: Date.now()
            });
          });

          if (newComponents.length === 0) {
            reject(new Error("No valid components found in the file."));
            return;
          }

          set(state => ({
            components: [...state.components, ...newComponents]
          }));

          resolve(importedIds);
        } catch (error) {
          reject(new Error("Failed to parse import file."));
        }
      };

      reader.onerror = () => {
        reject(new Error("Failed to read file."));
      };

      reader.readAsText(file);
    });
  }
}));
