// src/components/library/LocalCadLibraryView.tsx
import React, { useState, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useLocalCadLibraryStore, LocalCadDrawing } from "@/src/store/localCadLibraryStore";
import { useLocalLibrary } from "@/src/hooks/useLocalLibrary";
import { getStorageStats } from "@/src/lib/localStorageService";
import { 
  Grid, 
  List, 
  Search, 
  Trash2, 
  Download, 
  Upload, 
  Save, 
  Plus, 
  Clock, 
  Info, 
  X,
  FileText,
  Star
} from "react-feather";

// Constants
const LOCAL_STORAGE_LIMIT = 5 * 1024 * 1024; // 5MB

interface LocalCadLibraryViewProps {
  onSelectDrawing?: (drawingId: string) => void;
  onClose?: () => void;
  allowImport?: boolean;
  allowExport?: boolean;
  showCloseButton?: boolean;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

const LocalCadLibraryView: React.FC<LocalCadLibraryViewProps> = ({
  onSelectDrawing,
  onClose,
  allowImport = true,
  allowExport = true,
  showCloseButton = true
}) => {
  // Local state
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDrawing, setSelectedDrawing] = useState<LocalCadDrawing | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [saveFormData, setSaveFormData] = useState({
    name: "",
    description: "",
    tags: ""
  });
  const [storageInfo, setStorageInfo] = useState(getStorageStats());

  // Get CAD library store and local library hook
  const { drawings, loadLibrary, searchDrawings, deleteDrawing, exportDrawing } = useLocalCadLibraryStore();
  const { saveCadDrawing, loadCadDrawing, getCurrentCadDrawingData, isLoading, error, clearError } = useLocalLibrary();

  // Load the library on component mount
  useEffect(() => {
    loadLibrary();
    setStorageInfo(getStorageStats());
  }, [loadLibrary]);

  // Filtered drawings based on search query
  const filteredDrawings = searchQuery ? searchDrawings(searchQuery) : drawings;

  // Handle selecting a drawing
  const handleSelectDrawing = (drawing: LocalCadDrawing) => {
    setSelectedDrawing(drawing);
    if (onSelectDrawing) {
      onSelectDrawing(drawing.id);
    }
  };

  // Handle loading a drawing
  const handleLoadDrawing = (drawing: LocalCadDrawing) => {
    loadCadDrawing(drawing.id);
    if (onClose) {
      onClose();
    }
  };

  // Handle saving the current drawing
  const handleSaveDrawing = () => {
    const { name, description, tags } = saveFormData;
    const tagsList = tags.split(",").map(tag => tag.trim()).filter(Boolean);
    saveCadDrawing(name, description, tagsList);
    setShowSaveModal(false);
    loadLibrary();
    setStorageInfo(getStorageStats());
  };

  // Handle deleting a drawing
  const handleDeleteDrawing = () => {
    if (selectedDrawing) {
      deleteDrawing(selectedDrawing.id);
      setSelectedDrawing(null);
      setShowDeleteConfirmation(false);
      setShowDetailsModal(false);
      setStorageInfo(getStorageStats());
    }
  };

