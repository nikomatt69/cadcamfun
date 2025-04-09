// src/lib/enhancedSnapService.ts

import { Point, Element } from 'src/store/elementsStore';
import { Vector2 } from 'three';

// Define enhanced snap types
export enum SnapType {
  GRID = 'grid',
  ENDPOINT = 'endpoint',
  MIDPOINT = 'midpoint',
  INTERSECTION = 'intersection',
  CENTER = 'center',
  QUADRANT = 'quadrant',
  NEAREST = 'nearest',
  TANGENT = 'tangent',
  PERPENDICULAR = 'perpendicular',
  PARALLEL = 'parallel',
  EQUIDISTANT = 'equidistant',
  HORIZONTAL = 'horizontal',
  VERTICAL = 'vertical'
}

interface SnapSettings {
  enabled: boolean;
  types: Record<SnapType, boolean>;
  gridSize: number;
  tolerance: number;
  smartTolerance: number;
}

interface SnapPoint {
  x: number;
  y: number;
  z: number;
  type: SnapType;
  source?: Element;
  priority?: number;
}

/**
 * Snap a point to the nearest valid snap location with intelligent snap
 */
export function snapPoint(
  point: Point,
  elements: Element[],
  settings: SnapSettings
): SnapPoint {
  if (!settings.enabled) {
    return { ...point, type: SnapType.NEAREST };
  }
  
  const snapPoints: SnapPoint[] = [];
  
  // Add grid snap points
  if (settings.types[SnapType.GRID]) {
    const gridPoint = snapToGrid(point, settings.gridSize);
    snapPoints.push({ ...gridPoint, type: SnapType.GRID, priority: 1 });
  }
  
  // Get active element (typically the one being created/modified)
  const activeElement = elements.find(el => el.isActive);
  
  // Collect basic snap points from elements
  elements.forEach(element => {
    // Skip active element to avoid self-snapping during editing
    if (element === activeElement) return;
    
    const elementSnapPoints = getElementSnapPoints(element, settings);
    snapPoints.push(...elementSnapPoints);
  });
  
  // Add intelligent snap points if enabled
  if (settings.types[SnapType.INTERSECTION]) {
    const intersectionPoints = findIntersectionPoints(elements, settings);
    snapPoints.push(...intersectionPoints);
  }
  
  if (settings.types[SnapType.HORIZONTAL] || settings.types[SnapType.VERTICAL]) {
    const alignmentPoints = findAlignmentPoints(point, elements, settings);
    snapPoints.push(...alignmentPoints);
  }
  
  if (settings.types[SnapType.PERPENDICULAR]) {
    const perpendicularPoints = findPerpendicularPoints(point, elements, activeElement, settings);
    snapPoints.push(...perpendicularPoints);
  }
  
  if (settings.types[SnapType.TANGENT] && activeElement) {
    const tangentPoints = findTangentPoints(point, elements, activeElement, settings);
    snapPoints.push(...tangentPoints);
  }
  
  if (settings.types[SnapType.EQUIDISTANT]) {
    const equidistantPoints = findEquidistantPoints(point, elements, settings);
    snapPoints.push(...equidistantPoints);
  }
  
  // Find the closest valid snap point, considering priority
  const closestPoint = findClosestSnapPoint(point, snapPoints, settings.tolerance);
  
  if (closestPoint) {
    return closestPoint;
  }
  
  // If no snap point is found within tolerance, return the original point
  return { ...point, type: SnapType.NEAREST };
}

/**
 * Find the closest snap point, considering both distance and priority
 */
