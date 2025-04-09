import { Element } from 'src/store/elementsStore';

interface TransformParams {
  x?: number;
  y?: number;
  z?: number;
  angle?: number;
  angleX?: number;
  angleY?: number;
  angleZ?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
  reference?: 'center' | 'origin';
}

/**
 * Transform elements by moving, rotating, or scaling them
 */
export function transformElements(
  elements: Element[],
  params: TransformParams
): Element[] {
  return elements.map(element => transformElement(element, params));
}

/**
 * Transform a single element
 */
export function transformElement(
  element: Element,
  params: TransformParams
): Element {
  const { 
    x = 0, 
    y = 0, 
    z = 0, 
    angle = 0, 
    angleX = 0, 
    angleY = 0, 
    angleZ = 0, 
    scaleX = 1, 
    scaleY = 1, 
    scaleZ = 1, 
    reference = 'center' 
  } = params;
  
  // Clone the element to avoid modifying the original
  const transformed = structuredClone(element);
  
  // Apply transformations based on element type
  switch (transformed.type) {
    case 'line':
      return transformLine(transformed, { x, y, z, angle, angleX, angleY, angleZ, scaleX, scaleY, scaleZ, reference });
    
    case 'circle':
      return transformCircle(transformed, { x, y, z, angle, angleX, angleY, angleZ, scaleX, scaleY, scaleZ, reference });
    
    case 'rectangle':
      return transformRectangle(transformed, { x, y, z, angle, angleX, angleY, angleZ, scaleX, scaleY, scaleZ, reference });
    
    case 'cube':
      return transformCube(transformed, { x, y, z, angle, angleX, angleY, angleZ, scaleX, scaleY, scaleZ, reference });
    
    case 'sphere':
      return transformSphere(transformed, { x, y, z, angle, angleX, angleY, angleZ, scaleX, scaleY, scaleZ, reference });
    
    case 'cylinder':
      return transformCylinder(transformed, { x, y, z, angle, angleX, angleY, angleZ, scaleX, scaleY, scaleZ, reference });
    
    case 'cone':
      return transformCone(transformed, { x, y, z, angle, angleX, angleY, angleZ, scaleX, scaleY, scaleZ, reference });
      
    case 'torus':
      return transformTorus(transformed, { x, y, z, angle, angleX, angleY, angleZ, scaleX, scaleY, scaleZ, reference });
    
    case 'text':
      return transformText(transformed, { x, y, z, angle, angleX, angleY, angleZ, scaleX, scaleY, scaleZ, reference });
      
    case 'group':
      return transformGroup(transformed, { x, y, z, angle, angleX, angleY, angleZ, scaleX, scaleY, scaleZ, reference });
    
    default:
      console.warn(`Unsupported element type for transformation: ${transformed.type}`);
      return transformed;
  }
}

