/**
 * Utility functions for working with CAD elements
 */

// Type for element metadata extraction
export type ElementMetadata = {
    type: string;
    specifications: Record<string, any>;
  };
  
  /**
   * Extract structured metadata from a CAD element
   */
  export const extractElementMetadata = (element: any): ElementMetadata => {
    // Element type handlers
    const handlers: Record<string, (element: any) => ElementMetadata> = {
      line: (element) => ({
        type: 'mechanical',
        specifications: {
          start: { x: element.x1, y: element.y1, z: element.z1 },
          end: { x: element.x2, y: element.y2, z: element.z2 },
          length: Math.sqrt(
            Math.pow(element.x2 - element.x1, 2) + 
            Math.pow(element.y2 - element.y1, 2) + 
            Math.pow((element.z2 || 0) - (element.z1 || 0), 2)
          ),
          color: element.color
        }
      }),
      circle: (element) => ({
        type: 'geometric',
        specifications: {
          center: { x: element.x, y: element.y, z: element.z || 0 },
          radius: element.radius,
          color: element.color
        }
      }),
      rectangle: (element) => ({
        type: 'structural',
        specifications: {
          center: { x: element.x, y: element.y, z: element.z || 0 },
          width: element.width,
          height: element.height,
          angle: element.angle || 0,
          color: element.color
        }
      }),
      cube: (element) => ({
        type: 'mechanical',
        specifications: {
          center: { x: element.x, y: element.y, z: element.z || 0 },
          dimensions: {
            width: element.width,
            height: element.height,
            depth: element.depth
          },
          color: element.color,
          wireframe: element.wireframe || false
        }
      }),
      sphere: (element) => ({
        type: 'geometric',
        specifications: {
          center: { x: element.x, y: element.y, z: element.z || 0 },
          radius: element.radius,
          color: element.color,
          wireframe: element.wireframe || false
        }
      }),
      cylinder: (element) => ({
        type: 'mechanical',
        specifications: {
          center: { x: element.x, y: element.y, z: element.z || 0 },
          radius: element.radius,
          height: element.height,
          segments: element.segments || 32,
          color: element.color,
          wireframe: element.wireframe || false
        }
      }),
      default: (element) => ({
        type: 'custom',
        specifications: {
          position: { x: element.x, y: element.y, z: element.z || 0 },
          type: element.type
        }
      })
    };
  
    // Call the appropriate handler or fallback to default
    const handler = handlers[element.type] || handlers.default;
    return handler(element);
  };
  
  /**
   * Generate tags based on element properties
   */
  export const generateElementTags = (element: any): string[] => {
    const tags: string[] = [element.type];
    
    // Add dimension-related tags
    if (element.width && element.height) {
      if (element.width === element.height) {
        tags.push('square');
      } else {
        tags.push('rectangular');
      }
    }
    
    if (element.radius) {
      tags.push('circular');
    }
    
    if (element.depth) {
      tags.push('3d');
    }
    
    // Add color-based tags
    if (element.color) {
      tags.push('colored');
    }
    
    // Add material-based tags
    if (element.material) {
      tags.push(element.material.toLowerCase());
    }
    
    // Add wireframe tag
    if (element.wireframe) {
      tags.push('wireframe');
    }
    
    return Array.from(new Set(tags)); // Rimuove i duplicati
  };
  
  /**
   * Genera una stringa descrittiva per un elemento
   */
  export const generateElementDescription = (element: any): string => {
    let description = `${element.type.charAt(0).toUpperCase() + element.type.slice(1)} element`;
    
    // Add dimensions to description
    if (element.width && element.height) {
      description += ` (${element.width} × ${element.height}`;
      if (element.depth) description += ` × ${element.depth}`;
      description += ')';
    } else if (element.radius) {
      description += ` (radius: ${element.radius})`;
    } else if (element.x1 !== undefined && element.x2 !== undefined) {
      const length = Math.sqrt(
        Math.pow(element.x2 - element.x1, 2) + 
        Math.pow(element.y2 - element.y1, 2) + 
        Math.pow((element.z2 || 0) - (element.z1 || 0), 2)
      );
      description += ` (length: ${length.toFixed(2)})`;
    }
    
    // Add color info if present
    if (element.color) {
      description += `, color: ${element.color}`;
    }
    
    return description;
  };
  
  /**
   * Generate a name for an element based on its properties
   */
  export const generateElementName = (element: any): string => {
    const baseType = element.type.charAt(0).toUpperCase() + element.type.slice(1);
    const timestamp = Date.now().toString().slice(-6);
    
    let name = `${baseType}-${timestamp}`;
    
    // Add size indicator if applicable
    if (element.radius) {
      name = `${baseType}-R${element.radius}-${timestamp}`;
    } else if (element.width && element.height) {
      name = `${baseType}-${element.width}x${element.height}-${timestamp}`;
    }
    
    return name;
  };