function findClosestSnapPoint(
  point: Point,
  snapPoints: SnapPoint[],
  tolerance: number
): SnapPoint | null {
  if (snapPoints.length === 0) {
    return null;
  }
  
  let closestPoint: SnapPoint | null = null;
  let minDistance = Infinity;
  let highestPriority = 0;
  
  snapPoints.forEach(snapPoint => {
    const distance = Math.sqrt(
      Math.pow(snapPoint.x - point.x, 2) +
      Math.pow(snapPoint.y - point.y, 2) +
      Math.pow(snapPoint.z - point.z, 2)
    );
    
    const priority = snapPoint.priority || 0;
    
    // Distance is within tolerance and either closer than current closest
    // or same distance but higher priority
    if (distance <= tolerance && 
        (distance < minDistance || 
         (distance === minDistance && priority > highestPriority))) {
      minDistance = distance;
      highestPriority = priority;
      closestPoint = snapPoint;
    }
  });
  
  return closestPoint;
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
 * Get all basic snap points for a given element
 */
function getElementSnapPoints(element: Element, settings: SnapSettings): SnapPoint[] {
  const snapPoints: SnapPoint[] = [];
  
  switch (element.type) {
    case 'line':
      if (settings.types[SnapType.ENDPOINT]) {
        // Add endpoints (high priority)
        snapPoints.push({ 
          x: element.x1, 
          y: element.y1, 
          z: element.z1 || 0, 
          type: SnapType.ENDPOINT,
          source: element,
          priority: 10
        });
        snapPoints.push({ 
          x: element.x2, 
          y: element.y2, 
          z: element.z2 || 0, 
          type: SnapType.ENDPOINT,
          source: element,
          priority: 10
        });
      }
      
      if (settings.types[SnapType.MIDPOINT]) {
        // Add midpoint
        snapPoints.push({ 
          x: (element.x1 + element.x2) / 2, 
          y: (element.y1 + element.y2) / 2, 
          z: ((element.z1 || 0) + (element.z2 || 0)) / 2, 
          type: SnapType.MIDPOINT,
          source: element,
          priority: 8
        });
      }
      
      // Add points along the line for nearest snap
      if (settings.types[SnapType.NEAREST]) {
        // We could add more points here for longer lines
        // but we'll rely on the findClosestPointOnLine function
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
          source: element,
          priority: 9
        });
      }
      
      if (settings.types[SnapType.QUADRANT]) {
        // Add quadrant points
        snapPoints.push({ 
          x: element.x + element.radius, 
          y: element.y, 
          z: element.z || 0, 
          type: SnapType.QUADRANT,
          source: element,
          priority: 7
        });
        snapPoints.push({ 
          x: element.x, 
          y: element.y + element.radius, 
          z: element.z || 0, 
          type: SnapType.QUADRANT,
          source: element,
          priority: 7
        });
        snapPoints.push({ 
          x: element.x - element.radius, 
          y: element.y, 
          z: element.z || 0, 
          type: SnapType.QUADRANT,
          source: element,
          priority: 7
        });
        snapPoints.push({ 
          x: element.x, 
          y: element.y - element.radius, 
          z: element.z || 0, 
          type: SnapType.QUADRANT,
          source: element,
          priority: 7
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
          source: element,
          priority: 9
        });
      }
      
      if (settings.types[SnapType.ENDPOINT]) {
        // Add corners
        const halfWidth = element.width / 2;
        const halfHeight = element.height / 2;
        
        // If the rectangle has rotation, we need to apply it
        if (element.angle) {
          const radians = (element.angle * Math.PI) / 180;
          const cos = Math.cos(radians);
          const sin = Math.sin(radians);
          
          // Top-left corner
          const x1 = element.x - halfWidth;
          const y1 = element.y - halfHeight;
          snapPoints.push({
            x: element.x + (x1 - element.x) * cos - (y1 - element.y) * sin,
            y: element.y + (x1 - element.x) * sin + (y1 - element.y) * cos,
            z: element.z || 0,
            type: SnapType.ENDPOINT,
            source: element,
            priority: 10
          });
          
          // Top-right corner
          const x2 = element.x + halfWidth;
          const y2 = element.y - halfHeight;
          snapPoints.push({
            x: element.x + (x2 - element.x) * cos - (y2 - element.y) * sin,
            y: element.y + (x2 - element.x) * sin + (y2 - element.y) * cos,
            z: element.z || 0,
            type: SnapType.ENDPOINT,
            source: element,
            priority: 10
          });
          
          // Bottom-right corner
          const x3 = element.x + halfWidth;
          const y3 = element.y + halfHeight;
          snapPoints.push({
            x: element.x + (x3 - element.x) * cos - (y3 - element.y) * sin,
            y: element.y + (x3 - element.x) * sin + (y3 - element.y) * cos,
            z: element.z || 0,
            type: SnapType.ENDPOINT,
            source: element,
            priority: 10
          });
          
          // Bottom-left corner
          const x4 = element.x - halfWidth;
          const y4 = element.y + halfHeight;
          snapPoints.push({
            x: element.x + (x4 - element.x) * cos - (y4 - element.y) * sin,
            y: element.y + (x4 - element.x) * sin + (y4 - element.y) * cos,
            z: element.z || 0,
            type: SnapType.ENDPOINT,
            source: element,
            priority: 10
          });
        } else {
          // Without rotation, the corners are simpler
          snapPoints.push({ 
            x: element.x - halfWidth, 
            y: element.y - halfHeight, 
            z: element.z || 0, 
            type: SnapType.ENDPOINT,
            source: element,
            priority: 10
          });
          snapPoints.push({ 
            x: element.x + halfWidth, 
            y: element.y - halfHeight, 
            z: element.z || 0, 
            type: SnapType.ENDPOINT,
            source: element,
            priority: 10
          });
          snapPoints.push({ 
            x: element.x + halfWidth, 
            y: element.y + halfHeight, 
            z: element.z || 0, 
            type: SnapType.ENDPOINT,
            source: element,
            priority: 10
          });
          snapPoints.push({ 
            x: element.x - halfWidth, 
            y: element.y + halfHeight, 
            z: element.z || 0, 
            type: SnapType.ENDPOINT,
            source: element,
            priority: 10
          });
        }
      }
      
      if (settings.types[SnapType.MIDPOINT]) {
        // Add midpoints of sides
        const halfWidth = element.width / 2;
        const halfHeight = element.height / 2;
        
        // Similar to corners, apply rotation if needed
        if (element.angle) {
          const radians = (element.angle * Math.PI) / 180;
          const cos = Math.cos(radians);
          const sin = Math.sin(radians);
          
          // Top midpoint
          const x1 = element.x;
          const y1 = element.y - halfHeight;
          snapPoints.push({
            x: element.x + (x1 - element.x) * cos - (y1 - element.y) * sin,
            y: element.y + (x1 - element.x) * sin + (y1 - element.y) * cos,
            z: element.z || 0,
            type: SnapType.MIDPOINT,
            source: element,
            priority: 8
          });
          
          // Right midpoint
          const x2 = element.x + halfWidth;
          const y2 = element.y;
          snapPoints.push({
            x: element.x + (x2 - element.x) * cos - (y2 - element.y) * sin,
            y: element.y + (x2 - element.x) * sin + (y2 - element.y) * cos,
            z: element.z || 0,
            type: SnapType.MIDPOINT,
            source: element,
            priority: 8
          });
          
          // Bottom midpoint
          const x3 = element.x;
          const y3 = element.y + halfHeight;
          snapPoints.push({
            x: element.x + (x3 - element.x) * cos - (y3 - element.y) * sin,
            y: element.y + (x3 - element.x) * sin + (y3 - element.y) * cos,
            z: element.z || 0,
            type: SnapType.MIDPOINT,
            source: element,
            priority: 8
          });
          
          // Left midpoint
          const x4 = element.x - halfWidth;
          const y4 = element.y;
          snapPoints.push({
            x: element.x + (x4 - element.x) * cos - (y4 - element.y) * sin,
            y: element.y + (x4 - element.x) * sin + (y4 - element.y) * cos,
            z: element.z || 0,
            type: SnapType.MIDPOINT,
            source: element,
            priority: 8
          });
        } else {
          snapPoints.push({ 
            x: element.x, 
            y: element.y - halfHeight, 
            z: element.z || 0, 
            type: SnapType.MIDPOINT,
            source: element,
            priority: 8
          });
          snapPoints.push({ 
            x: element.x + halfWidth, 
            y: element.y, 
            z: element.z || 0, 
            type: SnapType.MIDPOINT,
            source: element,
            priority: 8
          });
          snapPoints.push({ 
            x: element.x, 
            y: element.y + halfHeight, 
            z: element.z || 0, 
            type: SnapType.MIDPOINT,
            source: element,
            priority: 8
          });
          snapPoints.push({ 
            x: element.x - halfWidth, 
            y: element.y, 
            z: element.z || 0, 
            type: SnapType.MIDPOINT,
            source: element,
            priority: 8
          });
        }
      }
      break;
    
    // Additional cases for 3D elements like cube and sphere...
    case 'cube':
      if (settings.types[SnapType.CENTER]) {
        snapPoints.push({ 
          x: element.x, 
          y: element.y, 
          z: element.z || 0, 
          type: SnapType.CENTER,
          source: element,
          priority: 9
        });
      }
      
      if (settings.types[SnapType.ENDPOINT]) {
        // Add 8 corners of the cube
        const halfWidth = element.width / 2;
        const halfHeight = element.height / 2;
        const halfDepth = element.depth / 2;
        
        // Front face (4 corners)
        snapPoints.push({ 
          x: element.x - halfWidth, 
          y: element.y - halfHeight, 
          z: (element.z || 0) - halfDepth, 
          type: SnapType.ENDPOINT,
          source: element,
          priority: 10
        });
        snapPoints.push({ 
          x: element.x + halfWidth, 
          y: element.y - halfHeight, 
          z: (element.z || 0) - halfDepth, 
          type: SnapType.ENDPOINT,
          source: element,
          priority: 10
        });
        snapPoints.push({ 
          x: element.x + halfWidth, 
          y: element.y + halfHeight, 
          z: (element.z || 0) - halfDepth, 
          type: SnapType.ENDPOINT,
          source: element,
          priority: 10
        });
        snapPoints.push({ 
          x: element.x - halfWidth, 
          y: element.y + halfHeight, 
          z: (element.z || 0) - halfDepth, 
          type: SnapType.ENDPOINT,
          source: element,
          priority: 10
        });
        
        // Back face (4 corners)
        snapPoints.push({ 
          x: element.x - halfWidth, 
          y: element.y - halfHeight, 
          z: (element.z || 0) + halfDepth, 
          type: SnapType.ENDPOINT,
          source: element,
          priority: 10
        });
        snapPoints.push({ 
          x: element.x + halfWidth, 
          y: element.y - halfHeight, 
          z: (element.z || 0) + halfDepth, 
          type: SnapType.ENDPOINT,
          source: element,
          priority: 10
        });
        snapPoints.push({ 
          x: element.x + halfWidth, 
          y: element.y + halfHeight, 
          z: (element.z || 0) + halfDepth, 
          type: SnapType.ENDPOINT,
          source: element,
          priority: 10
        });
        snapPoints.push({ 
          x: element.x - halfWidth, 
          y: element.y + halfHeight, 
          z: (element.z || 0) + halfDepth, 
          type: SnapType.ENDPOINT,
          source: element,
          priority: 10
        });
      }
      break;
      
    case 'sphere':
      if (settings.types[SnapType.CENTER]) {
        snapPoints.push({ 
          x: element.x, 
          y: element.y, 
          z: element.z || 0, 
          type: SnapType.CENTER,
          source: element,
          priority: 9
        });
      }
      
      if (settings.types[SnapType.QUADRANT]) {
        // Add 6 points at sphere's poles and equator
        snapPoints.push({ 
          x: element.x + element.radius, 
          y: element.y, 
          z: element.z || 0, 
          type: SnapType.QUADRANT,
          source: element,
          priority: 7
        });
        snapPoints.push({ 
          x: element.x - element.radius, 
          y: element.y, 
          z: element.z || 0, 
          type: SnapType.QUADRANT,
          source: element,
          priority: 7
        });
        snapPoints.push({ 
          x: element.x, 
          y: element.y + element.radius, 
          z: element.z || 0, 
          type: SnapType.QUADRANT,
          source: element,
          priority: 7
        });
        snapPoints.push({ 
          x: element.x, 
          y: element.y - element.radius, 
          z: element.z || 0, 
          type: SnapType.QUADRANT,
          source: element,
          priority: 7
        });
        snapPoints.push({ 
          x: element.x, 
          y: element.y, 
          z: (element.z || 0) + element.radius, 
          type: SnapType.QUADRANT,
          source: element,
          priority: 7
        });
        snapPoints.push({ 
          x: element.x, 
          y: element.y, 
          z: (element.z || 0) - element.radius, 
          type: SnapType.QUADRANT,
          source: element,
          priority: 7
        });
      }
      break;
  }
  
  return snapPoints;
}

