// src/components/cad/UnifiedLibraryBrowser.tsx
import React, { useState } from 'react';
import { Package, Tool, Grid, Plus } from 'react-feather';

import UnifiedToolsBrowser, { ToolLibraryItem } from './UnifiedToolsBrowser';
import UnifiedMaterialsBrowser, { MaterialLibraryItem } from './UnifiedMaterialsBrowser';
import { ComponentLibraryItem } from '@/src/hooks/useUnifiedLibrary';
import UnifiedComponentsBrowser from '../cam/UnifiedComponentBrowser';

type LibraryTab = 'components' | 'tools' | 'materials';

interface UnifiedLibraryBrowserProps {
  onSelectComponent: (component: ComponentLibraryItem) => void;
  onSelectTool: (tool: ToolLibraryItem) => void;
  onSelectMaterial: (material: MaterialLibraryItem) => void;
  defaultTab?: LibraryTab;
}

const UnifiedLibraryBrowser: React.FC<UnifiedLibraryBrowserProps> = ({ 
  onSelectComponent, 
  onSelectTool, 
  onSelectMaterial,
  defaultTab = 'components'
}) => {
  const [activeTab, setActiveTab] = useState<LibraryTab>(defaultTab);
  
  return (
    <div className="h-full flex flex-col">
      <div className="flex border-b border-gray-200 mb-4">
        <button
          className={`flex items-center px-3 py-2 text-sm font-medium ${
            activeTab === 'components' 
              ? 'text-blue-600 border-b-2 border-blue-600' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('components')}
        >
          <Package size={16} className="mr-1" />
          Components
        </button>
        <button
          className={`flex items-center px-3 py-2 text-sm font-medium ${
            activeTab === 'tools' 
              ? 'text-blue-600 border-b-2 border-blue-600' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('tools')}
        >
          <Tool size={16} className="mr-1" />
          Tools
        </button>
        <button
          className={`flex items-center px-3 py-2 text-sm font-medium ${
            activeTab === 'materials' 
              ? 'text-blue-600 border-b-2 border-blue-600' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('materials')}
        >
          <Grid size={16} className="mr-1" />
          Materials
        </button>
      </div>
      
      <div className="flex-1 overflow-hidden">
        {activeTab === 'components' && (
          <UnifiedComponentsBrowser onSelectComponent={onSelectComponent} />
        )}
        
        {activeTab === 'tools' && (
          <UnifiedToolsBrowser onSelectTool={onSelectTool} />
        )}
        
        {activeTab === 'materials' && (
          <UnifiedMaterialsBrowser onSelectMaterial={onSelectMaterial} />
        )}
      </div>
      
      <div className="mt-4 pt-4 border-t border-gray-200">
        <button 
          className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          onClick={() => {
            // Navigate to the appropriate creation page based on active tab
            const path = activeTab === 'components' 
              ? '/components'
              : activeTab === 'tools'
                ? '/tools'
                : '/materials';
                
            window.location.href = path;
          }}
        >
          <Plus size={16} className="mr-1" />
          Create New {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
        </button>
      </div>
    </div>
  );
};

export default UnifiedLibraryBrowser;