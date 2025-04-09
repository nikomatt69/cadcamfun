// src/components/library/ComponentsLibraryView.tsx
import React from 'react';
import UnifiedLibrary from './UnifiedLibrary';
import { 
  ComponentLibraryItem,
  LibrarySource
} from '@/src/hooks/useUnifiedLibrary';
import { useLocalComponentsLibraryStore } from '@/src/store/localComponentsLibraryStore';
import toast from 'react-hot-toast';


interface ComponentsLibraryViewProps {
  onSelectComponent?: (component: ComponentLibraryItem) => void;
  onClose?: () => void;
  showCloseButton?: boolean;
  initialSource?: LibrarySource;
}

export default function ComponentsLibraryView({
  onSelectComponent,
  onClose,
  showCloseButton = false,
  initialSource = 'api'
}: ComponentsLibraryViewProps) {
  // Get access to local library store
  const componentsStore = useLocalComponentsLibraryStore();
  
  // Handle saving component to local library
  const handleSaveComponent = (component: ComponentLibraryItem) => {
    try {
      // Convert to local format
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
      
      toast(`"${component.name}" has been saved to your local library.`);
    } catch (error) {
      console.error('Failed to save component to local library:', error);
      toast('Could not save component to local library. Please try again.');
      toast('Could not save component to local library. Please try again.');
    }
  };
  
  return (
    <UnifiedLibrary<ComponentLibraryItem>
      entityType="components"
      onSelectItem={onSelectComponent}
      onSaveItem={handleSaveComponent}
      onClose={onClose}
      showCloseButton={showCloseButton}
      initialSource={initialSource}
    />
  );
}