// src/components/library/LibraryModal.tsx
import React from 'react';
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import LibraryManager from './LibraryManager';
import { 
  ComponentLibraryItem, 
  MaterialLibraryItem, 
  ToolLibraryItem,
  LibrarySource
} from '@/src/hooks/useUnifiedLibrary';
import { useLocalComponentsLibraryStore } from '@/src/store/localComponentsLibraryStore';
import { useLocalMaterialsLibraryStore } from '@/src/store/localMaterialsLibraryStore';
import { useLocalToolsLibraryStore } from '@/src/store/localToolsLibraryStore';
import toast from 'react-hot-toast';


interface LibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectComponent?: (component: ComponentLibraryItem) => void;
  onSelectMaterial?: (material: MaterialLibraryItem) => void;
  onSelectTool?: (tool: ToolLibraryItem) => void;
  defaultTab?: 'components' | 'materials' | 'tools';
  defaultSource?: LibrarySource;
}

export default function LibraryModal({
  isOpen,
  onClose,
  onSelectComponent,
  onSelectMaterial,
  onSelectTool,
  defaultTab = 'components',
  defaultSource = 'api'
}: LibraryModalProps) {
  // Get access to local library stores
  const componentsStore = useLocalComponentsLibraryStore();
  const materialsStore = useLocalMaterialsLibraryStore();
  const toolsStore = useLocalToolsLibraryStore();
  
  // Handle saving items to local library
  const handleSaveComponent = (component: ComponentLibraryItem) => {
    try {
      // Convert API component to local format
      const localComponent = {
        name: component.name,
        description: component.description || '',
        type: component.type || 'custom',
        data: component.data || {},
        thumbnail: component.thumbnail,
        tags: component.tags || []
      };
      
      // Save to local library
      componentsStore.addComponent(localComponent);
      
      // Show success message
      toast.success(`"${component.name}" has been saved to your local library.`);
    } catch (error) {
      console.error('Failed to save component to local library:', error);
      toast.error('Could not save component to local library. Please try again.');
    }
  };
  
  const handleSaveMaterial = (material: MaterialLibraryItem) => {
    try {
      // Convert API material to local format
      const localMaterial = {
        name: material.name,
        description: material.description || '',
        color: material.color || '#cccccc',
        density: material.density || 1.0,
        hardness: material.hardness || 50,
        properties: {
          ...material.properties,
          density: material.density,
          hardness: material.hardness,
          color: material.color
        },
        tags: material.tags || []
      };
      // Salvataggio nella libreria locale
      materialsStore.addMaterial({
        ...localMaterial,
        properties: {
          ...localMaterial.properties,
          density: localMaterial.properties.density || 0,
          hardness: localMaterial.properties.hardness || 0,
          color: localMaterial.properties.color || '#cccccc'
        }
      });
      
      // Mostra messaggio di successo
      toast.success(`"${material.name}" è stato salvato nella tua libreria locale.`);
    } catch (error) {
      console.error('Failed to save material to local library:', error);
      toast.error('Could not save material to local library. Please try again.');
    }
  };
  
  const handleSaveTool = (tool: ToolLibraryItem) => {
    try {
      // Convert API tool to local format
      const localTool = {
        name: tool.name,
        description: tool.description || '',
        type: tool.type,
        diameter: tool.diameter,
        material: tool.material,
        numberOfFlutes: tool.numberOfFlutes,
        maxRPM: tool.maxRPM,
        coolantType: tool.coolantType,
        cuttingLength: tool.cuttingLength,
        totalLength: tool.totalLength,
        shankDiameter: tool.shankDiameter,
        notes: tool.notes,
        tags: tool.tags || []
      };
      
      // Save to local library
      toolsStore.addTool(localTool);
      
      // Show success message
      toast.success(`"${tool.name}" has been saved to your local library.`);
    } catch (error) {
      console.error('Failed to save tool to local library:', error);
      toast.error('Could not save tool to local library. Please try again.');
    }
  };
  
  // Handle item selection
  const handleSelectComponent = (component: ComponentLibraryItem) => {
    if (onSelectComponent) {
      onSelectComponent(component);
      onClose();
    }
  };
  
  const handleSelectMaterial = (material: MaterialLibraryItem) => {
    if (onSelectMaterial) {
      onSelectMaterial(material);
      onClose();
    }
  };
  
  const handleSelectTool = (tool: ToolLibraryItem) => {
    if (onSelectTool) {
      onSelectTool(tool);
      onClose();
    }
  };
  
  return (
    <Dialog open={isOpen} onChange={(open) => !open && onClose()} onClose={function (value: boolean): void {
          throw new Error('Function not implemented.');
      } }>
      <DialogPanel className="max-w-6xl h-[80vh] flex flex-col p-0">
        <div className="p-6 pb-0">
          <DialogTitle>Library Browser</DialogTitle>
        </div>
        <div className="flex-1 overflow-hidden">
          <LibraryManager
            onSelectComponent={handleSelectComponent}
            onSelectMaterial={handleSelectMaterial}
            onSelectTool={handleSelectTool}
            onSaveComponent={handleSaveComponent}
            onSaveMaterial={handleSaveMaterial}
            onSaveTool={handleSaveTool}
            defaultTab={defaultTab}
            defaultSource={defaultSource}
          />
        </div>
      </DialogPanel>
    </Dialog>
  );
}