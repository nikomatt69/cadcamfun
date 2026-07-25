// templates.ts - Template predefiniti per Custom Elements
// Fornisce esempi pronti all'uso per gli utenti

import { CustomElementTemplate } from './types';

export const customElementTemplates: Record<string, CustomElementTemplate> = {
  basicBox: {
    name: 'Parametric Box',
    description: 'A simple parametric box with configurable dimensions',
    category: 'Basic Shapes',
    tags: ['box', 'basic', 'primitive'],
    parameters: {
      width: {
        type: 'number',
        default: 50,
        min: 1,
        max: 1000,
        step: 1,
        description: 'Box width',
        label: 'Width'
      },
      height: {
        type: 'number',
        default: 50,
        min: 1,
        max: 1000,
        step: 1,
        description: 'Box height',
        label: 'Height'
      },
      depth: {
        type: 'number',
        default: 50,
        min: 1,
        max: 1000,
        step: 1,
        description: 'Box depth',
        label: 'Depth'
      },
      color: {
        type: 'color',
        default: '#1e88e5',
        description: 'Box color',
        label: 'Color'
      },
      wireframe: {
        type: 'boolean',
        default: false,
        description: 'Show as wireframe',
        label: 'Wireframe'
      }
    },
    geometryCode: `// Parametric box geometry
const geometry = new THREE.BoxGeometry(
  parameters.width,
  parameters.height,
  parameters.depth
);

return geometry;`,
    materialConfig: {
      type: 'standard',
      properties: {
        color: 'parameters.color',
        wireframe: 'parameters.wireframe'
      }
    }
  },

  parametricGear: {
    name: 'Parametric Gear',
    description: 'A configurable gear with custom teeth count and dimensions',
    category: 'Mechanical',
    tags: ['gear', 'mechanical', 'parametric'],
    parameters: {
      teeth: {
        type: 'number',
        default: 20,
        min: 6,
        max: 100,
        step: 1,
        description: 'Number of teeth',
        label: 'Teeth Count'
      },
      module: {
        type: 'number',
        default: 1,
        min: 0.1,
        max: 10,
        step: 0.1,
        description: 'Gear module (size factor)',
        label: 'Module'
      },
      thickness: {
        type: 'number',
        default: 5,
        min: 1,
        max: 50,
        step: 0.5,
        description: 'Gear thickness',
        label: 'Thickness'
      },
      holeRadius: {
        type: 'number',
        default: 2,
        min: 0,
        max: 20,
        step: 0.1,
        description: 'Center hole radius (0 = no hole)',
        label: 'Hole Radius'
      },
      color: {
        type: 'color',
        default: '#b0bec5',
        description: 'Gear color',
        label: 'Color'
      }
    },
    geometryCode: `// Create parametric gear geometry
const teeth = parameters.teeth;
const module = parameters.module;
const thickness = parameters.thickness;
const holeRadius = parameters.holeRadius;

const pitchRadius = module * teeth / 2;
const addendumRadius = pitchRadius + module;
const dedendumRadius = pitchRadius - 1.25 * module;

const gearShape = new THREE.Shape();

// Generate gear tooth profile
for (let tooth = 0; tooth < teeth; tooth++) {
  const toothAngle = (tooth / teeth) * Math.PI * 2;
  const toothWidth = Math.PI / teeth * 0.4;
  
  // Outer radius points
  const angle1 = toothAngle - toothWidth / 2;
  const angle2 = toothAngle + toothWidth / 2;
  
  if (tooth === 0) {
    gearShape.moveTo(dedendumRadius * Math.cos(angle1), dedendumRadius * Math.sin(angle1));
  }
  
  gearShape.lineTo(addendumRadius * Math.cos(angle1), addendumRadius * Math.sin(angle1));
  gearShape.lineTo(addendumRadius * Math.cos(angle2), addendumRadius * Math.sin(angle2));
  gearShape.lineTo(dedendumRadius * Math.cos(angle2), dedendumRadius * Math.sin(angle2));
  
  // Connect to next tooth
  const nextAngle = ((tooth + 1) / teeth) * Math.PI * 2 - Math.PI / teeth * 0.6;
  gearShape.lineTo(dedendumRadius * Math.cos(nextAngle), dedendumRadius * Math.sin(nextAngle));
}

gearShape.closePath();

// Add center hole if specified
if (holeRadius > 0) {
  const hole = new THREE.Path();
  hole.absarc(0, 0, holeRadius, 0, Math.PI * 2, false);
  gearShape.holes.push(hole);
}

const extrudeSettings = {
  depth: thickness,
  bevelEnabled: false
};

return new THREE.ExtrudeGeometry(gearShape, extrudeSettings);`,
    materialConfig: {
      type: 'standard',
      properties: {
        color: 'parameters.color',
        metalness: 0.3,
        roughness: 0.4
      }
    }
  },

  lBracket: {
    name: 'L-Bracket',
    description: 'Configurable L-shaped mounting bracket',
    category: 'Structural',
    tags: ['bracket', 'mounting', 'structural'],
    parameters: {
      width1: {
        type: 'number',
        default: 50,
        min: 10,
        max: 200,
        step: 1,
        description: 'First arm width',
        label: 'Arm 1 Width'
      },
      width2: {
        type: 'number',
        default: 50,
        min: 10,
        max: 200,
        step: 1,
        description: 'Second arm width',
        label: 'Arm 2 Width'
      },
      thickness: {
        type: 'number',
        default: 5,
        min: 2,
        max: 20,
        step: 1,
        description: 'Bracket thickness',
        label: 'Thickness'
      },
      height: {
        type: 'number',
        default: 10,
        min: 5,
        max: 50,
        step: 1,
        description: 'Bracket height',
        label: 'Height'
      },
      color: {
        type: 'color',
        default: '#607d8b',
        description: 'Bracket color',
        label: 'Color'
      }
    },
    geometryCode: `// Create L-bracket geometry
const group = new THREE.Group();

// First arm (horizontal)
const arm1Geometry = new THREE.BoxGeometry(parameters.width1, parameters.height, parameters.thickness);
const arm1 = new THREE.Mesh(arm1Geometry);
arm1.position.set(parameters.width1 / 2, 0, 0);
group.add(arm1);

// Second arm (vertical)
const arm2Geometry = new THREE.BoxGeometry(parameters.thickness, parameters.height, parameters.width2);
const arm2 = new THREE.Mesh(arm2Geometry);
arm2.position.set(parameters.thickness / 2, 0, parameters.width2 / 2);
group.add(arm2);

return group;`,
    materialConfig: {
      type: 'standard',
      properties: {
        color: 'parameters.color',
        metalness: 0.7,
        roughness: 0.3
      }
    }
  },

  spiralSpring: {
    name: 'Spiral Spring',
    description: 'Configurable helical spring with custom parameters',
    category: 'Mechanical',
    tags: ['spring', 'mechanical', 'coil'],
    parameters: {
      radius: {
        type: 'number',
        default: 10,
        min: 1,
        max: 50,
        step: 0.5,
        description: 'Spring radius',
        label: 'Radius'
      },
      wireRadius: {
        type: 'number',
        default: 1,
        min: 0.1,
        max: 5,
        step: 0.1,
        description: 'Wire thickness',
        label: 'Wire Radius'
      },
      turns: {
        type: 'number',
        default: 8,
        min: 1,
        max: 20,
        step: 1,
        description: 'Number of turns',
        label: 'Turns'
      },
      height: {
        type: 'number',
        default: 50,
        min: 10,
        max: 200,
        step: 1,
        description: 'Total spring height',
        label: 'Height'
      },
      color: {
        type: 'color',
        default: '#9e9e9e',
        description: 'Spring color',
        label: 'Color'
      }
    },
    geometryCode: `// Create spiral spring geometry
const springRadius = parameters.radius;
const wireRadius = parameters.wireRadius;
const turns = parameters.turns;
const height = parameters.height;

const springPoints = [];
const segments = turns * 16; // 16 segments per turn

for (let i = 0; i <= segments; i++) {
  const t = i / segments;
  const angle = t * turns * Math.PI * 2;
  const x = springRadius * Math.cos(angle);
  const y = -height / 2 + t * height;
  const z = springRadius * Math.sin(angle);
  
  springPoints.push(new THREE.Vector3(x, y, z));
}

const springCurve = new THREE.CatmullRomCurve3(springPoints);
const springGeometry = new THREE.TubeGeometry(
  springCurve, 
  segments, 
  wireRadius, 
  8, 
  false
);

return springGeometry;`,
    materialConfig: {
      type: 'standard',
      properties: {
        color: 'parameters.color',
        metalness: 0.8,
        roughness: 0.2
      }
    }
  },

  customText3D: {
    name: '3D Text',
    description: 'Extruded 3D text with custom message and styling',
    category: 'Text & Symbols',
    tags: ['text', '3d', 'typography'],
    parameters: {
      text: {
        type: 'string',
        default: 'HELLO',
        description: 'Text to display',
        label: 'Text'
      },
      size: {
        type: 'number',
        default: 20,
        min: 5,
        max: 100,
        step: 1,
        description: 'Text size',
        label: 'Size'
      },
      depth: {
        type: 'number',
        default: 5,
        min: 1,
        max: 20,
        step: 0.5,
        description: 'Text extrusion depth',
        label: 'Depth'
      },
      font: {
        type: 'select',
        default: 'helvetiker',
        options: ['helvetiker', 'gentilis', 'droid sans', 'droid serif'],
        description: 'Font family',
        label: 'Font'
      },
      color: {
        type: 'color',
        default: '#4285f4',
        description: 'Text color',
        label: 'Color'
      }
    },
    geometryCode: `// Create 3D text geometry
// Note: This is a simplified version - real implementation would need font loading
const textWidth = parameters.text.length * parameters.size * 0.6;
const textHeight = parameters.size;
const textDepth = parameters.depth;

// Create a placeholder box geometry (replace with actual TextGeometry when font is loaded)
const geometry = new THREE.BoxGeometry(textWidth, textHeight, textDepth);

// Add text metadata for later rendering
geometry.userData.text = parameters.text;
geometry.userData.isTextPlaceholder = true;

return geometry;`,
    materialConfig: {
      type: 'standard',
      properties: {
        color: 'parameters.color',
        metalness: 0.1,
        roughness: 0.8
      }
    }
  },

  honeycombPattern: {
    name: 'Honeycomb Pattern',
    description: 'Hexagonal honeycomb pattern with configurable parameters',
    category: 'Patterns',
    tags: ['honeycomb', 'hexagon', 'pattern'],
    parameters: {
      cellSize: {
        type: 'number',
        default: 10,
        min: 2,
        max: 50,
        step: 1,
        description: 'Size of each hexagonal cell',
        label: 'Cell Size'
      },
      rows: {
        type: 'number',
        default: 5,
        min: 1,
        max: 20,
        step: 1,
        description: 'Number of rows',
        label: 'Rows'
      },
      cols: {
        type: 'number',
        default: 5,
        min: 1,
        max: 20,
        step: 1,
        description: 'Number of columns',
        label: 'Columns'
      },
      thickness: {
        type: 'number',
        default: 2,
        min: 0.5,
        max: 10,
        step: 0.5,
        description: 'Pattern thickness',
        label: 'Thickness'
      },
      color: {
        type: 'color',
        default: '#ffeb3b',
        description: 'Pattern color',
        label: 'Color'
      }
    },
    geometryCode: `// Create honeycomb pattern
const group = new THREE.Group();
const cellSize = parameters.cellSize;
const rows = parameters.rows;
const cols = parameters.cols;
const thickness = parameters.thickness;

// Create hexagonal shape
const hexShape = new THREE.Shape();
for (let i = 0; i < 6; i++) {
  const angle = (i / 6) * Math.PI * 2;
  const x = cellSize * Math.cos(angle);
  const y = cellSize * Math.sin(angle);
  
  if (i === 0) {
    hexShape.moveTo(x, y);
  } else {
    hexShape.lineTo(x, y);
  }
}
hexShape.closePath();

const extrudeSettings = {
  depth: thickness,
  bevelEnabled: false
};

const hexGeometry = new THREE.ExtrudeGeometry(hexShape, extrudeSettings);

// Create honeycomb pattern
for (let row = 0; row < rows; row++) {
  for (let col = 0; col < cols; col++) {
    const hex = new THREE.Mesh(hexGeometry);
    
    // Honeycomb offset pattern
    const offsetX = col * cellSize * 1.5;
    const offsetY = row * cellSize * Math.sqrt(3);
    
    // Stagger every other row
    if (row % 2 === 1) {
      hex.position.x = offsetX + cellSize * 0.75;
    } else {
      hex.position.x = offsetX;
    }
    
    hex.position.y = offsetY;
    hex.position.z = 0;
    
    group.add(hex);
  }
}

return group;`,
    materialConfig: {
      type: 'standard',
      properties: {
        color: 'parameters.color',
        metalness: 0.2,
        roughness: 0.6
      }
    }
  }
};

// Utility function per ottenere template per categoria
export const getTemplatesByCategory = (category?: string): CustomElementTemplate[] => {
  const templates = Object.values(customElementTemplates);
  
  if (category) {
    return templates.filter(template => template.category === category);
  }
  
  return templates;
};

// Ottieni tutte le categorie disponibili
export const getTemplateCategories = (): string[] => {
  const categories = new Set(Object.values(customElementTemplates).map(t => t.category));
  return Array.from(categories).sort();
};

// Crea un custom element definition da un template
export const createDefinitionFromTemplate = (
  templateKey: string, 
  customName?: string
): Omit<import('./types').CustomElementDefinition, 'id' | 'created' | 'modified'> | null => {
  const template = customElementTemplates[templateKey];
  if (!template) return null;
  
  return {
    name: customName || template.name,
    description: template.description,
    category: template.category,
    tags: [...template.tags],
    version: '1.0.0',
    author: 'User',
    parameters: { ...template.parameters },
    geometryCode: template.geometryCode,
    materialConfig: template.materialConfig ? { ...template.materialConfig } : undefined,
    previewConfig: template.previewConfig ? { ...template.previewConfig } : undefined
  };
};
