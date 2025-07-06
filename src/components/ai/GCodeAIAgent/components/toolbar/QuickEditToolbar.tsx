import React from "react";
import { Zap, HelpCircle, Edit } from "react-feather";
import QuickEditButton from "./QuickEditButton";

interface QuickEditToolbarProps {
  onQuickEdit: () => void;
  onExplain: () => void;
  onOptimize: () => void;
}

const QuickEditToolbar: React.FC<QuickEditToolbarProps> = ({ onQuickEdit, onExplain, onOptimize }) => {
  return (
    <div className="absolute bg-gray-800 rounded-md shadow-lg flex overflow-hidden border border-gray-700 z-20">
      <button
        onClick={onQuickEdit}
        className="p-2 hover:bg-gray-700 text-gray-300 hover:text-white flex items-center"
        title="Edit"
      >
        <Edit size={16} className="mr-1" />
        <span className="text-xs">Edit</span>
      </button>

      <button
        onClick={onExplain}
        className="p-2 hover:bg-gray-700 text-gray-300 hover:text-white flex items-center"
        title="Explain Code"
      >
        <HelpCircle size={16} className="mr-1" />
        <span className="text-xs">Explain</span>
      </button>

      <button
        onClick={onOptimize}
        className="p-2 hover:bg-gray-700 text-gray-300 hover:text-white flex items-center"
        title="Optimize Code"
      >
        <Zap size={16} className="mr-1" />
        <span className="text-xs">Optimize</span>
      </button>
    </div>
  );
};

export default QuickEditToolbar;
