// src/lib/libraryTransform.ts
import * as THREE from 'three';

/**
 * Transform a library item to a CAD element format suitable for the elements store
 */
export function transformLibraryItemToCADElement(item: any, position?: {x: number, y: number, z: number}): any {
  // Handle different possible inputs (direct LibraryItem or predefined component)
  const componentItem = item.category === 'component' ? item : 
                         item.data ? {
                           name: item.name,
                           description: item.description,
                           category: 'component',
                           type: item.data.type || 'custom',
                           properties: item.data.specifications || {},
                           data: {
                             geometry: { elements: [item.data] }
                           }
                         } : item;
  
  // Determine the source of properties
  const properties = componentItem.properties || 
                    (componentItem.data?.geometry?.elements?.[0] || {});
  
  // Determine element type
  let elementType = componentItem.type;
  
  // Map library types to CAD element types if needed
  const typeMapping: {[key: string]: string} = {
    'cylinder': 'line',
    'hexPrism': 'cube',
    'box': 'cube',
    'rectangle': 'rectangle',
    'circle': 'circle',
    'workpiece': 'workpiece',
    'cone': 'cone'
  };
  
  elementType = typeMapping[elementType] || elementType;
  
  // Generate a random color if none is provided
  const getRandomColor = () => {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  };
  
  // Use provided position if available, otherwise use defaults
  const posX = position ? position.x : (properties.x || 0);
  const posY = position ? position.y : (properties.y || 0);
  const posZ = position ? position.z : (properties.z || 0);
  
  // Add component metadata for tracking
  const componentMetadata = {
    componentId: item.id || componentItem.id || `component-${Date.now()}`,
    originalLibraryItem: item
  };
  
  // Base properties for all CAD elements
  const baseElement = {
    id: `element-${Date.now()}`,
    name: componentItem.name || 'Unnamed Component',
    description: componentItem.description || '',
    type: elementType,
    color: properties.color || getRandomColor(),
    ...componentMetadata
  };
  
  // Add specific properties based on element type
  switch (elementType) {
    case 'workpiece':
      return {
        ...baseElement,
        x: posX,
        y: posY,
        z: posZ,
        width: properties.width || 200,
        height: properties.height || 20,
        depth: properties.depth || 100,
        wireframe: properties.wireframe || false
      };
      
    case 'line':
      return {
        ...baseElement,
        x1: posX,
        y1: posY,
        z1: posZ,
        x2: posX + (properties.width || 100),
        y2: posY + (properties.height || 0),
        z2: posZ,
        linewidth: properties.linewidth || 1
      };
      
    case 'rectangle':
      return {
        ...baseElement,
        x: posX,
        y: posY,
        z: posZ,
        width: properties.width || 100,
        height: properties.height || 50,
        angle: properties.angle || 0
      };
      
    case 'circle':
      return {
        ...baseElement,
        x: posX,
        y: posY,
        z: posZ,
        radius: properties.radius || 25
      };
      
    case 'cube':
      return {
        ...baseElement,
        x: posX,
        y: posY,
        z: posZ,
        width: properties.width || 50,
        height: properties.height || 50,
        depth: properties.depth || 50,
        wireframe: properties.wireframe || false
      };
      
    case 'sphere':
      return {
        ...baseElement,
        x: posX,
        y: posY,
        z: posZ,
        radius: properties.radius || 25,
        wireframe: properties.wireframe || false
      };
      
    case 'component':
      // Handle the special case for direct component placement
      return {
        ...baseElement,
        x: posX,
        y: posY,
        z: posZ,
        componentId: typeof item === 'string' ? item : (item.id || componentItem.id),
        data: typeof item === 'string' ? {} : (item.data || componentItem.data || {})
      };
      
    default:
      // For unrecognized types, create a generic cube
      console.warn(`Unrecognized element type: ${elementType}, using default cube`);
      return {
        ...baseElement,
        type: 'cube',
        x: posX,
        y: posY,
        z: posZ,
        width: 50,
        height: 50,
        depth: 50,
        wireframe: false
      };
  }
}

/**
 * Create a ThreeJS preview object from a component
 */