/**
 * Find the intersection points between elements
 */
function findIntersectionPoints(elements: Element[], settings: SnapSettings): SnapPoint[] {
  const snapPoints: SnapPoint[] = [];
  
  // Check all pairs of elements for intersection
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const elementA = elements[i];
      const elementB = elements[j];
      
      // Find intersections based on element types
      const intersections = findIntersectionPointsBetweenElements(elementA, elementB);
      
      // Add to snap points with high priority
      intersections.forEach(point => {
        snapPoints.push({
          ...point,
          type: SnapType.INTERSECTION,
          priority: 15 // Higher priority than endpoints
        });
      });
    }
  }
  
  return snapPoints;
}

/**
 * Find intersection points between two specific elements
 */
function findIntersectionPointsBetweenElements(elementA: Element, elementB: Element): Point[] {
  const intersections: Point[] = [];
  
  // Line-Line intersection
  if (elementA.type === 'line' && elementB.type === 'line') {
    const intersection = findLineLineIntersection(
      { x: elementA.x1, y: elementA.y1 },
      { x: elementA.x2, y: elementA.y2 },
      { x: elementB.x1, y: elementB.y1 },
      { x: elementB.x2, y: elementB.y2 }
    );
    
    if (intersection) {
      intersections.push({
        x: intersection.x,
        y: intersection.y,
        z: ((elementA.z1 || 0) + (elementA.z2 || 0) + (elementB.z1 || 0) + (elementB.z2 || 0)) / 4
      });
    }
  }
  
  // Line-Circle intersection
  else if ((elementA.type === 'line' && elementB.type === 'circle') ||
           (elementA.type === 'circle' && elementB.type === 'line')) {
    const line = elementA.type === 'line' ? elementA : elementB;
    const circle = elementA.type === 'circle' ? elementA : elementB;
    
    const lineIntersections = findLineCircleIntersections(
      { x: line.x1, y: line.y1 },
      { x: line.x2, y: line.y2 },
      { x: circle.x, y: circle.y },
      circle.radius
    );
    
    lineIntersections.forEach(point => {
      intersections.push({
        x: point.x,
        y: point.y,
        z: ((line.z1 || 0) + (line.z2 || 0) + (circle.z || 0)) / 3
      });
    });
  }
  
  // Circle-Circle intersection
  else if (elementA.type === 'circle' && elementB.type === 'circle') {
    const circleIntersections = findCircleCircleIntersections(
      { x: elementA.x, y: elementA.y },
      elementA.radius,
      { x: elementB.x, y: elementB.y },
      elementB.radius
    );
    
    circleIntersections.forEach(point => {
      intersections.push({
        x: point.x,
        y: point.y,
        z: ((elementA.z || 0) + (elementB.z || 0)) / 2
      });
    });
  }
  
  // Line-Rectangle intersection
  else if ((elementA.type === 'line' && elementB.type === 'rectangle') ||
           (elementA.type === 'rectangle' && elementB.type === 'line')) {
    const line = elementA.type === 'line' ? elementA : elementB;
    const rect = elementA.type === 'rectangle' ? elementA : elementB;
    
    const rectIntersections = findLineRectangleIntersections(
      { x: line.x1, y: line.y1 },
      { x: line.x2, y: line.y2 },
      rect
    );
    
    rectIntersections.forEach(point => {
      intersections.push({
        x: point.x,
        y: point.y,
        z: ((line.z1 || 0) + (line.z2 || 0) + (rect.z || 0)) / 3
      });
    });
  }
  
  return intersections;
}

