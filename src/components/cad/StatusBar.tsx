// src/components/cad/StatusBar.tsx
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCADStore } from 'src/store/cadStore';
import { useElementsStore } from 'src/store/elementsStore';

const StatusBar: React.FC = () => {
  const { viewMode, workpiece } = useCADStore();
  const { selectedElement, mousePosition } = useElementsStore();
  
  const statusItemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };
  
  // Determine if we're in 2D (XZ) mode or 3D mode
  const is2DMode = viewMode === '2d';
  
  return (
    <motion.div 
      className="bg-gradient-to-b from-[#2A2A2A] to-[#303030] text-white px-4 rounded-top-xl py-2 flex items-center justify-between"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div 
        className="flex items-center rounded-xl space-x-6"
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
        <motion.div variants={statusItemVariants}>
          <span className="text-gray-400 mr-2">Mode:</span>
          <motion.span 
            className="font-medium"
            key={viewMode}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {is2DMode ? '2D (XZ)' : '3D'}
          </motion.span>
        </motion.div>
        <motion.div variants={statusItemVariants}>
          <span className="text-gray-400 mr-2">Units:</span>
          <span className="font-medium">{workpiece.units}</span>
        </motion.div>
        <motion.div variants={statusItemVariants}>
          <span className="text-gray-400 mr-2">Material:</span>
          <span className="font-medium capitalize">{workpiece.material}</span>
        </motion.div>
        <motion.div variants={statusItemVariants}>
          <span className="text-gray-400 mr-2">Elements:</span>
          <motion.span 
            className="font-medium"
            key={useElementsStore.getState().elements.length}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            {useElementsStore.getState().elements.length}
          </motion.span>
        </motion.div>
      </motion.div>
      
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
        {/* Always show X coordinate */}
        <motion.div variants={statusItemVariants}>
          <span className="text-gray-400 mr-2">X:</span>
          <motion.span 
            className="font-medium"
            animate={{ x: 0 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            {mousePosition.x.toFixed(2)}
          </motion.span>
        </motion.div>

        {/* Show Y coordinate in 3D mode */}
        {!is2DMode && (
          <motion.div variants={statusItemVariants}>
            <span className="text-gray-400 mr-2">Y:</span>
            <motion.span 
              className="font-medium"
              animate={{ x: 0 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              {mousePosition.y.toFixed(2)}
            </motion.span>
          </motion.div>
        )}

        {/* Always show Z coordinate */}
        <motion.div variants={statusItemVariants}>
          <span className="text-gray-400 mr-2">Z:</span>
          <motion.span 
            className="font-medium"
            animate={{ x: 0 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            {mousePosition.z.toFixed(2)}
          </motion.span>
        </motion.div>

        <motion.div variants={statusItemVariants}>
          <span className="text-gray-400 mr-2">Selected:</span>
          <AnimatePresence mode="wait">
            <motion.span 
              key={selectedElement?.id || 'none'}
              className="font-medium"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.2 }}
            >
              {selectedElement ? `${selectedElement.type} (ID: ${selectedElement.id.substring(0, 6)}...)` : 'None'}
            </motion.span>
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

export default StatusBar;