/**
 * Geometry Utilities - Estratte da CADCanvas.tsx
 * Funzioni pure per calcoli geometrici - ZERO RISCHIO
 */

import * as THREE from 'three';

export interface CADElement {
  id: string;
  type: string;
  x: number;
  y: number;
  z?: number;
  width?: number;
  height?: number;
  depth?: number;
  radius?: number;
  angle?: number;
  color?: number;
  wireframe?: boolean;
  [key: string]: any;
}

/**
 * Calcola le proprietà geometriche di base per un elemento
 */
export const calculateElementGeometry = (element: CADElement) => {
  const baseProps = {
    position: new THREE.Vector3(element.x, element.y, element.z || 0),
    rotation: element.angle ? degreesToRadians(element.angle) : 0,
    color: element.color || 0x1e88e5,
    wireframe: element.wireframe || false
  };

  switch (element.type) {
    case 'cube':
      return {
        ...baseProps,
        dimensions: {
          width: element.width || 1,
          height: element.height || 1,
          depth: element.depth || 1
        }
      };

    case 'sphere':
      return {
        ...baseProps,
        radius: element.radius || 1,
        segments: element.segments || 32
      };

    case 'cylinder':
      return {
        ...baseProps,
        radius: element.radius || 1,
        height: element.height || 1,
        segments: element.segments || 32
      };

    case 'cone':
      return {
        ...baseProps,
        radius: element.radius || 1,
        height: element.height || 1,
        segments: element.segments || 32
      };

    case 'circle':
      return {
        ...baseProps,
        radius: element.radius || 1
      };

    case 'rectangle':
      return {
        ...baseProps,
        dimensions: {
          width: element.width || 1,
          height: element.height || 1
        }
      };

    default:
      return baseProps;
  }
};

/**
 * Calcola i punti di controllo per un elemento
 * ESTRATTA PARZIALMENTE DA: CADCanvas.tsx createControlPointsForElement
 */
export const calculateControlPoints = (element: CADElement) => {
  const points: Array<{
    position: THREE.Vector3;
    type: string;
    index: number;
    metadata?: any;
  }> = [];

  switch (element.type) {
    case 'line':
      if (element.x1 !== undefined && element.y1 !== undefined &&
          element.x2 !== undefined && element.y2 !== undefined) {
        points.push(
          {
            position: new THREE.Vector3(element.x1, element.y1, element.z1 || 0),
            type: 'endpoint',
            index: 0
          },
          {
            position: new THREE.Vector3(element.x2, element.y2, element.z2 || 0),
            type: 'endpoint',
            index: 1
          }
        );
      }
      break;

    case 'rectangle':
      const halfWidth = (element.width || 1) / 2;
      const halfHeight = (element.height || 1) / 2;
      const rotationRad = degreesToRadians(element.angle || 0);

      // Helper function to calculate rotated position
      const getRotatedPos = (x: number, y: number) => {
        const cos = Math.cos(rotationRad);
        const sin = Math.sin(rotationRad);
        const xRot = x * cos - y * sin + element.x;
        const yRot = x * sin + y * cos + element.y;
        return new THREE.Vector3(xRot, yRot, element.z || 0);
      };

      // Corner points
      const corners = [
        getRotatedPos(-halfWidth, -halfHeight), // Top-left
        getRotatedPos(halfWidth, -halfHeight),  // Top-right
        getRotatedPos(halfWidth, halfHeight),   // Bottom-right
        getRotatedPos(-halfWidth, halfHeight)   // Bottom-left
      ];

      corners.forEach((pos, idx) => {
        points.push({
          position: pos,
          type: 'corner',
          index: idx,
          metadata: { isCorner: true }
        });
      });

      // Midpoints
      const midpoints = [
        getRotatedPos(0, -halfHeight), // Top
        getRotatedPos(halfWidth, 0),   // Right
        getRotatedPos(0, halfHeight),  // Bottom
        getRotatedPos(-halfWidth, 0)   // Left
      ];

      midpoints.forEach((pos, idx) => {
        points.push({
          position: pos,
          type: 'midpoint',
          index: idx + 4,
          metadata: { isMidpoint: true }
        });
      });

      // Rotation handle
      const rotHandlePos = getRotatedPos(0, -halfHeight - 15);
      points.push({
        position: rotHandlePos,
        type: 'rotation',
        index: 8,
        metadata: { isRotationHandle: true }
      });
      break;

    case 'circle':
      // Center point
      points.push({
        position: new THREE.Vector3(element.x, element.y, element.z || 0),
        type: 'center',
        index: 0,
        metadata: { isCenter: true }
      });

      // Radius control points (cardinal directions)
      const radius = element.radius || 1;
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2;
        points.push({
          position: new THREE.Vector3(
            element.x + radius * Math.cos(angle),
            element.y + radius * Math.sin(angle),
            element.z || 0
          ),
          type: 'radius',
          index: i + 1,
          metadata: { isRadiusControl: true }
        });
      }
      break;

    case 'cube':
      // Center point
      points.push({
        position: new THREE.Vector3(element.x, element.y, element.z || 0),
        type: 'center',
        index: 0,
        metadata: { isCenter: true }
      });

      // Eight corners of the cube
      const width = element.width || 1;
      const height = element.height || 1;
      const depth = element.depth || 1;

      for (let i = 0; i < 8; i++) {
        const xSign = i & 1 ? 1 : -1;
        const ySign = i & 2 ? 1 : -1;
        const zSign = i & 4 ? 1 : -1;

        points.push({
          position: new THREE.Vector3(
            element.x + (xSign * width) / 2,
            element.y + (ySign * height) / 2,
            (element.z || 0) + (zSign * depth) / 2
          ),
          type: 'corner',
          index: i + 1,
          metadata: { isCorner: true }
        });
      }
      break;

    case 'sphere':
      // Center point
      points.push({
        position: new THREE.Vector3(element.x, element.y, element.z || 0),
        type: 'center',
        index: 0,
        metadata: { isCenter: true }
      });

      // Six direction controls for radius
      const sphereRadius = element.radius || 1;
      const directions = [
        [1, 0, 0], [-1, 0, 0], // X axis
        [0, 1, 0], [0, -1, 0], // Y axis
        [0, 0, 1], [0, 0, -1]  // Z axis
      ];

      directions.forEach((dir, idx) => {
        points.push({
          position: new THREE.Vector3(
            element.x + dir[0] * sphereRadius,
            element.y + dir[1] * sphereRadius,
            (element.z || 0) + dir[2] * sphereRadius
          ),
          type: 'radius',
          index: idx + 1,
          metadata: { 
            isRadiusControl: true,
            direction: dir 
          }
        });
      });
      break;
  }

  return points;
};

