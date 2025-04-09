import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Material, Tool, Component } from '@prisma/client';

interface LibraryState {
  components: Record<string, Component>;
  materials: Record<string, Material>;
  tools: Record<string, Tool>;
  
  // Actions
  addComponent: (component: Component) => void;
  removeComponent: (id: string) => void;
  updateComponent: (id: string, updates: Partial<Component>) => void;
  
  addMaterial: (material: Material) => void;
  removeMaterial: (id: string) => void;
  updateMaterial: (id: string, updates: Partial<Material>) => void;
  
  addTool: (tool: Tool) => void;
  removeTool: (id: string) => void;
  updateTool: (id: string, updates: Partial<Tool>) => void;
  
  // Bulk operations
  clearAll: () => void;
  importData: (data: Partial<LibraryState>) => void;
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set) => ({
      components: {},
      materials: {},
      tools: {},
      
      addComponent: (component) => 
        set((state) => ({
          components: { ...state.components, [component.id]: component }
        })),
      
      removeComponent: (id) =>
        set((state) => {
          const { [id]: removed, ...rest } = state.components;
          return { components: rest };
        }),
      
      updateComponent: (id, updates) =>
        set((state) => ({
          components: {
            ...state.components,
            [id]: { ...state.components[id], ...updates }
          }
        })),
      
      addMaterial: (material) =>
        set((state) => ({
          materials: { ...state.materials, [material.id]: material }
        })),
      
      removeMaterial: (id) =>
        set((state) => {
          const { [id]: removed, ...rest } = state.materials;
          return { materials: rest };
        }),
      
      updateMaterial: (id, updates) =>
        set((state) => ({
          materials: {
            ...state.materials,
            [id]: { ...state.materials[id], ...updates }
          }
        })),
      
      addTool: (tool) =>
        set((state) => ({
          tools: { ...state.tools, [tool.id]: tool }
        })),
      
      removeTool: (id) =>
        set((state) => {
          const { [id]: removed, ...rest } = state.tools;
          return { tools: rest };
        }),
      
      updateTool: (id, updates) =>
        set((state) => ({
          tools: {
            ...state.tools,
            [id]: { ...state.tools[id], ...updates }
          }
        })),
      
      clearAll: () =>
        set(() => ({
          components: {},
          materials: {},
          tools: {}
        })),
      
      importData: (data) =>
        set((state) => ({
          components: { ...state.components, ...data.components },
          materials: { ...state.materials, ...data.materials },
          tools: { ...state.tools, ...data.tools }
        }))
    }),
    {
      name: 'library-storage',
      partialize: (state) => ({
        components: state.components,
        materials: state.materials,
        tools: state.tools
      })
    }
  )
);