  // Handle exporting a drawing
  const handleExportDrawing = () => {
    if (!selectedDrawing) return;
    const exportedDrawing = exportDrawing(selectedDrawing.id);
    if (!exportedDrawing) return;
    
    const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(exportedDrawing, null, 2))}`;
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${exportedDrawing.name}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  // Open save modal with current drawing data
  const handleOpenSaveModal = () => {
    const currentDrawing = getCurrentCadDrawingData();
    setSaveFormData({
      name: currentDrawing.name,
      description: currentDrawing.description || "",
      tags: currentDrawing.tags?.join(", ") || ""
    });
    setShowSaveModal(true);
  };

  // Format date string
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <AnimatePresence>
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/20 backdrop-blur-sm"
          onClick={onClose}
        />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", duration: 0.5 }}
          className="absolute inset-4 md:inset-8 lg:inset-16 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-gray-700/30 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Holographic Background Effects */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50/30 via-white/20 to-purple-50/30 dark:from-gray-900/50 dark:via-gray-800/50 dark:to-blue-900/50" />
          
          {/* Animated Background Pattern */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-10 left-10 w-72 h-72 bg-blue-400/10 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-10 right-10 w-96 h-96 bg-purple-400/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
            <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-pink-400/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "2s" }} />
          </div>
          
          {/* Grid Pattern */}
          <div className="absolute inset-0 opacity-5">
            <div className="w-full h-full" style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, rgba(59,130,246,0.3) 1px, transparent 0)`,
              backgroundSize: '20px 20px'
            }} />
          </div>
          
          {/* Corner Decorations */}
          <div className="absolute top-0 left-0 w-32 h-32 bg-gradient-to-br from-blue-400/20 to-transparent rounded-br-full" />
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-purple-400/20 to-transparent rounded-bl-full" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-pink-400/20 to-transparent rounded-tr-full" />
          <div className="absolute bottom-0 right-0 w-32 h-32 bg-gradient-to-tl from-blue-400/20 to-transparent rounded-tl-full" />
          
          {/* Main Content Container */}
          <div className="relative z-10 h-full flex flex-col p-8 overflow-hidden">
            {/* Header */}
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between mb-6"
            >
              <div className="flex items-center space-x-4">
                <motion.div
                  animate={{ 
                    rotate: [0, 360],
                    scale: [1, 1.1, 1]
                  }}
                  transition={{ 
                    duration: 3,
                    repeat: Infinity,
                    repeatType: "reverse"
                  }}
                  className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg"
                >
                  <FileText size={24} className="text-white" />
                </motion.div>
                <div>
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
                    CAD Drawings Library
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400">
                    Manage and organize your CAD designs
                  </p>
                </div>
              </div>
              
              {showCloseButton && (
                <motion.button 
                  whileHover={{ scale: 1.05, rotate: 90 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onClose} 
                  className="p-3 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200"
                >
                  <X size={24} />
                </motion.button>
              )}
            </motion.div>

            {/* Storage Info */}
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-6 relative overflow-hidden"
            >
              <div className="bg-gradient-to-r from-blue-50/90 to-purple-50/90 dark:from-blue-900/40 dark:to-purple-900/40 p-4 rounded-2xl backdrop-blur-sm border border-blue-200/30 dark:border-blue-700/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Star size={16} className="text-blue-500" />
                    <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300">Storage Usage</h3>
                  </div>
                  <span className="text-xs text-blue-600 dark:text-blue-400 bg-white/50 dark:bg-gray-800/50 px-2 py-1 rounded-full">
                    {(storageInfo.totalUsage / 1024 / 1024).toFixed(2)} MB of {(LOCAL_STORAGE_LIMIT / 1024 / 1024).toFixed(2)} MB used
                  </span>
                </div>
                
                <div className="relative">
                  <div className="w-full bg-blue-200/50 dark:bg-blue-800/30 rounded-full h-2 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(storageInfo.usagePercentage, 100)}%` }}
                      transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
                      className="bg-gradient-to-r from-blue-500 to-purple-600 h-full rounded-full"
                    />
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Controls */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-col sm:flex-row gap-4 mb-6"
            >
              <div className="relative flex-1">
                <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  className="w-full pl-10 pr-4 py-3 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent"
                  placeholder="Search drawings..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex gap-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleOpenSaveModal}
                  className="flex items-center px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl shadow-lg transition-all duration-200"
                >
                  <Save size={16} className="mr-2" />
                  Save Current
                </motion.button>

                <div className="flex bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-700/50">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setViewMode("grid")}
                    className={`p-3 rounded-l-xl transition-all duration-200 ${
                      viewMode === "grid" 
                        ? "bg-blue-500 text-white shadow-md" 
                        : "text-gray-600 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                    }`}
                  >
                    <Grid size={20} />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setViewMode("list")}
                    className={`p-3 rounded-r-xl transition-all duration-200 ${
                      viewMode === "list" 
                        ? "bg-blue-500 text-white shadow-md" 
                        : "text-gray-600 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                    }`}
                  >
                    <List size={20} />
                  </motion.button>
                </div>
              </div>
            </motion.div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden">
              {/* Error message */}
              {error && (
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-red-50/90 dark:bg-red-900/20 text-red-800 dark:text-red-200 p-4 rounded-xl mb-4 backdrop-blur-sm border border-red-200/50 dark:border-red-800/50"
                >
                  <p className="text-sm">{error}</p>
                  <button 
                    className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 mt-1" 
                    onClick={clearError}
                  >
                    Dismiss
                  </button>
                </motion.div>
              )}

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex justify-center items-center py-20">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-12 h-12 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 dark:border-t-blue-400 rounded-full"
                  />
                </div>
              )}

              {/* No drawings message */}
              {!isLoading && filteredDrawings.length === 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center py-20"
                >
                  <div className="w-24 h-24 mx-auto mb-4 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 rounded-2xl flex items-center justify-center">
                    <FileText size={48} className="text-blue-500" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">No drawings found</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">
                    {searchQuery ? `No drawings match "${searchQuery}"` : "Save your first drawing to get started"}
                  </p>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleOpenSaveModal}
                    className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
                  >
                    <Plus size={20} className="mr-2" />
                    Save Current Drawing
                  </motion.button>
                </motion.div>
              )}

              {/* Drawings list */}
              {!isLoading && filteredDrawings.length > 0 && (
                <motion.div 
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="h-full overflow-y-auto overflow-x-hidden pr-2"
                >
                  {viewMode === "grid" ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {filteredDrawings.map((drawing, index) => (
                        <motion.div
                          key={drawing.id}
                          variants={itemVariants}
                          whileHover={{ scale: 1.02, y: -2 }}
                          className="group bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300"
                        >
                          <div
                            className="h-32 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 relative cursor-pointer overflow-hidden"
                            onClick={() => handleSelectDrawing(drawing)}
                          >
                            {drawing.thumbnail ? (
                              <Image 
                                src={drawing.thumbnail} 
                                alt={drawing.name} 
                                width={128}
                                height={128}
                                className="w-full h-full object-cover" 
                              />
                            ) : (
                              <div className="flex items-center justify-center h-full">
                                <FileText size={32} className="text-gray-400" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                          </div>

                          <div className="p-4">
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate mb-1">{drawing.name}</h3>
                            {drawing.description && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">{drawing.description}</p>
                            )}
                            <div className="flex items-center text-xs text-gray-500 dark:text-gray-500 mb-3">
                              <Clock size={12} className="mr-1" />
                              {formatDate(drawing.updatedAt)}
                            </div>

                            <div className="flex justify-between items-center">
                              <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleLoadDrawing(drawing)}
                                className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded-lg transition-colors duration-200"
                              >
                                Load
                              </motion.button>

                              <div className="flex gap-1">
                                <motion.button
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => {
                                    setSelectedDrawing(drawing);
                                    setShowDetailsModal(true);
                                  }}
                                  className="p-1 text-gray-500 hover:text-blue-600 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-200"
                                >
                                  <Info size={14} />
                                </motion.button>

                                {allowExport && (
                                  <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => {
                                      setSelectedDrawing(drawing);
                                      handleExportDrawing();
                                    }}
                                    className="p-1 text-gray-500 hover:text-green-600 rounded-md hover:bg-green-50 dark:hover:bg-green-900/20 transition-all duration-200"
                                  >
                                    <Download size={14} />
                                  </motion.button>
                                )}

                                <motion.button
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => {
                                    setSelectedDrawing(drawing);
                                    setShowDeleteConfirmation(true);
                                  }}
                                  className="p-1 text-gray-500 hover:text-red-600 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200"
                                >
                                  <Trash2 size={14} />
                                </motion.button>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="min-w-full">
                          <thead className="bg-gray-50/80 dark:bg-gray-700/80">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Name
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Updated
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Elements
                              </th>
                              <th className="relative px-6 py-3">
                                <span className="sr-only">Actions</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200/50 dark:divide-gray-700/50">
                            {filteredDrawings.map((drawing, index) => (
                              <motion.tr
                                key={drawing.id}
                                variants={itemVariants}
                                whileHover={{ backgroundColor: "rgba(59, 130, 246, 0.05)" }}
                                className="cursor-pointer"
                                onClick={() => handleSelectDrawing(drawing)}
                              >
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center">
                                    <div className="flex-shrink-0 h-10 w-10 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 rounded-lg flex items-center justify-center">
                                                                          {drawing.thumbnail ? (
                                      <Image 
                                        src={drawing.thumbnail} 
                                        alt={drawing.name} 
                                        width={40}
                                        height={40}
                                        className="h-10 w-10 rounded-lg object-cover" 
                                      />
                                    ) : (
                                      <FileText size={20} className="text-blue-500" />
                                    )}
                                    </div>
                                    <div className="ml-4">
                                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{drawing.name}</div>
                                      {drawing.description && (
                                        <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">{drawing.description}</div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                  {formatDate(drawing.updatedAt)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                  {drawing.elements?.length || 0} elements
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                  <div className="flex justify-end gap-2">
                                    <motion.button
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleLoadDrawing(drawing);
                                      }}
                                      className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                                    >
                                      Load
                                    </motion.button>

                                    <motion.button
                                      whileHover={{ scale: 1.1 }}
                                      whileTap={{ scale: 0.9 }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedDrawing(drawing);
                                        setShowDetailsModal(true);
                                      }}
                                      className="p-1 text-gray-500 hover:text-blue-600 rounded-md transition-colors duration-200"
                                    >
                                      <Info size={16} />
                                    </motion.button>

                                    {allowExport && (
                                      <motion.button
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedDrawing(drawing);
                                          handleExportDrawing();
                                        }}
                                        className="p-1 text-gray-500 hover:text-green-600 rounded-md transition-colors duration-200"
                                      >
                                        <Download size={16} />
                                      </motion.button>
                                    )}

                                    <motion.button
                                      whileHover={{ scale: 1.1 }}
                                      whileTap={{ scale: 0.9 }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedDrawing(drawing);
                                        setShowDeleteConfirmation(true);
                                      }}
                                      className="p-1 text-gray-500 hover:text-red-600 rounded-md transition-colors duration-200"
                                    >
                                      <Trash2 size={16} />
                                    </motion.button>
                                  </div>
                                </td>
                              </motion.tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Save Drawing Modal */}
      <AnimatePresence>
        {showSaveModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 dark:border-gray-700/30 max-w-md w-full mx-4 overflow-hidden"
            >
              <div className="bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-4">
                <h3 className="text-lg font-semibold text-white">Save Drawing to Library</h3>
              </div>
              <div className="p-6">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Drawing Name</label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    value={saveFormData.name}
                    onChange={(e) => setSaveFormData({ ...saveFormData, name: e.target.value })}
                    placeholder="Enter a name for this drawing"
                    required
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description (optional)</label>
                  <textarea
                    className="w-full px-4 py-3 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    value={saveFormData.description}
                    onChange={(e) => setSaveFormData({ ...saveFormData, description: e.target.value })}
                    placeholder="Enter a description"
                    rows={3}
                  />
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tags (comma separated, optional)</label>
                  <input
                    type="text"
                    className="w-full px-4 py-3 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    value={saveFormData.tags}
                    onChange={(e) => setSaveFormData({ ...saveFormData, tags: e.target.value })}
                    placeholder="e.g. mechanical, 2D, project1"
                  />
                </div>

                <div className="flex justify-end space-x-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowSaveModal(false)}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-200"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSaveDrawing}
                    disabled={!saveFormData.name}
                    className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    Save Drawing
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drawing Details Modal */}
      <AnimatePresence>
        {showDetailsModal && selectedDrawing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 dark:border-gray-700/30 max-w-lg w-full mx-4 overflow-hidden"
            >
              <div className="flex justify-between items-center p-6 bg-gradient-to-r from-blue-500 to-purple-600">
                <h3 className="text-lg font-semibold text-white">Drawing Details</h3>
                <motion.button 
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  className="text-white/80 hover:text-white" 
                  onClick={() => setShowDetailsModal(false)}
                >
                  <X size={20} />
                </motion.button>
              </div>
              <div className="p-6">
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="w-full md:w-1/3 flex-shrink-0">
                    <div className="bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 h-32 rounded-xl flex items-center justify-center mb-4">
                      {selectedDrawing.thumbnail ? (
                        <Image 
                          src={selectedDrawing.thumbnail} 
                          alt={selectedDrawing.name} 
                          width={128}
                          height={128}
                          className="w-full h-full object-cover rounded-xl" 
                        />
                      ) : (
                        <FileText size={32} className="text-gray-400" />
                      )}
                    </div>

                    <div className="space-y-2">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleLoadDrawing(selectedDrawing)}
                        className="w-full px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
                      >
                        <Upload size={16} className="inline mr-2" />
                        Load Drawing
                      </motion.button>

                      {allowExport && (
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handleExportDrawing}
                          className="w-full px-4 py-2 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all duration-200"
                        >
                          <Download size={16} className="inline mr-2" />
                          Export
                        </motion.button>
                      )}

                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          setShowDetailsModal(false);
                          setShowDeleteConfirmation(true);
                        }}
                        className="w-full px-4 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200/50 dark:border-red-800/50 text-red-700 dark:text-red-300 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 transition-all duration-200"
                      >
                        <Trash2 size={16} className="inline mr-2" />
                        Delete
                      </motion.button>
                    </div>
                  </div>

                  <div className="w-full md:w-2/3">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">{selectedDrawing.name}</h2>
                    {selectedDrawing.description && (
                      <p className="text-gray-600 dark:text-gray-400 mb-4">{selectedDrawing.description}</p>
                    )}

                    <div className="space-y-3">
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Created</h4>
                        <p className="text-gray-600 dark:text-gray-400">{formatDate(selectedDrawing.createdAt)}</p>
                      </div>

                      <div>
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Last Modified</h4>
                        <p className="text-gray-600 dark:text-gray-400">{formatDate(selectedDrawing.updatedAt)}</p>
                      </div>

                      <div>
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Elements</h4>
                        <p className="text-gray-600 dark:text-gray-400">{selectedDrawing.elements?.length || 0} elements</p>
                      </div>

                      {selectedDrawing.tags && selectedDrawing.tags.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tags</h4>
                          <div className="flex flex-wrap gap-1">
                            {selectedDrawing.tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium bg-blue-100/80 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirmation && selectedDrawing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 dark:border-gray-700/30 max-w-md w-full mx-4 overflow-hidden"
            >
              <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-4">
                <h3 className="text-lg font-semibold text-white">Confirm Deletion</h3>
              </div>
              <div className="p-6">
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Are you sure you want to delete the drawing &quot;{selectedDrawing.name}&quot;? This action cannot be undone.
                </p>

                <div className="flex justify-end space-x-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowDeleteConfirmation(false)}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-200"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleDeleteDrawing}
                    className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:shadow-lg transition-all duration-200"
                  >
                    Delete Drawing
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LocalCadLibraryView; 