/**
 * Calcola l'area di un elemento geometrico
 */
export const calculateElementArea = (element: CADElement): number => {
  switch (element.type) {
    case 'rectangle':
      return (element.width || 1) * (element.height || 1);
    
    case 'circle':
      const radius = element.radius || 1;
      return Math.PI * radius * radius;
    
    case 'triangle':
      if (element.base && element.height) {
        return 0.5 * element.base * element.height;
      }
      return 0;
    
    default:
      return 0;
  }
};

/**
 * Calcola il volume di un elemento 3D
 */
export const calculateElementVolume = (element: CADElement): number => {
  switch (element.type) {
    case 'cube':
      return (element.width || 1) * (element.height || 1) * (element.depth || 1);
    
    case 'sphere':
      const radius = element.radius || 1;
      return (4/3) * Math.PI * radius * radius * radius;
    
    case 'cylinder':
      const cylRadius = element.radius || 1;
      const cylHeight = element.height || 1;
      return Math.PI * cylRadius * cylRadius * cylHeight;
    
    case 'cone':
      const coneRadius = element.radius || 1;
      const coneHeight = element.height || 1;
      return (1/3) * Math.PI * coneRadius * coneRadius * coneHeight;
    
    default:
      return 0;
  }
};

/**
 * Verifica se un punto è all'interno di un elemento
 */
export const isPointInsideElement = (
  point: THREE.Vector3,
  element: CADElement
): boolean => {
  switch (element.type) {
    case 'rectangle':
      const halfW = (element.width || 1) / 2;
      const halfH = (element.height || 1) / 2;
      return Math.abs(point.x - element.x) <= halfW && 
             Math.abs(point.y - element.y) <= halfH;
    
    case 'circle':
      const distance = Math.sqrt(
        Math.pow(point.x - element.x, 2) + 
        Math.pow(point.y - element.y, 2)
      );
      return distance <= (element.radius || 1);
    
    case 'cube':
      const halfWidth = (element.width || 1) / 2;
      const halfHeight = (element.height || 1) / 2;
      const halfDepth = (element.depth || 1) / 2;
      return Math.abs(point.x - element.x) <= halfWidth &&
             Math.abs(point.y - element.y) <= halfHeight &&
             Math.abs(point.z - (element.z || 0)) <= halfDepth;
    
    default:
      return false;
  }
};

/**
 * Utility function for angle conversion
 */
function degreesToRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}
