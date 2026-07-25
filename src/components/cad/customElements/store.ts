// store.ts - Custom Elements Store usando Zustand
// Completamente indipendente dagli store esistenti

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { 
  CustomElementDefinition, 
  CustomElementParameter,
  ValidationResult 
} from './types';

interface CustomElementsState {
  // Definitions storage
  definitions: Record<string, CustomElementDefinition>;
  
  // Editor state
  activeDefinition: CustomElementDefinition | null;
  isEditorOpen: boolean;
  editorMode: 'create' | 'edit';
  
  // Preview state
  previewParameters: Record<string, any>;
  previewObject: any; // THREE.Object3D | null
  isGeneratingPreview: boolean;
  previewError: string | null;
  
  // Validation
  validationErrors: string[];
  
  // Actions per definitions
  createDefinition: (definition: Omit<CustomElementDefinition, 'id' | 'created' | 'modified'>) => string;
  updateDefinition: (id: string, updates: Partial<CustomElementDefinition>) => void;
  deleteDefinition: (id: string) => void;
  duplicateDefinition: (id: string, newName: string) => string;
  
  // Actions per editor
  openEditor: (mode: 'create' | 'edit', definitionId?: string) => void;
  closeEditor: () => void;
  setActiveDefinition: (definition: CustomElementDefinition | null) => void;
  
  // Actions per preview
  updatePreviewParameters: (parameters: Record<string, any>) => void;
  setPreviewObject: (object: any) => void;
  setGeneratingPreview: (isGenerating: boolean) => void;
  setPreviewError: (error: string | null) => void;
  
  // Validation
  validateDefinition: (definition: CustomElementDefinition) => ValidationResult;
  setValidationErrors: (errors: string[]) => void;
  
  // Import/Export
  exportDefinition: (id: string) => string | null;
  importDefinition: (jsonString: string) => string | null;
  exportAllDefinitions: () => string;
  importDefinitions: (jsonString: string) => string[];
  
  // Utility
  getDefinitionsByCategory: (category?: string) => CustomElementDefinition[];
  searchDefinitions: (query: string) => CustomElementDefinition[];
}

// Default definition template
const createDefaultDefinition = (): Omit<CustomElementDefinition, 'id' | 'created' | 'modified'> => ({
  name: 'New Custom Element',
  description: 'A custom Three.js element',
  category: 'Custom',
  tags: [],
  version: '1.0.0',
  author: 'User',
  
  parameters: {
    size: {
      type: 'number',
      default: 1,
      min: 0.1,
      max: 10,
      step: 0.1,
      description: 'Size of the element',
      label: 'Size'
    },
    color: {
      type: 'color',
      default: '#1e88e5',
      description: 'Color of the element',
      label: 'Color'
    }
  },
  
  geometryCode: `// Create your custom geometry here
// Available variables: THREE, parameters (user inputs)
// Must return a THREE.BufferGeometry or THREE.Object3D

const geometry = new THREE.BoxGeometry(
  parameters.size, 
  parameters.size, 
  parameters.size
);

return geometry;`,
  
  materialConfig: {
    type: 'standard',
    properties: {
      color: 'parameters.color', // Reference to parameter
      wireframe: false
    }
  },
  
  previewConfig: {
    camera: {
      position: [3, 3, 3],
      target: [0, 0, 0]
    },
    background: '#f0f0f0',
    lighting: true
  }
});

