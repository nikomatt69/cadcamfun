// src/components/library/MaterialsLibraryView.tsx
import React from 'react';
import UnifiedLibrary from './UnifiedLibrary';
import { 
  MaterialLibraryItem,
  LibrarySource
} from '@/src/hooks/useUnifiedLibrary';
import { useLocalMaterialsLibraryStore } from '@/src/store/localMaterialsLibraryStore';
import toast from 'react-hot-toast';


interface MaterialsLibraryViewProps {
  onSelectMaterial?: (material: MaterialLibraryItem) => void;
  onClose?: () => void;
  showCloseButton?: boolean;
  initialSource?: LibrarySource;
}

export default function MaterialsLibraryView({
  onSelectMaterial,
  onClose,
  showCloseButton = false,
  initialSource = 'api'
}: MaterialsLibraryViewProps) {
  // Get access to local library store
  const materialsStore = useLocalMaterialsLibraryStore();
  
  // Handle saving material to local library
  const handleSaveMaterial = (material: MaterialLibraryItem) => {
    try {
      // Convert to local format
      const localMaterial = {
        name: material.name,
        description: material.description || '',
        color: material.color || '#cccccc',
        density: material.density || 1.0,
        hardness: material.hardness || 50,
        properties: material.properties || {},
        tags: material.tags || []
      };
      // Salvare nella libreria locale
      materialsStore.addMaterial({
        ...localMaterial,
        properties: {
          ...localMaterial.properties,
          density: localMaterial.density,
          hardness: localMaterial.hardness,
          color: localMaterial.color
        }
      });
      
      toast(`"${material.name}" è stato salvato nella tua libreria locale.`);
    } catch (error) {
      console.error('Failed to save material to local library:', error);
      toast('Could not save material to local library. Please try again.');
      toast('Could not save material to local library. Please try again.');
    }
  };
  
  return (
    <UnifiedLibrary<MaterialLibraryItem>
      entityType="materials"
      onSelectItem={onSelectMaterial}
      onSaveItem={handleSaveMaterial}
      onClose={onClose}
      showCloseButton={showCloseButton}
      initialSource={initialSource}
    />
  );
}