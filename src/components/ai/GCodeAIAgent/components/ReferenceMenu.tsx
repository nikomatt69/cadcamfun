// src/components/ai/GCodeAIAgent/components/ReferenceMenu.tsx
import React, { useState, useEffect, useRef } from "react";
import { Code, FileText, AtSign, Edit2, Copy } from "react-feather";

interface ReferenceMenuProps {
  onSelectReference: (refType: "selectedCode" | "currentFile" | "editSelection") => void;
  hasSelectedCode: boolean;
  selectedText?: string;
  onClose: () => void;
  onEdit?: (text: string) => void;
}

const ReferenceMenu: React.FC<ReferenceMenuProps> = ({
  onSelectReference,
  hasSelectedCode,
  selectedText,
  onClose,
  onEdit
}) => {
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // Listen for clicks outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const options = getAvailableOptions();

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(prev => (prev + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(prev => (prev - 1 + options.length) % options.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (options[activeIndex]) {
        onSelectReference(options[activeIndex].value);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // Available options based on selection state
  const getAvailableOptions = () => {
    const options: Array<{
      label: string;
      description: string;
      icon: JSX.Element;
      value: "selectedCode" | "currentFile" | "editSelection";
      disabled?: boolean;
    }> = [
      {
        label: "Current File",
        description: "Reference the current file",
        icon: <FileText size={16} className="text-blue-500" />,
        value: "currentFile"
      }
    ];

    if (hasSelectedCode) {
      options.unshift({
        label: "Selected Code",
        description: "Insert selected code block",
        icon: <Code size={16} className="text-green-500" />,
        value: "selectedCode"
      });

      options.push({
        label: "Edit Selection",
        description: "Edit only the selected code",
        icon: <Edit2 size={16} className="text-purple-500" />,
        value: "editSelection"
      });
    }

    return options;
  };

  const options = getAvailableOptions();

  return (
    <div
      ref={menuRef}
      className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-10"
      onKeyDown={handleKeyDown}
    >
      <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center">
          <AtSign size={14} className="mr-2 text-gray-500" />
          <span className="text-sm text-gray-700 dark:text-gray-300">Reference...</span>
        </div>
        {hasSelectedCode && <div className="text-xs text-gray-500">{selectedText?.length} chars selected</div>}
      </div>

      <div className="max-h-64 overflow-y-auto">
        {options.map((option, index) => (
          <div
            key={option.value}
            className={`px-3 py-2 flex items-center hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${
              index === activeIndex ? "bg-gray-100 dark:bg-gray-700" : ""
            } ${option.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            onClick={() => !option.disabled && onSelectReference(option.value)}
            onMouseEnter={() => setActiveIndex(index)}
          >
            <div className="mr-3">{option.icon}</div>
            <div className="flex-1">
              <div className="font-medium text-sm">{option.label}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{option.description}</div>
            </div>
            {option.value === "selectedCode" && <Copy size={14} className="ml-2 text-gray-400" />}
          </div>
        ))}
      </div>

      <div className="p-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex justify-between">
          <span>↑↓ to navigate</span>
          <span>↵ to select</span>
          <span>esc to close</span>
        </div>
      </div>
    </div>
  );
};

export default ReferenceMenu;
