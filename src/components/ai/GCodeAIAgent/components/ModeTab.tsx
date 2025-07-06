// src/components/ai/GCodeAIAgent/components/ModeTab.tsx
import React from "react";
import { AIAgentMode } from "../GCodeAIAgent";

export interface ModeTabProps {
  mode: AIAgentMode;
  activeMode: AIAgentMode;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

const ModeTab: React.FC<ModeTabProps> = ({ mode, activeMode, onClick, icon, label }) => {
  return (
    <button
      className={`flex-1 py-3 px-3 flex items-center justify-center text-sm font-medium transition-all duration-200 backdrop-blur-sm border-b-2 ${
        activeMode === mode
          ? "bg-white/70 dark:bg-gray-700/70 text-blue-600 dark:text-blue-400 border-blue-500 shadow-sm"
          : "text-gray-600 dark:text-gray-400 hover:bg-white/30 dark:hover:bg-gray-700/30 hover:text-gray-700 dark:hover:text-gray-300 border-transparent"
      }`}
      onClick={onClick}
    >
      <div className="mr-2">{icon}</div>
      <span>{label}</span>
    </button>
  );
};

export default ModeTab;
