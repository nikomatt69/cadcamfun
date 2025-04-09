import React, { useState, useRef, useEffect } from 'react';
import { Square, Layers, Sun, Eye } from 'react-feather';

interface ViewModeSelectorProps {
  currentMode: 'realistic' | 'shaded' | 'wireframe' | 'x-ray';
  onChange: (mode: 'realistic' | 'shaded' | 'wireframe' | 'x-ray') => void;
}

/**
 * Dropdown selector for different view rendering modes
 */
export const ViewModeSelector: React.FC<ViewModeSelectorProps> = ({
  currentMode,
  onChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Close the dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // Get icon and label for current mode
  const getModeInfo = (mode: 'realistic' | 'shaded' | 'wireframe' | 'x-ray') => {
    switch (mode) {
      case 'realistic':
        return { Icon: Sun, label: 'Realistic' };
      case 'shaded':
        return { Icon: Layers, label: 'Shaded' };
      case 'wireframe':
        return { Icon: Square, label: 'Wireframe' };
      case 'x-ray':
        return { Icon: Eye, label: 'X-Ray' };
    }
  };
  
  const { Icon, label } = getModeInfo(currentMode);
  
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        className="flex items-center space-x-1 p-1.5 rounded-md hover:bg-gray-700 focus:outline-none"
        onClick={() => setIsOpen(!isOpen)}
        title="View Mode"
      >
        <Icon size={18} />
        <span className="text-xs hidden md:inline">{label}</span>
      </button>
      
      {isOpen && (
        <div className="absolute right-0 mt-1 w-40 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-20">
          <div className="p-1">
            {(['realistic', 'shaded', 'wireframe', 'x-ray'] as const).map((mode) => {
              const { Icon, label } = getModeInfo(mode);
              return (
                <button
                  key={mode}
                  className={`w-full flex items-center px-3 py-2 text-sm rounded-md ${
                    currentMode === mode
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-700'
                  }`}
                  onClick={() => {
                    onChange(mode);
                    setIsOpen(false);
                  }}
                >
                  <Icon size={16} className="mr-2" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
