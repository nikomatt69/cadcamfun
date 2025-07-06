// src/components/sidebar/LibrarySection.tsx

import React, { useState } from "react";
import { Package, Tool, Settings, Grid, BookOpen, ChevronDown, ChevronRight, Plus } from "react-feather";
import {
  predefinedComponents,
  predefinedTools,
  predefinedMaterials,
  predefinedMachineConfigs
} from "@/src/lib/predefinedLibraries";
import { useCADStore } from "@/src/store/cadStore";
import { useElementsStore } from "@/src/store/elementsStore";

interface LibrarySectionProps {
  mode: "cad" | "cam";
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
    if (mode === "cad") {
      const newElement = {
        type: "component",
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
    if (mode === "cad") {
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
      <h3 className="text-lg font-medium text-gray-900 dark:text-blue-400 mb-2">Library</h3>

      {/* Components Section */}
      <div className="border dark:border-gray-700 rounded-md overflow-hidden">
        <div
          className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 cursor-pointer"
          onClick={() => toggleSection("components")}
        >
          <div className="flex items-center">
            <Package size={16} className="mr-2 text-blue-600 dark:text-blue-400" />
            <span className="font-medium dark:text-blue-400">Components</span>
          </div>
          {expandedSections.components ? (
            <ChevronDown size={16} className="dark:text-blue-400" />
          ) : (
            <ChevronRight size={16} className="dark:text-blue-400" />
          )}
        </div>

        {expandedSections.components && (
          <div className="p-2 max-h-60 overflow-y-auto space-y-1 bg-white dark:bg-gray-800">
            {predefinedComponents.map((component, index) => (
              <div
                key={index}
                className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer"
                onClick={() => handleComponentSelect(component)}
              >
                <div className="flex items-center">
                  <span className="text-sm dark:text-blue-400">{component.name}</span>
                </div>
                <Plus size={14} className="text-blue-600 dark:text-blue-400" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tools Section */}
      <div className="border dark:border-gray-700 rounded-md overflow-hidden">
        <div
          className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 cursor-pointer"
          onClick={() => toggleSection("tools")}
        >
          <div className="flex items-center">
            <Tool size={16} className="mr-2 text-green-600 dark:text-green-400" />
            <span className="font-medium dark:text-blue-400">Tools</span>
          </div>
          {expandedSections.tools ? (
            <ChevronDown size={16} className="dark:text-blue-400" />
          ) : (
            <ChevronRight size={16} className="dark:text-blue-400" />
          )}
        </div>

        {expandedSections.tools && (
          <div className="p-2 max-h-60 overflow-y-auto space-y-1 bg-white dark:bg-gray-800">
            {predefinedTools.map((tool, index) => (
              <div
                key={index}
                className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-green-50 dark:hover:bg-green-900/30 cursor-pointer"
                onClick={() => handleToolSelect(tool)}
              >
                <div className="flex items-center">
                  <span className="text-sm dark:text-blue-400">{tool.name}</span>
                </div>
                <Plus size={14} className="text-green-600 dark:text-green-400" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Only show materials in CAM mode */}
      {mode === "cam" && (
        <div className="border dark:border-gray-700 rounded-md overflow-hidden">
          <div
            className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 cursor-pointer"
            onClick={() => toggleSection("materials")}
          >
            <div className="flex items-center">
              <Grid size={16} className="mr-2 text-amber-600 dark:text-amber-400" />
              <span className="font-medium dark:text-blue-400">Materials</span>
            </div>
            {expandedSections.materials ? (
              <ChevronDown size={16} className="dark:text-blue-400" />
            ) : (
              <ChevronRight size={16} className="dark:text-blue-400" />
            )}
          </div>

          {expandedSections.materials && (
            <div className="p-2 max-h-60 overflow-y-auto space-y-1 bg-white dark:bg-gray-800">
              {predefinedMaterials.map((material, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-amber-50 dark:hover:bg-amber-900/30 cursor-pointer"
                  onClick={() => handleMaterialSelect(material)}
                >
                  <div className="flex items-center">
                    <div
                      className="w-3 h-3 rounded-full mr-2 border border-gray-300 dark:border-gray-600"
                      style={{ backgroundColor: material?.properties?.toString() || "#cccccc" }}
                    ></div>
                    <span className="text-sm dark:text-blue-400">{material.name}</span>
                  </div>
                  <Plus size={14} className="text-amber-600 dark:text-amber-400" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Only show machine configs in CAM mode */}
      {mode === "cam" && (
        <div className="border dark:border-gray-700 rounded-md overflow-hidden">
          <div
            className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 cursor-pointer"
            onClick={() => toggleSection("machines")}
          >
            <div className="flex items-center">
              <Settings size={16} className="mr-2 text-purple-600 dark:text-purple-400" />
              <span className="font-medium dark:text-blue-400">Configurations</span>
            </div>
            {expandedSections.machines ? (
              <ChevronDown size={16} className="dark:text-blue-400" />
            ) : (
              <ChevronRight size={16} className="dark:text-blue-400" />
            )}
          </div>

          {expandedSections.machines && (
            <div className="p-2 max-h-60 overflow-y-auto space-y-1 bg-white dark:bg-gray-800">
              {predefinedMachineConfigs.map((config, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-purple-50 dark:hover:bg-purple-900/30 cursor-pointer"
                  onClick={() => handleMachineConfigSelect(config)}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium dark:text-blue-400">{config.name}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{config.type}</span>
                  </div>
                  <Plus size={14} className="text-purple-600 dark:text-purple-400" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="pt-2 text-xs text-center text-blue-600 dark:text-blue-400">
        <a href="/components" className="hover:underline block">
          Manage Libraries
        </a>
      </div>
    </div>
  );
};

export default LibrarySection;
