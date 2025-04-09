// src/lib/elementGeometryUtils.ts
import { Element } from 'src/store/elementsStore';

/**
 * Represents the extracted geometry information from any element
 */
export interface ElementGeometry {
  // Base properties
  center: { x: number; y: number; z: number };
  
  // Bounding box
  boundingBox?: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
    width?: number;
    height?: number;
    depth?: number;
  };
  
  // Element-specific properties
  radius?: number;         // For circles, spheres, cylinders, etc.
  width?: number;          // For rectangles, cubes, etc. 
  height?: number;         // For rectangles, cubes, etc.
  depth?: number;          // For 3D objects
  
  // Path-specific properties
  path?: { x: number; y: number; z?: number }[];  // For paths, polygons, etc.
  closed?: boolean;        // Whether the path is closed
  
  // Original element for reference
  originalElement: Element;
  
  // Type information for specific handling
  elementType: string;
}

/**
 * Extracts geometric information from any element
 * @param element The element to extract geometry from
 * @returns Geometry information
 */
export function extractElementGeometry(element: Element): ElementGeometry {
  // Default values for center
  const center = {
    x: element.x || 0,
    y: element.y || 0,
    z: element.z || 0
  };
  
  // Start with a base geometry object
  const geometry: ElementGeometry = {
    center,
    originalElement: element,
    elementType: element.type
  };
  
  // Extract element-specific properties
  switch (element.type) {
    case 'rectangle':
      return extractRectangleGeometry(element, geometry);
    case 'circle':
      return extractCircleGeometry(element, geometry);
    case 'polygon':
      return extractPolygonGeometry(element, geometry);
    case 'line':
      return extractLineGeometry(element, geometry);
    case 'cube':
      return extractCubeGeometry(element, geometry);
    case 'sphere':
      return extractSphereGeometry(element, geometry);
    case 'cylinder':
      return extractCylinderGeometry(element, geometry);
    case 'cone':
      return extractConeGeometry(element, geometry);
    case 'torus':
      return extractTorusGeometry(element, geometry);
    case 'pyramid':
      return extractPyramidGeometry(element, geometry);
    case 'prism':
      return extractPrismGeometry(element, geometry);
    case 'hemisphere':
      return extractHemisphereGeometry(element, geometry);
    case 'ellipsoid':
      return extractEllipsoidGeometry(element, geometry);
    case 'capsule':
      return extractCapsuleGeometry(element, geometry);
    case 'component':
      return extractComponentGeometry(element, geometry);
    default:
      // Generic approach for unsupported elements
      return extractGenericGeometry(element, geometry);
  }
}

// Extraction functions for specific element types

function extractRectangleGeometry(element: Element, baseGeometry: ElementGeometry): ElementGeometry {
  const width = element.width || 0;
  const height = element.height || 0;
  
  return {
    ...baseGeometry,
    width,
    height,
    boundingBox: {
      min: { 
        x: baseGeometry.center.x - width / 2, 
        y: baseGeometry.center.y - height / 2, 
        z: baseGeometry.center.z 
      },
      max: { 
        x: baseGeometry.center.x + width / 2, 
        y: baseGeometry.center.y + height / 2, 
        z: baseGeometry.center.z 
      },
      width,
      height,
      depth: 0
    },
    // Create path for rectangular contour
    path: [
      { x: baseGeometry.center.x - width / 2, y: baseGeometry.center.y - height / 2 },
      { x: baseGeometry.center.x + width / 2, y: baseGeometry.center.y - height / 2 },
      { x: baseGeometry.center.x + width / 2, y: baseGeometry.center.y + height / 2 },
      { x: baseGeometry.center.x - width / 2, y: baseGeometry.center.y + height / 2 },
      { x: baseGeometry.center.x - width / 2, y: baseGeometry.center.y - height / 2 }, // Close the path
    ],
    closed: true
  };
}

