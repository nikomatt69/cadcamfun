// src/components/plugins/PluginSidebar.tsx
import React, { useState, useEffect } from 'react';
import { X, Maximize2, Minimize2, Settings } from 'react-feather';
import { usePluginRegistry } from '../../hooks/usePluginRegistry';
import PluginHostContainer from './PluginHostContainer'; 

interface PluginSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  width?: number;
}

const PluginSidebar: React.FC<PluginSidebarProps> = ({ 
  isOpen, 
  onClose, 
  width = 320 
}) => {
  const { plugins, registry } = usePluginRegistry();
  const [activePluginId, setActivePluginId] = useState<string | null>(null);
  const [sidebarPlugins, setSidebarPlugins] = useState<any[]>([]);
  const [expanded, setExpanded] = useState(false);
  
  // Filter plugins that contribute to sidebar
  useEffect(() => {
    if (plugins) {
      const filtered = plugins.filter(plugin => 
        plugin.enabled && 
        plugin.manifest.contributes?.sidebar
      );
      
      setSidebarPlugins(filtered);
      
      // Auto-select the first plugin if none is selected
      if (filtered.length > 0 && !activePluginId) {
        setActivePluginId(filtered[0].id);
      }
    }
  }, [plugins, activePluginId]);
  
  if (!isOpen) return null;
  
  const expandedWidth = expanded ? '75vw' : `${width}px`;
  
  return (
    <div 
      className="fixed right-0 top-0 bottom-0 bg-white dark:bg-gray-900 shadow-lg border-l border-gray-200 dark:border-gray-700 flex flex-col z-40 transition-all duration-300"
      style={{ width: expandedWidth }}
    >
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-medium text-gray-800 dark:text-gray-100">Plugins</h2>
        <div className="flex space-x-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title={expanded ? "Minimize" : "Maximize"}
          >
            {expanded ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="flex space-x-1 px-2 pt-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {sidebarPlugins.map(plugin => (
          <button
            key={plugin.id}
            className={`px-3 py-2 rounded-t text-sm font-medium transition-colors ${
              activePluginId === plugin.id 
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' 
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            onClick={() => setActivePluginId(plugin.id)}
          >
            {plugin.manifest.contributes?.sidebar?.title || plugin.manifest.name}
          </button>
        ))}
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activePluginId && (
          <PluginHostContainer
            pluginId={activePluginId}
            entryPoint="sidebar"
          />
        )}
        {sidebarPlugins.length === 0 && (
          <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
            No plugins with sidebar UI are enabled
          </div>
        )}
      </div>
    </div>
  );
};

export default PluginSidebar;