/**
 * Find intersection point between two lines
 */
function findLineLineIntersection(
  p1: { x: number, y: number },
  p2: { x: number, y: number },
  p3: { x: number, y: number },
  p4: { x: number, y: number }
): { x: number, y: number } | null {
  // Line 1 represented as a1x + b1y = c1
  const a1 = p2.y - p1.y;
  const b1 = p1.x - p2.x;
  const c1 = a1 * p1.x + b1 * p1.y;
  
  // Line 2 represented as a2x + b2y = c2
  const a2 = p4.y - p3.y;
  const b2 = p3.x - p4.x;
  const c2 = a2 * p3.x + b2 * p3.y;
  
  const determinant = a1 * b2 - a2 * b1;
  
  // If lines are parallel, no intersection
  if (Math.abs(determinant) < 1e-10) {
    return null;
  }
  
  const x = (b2 * c1 - b1 * c2) / determinant;
  const y = (a1 * c2 - a2 * c1) / determinant;
  
  // Check if the intersection point is on both line segments
  const onLine1 = 
    (Math.min(p1.x, p2.x) <= x && x <= Math.max(p1.x, p2.x)) &&
    (Math.min(p1.y, p2.y) <= y && y <= Math.max(p1.y, p2.y));
  
  const onLine2 = 
    (Math.min(p3.x, p4.x) <= x && x <= Math.max(p3.x, p4.x)) &&
    (Math.min(p3.y, p4.y) <= y && y <= Math.max(p3.y, p4.y));
  
  // Return intersection point only if it lies on both line segments
  if (onLine1 && onLine2) {
    return { x, y };
  }
  
  return null;
}

