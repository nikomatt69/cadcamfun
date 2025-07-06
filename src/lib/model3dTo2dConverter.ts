// src/utils/model3dTo2dConverter.ts

import { v4 as uuidv4 } from "uuid";
import { DrawingEntity, Point } from "../types/TechnicalDrawingTypes";
import { Element } from "../store/elementsStore";

// Define projection matrices for different views
interface ProjectionMatrix {
  xx: number;
  xy: number;
  xz: number;
  yx: number;
  yy: number;
  yz: number;
}

// Orthographic projection matrices for standard views
const projections: Record<string, ProjectionMatrix> = {
  front: {
    xx: 1,
    xy: 0,
    xz: 0,
    yx: 0,
    yy: 1,
    yz: 0
  },
  top: {
    xx: 1,
    xy: 0,
    xz: 0,
    yx: 0,
    yy: 0,
    yz: -1
  },
  side: {
    xx: 0,
    xy: 0,
    xz: -1,
    yx: 0,
    yy: 1,
    yz: 0
  },
  back: {
    xx: -1,
    xy: 0,
    xz: 0,
    yx: 0,
    yy: 1,
    yz: 0
  },
  bottom: {
    xx: 1,
    xy: 0,
    xz: 0,
    yx: 0,
    yy: 0,
    yz: 1
  },
  rightSide: {
    xx: 0,
    xy: 0,
    xz: 1,
    yx: 0,
    yy: 1,
    yz: 0
  }
};

/**
 * Project 3D point to 2D based on view
 */
function projectPoint(x: number, y: number, z: number, projection: ProjectionMatrix): Point {
  return {
    x: x * projection.xx + y * projection.xy + z * projection.xz,
    y: x * projection.yx + y * projection.yy + z * projection.yz
  };
}

/**
 * Convert a 3D element to 2D drawing entities
 */
