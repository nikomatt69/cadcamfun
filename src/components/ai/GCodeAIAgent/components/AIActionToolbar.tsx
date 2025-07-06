import React from "react";
import { MessageCircle, Zap, Search, Code, Edit2, RefreshCw, HelpCircle, Settings, ChevronDown } from "react-feather";

interface AIActionToolbarProps {
  onAnalyze: () => void;
  onOptimize: () => void;
  onExplain: () => void;
  onQuickEdit: () => void;
  onModeChange: (mode: "chat" | "analyze" | "optimize" | "generate") => void;
  currentMode: "chat" | "analyze" | "optimize" | "generate";
  hasSelection: boolean;
  isProcessing: boolean;
}

const AIActionToolbar: React.FC<AIActionToolbarProps> = ({
  onAnalyze,
  onOptimize,
  onExplain,
  onQuickEdit,
  onModeChange,
  currentMode,
  hasSelection,
  isProcessing
}) => {
  const [showMoreActions, setShowMoreActions] = React.useState(false);

  const ActionButton = ({
    icon: Icon,
    label,
    onClick,
    active = false,
    disabled = false
  }: {
    icon: React.ElementType;
    label: string;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled || isProcessing}
      className={`
        flex items-center px-3 py-2 rounded-md text-sm
        ${
          active
            ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
            : "hover:bg-gray-100 dark:hover:bg-gray-700"
        }
        ${disabled || isProcessing ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        transition-colors duration-150
      `}
      title={label}
    >
      <span className="hidden sm:inline">{label}</span>
    </button>
  );

  return (
    <div className="flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="flex items-center space-x-1">
        <ActionButton
          icon={MessageCircle}
          label="Chat"
          onClick={() => onModeChange("chat")}
          active={currentMode === "chat"}
        />
        <ActionButton icon={Search} label="Analyze" onClick={onAnalyze} active={currentMode === "analyze"} />
        <ActionButton icon={Zap} label="Optimize" onClick={onOptimize} active={currentMode === "optimize"} />
        <ActionButton
          icon={Code}
          label="Generate"
          onClick={() => onModeChange("generate")}
          active={currentMode === "generate"}
        />
      </div>

      <div className="flex items-center space-x-1">
        {hasSelection && (
          <>
            <ActionButton icon={Edit2} label="Quick Edit" onClick={onQuickEdit} disabled={!hasSelection} />
            <ActionButton icon={HelpCircle} label="Explain" onClick={onExplain} disabled={!hasSelection} />
          </>
        )}

        <div className="relative">
          <button
            onClick={() => setShowMoreActions(!showMoreActions)}
            className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Settings size={16} />
          </button>

          {showMoreActions && (
            <div className="absolute right-0 mt-2 w-48 py-2 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-50">
              {/* Additional actions menu items */}
              <button
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => {
                  /* Handle settings */
                }}
              >
                AI Settings
              </button>
              <button
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={() => {
                  /* Handle help */
                }}
              >
                Help & Documentation
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIActionToolbar;
