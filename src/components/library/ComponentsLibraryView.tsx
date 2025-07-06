// src/components/library/ComponentsLibraryView.tsx
import React from "react";
import { motion } from "framer-motion";
import UnifiedLibrary from "./UnifiedLibrary";
import { ComponentLibraryItem, LibrarySource } from "@/src/hooks/useUnifiedLibrary";
import { useLocalComponentsLibraryStore } from "@/src/store/localComponentsLibraryStore";
import toast from "react-hot-toast";

interface ComponentsLibraryViewProps {
  onSelectComponent?: (component: ComponentLibraryItem) => void;
  onClose?: () => void;
  showCloseButton?: boolean;
  initialSource?: LibrarySource;
}

export default function ComponentsLibraryView({
  onSelectComponent,
  onClose,
  showCloseButton = false,
  initialSource = "api"
}: ComponentsLibraryViewProps) {
  // Get access to local library store
  const componentsStore = useLocalComponentsLibraryStore();

  // Handle saving component to local library
  const handleSaveComponent = (component: ComponentLibraryItem) => {
    try {
      // Convert to local format
      const localComponent = {
        name: component.name,
        description: component.description || "",
        type: component.type || "custom",
        data: component.data || {},
        thumbnail: component.thumbnail,
        tags: component.tags || []
      };

      // Save to local library
      componentsStore.addComponent(localComponent as any);

      // Show enhanced toast notification with blue theme
      toast.success(
        `"${component.name}" has been saved to your local library.`,
        {
          duration: 4000,
          position: 'top-right',
          style: {
            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            color: 'white',
            borderRadius: '16px',
            padding: '16px 20px',
            fontSize: '14px',
            fontWeight: '500',
            boxShadow: '0 20px 40px rgba(59, 130, 246, 0.3), 0 0 0 1px rgba(255,255,255,0.1)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.1)',
          },
          iconTheme: {
            primary: '#fff',
            secondary: '#3b82f6',
          },
        }
      );
    } catch (error) {
      console.error("Failed to save component to local library:", error);
      
      // Show error toast
      toast.error(
        "Could not save component to local library. Please try again.",
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
            rotate: [0, 2, 0],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{ 
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute top-10 right-10 w-32 h-32 rounded-full bg-gradient-to-br from-blue-400/10 to-blue-600/10 blur-2xl"
        />
        <motion.div
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, -3, 0],
            opacity: [0.2, 0.4, 0.2]
          }}
          transition={{ 
            duration: 12,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute bottom-16 left-16 w-24 h-24 rounded-full bg-gradient-to-br from-blue-300/10 to-blue-500/10 blur-2xl"
        />
      </div>

      <UnifiedLibrary<ComponentLibraryItem>
        entityType="components"
        onSelectItem={onSelectComponent}
        onSaveItem={handleSaveComponent}
        onClose={onClose}
        showCloseButton={showCloseButton}
        initialSource={initialSource}
      />
    </motion.div>
  );
}