function transformLine(
  line: Element,
  { x, y, z, angle, angleX, angleY, angleZ, scaleX, scaleY, scaleZ, reference }: Required<TransformParams>
): Element {
  if (!line.x1 || !line.y1 || !line.x2 || !line.y2) {
    console.warn('Line element is missing required properties');
    return line;
  }

  // Translation
  line.x1 += x;
  line.y1 += y;
  line.z1 = (line.z1 ?? 0) + z;
  line.x2 += x;
  line.y2 += y;
  line.z2 = (line.z2 ?? 0) + z;
  
  // For rotation and scaling, we need to determine the center point
  const centerX = reference === 'center' ? (line.x1 + line.x2) / 2 : 0;
  const centerY = reference === 'center' ? (line.y1 + line.y2) / 2 : 0;
  const centerZ = reference === 'center' ? ((line.z1 ?? 0) + (line.z2 ?? 0)) / 2 : 0;
  
  // Apply Z-axis rotation (traditional 2D rotation)
  if (angle !== 0 || angleZ !== 0) {
    const totalAngleZ = angle + angleZ; // Combine legacy angle with angleZ
    const angleRad = totalAngleZ * Math.PI / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    
    // Translate to origin, rotate on Z-axis, translate back
    const x1 = line.x1 - centerX;
    const y1 = line.y1 - centerY;
    line.x1 = centerX + (x1 * cos - y1 * sin);
    line.y1 = centerY + (x1 * sin + y1 * cos);
    
    const x2 = line.x2 - centerX;
    const y2 = line.y2 - centerY;
    line.x2 = centerX + (x2 * cos - y2 * sin);
    line.y2 = centerY + (x2 * sin + y2 * cos);
  }
  
  // Apply X-axis rotation (rotate around X)
  if (angleX !== 0) {
    const angleRad = angleX * Math.PI / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    
    // Translate to origin, rotate on X-axis, translate back
    const y1 = line.y1 - centerY;
    const z1 = (line.z1 ?? 0) - centerZ;
    line.y1 = centerY + (y1 * cos - z1 * sin);
    line.z1 = centerZ + (y1 * sin + z1 * cos);
    
    const y2 = line.y2 - centerY;
    const z2 = (line.z2 ?? 0) - centerZ;
    line.y2 = centerY + (y2 * cos - z2 * sin);
    line.z2 = centerZ + (y2 * sin + z2 * cos);
  }
  
  // Apply Y-axis rotation (rotate around Y)
  if (angleY !== 0) {
    const angleRad = angleY * Math.PI / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    
    // Translate to origin, rotate on Y-axis, translate back
    const x1 = line.x1 - centerX;
    const z1 = (line.z1 ?? 0) - centerZ;
    line.x1 = centerX + (x1 * cos + z1 * sin);
    line.z1 = centerZ + (-x1 * sin + z1 * cos);
    
    const x2 = line.x2 - centerX;
    const z2 = (line.z2 ?? 0) - centerZ;
    line.x2 = centerX + (x2 * cos + z2 * sin);
    line.z2 = centerZ + (-x2 * sin + z2 * cos);
  }
  
  // Scaling
  if (scaleX !== 1 || scaleY !== 1 || scaleZ !== 1) {
    // Translate to origin, scale, translate back
    line.x1 = centerX + (line.x1 - centerX) * scaleX;
    line.y1 = centerY + (line.y1 - centerY) * scaleY;
    line.z1 = centerZ + ((line.z1 ?? 0) - centerZ) * scaleZ;
    
    line.x2 = centerX + (line.x2 - centerX) * scaleX;
    line.y2 = centerY + (line.y2 - centerY) * scaleY;
    line.z2 = centerZ + ((line.z2 ?? 0) - centerZ) * scaleZ;
  }
  
  // Store rotation angles for reference
  line.angleX = (line.angleX ?? 0) + angleX;
  line.angleY = (line.angleY ?? 0) + angleY;
  line.angleZ = (line.angleZ ?? 0) + angleZ + angle;
  
  return line;
}

function transformCircle(
  circle: Element,
  { x, y, z, angle, angleX, angleY, angleZ, scaleX, scaleY, scaleZ, reference }: Required<TransformParams>
): Element {
  if (!circle.x || !circle.y || !circle.radius) {
    console.warn('Circle element is missing required properties');
    return circle;
  }

  // Translation
  circle.x += x;
  circle.y += y;
  circle.z = (circle.z ?? 0) + z;
  
  // Scaling - average X and Y scale for radius
  const avgScale = (scaleX + scaleY) / 2;
  circle.radius *= avgScale;
  
  // Store rotation angles
  circle.angleX = (circle.angleX ?? 0) + angleX;
  circle.angleY = (circle.angleY ?? 0) + angleY;
  
  // Combine legacy angle with angleZ
  const totalAngleZ = angle + angleZ;
  circle.angleZ = (circle.angleZ ?? 0) + totalAngleZ;
  
  // For backward compatibility
  circle.angle = (circle.angle ?? 0) + totalAngleZ;
  
  return circle;
}

function transformRectangle(
  rect: Element,
  { x, y, z, angle, angleX, angleY, angleZ, scaleX, scaleY, scaleZ, reference }: Required<TransformParams>
): Element {
  if (!rect.x || !rect.y || !rect.width || !rect.height) {
    console.warn('Rectangle element is missing required properties');
    return rect;
  }

  // Translation
  rect.x += x;
  rect.y += y;
  rect.z = (rect.z ?? 0) + z;
  
  // Scaling
  rect.width *= scaleX;
  rect.height *= scaleY;
  
  // Store original dimensions if not already stored
  if (!rect.originalWidth) {
    rect.originalWidth = rect.width / scaleX;
  }
  
  if (!rect.originalHeight) {
    rect.originalHeight = rect.height / scaleY;
  }
  
  // Store rotation angles
  rect.angleX = (rect.angleX ?? 0) + angleX;
  rect.angleY = (rect.angleY ?? 0) + angleY;
  
  // Combine legacy angle with angleZ
  const totalAngleZ = angle + angleZ;
  rect.angleZ = (rect.angleZ ?? 0) + totalAngleZ;
  
  // For backward compatibility
  rect.angle = (rect.angle ?? 0) + totalAngleZ;
  
  return rect;
}