/**
 * Find intersection points between a line and a circle
 */
function findLineCircleIntersections(
  lineStart: { x: number, y: number },
  lineEnd: { x: number, y: number },
  circleCenter: { x: number, y: number },
  radius: number
): Array<{ x: number, y: number }> {
  const intersections: Array<{ x: number, y: number }> = [];
  
  // Vector representation of the line
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  
  // Line length squared
  const lengthSquared = dx * dx + dy * dy;
  
  // Vector from circle center to line start
  const cx = circleCenter.x - lineStart.x;
  const cy = circleCenter.y - lineStart.y;
  
  // Project circle center onto line
  const projection = (cx * dx + cy * dy) / lengthSquared;
  
  // Closest point on line to circle center
  const closestX = lineStart.x + projection * dx;
  const closestY = lineStart.y + projection * dy;
  
  // Distance from circle center to closest point
  const distanceSquared = Math.pow(closestX - circleCenter.x, 2) +
                          Math.pow(closestY - circleCenter.y, 2);
  
  // Check if line intersects circle
  if (distanceSquared > radius * radius) {
    return intersections;
  }
  
  // Distance from closest point to intersection point
  const distToIntersection = Math.sqrt(radius * radius - distanceSquared);
  
  // First intersection point
  const intersection1X = closestX + (distToIntersection * dy) / Math.sqrt(lengthSquared);
  const intersection1Y = closestY - (distToIntersection * dx) / Math.sqrt(lengthSquared);
  
  // Check if intersection is on the line segment
  const onLine1 = 
    (Math.min(lineStart.x, lineEnd.x) <= intersection1X && intersection1X <= Math.max(lineStart.x, lineEnd.x)) &&
    (Math.min(lineStart.y, lineEnd.y) <= intersection1Y && intersection1Y <= Math.max(lineStart.y, lineEnd.y));
  
  if (onLine1) {
    intersections.push({ x: intersection1X, y: intersection1Y });
  }
  
  // If distance is exactly radius, there's only one intersection
  if (Math.abs(distanceSquared - radius * radius) < 1e-10) {
    return intersections;
  }
  
  // Second intersection point
  const intersection2X = closestX - (distToIntersection * dy) / Math.sqrt(lengthSquared);
  const intersection2Y = closestY + (distToIntersection * dx) / Math.sqrt(lengthSquared);
  
  // Check if second intersection is on the line segment
  const onLine2 = 
    (Math.min(lineStart.x, lineEnd.x) <= intersection2X && intersection2X <= Math.max(lineStart.x, lineEnd.x)) &&
    (Math.min(lineStart.y, lineEnd.y) <= intersection2Y && intersection2Y <= Math.max(lineStart.y, lineEnd.y));
  
  if (onLine2) {
    intersections.push({ x: intersection2X, y: intersection2Y });
  }
  
  return intersections;
}

