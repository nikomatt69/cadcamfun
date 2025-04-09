import { Point } from 'src/store/elementsStore';

// Define snap types
export enum SnapType {
  GRID = 'grid',
  ENDPOINT = 'endpoint',
  MIDPOINT = 'midpoint',
  INTERSECTION = 'intersection',
  CENTER = 'center',
  QUADRANT = 'quadrant',
  NEAREST = 'nearest'
}

interface SnapSettings {
  enabled: boolean;
  types: Record<SnapType, boolean>;
  gridSize: number;
  tolerance: number;
}

interface SnapPoint {
  x: number;
  y: number;
  z: number;
  type: SnapType;
  source?: any; // Reference to the element that provided this snap point
}

/**
 * Snap a point to the nearest valid snap location based on current settings and scene elements
 */
export function snapPoint(
  point: Point,
  elements: any[],
  settings: SnapSettings
): SnapPoint {
  if (!settings.enabled) {
    return { ...point, type: SnapType.NEAREST };
  }
  
  const snapPoints: SnapPoint[] = [];
  
  // Add grid snap points
  if (settings.types[SnapType.GRID]) {
    const gridPoint = snapToGrid(point, settings.gridSize);
    snapPoints.push({ ...gridPoint, type: SnapType.GRID });
  }
  
  // Collect snap points from elements
  elements.forEach(element => {
    const elementSnapPoints = getElementSnapPoints(element, settings);
    snapPoints.push(...elementSnapPoints);
  });
  
  // Find the closest snap point
  const closestPoint = findClosestPoint(point, snapPoints, settings.tolerance);
  
  if (closestPoint) {
    return closestPoint;
  }
  
  // If no snap point is found within tolerance, return the original point
  return { ...point, type: SnapType.NEAREST };
}

/**
 * Snap a point to the grid
 */
function snapToGrid(point: Point, gridSize: number): Point {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
    z: Math.round(point.z / gridSize) * gridSize
  };
}

/**
 * Get all snap points for a given element based on enabled snap types
 */
function getElementSnapPoints(element: any, settings: SnapSettings): SnapPoint[] {
  const snapPoints: SnapPoint[] = [];
  
  switch (element.type) {
    case 'line':
      if (settings.types[SnapType.ENDPOINT]) {
        // Add endpoints
        snapPoints.push({ 
          x: element.x1, 
          y: element.y1, 
          z: element.z1 || 0, 
          type: SnapType.ENDPOINT,
          source: element
        });
        snapPoints.push({ 
          x: element.x2, 
          y: element.y2, 
          z: element.z2 || 0, 
          type: SnapType.ENDPOINT,
          source: element
        });
      }
      
      if (settings.types[SnapType.MIDPOINT]) {
        // Add midpoint
        snapPoints.push({ 
          x: (element.x1 + element.x2) / 2, 
          y: (element.y1 + element.y2) / 2, 
          z: ((element.z1 || 0) + (element.z2 || 0)) / 2, 
          type: SnapType.MIDPOINT,
          source: element
        });
      }
      break;
      
    case 'circle':
      if (settings.types[SnapType.CENTER]) {
        // Add center
        snapPoints.push({ 
          x: element.x, 
          y: element.y, 
          z: element.z || 0, 
          type: SnapType.CENTER,
          source: element
        });
      }
      
      if (settings.types[SnapType.QUADRANT]) {
        // Add quadrant points
        snapPoints.push({ 
          x: element.x + element.radius, 
          y: element.y, 
          z: element.z || 0, 
          type: SnapType.QUADRANT,
          source: element
        });
        snapPoints.push({ 
          x: element.x, 
          y: element.y + element.radius, 
          z: element.z || 0, 
          type: SnapType.QUADRANT,
          source: element
        });
        snapPoints.push({ 
          x: element.x - element.radius, 
          y: element.y, 
          z: element.z || 0, 
          type: SnapType.QUADRANT,
          source: element
        });
        snapPoints.push({ 
          x: element.x, 
          y: element.y - element.radius, 
          z: element.z || 0, 
          type: SnapType.QUADRANT,
          source: element
        });
      }
      break;
      
    case 'rectangle':
      if (settings.types[SnapType.CENTER]) {
        // Add center
        snapPoints.push({ 
          x: element.x, 
          y: element.y, 
          z: element.z || 0, 
          type: SnapType.CENTER,
          source: element
        });
      }
      
      if (settings.types[SnapType.ENDPOINT]) {
        // Add corners
        const halfWidth = element.width / 2;
        const halfHeight = element.height / 2;
        
        snapPoints.push({ 
          x: element.x - halfWidth, 
          y: element.y - halfHeight, 
          z: element.z || 0, 
          type: SnapType.ENDPOINT,
          source: element
        });
        snapPoints.push({ 
          x: element.x + halfWidth, 
          y: element.y - halfHeight, 
          z: element.z || 0, 
          type: SnapType.ENDPOINT,
          source: element
        });
        snapPoints.push({ 
          x: element.x + halfWidth, 
          y: element.y + halfHeight, 
          z: element.z || 0, 
          type: SnapType.ENDPOINT,
          source: element
        });
        snapPoints.push({ 
          x: element.x - halfWidth, 
          y: element.y + halfHeight, 
          z: element.z || 0, 
          type: SnapType.ENDPOINT,
          source: element
        });
      }
      
      if (settings.types[SnapType.MIDPOINT]) {
        // Add midpoints of sides
        const halfWidth = element.width / 2;
        const halfHeight = element.height / 2;
        
        snapPoints.push({ 
          x: element.x, 
          y: element.y - halfHeight, 
          z: element.z || 0, 
          type: SnapType.MIDPOINT,
          source: element
        });
        snapPoints.push({ 
          x: element.x + halfWidth, 
          y: element.y, 
          z: element.z || 0, 
          type: SnapType.MIDPOINT,
          source: element
        });
        snapPoints.push({ 
          x: element.x, 
          y: element.y + halfHeight, 
          z: element.z || 0, 
          type: SnapType.MIDPOINT,
          source: element
        });
        snapPoints.push({ 
          x: element.x - halfWidth, 
          y: element.y, 
          z: element.z || 0, 
          type: SnapType.MIDPOINT,
          source: element
        });
      }
      break;
      
    // Additional cases for 3D elements like cube and sphere...
  }
  
  return snapPoints;
}

/**
 * Find the closest snap point to a given position
 */
function findClosestPoint(
  point: Point,
  snapPoints: SnapPoint[],
  tolerance: number
): SnapPoint | null {
  if (snapPoints.length === 0) {
    return null;
  }
  
  let closestPoint: SnapPoint | null = null;
  let minDistance = Infinity;
  
  snapPoints.forEach(snapPoint => {
    const distance = Math.sqrt(
      Math.pow(snapPoint.x - point.x, 2) +
      Math.pow(snapPoint.y - point.y, 2) +
      Math.pow(snapPoint.z - point.z, 2)
    );
    
    if (distance < minDistance && distance <= tolerance) {
      minDistance = distance;
      closestPoint = snapPoint;
    }
  });
  
  return closestPoint;
}