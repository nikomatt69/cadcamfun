// src/components/library/ToolsLibraryView.tsx
import React from "react";
import { motion } from "framer-motion";
import UnifiedLibrary from "./UnifiedLibrary";
import { ToolLibraryItem, LibrarySource } from "@/src/hooks/useUnifiedLibrary";
import { useLocalToolsLibraryStore } from "@/src/store/localToolsLibraryStore";
import toast from "react-hot-toast";

interface ToolsLibraryViewProps {
  onSelectTool?: (tool: ToolLibraryItem) => void;
  onClose?: () => void;
  showCloseButton?: boolean;
  initialSource?: LibrarySource;
}

export default function ToolsLibraryView({
  onSelectTool,
  onClose,
  showCloseButton = false,
  initialSource = "api"
}: ToolsLibraryViewProps) {
  // Get access to local library store
  const toolsStore = useLocalToolsLibraryStore();

  // Handle saving tool to local library
  const handleSaveTool = (tool: ToolLibraryItem) => {
    try {
      // Convert to local format
      const localTool = {
        name: tool.name,
        type: tool.type || "endmill",
        diameter: tool.diameter || 6,
        material: tool.material || "HSS",
        numberOfFlutes: tool.numberOfFlutes || 2,
        maxRPM: tool.maxRPM || 10000,
        coolantType: tool.coolantType || "none",
        cuttingLength: tool.cuttingLength || 0,
        totalLength: tool.totalLength || 0,
        shankDiameter: tool.shankDiameter || 0,
        notes: tool.notes || "",
        tags: tool.tags || []
      };

      // Save to local library
      toolsStore.addTool(localTool);

      // Show enhanced toast notification with green theme
      toast.success(
        `"${tool.name}" has been saved to your local library.`,
        {
          duration: 4000,
          position: 'top-right',
          style: {
            background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
            color: 'white',
            borderRadius: '16px',
            padding: '16px 20px',
            fontSize: '14px',
            fontWeight: '500',
            boxShadow: '0 20px 40px rgba(16, 185, 129, 0.3), 0 0 0 1px rgba(255,255,255,0.1)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.1)',
          },
          iconTheme: {
            primary: '#fff',
            secondary: '#10b981',
          },
        }
      );
    } catch (error) {
      console.error("Failed to save tool to local library:", error);
      
      // Show error toast
      toast.error(
        "Could not save tool to local library. Please try again.",
        {
          duration: 4000,
          position: 'top-right',
          style: {
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            color: 'white',
            borderRadius: '16px',
            padding: '16px 20px',
            fontSize: '14px',
            fontWeight: '500',
            boxShadow: '0 20px 40px rgba(239, 68, 68, 0.3), 0 0 0 1px rgba(255,255,255,0.1)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.1)',
          },
        }
      );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="h-full relative overflow-hidden"
    >
      {/* Animated Background */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          animate={{ 
            scale: [1, 1.1, 1],
            rotate: [0, -2, 0],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{ 
            duration: 9,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute top-10 right-10 w-32 h-32 rounded-full bg-gradient-to-br from-green-400/10 to-green-600/10 blur-2xl"
        />
        <motion.div
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, 4, 0],
            opacity: [0.2, 0.4, 0.2]
          }}
          transition={{ 
            duration: 13,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute bottom-16 left-16 w-24 h-24 rounded-full bg-gradient-to-br from-green-300/10 to-emerald-400/10 blur-2xl"
        />
      </div>

      <UnifiedLibrary<ToolLibraryItem>
        entityType="tools"
        onSelectItem={onSelectTool}
        onSaveItem={handleSaveTool}
        onClose={onClose}
        showCloseButton={showCloseButton}
        initialSource={initialSource}
      />
    </motion.div>
  );
}
