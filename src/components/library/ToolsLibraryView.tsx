// src/components/library/ToolsLibraryView.tsx
import React from 'react';
import UnifiedLibrary from './UnifiedLibrary';
import { 
  ToolLibraryItem,
  LibrarySource
} from '@/src/hooks/useUnifiedLibrary';
import { useLocalToolsLibraryStore } from '@/src/store/localToolsLibraryStore';
import toast from 'react-hot-toast';


interface ToolsLibraryViewProps {
  onSelectTool?: (tool: ToolLibraryItem) => void;
  onClose?: () => void;
  showCloseButton?: boolean;
  initialSource?: LibrarySource;
}

export default function ToolsLibraryView({
  onSelectTool,
  onClose,
  showCloseButton = false,
  initialSource = 'api'
}: ToolsLibraryViewProps) {
  // Get access to local library store
  const toolsStore = useLocalToolsLibraryStore();
  
  // Handle saving tool to local library
  const handleSaveTool = (tool: ToolLibraryItem) => {
    try {
      // Convert to local format
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
      
      toast.success(`"${tool.name}" è stato salvato nella tua libreria locale.`);
    } catch (error) {
      console.error('Impossibile salvare lo strumento nella libreria locale:', error);
      toast.error('Could not save tool to local library. Please try again.');
    }
  };
  
  return (
    <UnifiedLibrary<ToolLibraryItem>
      entityType="tools"
      onSelectItem={onSelectTool}
      onSaveItem={handleSaveTool}
      onClose={onClose}
      showCloseButton={showCloseButton}
      initialSource={initialSource}
    />
  );
}