// src/pages/library/index.tsx
import React, { useState } from 'react';
import { NextPage } from 'next';
import Head from 'next/head';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Layout from '@/src/components/layout/Layout';
import LibraryManager from '@/src/components/library/LibraryManager';
import { Database, Book, HardDrive, Download, Upload } from 'react-feather';
import { 
  ComponentLibraryItem, 
  MaterialLibraryItem, 
  ToolLibraryItem 
} from '@/src/hooks/useUnifiedLibrary';

import { useLocalComponentsLibraryStore } from '@/src/store/localComponentsLibraryStore';
import { useLocalMaterialsLibraryStore } from '@/src/store/localMaterialsLibraryStore';
import { useLocalToolsLibraryStore } from '@/src/store/localToolsLibraryStore';
import {
  exportComponents,
  importComponents,
  exportMaterials,
  importMaterials,
  exportTools,
  importTools
} from '@/src/lib/api/libraries';
import Metatags from '@/src/components/layout/Metatags';
import toast from 'react-hot-toast';

const LibraryPage: NextPage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { tab = 'components' } = router.query;
  
  // State for selected items
  const [selectedComponent, setSelectedComponent] = useState<ComponentLibraryItem | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialLibraryItem | null>(null);
  const [selectedTool, setSelectedTool] = useState<ToolLibraryItem | null>(null);
  
  // Get access to local stores
  const componentsStore = useLocalComponentsLibraryStore();
  const materialsStore = useLocalMaterialsLibraryStore();
  const toolsStore = useLocalToolsLibraryStore();
  
  // Handle item selection
  const handleSelectComponent = (component: ComponentLibraryItem) => {
    setSelectedComponent(component);
    setSelectedMaterial(null);
    setSelectedTool(null);
    
    toast(
      `"${component.name}" has been selected.`
      );
  };
  
  const handleSelectMaterial = (material: MaterialLibraryItem) => {
    setSelectedComponent(null);
    setSelectedMaterial(material);
    setSelectedTool(null);
    
    toast(
     
      `"${material.name}" has been selected.`,
     
    );
  };
  
  const handleSelectTool = (tool: ToolLibraryItem) => {
    setSelectedComponent(null);
    setSelectedMaterial(null);
    setSelectedTool(tool);
    
    toast(
     
       `"${tool.name}" has been selected.`,
    
    );
  };
  // Handle saving items to local library
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
      
      toast(
       
        `"${component.name}" has been saved to your local library.`,
       
      );
    } catch (error) {
      console.error('Failed to save component to local library:', error);
      toast(
       'Could not save component to local library. Please try again.',
  );
    }
  };
  
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
      
      toast(
       
      `"${tool.name}" has been saved to your local library.`,
    
      );
    } catch (error) {
      console.error('Failed to save tool to local library:', error);
      toast(
     
      'Could not save tool to local library. Please try again.',
     
      );
    }
  };
  
  // Export library items
  const handleExport = async (type: 'components' | 'materials' | 'tools') => {
    try {
      let result;
      
      switch (type) {
        case 'components':
          result = await exportComponents();
          break;
        case 'materials':
          result = await exportMaterials();
          break;
        case 'tools':
          result = await exportTools();
          break;
      }
      
      toast(
       
        `Your ${type} have been exported successfully.`,
     
      );
    } catch (error) {
      console.error(`Failed to export ${type}:`, error);
      toast(
        
        `Could not export ${type}. Please try again.`,
    
      );
    }
  };
  
  // Import library items (this would typically involve a file upload)
  const handleImport = async (type: 'components' | 'materials' | 'tools') => {
    // In a real application, this would open a file picker
    // For now, we'll just show a toast
    toast(
     
     'The import feature would allow uploading files to import into the library.',
     
    );
  };
  
  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }
  
  return (
    <>
      <Metatags title="Library Manager" />
      
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Unified Library Manager</h1>
            
            <div className="flex space-x-4">
              <button
                onClick={() => handleExport(tab as 'components' | 'materials' | 'tools')}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                <Download size={16} />
                Export
              </button>
              <button
                onClick={() => handleImport(tab as 'components' | 'materials' | 'tools')}
                className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
              >
                <Upload size={16} />
                Import
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Library sources info */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow p-4 mb-4">
                <h2 className="text-lg font-medium mb-4">Library Sources</h2>
                
                <div className="space-y-3">
                  <div className="flex items-center p-3 bg-blue-50 rounded-md text-blue-600">
                    <Database size={20} className="mr-3" />
                    <div>
                      <div className="font-medium">Main Library</div>
                      <div className="text-sm">Server-stored items</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center p-3 bg-gray-100 rounded-md text-gray-700">
                    <HardDrive size={20} className="mr-3" />
                    <div>
                      <div className="font-medium">Local Library</div>
                      <div className="text-sm">Browser-stored items</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center p-3 bg-gray-100 rounded-md text-gray-700">
                    <Book size={20} className="mr-3" />
                    <div>
                      <div className="font-medium">Standard Library</div>
                      <div className="text-sm">Built-in items</div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Selection details */}
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-lg font-medium mb-4">Selection Details</h2>
                
                {selectedComponent && (
                  <div className="space-y-3">
                    <div className="text-lg font-medium">{selectedComponent.name}</div>
                    {selectedComponent.description && (
                      <div className="text-gray-600">{selectedComponent.description}</div>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="font-medium text-gray-600">Type:</span>{' '}
                        {selectedComponent.type || 'N/A'}
                      </div>
                      {selectedComponent.updatedAt && (
                        <div>
                          <span className="font-medium text-gray-600">Updated:</span>{' '}
                          {new Date(selectedComponent.updatedAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {selectedMaterial && (
                  <div className="space-y-3">
                    <div className="flex items-center">
                      <div 
                        className="w-6 h-6 rounded-md mr-2"
                        style={{ backgroundColor: selectedMaterial.color || '#ccc' }}
                      />
                      <div className="text-lg font-medium">{selectedMaterial.name}</div>
                    </div>
                    {selectedMaterial.description && (
                      <div className="text-gray-600">{selectedMaterial.description}</div>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="font-medium text-gray-600">Density:</span>{' '}
                        {selectedMaterial.density || 'N/A'} g/cm³
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Hardness:</span>{' '}
                        {selectedMaterial.hardness || 'N/A'} HRC
                      </div>
                    </div>
                  </div>
                )}
                
                {selectedTool && (
                  <div className="space-y-3">
                    <div className="text-lg font-medium">{selectedTool.name}</div>
                    {selectedTool.description && (
                      <div className="text-gray-600">{selectedTool.description}</div>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="font-medium text-gray-600">Type:</span>{' '}
                        {selectedTool.type || 'N/A'}
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Diameter:</span>{' '}
                        {selectedTool.diameter || 'N/A'} mm
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Material:</span>{' '}
                        {selectedTool.material || 'N/A'}
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Flutes:</span>{' '}
                        {selectedTool.numberOfFlutes || 'N/A'}
                      </div>
                    </div>
                  </div>
                )}
                
                {!selectedComponent && !selectedMaterial && !selectedTool && (
                  <div className="text-gray-500 text-center py-4">
                    Select an item to see details
                  </div>
                )}
              </div>
            </div>
            
            {/* Library Manager */}
            <div className="lg:col-span-3">
              <div className="bg-white rounded-lg shadow overflow-hidden h-[calc(100vh-240px)]">
                <LibraryManager
                  onSelectComponent={handleSelectComponent}
                  onSelectMaterial={handleSelectMaterial}
                  onSelectTool={handleSelectTool}
                  onSaveComponent={handleSaveComponent}
                  onSaveMaterial={handleSaveMaterial}
                  onSaveTool={handleSaveTool}
                  defaultTab={tab as 'components' | 'materials' | 'tools'}
                />
              </div>
            </div>
          </div>
        </div>
      </Layout>
    </>
  );
};

export default LibraryPage;