function extractCircleGeometry(element: Element, baseGeometry: ElementGeometry): ElementGeometry {
  const radius = element.radius || 0;
  const diameter = radius * 2;
  
  return {
    ...baseGeometry,
    radius,
    boundingBox: {
      min: { 
        x: baseGeometry.center.x - radius, 
        y: baseGeometry.center.y - radius, 
        z: baseGeometry.center.z 
      },
      max: { 
        x: baseGeometry.center.x + radius, 
        y: baseGeometry.center.y + radius, 
        z: baseGeometry.center.z 
      },
      width: diameter,
      height: diameter,
      depth: 0
    }
  };
}

function extractPolygonGeometry(element: Element, baseGeometry: ElementGeometry): ElementGeometry {
  const radius = element.radius || 0;
  const sides = element.sides || 3;
  const diameter = radius * 2;
  
  // Calculate polygon vertices
  const path: { x: number; y: number }[] = [];
  for (let i = 0; i <= sides; i++) {
    const angle = i * (2 * Math.PI / sides);
    const x = baseGeometry.center.x + radius * Math.cos(angle);
    const y = baseGeometry.center.y + radius * Math.sin(angle);
    path.push({ x, y });
  }
  
  return {
    ...baseGeometry,
    radius,
    boundingBox: {
      min: { 
        x: baseGeometry.center.x - radius, 
        y: baseGeometry.center.y - radius, 
        z: baseGeometry.center.z 
      },
      max: { 
        x: baseGeometry.center.x + radius, 
        y: baseGeometry.center.y + radius, 
        z: baseGeometry.center.z 
      },
      width: diameter,
      height: diameter,
      depth: 0
    },
    path,
    closed: true
  };
}

function extractLineGeometry(element: Element, baseGeometry: ElementGeometry): ElementGeometry {
  const x1 = element.x1 || baseGeometry.center.x;
  const y1 = element.y1 || baseGeometry.center.y;
  const z1 = element.z1 || baseGeometry.center.z;
  const x2 = element.x2 || baseGeometry.center.x;
  const y2 = element.y2 || baseGeometry.center.y;
  const z2 = element.z2 || baseGeometry.center.z;
  
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  const minZ = Math.min(z1, z2);
  const maxZ = Math.max(z1, z2);
  
  return {
    ...baseGeometry,
    boundingBox: {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
      width: maxX - minX,
      height: maxY - minY,
      depth: maxZ - minZ
    },
    path: [
      { x: x1, y: y1, z: z1 },
      { x: x2, y: y2, z: z2 }
    ],
    closed: false
  };
}

function extractCubeGeometry(element: Element, baseGeometry: ElementGeometry): ElementGeometry {
  const width = element.width || 0;
  const height = element.height || 0;
  const depth = element.depth || 0;
  
  return {
    ...baseGeometry,
    width,
    height,
    depth,
    boundingBox: {
      min: { 
        x: baseGeometry.center.x - width / 2, 
        y: baseGeometry.center.y - height / 2, 
        z: baseGeometry.center.z - depth / 2 
      },
      max: { 
        x: baseGeometry.center.x + width / 2, 
        y: baseGeometry.center.y + height / 2, 
        z: baseGeometry.center.z + depth / 2 
      },
      width,
      height,
      depth
    }
  };
}

function extractSphereGeometry(element: Element, baseGeometry: ElementGeometry): ElementGeometry {
  const radius = element.radius || 0;
  const diameter = radius * 2;
  
  return {
    ...baseGeometry,
    radius,
    boundingBox: {
      min: { 
        x: baseGeometry.center.x - radius, 
        y: baseGeometry.center.y - radius, 
        z: baseGeometry.center.z - radius 
      },
      max: { 
        x: baseGeometry.center.x + radius, 
        y: baseGeometry.center.y + radius, 
        z: baseGeometry.center.z + radius 
      },
      width: diameter,
      height: diameter,
      depth: diameter
    }
  };
}

