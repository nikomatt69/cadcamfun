/**
 * Default parameters of every element the CAD tool panel can create (2D drawing, 3D primitives, advanced solids,
 * mechanical parts, architecture, free-form). One entry per legacy toolbar tool, same values as the legacy editor.
 */
import { plateTemplate } from "@cadcamfun/core";

export type ElementTemplate = Record<string, unknown> & { type: string }

/** Returns the element a tool creates, or `undefined` for an unknown tool id. */
export const elementTemplate = (type: string): ElementTemplate | undefined => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let newElement: any

    switch (type) {
      case "rectangle":
        newElement = {
          type: "rectangle",
          x: 0,
          y: 0,
          z: 0,
          width: 100,
          height: 100,
          color: "#1e88e5",
          linewidth: 1
        };
        break;
      case "circle":
        newElement = {
          type: "circle",
          x: 0,
          y: 0,
          z: 0,
          radius: 50,
          color: "#1e88e5",
          linewidth: 1
        };
        break;
      case "cube":
        newElement = {
          type: "cube",
          x: 0,
          y: 0,
          z: 0,
          width: 100,
          height: 100,
          depth: 100,
          color: "#1e88e5",
          wireframe: false
        };
        break;
      case "line":
        newElement = {
          type: "line",
          x1: -50,
          y1: 0,
          z1: 0,
          x2: 50,
          y2: 0,
          z2: 0,
          color: "#1e88e5",
          linewidth: 2
        };
        break;
      case "sphere":
        newElement = {
          type: "sphere",
          x: 0,
          y: 0,
          z: 0,
          radius: 50,
          color: "#1e88e5",
          wireframe: false
        };
        break;
      case "cylinder":
        newElement = {
          type: "cylinder",
          x: 0,
          y: 0,
          z: 0,
          radius: 30,
          height: 100,
          color: "#1e88e5",
          wireframe: false
        };
        break;
      case "cone":
        newElement = {
          type: "cone",
          x: 0,
          y: 0,
          z: 0,
          radius: 50,
          height: 100,
          color: "#1e88e5",
          wireframe: false
        };
        break;
      case "torus":
        newElement = {
          type: "torus",
          x: 0,
          y: 0,
          z: 0,
          radius: 50,
          tubeRadius: 10,
          color: "#1e88e5",
          wireframe: false
        };
        break;
      case "text":
        newElement = {
          type: "text",
          x: 0,
          y: 0,
          z: 0,
          text: "Text",
          size: 20,
          color: "#1e88e5"
        };
        break;
      case "polygon":
        newElement = {
          type: "polygon",
          x: 0,
          y: 0,
          z: 0,
          sides: 6,
          radius: 50,
          color: "#1e88e5",
          linewidth: 1
        };
        break;
      case "extrude":
        newElement = {
          type: "extrude",
          x: 0,
          y: 0,
          z: 0,
          shape: [
            { x: -25, y: -25 },
            { x: 25, y: -25 },
            { x: 25, y: 25 },
            { x: -25, y: 25 }
          ],
          depth: 50,
          color: "#1e88e5"
        };
        break;
      case "triangle":
        newElement = {
          type: "triangle",
          x: 0,
          y: 0,
          z: 0,
          points: [
            { x: 0, y: 50 },
            { x: -50, y: -25 },
            { x: 50, y: -25 }
          ],
          color: "#1e88e5",
          linewidth: 1
        };
        break;
      case "pyramid":
        newElement = {
          type: "pyramid",
          x: 0,
          y: 0,
          z: 0,
          baseWidth: 100,
          baseDepth: 100,
          height: 150,
          color: "#E91E63",
          wireframe: false
        };
        break;
      case "prism":
        newElement = {
          type: "prism",
          x: 0,
          y: 0,
          z: 0,
          radius: 50,
          height: 100,
          sides: 6,
          color: "#3F51B5",
          wireframe: false
        };
        break;
      case "hemisphere":
        newElement = {
          type: "hemisphere",
          x: 0,
          y: 0,
          z: 0,
          radius: 50,
          segments: 32,
          direction: "up",
          color: "#00BCD4",
          wireframe: false
        };
        break;
      case "ellipsoid":
        newElement = {
          type: "ellipsoid",
          x: 0,
          y: 0,
          z: 0,
          radiusX: 50,
          radiusY: 35,
          radiusZ: 25,
          segments: 32,
          color: "#8BC34A",
          wireframe: false
        };
        break;
      case "capsule":
        newElement = {
          type: "capsule",
          x: 0,
          y: 0,
          z: 0,
          radius: 25,
          height: 100,
          direction: "y",
          color: "#673AB7",
          wireframe: false
        };
        break;
      case "ellipse":
        newElement = {
          type: "ellipse",
          x: 0,
          y: 0,
          z: 0,
          radiusX: 50,
          radiusY: 25,
          segments: 32,
          color: "#1e88e5",
          linewidth: 1
        };
        break;
      case "arc":
        newElement = {
          type: "arc",
          x: 0,
          y: 0,
          z: 0,
          radius: 50,
          startAngle: 0,
          endAngle: Math.PI,
          segments: 32,
          color: "#1e88e5",
          linewidth: 1
        };
        break;
      case "spline":
        newElement = {
          type: "spline",
          points: [
            { x: 0, y: 0, z: 0 },
            { x: 30, y: 50, z: 0 },
            { x: 70, y: -20, z: 0 },
            { x: 100, y: 0, z: 0 }
          ],
          divisions: 50,
          color: "#1e88e5",
          linewidth: 1
        };
        break;
      case "bezier":
        newElement = {
          type: "bezier",
          points: [
            { x: 0, y: 0, z: 0 },
            { x: 30, y: 100, z: 0 },
            { x: 70, y: 100, z: 0 },
            { x: 100, y: 0, z: 0 }
          ],
          divisions: 50,
          color: "#1e88e5",
          linewidth: 1
        };
        break;
      case "nurbs":
        newElement = {
          type: "nurbs",
          points: [
            { x: 0, y: 0, z: 0 },
            { x: 30, y: 50, z: 0 },
            { x: 60, y: -20, z: 0 },
            { x: 100, y: 0, z: 0 }
          ],
          degree: 3,
          divisions: 100,
          color: "#1e88e5",
          linewidth: 1
        };
        break;
      case "parametric":
        // A dimension-driven starting part: a plate with a hole, from the parameters width, depth, thick and hole.
        newElement = { type: "parametric", name: "Parametric plate", x: 0, y: 0, z: 0, color: "#26A69A", history: plateTemplate() };
        break;
      case "boolean-union":
        newElement = { type: "boolean-union", operands: [], x: 0, y: 0, z: 0, color: "#4CAF50" };
        break;
      case "boolean-subtract":
        newElement = { type: "boolean-subtract", operands: [], x: 0, y: 0, z: 0, color: "#F44336" };
        break;
      case "boolean-intersect":
        newElement = { type: "boolean-intersect", operands: [], x: 0, y: 0, z: 0, color: "#2196F3" };
        break;
      case "revolution":
        newElement = {
          type: "revolution",
          x: 0,
          y: 0,
          z: 0,
          profile: [
            { x: 0, y: 0 },
            { x: 20, y: 0 },
            { x: 25, y: 30 },
            { x: 10, y: 50 }
          ],
          segments: 32,
          angle: 6.28,
          axis: "y",
          color: "#FF5722"
        };
        break;
      case "sweep":
        newElement = {
          type: "sweep",
          profile: [
            { x: -10, y: -10 },
            { x: 10, y: -10 },
            { x: 10, y: 10 },
            { x: -10, y: 10 }
          ],
          path: [
            { x: 0, y: 0, z: 0 },
            { x: 50, y: 50, z: 50 },
            { x: 100, y: 0, z: 0 }
          ],
          radius: 10,
          segments: 64,
          color: "#2196F3"
        };
        break;
      case "loft":
        newElement = {
          type: "loft",
          profiles: [{ radius: 20 }, { radius: 40 }, { radius: 10 }],
          positions: [
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: 50 },
            { x: 0, y: 0, z: 100 }
          ],
          closed: false,
          color: "#9C27B0"
        };
        break;
      case "thread":
        newElement = {
          type: "thread",
          x: 0,
          y: 0,
          z: 0,
          diameter: 20,
          pitch: 2,
          length: 50,
          handedness: "right",
          standard: "metric",
          color: "#B0BEC5"
        };
        break;
      case "chamfer":
        newElement = {
          type: "chamfer",
          x: 0,
          y: 0,
          z: 0,
          width: 100,
          height: 100,
          depth: 100,
          distance: 10,
          edges: [],
          color: "#607D8B"
        };
        break;
      case "fillet":
        newElement = {
          type: "fillet",
          x: 0,
          y: 0,
          z: 0,
          width: 100,
          height: 100,
          depth: 100,
          radius: 10,
          edges: [],
          color: "#607D8B"
        };
        break;
      case "gear":
        newElement = {
          type: "gear",
          x: 0,
          y: 0,
          z: 0,
          moduleValue: 2,
          teeth: 20,
          thickness: 10,
          pressureAngle: 20,
          holeDiameter: 10,
          color: "#B0BEC5"
        };
        break;
      case "spring":
        newElement = {
          type: "spring",
          x: 0,
          y: 0,
          z: 0,
          radius: 30,
          wireRadius: 5,
          turns: 5,
          height: 100,
          color: "#9E9E9E"
        };
        break;
      case "screw":
        newElement = {
          type: "screw",
          x: 0,
          y: 0,
          z: 0,
          size: "M8",
          length: 40,
          thread: "M8x1.25",
          grade: "8.8",
          color: "#9E9E9E"
        };
        break;
      case "nut":
        newElement = { type: "nut", x: 0, y: 0, z: 0, size: "M8", thread: "M8x1.25", style: "hex", color: "#9E9E9E" };
        break;
      case "bolt":
        newElement = {
          type: "bolt",
          x: 0,
          y: 0,
          z: 0,
          size: "M8",
          length: 50,
          thread: "M8x1.25",
          grade: "8.8",
          color: "#9E9E9E"
        };
        break;
      case "washer":
        newElement = {
          type: "washer",
          x: 0,
          y: 0,
          z: 0,
          size: "M8",
          outerDiameter: 16,
          thickness: 1.5,
          color: "#9E9E9E"
        };
        break;
      case "rivet":
        newElement = { type: "rivet", x: 0, y: 0, z: 0, diameter: 8, length: 20, color: "#9E9E9E" };
        break;
      case "wall":
        newElement = {
          type: "wall",
          x: 0,
          y: 0,
          z: 0,
          length: 300,
          height: 100,
          thickness: 20,
          openings: [],
          color: "#E0E0E0"
        };
        break;
      case "floor":
        newElement = { type: "floor", x: 0, y: 0, z: 0, width: 400, length: 400, thickness: 10, color: "#BCAAA4" };
        break;
      case "roof":
        newElement = {
          type: "roof",
          x: 0,
          y: 100,
          z: 0,
          width: 400,
          length: 400,
          height: 50,
          style: "pitched",
          color: "#795548"
        };
        break;
      case "window":
        newElement = {
          type: "window",
          x: 0,
          y: 0,
          z: 0,
          width: 50,
          height: 80,
          thickness: 5,
          style: "simple",
          frameColor: "#8D6E63",
          color: "#B3E5FC"
        };
        break;
      case "door":
        newElement = {
          type: "door",
          x: 0,
          y: 0,
          z: 0,
          width: 36,
          height: 80,
          thickness: 2,
          style: "simple",
          color: "#8D6E63"
        };
        break;
      case "stair":
        newElement = {
          type: "stair",
          x: 0,
          y: 0,
          z: 0,
          width: 100,
          height: 150,
          depth: 200,
          steps: 10,
          color: "#BCAAA4"
        };
        break;
      case "column":
        newElement = { type: "column", x: 0, y: 0, z: 0, radius: 20, height: 200, style: "simple", color: "#E0E0E0" };
        break;
      case "text3d":
        newElement = {
          type: "text3d",
          x: 0,
          y: 0,
          z: 0,
          text: "Hello",
          height: 10,
          depth: 2,
          font: "Arial",
          color: "#4285F4"
        };
        break;
      case "path3d":
        newElement = {
          type: "path3d",
          x: 0,
          y: 0,
          z: 0,
          points: [
            { x: 0, y: 0, z: 0 },
            { x: 50, y: 50, z: 20 },
            { x: 100, y: 0, z: 40 }
          ],
          color: "#4285F4"
        };
        break;
      case "point-cloud":
        newElement = {
          type: "point-cloud",
          x: 0,
          y: 0,
          z: 0,
          points: [
            { x: 0, y: 0, z: 0 },
            { x: 50, y: 10, z: 20 },
            { x: 20, y: 50, z: 30 },
            { x: 80, y: 30, z: 10 },
            { x: 40, y: 70, z: 50 }
          ],
          pointSize: 5,
          color: "#4285F4"
        };
        break;
      case "mesh":
        newElement = {
          type: "mesh",
          x: 0,
          y: 0,
          z: 0,
          vertices: [
            { x: 0, y: 0, z: 0 },
            { x: 100, y: 0, z: 0 },
            { x: 100, y: 100, z: 0 },
            { x: 0, y: 100, z: 0 },
            { x: 50, y: 50, z: 50 }
          ],
          faces: [
            [0, 1, 2],
            [0, 2, 3],
            [0, 1, 4],
            [1, 2, 4],
            [2, 3, 4],
            [3, 0, 4]
          ],
          color: "#4285F4"
        };
        break;
      case "group":
        newElement = { type: "group", x: 0, y: 0, z: 0, elements: [] };
        break;
      case "grid":
        newElement = {
          type: "grid",
          x: 0,
          y: 0,
          z: 0,
          size: 100,
          divisions: 10,
          colorCenterLine: "#444444",
          colorGrid: "#888888",
          plane: "xy"
        };
        break;
      case "workpiece":
        newElement = {
          type: "workpiece",
          x: 0,
          y: 0,
          z: 0,
          width: 100,
          height: 100,
          depth: 20,
          color: "#3080FF",
          wireframe: false
        };
        break;
      case "tube":
        newElement = {
          type: "tube",
          x: 0,
          y: 0,
          z: 0,
          path: [
            { x: 0, y: 0, z: 0 },
            { x: 50, y: 20, z: 0 },
            { x: 100, y: 0, z: 0 }
          ],
          radius: 5,
          tubularSegments: 64,
          radialSegments: 8,
          closed: false,
          color: "#2196F3",
          wireframe: false
        };
        break;
      case "lathe":
        newElement = {
          type: "lathe",
          x: 0,
          y: 0,
          z: 0,
          points: [
            { x: 0, y: 0 },
            { x: 20, y: 0 },
            { x: 20, y: 20 },
            { x: 10, y: 40 }
          ],
          segments: 12,
          phiLength: 6.28,
          color: "#607D8B",
          wireframe: false
        };
        break;
      default:
        return undefined
    }
  return newElement as ElementTemplate
}