export function createComponentPreview(component: any): THREE.Object3D | null {
  // Handle string ID case
  if (typeof component === 'string') {
    // Create a simple placeholder
    const placeholderGeometry = new THREE.BoxGeometry(50, 50, 50);
    const placeholderMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a90e2,
      wireframe: true,
      transparent: true,
      opacity: 0.7
    });
    const placeholder = new THREE.Mesh(placeholderGeometry, placeholderMaterial);
    
    // Add label
    const label = new THREE.Group();
    label.userData.isPreview = true;
    label.userData.componentId = component;
    label.add(placeholder);
    
    return label;
  }
  
  // Determine the data source
  let elements = [];
  
  if (component.data?.geometry?.elements) {
    // Standard library component format
    elements = component.data.geometry.elements;
  } else if (component.elements && Array.isArray(component.elements)) {
    // Component with root level elements array
    elements = component.elements;
  } else if (component.properties) {
    // Direct properties format from LibraryItem
    elements = [component.properties];
  } else if (component.type) {
    // Single element format
    elements = [component];
  } else {
    return null;
  }
  
  const group = new THREE.Group();
  group.userData.isPreview = true;
  group.userData.componentId = component.id || '';
  
  // Function to determine color
  const getColor = (element: any) => {
    if (element.color) {
      return element.color.startsWith('#') 
        ? parseInt(element.color.replace('#', ''), 16)
        : element.color;
    }
    
    if (component.color) {
      return component.color.startsWith('#') 
        ? parseInt(component.color.replace('#', ''), 16)
        : component.color;
    }
    
    return 0x1e88e5; // Default blue color
  };
  
  // Create 3D objects for each element
  elements.forEach((element: any) => {
    let object: THREE.Object3D | null = null;
    const material = new THREE.MeshStandardMaterial({
      color: getColor(element),
      wireframe: element.wireframe || false,
      transparent: true, // Sempre trasparente per la preview
      opacity: 0.7, // Opacità fissa per la preview
    });
    
    switch (element.type) {
      case 'workpiece':
        const workpieceGeometry = new THREE.BoxGeometry(
          element.width || 200,
          element.height || 20,
          element.depth || 100
        );
        object = new THREE.Mesh(workpieceGeometry, material);
        
        // Add wireframe if not already a wireframe
        if (!element.wireframe) {
          const edges = new THREE.EdgesGeometry(workpieceGeometry);
          const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
          const wireframe = new THREE.LineSegments(edges, edgesMaterial);
          object.add(wireframe);
        }
        break;
        
      case 'cylinder':
      case 'tube':
        const tubeGeometry = new THREE.CylinderGeometry(
          element.radius || element.diameter / 2 || 10,
          element.radius || element.diameter / 2 || 10,
          element.height || 100,
          32
        );
        object = new THREE.Mesh(tubeGeometry, material);
        break;
        
      case 'cone':
        const coneGeometry = new THREE.ConeGeometry(
          element.radiusBottom || element.radius || 25,
          element.height || 50,
          32
        );
        object = new THREE.Mesh(coneGeometry, material);
        break;
        
      case 'hexPrism':
        const hexGeometry = new THREE.CylinderGeometry(
          element.radius || element.diameter / 2 || 10,
          element.radius || element.diameter / 2 || 10,
          element.height || 10,
          6
        );
        object = new THREE.Mesh(hexGeometry, material);
        break;
        
      case 'box':
      case 'cube':
      case 'rectangle':
        const boxGeometry = new THREE.BoxGeometry(
          element.width || 50,
          element.height || 50,
          element.depth || (element.type === 'rectangle' ? 1 : 50)
        );
        object = new THREE.Mesh(boxGeometry, material);
        break;
        
      case 'circle':
        const circleGeometry = new THREE.CircleGeometry(
          element.radius || 25,
          32
        );
        object = new THREE.Mesh(circleGeometry, material);
        // Rotate to face upward in preview
        object.rotation.x = -Math.PI / 2;
        break;
        
      case 'sphere':
        const sphereGeometry = new THREE.SphereGeometry(
          element.radius || 25,
          32,
          32
        );
        object = new THREE.Mesh(sphereGeometry, material);
        break;
        
      case 'torus':
        const torusGeometry = new THREE.TorusGeometry(
          element.radius || 30,
          element.tube || 10,
          16,
          100
        );
        object = new THREE.Mesh(torusGeometry, material);
        break;
        
      case 'line':
        const lineMaterial = new THREE.LineBasicMaterial({
          color: getColor(element),
          linewidth: element.linewidth || 1
        });
        const lineGeometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(element.x1 || 0, element.y1 || 0, element.z1 || 0),
          new THREE.Vector3(element.x2 || 100, element.y2 || 0, element.z2 || 0)
        ]);
        object = new THREE.Line(lineGeometry, lineMaterial);
        break;
        
      case 'polygon':
        const sides = element.sides || 5;
        const polygonGeometry = new THREE.CircleGeometry(
          element.radius || 50,
          sides
        );
        const polygonMaterial = new THREE.MeshBasicMaterial({
          color: getColor(element),
          wireframe: true,
          side: THREE.DoubleSide
        });
        object = new THREE.Mesh(polygonGeometry, polygonMaterial);
        // Rotate to face upward in preview
        object.rotation.x = -Math.PI / 2;
        break;
    }
    
    // Position the object if coordinates are provided
    if (object) {
      // For positioned elements
      if (element.x !== undefined && element.y !== undefined) {
        object.position.set(
          element.x || 0,
          element.y || 0,
          element.z || 0
        );
      } 
      // For positioned elements with different property names
      else if (element.position) {
        object.position.set(
          element.position.x || 0,
          element.position.y || 0,
          element.position.z || 0
        );
      }
      
      // Add to group
      group.add(object);
    }
  });
  
  // If no objects were created, return null
  if (group.children.length === 0) {
    return null;
  }
  
  // Center the group by calculating its bounding box
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  
  group.children.forEach(child => {
    child.position.x -= center.x;
    child.position.y -= center.y;
    child.position.z -= center.z;
  });
  
  group.position.set(0, 0, 0);
  
  // Add bounding box helper for reference in preview mode
  const boundingBox = new THREE.Box3().setFromObject(group);
  const boxHelper = new THREE.Box3Helper(boundingBox, new THREE.Color(0x4a90e2));
  group.add(boxHelper);
  
  return group;
}