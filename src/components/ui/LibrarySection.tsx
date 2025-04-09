// src/components/sidebar/LibrarySection.tsx

import React, { useState } from 'react';
import { 
  Package, Tool, Settings, Grid, BookOpen,
  ChevronDown, ChevronRight, Plus
} from 'react-feather';
import { 
  predefinedComponents, 
  predefinedTools, 
  predefinedMaterials, 
  predefinedMachineConfigs 
} from '@/src/lib/predefinedLibraries';
import { useCADStore } from '@/src/store/cadStore';
import { useElementsStore } from '@/src/store/elementsStore';

interface LibrarySectionProps {
  mode: 'cad' | 'cam';
  onSelectComponent?: (component: any) => void;
  onSelectTool?: (tool: any) => void;
  onSelectMaterial?: (material: any) => void;
  onSelectMachineConfig?: (config: any) => void;
}

const LibrarySection: React.FC<LibrarySectionProps> = ({ 
  mode, 
  onSelectComponent,
  onSelectTool,
  onSelectMaterial,
  onSelectMachineConfig
}) => {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    components: true,
    tools: false,
    materials: false,
    machines: false
  });
  
  const { addElement } = useElementsStore();
  const { setActiveTool } = useCADStore();
  
  // Toggle section expansion
  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };
  
  // Gestione selezione componente
  const handleComponentSelect = (component: any) => {
    // Notifica il componente parent della selezione
    if (onSelectComponent) {
      onSelectComponent(component);
    }
    
    // Nel CAD, aggiungiamo direttamente l'elemento
    if (mode === 'cad') {
      const newElement = {
        type: 'component',
        ...component.data,
        name: component.name
      };
      
      addElement(newElement);
    }
  };
  
  // Gestione selezione utensile
  const handleToolSelect = (tool: any) => {
    // Notifica il componente parent della selezione
    if (onSelectTool) {
      onSelectTool(tool);
    }
    
    // Nel CAD, imposta l'utensile come strumento attivo
    if (mode === 'cad') {
      setActiveTool(tool.type);
    }
  };
  
  // Gestione selezione materiale
  const handleMaterialSelect = (material: any) => {
    if (onSelectMaterial) {
      onSelectMaterial(material);
    }
  };
  
  // Gestione selezione configurazione macchina
  const handleMachineConfigSelect = (config: any) => {
    if (onSelectMachineConfig) {
      onSelectMachineConfig(config);
    }
  };
  
  return (
    <div className="library-section space-y-4">
      <h3 className="text-lg font-medium text-gray-900 mb-2">Libreria</h3>
      
      {/* Components Section */}
      <div className="border rounded-md overflow-hidden">
        <div 
          className="flex items-center justify-between px-3 py-2 bg-gray-50 cursor-pointer"
          onClick={() => toggleSection('components')}
        >
          <div className="flex items-center">
            <Package size={16} className="mr-2 text-blue-600" />
            <span className="font-medium">Componenti</span>
          </div>
          {expandedSections.components ? 
            <ChevronDown size={16} /> : 
            <ChevronRight size={16} />}
        </div>
        
        {expandedSections.components && (
          <div className="p-2 max-h-60 overflow-y-auto space-y-1">
            {predefinedComponents.map((component, index) => (
              <div 
                key={index}
                className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-blue-50 cursor-pointer"
                onClick={() => handleComponentSelect(component)}
              >
                <div className="flex items-center">
                  <span className="text-sm">{component.name}</span>
                </div>
                <Plus size={14} className="text-blue-600" />
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Tools Section */}
      <div className="border rounded-md overflow-hidden">
        <div 
          className="flex items-center justify-between px-3 py-2 bg-gray-50 cursor-pointer"
          onClick={() => toggleSection('tools')}
        >
          <div className="flex items-center">
            <Tool size={16} className="mr-2 text-green-600" />
            <span className="font-medium">Utensili</span>
          </div>
          {expandedSections.tools ? 
            <ChevronDown size={16} /> : 
            <ChevronRight size={16} />}
        </div>
        
        {expandedSections.tools && (
          <div className="p-2 max-h-60 overflow-y-auto space-y-1">
            {predefinedTools.map((tool, index) => (
              <div 
                key={index}
                className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-green-50 cursor-pointer"
                onClick={() => handleToolSelect(tool)}
              >
                <div className="flex items-center">
                  <span className="text-sm">{tool.name}</span>
                </div>
                <Plus size={14} className="text-green-600" />
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Only show materials in CAM mode */}
      {mode === 'cam' && (
        <div className="border rounded-md overflow-hidden">
          <div 
            className="flex items-center justify-between px-3 py-2 bg-gray-50 cursor-pointer"
            onClick={() => toggleSection('materials')}
          >
            <div className="flex items-center">
              <Grid size={16} className="mr-2 text-amber-600" />
              <span className="font-medium">Materiali</span>
            </div>
            {expandedSections.materials ? 
              <ChevronDown size={16} /> : 
              <ChevronRight size={16} />}
          </div>
          
          {expandedSections.materials && (
            <div className="p-2 max-h-60 overflow-y-auto space-y-1">
              {predefinedMaterials.map((material, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-amber-50 cursor-pointer"
                  onClick={() => handleMaterialSelect(material)}
                >
                  <div className="flex items-center">
                    <div 
                      className="w-3 h-3 rounded-full mr-2"
                      style={{ backgroundColor: material?.properties?.toString() || '#cccccc' }}
                    ></div>
                    <span className="text-sm">{material.name}</span>
                  </div>
                  <Plus size={14} className="text-amber-600" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Only show machine configs in CAM mode */}
      {mode === 'cam' && (
        <div className="border rounded-md overflow-hidden">
          <div 
            className="flex items-center justify-between px-3 py-2 bg-gray-50 cursor-pointer"
            onClick={() => toggleSection('machines')}
          >
            <div className="flex items-center">
              <Settings size={16} className="mr-2 text-purple-600" />
              <span className="font-medium">Configurazioni</span>
            </div>
            {expandedSections.machines ? 
              <ChevronDown size={16} /> : 
              <ChevronRight size={16} />}
          </div>
          
          {expandedSections.machines && (
            <div className="p-2 max-h-60 overflow-y-auto space-y-1">
              {predefinedMachineConfigs.map((config, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-purple-50 cursor-pointer"
                  onClick={() => handleMachineConfigSelect(config)}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{config.name}</span>
                    <span className="text-xs text-gray-500">{config.type}</span>
                  </div>
                  <Plus size={14} className="text-purple-600" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      <div className="pt-2 text-xs text-center text-blue-600">
        <a href="/components" className="hover:underline block">Gestisci Librerie</a>
      </div>
    </div>
  );
};

export default LibrarySection;