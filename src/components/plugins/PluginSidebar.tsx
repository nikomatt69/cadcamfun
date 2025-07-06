// src/components/plugins/PluginSidebar.tsx
import React, { useState, useEffect } from "react";
import { X, Maximize2, Minimize2, Settings, ChevronUp, ChevronDown } from "react-feather";
// import { usePluginRegistry } from '../../hooks/usePluginRegistry'; // Remove
import { usePluginClient } from "@/src/contexts/PluginClientContext"; // Import client context hook
import { PluginRegistryEntry } from "src/plugins/core/registry"; // Import type
import PluginHostContainer from "./PluginHostContainer";
import { motion, AnimatePresence } from "framer-motion"; // Import motion and AnimatePresence
import { PuzzleIcon } from "lucide-react";

interface PluginSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  width?: number;
}

const PluginSidebar: React.FC<PluginSidebarProps> = ({ isOpen, onClose, width = 280 }) => {
  // const { plugins, registry } = usePluginRegistry(); // Remove
  const { plugins } = usePluginClient(); // Use client context hook
  const [activePluginId, setActivePluginId] = useState<string | null>(null);
  const [sidebarPlugins, setSidebarPlugins] = useState<PluginRegistryEntry[]>([]); // Use correct type
  const [expandedWidth, setExpandedWidth] = useState(false); // Stato per larghezza
  const [isContentVisible, setIsContentVisible] = useState(false); // Stato per visibilità contenuto (come FloatingToolbar) - Changed default to false

  // Filter plugins that contribute to sidebar
  useEffect(() => {
    // Filter directly from context plugins
    const filtered = plugins.filter(
      plugin =>
        plugin.enabled && // Check if enabled via context state
        plugin.manifest.contributes?.sidebar
    );

    setSidebarPlugins(filtered);

    // Auto-select the first plugin if none is selected or selected is no longer valid
    const currentSelectionValid = filtered.some(p => p.id === activePluginId);
    if (filtered.length > 0 && (!activePluginId || !currentSelectionValid)) {
      setActivePluginId(filtered[0].id);
    } else if (filtered.length === 0) {
      setActivePluginId(null); // Clear selection if no sidebar plugins are enabled
    }
  }, [plugins, activePluginId]); // Depend on context plugins list

  if (!isOpen) return null;

  const currentWidth = expandedWidth ? "75vw" : `${width}px`;

  // Varianti SOLO per FADE/SLIDE del contenuto
  const contentVariants = {
    hidden: { opacity: 0, y: -10, transition: { duration: 0.2 } },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
    exit: { opacity: 0, y: -10, transition: { duration: 0.2 } } // Aggiunta exit per AnimatePresence
  };

  // Varianti SOLO per SLIDE LATERALE della sidebar
  const sidebarVariants = {
    hidden: { x: "100%" },
    visible: { x: 0 },
    exit: { x: "100%" }
  };

  return (
    <motion.div
      key="plugin-sidebar"
      variants={sidebarVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      // Conditionally apply classes for height and layout
      className={`fixed right-0 top-20 mt-1 z-40 overflow-hidden rounded-l-xl bg-white dark:bg-gray-900 shadow-lg border-l border-gray-200 dark:border-gray-700 ${
        isContentVisible ? "flex flex-col bottom-0" : "" // Add flex layout and bottom constraint only when content is visible
      }`}
      style={{ width: currentWidth }}
    >
      {/* Header (sempre visibile) */}
      <div className="h-10 flex-shrink-0 flex items-center justify-between px-2 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-medium text-gray-800 dark:text-gray-100">
          <PuzzleIcon />
        </h2>
        <div className="flex space-x-1">
          {/* Pulsante Mostra/Nascondi Contenuto */}
          <button
            onClick={() => setIsContentVisible(!isContentVisible)}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title={isContentVisible ? "Collapse Content" : "Expand Content"}
          >
            {isContentVisible ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
          {/* Pulsante Larghezza */}
          <button
            onClick={() => setExpandedWidth(!expandedWidth)}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title={expandedWidth ? "Minimize Width" : "Maximize Width"}
          >
            {expandedWidth ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
          {/* Pulsante Chiudi */}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Wrapper Contenuto (flex-1 per occupare spazio disponibile) */}
      {isContentVisible && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {" "}
          {/* Use flex-col here */}
          {/* Tabs */}
          <div className="flex-shrink-0 flex space-x-1 px-2 pt-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
            {sidebarPlugins.map(plugin => (
              <button
                key={plugin.id}
                className={`px-3 py-2 rounded-t text-sm font-medium transition-colors ${
                  activePluginId === plugin.id
                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                    : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
                onClick={() => setActivePluginId(plugin.id)}
              >
                {plugin.manifest.contributes?.sidebar?.title || plugin.manifest.name}
              </button>
            ))}
          </div>
          {/* Content Host (flex-1 to fill remaining space, overflow-auto for scroll) */}
          <div className="flex-1 p-4 overflow-auto">
            {activePluginId && <PluginHostContainer pluginId={activePluginId} entryPoint="sidebar" />}
            {sidebarPlugins.length === 0 && (
              <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
                No plugins with sidebar UI are enabled
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default PluginSidebar;
