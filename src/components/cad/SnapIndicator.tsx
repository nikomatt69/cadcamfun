// src/components/cad/SnapIndicator.tsx

import React from 'react';
import { motion } from 'framer-motion';
import { SnapType } from '@/src/lib/enanchedSnapService';

interface SnapIndicatorProps {
  x: number;
  y: number;
  type: SnapType;
  visible: boolean;
}

const SnapIndicator: React.FC<SnapIndicatorProps> = ({ x, y, type, visible }) => {
  if (!visible) return null;
  
  // Different indicators for different snap types
  const getIndicator = () => {
    // Use the correct typing for motion.div style property
    const baseStyle = {
      position: 'absolute' as const,
      transform: 'translate(-50%, -50%)' as const,
      pointerEvents: 'none' as const
    };
    
    switch (type) {
      case SnapType.ENDPOINT:
        return (
          <motion.div
            style={{ ...baseStyle, left: `${x}px`, top: `${y}px` }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <div className="w-3 h-3 rounded-full border-2 border-blue-500 bg-white" />
          </motion.div>
        );
        
      case SnapType.MIDPOINT:
        return (
          <motion.div
            style={{ ...baseStyle, left: `${x}px`, top: `${y}px` }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <div className="w-3 h-3 rounded-sm border-2 border-green-500 bg-white" />
          </motion.div>
        );
        
      case SnapType.INTERSECTION:
        return (
          <motion.div
            style={{ ...baseStyle, left: `${x}px`, top: `${y}px` }}
            initial={{ scale: 0, rotate: 0 }}
            animate={{ scale: 1, rotate: 45 }}
            exit={{ scale: 0 }}
          >
            <div className="w-3 h-3 bg-red-500" />
          </motion.div>
        );
        
      case SnapType.TANGENT:
        return (
          <motion.div
            style={{ ...baseStyle, left: `${x}px`, top: `${y}px` }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <div className="w-4 h-4 rounded-full border-2 border-purple-500 bg-white" />
            <div className="absolute top-1/2 left-1/2 w-4 h-0.5 bg-purple-500 transform -translate-x-1/2 -translate-y-1/2" />
          </motion.div>
        );
        
      case SnapType.PERPENDICULAR:
        return (
          <motion.div
            style={{ ...baseStyle, left: `${x}px`, top: `${y}px` }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <div className="w-4 h-4 flex items-center justify-center">
              <div className="absolute w-4 h-0.5 bg-cyan-500" />
              <div className="absolute w-0.5 h-4 bg-cyan-500" />
            </div>
          </motion.div>
        );
        
      case SnapType.HORIZONTAL:
        return (
          <motion.div
            style={{ ...baseStyle, left: `${x}px`, top: `${y}px` }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <div className="absolute w-4 h-0.5 bg-yellow-500" />
            <div className="w-2 h-2 rounded-full bg-yellow-500" />
          </motion.div>
        );
        
      case SnapType.VERTICAL:
        return (
          <motion.div
            style={{ ...baseStyle, left: `${x}px`, top: `${y}px` }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <div className="absolute w-0.5 h-4 bg-yellow-500" />
            <div className="w-2 h-2 rounded-full bg-yellow-500" />
          </motion.div>
        );
        
      case SnapType.GRID:
        return (
          <motion.div
            style={{ ...baseStyle, left: `${x}px`, top: `${y}px` }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <div className="w-3 h-3 rounded-full border border-gray-500 bg-white" />
          </motion.div>
        );
        
      case SnapType.CENTER:
        return (
          <motion.div
            style={{ ...baseStyle, left: `${x}px`, top: `${y}px` }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <div className="w-5 h-5 rounded-full border border-teal-500 bg-transparent">
              <div className="w-1 h-1 bg-teal-500 rounded-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
            </div>
          </motion.div>
        );
        
      case SnapType.EQUIDISTANT:
        return (
          <motion.div
            style={{ ...baseStyle, left: `${x}px`, top: `${y}px` }}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <div className="w-4 h-4 border-2 border-indigo-500 rounded-full bg-transparent">
              <div className="w-2 h-0.5 bg-indigo-500 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
              <div className="w-0.5 h-2 bg-indigo-500 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
            </div>
          </motion.div>
        );
        
      default:
        return null;
    }
  };
  
  return (
    <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
      {getIndicator()}
    </div>
  );
};

export default SnapIndicator;