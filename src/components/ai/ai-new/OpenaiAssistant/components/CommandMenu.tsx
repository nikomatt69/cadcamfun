import { Brain, Hammer } from "lucide-react";
import { Ruler } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { HelpCircle, Type, Plus, Edit3, Trash, List, ExternalLink, Tool, BookOpen, Command, X } from "react-feather";

interface CommandMenuProps {
  onSelectCommand: (command: string) => void;
  onClose: () => void;
}

interface CommandOption {
  command: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const CommandMenu: React.FC<CommandMenuProps> = ({ onSelectCommand, onClose }) => {
  const [searchValue, setSearchValue] = useState<string>("");
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(prev => (prev + 1) % filteredCommands.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCommands[activeIndex]) {
        onSelectCommand(filteredCommands[activeIndex].command);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // CAD-specific command options
  const commands: CommandOption[] = [
    {
      command: "/help",
      label: "Help",
      description: "Show available commands",
      icon: <HelpCircle size={16} className="text-blue-500" />
    },
    {
      command: "/text-to-cad",
      label: "Text to CAD",
      description: "Convert text description to CAD elements",
      icon: <Type size={16} className="text-purple-500" />
    },
    {
      command: "/generate",
      label: "Generate Element",
      description: "Generate a new CAD element",
      icon: <Plus size={16} className="text-blue-500" />
    },
    {
      command: "/update",
      label: "Update Element",
      description: "Modify existing CAD elements",
      icon: <Edit3 size={16} className="text-yellow-500" />
    },
    {
      command: "/remove",
      label: "Remove Element",
      description: "Delete CAD elements",
      icon: <Trash size={16} className="text-red-500" />
    },
    {
      command: "/analyze",
      label: "Chain of Thought",
      description: "Show AI reasoning process",
      icon: <Brain size={16} className="text-pink-500" />
    },
    {
      command: "/optimize",
      label: "Optimize Design",
      description: "Get optimization suggestions",
      icon: <List size={16} className="text-orange-500" />
    },
    {
      command: "/export",
      label: "Export Project",
      description: "Export as ZIP file",
      icon: <ExternalLink size={16} className="text-fuchsia-500" />
    },
    {
      command: "/quote",
      label: "Auto Quote",
      description: "Generate price quote",
      icon: <Ruler size={16} className="text-green-500" />
    },
    {
      command: "/analyze-manufacturing",
      label: "Manufacturing Analysis",
      description: "Check manufacturing feasibility",
      icon: <Tool size={16} className="text-emerald-500" />
    },
    {
      command: "/drawings",
      label: "Technical Drawings",
      description: "Generate 2D drawings",
      icon: <BookOpen size={16} className="text-cyan-500" />
    },
    {
      command: "/simulate",
      label: "Simulate Properties",
      description: "Physical simulation",
      icon: <Hammer size={16} className="text-amber-500" />
    }
  ];

  // Filter commands based on search
  const filteredCommands = commands.filter(
    cmd =>
      cmd.command.toLowerCase().includes(searchValue.toLowerCase()) ||
      cmd.label.toLowerCase().includes(searchValue.toLowerCase()) ||
      cmd.description.toLowerCase().includes(searchValue.toLowerCase())
  );

  return (
    <div
      ref={menuRef}
      className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-10"
      onKeyDown={handleKeyDown}
    >
      <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex items-center">
        <Command size={14} className="mr-2 text-gray-500" />
        <input
          ref={inputRef}
          type="text"
          value={searchValue}
          onChange={e => {
            setSearchValue(e.target.value);
            setActiveIndex(0);
          }}
          placeholder="Type a message..."
          className="w-full bg-transparent border-none outline-none text-sm rounded-md p-0.5 dark:text-gray-300"
        />
      </div>

      <div className="max-h-64 overflow-y-auto">
        {filteredCommands.length > 0 ? (
          filteredCommands.map((cmd, index) => (
            <div
              key={cmd.command}
              className={`px-3 py-2 flex items-center hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${
                index === activeIndex ? "bg-gray-100 dark:bg-gray-700" : ""
              }`}
              onClick={() => onSelectCommand(cmd.command)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <div className="mr-3">{cmd.icon}</div>
              <div>
                <div className="font-medium text-sm dark:text-gray-200">{cmd.label}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{cmd.description}</div>
              </div>
              <div className="ml-auto text-xs text-gray-400 font-mono">{cmd.command}</div>
            </div>
          ))
        ) : (
          <div className="px-3 py-4 text-center text-gray-500 dark:text-gray-400 text-sm">No commands found</div>
        )}
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

export default CommandMenu;
