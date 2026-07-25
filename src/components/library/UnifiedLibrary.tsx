// src/components/library/UnifiedLibrary.tsx
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Grid,
  List,
  Database,
  HardDrive,
  Book,
  Plus,
  Tool,
  Layers,
  Package,
  Filter,
  RefreshCw,
  ChevronDown,
  Zap,
  Star,
} from "react-feather";
import {
  useUnifiedLibrary,
  LibraryItem,
  ComponentLibraryItem,
  MaterialLibraryItem,
  ToolLibraryItem,
  LibrarySource,
  LibraryEntityType,
  LibraryFilter,
} from "@/src/hooks/useUnifiedLibrary";

// Define tabs for the library sources with enhanced icons
const LIBRARY_SOURCES: Array<{
  id: LibrarySource;
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}> = [
  {
    id: "api",
    label: "Main Library",
    icon: <Database size={16} />,
    color: "text-blue-600",
    bgColor: "bg-blue-50 dark:bg-blue-900/20",
  },
  {
    id: "local",
    label: "Local Library",
    icon: <HardDrive size={16} />,
    color: "text-purple-600",
    bgColor: "bg-purple-50 dark:bg-purple-900/20",
  },
  {
    id: "predefined",
    label: "Standard Library",
    icon: <Book size={16} />,
    color: "text-green-600",
    bgColor: "bg-green-50 dark:bg-green-900/20",
  },
];

interface UnifiedLibraryProps<T extends LibraryItem> {
  entityType: LibraryEntityType;
  onSelectItem?: (item: T) => void;
  onSaveItem?: (item: T) => void;
  showCloseButton?: boolean;
  onClose?: () => void;
  initialSource?: LibrarySource;
}

