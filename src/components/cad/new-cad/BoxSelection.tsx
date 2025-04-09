// src/components/cad/BoxSelection.tsx
import React from 'react';
import { useSelectionStore } from 'src/store/selectorStore';
import { motion } from 'framer-motion';

interface BoxSelectionProps {
  worldToScreen: (position: { x: number, y: number, z: number }) => { x: number, y: number } | null;
}

const BoxSelection: React.FC<BoxSelectionProps> = ({ worldToScreen }) => {
  const { isBoxSelecting, boxStartPosition, boxEndPosition } = useSelectionStore();
  
  if (!isBoxSelecting || !boxStartPosition || !boxEndPosition) {
    return null;
  }
  
  // Convert world coordinates to screen coordinates
  const startScreen = worldToScreen({ ...boxStartPosition, z: 0 });
  const endScreen = worldToScreen({ ...boxEndPosition, z: 0 });
  
  if (!startScreen || !endScreen) {
    return null;
  }
  
  // Calculate box dimensions and position
  const left = Math.min(startScreen.x, endScreen.x);
  const top = Math.min(startScreen.y, endScreen.y);
  const width = Math.abs(endScreen.x - startScreen.x);
  const height = Math.abs(endScreen.y - startScreen.y);
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute border-2 border-blue-500 bg-blue-100 bg-opacity-20 pointer-events-none z-30"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
      }}
    />
  );
};

export default BoxSelection;