export const useCustomElementsStore = create<CustomElementsState>()(
  persist(
    (set, get) => ({
      definitions: {},
      activeDefinition: null,
      isEditorOpen: false,
      editorMode: 'create',
      previewParameters: {},
      previewObject: null,
      isGeneratingPreview: false,
      previewError: null,
      validationErrors: [],

      createDefinition: (definition) => {
        const id = `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();
        
        const newDefinition: CustomElementDefinition = {
          ...definition,
          id,
          created: now,
          modified: now
        };
        
        set(state => ({
          definitions: {
            ...state.definitions,
            [id]: newDefinition
          }
        }));
        
        return id;
      },

      updateDefinition: (id, updates) => {
        set(state => {
          const existing = state.definitions[id];
          if (!existing) return state;
          
          const updated = {
            ...existing,
            ...updates,
            modified: new Date().toISOString()
          };
          
          return {
            definitions: {
              ...state.definitions,
              [id]: updated
            },
            activeDefinition: state.activeDefinition?.id === id ? updated : state.activeDefinition
          };
        });
      },

      deleteDefinition: (id) => {
        set(state => {
          const { [id]: deleted, ...remaining } = state.definitions;
          return {
            definitions: remaining,
            activeDefinition: state.activeDefinition?.id === id ? null : state.activeDefinition
          };
        });
      },

      duplicateDefinition: (id, newName) => {
        const definition = get().definitions[id];
        if (!definition) return '';
        const {
          id: _id,
          created: _created,
          modified: _modified,
          ...definitionInput
        } = definition;

        return get().createDefinition({
          ...definitionInput,
          name: newName
        });
      },

      openEditor: (mode, definitionId) => {
        const definition = definitionId ? get().definitions[definitionId] : null;
        
        set({
          isEditorOpen: true,
          editorMode: mode,
          activeDefinition: mode === 'create' ? 
            { ...createDefaultDefinition(), id: 'temp', created: '', modified: '' } as CustomElementDefinition : 
            definition,
          previewParameters: definition ? 
            Object.fromEntries(Object.entries(definition.parameters).map(([key, param]) => [key, param.default])) :
            Object.fromEntries(Object.entries(createDefaultDefinition().parameters).map(([key, param]) => [key, param.default])),
          previewError: null
        });
      },

      closeEditor: () => {
        set({
          isEditorOpen: false,
          activeDefinition: null,
          previewObject: null,
          validationErrors: [],
          previewError: null
        });
      },

      setActiveDefinition: (definition) => {
        set({ activeDefinition: definition });
      },

      updatePreviewParameters: (parameters) => {
        set({ previewParameters: parameters });
      },

      setPreviewObject: (object) => {
        set({ previewObject: object });
      },

      setGeneratingPreview: (isGenerating) => {
        set({ isGeneratingPreview: isGenerating });
      },

      setPreviewError: (error) => {
        set({ previewError: error });
      },

      validateDefinition: (definition) => {
        const errors: string[] = [];
        const warnings: string[] = [];
        
        // Validate basic fields
        if (!definition.name.trim()) {
          errors.push('Name is required');
        }
        
        if (!definition.geometryCode.trim()) {
          errors.push('Geometry code is required');
        }
        
        // Validate parameters
        Object.entries(definition.parameters).forEach(([key, param]) => {
          if (!key.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
            errors.push(`Parameter "${key}" has invalid name. Use alphanumeric characters and underscores only.`);
          }
          
          if (param.type === 'number' && param.min !== undefined && param.max !== undefined && param.min >= param.max) {
            errors.push(`Parameter "${key}": min value must be less than max value`);
          }
        });
        
        // Validate geometry code syntax
        try {
          new Function('THREE', 'parameters', definition.geometryCode);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          errors.push(`Geometry code syntax error: ${message}`);
        }
        
        return {
          valid: errors.length === 0,
          errors,
          warnings
        };
      },

      setValidationErrors: (errors) => {
        set({ validationErrors: errors });
      },

      exportDefinition: (id) => {
        const definition = get().definitions[id];
        if (!definition) return null;
        return JSON.stringify(definition, null, 2);
      },

      importDefinition: (jsonString) => {
        try {
          const definition = JSON.parse(jsonString) as CustomElementDefinition;
          
          // Validate imported definition
          const validation = get().validateDefinition(definition);
          if (!validation.valid) {
            throw new Error(`Invalid definition: ${validation.errors.join(', ')}`);
          }
          
          return get().createDefinition(definition);
        } catch (e) {
          console.error('Failed to import definition:', e);
          return null;
        }
      },

      exportAllDefinitions: () => {
        return JSON.stringify(Object.values(get().definitions), null, 2);
      },

      importDefinitions: (jsonString) => {
        try {
          const definitions = JSON.parse(jsonString) as CustomElementDefinition[];
          const imported: string[] = [];
          
          definitions.forEach(definition => {
            const id = get().createDefinition(definition);
            if (id) imported.push(id);
          });
          
          return imported;
        } catch (e) {
          console.error('Failed to import definitions:', e);
          return [];
        }
      },

      getDefinitionsByCategory: (category) => {
        const definitions = Object.values(get().definitions);
        return category ? 
          definitions.filter(def => def.category === category) : 
          definitions;
      },

      searchDefinitions: (query) => {
        const definitions = Object.values(get().definitions);
        const lowercaseQuery = query.toLowerCase();
        
        return definitions.filter(def => 
          def.name.toLowerCase().includes(lowercaseQuery) ||
          def.description?.toLowerCase().includes(lowercaseQuery) ||
          def.tags?.some(tag => tag.toLowerCase().includes(lowercaseQuery))
        );
      }
    }),
    {
      name: 'custom-elements-storage',
      partialize: (state) => ({
        definitions: state.definitions
      })
    }
  )
);