function extractCylinderGeometry(element: Element, baseGeometry: ElementGeometry): ElementGeometry {
  const radius = element.radius || 0;
  const height = element.height || 0;
  const diameter = radius * 2;
  
  return {
    ...baseGeometry,
    radius,
    height,
    boundingBox: {
      min: { 
        x: baseGeometry.center.x - radius, 
        y: baseGeometry.center.y - radius, 
        z: baseGeometry.center.z - height / 2 
      },
      max: { 
        x: baseGeometry.center.x + radius, 
        y: baseGeometry.center.y + radius, 
        z: baseGeometry.center.z + height / 2 
      },
      width: diameter,
      height: diameter,
      depth: height
    }
  };
}

function extractConeGeometry(element: Element, baseGeometry: ElementGeometry): ElementGeometry {
  const radius = element.radius || 0;
  const height = element.height || 0;
  const diameter = radius * 2;
  
  return {
    ...baseGeometry,
    radius,
    height,
    boundingBox: {
      min: { 
        x: baseGeometry.center.x - radius, 
        y: baseGeometry.center.y - radius, 
        z: baseGeometry.center.z - height / 2 
      },
      max: { 
        x: baseGeometry.center.x + radius, 
        y: baseGeometry.center.y + radius, 
        z: baseGeometry.center.z + height / 2 
      },
      width: diameter,
      height: diameter,
      depth: height
    }
  };
}

function extractTorusGeometry(element: Element, baseGeometry: ElementGeometry): ElementGeometry {
  const radius = element.radius || 0;
  const tubeRadius = element.tubeRadius || radius / 4;
  const outerRadius = radius + tubeRadius;
  const outerDiameter = outerRadius * 2;
  
  return {
    ...baseGeometry,
    radius,
    boundingBox: {
      min: { 
        x: baseGeometry.center.x - outerRadius, 
        y: baseGeometry.center.y - outerRadius, 
        z: baseGeometry.center.z - tubeRadius 
      },
      max: { 
        x: baseGeometry.center.x + outerRadius, 
        y: baseGeometry.center.y + outerRadius, 
        z: baseGeometry.center.z + tubeRadius 
      },
      width: outerDiameter,
      height: outerDiameter,
      depth: tubeRadius * 2
    }
  };
}

function extractPyramidGeometry(element: Element, baseGeometry: ElementGeometry): ElementGeometry {
  const width = element.width || element.baseWidth || 0;
  const depth = element.depth || element.baseDepth || 0;
  const height = element.height || 0;
  
  return {
    ...baseGeometry,
    width,
    height,
    depth,
    boundingBox: {
      min: { 
        x: baseGeometry.center.x - width / 2, 
        y: baseGeometry.center.y - depth / 2, 
        z: baseGeometry.center.z - height / 2 
      },
      max: { 
        x: baseGeometry.center.x + width / 2, 
        y: baseGeometry.center.y + depth / 2, 
        z: baseGeometry.center.z + height / 2 
      },
      width,
      height: height,
      depth
    }
  };
}

function extractPrismGeometry(element: Element, baseGeometry: ElementGeometry): ElementGeometry {
  const radius = element.radius || 0;
  const height = element.height || 0;
  const diameter = radius * 2;
  
  return {
    ...baseGeometry,
    radius,
    height,
    boundingBox: {
      min: { 
        x: baseGeometry.center.x - radius, 
        y: baseGeometry.center.y - radius, 
        z: baseGeometry.center.z - height / 2 
      },
      max: { 
        x: baseGeometry.center.x + radius, 
        y: baseGeometry.center.y + radius, 
        z: baseGeometry.center.z + height / 2 
      },
      width: diameter,
      height: diameter,
      depth: height
    }
  };
}

function extractHemisphereGeometry(element: Element, baseGeometry: ElementGeometry): ElementGeometry {
  const radius = element.radius || 0;
  const diameter = radius * 2;
  const direction = element.direction || 'up';
  
  // Adjust z position based on direction
  const zOffset = direction === 'up' ? radius / 2 : -radius / 2;
  
  return {
    ...baseGeometry,
    radius,
    boundingBox: {
      min: { 
        x: baseGeometry.center.x - radius, 
        y: baseGeometry.center.y - radius, 
        z: direction === 'up' ? baseGeometry.center.z : baseGeometry.center.z - radius 
      },
      max: { 
        x: baseGeometry.center.x + radius, 
        y: baseGeometry.center.y + radius, 
        z: direction === 'up' ? baseGeometry.center.z + radius : baseGeometry.center.z 
      },
      width: diameter,
      height: diameter,
      depth: radius
    }
  };
}

