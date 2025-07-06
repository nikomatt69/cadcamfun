// src/components/library/MaterialsLibraryView.tsx
import React from "react";
import { motion } from "framer-motion";
import UnifiedLibrary from "./UnifiedLibrary";
import { MaterialLibraryItem, LibrarySource } from "@/src/hooks/useUnifiedLibrary";
import { useLocalMaterialsLibraryStore } from "@/src/store/localMaterialsLibraryStore";
import toast from "react-hot-toast";

interface MaterialsLibraryViewProps {
  onSelectMaterial?: (material: MaterialLibraryItem) => void;
  onClose?: () => void;
  showCloseButton?: boolean;
  initialSource?: LibrarySource;
}

export default function MaterialsLibraryView({
  onSelectMaterial,
  onClose,
  showCloseButton = false,
  initialSource = "api"
}: MaterialsLibraryViewProps) {
  // Get access to local library store
  const materialsStore = useLocalMaterialsLibraryStore();

  // Handle saving material to local library
  const handleSaveMaterial = (material: MaterialLibraryItem) => {
    try {
      // Convert to local format
      const localMaterial = {
        name: material.name,
        description: material.description || "",
        color: material.color || "#cccccc",
 
        properties: material.properties || {},
        tags: material.tags || []
      };

      // Save to local library
      materialsStore.addMaterial(localMaterial as any);

      // Show enhanced toast notification with purple theme
      toast.success(
        `"${material.name}" has been saved to your local library.`,
        {
          duration: 4000,
          position: 'top-right',
          style: {
            background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
            color: 'white',
            borderRadius: '16px',
            padding: '16px 20px',
            fontSize: '14px',
            fontWeight: '500',
            boxShadow: '0 20px 40px rgba(168, 85, 247, 0.3), 0 0 0 1px rgba(255,255,255,0.1)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.1)',
          },
          iconTheme: {
            primary: '#fff',
            secondary: '#a855f7',
          },
        }
      );
    } catch (error) {
      console.error("Failed to save material to local library:", error);
      
      // Show error toast
      toast.error(
        "Could not save material to local library. Please try again.",
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
            rotate: [0, 3, 0],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{ 
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute top-10 right-10 w-32 h-32 rounded-full bg-gradient-to-br from-purple-400/10 to-purple-600/10 blur-2xl"
        />
        <motion.div
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, -2, 0],
            opacity: [0.2, 0.4, 0.2]
          }}
          transition={{ 
            duration: 14,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute bottom-16 left-16 w-24 h-24 rounded-full bg-gradient-to-br from-purple-300/10 to-pink-400/10 blur-2xl"
        />
      </div>

      <UnifiedLibrary<MaterialLibraryItem>
        entityType="materials"
        onSelectItem={onSelectMaterial}
        onSaveItem={handleSaveMaterial}
        onClose={onClose}
        showCloseButton={showCloseButton}
        initialSource={initialSource}
      />
    </motion.div>
  );
}
