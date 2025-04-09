import React from 'react';
import { Tool, Layers, Grid, Home, Settings, Eye, EyeOff } from 'react-feather';

interface ToolpathControlsProps {
  showGrid: boolean;
  showAxes: boolean;
  showTool: boolean;
  showWorkpiece: boolean;
  showToolpath: boolean;
  onGridToggle: () => void;
  onAxesToggle: () => void;
  onToolToggle: () => void;
  onWorkpieceToggle: () => void;
  onToolpathToggle: () => void;
  onResetView: () => void;
  onSettingsOpen: () => void;
}

/**
 * Control panel for toggling toolpath visualization options
 */
export const ToolpathControls: React.FC<ToolpathControlsProps> = ({
  showGrid,
  showAxes,
  showTool,
  showWorkpiece,
  showToolpath,
  onGridToggle,
  onAxesToggle,
  onToolToggle,
  onWorkpieceToggle,
  onToolpathToggle,
  onResetView,
  onSettingsOpen
}) => {
  return (
    <div className="flex flex-col p-2 space-y-2 bg-gray-800 bg-opacity-75 rounded-md text-white">
      <button
        className={`p-2 rounded-md flex items-center justify-center ${showGrid ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
        onClick={onGridToggle}
        title={showGrid ? "Hide Grid" : "Show Grid"}
      >
        <Grid size={18} />
      </button>
      
      <button
        className={`p-2 rounded-md flex items-center justify-center ${showAxes ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
        onClick={onAxesToggle}
        title={showAxes ? "Hide Axes" : "Show Axes"}
      >
        <span className="font-mono text-sm">XYZ</span>
      </button>
      
      <button
        className={`p-2 rounded-md flex items-center justify-center ${showTool ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
        onClick={onToolToggle}
        title={showTool ? "Hide Tool" : "Show Tool"}
      >
        <Tool size={18} />
      </button>
      
      <button
        className={`p-2 rounded-md flex items-center justify-center ${showWorkpiece ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
        onClick={onWorkpieceToggle}
        title={showWorkpiece ? "Hide Workpiece" : "Show Workpiece"}
      >
        {showWorkpiece ? <Eye size={18} /> : <EyeOff size={18} />}
      </button>
      
      <button
        className={`p-2 rounded-md flex items-center justify-center ${showToolpath ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
        onClick={onToolpathToggle}
        title={showToolpath ? "Hide Toolpath" : "Show Toolpath"}
      >
        <Layers size={18} />
      </button>
      
      <div className="border-t border-gray-600 my-1"></div>
      
      <button
        className="p-2 rounded-md flex items-center justify-center hover:bg-gray-700"
        onClick={onResetView}
        title="Reset View"
      >
        <Home size={18} />
      </button>
      
      <button
        className="p-2 rounded-md flex items-center justify-center hover:bg-gray-700"
        onClick={onSettingsOpen}
        title="Settings"
      >
        <Settings size={18} />
      </button>
    </div>
  );
};