function extractEllipsoidGeometry(element: Element, baseGeometry: ElementGeometry): ElementGeometry {
  const radiusX = element.radiusX || element.width / 2 || 0;
  const radiusY = element.radiusY || element.height / 2 || 0;
  const radiusZ = element.radiusZ || element.depth / 2 || 0;
  
  return {
    ...baseGeometry,
    width: radiusX * 2,
    height: radiusY * 2,
    depth: radiusZ * 2,
    boundingBox: {
      min: { 
        x: baseGeometry.center.x - radiusX, 
        y: baseGeometry.center.y - radiusY, 
        z: baseGeometry.center.z - radiusZ 
      },
      max: { 
        x: baseGeometry.center.x + radiusX, 
        y: baseGeometry.center.y + radiusY, 
        z: baseGeometry.center.z + radiusZ 
      },
      width: radiusX * 2,
      height: radiusY * 2,
      depth: radiusZ * 2
    }
  };
}

function extractCapsuleGeometry(element: Element, baseGeometry: ElementGeometry): ElementGeometry {
  const radius = element.radius || 0;
  const height = element.height || 0;
  const diameter = radius * 2;
  const totalHeight = height + diameter; // Height includes the cylindrical part plus the hemispheres
  
  return {
    ...baseGeometry,
    radius,
    height,
    boundingBox: {
      min: { 
        x: baseGeometry.center.x - radius, 
        y: baseGeometry.center.y - radius, 
        z: baseGeometry.center.z - totalHeight / 2 
      },
      max: { 
        x: baseGeometry.center.x + radius, 
        y: baseGeometry.center.y + radius, 
        z: baseGeometry.center.z + totalHeight / 2 
      },
      width: diameter,
      height: diameter,
      depth: totalHeight
    }
  };
}

function extractComponentGeometry(element: Element, baseGeometry: ElementGeometry): ElementGeometry {
  // For components, we need to calculate the bounding box from all sub-elements
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  
  // If the component has defined dimensions, use those
  if (element.width !== undefined && element.height !== undefined) {
    const width = element.width;
    const height = element.height;
    const depth = element.depth || 0;
    
    return {
      ...baseGeometry,
      width,
      height,
      depth,
      boundingBox: {
        min: { 
          x: baseGeometry.center.x - width / 2, 
          y: baseGeometry.center.y - height / 2, 
          z: baseGeometry.center.z - depth / 2 
        },
        max: { 
          x: baseGeometry.center.x + width / 2, 
          y: baseGeometry.center.y + height / 2, 
          z: baseGeometry.center.z + depth / 2 
        },
        width,
        height,
        depth
      }
    };
  }
  
  // If the component has sub-elements, calculate the bounding box from them
  if (element.elements && Array.isArray(element.elements) && element.elements.length > 0) {
    element.elements.forEach((subElement: any) => {
      // Skip if the sub-element doesn't have a position
      if (subElement.x === undefined && subElement.x1 === undefined) {
        return;
      }
      
      // Get the sub-element's geometry
      const subGeometry = extractElementGeometry({
        ...subElement,
        // Adjust position relative to the component
        x: (subElement.x !== undefined ? baseGeometry.center.x + subElement.x : undefined),
        y: (subElement.y !== undefined ? baseGeometry.center.y + subElement.y : undefined),
        z: (subElement.z !== undefined ? baseGeometry.center.z + subElement.z : undefined),
        x1: (subElement.x1 !== undefined ? baseGeometry.center.x + subElement.x1 : undefined),
        y1: (subElement.y1 !== undefined ? baseGeometry.center.y + subElement.y1 : undefined),
        z1: (subElement.z1 !== undefined ? baseGeometry.center.z + subElement.z1 : undefined),
        x2: (subElement.x2 !== undefined ? baseGeometry.center.x + subElement.x2 : undefined),
        y2: (subElement.y2 !== undefined ? baseGeometry.center.y + subElement.y2 : undefined),
        z2: (subElement.z2 !== undefined ? baseGeometry.center.z + subElement.z2 : undefined),
      } as Element);
      
      // Update the bounding box
      if (subGeometry.boundingBox) {
        minX = Math.min(minX, subGeometry.boundingBox.min.x);
        minY = Math.min(minY, subGeometry.boundingBox.min.y);
        minZ = Math.min(minZ, subGeometry.boundingBox.min.z);
        maxX = Math.max(maxX, subGeometry.boundingBox.max.x);
        maxY = Math.max(maxY, subGeometry.boundingBox.max.y);
        maxZ = Math.max(maxZ, subGeometry.boundingBox.max.z);
      }
    });
    
    const width = maxX - minX;
    const height = maxY - minY;
    const depth = maxZ - minZ;
    
    return {
      ...baseGeometry,
      width,
      height,
      depth,
      boundingBox: {
        min: { x: minX, y: minY, z: minZ },
        max: { x: maxX, y: maxY, z: maxZ },
        width,
        height,
        depth
      }
    };
  }
  
  // Fallback to default dimensions
  return {
    ...baseGeometry,
    width: 0,
    height: 0,
    depth: 0,
    boundingBox: {
      min: { x: baseGeometry.center.x, y: baseGeometry.center.y, z: baseGeometry.center.z },
      max: { x: baseGeometry.center.x, y: baseGeometry.center.y, z: baseGeometry.center.z },
      width: 0,
      height: 0,
      depth: 0
    }
  };
}