/**
 * Find intersection points between two circles
 */
function findCircleCircleIntersections(
  center1: { x: number, y: number },
  radius1: number,
  center2: { x: number, y: number },
  radius2: number
): Array<{ x: number, y: number }> {
  const intersections: Array<{ x: number, y: number }> = [];
  
  // Distance between circle centers
  const dx = center2.x - center1.x;
  const dy = center2.y - center1.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  // Check if circles are separate, contained, or identical
  if (distance > radius1 + radius2 || distance < Math.abs(radius1 - radius2) || 
     (distance === 0 && radius1 === radius2)) {
    return intersections;
  }
  
  // Calculate intersection points
  const a = (radius1 * radius1 - radius2 * radius2 + distance * distance) / (2 * distance);
  const h = Math.sqrt(radius1 * radius1 - a * a);
  
  const pointOnLine = {
    x: center1.x + (dx * a / distance),
    y: center1.y + (dy * a / distance)
  };
  
  // First intersection
  const intersection1 = {
    x: pointOnLine.x + (h * dy / distance),
    y: pointOnLine.y - (h * dx / distance)
  };
  
  intersections.push(intersection1);
  
  // If circles are tangent, there's only one intersection
  if (distance === radius1 + radius2 || distance === Math.abs(radius1 - radius2)) {
    return intersections;
  }
  
  // Second intersection
  const intersection2 = {
    x: pointOnLine.x - (h * dy / distance),
    y: pointOnLine.y + (h * dx / distance)
  };
  
  intersections.push(intersection2);
  
  return intersections;
}

/**
 * Find intersection points between a line and a rectangle
 */
function findLineRectangleIntersections(
  lineStart: { x: number, y: number },
  lineEnd: { x: number, y: number },
  rect: Element
): Array<{ x: number, y: number }> {
  const intersections: Array<{ x: number, y: number }> = [];
  
  // Get rectangle corners
  const halfWidth = rect.width / 2;
  const halfHeight = rect.height / 2;
  
  let corners: Array<{ x: number, y: number }> = [];
  
  // Apply rotation if rectangle has angle
  if (rect.angle) {
    const radians = (rect.angle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    
    // Calculate rotated corners
    const topLeft = {
      x: rect.x + (-halfWidth * cos - -halfHeight * sin),
      y: rect.y + (-halfWidth * sin + -halfHeight * cos)
    };
    
    const topRight = {
      x: rect.x + (halfWidth * cos - -halfHeight * sin),
      y: rect.y + (halfWidth * sin + -halfHeight * cos)
    };
    
    const bottomRight = {
      x: rect.x + (halfWidth * cos - halfHeight * sin),
      y: rect.y + (halfWidth * sin + halfHeight * cos)
    };
    
    const bottomLeft = {
      x: rect.x + (-halfWidth * cos - halfHeight * sin),
      y: rect.y + (-halfWidth * sin + halfHeight * cos)
    };
    
    corners = [topLeft, topRight, bottomRight, bottomLeft];
  } else {
    // Regular rectangle corners
    corners = [
      { x: rect.x - halfWidth, y: rect.y - halfHeight },
      { x: rect.x + halfWidth, y: rect.y - halfHeight },
      { x: rect.x + halfWidth, y: rect.y + halfHeight },
      { x: rect.x - halfWidth, y: rect.y + halfHeight }
    ];
  }
  
  // Check intersection with each edge of the rectangle
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    
    const intersection = findLineLineIntersection(
      lineStart,
      lineEnd,
      corners[i],
      corners[j]
    );
    
    if (intersection) {
      intersections.push(intersection);
    }
  }
  
  return intersections;
}

/**
 * Find horizontal and vertical alignment points
 */
function findAlignmentPoints(
  point: Point,
  elements: Element[],
  settings: SnapSettings
): SnapPoint[] {
  const snapPoints: SnapPoint[] = [];
  const { tolerance } = settings;
  
  // Get significant points from all elements
  const allPoints: Point[] = [];
  
  elements.forEach(element => {
    // Collection of significant points from each element
    switch (element.type) {
      case 'line':
        allPoints.push({ x: element.x1, y: element.y1, z: element.z1 || 0 });
        allPoints.push({ x: element.x2, y: element.y2, z: element.z2 || 0 });
        break;
      
      case 'circle':
        allPoints.push({ x: element.x, y: element.y, z: element.z || 0 });
        // Quadrant points
        allPoints.push({ x: element.x + element.radius, y: element.y, z: element.z || 0 });
        allPoints.push({ x: element.x, y: element.y + element.radius, z: element.z || 0 });
        allPoints.push({ x: element.x - element.radius, y: element.y, z: element.z || 0 });
        allPoints.push({ x: element.x, y: element.y - element.radius, z: element.z || 0 });
        break;
      
      case 'rectangle':
        allPoints.push({ x: element.x, y: element.y, z: element.z || 0 });
        // Corners and midpoints handled in getElementSnapPoints
        break;
    }
  });
  
  // Check for horizontal alignment
  if (settings.types[SnapType.HORIZONTAL]) {
    allPoints.forEach(p => {
      if (Math.abs(p.y - point.y) < tolerance) {
        snapPoints.push({
          x: point.x,
          y: p.y,
          z: point.z,
          type: SnapType.HORIZONTAL,
          priority: 11 // High priority for alignment
        });
      }
    });
  }
  
  // Check for vertical alignment
  if (settings.types[SnapType.VERTICAL]) {
    allPoints.forEach(p => {
      if (Math.abs(p.x - point.x) < tolerance) {
        snapPoints.push({
          x: p.x,
          y: point.y,
          z: point.z,
          type: SnapType.VERTICAL,
          priority: 11 // High priority for alignment
        });
      }
    });
  }
  
  return snapPoints;
}