function transformCube(
  cube: Element,
  { x, y, z, angle, angleX, angleY, angleZ, scaleX, scaleY, scaleZ, reference }: Required<TransformParams>
): Element {
  if (!cube.x || !cube.y || !cube.width || !cube.height || !cube.depth) {
    console.warn('Cube element is missing required properties');
    return cube;
  }

  // Translation
  cube.x += x;
  cube.y += y;
  cube.z = (cube.z ?? 0) + z;
  
  // Scaling
  cube.width *= scaleX;
  cube.height *= scaleY;
  cube.depth *= scaleZ;
  
  // Store original dimensions if not already stored
  if (!cube.originalWidth) {
    cube.originalWidth = cube.width / scaleX;
  }
  
  if (!cube.originalHeight) {
    cube.originalHeight = cube.height / scaleY;
  }
  
  if (!cube.originalDepth) {
    cube.originalDepth = cube.depth / scaleZ;
  }
  
  // Store rotation angles
  // Apply direct rotations on each axis
  cube.angleX = (cube.angleX ?? 0) + angleX;
  cube.angleY = (cube.angleY ?? 0) + angleY;
  
  // Combine legacy angle with angleZ
  const totalAngleZ = angle + angleZ;
  cube.angleZ = (cube.angleZ ?? 0) + totalAngleZ;
  
  return cube;
}

function transformSphere(
  sphere: Element,
  { x, y, z, angle, angleX, angleY, angleZ, scaleX, scaleY, scaleZ, reference }: Required<TransformParams>
): Element {
  if (!sphere.x || !sphere.y || !sphere.radius) {
    console.warn('Sphere element is missing required properties');
    return sphere;
  }

  // Translation
  sphere.x += x;
  sphere.y += y;
  sphere.z = (sphere.z ?? 0) + z;
  
  // Scaling - average X, Y, and Z scale for radius
  const avgScale = (scaleX + scaleY + scaleZ) / 3;
  sphere.radius *= avgScale;
  
  // Store original radius if not already stored
  if (!sphere.originalRadius) {
    sphere.originalRadius = sphere.radius / avgScale;
  }
  
  // For spheres, rotation doesn't change appearance, but we store the angles for consistency
  sphere.angleX = (sphere.angleX ?? 0) + angleX;
  sphere.angleY = (sphere.angleY ?? 0) + angleY;
  sphere.angleZ = (sphere.angleZ ?? 0) + angleZ + angle;
  
  return sphere;
}

function transformCylinder(
  cylinder: Element,
  { x, y, z, angle, angleX, angleY, angleZ, scaleX, scaleY, scaleZ, reference }: Required<TransformParams>
): Element {
  if (!cylinder.x || !cylinder.y || !cylinder.radius || !cylinder.height) {
    console.warn('Cylinder element is missing required properties');
    return cylinder;
  }

  // Translation
  cylinder.x += x;
  cylinder.y += y;
  cylinder.z = (cylinder.z ?? 0) + z;
  
  // Scaling
  const avgRadiusScale = (scaleX + scaleY) / 2; // Average horizontal scale for radius
  cylinder.radius *= avgRadiusScale;
  cylinder.height *= scaleZ; // Height scales with Z axis
  
  // Store original dimensions if not already stored
  if (!cylinder.originalRadius) {
    cylinder.originalRadius = cylinder.radius / avgRadiusScale;
  }
  
  if (!cylinder.originalHeight) {
    cylinder.originalHeight = cylinder.height / scaleZ;
  }
  
  // Store rotation angles
  cylinder.angleX = (cylinder.angleX ?? 0) + angleX;
  cylinder.angleY = (cylinder.angleY ?? 0) + angleY;
  
  // Combine legacy angle with angleZ
  const totalAngleZ = angle + angleZ;
  cylinder.angleZ = (cylinder.angleZ ?? 0) + totalAngleZ;
  
  return cylinder;
}

function transformCone(
  cone: Element,
  { x, y, z, angle, angleX, angleY, angleZ, scaleX, scaleY, scaleZ, reference }: Required<TransformParams>
): Element {
  if (!cone.x || !cone.y || !cone.radius || !cone.height) {
    console.warn('Cone element is missing required properties');
    return cone;
  }

  // Translation
  cone.x += x;
  cone.y += y;
  cone.z = (cone.z ?? 0) + z;
  
  // Scaling
  const avgRadiusScale = (scaleX + scaleY) / 2; // Average horizontal scale for radius
  cone.radius *= avgRadiusScale;
  cone.height *= scaleZ; // Height scales with Z axis
  
  // Store original dimensions if not already stored
  if (!cone.originalRadius) {
    cone.originalRadius = cone.radius / avgRadiusScale;
  }
  
  if (!cone.originalHeight) {
    cone.originalHeight = cone.height / scaleZ;
  }
  
  // Store rotation angles
  cone.angleX = (cone.angleX ?? 0) + angleX;
  cone.angleY = (cone.angleY ?? 0) + angleY;
  
  // Combine legacy angle with angleZ
  const totalAngleZ = angle + angleZ;
  cone.angleZ = (cone.angleZ ?? 0) + totalAngleZ;
  
  return cone;
}

