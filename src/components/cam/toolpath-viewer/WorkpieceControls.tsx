import React, { useState } from 'react';
import { Eye, EyeOff, Box, Sliders, Layers, Square } from 'react-feather';

interface WorkpieceControlsProps {
  workpiece: any; // Type from CAD store
  showWorkpiece: boolean;
  onToggleWorkpiece: () => void;
  onWorkpieceOpacityChange: (opacity: number) => void;
  onWorkpieceWireframeToggle: () => void;
  showWireframe: boolean;
  opacity: number;
}

/**
 * Controls for workpiece visualization settings
 */
export const WorkpieceControls: React.FC<WorkpieceControlsProps> = ({
  workpiece,
  showWorkpiece,
  onToggleWorkpiece,
  onWorkpieceOpacityChange,
  onWorkpieceWireframeToggle,
  showWireframe,
  opacity
}) => {
  const [expanded, setExpanded] = useState(false);
  
  if (!workpiece) return null;
  
  return (
    <div className="bg-gray-800 bg-opacity-75 rounded-md text-white overflow-hidden">
      {/* Header */}
      <div 
        className="px-3 py-2 flex justify-between items-center cursor-pointer hover:bg-gray-700"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center">
          <Box size={16} className="mr-2" />
          <span className="text-sm font-medium">Workpiece</span>
        </div>
        <button
          className={`p-1 rounded-md ${showWorkpiece ? 'text-blue-400' : 'text-gray-400'}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleWorkpiece();
          }}
          title={showWorkpiece ? "Hide Workpiece" : "Show Workpiece"}
        >
          {showWorkpiece ? <Eye size={18} /> : <EyeOff size={18} />}
        </button>
      </div>
      
      {/* Expanded controls */}
      {expanded && showWorkpiece && (
        <div className="p-3 border-t border-gray-700 space-y-3">
          {/* Material and dimensions info */}
          <div className="text-xs">
            <div className="flex justify-between mb-1">
              <span className="text-gray-400">Material:</span>
              <span className="capitalize">{workpiece.material || 'Not specified'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Dimensions:</span>
              <span>{workpiece.width} × {workpiece.height} × {workpiece.depth} {workpiece.units}</span>
            </div>
          </div>
          
          {/* Opacity slider */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className="text-xs text-gray-400">Opacity</label>
              <span className="text-xs">{Math.round(opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={opacity}
              onChange={(e) => onWorkpieceOpacityChange(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-gray-600 rounded-full appearance-none cursor-pointer"
            />
          </div>
          
          {/* Wireframe toggle */}
          <div className="flex items-center justify-between">
            <label className="text-xs flex items-center">
              <Square size={14} className="mr-1.5" />
              <span className="text-gray-400">Wireframe</span>
            </label>
            <div className="relative inline-block w-10 align-middle select-none">
              <input
                type="checkbox"
                checked={showWireframe}
                onChange={onWorkpieceWireframeToggle}
                className="sr-only"
                id="wireframe-toggle"
              />
              <label
                htmlFor="wireframe-toggle"
                className={`block overflow-hidden h-6 rounded-full bg-gray-600 cursor-pointer ${
                  showWireframe ? 'bg-blue-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${
                    showWireframe ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
