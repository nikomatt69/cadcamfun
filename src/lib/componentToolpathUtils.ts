import { Element } from 'src/store/elementsStore';
import * as THREE from 'three';
import { CSG } from 'three-csg-ts';
import {
  Component3D,
  calculateComponentDimensions,
  calculateZLevels,
  calculateZLevelIntersection,
  generateOptimizedToolpath,
  convertToolpathToGcode,
  calculate3DComponentDetails
} from './unifiedGeometryCalculator';
import {
  generateUnifiedComponentGcode,
  convertToComponent3D,
  validateGeometryToolpath
} from './integratedToolpathGenerator';
import { extractElementGeometry } from './elementGeometryUtils';

/**
 * Utility functions to generate toolpaths from component elements
 * by treating them as unified geometries.
 */

/**
 * Extract all sub-elements from a component for toolpath generation
 * @param component The component element
 * @returns Array of sub-elements with positions adjusted relative to the component
 */
export function extractComponentElements(component: any): any[] {
  if (!component || component.type !== 'component') {
    return [];
  }

  // If the component has elements array, process them
  if (component.elements && Array.isArray(component.elements) && component.elements.length > 0) {
    return component.elements.map((element: any) => {
      // Adjust position to be relative to the component
      return transformElementRelativeToComponent(element, component);
    });
  }
  
  // If no elements are found, return an empty array
  return [];
}

/**
 * Transform an element's position to be relative to its parent component
 * @param element The element to transform
 * @param component The parent component
 * @returns The transformed element
 */
function transformElementRelativeToComponent(element: any, component: any): any {
  // Create a deep copy of the element to avoid modifying the original
  const transformedElement = { ...element };
  
  // Transform position based on element type
  switch (element.type) {
    case 'cube':
    case 'sphere':
    case 'cylinder':
    case 'cone':
    case 'torus':
    case 'rectangle':
    case 'circle':
    case 'polygon':
    case 'extrude':
      // Elements with x, y, z coordinates
      transformedElement.x = (element.x || 0) + component.x;
      transformedElement.y = (element.y || 0) + component.y;
      transformedElement.z = (element.z || 0) + component.z;
      break;
      
    case 'line':
      // Elements with x1, y1, z1, x2, y2, z2 coordinates
      transformedElement.x1 = (element.x1 || 0) + component.x;
      transformedElement.y1 = (element.y1 || 0) + component.y;
      transformedElement.z1 = (element.z1 || 0) + component.z;
      transformedElement.x2 = (element.x2 || 0) + component.x;
      transformedElement.y2 = (element.y2 || 0) + component.y;
      transformedElement.z2 = (element.z2 || 0) + component.z;
      break;
      
    case 'group':
    case 'component':
      // Recursively transform nested groups or components
      transformedElement.x = (element.x || 0) + component.x;
      transformedElement.y = (element.y || 0) + component.y;
      transformedElement.z = (element.z || 0) + component.z;
      
      if (element.elements && Array.isArray(element.elements)) {
        transformedElement.elements = element.elements.map((subElement: any) => 
          transformElementRelativeToComponent(subElement, transformedElement)
        );
      }
      break;
      
    default:
      // For unknown types, just apply the offset
      if ('x' in element && 'y' in element) {
        transformedElement.x = (element.x || 0) + component.x;
        transformedElement.y = (element.y || 0) + component.y;
        transformedElement.z = (element.z || 0) + component.z;
      }
  }
  
  return transformedElement;
}

/**
 * Generate toolpath for a component by treating it as a unified geometry
 * through boolean union operations
 * @param component The component element
 * @param settings The toolpath generation settings
 * @returns G-code string for the component as a unified geometry
 */
export function generateComponentToolpath(component: any, settings: any): string {
  if (!component || component.type !== 'component') {
    return '; Invalid component element\n';
  }
  
  try {
    // Prima validiamo la geometria del componente
    const validationResult = validateGeometryToolpath(component);
    
    if (!validationResult.isValid) {
      console.warn("Avvertimento nella validazione della geometria:", validationResult);
    }
    
    // Generiamo il G-code utilizzando il nuovo integratore
    return generateUnifiedComponentGcode(component, settings);
  } catch (error) {
    console.error("Errore durante la generazione del toolpath:", error);
    // Fallback alla vecchia implementazione se c'è un errore
    return generateLegacyComponentToolpath(component, settings);
  }
}

