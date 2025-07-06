import { Element } from "@/src/store/elementsStore"; // Assuming this is the base Element type
import { ElementType } from "@/src/types/ai"; // To check against known element types

// Interface for the validation result
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// Type guard to check if a value is a number
function isNumber(value: any): value is number {
  return typeof value === "number" && !isNaN(value);
}

// Type guard to check if a value is a string
function isString(value: any): value is string {
  return typeof value === "string";
}

// Type guard to check if a value is an object (and not null)
function isObject(value: any): value is object {
  return typeof value === "object" && value !== null;
}

/**
 * Validates an array of potential CAD element objects.
 * Checks for required base properties and some type-specific properties.
 * Does not modify the elements or apply defaults.
 *
 * @param elements - The array of potential elements to validate.
 * @returns A ValidationResult object { valid: boolean, errors: string[] }.
 */
export function validateCADElements(elements: any): ValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(elements)) {
    return { valid: false, errors: ["Input must be an array of elements."] };
  }

  elements.forEach((rawEl, index) => {
    const elementPrefix = `Element at index ${index}`;

    if (!isObject(rawEl)) {
      errors.push(`${elementPrefix}: Must be an object.`);
      return; // Skip further checks for this item
    }

    // Cast to Partial<Element> to satisfy the linter while still checking existence
    const el = rawEl as Partial<Element>;

    // Basic required properties
    if (!el.id || !isString(el.id)) {
      errors.push(`${elementPrefix}: Missing or invalid required property 'id' (string).`);
    }
    if (!el.type || !isString(el.type)) {
      errors.push(`${elementPrefix}: Missing or invalid required property 'type' (string).`);
    }
    // Check if type is a known ElementType (optional, but good practice)
    // Note: Requires ElementType enum/type to be comprehensive
    // if (el.type && !Object.values(ElementType).includes(el.type)) {
    //   errors.push(`${elementPrefix}: Unknown element type '${el.type}'.`);
    // }

    // Positional properties (assuming they are generally required)
    if (!isNumber(el.x)) {
      errors.push(`${elementPrefix}: Missing or invalid required property 'x' (number).`);
    }
    if (!isNumber(el.y)) {
      errors.push(`${elementPrefix}: Missing or invalid required property 'y' (number).`);
    }
    if (!isNumber(el.z)) {
      errors.push(`${elementPrefix}: Missing or invalid required property 'z' (number).`);
    }

    // Type-specific required properties (add more as needed based on ElementType)
    switch (el.type) {
      case "cube":
      case "prism":
      case "rectangle": // Rectangles might only need width/height in 2D context
        if (!isNumber(el.width))
          errors.push(`${elementPrefix} (type: ${el.type}): Missing or invalid 'width' (number).`);
        if (!isNumber(el.height))
          errors.push(`${elementPrefix} (type: ${el.type}): Missing or invalid 'height' (number).`);
        // Depth might be optional for 2D rectangles
        if (el.type !== "rectangle" && !isNumber(el.depth))
          errors.push(`${elementPrefix} (type: ${el.type}): Missing or invalid 'depth' (number).`);
        break;
      case "sphere":
      case "circle":
      case "cylinder": // Cylinders also need height
      case "cone": // Cones need height, radiusBottom, radiusTop
      case "torus": // Torus needs radius, tubeRadius
        if (!isNumber(el.radius) && !isNumber(el.radiusBottom) && !isNumber(el.radiusX)) {
          // Check various radius names
          errors.push(`${elementPrefix} (type: ${el.type}): Missing or invalid 'radius' property (number).`);
        }
        if ((el.type === "cylinder" || el.type === "cone") && !isNumber(el.height)) {
          errors.push(`${elementPrefix} (type: ${el.type}): Missing or invalid 'height' (number).`);
        }
        if (el.type === "cone" && !isNumber(el.radiusBottom)) {
          errors.push(`${elementPrefix} (type: ${el.type}): Missing or invalid 'radiusBottom' (number).`);
        }
        if (el.type === "cone" && !isNumber(el.radiusTop)) {
          errors.push(`${elementPrefix} (type: ${el.type}): Missing or invalid 'radiusTop' (number).`);
        }
        if (el.type === "torus" && !isNumber(el.tubeRadius)) {
          errors.push(`${elementPrefix} (type: ${el.type}): Missing or invalid 'tubeRadius' (number).`);
        }
        break;
      case "line":
        if (!isNumber(el.x1)) errors.push(`${elementPrefix} (type: line): Missing or invalid 'x1' (number).`);
        if (!isNumber(el.y1)) errors.push(`${elementPrefix} (type: line): Missing or invalid 'y1' (number).`);
        if (!isNumber(el.x2)) errors.push(`${elementPrefix} (type: line): Missing or invalid 'x2' (number).`);
        if (!isNumber(el.y2)) errors.push(`${elementPrefix} (type: line): Missing or invalid 'y2' (number).`);
        // z1, z2 might be optional for 2D lines
        break;
      case "spline":
      case "bezier":
      case "nurbs":
      case "polygon": // Polygons need points
      case "path3d":
        if (!Array.isArray(el.points)) {
          errors.push(`${elementPrefix} (type: ${el.type}): Missing or invalid 'points' property (array).`);
        } else {
          // Optional: Add deeper validation for points structure if needed
          el.points.forEach((pRaw: any, pIndex: number) => {
            if (!isObject(pRaw)) {
              errors.push(`${elementPrefix} (type: ${el.type}): Point at index ${pIndex} is not an object.`);
              return; // Skip this point
            }
            const p = pRaw as any; // Cast after checking it's an object
            if (!isNumber(p.x) || !isNumber(p.y)) {
              errors.push(
                `${elementPrefix} (type: ${el.type}): Point at index ${pIndex} is invalid (requires {x: number, y: number, z?: number}).`
              );
            }
          });
        }
        break;
      // Add more cases for other specific element types as needed
    }

    // Optional property type checks (if present)
    if (el.color !== undefined && !isString(el.color)) {
      errors.push(`${elementPrefix}: Invalid 'color' property (must be a string).`);
    }
    if (el.name !== undefined && !isString(el.name)) {
      errors.push(`${elementPrefix}: Invalid 'name' property (must be a string).`);
    }
    if (el.rotation !== undefined) {
      if (!isObject(el.rotation)) {
        errors.push(`${elementPrefix}: Invalid 'rotation' property (must be an object).`);
      } else {
        const rot = el.rotation as any; // Cast after checking it's an object
        if (!isNumber(rot.x) || !isNumber(rot.y) || !isNumber(rot.z)) {
          errors.push(`${elementPrefix}: Invalid 'rotation' property values (must have x, y, z as numbers).`);
        }
      }
    }
    // Add checks for other optional properties like material, layerId, etc.
    if (el.layerId !== undefined && !isString(el.layerId)) {
      errors.push(`${elementPrefix}: Invalid 'layerId' property (must be a string).`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}