function extractGenericGeometry(element: Element, baseGeometry: ElementGeometry): ElementGeometry {
  // Generic approach - try to extract any relevant information
  let width = 0, height = 0, depth = 0, radius = 0;
  
  // Try to get dimensions from element properties
  if (element.width !== undefined) width = element.width;
  else if (element.size !== undefined) width = element.size;
  
  if (element.height !== undefined) height = element.height;
  else height = width;
  
  if (element.depth !== undefined) depth = element.depth;
  else if (element.thickness !== undefined) depth = element.thickness;
  
  if (element.radius !== undefined) radius = element.radius;
  else if (element.diameter !== undefined) radius = element.diameter / 2;
  
  // If we have a radius, adjust dimensions
  if (radius > 0) {
    width = radius * 2;
    height = radius * 2;
  }
  
  // If we have no dimensions, use a default size
  if (width === 0 && height === 0 && depth === 0 && radius === 0) {
    width = 10;
    height = 10;
    depth = 10;
  }
  
  return {
    ...baseGeometry,
    width,
    height,
    depth,
    radius: radius > 0 ? radius : undefined,
    boundingBox: {
      min: { 
        x: baseGeometry.center.x - width / 2, 
        y: baseGeometry.center.y - height / 2, 
        z: baseGeometry.center.z - depth / 2 
      },
      max: { 
        x: baseGeometry.center.x + width / 2, 
        y: baseGeometry.center.y + height / 2, 
        z: baseGeometry.center.z + depth / 2 
      },
      width,
      height,
      depth
    }
  };
}

/**
 * Gets the element's depth for toolpath generation
 * @param element The element to get the depth from
 * @returns The calculated depth for machining purposes
 */
export function getElementDepth(element: Element): number {
  // Get element geometry
  const geometry = extractElementGeometry(element);
  
  // For explicit 3D elements, use their depth
  if (geometry.depth && geometry.depth > 0) {
    return geometry.depth;
  }
  
  // For spherical elements, use diameter
  if (geometry.radius && geometry.elementType.includes('sphere')) {
    return geometry.radius * 2;
  }
  
  // For cylinders, cones, etc., use height
  if (geometry.height && ['cylinder', 'cone', 'prism', 'pyramid', 'capsule'].includes(geometry.elementType)) {
    return geometry.height;
  }
  
  // For 2D elements, use a default depth
  return 5; // Default depth of 5mm for 2D elements
}