export function convert3DElementTo2D(
  element: Element,
  viewType: "front" | "top" | "side" | "back" | "bottom" | "rightSide"
): DrawingEntity[] {
  const projection = projections[viewType];
  if (!projection) {
    console.error(`Invalid view type: ${viewType}`);
    return [];
  }

  const result: DrawingEntity[] = [];

  switch (element.type) {
    case "cube":
      const halfWidth = element.width / 2;
      const halfHeight = element.height / 2;
      const halfDepth = element.depth / 2;

      // Define the 8 corners of the cube in 3D
      const corners3D = [
        { x: element.x - halfWidth, y: element.y - halfHeight, z: element.z - halfDepth }, // 0: back bottom left
        { x: element.x + halfWidth, y: element.y - halfHeight, z: element.z - halfDepth }, // 1: back bottom right
        { x: element.x + halfWidth, y: element.y + halfHeight, z: element.z - halfDepth }, // 2: back top right
        { x: element.x - halfWidth, y: element.y + halfHeight, z: element.z - halfDepth }, // 3: back top left
        { x: element.x - halfWidth, y: element.y - halfHeight, z: element.z + halfDepth }, // 4: front bottom left
        { x: element.x + halfWidth, y: element.y - halfHeight, z: element.z + halfDepth }, // 5: front bottom right
        { x: element.x + halfWidth, y: element.y + halfHeight, z: element.z + halfDepth }, // 6: front top right
        { x: element.x - halfWidth, y: element.y + halfHeight, z: element.z + halfDepth } // 7: front top left
      ];

      // Project the 3D corners to 2D
      const corners2D = corners3D.map(corner => projectPoint(corner.x, corner.y, corner.z, projection));

      // Define the 12 edges of the cube with visibility based on the view
      const edges = [
        { from: 0, to: 1, visible: true }, // back bottom
        { from: 1, to: 2, visible: true }, // back right
        { from: 2, to: 3, visible: true }, // back top
        { from: 3, to: 0, visible: true }, // back left
        { from: 4, to: 5, visible: true }, // front bottom
        { from: 5, to: 6, visible: true }, // front right
        { from: 6, to: 7, visible: true }, // front top
        { from: 7, to: 4, visible: true }, // front left
        { from: 0, to: 4, visible: true }, // bottom left
        { from: 1, to: 5, visible: true }, // bottom right
        { from: 2, to: 6, visible: true }, // top right
        { from: 3, to: 7, visible: true } // top left
      ];

      // Determine hidden edges based on view
      if (viewType === "front") {
        edges[0].visible = edges[1].visible = edges[2].visible = edges[3].visible = false;
      } else if (viewType === "back") {
        edges[4].visible = edges[5].visible = edges[6].visible = edges[7].visible = false;
      } else if (viewType === "top") {
        edges[0].visible = edges[4].visible = false;
      } else if (viewType === "bottom") {
        edges[2].visible = edges[6].visible = false;
      } else if (viewType === "side") {
        edges[3].visible = edges[7].visible = false;
      } else if (viewType === "rightSide") {
        edges[1].visible = edges[5].visible = false;
      }

      // Create 2D line entities for each visible edge
      edges.forEach(edge => {
        if (edge.visible) {
          result.push({
            id: uuidv4(),
            type: "line",
            layer: "default",
            visible: true,
            locked: false,
            style: {
              strokeColor: element.color || "#000000",
              strokeWidth: 0.5,
              strokeStyle: "solid"
            },
            startPoint: corners2D[edge.from],
            endPoint: corners2D[edge.to]
          });
        } else {
          // Create hidden lines (dashed)
          result.push({
            id: uuidv4(),
            type: "line",
            layer: "default",
            visible: true,
            locked: false,
            style: {
              strokeColor: element.color || "#000000",
              strokeWidth: 0.35,
              strokeStyle: "dashed"
            },
            startPoint: corners2D[edge.from],
            endPoint: corners2D[edge.to]
          });
        }
      });
      break;

    case "sphere":
      // For a sphere, we create a circle with the correct radius based on the view
      const center2D = projectPoint(element.x, element.y, element.z, projection);

      result.push({
        id: uuidv4(),
        type: "circle",
        layer: "default",
        visible: true,
        locked: false,
        style: {
          strokeColor: element.color || "#000000",
          strokeWidth: 0.5,
          strokeStyle: "solid"
        },
        center: center2D,
        radius: element.radius
      });

      // Add center lines for the circle
      result.push({
        id: uuidv4(),
        type: "line",
        layer: "default",
        visible: true,
        locked: false,
        style: {
          strokeColor: element.color || "#000000",
          strokeWidth: 0.25,
          strokeStyle: "center"
        },
        startPoint: { x: center2D.x - element.radius, y: center2D.y },
        endPoint: { x: center2D.x + element.radius, y: center2D.y }
      });

      result.push({
        id: uuidv4(),
        type: "line",
        layer: "default",
        visible: true,
        locked: false,
        style: {
          strokeColor: element.color || "#000000",
          strokeWidth: 0.25,
          strokeStyle: "center"
        },
        startPoint: { x: center2D.x, y: center2D.y - element.radius },
        endPoint: { x: center2D.x, y: center2D.y + element.radius }
      });
      break;

    case "cylinder":
      // Project center points of the top and bottom circles
      const bottomCenter = projectPoint(element.x, element.y - element.height / 2, element.z, projection);

      const topCenter = projectPoint(element.x, element.y + element.height / 2, element.z, projection);

      // For front, back, left, or right views, draw two ellipses and two lines
      if (viewType === "front" || viewType === "back" || viewType === "side" || viewType === "rightSide") {
        // Draw ellipses for top and bottom face
        result.push({
          id: uuidv4(),
          type: "ellipse",
          layer: "default",
          visible: true,
          locked: false,
          style: {
            strokeColor: element.color || "#000000",
            strokeWidth: 0.5,
            strokeStyle: "solid"
          },
          center: topCenter,
          radiusX: element.radius,
          radiusY: element.radius * 0.3, // Foreshortened
          rotation: 0
        });

        result.push({
          id: uuidv4(),
          type: "ellipse",
          layer: "default",
          visible: true,
          locked: false,
          style: {
            strokeColor: element.color || "#000000",
            strokeWidth: 0.5,
            strokeStyle: "solid"
          },
          center: bottomCenter,
          radiusX: element.radius,
          radiusY: element.radius * 0.3, // Foreshortened
          rotation: 0
        });

        // Draw sides
        result.push({
          id: uuidv4(),
          type: "line",
          layer: "default",
          visible: true,
          locked: false,
          style: {
            strokeColor: element.color || "#000000",
            strokeWidth: 0.5,
            strokeStyle: "solid"
          },
          startPoint: { x: bottomCenter.x - element.radius, y: bottomCenter.y },
          endPoint: { x: topCenter.x - element.radius, y: topCenter.y }
        });

        result.push({
          id: uuidv4(),
          type: "line",
          layer: "default",
          visible: true,
          locked: false,
          style: {
            strokeColor: element.color || "#000000",
            strokeWidth: 0.5,
            strokeStyle: "solid"
          },
          startPoint: { x: bottomCenter.x + element.radius, y: bottomCenter.y },
          endPoint: { x: topCenter.x + element.radius, y: topCenter.y }
        });
      }
      // For top or bottom views, just draw a circle
      else if (viewType === "top" || viewType === "bottom") {
        result.push({
          id: uuidv4(),
          type: "circle",
          layer: "default",
          visible: true,
          locked: false,
          style: {
            strokeColor: element.color || "#000000",
            strokeWidth: 0.5,
            strokeStyle: "solid"
          },
          center: topCenter,
          radius: element.radius
        });

        // Add center lines for the circle
        result.push({
          id: uuidv4(),
          type: "line",
          layer: "default",
          visible: true,
          locked: false,
          style: {
            strokeColor: element.color || "#000000",
            strokeWidth: 0.25,
            strokeStyle: "center"
          },
          startPoint: { x: topCenter.x - element.radius, y: topCenter.y },
          endPoint: { x: topCenter.x + element.radius, y: topCenter.y }
        });

        result.push({
          id: uuidv4(),
          type: "line",
          layer: "default",
          visible: true,
          locked: false,
          style: {
            strokeColor: element.color || "#000000",
            strokeWidth: 0.25,
            strokeStyle: "center"
          },
          startPoint: { x: topCenter.x, y: topCenter.y - element.radius },
          endPoint: { x: topCenter.x, y: topCenter.y + element.radius }
        });
      }
      break;

    // Add other 3D element types as needed

    default:
      console.warn(`Unsupported element type for conversion: ${element.type}`);
  }

  return result;
}

/**
 * Convert multiple 3D elements to 2D drawing entities
 */
export function convert3DTo2D(
  elements: Element[],
  viewType: "front" | "top" | "side" | "back" | "bottom" | "rightSide"
): DrawingEntity[] {
  let result: DrawingEntity[] = [];

  elements.forEach(element => {
    const entities = convert3DElementTo2D(element, viewType);
    result = [...result, ...entities];
  });

  return result;
}

/**
 * Convert 3D elements to orthographic projections (multi-view)
 */
export function createOrthographicViews(elements: Element[]): Record<string, DrawingEntity[]> {
  return {
    front: convert3DTo2D(elements, "front"),
    top: convert3DTo2D(elements, "top"),
    side: convert3DTo2D(elements, "side")
  };
}
