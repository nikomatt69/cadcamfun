// src/components/ai/AIProcessingIndicator.tsx
import React from "react";
import { motion } from "framer-motion";
import { Cpu, Loader, AlertTriangle, CheckCircle, Eye, Code } from "react-feather";

export type AIProcessingStatus = "idle" | "processing" | "success" | "error";

interface AIProcessingIndicatorProps {
  status: AIProcessingStatus;
  message?: string;
  progress?: number; // 0-100
  showDetails?: boolean;
  className?: string;
  onRetry?: () => void;
}

/**
 * Status indicator for AI operations
 * Displays status information and progress for AI requests
 */
const AIProcessingIndicator: React.FC<AIProcessingIndicatorProps> = ({
  status,
  message,
  progress = 0,
  showDetails = false,
  className = "",
  onRetry
}) => {
  // Configuration for different states
  const statusConfig = {
    idle: {
      icon: <Cpu size={18} className="text-blue-500" />,
      color: "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800",
      textColor: "text-blue-700 dark:text-blue-300"
    },
    processing: {
      icon: <Loader size={18} className="text-blue-500 animate-spin" />,
      color: "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800",
      textColor: "text-blue-700 dark:text-blue-300"
    },
    success: {
      icon: <CheckCircle size={18} className="text-green-500" />,
      color: "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800",
      textColor: "text-green-700 dark:text-green-300"
    },
    error: {
      icon: <AlertTriangle size={18} className="text-red-500" />,
      color: "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800",
      textColor: "text-red-700 dark:text-red-300"
    }
  };

  const { icon, color, textColor } = statusConfig[status];

  // Default messages for each state
  const getDefaultMessage = (status: AIProcessingStatus): string => {
    switch (status) {
      case "idle":
        return "AI Assistant ready";
      case "processing":
        return "Processing...";
      case "success":
        return "Processing completed";
      case "error":
        return "An error occurred during processing";
    }
  };

  const displayMessage = message || getDefaultMessage(status);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`p-3 flex items-start border rounded-xl ${color} ${className}`}
    >
      <div className="mr-3 flex-shrink-0 mt-0.5">{icon}</div>
      <div className="flex-1">
        <p className={`text-sm font-medium ${textColor}`}>{displayMessage}</p>

        {/* Progress bar for "processing" state */}
        {status === "processing" && (
          <div className="mt-2 w-full bg-blue-100 dark:bg-blue-800 rounded-full h-1.5">
            <motion.div
              className="bg-blue-500 h-1.5 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        )}

        {/* "Retry" button for error state */}
        {status === "error" && onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 font-medium"
          >
            Retry
          </button>
        )}

        {/* Optional details for error state */}
        {showDetails && status === "error" && (
          <button
            className="mt-1 text-xs underline text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
            onClick={() => console.log("Show error details")}
          >
            Show details
          </button>
        )}
      </div>
    </motion.div>
  );
};

export default AIProcessingIndicator;