function transformTorus(
  torus: Element,
  { x, y, z, angle, angleX, angleY, angleZ, scaleX, scaleY, scaleZ, reference }: Required<TransformParams>
): Element {
  if (!torus.x || !torus.y || !torus.radius || !torus.tubeRadius) {
    console.warn('Torus element is missing required properties');
    return torus;
  }

  // Translation
  torus.x += x;
  torus.y += y;
  torus.z = (torus.z ?? 0) + z;
  
  // Scaling
  const avgScaleXY = (scaleX + scaleY) / 2; // Average XY scale for main radius
  const avgScaleAll = (scaleX + scaleY + scaleZ) / 3; // Average all scale for tube radius
  
  torus.radius *= avgScaleXY;
  torus.tubeRadius *= avgScaleAll;
  
  // Store original dimensions if not already stored
  if (!torus.originalRadius) {
    torus.originalRadius = torus.radius / avgScaleXY;
  }
  
  if (!torus.originalTubeRadius) {
    torus.originalTubeRadius = torus.tubeRadius / avgScaleAll;
  }
  
  // Store rotation angles
  torus.angleX = (torus.angleX ?? 0) + angleX;
  torus.angleY = (torus.angleY ?? 0) + angleY;
  
  // Combine legacy angle with angleZ
  const totalAngleZ = angle + angleZ;
  torus.angleZ = (torus.angleZ ?? 0) + totalAngleZ;
  
  return torus;
}

function transformText(
  text: Element,
  { x, y, z, angle, angleX, angleY, angleZ, scaleX, scaleY, scaleZ, reference }: Required<TransformParams>
): Element {
  if (!text.x || !text.y || !text.text || !text.size) {
    console.warn('Text element is missing required properties');
    return text;
  }

  // Translation
  text.x += x;
  text.y += y;
  text.z = (text.z ?? 0) + z;
  
  // Scaling
  const avgScale = (scaleX + scaleY) / 2; // Average scale for text size
  text.size *= avgScale;
  
  // Scale depth if present
  if (text.depth) {
    text.depth *= scaleZ;
  }
  
  // Store original dimensions if not already stored
  if (!text.originalSize) {
    text.originalSize = text.size / avgScale;
  }
  
  if (text.depth && !text.originalDepth) {
    text.originalDepth = text.depth / scaleZ;
  }
  
  // Store rotation angles
  text.angleX = (text.angleX ?? 0) + angleX;
  text.angleY = (text.angleY ?? 0) + angleY;
  
  // Combine legacy angle with angleZ
  const totalAngleZ = angle + angleZ;
  text.angleZ = (text.angleZ ?? 0) + totalAngleZ;
  
  return text;
}

function transformGroup(
  group: Element,
  { x, y, z, angle, angleX, angleY, angleZ, scaleX, scaleY, scaleZ, reference }: Required<TransformParams>
): Element {
  if (!group.x || !group.y) {
    console.warn('Group element is missing required properties');
    return group;
  }

  // Translation
  group.x += x;
  group.y += y;
  group.z = (group.z ?? 0) + z;
  
  // Store rotation angles
  group.angleX = (group.angleX ?? 0) + angleX;
  group.angleY = (group.angleY ?? 0) + angleY;
  
  // Combine legacy angle with angleZ
  const totalAngleZ = angle + angleZ;
  group.angleZ = (group.angleZ ?? 0) + totalAngleZ;
  
  // Scale dimensions if present
  if (group.width) group.width *= scaleX;
  if (group.height) group.height *= scaleY;
  if (group.depth) group.depth *= scaleZ;
  
  // Store original dimensions if not already stored
  if (group.width && !group.originalWidth) {
    group.originalWidth = group.width / scaleX;
  }
  
  if (group.height && !group.originalHeight) {
    group.originalHeight = group.height / scaleY;
  }
  
  if (group.depth && !group.originalDepth) {
    group.originalDepth = group.depth / scaleZ;
  }
  
  // Transform child elements if present
  if (group.elements && Array.isArray(group.elements)) {
    group.elements = group.elements.map(element => {
      // Only apply scaling and rotation to child elements
      // Their position is relative to the group
      return transformElement(element, {
        angleX, angleY, angleZ, angle,
        scaleX, scaleY, scaleZ,
        reference
      });
    });
  }
  
  return group;
}