/**
 * Legacy implementation of component toolpath generation (fallback method)
 * @param component The component element
 * @param settings The toolpath generation settings
 * @returns G-code string for the component using the old method
 */
function generateLegacyComponentToolpath(component: any, settings: any): string {
  let gcode = `; Component: ${component.name || 'Unnamed Component'} (as unified geometry - LEGACY MODE)\n`;
  gcode += `; Position: (${component.x}, ${component.y}, ${component.z})\n`;
  
  // Extract all elements from the component with proper positioning
  const elements = extractComponentElements(component);
  
  if (elements.length === 0) {
    gcode += '; Component has no elements to machine\n';
    return gcode;
  }
  
  // Create a unified 3D model through boolean operations
  try {
    // Convert component elements to THREE.js objects
    const threeObjects = elements.map(element => createThreeObject(element));
    
    // Filter out null objects and keep only meshes that can be used for boolean operations
    const validMeshes = threeObjects.filter(obj => 
      obj !== null && obj instanceof THREE.Mesh
    ) as THREE.Mesh[];
    
    if (validMeshes.length === 0) {
      gcode += '; No valid meshes found in component for boolean operations\n';
      // Fall back to processing each element separately
      gcode += '; Processing elements individually instead\n';
      return processElementsSeparately(elements, settings);
    }
    
    gcode += `; Performing boolean union on ${validMeshes.length} meshes\n`;
    
    // Perform boolean union operations to create a single unified mesh
    let unifiedMesh = validMeshes[0];
    
    for (let i = 1; i < validMeshes.length; i++) {
      try {
        unifiedMesh = CSG.union(unifiedMesh, validMeshes[i]);
        gcode += `; Union with mesh ${i+1} successful\n`;
      } catch (error) {
        gcode += `; Error in boolean union with mesh ${i+1}: ${error}\n`;
        // Continue with remaining meshes
      }
    }
    
    // Generate a toolpath for the unified mesh
    gcode += generateUnifiedToolpath(unifiedMesh, settings);
    
    return gcode;
  } catch (error) {
    gcode += `; Error creating unified geometry: ${error}\n`;
    gcode += '; Falling back to processing elements individually\n';
    return processElementsSeparately(elements, settings);
  }
}

/**
 * Create a THREE.js object from a CAD element
 */
