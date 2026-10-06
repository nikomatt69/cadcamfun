/**
 * Initial values of the "Add element" form of the tool panel, per element type (position, rotation, scale, colour and
 * the type-specific parameters). Same defaults as the legacy panel.
 */
export interface FormDefaults { [key: string]: any }

export const formDefaults = (type: string): FormDefaults => {
    const baseProps: {
      x: number;
      y: number;
      z: number;
      rotationX: number;
      rotationY: number;
      rotationZ: number;
      scaleX: number;
      scaleY: number;
      scaleZ: number;
      color: string | undefined; // Allow undefined
      wireframe: boolean | undefined; // Allow undefined
    } = {
      x: 0,
      y: 0,
      z: 0,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
      color: "#1e88e5",
      wireframe: false
    };

    let specificProps: any = {};

    // Default values based on element type
    switch (type) {
      // Primitive di base
      case "cube":
        specificProps = { width: 100, height: 100, depth: 100, color: "#1e88e5" };
        break;
      case "sphere":
        specificProps = { radius: 50, color: "#1e88e5" };
        break;
      case "cylinder":
        specificProps = { radius: 25, height: 60, segments: 32, color: "#FFC107" };
        break;
      case "cone":
        specificProps = { radius: 25, height: 50, segments: 32, color: "#9C27B0" };
        break;
      case "torus":
        specificProps = { radius: 30, tube: 10, radialSegments: 16, tubularSegments: 100, color: "#FF9800" };
        break;

      // Primitive avanzate
      case "pyramid":
        specificProps = { baseWidth: 100, baseDepth: 100, height: 150, color: "#E91E63" };
        break;
      case "prism":
        specificProps = { radius: 50, height: 100, sides: 6, color: "#3F51B5" };
        break;
      case "hemisphere":
        specificProps = { radius: 50, segments: 32, direction: "up", color: "#00BCD4" };
        break;
      case "ellipsoid":
        specificProps = { radiusX: 50, radiusY: 35, radiusZ: 25, segments: 32, color: "#8BC34A" };
        break;
      case "capsule":
        specificProps = { radius: 25, height: 100, direction: "y", color: "#673AB7" };
        break;

      // Elementi 2D
      case "circle":
        specificProps = { radius: 50, segments: 32, color: "#000000", linewidth: 1 };
        break;
      case "rectangle":
        specificProps = { width: 100, height: 100, color: "#000000", linewidth: 1 };
        break;
      case "triangle":
        specificProps = {
          points: [
            { x: 0, y: 50 },
            { x: -50, y: -25 },
            { x: 50, y: -25 }
          ],
          color: "#000000",
          linewidth: 1
        };
        break;
      case "polygon":
        specificProps = {
          sides: 6,
          radius: 50,
          points: [
            { x: 0, y: 0 },
            { x: 50, y: 0 },
            { x: 25, y: 50 }
          ],
          color: "#795548",
          wireframe: true // Override baseProps.wireframe
        };
        break;
      case "ellipse":
        specificProps = { radiusX: 50, radiusY: 25, segments: 32, color: "#000000", linewidth: 1 };
        break;
      case "arc":
        specificProps = { radius: 50, startAngle: 0, endAngle: 3.14, segments: 32, color: "#000000", linewidth: 1 };
        break;

      // Curve
      case "line":
        // For line, x,y,z in baseProps can be a reference/midpoint for transformation.
        // x1,y1,z1 etc. are for defining the line itself.
        specificProps = { x1: 0, y1: 0, z1: 0, x2: 100, y2: 0, z2: 0, color: "#000000", linewidth: 1 };
        baseProps.wireframe = undefined; // Not applicable
        break;
      case "spline":
        specificProps = {
          points: [
            { x: 0, y: 0, z: 0 },
            { x: 30, y: 50, z: 0 },
            { x: 70, y: -20, z: 0 },
            { x: 100, y: 0, z: 0 }
          ],
          divisions: 50,
          color: "#000000",
          linewidth: 1
        };
        baseProps.wireframe = undefined;
        break;
      case "bezier":
        specificProps = {
          points: [
            { x: 0, y: 0, z: 0 },
            { x: 30, y: 100, z: 0 },
            { x: 70, y: 100, z: 0 },
            { x: 100, y: 0, z: 0 }
          ],
          divisions: 50,
          color: "#000000",
          linewidth: 1
        };
        baseProps.wireframe = undefined;
        break;
      case "nurbs":
        specificProps = {
          points: [
            { x: 0, y: 0, z: 0 },
            { x: 30, y: 50, z: 0 },
            { x: 60, y: -20, z: 0 },
            { x: 100, y: 0, z: 0 }
          ],
          degree: 3,
          divisions: 100,
          color: "#000000",
          linewidth: 1
        };
        baseProps.wireframe = undefined;
        break;

      // Operazioni booleane
      case "boolean-union":
        specificProps = { operands: [], color: "#4CAF50" };
        break;
      case "boolean-subtract":
        specificProps = { operands: [], color: "#F44336" };
        break;
      case "boolean-intersect":
        specificProps = { operands: [], color: "#2196F3" };
        break;

      // Operazioni di trasformazione
      case "extrusion":
        specificProps = { shape: "rect", width: 50, height: 30, depth: 20, bevel: false, color: "#4CAF50" };
        break;
      case "revolution":
        specificProps = {
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
        specificProps = {
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
        specificProps = {
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

      // Elementi industriali
      case "thread":
        specificProps = {
          diameter: 20,
          pitch: 2,
          length: 50,
          handedness: "right",
          standard: "metric",
          color: "#B0BEC5"
        };
        break;
      case "chamfer":
        specificProps = { width: 100, height: 100, depth: 100, distance: 10, edges: [], color: "#607D8B" };
        break;
      case "fillet":
        specificProps = { width: 100, height: 100, depth: 100, radius: 10, edges: [], color: "#607D8B" };
        break;
      case "gear":
        specificProps = {
          moduleValue: 2,
          teeth: 20,
          thickness: 10,
          pressureAngle: 20,
          holeDiameter: 10,
          color: "#B0BEC5"
        };
        break;
      case "spring":
        specificProps = { radius: 30, wireRadius: 5, turns: 5, height: 100, color: "#9E9E9E" };
        break;

      // Elementi di assemblaggio
      case "screw":
        specificProps = { size: "M8", length: 40, thread: "M8x1.25", grade: "8.8", color: "#9E9E9E" };
        break;
      case "nut":
        specificProps = { size: "M8", thread: "M8x1.25", type: "hex", color: "#9E9E9E" };
        break;
      case "bolt":
        specificProps = { size: "M8", length: 50, thread: "M8x1.25", grade: "8.8", color: "#9E9E9E" };
        break;
      case "washer":
        specificProps = { size: "M8", outerDiameter: 16, thickness: 1.5, color: "#9E9E9E" };
        break;
      case "rivet":
        specificProps = { diameter: 8, length: 20, color: "#9E9E9E" };
        break;

      // Elementi architettonici
      case "wall":
        specificProps = { length: 300, height: 100, thickness: 20, openings: [], color: "#E0E0E0" };
        break;
      case "floor":
        specificProps = { width: 400, length: 400, thickness: 10, color: "#BCAAA4" };
        break;
      case "roof":
        // baseProps.y might be overridden if roof has a default elevation
        baseProps.y = 100; // Example default elevation for a roof
        specificProps = { width: 400, length: 400, height: 50, style: "pitched", color: "#795548" };
        break;
      case "window":
        specificProps = {
          width: 50,
          height: 80,
          thickness: 5,
          style: "simple",
          frameColor: "#8D6E63",
          color: "#B3E5FC"
        };
        break;
      case "door":
        specificProps = { width: 36, height: 80, thickness: 2, style: "simple", color: "#8D6E63" };
        break;
      case "stair":
        specificProps = { width: 100, height: 150, depth: 200, steps: 10, color: "#BCAAA4" };
        break;
      case "column":
        specificProps = { radius: 20, height: 200, style: "simple", color: "#E0E0E0" };
        break;

      // Elementi speciali
      case "text3d":
        specificProps = { text: "Hello", height: 10, depth: 2, font: "Arial", color: "#4285F4" };
        break;
      case "path3d":
        specificProps = {
          points: [
            { x: 0, y: 0, z: 0 },
            { x: 50, y: 50, z: 20 },
            { x: 100, y: 0, z: 40 }
          ],
          radius: 5,
          segments: 64,
          color: "#4285F4"
        };
        break;
      case "point-cloud":
        specificProps = {
          points: [
            { x: 0, y: 0, z: 0 },
            { x: 50, y: 10, z: 20 },
            { x: 20, y: 50, z: 30 },
            { x: 80, y: 30, z: 10 },
            { x: 40, y: 70, z: 50 }
          ],
          pointSize: 5,
          colors: [], // Can be an array of colors or a single color
          color: "#4285F4" // Fallback if colors array is empty
        };
        break;
      case "mesh":
        specificProps = {
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
        specificProps = { elements: [] };
        // Group might not have its own color/wireframe, it depends on its children
        baseProps.color = undefined;
        baseProps.wireframe = undefined;
        break;

      case "tube":
        specificProps = {
          path: [
            { x: 0, y: 0, z: 0 },
            { x: 50, y: 20, z: 0 },
            { x: 100, y: 0, z: 0 }
          ],
          radius: 5,
          tubularSegments: 64,
          radialSegments: 8,
          closed: false,
          color: "#2196F3"
        };
        break;
      case "lathe":
        specificProps = {
          points: [
            { x: 0, y: 0 },
            { x: 20, y: 0 },
            { x: 20, y: 20 },
            { x: 10, y: 40 }
          ],
          segments: 12,
          phiLength: 6.28,
          color: "#607D8B"
        };
        break;
      case "grid":
        specificProps = {
          size: 100,
          divisions: 10,
          colorCenterLine: "#444444",
          colorGrid: "#888888",
          plane: "xy"
        };
        // Grid might not have typical color/wireframe for the object itself
        baseProps.color = undefined;
        baseProps.wireframe = undefined;
        break;
      case "text": // This is 2D text
        specificProps = {
          text: "Text",
          size: 10,
          // depth: 0, // Typically 2D text doesn't have depth in this context
          color: "#000000"
          // bevel: false
        };
        baseProps.wireframe = undefined;
        // x,y,z from baseProps are its position. Rotation Z might be relevant. Scale X,Y might be relevant.
        // Scale Z might not be for 2D text. Rotation X,Y also might not be.
        // For simplicity, keep all transform props, but rendering might ignore some for 2D.
        break;

      case "linear-dimension":
        specificProps = {
          startPoint: { x: 0, y: 0, z: 0 },
          endPoint: { x: 100, y: 0, z: 0 },
          offsetDirection: "y",
          offsetAmount: 20,
          unit: "mm",
          precision: 2,
          color: "#FF0000",
          linewidth: 1
        };
        baseProps.wireframe = undefined;
        break;
      case "angular-dimension":
        specificProps = {
          vertex: { x: 0, y: 0, z: 0 },
          startPoint: { x: 100, y: 0, z: 0 },
          endPoint: { x: 0, y: 100, z: 0 },
          radius: 30,
          precision: 1,
          color: "#FF0000",
          linewidth: 1
        };
        baseProps.wireframe = undefined;
        break;
      case "radius-dimension":
        specificProps = {
          center: { x: 0, y: 0, z: 0 },
          pointOnCircle: { x: 50, y: 0, z: 0 },
          precision: 2,
          color: "#FF0000",
          linewidth: 1
        };
        baseProps.wireframe = undefined;
        break;
      case "diameter-dimension":
        specificProps = {
          center: { x: 0, y: 0, z: 0 },
          pointOnCircle: { x: 50, y: 0, z: 0 },
          precision: 2,
          color: "#FF0000",
          linewidth: 1
        };
        baseProps.wireframe = undefined;
        break;

      case "drawing-pen":
        specificProps = {
          points: [
            { x: 0, y: 0, z: 0 },
            { x: 50, y: 50, z: 0 },
            { x: 100, y: 0, z: 0 }
          ],
          penSize: 2,
          color: "#000000"
        };
        baseProps.wireframe = undefined;
        break;
      case "drawing-highlighter":
        specificProps = {
          points: [
            { x: 0, y: 0, z: 0 },
            { x: 50, y: 50, z: 0 },
            { x: 100, y: 0, z: 0 }
          ],
          highlighterSize: 8,
          color: "#FFFF00",
          opacity: 0.5
        };
        baseProps.wireframe = undefined;
        break;
      case "drawing-text":
        specificProps = { text: "Annotation", textSize: 12, font: "Arial", color: "#000000" }; // position is baseProps.x,y,z
        baseProps.wireframe = undefined;
        break;
      case "drawing-eraser":
        specificProps = { points: [], eraserSize: 20, showEraserPath: false };
        baseProps.color = undefined;
        baseProps.wireframe = undefined;
        break;
      case "drawing-screenshot-area":
        specificProps = { startPoint: { x: 0, y: 0, z: 0 }, endPoint: { x: 200, y: 200, z: 0 }, format: "png" };
        baseProps.color = undefined;
        baseProps.wireframe = undefined;
        break;

      default:
        // For types not explicitly listed or new types, they'll just get baseProps.
        // The default color and wireframe from baseProps will apply.
        break;
    }

    const finalProps = { ...baseProps, ...specificProps };
    // Clean up undefined properties if they were explicitly set to undefined in baseProps
    if (finalProps.color === undefined) delete finalProps.color;
    if (finalProps.wireframe === undefined) delete finalProps.wireframe;

    return finalProps;
}