/**
 * Find perpendicular points for a given point and elements
 */
function findPerpendicularPoints(
  point: Point,
  elements: Element[],
  activeElement: Element | undefined,
  settings: SnapSettings
): SnapPoint[] {
  const snapPoints: SnapPoint[] = [];
  
  if (!activeElement || 
      (activeElement.type !== 'line' && !(activeElement.isCreating && activeElement.type === 'line'))) {
    return snapPoints;
  }
  
  // For lines being created, we need the first point and the current mouse position
  const lineStartX = activeElement.x1 || activeElement.startX || 0;
  const lineStartY = activeElement.y1 || activeElement.startY || 0;
  
  // Filter for only line elements
  const lineElements = elements.filter(el => el.type === 'line' && el !== activeElement);
  
  lineElements.forEach(line => {
    // Calculate perpendicular point from the active line to this line
    const perpPoint = findPerpendicularPointToLine(
      { x: lineStartX, y: lineStartY },
      point,
      { x: line.x1, y: line.y1 },
      { x: line.x2, y: line.y2 }
    );
    
    if (perpPoint) {
      snapPoints.push({
        x: perpPoint.x,
        y: perpPoint.y,
        z: point.z,
        type: SnapType.PERPENDICULAR,
        source: line,
        priority: 12 // Very high priority
      });
    }
  });
  
  return snapPoints;
}

/**
 * Calculate perpendicular point from a line to another line
 */
function findPerpendicularPointToLine(
  lineAStart: { x: number, y: number },
  lineAEnd: { x: number, y: number },
  lineBStart: { x: number, y: number },
  lineBEnd: { x: number, y: number }
): { x: number, y: number } | null {
  // Vector of line A
  const dxA = lineAEnd.x - lineAStart.x;
  const dyA = lineAEnd.y - lineAStart.y;
  
  // Vector of line B
  const dxB = lineBEnd.x - lineBStart.x;
  const dyB = lineBEnd.y - lineBStart.y;
  
  // Check if lines are already perpendicular
  const dotProduct = dxA * dxB + dyA * dyB;
  if (Math.abs(dotProduct) < 1e-10) {
    // Lines are already perpendicular, find closest point on line B
    return findClosestPointOnLine(lineAEnd, lineBStart, lineBEnd);
  }
  
  // Calculate perpendicular vector to line B
  const perpDxB = -dyB;
  const perpDyB = dxB;
  
  // Find intersection between a line from lineAEnd in the perpendicular direction
  // and line B
  
  // Parametric equation for line B: lineBStart + t * (dxB, dyB)
  // Parametric equation for perp line: lineAEnd + s * (perpDxB, perpDyB)
  
  // Solve for t where these lines intersect
  const denominator = perpDxB * dyB - perpDyB * dxB;
  
  if (Math.abs(denominator) < 1e-10) {
    // Lines are parallel, no perpendicular intersection
    return null;
  }
  
  const t = ((lineAEnd.x - lineBStart.x) * perpDyB - (lineAEnd.y - lineBStart.y) * perpDxB) / denominator;
  
  // Calculate the intersection point on line B
  const intersectionX = lineBStart.x + t * dxB;
  const intersectionY = lineBStart.y + t * dyB;
  
  // Make sure it's on the line segment
  if (t >= 0 && t <= 1) {
    return { x: intersectionX, y: intersectionY };
  }
  
  return null;
}

/**
 * Find the closest point on a line to a given point
 */
function findClosestPointOnLine(
  point: { x: number, y: number },
  lineStart: { x: number, y: number },
  lineEnd: { x: number, y: number }
): { x: number, y: number } | null {
  // Vector of the line
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  
  // Line length squared
  const lengthSquared = dx * dx + dy * dy;
  
  if (lengthSquared === 0) {
    // Line start and end are the same point
    return { x: lineStart.x, y: lineStart.y };
  }
  
  // Calculate projection of point onto line
  const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSquared;
  
  // If t is outside [0,1], the closest point is one of the endpoints
  if (t < 0) {
    return { x: lineStart.x, y: lineStart.y };
  }
  if (t > 1) {
    return { x: lineEnd.x, y: lineEnd.y };
  }
  
  // Closest point is on the line segment
  return {
    x: lineStart.x + t * dx,
    y: lineStart.y + t * dy
  };
}