function createThreeObject(element: any, parentPosition = { x: 0, y: 0, z: 0 }): THREE.Object3D | null {
  if (!element) return null;
  
  const adjustedElement = {
    ...element,
    x: (element.x || 0) + parentPosition.x,
    y: (element.y || 0) + parentPosition.y,
    z: (element.z || 0) + parentPosition.z
  };
  
  try {
    switch (element.type) {
      case 'cube':
      case 'rectangle': {
        const width = element.width || 1;
        const height = element.height || 1;
        const depth = element.depth || element.height || 1;
        
        const geometry = new THREE.BoxGeometry(width, depth, height);
        const material = new THREE.MeshStandardMaterial();
        const mesh = new THREE.Mesh(geometry, material);
        
        mesh.position.set(adjustedElement.x, adjustedElement.y, adjustedElement.z);
        return mesh;
      }
        
      case 'sphere': {
        const radius = element.radius || 1;
        
        const geometry = new THREE.SphereGeometry(radius, 32, 32);
        const material = new THREE.MeshStandardMaterial();
        const mesh = new THREE.Mesh(geometry, material);
        
        mesh.position.set(adjustedElement.x, adjustedElement.y, adjustedElement.z);
        return mesh;
      }
        
      case 'cylinder': {
        const radius = element.radius || 1;
        const height = element.height || 1;
        
        const geometry = new THREE.CylinderGeometry(radius, radius, height, 32);
        const material = new THREE.MeshStandardMaterial();
        const mesh = new THREE.Mesh(geometry, material);
        
        // Rotate to match CAD orientation (y-up to z-up)
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(adjustedElement.x, adjustedElement.y, adjustedElement.z);
        return mesh;
      }
        
      case 'capsule': {
        // Create a capsule by combining a cylinder and two hemispheres
        const radius = element.radius || 1;
        const height = element.height || 1;
        const orientation = element.orientation || 'z';
        
        // Create a group to hold the parts
        const group = new THREE.Group();
        group.position.set(adjustedElement.x, adjustedElement.y, adjustedElement.z);
        
        // Create cylinder for middle section
        const cylinderHeight = Math.max(0, height - 2 * radius);
        
        if (cylinderHeight > 0) {
          const cylinderGeometry = new THREE.CylinderGeometry(radius, radius, cylinderHeight, 32);
          const cylinderMaterial = new THREE.MeshStandardMaterial();
          const cylinder = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
          
          // Position and rotate based on orientation
          if (orientation === 'z') {
            // Default orientation
          } else if (orientation === 'x') {
            cylinder.rotation.z = Math.PI / 2;
          } else { // y orientation
            cylinder.rotation.x = Math.PI / 2;
          }
          
          group.add(cylinder);
        }
        
        // Create hemispheres for ends
        const sphereGeometry = new THREE.SphereGeometry(radius, 32, 32);
        const sphereMaterial = new THREE.MeshStandardMaterial();
        
        // Create top hemisphere
        const topSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        
        // Create bottom hemisphere
        const bottomSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        
        // Position hemispheres based on orientation
        if (orientation === 'z') {
          topSphere.position.z = cylinderHeight / 2;
          bottomSphere.position.z = -cylinderHeight / 2;
        } else if (orientation === 'x') {
          topSphere.position.x = cylinderHeight / 2;
          bottomSphere.position.x = -cylinderHeight / 2;
        } else { // y orientation
          topSphere.position.y = cylinderHeight / 2;
          bottomSphere.position.y = -cylinderHeight / 2;
        }
        
        group.add(topSphere, bottomSphere);
        
        return group;
      }
      
      case 'component':
      case 'group': {
        // For groups and components, create a group and add all children
        const group = new THREE.Group();
        group.position.set(adjustedElement.x, adjustedElement.y, adjustedElement.z);
        
        if (element.elements && Array.isArray(element.elements)) {
          element.elements.forEach((childElement: any) => {
            const childObject = createThreeObject(childElement, { x: 0, y: 0, z: 0 });
            if (childObject) {
              group.add(childObject);
            }
          });
        }
        
        return group;
      }
        
      default:
        console.warn(`Unknown element type for THREE.js conversion: ${element.type}`);
        return null;
    }
  } catch (error) {
    console.error(`Error creating THREE object for element type ${element.type}:`, error);
    return null;
  }
}

/**
 * Process elements separately (fallback method)
 * @param elements Array of elements
 * @param settings The toolpath generation settings
 * @returns G-code string for the elements
 */
function processElementsSeparately(elements: any[], settings: any): string {
  let gcode = `; Processing ${elements.length} elements separately\n`;
  
  // Add header
  
  
  // Process each element independently
  elements.forEach((element, index) => {
    gcode += `; Processing element ${index + 1}: ${element.type}\n`;
    
    // Process specific element type
    switch (element.type) {
      case 'cube':
      case 'rectangle':
        gcode += generateBasicRectangleToolpath(element, settings);
        break;
      case 'sphere':
        gcode += generateBasicSphereToolpath(element, settings);
        break;
      case 'cylinder':
        gcode += generateBasicCylinderToolpath(element, settings);
        break;
      case 'capsule':
        gcode += generateBasicCapsuleToolpath(element, settings);
        break;
      default:
        gcode += `; Toolpath generation for ${element.type} not implemented in fallback mode\n`;
    }
    
    gcode += '\n';
  });
  
  
  
  return gcode;
}

/**
 * Define a basic implementation of generateUnifiedToolpath
 */
