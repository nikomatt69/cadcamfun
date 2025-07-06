// src/components/ai/GCodeAIAgent/components/CommandMenu.tsx
import React, { useState, useEffect, useRef } from "react";
import { HelpCircle, Settings, Search, Zap, Code, MessageCircle, Wind, X } from "react-feather";
import { Command } from "lucide-react";

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

  // Command options
  const commands: CommandOption[] = [
    {
      command: "/help",
      label: "Help",
      description: "Show available commands",
      icon: <HelpCircle size={16} className="text-blue-500" />
    },
    {
      command: "/normal",
      label: "Normal Mode",
      description: "Switch to normal chat mode",
      icon: <MessageCircle size={16} className="text-gray-500" />
    },
    {
      command: "/gather",
      label: "Gather Mode",
      description: "AI will ask more questions to understand context",
      icon: <Search size={16} className="text-purple-500" />
    },
    {
      command: "/agent",
      label: "Agent Mode",
      description: "AI can perform actions on G-code",
      icon: <Wind size={16} className="text-green-500" />
    },
    {
      command: "/analyze",
      label: "Analyze G-code",
      description: "Find issues in your G-code",
      icon: <Search size={16} className="text-yellow-500" />
    },
    {
      command: "/optimize",
      label: "Optimize G-code",
      description: "Improve selected G-code",
      icon: <Zap size={16} className="text-amber-500" />
    },
    {
      command: "/generate",
      label: "Generate G-code",
      description: "Create G-code from description",
      icon: <Code size={16} className="text-indigo-500" />
    },
    {
      command: "/explain",
      label: "Explain G-code",
      description: "Get explanation of selected code",
      icon: <HelpCircle size={16} className="text-green-500" />
    },
    {
      command: "/clear",
      label: "Clear History",
      description: "Clear chat history",
      icon: <X size={16} className="text-red-500" />
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
          placeholder="Search commands..."
          className="w-full bg-transparent border-none outline-none text-sm"
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
                <div className="font-medium text-sm">{cmd.label}</div>
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
