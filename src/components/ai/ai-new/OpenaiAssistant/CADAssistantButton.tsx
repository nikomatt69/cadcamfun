import React from "react";
import { Cpu } from "react-feather";

interface CADAssistantButtonProps {
  isVisible: boolean;
  toggleVisibility: () => void;
  className?: string;
}

export const CADAssistantButton: React.FC<CADAssistantButtonProps> = ({
  isVisible,
  toggleVisibility,
  className = ""
}) => {
  return (
    <button
      onClick={toggleVisibility}
      className={`p-2 rounded-lg shadow-lg z-60 transition-colors ${isVisible ? "bg-blue-700 text-white z-60" : "bg-white text-blue-700 hover:bg-blue-50"
        } ${className}`}
      title={isVisible ? "Hide CAD Assistant" : "Show CAD Assistant"}
    >
      <Cpu size={18} />
    </button>
  );
};
