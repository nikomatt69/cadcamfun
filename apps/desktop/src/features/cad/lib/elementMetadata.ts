/** Library metadata for a CAD element: its category, specifications and suggested tags. */
export type ElementMetadataExtractor = (element: any) => {
  type: string;
  specifications: Record<string, any>;
};

// Metadata extractors for different element types
export const elementMetadataExtractors: Record<string, ElementMetadataExtractor> = {
  line: element => ({
    type: "mechanical",
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
  circle: element => ({
    type: "geometric",
    specifications: {
      center: { x: element.x, y: element.y, z: element.z || 0 },
      radius: element.radius,
      color: element.color
    }
  }),
  rectangle: element => ({
    type: "structural",
    specifications: {
      center: { x: element.x, y: element.y, z: element.z || 0 },
      width: element.width,
      height: element.height,
      angle: element.angle || 0,
      color: element.color
    }
  }),
  cube: element => ({
    type: "mechanical",
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
  sphere: element => ({
    type: "geometric",
    specifications: {
      center: { x: element.x, y: element.y, z: element.z || 0 },
      radius: element.radius,
      color: element.color,
      wireframe: element.wireframe || false
    }
  }),
  cylinder: element => ({
    type: "mechanical",
    specifications: {
      center: { x: element.x, y: element.y, z: element.z || 0 },
      radius: element.radius,
      height: element.height,
      segments: element.segments || 32,
      color: element.color,
      wireframe: element.wireframe || false
    }
  }),
  cone: element => ({
    type: "geometric",
    specifications: {
      baseCenter: { x: element.x, y: element.y, z: element.z || 0 },
      radius: element.radius,
      height: element.height,
      segments: element.segments || 32,
      color: element.color,
      wireframe: element.wireframe || false
    }
  }),
  torus: element => ({
    type: "geometric",
    specifications: {
      center: { x: element.x, y: element.y, z: element.z || 0 },
      mainRadius: element.radius,
      tubeRadius: element.tube || element.radius / 4,
      color: element.color,
      wireframe: element.wireframe || false
    }
  }),
  polygon: element => ({
    type: "geometric",
    specifications: {
      center: { x: element.x, y: element.y, z: element.z || 0 },
      radius: element.radius,
      sides: element.sides || element.points?.length,
      color: element.color,
      wireframe: element.wireframe || false
    }
  }),
  extrusion: element => ({
    type: "structural",
    specifications: {
      center: { x: element.x, y: element.y, z: element.z || 0 },
      shape: element.shape,
      depth: element.depth,
      width: element.width,
      height: element.height,
      bevel: element.bevel || false,
      color: element.color,
      wireframe: element.wireframe || false
    }
  }),
  tube: element => ({
    type: "mechanical",
    specifications: {
      pathPoints: element.path?.length || 0,
      radius: element.radius,
      tubularSegments: element.tubularSegments || 64,
      radialSegments: element.radialSegments || 8,
      closed: element.closed || false,
      color: element.color,
      wireframe: element.wireframe || false
    }
  }),
  lathe: element => ({
    type: "geometric",
    specifications: {
      center: { x: element.x, y: element.y, z: element.z || 0 },
      profilePoints: element.points?.length || 0,
      segments: element.segments || 12,
      phiStart: element.phiStart || 0,
      phiLength: element.phiLength || Math.PI * 2,
      color: element.color,
      wireframe: element.wireframe || false
    }
  }),
  text: element => ({
    type: "annotation",
    specifications: {
      position: { x: element.x, y: element.y, z: element.z || 0 },
      content: element.text,
      fontSize: element.size,
      depth: element.depth || 0,
      color: element.color
    }
  }),
  grid: element => ({
    type: "reference",
    specifications: {
      position: { x: element.x, y: element.y, z: element.z || 0 },
      size: element.size || 100,
      divisions: element.divisions || 10,
      plane: element.plane || "xy",
      centerLineColor: element.colorCenterLine,
      gridColor: element.colorGrid
    }
  }),
  workpiece: element => ({
    type: "manufacturing",
    specifications: {
      dimensions: {
        width: element.width,
        height: element.height,
        depth: element.depth
      },
      material: element.material || "unknown",
      color: element.color,
      wireframe: element.wireframe || false
    }
  }),
  group: element => ({
    type: "composite",
    specifications: {
      center: { x: element.x, y: element.y, z: element.z || 0 },
      elementCount: element.elements?.length || 0
    }
  }),
  default: element => ({
    type: "custom",
    specifications: {
      position: { x: element.x, y: element.y, z: element.z || 0 },
      type: element.type
    }
  })
};

/**
 * Generate suggested tags for a component based on its type and properties
 */
export const generateSuggestedTags = (element: any, elementType: string, specifications: any): string[] => {
  const tags: string[] = [elementType];

  // Add dimension-related tags
  if (element.width && element.height) {
    if (element.width === element.height) {
      tags.push("square");
    } else {
      tags.push("rectangular");
    }
  }

  if (element.radius) {
    tags.push("circular");
  }

  if (element.depth) {
    tags.push("3d");
  }

  // Add color-based tags
  if (element.color) {
    // Common color names
    const colorMap: Record<string, string> = {
      "#ff0000": "red",
      "#00ff00": "green",
      "#0000ff": "blue",
      "#ffff00": "yellow",
      "#00ffff": "cyan",
      "#ff00ff": "magenta",
      "#000000": "black",
      "#ffffff": "white",
      "#808080": "gray"
    };

    const colorTag = colorMap[element.color.toLowerCase()];
    if (colorTag) {
      tags.push(colorTag);
    }
  }

  // Add material-based tags
  if (element.material) {
    tags.push(element.material.toLowerCase());
  }

  // Add wireframe tag
  if (element.wireframe) {
    tags.push("wireframe");
  }

  return Array.from(new Set(tags)); // Rimuove i duplicati
};

