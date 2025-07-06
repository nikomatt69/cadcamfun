/**
 * Element Database for MCP Server
 *
 * In a real implementation, this would interface with your CAD engine or database.
 * For this example, we're using a mock implementation.
 */
import { logger } from "./logger";

// Mock database of element details
const elementDetailsDb: Record<string, any> = {
  // Some predefined elements for testing
  "test_cube_1": {
    name: "Test Cube",
    description: "A test cube for development",
    type: "cube",
    dimensions: {
      width: 100,
      height: 100,
      depth: 100
    },
    position: {
      x: 0,
      y: 0,
      z: 0
    },
    rotation: {
      x: 0,
      y: 0,
      z: 0
    },
    material: "aluminum"
  },
  "test_cylinder_1": {
    name: "Test Cylinder",
    description: "A test cylinder for development",
    type: "cylinder",
    dimensions: {
      radius: 50,
      height: 200
    },
    position: {
      x: 150,
      y: 0,
      z: 0
    },
    rotation: {
      degrees: 0,
      x: 0,
      y: 0,
      z: 0
    },
    material: "steel"
  }
};

/**
 * Get details for an element
 */
export async function getElementDetails(id: string, type: string): Promise<any> {
  logger.debug(`Getting details for element ${id} of type ${type}`);

  // Check if we have predefined details for this element
  if (elementDetailsDb[id]) {
    return elementDetailsDb[id];
  }

  // Generate mock details based on element type
  switch (type) {
    case "cube":
      return {
        name: `Cube ${id.substring(0, 8)}`,
        description: "A cube element",
        type: "cube",
        dimensions: {
          width: 100,
          height: 100,
          depth: 100
        },
        position: {
          x: Math.random() * 100 - 50,
          y: Math.random() * 100 - 50,
          z: Math.random() * 100 - 50
        },
        material: "aluminum",
        rotation: {
          degrees: 0,
          x: 0,
          y: 0,
          z: 0
        }
      };

    case "cylinder":
      return {
        name: `Cylinder ${id.substring(0, 8)}`,
        description: "A cylinder element",
        type: "cylinder",
        dimensions: {
          radius: 25,
          height: 100
        },
        position: {
          x: Math.random() * 100 - 50,
          y: Math.random() * 100 - 50,
          z: Math.random() * 100 - 50
        },
        material: "steel",
        rotation: {
          degrees: 0,
          x: 0,
          y: 0,
          z: 0
        }
      };

    case "sphere":
      return {
        name: `Sphere ${id.substring(0, 8)}`,
        description: "A sphere element",
        type: "sphere",
        dimensions: {
          radius: 50
        },
        position: {
          x: Math.random() * 100 - 50,
          y: Math.random() * 100 - 50,
          z: Math.random() * 100 - 50
        },
        material: "plastic",
        rotation: {
          degrees: 0,
          x: 0,
          y: 0,
          z: 0
        }
      };

    case "face":
      return {
        name: `Face ${id.substring(0, 8)}`,
        description: "A face element",
        type: "face",
        parentId: `parent_${Math.random().toString(36).substring(2, 9)}`,
        area: Math.random() * 10000,
        normal: {
          x: Math.random(),
          y: Math.random(),
          z: Math.random()
        },
        position: {
          x: Math.random() * 100 - 50,
          y: Math.random() * 100 - 50,
          z: Math.random() * 100 - 50
        },
        rotation: {
          degrees: 0,
          x: 0,
          y: 0,
          z: 0
        }
      };

    case "sketch":
      return {
        name: `Sketch ${id.substring(0, 8)}`,
        description: "A sketch element",
        type: "sketch",
        entities: Math.floor(Math.random() * 10) + 1,
        plane: "XY",
        position: {
          x: Math.random() * 100 - 50,
          y: Math.random() * 100 - 50,
          z: Math.random() * 100 - 50
        },
        rotation: {
          degrees: 0,
          x: 0,
          y: 0,
          z: 0
        }
      };

    default:
      return {
        name: `${type} ${id.substring(0, 8)}`,
        description: `A ${type} element`,
        type: type,
        position: {
          x: Math.random() * 100 - 50,
          y: Math.random() * 100 - 50,
          z: Math.random() * 100 - 50
        },
        rotation: {
          degrees: 0,
          x: 0,
          y: 0,
          z: 0
        }
      };
  }
}

/**
 * Save element details (mock implementation)
 */
export async function saveElementDetails(id: string, details: any): Promise<boolean> {
  logger.debug(`Saving details for element ${id}`);

  // In a real implementation, this would save to a database
  elementDetailsDb[id] = {
    ...details,
    lastUpdated: new Date().toISOString()
  };

  return true;
}
