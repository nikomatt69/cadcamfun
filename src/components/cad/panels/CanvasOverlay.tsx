// src/components/cad/CanvasOverlay.tsx
import React from 'react';
import * as THREE from 'three';
import { useElementsStore } from 'src/store/elementsStore';
import { useCADStore } from 'src/store/cadStore';

interface CanvasOverlayProps {
  activeTool: string;
  measurementPoints: THREE.Vector3[];
  measurementActive: boolean;
}

const CanvasOverlay: React.FC<CanvasOverlayProps> = ({
  activeTool,
  measurementPoints,
  measurementActive
}) => {
  const { mousePosition } = useElementsStore();
  const { viewMode } = useCADStore();
  
  // Calculate measurement distance
  const measurementDistance = React.useMemo(() => {
    if (measurementPoints.length !== 2) return null;
    
    const [p1, p2] = measurementPoints;
    const distance = p1.distanceTo(p2);
    return distance.toFixed(2);
  }, [measurementPoints]);
  
  // Format tooltip based on active tool
  const getToolTip = () => {
    switch (activeTool) {
      case 'select':
        return 'Click to select objects, drag to move';
      case 'line':
        return 'Click to set start point, click again to finish line';
      case 'rectangle':
        return 'Click to set first corner, click again to finish rectangle';
      case 'circle':
        return 'Click to set center, click again to set radius';
      case 'arc':
        return 'Click to set center, then start point, then end point';
      case 'polygon':
        return 'Click to set points, right-click or press ESC to finish';
      case 'measure':
        return measurementActive 
          ? measurementPoints.length === 0 
            ? 'Click to set first point' 
            : 'Click to set second point' 
          : 'Click to start measurement';
      case 'cube':
        return 'Click to set first corner, click again to finish cube';
      case 'sphere':
        return 'Click to set center, click again to set radius';
      case 'cylinder':
        return 'Click to set center, click again to set radius';
      case 'cone':
        return 'Click to set center, click again to set radius';
      case 'torus':
        return 'Click to set center, click again to set radius';
      default:
        return '';
    }
  };
  
  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Coordinate display in bottom left */}
      <div className="absolute bottom-4 left-4 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-xs font-mono">
        X: {mousePosition?.x.toFixed(2) || '0.00'} 
        Y: {mousePosition?.y.toFixed(2) || '0.00'} 
        Z: {mousePosition?.z.toFixed(2) || '0.00'}
      </div>
      
      {/* Tool info in top center */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-70 text-white px-3 py-1.5 rounded text-sm">
        {activeTool.charAt(0).toUpperCase() + activeTool.slice(1)} Tool
        {getToolTip() && <span className="ml-2 text-gray-300 text-xs">— {getToolTip()}</span>}
      </div>
      
      {/* View mode indicator */}
      <div className="absolute top-4 right-4 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-xs">
        {viewMode.toUpperCase()} View
      </div>
      
      {/* Measurement display */}
      {measurementActive && measurementPoints.length === 2 && measurementDistance && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-blue-600 bg-opacity-90 text-white px-3 py-2 rounded-lg text-sm font-medium">
          Distance: {measurementDistance} units
        </div>
      )}
      
      {/* Keyboard shortcuts help */}
      <div className="absolute bottom-4 right-20 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-xs">
        <span className="mr-2">ESC - Cancel</span>
        <span className="mr-2">DEL - Delete</span>
        <span>SHIFT - Multi-select</span>
      </div>
    </div>
  );
};

export default CanvasOverlay;