/**
 * Find tangent points from a point to circles
 */
function findTangentPoints(
  point: Point,
  elements: Element[],
  activeElement: Element | undefined,
  settings: SnapSettings
): SnapPoint[] {
  const snapPoints: SnapPoint[] = [];
  
  // Only find tangent points when creating a line
  if (!activeElement || 
      !(activeElement.type === 'line' || (activeElement.isCreating && activeElement.type === 'line'))) {
    return snapPoints;
  }
  
  // Filter for only circle elements
  const circleElements = elements.filter(el => el.type === 'circle');
  
  circleElements.forEach(circle => {
    const tangentPoints = findTangentPointsToCircle(
      point,
      { x: circle.x, y: circle.y },
      circle.radius
    );
    
    tangentPoints.forEach(tangentPoint => {
      snapPoints.push({
        x: tangentPoint.x,
        y: tangentPoint.y,
        z: point.z,
        type: SnapType.TANGENT,
        source: circle,
        priority: 12
      });
    });
  });
  
  return snapPoints;
}

/**
 * Calculate tangent points from a point to a circle
 */
function findTangentPointsToCircle(
  point: { x: number, y: number },
  circleCenter: { x: number, y: number },
  radius: number
): Array<{ x: number, y: number }> {
  const tangentPoints: Array<{ x: number, y: number }> = [];
  
  // Vector from circle center to point
  const dx = point.x - circleCenter.x;
  const dy = point.y - circleCenter.y;
  
  // Distance from point to circle center
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  // If point is inside the circle, no tangent points
  if (distance <= radius) {
    return tangentPoints;
  }
  
  // Calculate angle to tangent points using Pythagorean theorem
  const angle = Math.asin(radius / distance);
  
  // Angle from circle center to point
  const baseAngle = Math.atan2(dy, dx);
  
  // First tangent point
  const angle1 = baseAngle - angle;
  tangentPoints.push({
    x: circleCenter.x + radius * Math.cos(angle1),
    y: circleCenter.y + radius * Math.sin(angle1)
  });
  
  // Second tangent point
  const angle2 = baseAngle + angle;
  tangentPoints.push({
    x: circleCenter.x + radius * Math.cos(angle2),
    y: circleCenter.y + radius * Math.sin(angle2)
  });
  
  return tangentPoints;
}

/**
 * Find equidistant points between elements
 */
function findEquidistantPoints(
  point: Point,
  elements: Element[],
  settings: SnapSettings
): SnapPoint[] {
  const snapPoints: SnapPoint[] = [];
  
  // Get all significant points
  const significantPoints: Point[] = [];
  
  elements.forEach(element => {
    switch (element.type) {
      case 'line':
        significantPoints.push({ x: element.x1, y: element.y1, z: element.z1 || 0 });
        significantPoints.push({ x: element.x2, y: element.y2, z: element.z2 || 0 });
        break;
      
      case 'circle':
        significantPoints.push({ x: element.x, y: element.y, z: element.z || 0 });
        break;
        
      case 'rectangle':
        // Center
        significantPoints.push({ x: element.x, y: element.y, z: element.z || 0 });
        break;
    }
  });
  
  // Check for equidistant points between pairs of points
  for (let i = 0; i < significantPoints.length; i++) {
    for (let j = i + 1; j < significantPoints.length; j++) {
      const p1 = significantPoints[i];
      const p2 = significantPoints[j];
      
      // Calculate midpoint
      const midpoint = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
        z: (p1.z + p2.z) / 2
      };
      
      // Check if mouse is near the midpoint
      const distToMidpoint = Math.sqrt(
        Math.pow(midpoint.x - point.x, 2) +
        Math.pow(midpoint.y - point.y, 2)
      );
      
      if (distToMidpoint <= settings.smartTolerance) {
        snapPoints.push({
          ...midpoint,
          type: SnapType.EQUIDISTANT,
          priority: 7
        });
      }
    }
  }
  
  return snapPoints;
}

// Default settings
export const defaultSnapSettings: SnapSettings = {
  enabled: true,
  types: {
    [SnapType.GRID]: true,
    [SnapType.ENDPOINT]: true,
    [SnapType.MIDPOINT]: true,
    [SnapType.INTERSECTION]: true,
    [SnapType.CENTER]: true,
    [SnapType.QUADRANT]: true,
    [SnapType.NEAREST]: true,
    [SnapType.TANGENT]: true,
    [SnapType.PERPENDICULAR]: true,
    [SnapType.PARALLEL]: true,
    [SnapType.EQUIDISTANT]: true,
    [SnapType.HORIZONTAL]: true,
    [SnapType.VERTICAL]: true
  },
  gridSize: 10,
  tolerance: 10,
  smartTolerance: 15
};