export default function UnifiedLibrary<T extends LibraryItem>({
  entityType,
  onSelectItem,
  onSaveItem,
  showCloseButton = false,
  onClose,
  initialSource = "api",
}: UnifiedLibraryProps<T>) {
  // State for UI
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<LibraryFilter>({});

  // Get library data from the hook
  const {
    items,
    isLoading,
    error,
    activeSource,
    setActiveSource,
    refreshLibrary,
    sourceStats,
  } = useUnifiedLibrary<T>(entityType, initialSource);

  // Apply search filter
  const filteredItems = searchQuery
    ? items.filter(
        (item) =>
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (item.name &&
            item.name.toLowerCase().includes(searchQuery.toLowerCase())),
      )
    : items;

  // Handle item selection
  const handleSelectItem = (item: T) => {
    if (onSelectItem) {
      onSelectItem(item);
    }
  };

  // Handle item saving to local library
  const handleSaveItem = (item: T) => {
    if (onSaveItem) {
      onSaveItem(item);
    }
  };

  // Handle search input
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  // Handle filter change
  const handleFilterChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  // Get icon for item based on entity type
  const getItemIcon = (item: T) => {
    if (entityType === "components") {
      const component = item as unknown as ComponentLibraryItem;
      const itemType = component.type || "";

      if (itemType === "mechanical")
        return <Tool size={20} className="text-blue-500" />;
      if (itemType === "electronic")
        return <Zap size={20} className="text-yellow-500" />;
      if (itemType === "fixture")
        return <Grid size={20} className="text-purple-500" />;

      return <Package size={20} className="text-gray-500" />;
    }

    if (entityType === "materials") {
      const material = item as unknown as MaterialLibraryItem;
      return (
        <motion.div
          whileHover={{ scale: 1.1, rotate: 5 }}
          className="w-5 h-5 rounded-md border-2 border-white shadow-md"
          style={{ backgroundColor: material.color || "#ccc" }}
        />
      );
    }

    if (entityType === "tools") {
      const tool = item as unknown as ToolLibraryItem;
      const toolType = tool.type || "";

      if (toolType === "endmill")
        return <Tool size={20} className="text-blue-500" />;
      if (toolType === "drillbit")
        return <Tool size={20} className="text-green-500" />;
      if (toolType === "facemill")
        return <Tool size={20} className="text-orange-500" />;

      return <Tool size={20} className="text-gray-500" />;
    }

    return <Package size={20} className="text-gray-500" />;
  };

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.3,
      },
    },
  };

  // Render library header
  const renderHeader = () => (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative border-b border-gray-200/50 dark:border-gray-700/50 p-6 backdrop-blur-sm"
    >
      {/* Background decoration */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-50/50 via-purple-50/50 to-pink-50/50 dark:from-blue-900/20 dark:via-purple-900/20 dark:to-pink-900/20" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <motion.div
              animate={{
                rotate: [0, 360],
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                repeatType: "reverse",
              }}
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg"
            >
              <Star size={20} className="text-white" />
            </motion.div>
            <div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                {entityType === "components"
                  ? "Components Library"
                  : entityType === "materials"
                    ? "Materials Library"
                    : "Tools Library"}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Browse and manage your {entityType}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="px-3 py-1 rounded-full bg-green-100/80 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs font-medium">
                {filteredItems.length} items
              </span>
            </div>
          </div>

          {showCloseButton && onClose && (
            <motion.button
              whileHover={{ scale: 1.05, rotate: 90 }}
              whileTap={{ scale: 0.95 }}
              onClick={onClose}
              className="p-3 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </motion.button>
          )}
        </div>

        <div className="flex flex-col space-y-4">
          {/* Search bar */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="relative"
          >
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search size={18} className="text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-12 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 placeholder-gray-400"
              placeholder={`Search ${entityType}...`}
              value={searchQuery}
              onChange={handleSearchChange}
            />
            {searchQuery && (
              <motion.button
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </motion.button>
            )}
          </motion.div>

          {/* Library source tabs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex border border-gray-300 dark:border-gray-600 rounded-xl overflow-hidden bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-lg"
          >
            {LIBRARY_SOURCES.map((source, index) => (
              <motion.button
                key={source.id}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                className={`flex-1 py-3 px-4 text-sm flex items-center justify-center space-x-2 transition-all duration-200 relative overflow-hidden group
                  ${
                    activeSource === source.id
                      ? `${source.bgColor} ${source.color} font-semibold`
                      : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                onClick={() => setActiveSource(source.id)}
              >
                {/* Animated background */}
                {activeSource === source.id && (
                  <motion.div
                    layoutId="activeSourceBackground"
                    className="absolute inset-0 bg-gradient-to-r from-blue-400/10 via-purple-400/10 to-pink-400/10"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}

                <div className="relative z-10 flex items-center space-x-2">
                  {source.icon}
                  <span>{source.label}</span>
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="text-xs bg-white/80 dark:bg-gray-700/80 backdrop-blur-sm px-2 py-1 rounded-full font-medium shadow-sm"
                  >
                    {sourceStats[source.id] || 0}
                  </motion.span>
                </div>
              </motion.button>
            ))}
          </motion.div>

          {/* View controls and actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex justify-between items-center"
          >
            <div className="flex items-center space-x-3">
              <div className="flex border border-gray-300 dark:border-gray-600 rounded-xl overflow-hidden bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`p-3 transition-all duration-200 ${
                    viewMode === "grid"
                      ? "bg-blue-500 text-white shadow-lg"
                      : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                  onClick={() => setViewMode("grid")}
                  title="Grid View"
                >
                  <Grid size={18} />
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`p-3 transition-all duration-200 ${
                    viewMode === "list"
                      ? "bg-blue-500 text-white shadow-lg"
                      : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                  onClick={() => setViewMode("list")}
                  title="List View"
                >
                  <List size={18} />
                </motion.button>
              </div>

              <motion.button
                whileHover={{ scale: 1.05, rotate: 180 }}
                whileTap={{ scale: 0.95 }}
                onClick={refreshLibrary}
                disabled={isLoading}
                className="p-3 text-gray-500 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm border border-gray-300 dark:border-gray-600 bg-white/80 dark:bg-gray-800/80"
                title="Refresh Library"
              >
                <RefreshCw
                  size={18}
                  className={isLoading ? "animate-spin" : ""}
                />
              </motion.button>
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-2 px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-200 backdrop-blur-sm border border-gray-300 dark:border-gray-600 bg-white/80 dark:bg-gray-800/80"
            >
              <Filter size={16} />
              <span className="text-sm font-medium">Filters</span>
              <motion.div
                animate={{ rotate: showFilters ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown size={16} />
              </motion.div>
            </motion.button>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );

  // Render content based on current state
  const renderContent = () => {
    if (isLoading) {
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-16 space-y-4"
        >
          <motion.div
            animate={{
              rotate: 360,
              scale: [1, 1.2, 1],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center"
          >
            <Star size={24} className="text-white" />
          </motion.div>
          <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">
            Loading {entityType}...
          </p>
          <div className="flex space-x-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.3, 1, 0.3],
                }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
                className="w-2 h-2 bg-blue-500 rounded-full"
              />
            ))}
          </div>
        </motion.div>
      );
    }

    if (error) {
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-16 space-y-4"
        >
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="text-center">
            <h3 className="text-lg font-medium text-red-600 dark:text-red-400 mb-2">
              Error loading {entityType}
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">{error}</p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={refreshLibrary}
              className="px-6 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors duration-200 font-medium"
            >
              Try Again
            </motion.button>
          </div>
        </motion.div>
      );
    }

    if (filteredItems.length === 0) {
      return (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-16 space-y-6"
        >
          <motion.div
            animate={{
              y: [0, -10, 0],
              rotate: [0, 5, -5, 0],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="w-20 h-20 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center"
          >
            <Package size={32} className="text-gray-400" />
          </motion.div>
          <div className="text-center space-y-2">
            <h3 className="text-xl font-semibold text-gray-600 dark:text-gray-400">
              No {entityType} found
            </h3>
            <p className="text-gray-500 dark:text-gray-500">
              {searchQuery
                ? `No ${entityType} match your search "${searchQuery}"`
                : `No ${entityType} available in this library`}
            </p>
          </div>
          {searchQuery && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSearchQuery("")}
              className="px-6 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors duration-200 font-medium"
            >
              Clear Search
            </motion.button>
          )}
        </motion.div>
      );
    }

    return (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="p-6"
      >
        {viewMode === "grid" ? renderGridView() : renderListView()}
      </motion.div>
    );
  };

  // Render grid view
  const renderGridView = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {filteredItems.map((item, index) => (
        <motion.div
          key={`${item.id}-${index}`}
          variants={itemVariants}
          whileHover={{
            y: -8,
            scale: 1.02,
            transition: { duration: 0.2 },
          }}
          className="group relative"
        >
          {/* Holographic Card */}
          <div className="relative overflow-hidden rounded-2xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border border-white/20 dark:border-gray-700/30 shadow-lg hover:shadow-2xl transition-all duration-300">
            {/* Shimmer Effect */}
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute -inset-10 opacity-0 group-hover:opacity-30 transition-opacity duration-500">
                <div className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-45deg]" />
              </div>
            </div>

            {/* Card Content */}
            <div className="relative z-10 p-6">
              {/* Item Icon/Preview */}
              <div className="w-full h-32 mb-4 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center">
                {getItemIcon(item)}
              </div>

              {/* Item Info */}
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-900 dark:text-white text-lg truncate">
                  {item.name}
                </h3>

                {item.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                    {item.description}
                  </p>
                )}

                {/* Tags */}
                {Array.isArray(item.tags) && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.tags.slice(0, 3).map((tag, tagIndex) => (
                      <span
                        key={tagIndex}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100/80 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                      >
                        {tag}
                      </span>
                    ))}
                    {item.tags.length > 3 && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100/80 dark:bg-gray-700/40 text-gray-600 dark:text-gray-400">
                        +{item.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between mt-6 pt-4 border-t border-gray-200/50 dark:border-gray-700/50">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleSelectItem(item)}
                  className="flex-1 mr-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl text-sm font-medium hover:shadow-lg transition-all duration-200"
                >
                  Select
                </motion.button>

                {activeSource !== "local" && onSaveItem && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleSaveItem(item)}
                    className="p-2 text-gray-500 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-200"
                    title="Save to Local Library"
                  >
                    <Star size={18} />
                  </motion.button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );

  // Render list view
  const renderListView = () => (
    <div className="space-y-3">
      {filteredItems.map((item, index) => (
        <motion.div
          key={`${item.id}-${index}`}
          variants={itemVariants}
          whileHover={{ x: 4 }}
          className="relative overflow-hidden rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border border-white/20 dark:border-gray-700/30 shadow-sm hover:shadow-md transition-all duration-200"
        >
          <div className="flex items-center p-4">
            <div className="flex-shrink-0 mr-4">{getItemIcon(item)}</div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                    {item.name}
                  </h3>
                  {item.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                      {item.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleSelectItem(item)}
                    className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all duration-200"
                  >
                    Select
                  </motion.button>

                  {activeSource !== "local" && onSaveItem && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleSaveItem(item)}
                      className="p-2 text-gray-500 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-200"
                      title="Save to Local Library"
                    >
                      <Star size={18} />
                    </motion.button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col h-full relative">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/30 via-white/50 to-purple-50/30 dark:from-gray-900/50 dark:via-gray-800/50 dark:to-blue-900/30">
        {/* Animated background elements */}
        <div className="absolute top-20 left-20 w-64 h-64 bg-blue-400/10 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute bottom-20 right-20 w-80 h-80 bg-purple-400/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: "1s" }}
        />
        <div
          className="absolute top-1/2 left-1/3 w-48 h-48 bg-pink-400/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: "2s" }}
        />
      </div>

      {/* Header */}
      {renderHeader()}

      {/* Filters Panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="border-b border-gray-200/50 dark:border-gray-700/50 bg-gray-50/80 dark:bg-gray-800/80 backdrop-blur-sm"
          >
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Category
                  </label>
                  <select
                    name="category"
                    value={filters.category || ""}
                    onChange={handleFilterChange}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">All Categories</option>
                    <option value="mechanical">Mechanical</option>
                    <option value="electronic">Electronic</option>
                    <option value="fixture">Fixture</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Material
                  </label>
                  <select
                    name="material"
                    value={filters.material || ""}
                    onChange={handleFilterChange}
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">All Materials</option>
                    <option value="aluminum">Aluminum</option>
                    <option value="steel">Steel</option>
                    <option value="plastic">Plastic</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Tags
                  </label>
                  <input
                    type="text"
                    name="tags"
                    value={filters.tags || ""}
                    onChange={handleFilterChange}
                    placeholder="Enter tags..."
                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative z-10">
        <div className="h-full overflow-y-auto">{renderContent()}</div>
      </div>
    </div>
  );
}
