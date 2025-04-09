// src/hooks/useSnap.ts

import { useState, useEffect } from 'react';
import { useCADStore } from '../store/cadStore';
import { useElementsStore } from '../store/elementsStore';
import { defaultSnapSettings, snapPoint, SnapType } from '../lib/enanchedSnapService';
;

export interface SnapIndicator {
  x: number;
  y: number;
  z: number
  type: SnapType;
  visible: boolean;
}

export interface UseSnapReturn {
  snapSettings: typeof defaultSnapSettings;
  updateSnapSettings: (update: Partial<typeof defaultSnapSettings>) => void;
  toggleSnapType: (type: SnapType) => void;
  snapToPoint: (point: { x: number; y: number; z?: number }) => { x: number; y: number; z: number };
  snapIndicator: SnapIndicator;
  isSnapping: boolean;
}

export function useSnap(): UseSnapReturn {
  const { elements } = useElementsStore();
  const [settings, setSettings] = useState(defaultSnapSettings);
  const [snapIndicator, setSnapIndicator] = useState<SnapIndicator>({
    x: 0,
    y: 0,
    z:0,
    type: SnapType.NEAREST,
    visible: false
  });
  const [isSnapping, setIsSnapping] = useState(false);

  // Update snap settings
  const updateSnapSettings = (update: Partial<typeof defaultSnapSettings>) => {
    setSettings(prev => ({
      ...prev,
      ...update,
      types: {
        ...prev.types,
        ...(update.types || {})
      }
    }));
  };

  // Toggle a specific snap type
  const toggleSnapType = (type: SnapType) => {
    setSettings(prev => ({
      ...prev,
      types: {
        ...prev.types,
        [type]: !prev.types[type]
      }
    }));
  };

  // Snap a point to the nearest valid snap location
  const snapToPoint = (point: { x: number; y: number; z?: number }) => {
    const fullPoint = {
      x: point.x,
      y: point.y,
      z: point.z || 0
    };
    
    // Use the snap service to find the snap point
    const snappedPoint = snapPoint(fullPoint, elements, settings);
    
    // Show snap indicator if we're snapping to something
    if (snappedPoint.type !== SnapType.NEAREST) {
      setSnapIndicator({
        x: snappedPoint.x,
        y: snappedPoint.y,
        z: snappedPoint.z,
        type: snappedPoint.type,
        visible: true
      });
      setIsSnapping(true);
    } else {
      setSnapIndicator(prev => ({ ...prev, visible: false }));
      setIsSnapping(false);
    }
    
    return snappedPoint;
  };

  // Hide snap indicator when settings are disabled
  useEffect(() => {
    if (!settings.enabled) {
      setSnapIndicator(prev => ({ ...prev, visible: false }));
      setIsSnapping(false);
    }
  }, [settings.enabled]);

  return {
    snapSettings: settings,
    updateSnapSettings,
    toggleSnapType,
    snapToPoint,
    snapIndicator,
    isSnapping
  };
}