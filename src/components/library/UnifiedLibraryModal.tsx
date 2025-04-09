// src/components/library/UnifiedLibraryModal.tsx
import React from 'react';
import { X } from 'react-feather';
import LibraryManager from '@/src/components/library/LibraryManager';
import { 
  ComponentLibraryItem, 
  MaterialLibraryItem, 
  ToolLibraryItem 
} from '@/src/hooks/useUnifiedLibrary';

interface UnifiedLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectComponent?: (component: ComponentLibraryItem) => void;
  onSelectMaterial?: (material: MaterialLibraryItem) => void;
  onSelectTool?: (tool: ToolLibraryItem) => void;
  defaultTab?: 'components' | 'materials' | 'tools';
}

const UnifiedLibraryModal: React.FC<UnifiedLibraryModalProps> = ({
  isOpen,
  onClose,
  onSelectComponent,
  onSelectMaterial,
  onSelectTool,
  defaultTab = 'components'
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4">
      <div className="w-full max-w-6xl h-[80vh] flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-xl">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold">Unified Library</h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <LibraryManager
            onSelectComponent={onSelectComponent}
            onSelectMaterial={onSelectMaterial}
            onSelectTool={onSelectTool}
            defaultTab={defaultTab}
            showCloseButton={false}
          />
        </div>
      </div>
    </div>
  );
};

export default UnifiedLibraryModal;