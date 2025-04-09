import React, { useRef, useEffect } from 'react';
import { Cpu, Code, Search, Box } from 'react-feather';
import { useAIAssistant } from 'src/hooks/useAIAssistant';

interface GCodeContextMenuProps {
  visible: boolean;
  position: { x: number; y: number };
  selectedCode: string;
  onClose: () => void;
}

const GCodeContextMenu: React.FC<GCodeContextMenuProps> = ({
  visible,
  position,
  selectedCode,
  onClose
}) => {
  const { showWithQuestion } = useAIAssistant();
  const menuRef = useRef<HTMLDivElement>(null);
  
  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    
    if (visible) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [visible, onClose]);
  
  // Don't render if not visible
  if (!visible) return null;
  
  // Don't show the menu if there's no selected code
  if (!selectedCode.trim()) return null;
  
  const handleExplain = () => {
    showWithQuestion(`Explain this G-code: \n\`\`\`\n${selectedCode}\n\`\`\``, 'gcode');
    onClose();
  };
  
  const handleDebug = () => {
    showWithQuestion(`Debug this G-code and identify any issues or optimizations: \n\`\`\`\n${selectedCode}\n\`\`\``, 'gcode');
    onClose();
  };
  
  const handleOptimize = () => {
    showWithQuestion(`Optimize this G-code to make it more efficient: \n\`\`\`\n${selectedCode}\n\`\`\``, 'gcode');
    onClose();
  };
  
  return (
    <div 
      ref={menuRef}
      className="absolute z-50 bg-white dark:bg-gray-800 shadow-lg rounded-md border border-gray-200 dark:border-gray-700 py-1 w-48"
      style={{ 
        left: `${position.x}px`, 
        top: `${position.y}px`,
        maxWidth: 'calc(100vw - 20px)'
      }}
    >
      <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
        AI Assistant
      </div>
      
      <button
        onClick={handleExplain}
        className="flex items-center w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        <Search size={14} className="mr-2 text-blue-500" />
        Explain this code
      </button>
      
      <button
        onClick={handleDebug}
        className="flex items-center w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        <Box size={14} className="mr-2 text-red-500" />
        Debug this code
      </button>
      
      <button
        onClick={handleOptimize}
        className="flex items-center w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        <Cpu size={14} className="mr-2 text-green-500" />
        Optimize this code
      </button>
    </div>
  );
};

export default GCodeContextMenu;
