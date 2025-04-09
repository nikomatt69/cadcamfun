// src/components/library/LibraryManager.tsx
import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'src/components/ui/Tabs';
import { Tool, Package, Layers, Grid, List } from 'react-feather';
import UnifiedLibrary from './UnifiedLibrary';
import { 
  ComponentLibraryItem, 
  MaterialLibraryItem, 
  ToolLibraryItem,
  LibrarySource
} from '@/src/hooks/useUnifiedLibrary';

interface LibraryManagerProps {
  onSelectComponent?: (component: ComponentLibraryItem) => void;
  onSelectMaterial?: (material: MaterialLibraryItem) => void;
  onSelectTool?: (tool: ToolLibraryItem) => void;
  onSaveComponent?: (component: ComponentLibraryItem) => void;
  onSaveMaterial?: (material: MaterialLibraryItem) => void;
  onSaveTool?: (tool: ToolLibraryItem) => void;
  showCloseButton?: boolean;
  onClose?: () => void;
  defaultTab?: 'components' | 'materials' | 'tools';
  defaultSource?: LibrarySource;
}

export default function LibraryManager({
  onSelectComponent,
  onSelectMaterial,
  onSelectTool,
  onSaveComponent,
  onSaveMaterial,
  onSaveTool,
  showCloseButton = false,
  onClose,
  defaultTab = 'components',
  defaultSource = 'api'
}: LibraryManagerProps) {
  const [activeTab, setActiveTab] = useState<'components' | 'materials' | 'tools'>(defaultTab);
  
  // Handle tab change
  const handleTabChange = (value: string) => {
    setActiveTab(value as 'components' | 'materials' | 'tools');
  };
  
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex justify-between items-center">
        <h2 className="text-xl font-medium text-gray-900">Library Manager</h2>
        
        {showCloseButton && onClose && (
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      
      <Tabs 
        value={activeTab} 
        onValueChange={handleTabChange}
        className="flex-1 flex flex-col h-full"
      >
        <div className="px-4 pt-2">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger 
              value="components"
              className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-600 flex items-center justify-center"
            >
              <Package size={16} className="mr-2" />
              Components
            </TabsTrigger>
            <TabsTrigger 
              value="materials"
              className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-600 flex items-center justify-center"
            >
              <Layers size={16} className="mr-2" />
              Materials
            </TabsTrigger>
            <TabsTrigger 
              value="tools"
              className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-600 flex items-center justify-center"
            >
              <Tool size={16} className="mr-2" />
              Tools
            </TabsTrigger>
          </TabsList>
        </div>
        
        <div className="flex-1 overflow-hidden">
          <TabsContent value="components" className="h-full m-0 p-4 data-[state=active]:flex flex-col">
            <UnifiedLibrary<ComponentLibraryItem>
              entityType="components"
              onSelectItem={onSelectComponent}
              onSaveItem={onSaveComponent}
              initialSource={defaultSource}
            />
          </TabsContent>
          
          <TabsContent value="materials" className="h-full m-0 p-4 data-[state=active]:flex flex-col">
            <UnifiedLibrary<MaterialLibraryItem>
              entityType="materials"
              onSelectItem={onSelectMaterial}
              onSaveItem={onSaveMaterial}
              initialSource={defaultSource}
            />
          </TabsContent>
          
          <TabsContent value="tools" className="h-full m-0 p-4 data-[state=active]:flex flex-col">
            <UnifiedLibrary<ToolLibraryItem>
              entityType="tools"
              onSelectItem={onSelectTool}
              onSaveItem={onSaveTool}
              initialSource={defaultSource}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}