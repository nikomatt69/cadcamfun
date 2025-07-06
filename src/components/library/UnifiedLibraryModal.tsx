// src/components/library/UnifiedLibraryModal.tsx
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "react-feather";
import LibraryManager from "@/src/components/library/LibraryManager";
import { ComponentLibraryItem, MaterialLibraryItem, ToolLibraryItem } from "@/src/hooks/useUnifiedLibrary";

interface UnifiedLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectComponent?: (component: ComponentLibraryItem) => void;
  onSelectMaterial?: (material: MaterialLibraryItem) => void;
  onSelectTool?: (tool: ToolLibraryItem) => void;
  defaultTab?: "components" | "materials" | "tools";
}

const UnifiedLibraryModal: React.FC<UnifiedLibraryModalProps> = ({
  isOpen,
  onClose,
  onSelectComponent,
  onSelectMaterial,
  onSelectTool,
  defaultTab = "components"
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ 
                type: "spring", 
                duration: 0.5,
                bounce: 0.3 
              }}
              className="w-full max-w-6xl h-[85vh] flex flex-col pointer-events-auto"
            >
              {/* Holographic Container */}
              <div className="relative w-full h-full">
                {/* Holographic Background */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-50/90 via-white/95 to-purple-50/90 dark:from-gray-900/95 dark:via-gray-800/95 dark:to-blue-900/90 backdrop-blur-xl shadow-2xl border border-white/20 dark:border-gray-700/30">
                  {/* Animated Gradient Overlay */}
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-400/10 via-purple-400/10 to-pink-400/10 animate-pulse" />
                  
                  {/* Shimmer Effect */}
                  <div className="absolute inset-0 rounded-2xl overflow-hidden">
                    <div className="absolute -inset-10 opacity-30">
                      <div className="absolute inset-0 translate-x-[-100%] animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-45deg]" />
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="relative z-10 w-full h-full flex flex-col">
                  {/* Header */}
                  <motion.div 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="p-6 border-b border-white/20 dark:border-gray-700/30 flex justify-between items-center"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
                        Unified Library
                      </h2>
                      <div className="px-3 py-1 rounded-full bg-blue-100/80 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-medium">
                        Advanced
                      </div>
                    </div>
                    
                    <motion.button
                      whileHover={{ 
                        scale: 1.05,
                        backgroundColor: "rgba(239, 68, 68, 0.1)" 
                      }}
                      whileTap={{ scale: 0.95 }}
                      onClick={onClose}
                      className="p-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors duration-200 backdrop-blur-sm border border-transparent hover:border-red-200 dark:hover:border-red-800"
                    >
                      <X size={20} />
                    </motion.button>
                  </motion.div>

                  {/* Library Content */}
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="flex-1 overflow-hidden"
                  >
                    <LibraryManager
                      onSelectComponent={onSelectComponent}
                      onSelectMaterial={onSelectMaterial}
                      onSelectTool={onSelectTool}
                      defaultTab={defaultTab}
                      showCloseButton={false}
                    />
                  </motion.div>
                </div>

                {/* Corner Decorations */}
                <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-blue-400/30 rounded-tl-lg" />
                <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-purple-400/30 rounded-tr-lg" />
                <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-green-400/30 rounded-bl-lg" />
                <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-pink-400/30 rounded-br-lg" />
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

// Add shimmer keyframes to global CSS or add to tailwind config
const styles = `
@keyframes shimmer {
  0% { transform: translateX(-100%) skewX(-45deg); }
  100% { transform: translateX(200%) skewX(-45deg); }
}
`;

export default UnifiedLibraryModal;
