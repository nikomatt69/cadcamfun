// src/components/library/LocalComponentLibrary.tsx
import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { useLocalLibraries, ComponentItem } from "@/src/hooks/useLocalLibraries";
import { Search, Tool, Trash2, ChevronDown, ChevronUp, Save, Package, Disc, Box, Layers, Star, X } from "react-feather";
import AddLibraryItem from "./AddLibraryItem";

interface LocalComponentLibraryProps {
  onSelectComponent?: (component: ComponentItem) => void;
  onSaveComponent?: (component: ComponentItem) => void;
}

const LocalComponentLibrary: React.FC<LocalComponentLibraryProps> = ({ onSelectComponent, onSaveComponent }) => {
  const {
    items: components,
    isLoading,
    error,
    loadItems,
    deleteItem,
    searchItems
  } = useLocalLibraries<ComponentItem>("components");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  // Function to reload library items
  const refreshLibrary = useCallback(() => {
    console.log("Refreshing component library");
    loadItems();
  }, [loadItems]);

  // Load components when component mounts and listen for updates
  useEffect(() => {
    loadItems();

    // Auto-expand categories
    const categories = components.reduce((acc: Record<string, boolean>, component) => {
      const type = component.type || "Other";
      acc[type] = true;
      return acc;
    }, {});
    setExpandedCategories(categories);

    // Listen for component library updates
    const handleLibraryUpdate = () => {
      console.log("Component library updated, refreshing...");
      loadItems();
    };

    window.addEventListener("component-library-updated", handleLibraryUpdate);

    // Clean up
    return () => {
      window.removeEventListener("component-library-updated", handleLibraryUpdate);
    };
  }, [loadItems, components]);

  // Filter components based on search query
  const filteredComponents = searchQuery ? searchItems(searchQuery) : components;

  // Group components by type
  const groupedComponents = filteredComponents.reduce((groups: Record<string, ComponentItem[]>, component) => {
    const type = component.type || "Other";
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(component);
    return groups;
  }, {});

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Handle component selection
  const handleSelectComponent = (component: ComponentItem) => {
    if (onSelectComponent) {
      onSelectComponent(component);
    }
  };

  // Handle component deletion
  const handleDeleteComponent = (event: React.MouseEvent, componentId: string) => {
    event.stopPropagation();
    if (confirm("Are you sure you want to delete this component?")) {
      deleteItem(componentId);
      // Refresh the list after deletion
      setTimeout(refreshLibrary, 100);
    }
  };

  // Handle save component
  const handleSaveComponent = (event: React.MouseEvent, component: ComponentItem) => {
    event.stopPropagation();
    if (onSaveComponent) {
      onSaveComponent(component);
    }
  };

  // Handle search clear
  const handleSearchClear = () => {
    setSearchQuery("");
  };

  // Get appropriate icon for component type
  const getComponentIcon = (component: ComponentItem) => {
    const type = component.type || "";
    const elementType = component.data?.type || "";

    // Icons based on component type
    if (type === "mechanical") return <Tool size={16} className="text-blue-500" />;
    if (type === "structural") return <Layers size={16} className="text-orange-500" />;
    if (type === "geometric") return <Disc size={16} className="text-green-500" />;

    // Icons based on element type
    if (elementType === "cube") return <Box size={16} className="text-blue-500" />;
    if (elementType === "sphere") return <Disc size={16} className="text-purple-500" />;
    if (elementType === "cylinder") return <Box size={16} className="text-green-500" />;

    return <Package size={16} className="text-gray-500" />;
  };

  // Format description for display
  const formatDescription = (component: ComponentItem): string => {
    if (component.description) return component.description;

    const { data } = component;
    if (!data) return "";

    let description = `${data.type || "Component"}`;

    // Add dimensions if available
    if (data.width && data.height) {
      description += ` (${data.width}×${data.height}`;
      if (data.depth) description += `×${data.depth}`;
      description += ")";
    } else if (data.radius) {
      description += ` (R=${data.radius})`;
    }

    return description;
  };

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20, scale: 0.95 },
    visible: {
      opacity: 1,
      x: 0,
      scale: 1,
      transition: {
        duration: 0.3,
        ease: "easeOut"
      }
    }
  };

  const categoryVariants = {
    collapsed: { height: 0, opacity: 0 },
    expanded: {
      height: "auto",
      opacity: 1,
      transition: {
        height: { duration: 0.3, ease: "easeOut" },
        opacity: { duration: 0.2, delay: 0.1 }
      }
    }
  };

  // Render library content based on loading state and data
  const renderLibraryContent = () => {
    if (isLoading && components.length === 0) {
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-6 space-y-4"
        >
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-3">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="relative overflow-hidden rounded-xl"
              >
                <div className="h-8 bg-gradient-to-r from-gray-200/50 via-white/50 to-gray-100/50 dark:from-gray-800/50 dark:via-gray-700/50 dark:to-gray-600/50 backdrop-blur-sm border border-white/20 dark:border-gray-700/30 rounded-xl animate-pulse" />

                {/* Shimmer Effect */}
                <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              </motion.div>

              <div className="ml-4 space-y-2">
                {[...Array(2)].map((_, j) => (
                  <motion.div
                    key={j}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 + j * 0.05 }}
                    className="relative overflow-hidden rounded-lg"
                  >
                    <div className="h-16 bg-gradient-to-r from-gray-100/50 via-white/50 to-gray-50/50 dark:from-gray-700/50 dark:via-gray-600/50 dark:to-gray-500/50 backdrop-blur-sm border border-white/20 dark:border-gray-700/30 rounded-lg animate-pulse" />

                    {/* Shimmer Effect */}
                    <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </motion.div>
      );
    }

    if (error) {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-6 text-center"
        >
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-100 to-red-200 dark:from-red-900/30 dark:to-red-800/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h4 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">Error loading components</h4>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">{error}</p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={refreshLibrary}
              className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-blue-700 transition-all duration-200"
            >
              Try Again
            </motion.button>
          </div>
        </motion.div>
      );
    }

    if (filteredComponents.length === 0) {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-6 text-center"
        >
          <div className="max-w-md mx-auto">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center mx-auto mb-4">
              <Package size={24} className="text-gray-400" />
            </div>
            <h4 className="text-lg font-semibold text-gray-600 dark:text-gray-400 mb-2">
              {searchQuery ? "No matching components" : "No components yet"}
            </h4>
            <p className="text-gray-500 dark:text-gray-500 text-sm mb-4">
              {searchQuery
                ? `No components match "${searchQuery}"`
                : "Start by adding components to your local library"
              }
            </p>
            {searchQuery && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleSearchClear}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-all duration-200"
              >
                Clear Search
              </motion.button>
            )}
          </div>
        </motion.div>
      );
    }

    return (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="p-6 space-y-4"
      >
        {Object.entries(groupedComponents).map(([category, categoryComponents]) => (
          <motion.div
            key={category}
            variants={itemVariants as Variants}
            className="relative overflow-hidden rounded-xl"
          >
            {/* Category Header */}
            <div className="relative">
              {/* Holographic Background */}
              <div className="absolute inset-0 bg-gradient-to-r from-white/80 via-white/90 to-gray-50/80 dark:from-gray-800/80 dark:via-gray-700/90 dark:to-gray-900/80 backdrop-blur-xl border border-white/30 dark:border-gray-700/40 rounded-xl">
                {/* Corner Accents */}
                <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-blue-400/30 rounded-tl" />
                <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-purple-400/30 rounded-br" />
              </div>

              <motion.button
                whileHover={{ scale: 1.01, y: -1 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => toggleCategory(category)}
                className="relative z-10 w-full p-4 flex items-center justify-between text-left"
              >
                <div className="flex items-center space-x-3">
                  <motion.div
                    animate={{
                      rotate: expandedCategories[category] ? 0 : -90,
                      scale: expandedCategories[category] ? 1.1 : 1
                    }}
                    transition={{ duration: 0.2 }}
                    className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center backdrop-blur-sm border border-white/20 dark:border-gray-600/20"
                  >
                    {expandedCategories[category] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </motion.div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white text-lg">
                      {category}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {categoryComponents.length} component{categoryComponents.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                <motion.div
                  whileHover={{ scale: 1.1 }}
                  className="flex items-center space-x-2"
                >
                  <span className="px-3 py-1 rounded-full bg-blue-100/80 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-sm font-medium">
                    {categoryComponents.length}
                  </span>
                </motion.div>
              </motion.button>
            </div>

            {/* Category Content */}
            <AnimatePresence>
              {expandedCategories[category] && (
                <motion.div
                  initial="collapsed"
                  animate="expanded"
                  exit="collapsed"
                  variants={categoryVariants as Variants}
                  className="overflow-hidden"
                >
                  <div className="p-4 pt-0 space-y-3">
                    {categoryComponents.map((component, index) => (
                      <motion.div
                        key={component.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        whileHover={{
                          scale: 1.02,
                          x: 4,
                          boxShadow: "0 10px 30px rgba(0,0,0,0.1)"
                        }}
                        whileTap={{ scale: 0.98 }}
                        className="group relative overflow-hidden rounded-xl cursor-pointer"
                        onClick={() => handleSelectComponent(component)}
                      >
                        {/* Holographic Card Background */}
                        <div className="absolute inset-0 bg-gradient-to-r from-white/60 via-white/80 to-gray-50/60 dark:from-gray-700/60 dark:via-gray-600/80 dark:to-gray-800/60 backdrop-blur-xl border border-white/20 dark:border-gray-600/30 rounded-xl">
                          {/* Shimmer Effect */}
                          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                          </div>
                        </div>

                        {/* Card Content */}
                        <div className="relative z-10 p-4 flex items-center space-x-4">
                          <motion.div
                            whileHover={{ scale: 1.1, rotate: 5 }}
                            className="flex-shrink-0 p-3 rounded-lg bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm border border-white/30 dark:border-gray-600/30"
                          >
                            {getComponentIcon(component)}
                          </motion.div>

                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">
                              {component.name}
                            </h4>
                            {formatDescription(component) && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                                {formatDescription(component)}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center space-x-2">
                            {/* Save Button */}
                            {onSaveComponent && (
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={(e) => handleSaveComponent(e, component)}
                                className="p-2 rounded-lg bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20 transition-all duration-200 backdrop-blur-sm border border-green-500/20"
                              >
                                <Save size={14} />
                              </motion.button>
                            )}

                            {/* Delete Button */}
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => handleDeleteComponent(e, component.id)}
                              className="p-2 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-all duration-200 backdrop-blur-sm border border-red-500/20"
                            >
                              <Trash2 size={14} />
                            </motion.button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </motion.div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full relative overflow-hidden"
    >
      {/* Animated Background */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          animate={{
            x: [0, 30, 0],
            y: [0, -20, 0],
            rotate: [0, 5, 0]
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute top-20 right-10 w-32 h-32 rounded-full bg-gradient-to-br from-blue-400/5 to-purple-400/5 blur-2xl"
        />
        <motion.div
          animate={{
            x: [0, -25, 0],
            y: [0, 15, 0],
            rotate: [0, -3, 0]
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute bottom-32 left-16 w-24 h-24 rounded-full bg-gradient-to-br from-purple-400/5 to-pink-400/5 blur-2xl"
        />
      </div>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 p-6 border-b border-white/20 dark:border-gray-700/30 backdrop-blur-sm"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <motion.div
              animate={{
                rotate: [0, 360],
                scale: [1, 1.1, 1]
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg"
            >
              <Package size={16} className="text-white" />
            </motion.div>
            <div>
              <h2 className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                Local Components
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {filteredComponents.length} component{filteredComponents.length !== 1 ? 's' : ''} available
              </p>
            </div>
          </div>
        </div>

        {/* Enhanced Search */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative"
        >
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search components..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-12 py-3 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-white/30 dark:border-gray-700/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 placeholder-gray-400 dark:placeholder-gray-500"
            />
            {searchQuery && (
              <motion.button
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleSearchClear}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 p-1 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-500 transition-all duration-200"
              >
                <X size={14} />
              </motion.button>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Content */}
      <div className="flex-1 overflow-auto relative z-10">
        {renderLibraryContent()}
      </div>

      {/* Add Component */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="relative z-10 p-6 border-t border-white/20 dark:border-gray-700/30 backdrop-blur-sm"
      >
        <AddLibraryItem type="components" onItemAdded={refreshLibrary} />
      </motion.div>
    </motion.div>
  );
};

export default LocalComponentLibrary;
