import React from 'react';
import { X, Clock, TrendingUp, Tool, Box, Sliders } from 'react-feather';
import { ToolpathSegment } from '@/src/hooks/useToolpathVisualization';

interface ToolPathInfoPanelProps {
  toolpathSegments: ToolpathSegment[];
  statistics: {
    triangleCount: number;
    objectCount: number;
    fps: number;
    memoryUsage: number;
    timeRemaining: string;
  };
  selectedTool: string | null;
  workpiece: any; // Type from CAD store
  onClose: () => void;
}

/**
 * Panel that displays detailed information about the current toolpath
 */
export const ToolPathInfoPanel: React.FC<ToolPathInfoPanelProps> = ({
  toolpathSegments,
  statistics,
  selectedTool,
  workpiece,
  onClose
}) => {
  // Calculate total toolpath length
  const calculateTotalLength = () => {
    let totalLength = 0;
    
    toolpathSegments.forEach(segment => {
      const points = segment.points;
      
      for (let i = 1; i < points.length; i++) {
        const p1 = points[i - 1];
        const p2 = points[i];
        
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dz = p2.z - p1.z;
        
        totalLength += Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
    });
    
    return totalLength.toFixed(2);
  };
  
  // Calculate estimated machining time
  const calculateEstimatedTime = () => {
    let totalTime = 0;
    
    toolpathSegments.forEach(segment => {
      const points = segment.points;
      
      for (let i = 1; i < points.length; i++) {
        const p1 = points[i - 1];
        const p2 = points[i];
        
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dz = p2.z - p1.z;
        
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const feedrate = p2.feedrate || p1.feedrate || 1000; // mm/min
        
        // Time = Distance / Feedrate (in minutes)
        const moveTime = distance / feedrate;
        totalTime += moveTime;
      }
    });
    
    // Format time in minutes and seconds
    const totalMinutes = Math.floor(totalTime);
    const totalSeconds = Math.round((totalTime - totalMinutes) * 60);
    
    return `${totalMinutes}m ${totalSeconds}s`;
  };
  
  // Count rapid movements
  const countRapidMoves = () => {
    let rapidCount = 0;
    
    toolpathSegments.forEach(segment => {
      segment.points.forEach(point => {
        if (point.isRapid || point.type === 'G0') {
          rapidCount++;
        }
      });
    });
    
    return rapidCount;
  };
  
  // Count cutting movements
  const countCuttingMoves = () => {
    let cuttingCount = 0;
    
    toolpathSegments.forEach(segment => {
      segment.points.forEach(point => {
        if (!point.isRapid && point.type !== 'G0') {
          cuttingCount++;
        }
      });
    });
    
    return cuttingCount;
  };
  
  // Get minimum and maximum Z values
  const getZRange = () => {
    let minZ = Infinity;
    let maxZ = -Infinity;
    
    toolpathSegments.forEach(segment => {
      segment.points.forEach(point => {
        minZ = Math.min(minZ, point.z);
        maxZ = Math.max(maxZ, point.z);
      });
    });
    
    return { minZ: minZ.toFixed(2), maxZ: maxZ.toFixed(2) };
  };
  
  const zRange = getZRange();
  
  return (
    <div className="text-white">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium">Toolpath Information</h3>
        <button 
          className="p-1 rounded-md hover:bg-gray-700"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
      
      <div className="space-y-6">
        {/* Toolpath Overview */}
        <section>
          <h4 className="text-sm font-medium text-blue-400 mb-2 flex items-center">
            <TrendingUp size={16} className="mr-1" /> 
            Toolpath Overview
          </h4>
          
          <div className="bg-gray-700 p-3 rounded space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-300">Total Points:</span>
              <span className="font-medium">
                {toolpathSegments.reduce((sum, segment) => sum + segment.points.length, 0)}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-300">Total Length:</span>
              <span className="font-medium">{calculateTotalLength()} mm</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-300">Z Range:</span>
              <span className="font-medium">{zRange.minZ} to {zRange.maxZ} mm</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-300">Rapid Moves:</span>
              <span className="font-medium">{countRapidMoves()}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-300">Cutting Moves:</span>
              <span className="font-medium">{countCuttingMoves()}</span>
            </div>
          </div>
        </section>
        
        {/* Time Estimation */}
        <section>
          <h4 className="text-sm font-medium text-blue-400 mb-2 flex items-center">
            <Clock size={16} className="mr-1" /> 
            Time Estimation
          </h4>
          
          <div className="bg-gray-700 p-3 rounded space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-300">Estimated Time:</span>
              <span className="font-medium">{calculateEstimatedTime()}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-300">Remaining:</span>
              <span className="font-medium">{statistics.timeRemaining}</span>
            </div>
          </div>
        </section>
        
        {/* Tool Information */}
        {selectedTool && (
          <section>
            <h4 className="text-sm font-medium text-blue-400 mb-2 flex items-center">
              <Tool size={16} className="mr-1" /> 
              Tool Information
            </h4>
            
            <div className="bg-gray-700 p-3 rounded space-y-2 text-sm">
              <div className="font-medium">{selectedTool}</div>
            </div>
          </section>
        )}
        
        {/* Workpiece Information */}
        {workpiece && (
          <section>
            <h4 className="text-sm font-medium text-blue-400 mb-2 flex items-center">
              <Box size={16} className="mr-1" /> 
              Workpiece
            </h4>
            
            <div className="bg-gray-700 p-3 rounded space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-300">Material:</span>
                <span className="font-medium capitalize">{workpiece.material || 'Unknown'}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-300">Dimensions:</span>
                <span className="font-medium">
                  {workpiece.width} × {workpiece.height} × {workpiece.depth} {workpiece.units}
                </span>
              </div>
            </div>
          </section>
        )}
        
        {/* Performance Stats */}
        <section>
          <h4 className="text-sm font-medium text-blue-400 mb-2 flex items-center">
            <Sliders size={16} className="mr-1" /> 
            Performance
          </h4>
          
          <div className="bg-gray-700 p-3 rounded space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-300">FPS:</span>
              <span className="font-medium">{statistics.fps}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-300">Triangles:</span>
              <span className="font-medium">{statistics.triangleCount.toLocaleString()}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-300">Objects:</span>
              <span className="font-medium">{statistics.objectCount}</span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-300">Memory:</span>
              <span className="font-medium">{statistics.memoryUsage} MB</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
