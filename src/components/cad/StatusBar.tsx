// src/components/cad/StatusBar.tsx
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCADStore } from "src/store/cadStore";
import { useElementsStore } from "src/store/elementsStore";
import { useSelectionStore } from "src/store/selectorStore";
import { useTransformControls } from "src/hooks/useTransformControls";
import { Grid, Eye, EyeOff, MousePointer, Move, RotateCw, Maximize2, Layers, Zap } from "react-feather";

const StatusBar: React.FC = () => {
  const { viewMode, workpiece, gridVisible, axisVisible, showDimensions } = useCADStore();
  const { selectedElement, mousePosition, elements } = useElementsStore();
  const { selectedElementIds } = useSelectionStore();
  const { mode: transformMode, isTransforming } = useTransformControls();

  const statusItemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  // Safe workpiece access with fallbacks
  const safeWorkpiece = {
    width: workpiece?.width || 100,
    height: workpiece?.height || 100,
    depth: workpiece?.depth || 20,
    material: workpiece?.material || "aluminum"
  };

  // Determine if we're in 2D (XY) mode or 3D mode
  const is2DMode = viewMode === "2d";

  // Calculate total elements count
  const totalElements = elements?.length || 0;
  const selectedCount = selectedElementIds?.length || 0;

  // Transform mode indicator
  const getTransformIcon = () => {
    switch (transformMode) {
      case "translate": return <Move size={12} className="text-blue-400" />;
      case "rotate": return <RotateCw size={12} className="text-green-400" />;
      case "scale": return <Maximize2 size={12} className="text-yellow-400" />;
      default: return <MousePointer size={12} className="text-gray-400" />;
    }
  };

  const getTransformText = () => {
    if (isTransforming) return `${transformMode.toUpperCase()} (Active)`;
    if (transformMode !== "none") return transformMode.toUpperCase();
    return "Select";
  };

  return (
    <motion.div
      className="bg-gradient-to-r from-[#1a1a1a] via-[#2a2a2a] to-[#1a1a1a] text-white px-4 py-2 flex items-center justify-between shadow-lg border-t border-gray-700"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Left Section - Core Info */}
      <motion.div
        className="flex items-center space-x-6"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: {
            transition: {
              staggerChildren: 0.1
            }
          }
        }}
      >
        {/* View Mode */}
        <motion.div variants={statusItemVariants} className="flex items-center">
          <span className="text-gray-400 mr-2">Mode:</span>
          <motion.span
            className={`font-medium px-2 py-1 rounded text-xs ${is2DMode ? 'bg-blue-900 text-blue-200' : 'bg-purple-900 text-purple-200'}`}
            key={viewMode}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            {is2DMode ? "2D (XY)" : "3D"}
          </motion.span>
        </motion.div>

        {/* Transform Mode */}
        <motion.div variants={statusItemVariants} className="flex items-center">
          <span className="text-gray-400 mr-2">Tool:</span>
          <div className="flex items-center space-x-1">
            {getTransformIcon()}
            <motion.span
              className={`font-medium text-xs ${isTransforming ? 'text-yellow-300' : 'text-gray-300'}`}
              key={`${transformMode}-${isTransforming}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {getTransformText()}
            </motion.span>
          </div>
        </motion.div>

        {/* Units */}
        <motion.div variants={statusItemVariants} className="flex items-center">
          <span className="text-gray-400 mr-2">Units:</span>
          <span className="font-medium text-orange-300">mm</span>
        </motion.div>

        {/* Workpiece Info */}
        <motion.div variants={statusItemVariants} className="flex items-center">
          <span className="text-gray-400 mr-2">Material:</span>
          <span className="font-medium capitalize text-green-300">{safeWorkpiece.material}</span>
        </motion.div>

        {/* Workpiece Dimensions */}
        <motion.div variants={statusItemVariants} className="flex items-center">
          <span className="text-gray-400 mr-2">Stock:</span>
          <span className="font-medium text-xs text-cyan-300">
            {safeWorkpiece.width.toFixed(1)} × {safeWorkpiece.height.toFixed(1)} × {safeWorkpiece.depth.toFixed(1)}
          </span>
        </motion.div>
      </motion.div>

      {/* Center Section - Status Indicators */}
      <motion.div
        className="flex items-center space-x-4"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: {
            transition: {
              staggerChildren: 0.05
            }
          }
        }}
      >
        {/* Grid Status */}
        <motion.div variants={statusItemVariants} className="flex items-center">
          <Grid size={12} className={`mr-1 ${gridVisible ? 'text-green-400' : 'text-gray-600'}`} />
          <span className={`text-xs ${gridVisible ? 'text-green-300' : 'text-gray-500'}`}>
            Grid
          </span>
        </motion.div>

        {/* Axis Status */}
        <motion.div variants={statusItemVariants} className="flex items-center">
          {axisVisible ? (
            <Eye size={12} className="text-blue-400 mr-1" />
          ) : (
            <EyeOff size={12} className="text-gray-600 mr-1" />
          )}
          <span className={`text-xs ${axisVisible ? 'text-blue-300' : 'text-gray-500'}`}>
            Axis
          </span>
        </motion.div>

        {/* Dimensions Status */}
        <motion.div variants={statusItemVariants} className="flex items-center">
          <Layers size={12} className={`mr-1 ${showDimensions ? 'text-yellow-400' : 'text-gray-600'}`} />
          <span className={`text-xs ${showDimensions ? 'text-yellow-300' : 'text-gray-500'}`}>
            Dims
          </span>
        </motion.div>

        {/* Elements Count */}
        <motion.div variants={statusItemVariants} className="flex items-center">
          <span className="text-gray-400 mr-1 text-xs">Elements:</span>
          <motion.span
            className="font-medium text-xs bg-gray-800 px-2 py-1 rounded"
            key={totalElements}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            {totalElements}
          </motion.span>
        </motion.div>

        {/* Selected Count */}
        {selectedCount > 0 && (
          <motion.div variants={statusItemVariants} className="flex items-center">
            <Zap size={12} className="text-orange-400 mr-1" />
            <span className="text-xs text-orange-300">
              {selectedCount} selected
            </span>
          </motion.div>
        )}
      </motion.div>

      {/* Right Section - Mouse Position & Selection */}
      <motion.div
        className="flex items-center space-x-6"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: {
            transition: {
              staggerChildren: 0.1,
              staggerDirection: -1
            }
          }
        }}
      >
        {/* Mouse Coordinates */}
        <motion.div variants={statusItemVariants} className="flex items-center space-x-3">
          {/* X coordinate - Blue to match CAD X axis */}
          <div className="flex items-center">
            <span className="mr-1 text-xs font-bold" style={{ color: '#0066ff' }}>X:</span>
            <motion.span
              className="font-mono text-xs bg-gray-800 px-2 py-1 rounded"
              style={{ color: '#66b3ff' }}
              animate={{ x: 0 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              {(mousePosition?.x || 0).toFixed(2)}
            </motion.span>
          </div>

          {/* Y coordinate - Magenta to match CAD Y axis */}
          <div className="flex items-center">
            <span className="mr-1 text-xs font-bold" style={{ color: '#ff00ff' }}>Y:</span>
            <motion.span
              className="font-mono text-xs bg-gray-800 px-2 py-1 rounded"
              style={{ color: '#ff99ff' }}
              animate={{ x: 0 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              {(mousePosition?.y || 0).toFixed(2)}
            </motion.span>
          </div>

          {/* Z coordinate - Green-aqua to match CAD Z axis (3D mode only) */}
          {!is2DMode && (
            <div className="flex items-center">
              <span className="mr-1 text-xs font-bold" style={{ color: '#00ff7f' }}>Z:</span>
              <motion.span
                className="font-mono text-xs bg-gray-800 px-2 py-1 rounded"
                style={{ color: '#66ffb3' }}
                animate={{ x: 0 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                {(mousePosition?.z || 0).toFixed(2)}
              </motion.span>
            </div>
          )}
        </motion.div>

        {/* Selection Info */}
        <motion.div variants={statusItemVariants} className="flex items-center">
          <span className="text-gray-400 mr-2 text-xs">Selected:</span>
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedElement?.id || "none"}
              className="flex items-center"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.2 }}
            >
              {selectedElement ? (
                <div className="flex items-center bg-blue-900 px-2 py-1 rounded text-xs">
                  <span className="text-blue-200 font-medium">
                    {selectedElement.type}
                  </span>
                  <span className="text-blue-400 ml-1">
                    ({selectedElement.id.substring(0, 6)}...)
                  </span>
                </div>
              ) : (
                <span className="text-gray-500 text-xs italic">None</span>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* Quick Shortcuts Hint */}
        <motion.div variants={statusItemVariants} className="text-xs text-gray-500">
          <span className="hidden lg:inline">
            G-Move | R-Rotate | S-Scale | ESC-Cancel
          </span>
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

export default StatusBar;
