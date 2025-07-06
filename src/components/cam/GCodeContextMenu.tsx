import React, { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cpu, Code, Search, Box } from "react-feather";
import { useAIAssistant } from "src/hooks/useAIAssistant";
import { Sparkles } from "lucide-react";
import { Brain } from "lucide-react";

interface GCodeContextMenuProps {
  visible: boolean;
  position: { x: number; y: number };
  selectedCode: string;
  onClose: () => void;
}

const GCodeContextMenu: React.FC<GCodeContextMenuProps> = ({ visible, position, selectedCode, onClose }) => {
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
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [visible, onClose]);

  // Don't render if not visible
  if (!visible) return null;

  // Don't show the menu if there's no selected code
  if (!selectedCode.trim()) return null;

  const handleExplain = () => {
    showWithQuestion(`Explain this G-code: \n\`\`\`\n${selectedCode}\n\`\`\``, "gcode");
    onClose();
  };

  const handleDebug = () => {
    showWithQuestion(
      `Debug this G-code and identify any issues or optimizations: \n\`\`\`\n${selectedCode}\n\`\`\``,
      "gcode"
    );
    onClose();
  };

  const handleOptimize = () => {
    showWithQuestion(`Optimize this G-code to make it more efficient: \n\`\`\`\n${selectedCode}\n\`\`\``, "gcode");
    onClose();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.9, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: -10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute z-50 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 shadow-2xl rounded-xl border border-gray-200 dark:border-gray-600 py-2 w-56 backdrop-blur-sm"
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
            maxWidth: "calc(100vw - 20px)"
          }}
        >
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="px-4 py-3 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-b border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center space-x-2">
              <div className="p-1 bg-blue-500/20 rounded-lg">
                <Brain size={14} className="text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">AI Assistant</span>
              <Sparkles size={12} className="text-yellow-500 animate-pulse" />
            </div>
          </motion.div>

          <div className="py-2">
            <motion.button
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 }}
              whileHover={{ scale: 1.02, backgroundColor: 'rgba(59, 130, 246, 0.1)' }}
              whileTap={{ scale: 0.98 }}
              onClick={handleExplain}
              className="flex items-center w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all rounded-lg mx-2"
            >
              <div className="p-1 bg-blue-100 dark:bg-blue-900/30 rounded-lg mr-3">
                <Search size={14} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <span className="font-medium">Explain this code</span>
                <p className="text-xs text-gray-500 dark:text-gray-400">Get detailed explanations</p>
              </div>
            </motion.button>

            <motion.button
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              whileHover={{ scale: 1.02, backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
              whileTap={{ scale: 0.98 }}
              onClick={handleDebug}
              className="flex items-center w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all rounded-lg mx-2"
            >
              <div className="p-1 bg-red-100 dark:bg-red-900/30 rounded-lg mr-3">
                <Box size={14} className="text-red-600 dark:text-red-400" />
              </div>
              <div>
                <span className="font-medium">Debug this code</span>
                <p className="text-xs text-gray-500 dark:text-gray-400">Find issues & errors</p>
              </div>
            </motion.button>

            <motion.button
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 }}
              whileHover={{ scale: 1.02, backgroundColor: 'rgba(34, 197, 94, 0.1)' }}
              whileTap={{ scale: 0.98 }}
              onClick={handleOptimize}
              className="flex items-center w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all rounded-lg mx-2"
            >
              <div className="p-1 bg-green-100 dark:bg-green-900/30 rounded-lg mr-3">
                <Cpu size={14} className="text-green-600 dark:text-green-400" />
              </div>
              <div>
                <span className="font-medium">Optimize this code</span>
                <p className="text-xs text-gray-500 dark:text-gray-400">Improve performance</p>
              </div>
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default GCodeContextMenu;
