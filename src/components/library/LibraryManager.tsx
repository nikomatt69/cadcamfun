// src/components/library/LibraryManager.tsx
import React, { useState, useCallback } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "src/components/ui/Tabs";
import { Tool, Package, Layers, Grid, List, Star } from "react-feather";
import UnifiedLibrary from "./UnifiedLibrary";
import {
  ComponentLibraryItem,
  MaterialLibraryItem,
  ToolLibraryItem,
  LibrarySource
} from "@/src/hooks/useUnifiedLibrary";

interface LibraryManagerProps {
  onSelectComponent?: (component: ComponentLibraryItem) => void;
  onSelectMaterial?: (material: MaterialLibraryItem) => void;
  onSelectTool?: (tool: ToolLibraryItem) => void;
  onSaveComponent?: (component: ComponentLibraryItem) => void;
  onSaveMaterial?: (material: MaterialLibraryItem) => void;
  onSaveTool?: (tool: ToolLibraryItem) => void;
  showCloseButton?: boolean;
  onClose?: () => void;
  defaultTab?: "components" | "materials" | "tools";
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
  defaultTab = "components",
  defaultSource = "api"
}: LibraryManagerProps) {
  const [activeTab, setActiveTab] = useState<"components" | "materials" | "tools">(defaultTab);

  // Handle tab change
  const handleTabChange = (value: string) => {
    setActiveTab(value as "components" | "materials" | "tools");
  };

  // Enhanced handlers that dispatch events to the global system
  const handleComponentSelect = useCallback(
    (component: ComponentLibraryItem) => {
      // First call the original handler if provided
      if (onSelectComponent) {
        onSelectComponent(component);
      }

      // Then dispatch a global event for the CAD system
      const event = new CustomEvent("libraryComponentSelected", {
        detail: component,
        bubbles: true
      });
      document.dispatchEvent(event);
    },
    [onSelectComponent]
  );

  const handleMaterialSelect = useCallback(
    (material: MaterialLibraryItem) => {
      // First call the original handler if provided
      if (onSelectMaterial) {
        onSelectMaterial(material);
      }

      // Then dispatch a global event for the CAM system
      const event = new CustomEvent("libraryMaterialSelected", {
        detail: material,
        bubbles: true
      });
      document.dispatchEvent(event);
    },
    [onSelectMaterial]
  );

  const handleToolSelect = useCallback(
    (tool: ToolLibraryItem) => {
      // First call the original handler if provided
      if (onSelectTool) {
        onSelectTool(tool);
      }

      // Then dispatch a global event for the CAM system
      const event = new CustomEvent("libraryToolSelected", {
        detail: tool,
        bubbles: true
      });
      document.dispatchEvent(event);
    },
    [onSelectTool]
  );

  const tabVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.4,
        ease: "easeOut"
      }
    },
    exit: {
      opacity: 0,
      y: -20,
      transition: {
        duration: 0.3,
        ease: "easeIn"
      }
    }
  };

  const getTabIcon = (tab: string) => {
    switch (tab) {
      case "components":
        return <Package size={16} className="mr-2" />;
      case "materials":
        return <Layers size={16} className="mr-2" />;
      case "tools":
        return <Tool size={16} className="mr-2" />;
      default:
        return <Star size={16} className="mr-2" />;
    }
  };

  const getTabCount = (tab: string) => {
    // TODO: Replace with actual library data counts from hooks/APIs
    // For now returning 0 to indicate no hardcoded placeholders
    const counts = {
      components: 0, // Should come from useComponentsLibrary hook
      materials: 0,  // Should come from useMaterialsLibrary hook  
      tools: 0       // Should come from useToolsLibrary hook
    };
    return counts[tab as keyof typeof counts] || 0;
  };

  const getTabGradient = (tab: string) => {
    switch (tab) {
      case "components":
        return "from-blue-500/20 to-blue-600/20";
      case "materials":
        return "from-purple-500/20 to-purple-600/20";
      case "tools":
        return "from-green-500/20 to-green-600/20";
      default:
        return "from-gray-500/20 to-gray-600/20";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full relative overflow-hidden"
    >
      {/* Holographic Background Patterns */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Floating Circles */}
        <motion.div
          animate={{
            x: [0, 100, 0],
            y: [0, -50, 0],
            rotate: [0, 180, 360]
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute top-10 left-10 w-32 h-32 rounded-full bg-gradient-to-br from-blue-400/10 to-purple-400/10 blur-xl"
        />
        <motion.div
          animate={{
            x: [0, -80, 0],
            y: [0, 100, 0],
            rotate: [360, 180, 0]
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute top-1/2 right-20 w-24 h-24 rounded-full bg-gradient-to-br from-purple-400/10 to-pink-400/10 blur-xl"
        />
        <motion.div
          animate={{
            x: [0, 60, 0],
            y: [0, -80, 0],
            rotate: [0, -180, -360]
          }}
          transition={{
            duration: 30,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute bottom-20 left-1/3 w-40 h-40 rounded-full bg-gradient-to-br from-green-400/10 to-blue-400/10 blur-xl"
        />

        {/* Grid Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:20px_20px]" />

        {/* Holographic Overlays */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/20 via-transparent to-purple-50/20" />
        <div className="absolute inset-0 bg-gradient-to-tl from-purple-50/20 via-transparent to-pink-50/20" />
      </div>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 p-6 border-b border-white/20 dark:border-gray-700/30 backdrop-blur-sm"
      >
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <motion.div
              animate={{
                rotate: [0, 360],
                scale: [1, 1.1, 1],
                boxShadow: [
                  "0 0 20px rgba(59, 130, 246, 0.3)",
                  "0 0 30px rgba(147, 51, 234, 0.4)",
                  "0 0 20px rgba(59, 130, 246, 0.3)"
                ]
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg"
            >
              <Star size={18} className="text-white" />
            </motion.div>
            <div>
              <motion.h2
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="text-2xl font-bold bg-gradient-to-r from-gray-900 via-blue-600 to-purple-600 dark:from-white dark:via-blue-400 dark:to-purple-400 bg-clip-text text-transparent"
              >
                Library Manager
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="text-sm text-gray-600 dark:text-gray-400 font-medium"
              >
                Advanced component library system
              </motion.p>
            </div>
          </div>

          {/* Action Hints */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="hidden md:flex items-center space-x-3 text-xs text-gray-500 dark:text-gray-400"
          >
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span>Real-time sync</span>
            </div>
            <div className="w-px h-4 bg-gray-300 dark:bg-gray-600" />
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 rounded-full bg-blue-400" />
              <span>Cloud enabled</span>
            </div>
          </motion.div>

          {showCloseButton && onClose && (
            <motion.button
              whileHover={{
                scale: 1.05,
                rotate: 90,
                backgroundColor: "rgba(239, 68, 68, 0.1)"
              }}
              whileTap={{ scale: 0.95 }}
              onClick={onClose}
              className="p-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-all duration-200 backdrop-blur-sm border border-transparent hover:border-red-200 dark:hover:border-red-800"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </motion.button>
          )}
        </div>
      </motion.div>

      {/* Enhanced Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="relative z-10 flex-1 overflow-hidden"
      >
        <Tabs value={activeTab} onValueChange={handleTabChange} className="h-full flex flex-col">
          <div className="px-6 pt-4 pb-2 border-b border-white/10 dark:border-gray-700/20 backdrop-blur-sm">
            <TabsList className="grid w-full grid-cols-3 gap-1 p-1 bg-gray-100/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-xl border border-white/20 dark:border-gray-700/30">
              {["components", "materials", "tools"].map((tab) => (
                <motion.div key={tab} className="relative">
                  <TabsTrigger
                    value={tab}
                    className={`
                      relative w-full px-4 py-3 text-sm font-medium rounded-lg
                      transition-all duration-300 backdrop-blur-sm
                      data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700
                      data-[state=active]:shadow-lg data-[state=active]:shadow-black/10
                      data-[state=active]:text-gray-900 dark:data-[state=active]:text-white
                      text-gray-600 dark:text-gray-400
                      hover:text-gray-800 dark:hover:text-gray-200
                      hover:bg-white/50 dark:hover:bg-gray-700/50
                    `}
                  >
                    <div className="flex items-center justify-center space-x-2">
                      {getTabIcon(tab)}
                      <span className="capitalize">{tab}</span>
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200/80 dark:bg-gray-600/80 text-gray-700 dark:text-gray-300"
                      >
                        {getTabCount(tab)}
                      </motion.span>
                    </div>
                  </TabsTrigger>

                  {/* Active tab indicator */}
                  {activeTab === tab && (
                    <motion.div
                      layoutId="activeTab"
                      className={`absolute inset-0 bg-gradient-to-r ${getTabGradient(tab)} rounded-lg -z-10`}
                      transition={{ type: "spring", duration: 0.5 }}
                    />
                  )}
                </motion.div>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial="hidden"
                animate="visible"
                exit="exit"
                variants={tabVariants as Variants}
                className="h-full"
              >
                <TabsContent value="components" className="h-full m-0 data-[state=inactive]:hidden">
                  <UnifiedLibrary<ComponentLibraryItem>
                    entityType="components"
                    onSelectItem={handleComponentSelect}
                    onSaveItem={onSaveComponent}
                    initialSource={defaultSource}
                  />
                </TabsContent>

                <TabsContent value="materials" className="h-full m-0 data-[state=inactive]:hidden">
                  <UnifiedLibrary<MaterialLibraryItem>
                    entityType="materials"
                    onSelectItem={handleMaterialSelect}
                    onSaveItem={onSaveMaterial}
                    initialSource={defaultSource}
                  />
                </TabsContent>

                <TabsContent value="tools" className="h-full m-0 data-[state=inactive]:hidden">
                  <UnifiedLibrary<ToolLibraryItem>
                    entityType="tools"
                    onSelectItem={handleToolSelect}
                    onSaveItem={onSaveTool}
                    initialSource={defaultSource}
                  />
                </TabsContent>
              </motion.div>
            </AnimatePresence>
          </div>
        </Tabs>
      </motion.div>
    </motion.div>
  );
}

