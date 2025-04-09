import React from 'react';
import { DetectedCycle } from './types';
import { 
  Eye, EyeOff, Grid, Play, Pause, ChevronLeft, ChevronRight, 
  Info, X, Settings 
} from 'react-feather';

interface CyclesListProps {
  cycles: DetectedCycle[];
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  showAllCycles: boolean;
  setShowAllCycles: (show: boolean) => void;
  cyclesTooltips: boolean;
  setCyclesTooltips: (show: boolean) => void;
  onViewDetails: () => void;
  onAnimateCycle: () => void;
  onFocusCycle: (x: number, y: number, z: number) => void;
}

export const CyclesList: React.FC<CyclesListProps> = ({
  cycles,
  selectedIndex,
  setSelectedIndex,
  showAllCycles,
  setShowAllCycles,
  cyclesTooltips,
  setCyclesTooltips,
  onViewDetails,
  onAnimateCycle,
  onFocusCycle
}) => {
  if (!cycles.length) return null;
  
  return (
    <div className="absolute top-20 left-4 bg-gray-800 bg-opacity-75 text-white p-3 rounded-md z-10 max-w-xs">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-medium">Fixed Cycles ({cycles.length})</h3>
        <div className="flex items-center space-x-2">
          <button
            className={`p-1 rounded-md ${showAllCycles ? 'text-blue-400' : 'text-gray-400'}`}
            onClick={() => setShowAllCycles(!showAllCycles)}
            title={showAllCycles ? "Hide All Cycles" : "Show All Cycles"}
          >
            {showAllCycles ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
          <button
            className={`p-1 rounded-md ${cyclesTooltips ? 'text-blue-400' : 'text-gray-400'}`}
            onClick={() => setCyclesTooltips(!cyclesTooltips)}
            title={cyclesTooltips ? "Hide Tooltips" : "Show Tooltips"}
          >
            <Info size={16} />
          </button>
        </div>
      </div>
      
      <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
        {cycles.map((cycle, index) => (
          <div
            key={`cycle-${index}`}
            className={`p-2 rounded cursor-pointer text-sm flex items-center ${
              selectedIndex === index ? 'bg-blue-600' : 'hover:bg-gray-700'
            }`}
            onClick={() => {
              setSelectedIndex(index);
              // Focus camera on selected cycle
              if (cycle.params.x !== undefined && cycle.params.y !== undefined) {
                onFocusCycle(cycle.params.x, cycle.params.y, cycle.params.r || 0);
              }
            }}
          >
            <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center mr-2">
              {index + 1}
            </div>
            <div className="flex-1">
              <div className="font-medium">{cycle.type}</div>
              <div className="text-xs text-gray-300">
                X{cycle.params.x?.toFixed(1)} Y{cycle.params.y?.toFixed(1)} Z{cycle.params.z?.toFixed(1)}
              </div>
            </div>
            <div className="flex space-x-1">
              <button
                className="p-1 rounded hover:bg-gray-600"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIndex(index);
                  onViewDetails();
                }}
                title="View Details"
              >
                <Info size={14} />
              </button>
              <button
                className="p-1 rounded hover:bg-gray-600"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIndex(index);
                  onAnimateCycle();
                }}
                title="Animate Cycle"
              >
                <Play size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

interface CycleDetailsPanelProps {
  cycle: DetectedCycle;
  animationSpeed: number;
  setAnimationSpeed: (speed: number) => void;
  onClose: () => void;
  onAnimateCycle: () => void;
}

export const CycleDetailsPanel: React.FC<CycleDetailsPanelProps> = ({
  cycle,
  animationSpeed,
  setAnimationSpeed,
  onClose,
  onAnimateCycle
}) => {
  return (
    <div className="absolute bottom-20 left-4 bg-gray-800 bg-opacity-75 text-white p-3 rounded-md z-10 max-w-md">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-medium">Fixed Cycle Details</h3>
        <button 
          onClick={onClose}
          className="p-1 rounded-full hover:bg-gray-700"
        >
          <X size={18} />
        </button>
      </div>
      
      <div className="space-y-3">
        <div>
          <span className="font-medium">Type:</span> {cycle.type}
        </div>
        <div>
          <span className="font-medium">G-code:</span> 
          <pre className="mt-1 bg-gray-700 p-2 rounded text-sm overflow-x-auto">
            {cycle.gCode}
          </pre>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="font-medium">Position X:</span> {cycle.params.x}
          </div>
          <div>
            <span className="font-medium">Position Y:</span> {cycle.params.y}
          </div>
          <div>
            <span className="font-medium">Depth Z:</span> {cycle.params.z}
          </div>
          <div>
            <span className="font-medium">Plane R:</span> {cycle.params.r}
          </div>
          {cycle.params.q && (
            <div>
              <span className="font-medium">Increment Q:</span> {cycle.params.q}
            </div>
          )}
          {cycle.params.p && (
            <div>
              <span className="font-medium">Time P:</span> {cycle.params.p}s
            </div>
          )}
        </div>
      </div>
      
      <div className="mt-4 flex justify-between">
        <button
          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
          onClick={onAnimateCycle}
        >
          Animate Cycle
        </button>
        
        <div className="flex items-center space-x-2">
          <span className="text-sm">Speed:</span>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.5"
            value={animationSpeed}
            onChange={(e) => setAnimationSpeed(parseFloat(e.target.value))}
            className="w-24"
          />
        </div>
      </div>
    </div>
  );
};

interface CycleAnimationControlsProps {
  selectedIndex: number;
  cyclesCount: number;
  setSelectedIndex: (index: number) => void;
  onAnimate: () => void;
  onViewDetails: () => void;
}

export const CycleAnimationControls: React.FC<CycleAnimationControlsProps> = ({
  selectedIndex,
  cyclesCount,
  setSelectedIndex,
  onAnimate,
  onViewDetails
}) => {
  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-gray-800 bg-opacity-75 text-white py-2 px-4 rounded-md z-10 flex items-center space-x-4">
      <button
        className="p-1 rounded hover:bg-gray-700"
        onClick={() => setSelectedIndex(Math.max(0, selectedIndex - 1))}
        disabled={selectedIndex === 0}
      >
        <ChevronLeft size={18} />
      </button>
      
      <button
        className="p-2 bg-blue-600 rounded-full hover:bg-blue-700"
        onClick={onAnimate}
      >
        <Play size={16} />
      </button>
      
      <button
        className="p-1 rounded hover:bg-gray-700"
        onClick={() => setSelectedIndex(Math.min(cyclesCount - 1, selectedIndex + 1))}
        disabled={selectedIndex === cyclesCount - 1}
      >
        <ChevronRight size={18} />
      </button>
      
      <button
        className="p-1 rounded hover:bg-gray-700"
        onClick={onViewDetails}
      >
        <Info size={18} />
      </button>
    </div>
  );
};