// src/components/cad/ToolSelector.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { 
  Square, Circle, Box, Scissors, Maximize2, Layers, Type, 
  Move, RotateCcw, ZoomIn, Grid, Crosshair
} from 'react-feather';
import { useCADStore } from 'src/store/cadStore';

interface ToolProps {
  name: string;
  icon: React.ReactNode;
  onClick: () => void;
  active: boolean;
}

const Tool: React.FC<ToolProps> = ({ name, icon, onClick, active }) => {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={`p-2 rounded flex flex-col items-center justify-center text-xs ${
        active ? 'bg-blue-500 text-white' : 'bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white text-gray-700 hover:bg-gray-100'
      }`}
      onClick={onClick}
      title={name}
    >
      <motion.div 
        className="mb-1"
        animate={{ rotate: active ? [0, 5, -5, 0] : 0 }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
      >
        {icon}
      </motion.div>
      <span>{name}</span>
    </motion.button>
  );
};

const ToolSelector: React.FC = () => {
  const { activeTool, setActiveTool, toggleGrid, toggleAxis } = useCADStore();
  
  const tools: any[] = [
    // ... existing tools array
  ];

  return (
    <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md p-2 rounded-md">
      <motion.div 
        className="grid grid-cols-3 gap-2"
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
        {tools.map((tool) => (
          <motion.div
            key={tool.action}
            variants={{
              hidden: { y: 10, opacity: 0 },
              visible: { y: 0, opacity: 1 }
            }}
          >
            <Tool
              name={tool.name}
              icon={tool.icon}
              active={activeTool === tool.action}
              onClick={() => {
                if (tool.action === 'grid') {
                  toggleGrid();
                } else if (tool.action === 'layer') {
                  toggleAxis();
                } else {
                  setActiveTool(tool.action);
                }
              }}
            />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
};

export default ToolSelector;