function generateUnifiedToolpath(mesh: THREE.Mesh, settings: any): string {
  const { toolDiameter, depth, stepdown, feedrate, plungerate } = settings;
  
  let gcode = '';
  
  // Get mesh bounding box
  const boundingBox = new THREE.Box3().setFromObject(mesh);
  const dimensions = new THREE.Vector3();
  boundingBox.getSize(dimensions);
  const center = new THREE.Vector3();
  boundingBox.getCenter(center);
  
  gcode += `; Mesh bounding box: width=${dimensions.x.toFixed(3)}, height=${dimensions.y.toFixed(3)}, depth=${dimensions.z.toFixed(3)}\n`;
  gcode += `; Mesh center: (${center.x.toFixed(3)}, ${center.y.toFixed(3)}, ${center.z.toFixed(3)})\n\n`;
  
  // Generate G-code header
  gcode += `G90 ; Absolute positioning\n`;
  gcode += `G21 ; Metric units\n`;
  gcode += `M3 S${settings.spindleSpeed || 12000} ; Start spindle\n`;
  gcode += `M8 ; Coolant on\n`;
  gcode += `G0 Z${settings.safeHeight || 5} ; Move to safe height\n\n`;
  
  // Determine top Z level
  const topZ = boundingBox.max.z;
  const bottomZ = boundingBox.min.z;
  const maxDepth = Math.min(depth || 10, topZ - bottomZ);
  
  // Generate contour toolpath based on Z levels
  for (let z = 0; z > -maxDepth; z -= stepdown) {
    const currentZ = Math.max(-maxDepth, z);
    const actualZ = topZ + currentZ;
    
    gcode += `; Z Level: ${actualZ.toFixed(3)}\n`;
    
    // Calculate section (slice) of the model at this Z height
    // This is a simplified approach - real implementation would use raycasting or proper mesh slicing
    const sliceRadius = Math.min(dimensions.x, dimensions.y) / 2;
    
    // Generate a circular toolpath at this height
    gcode += `G0 X${center.x.toFixed(3)} Y${(center.y + sliceRadius).toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
    gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
    gcode += `G3 X${center.x.toFixed(3)} Y${(center.y + sliceRadius).toFixed(3)} I0 J${(-sliceRadius).toFixed(3)} F${feedrate} ; Full circle\n`;
  }
  
  return gcode;
}

// Implementazioni basilari per processare gli elementi singolarmente
function generateBasicRectangleToolpath(element: any, settings: any): string {
  const { toolDiameter, depth, stepdown, feedrate, plungerate } = settings;
  
  let gcode = '';
  
  // Calculate rectangle coordinates
  const width = element.width || 10;
  const height = element.depth || element.height || 10;
  const startX = element.x - width / 2;
  const startY = element.y - height / 2;
  const topZ = element.z + (element.height || 10) / 2;
  
  // For each Z level
  for (let z = 0; z > -Math.min(depth, element.height || 10); z -= stepdown) {
    const currentZ = Math.max(-Math.min(depth, element.height || 10), z);
    const actualZ = topZ + currentZ;
    
    gcode += `; Z Level: ${actualZ.toFixed(3)}\n`;
    gcode += `G0 X${startX.toFixed(3)} Y${startY.toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
    gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
    
    // Contour
    gcode += `G1 X${(startX + width).toFixed(3)} Y${startY.toFixed(3)} F${feedrate} ; Side 1\n`;
    gcode += `G1 X${(startX + width).toFixed(3)} Y${(startY + height).toFixed(3)} F${feedrate} ; Side 2\n`;
    gcode += `G1 X${startX.toFixed(3)} Y${(startY + height).toFixed(3)} F${feedrate} ; Side 3\n`;
    gcode += `G1 X${startX.toFixed(3)} Y${startY.toFixed(3)} F${feedrate} ; Side 4\n`;
  }
  
  return gcode;
}

function generateBasicSphereToolpath(element: any, settings: any): string {
  const { toolDiameter, depth, stepdown, feedrate, plungerate } = settings;
  
  let gcode = '';
  const radius = element.radius || 10;
  const topZ = element.z + radius;
  
  // For each Z level
  for (let z = 0; z > -Math.min(depth, radius * 2); z -= stepdown) {
    const currentZ = Math.max(-Math.min(depth, radius * 2), z);
    const actualZ = topZ + currentZ;
    
    // Calculate radius at this height using the sphere equation
    const heightFromCenter = actualZ - element.z;
    const radiusAtHeight = Math.sqrt(Math.max(0, Math.pow(radius, 2) - Math.pow(heightFromCenter, 2)));
    
    gcode += `; Z Level: ${actualZ.toFixed(3)}, Radius: ${radiusAtHeight.toFixed(3)}\n`;
    gcode += `G0 X${(element.x + radiusAtHeight).toFixed(3)} Y${element.y.toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
    gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
    gcode += `G3 X${(element.x + radiusAtHeight).toFixed(3)} Y${element.y.toFixed(3)} I${(-radiusAtHeight).toFixed(3)} J0 F${feedrate} ; Full circle\n`;
  }
  
  return gcode;
}

function generateBasicCylinderToolpath(element: any, settings: any): string {
  const { toolDiameter, depth, stepdown, feedrate, plungerate } = settings;
  
  let gcode = '';
  const radius = element.radius || 10;
  const height = element.height || 20;
  const topZ = element.z + height / 2;
  
  // For each Z level
  for (let z = 0; z > -Math.min(depth, height); z -= stepdown) {
    const currentZ = Math.max(-Math.min(depth, height), z);
    const actualZ = topZ + currentZ;
    
    gcode += `; Z Level: ${actualZ.toFixed(3)}\n`;
    gcode += `G0 X${(element.x + radius).toFixed(3)} Y${element.y.toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
    gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
    gcode += `G3 X${(element.x + radius).toFixed(3)} Y${element.y.toFixed(3)} I${(-radius).toFixed(3)} J0 F${feedrate} ; Full circle\n`;
  }
  
  return gcode;
}

export function optimizeComponentMachiningOrder(component: any): string[] {
  if (!component.elements || !Array.isArray(component.elements) || component.elements.length === 0) {
    return [];
  }
  
  // Extract all elements and their geometries
  const elements = component.elements.map((el: any) => ({
    element: el,
    geometry: extractElementGeometry(el)
  }));
  
  // Group elements by Z level for layer-based machining
  const zLevels: { [key: string]: any[] } = {};
  
  elements.forEach(({ element, geometry }: { element: Element; geometry: { center: { z: number } } }) => {
    const zLevel = Math.round(geometry.center.z * 100) / 100; // Round to 2 decimal places
    if (!zLevels[zLevel]) {
      zLevels[zLevel] = [];
    }
    zLevels[zLevel].push(element);
  });
  
  // Sort Z levels from top to bottom
  const sortedZLevels = Object.keys(zLevels)
    .map(Number)
    .sort((a, b) => b - a); // Sort in descending order (top to bottom)
  
  // Create the final ordered list
  const orderedIds: string[] = [];
  
  sortedZLevels.forEach(zLevel => {
    const levelElements = zLevels[zLevel];
    
    // At each Z level, process inner elements before outer ones
    // Simple heuristic: sort by distance from component center
    levelElements.sort((a: any, b: any) => {
      const aDistance = Math.sqrt(Math.pow(a.x || 0, 2) + Math.pow(a.y || 0, 2));
      const bDistance = Math.sqrt(Math.pow(b.x || 0, 2) + Math.pow(b.y || 0, 2));
      return aDistance - bDistance; // Inner to outer
    });
    
    // Add the sorted elements to the final list
    levelElements.forEach((el: any) => {
      if (el.id) {
        orderedIds.push(el.id);
      }
    });
  });
  
  return orderedIds;
}

function generateBasicCapsuleToolpath(element: any, settings: any): string {
  const { toolDiameter, depth, stepdown, feedrate, plungerate } = settings;
  
  let gcode = '';
  const radius = element.radius || 10;
  const height = element.height || 20;
  const orientation = element.orientation || 'z';
  
  if (orientation === 'z') {
    // Z-oriented capsule
    const topZ = element.z + height / 2 + radius;
    const cylinderTopZ = element.z + height / 2;
    const cylinderBottomZ = element.z - height / 2;
    const bottomZ = element.z - height / 2 - radius;
    
    // For each Z level
    for (let z = 0; z > -Math.min(depth, topZ - bottomZ); z -= stepdown) {
      const currentZ = Math.max(-Math.min(depth, topZ - bottomZ), z);
      const actualZ = topZ + currentZ;
      
      // Determine shape at this level
      let radiusAtZ = radius;
      
      if (actualZ > cylinderTopZ) {
        // Top hemisphere
        const distFromTop = topZ - actualZ;
        radiusAtZ = Math.sqrt(Math.max(0, Math.pow(radius, 2) - Math.pow(radius - distFromTop, 2)));
      } else if (actualZ < cylinderBottomZ) {
        // Bottom hemisphere
        const distFromBottom = actualZ - bottomZ;
        radiusAtZ = Math.sqrt(Math.max(0, Math.pow(radius, 2) - Math.pow(radius - distFromBottom, 2)));
      }
      
      gcode += `; Z Level: ${actualZ.toFixed(3)}, Radius: ${radiusAtZ.toFixed(3)}\n`;
      gcode += `G0 X${(element.x + radiusAtZ).toFixed(3)} Y${element.y.toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
      gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
      gcode += `G3 X${(element.x + radiusAtZ).toFixed(3)} Y${element.y.toFixed(3)} I${(-radiusAtZ).toFixed(3)} J0 F${feedrate} ; Full circle\n`;
    }
  } else {
    // X or Y oriented capsule - simplified as ellipse
    const topZ = element.z + radius;
    const bottomZ = element.z - radius;
    
    // For each Z level
    for (let z = 0; z > -Math.min(depth, topZ - bottomZ); z -= stepdown) {
      const currentZ = Math.max(-Math.min(depth, topZ - bottomZ), z);
      const actualZ = topZ + currentZ;
      
      // Calculate ellipse dimensions
      const zDistance = Math.abs(actualZ - element.z);
      const radiusAtZ = Math.sqrt(Math.max(0, Math.pow(radius, 2) - Math.pow(zDistance, 2)));
      
      const radiusX = orientation === 'x' ? height / 2 + radius : radiusAtZ;
      const radiusY = orientation === 'y' ? height / 2 + radius : radiusAtZ;
      
      gcode += `; Z Level: ${actualZ.toFixed(3)}, RadiusX: ${radiusX.toFixed(3)}, RadiusY: ${radiusY.toFixed(3)}\n`;
      gcode += `G0 X${(element.x + radiusX).toFixed(3)} Y${element.y.toFixed(3)} Z${(actualZ + 5).toFixed(3)} ; Move above start position\n`;
      gcode += `G1 Z${actualZ.toFixed(3)} F${plungerate} ; Plunge to cutting depth\n`;
      
      // Generate ellipse approximation
      const numPoints = 36;
      for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        const x = element.x + radiusX * Math.cos(angle);
        const y = element.y + radiusY * Math.sin(angle);
        gcode += `G1 X${x.toFixed(3)} Y${y.toFixed(3)} F${feedrate} ; Ellipse point ${i}\n`;
      }
    }
  }
  
  return gcode;
}

/**
 * Generate toolpath for a single element
 * @param element The element to process
 * @param settings The toolpath generation settings
 * @returns G-code string for the element
 */
export function generateElementToolpath(element: any, settings: any): string {
  // Use the integratedToolpathGenerator for consistent handling
  try {
    const { 
      generateUnifiedComponentGcode, 
      convertToComponent3D 
    } = require('./integratedToolpathGenerator');
    
    return generateUnifiedComponentGcode(element, settings);
  } catch (error) {
    console.error("Error using unified toolpath generator:", error);
    
    // Fallback to basic implementations based on element type
    switch (element.type) {
      case 'cube':
      case 'rectangle':
        return generateBasicRectangleToolpath(element, settings);
      case 'sphere':
        return generateBasicSphereToolpath(element, settings);
      case 'cylinder':
        return generateBasicCylinderToolpath(element, settings);
      case 'capsule':
        return generateBasicCapsuleToolpath(element, settings);
      default:
        return `; Toolpath generation for ${element.type} not implemented in fallback mode\n`;
    }
  }
}

// Keep the existing implementations as fallbacks
// (existing implementations of generateCubeToolpath, generateSphereToolpath, etc.)