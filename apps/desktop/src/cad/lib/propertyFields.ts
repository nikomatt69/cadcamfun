/** What the property panel shows for each element type: one entry per editable field. */
export interface PropertyField {
  name: string
  label: string
  type: "number" | "color" | "checkbox" | "select" | "text" | "vector3" | "point3d" | "pointList" | "list" | "colorList"
  step?: number
  min?: number
  max?: number
  unit?: string
  minPoints?: number
  maxPoints?: number
  exactPoints?: number
  listType?: string
  options?: { value: string; label: string }[]
  showIf?: (properties: any) => boolean
}

export const getFieldsForElementType = (type: string): PropertyField[] => {
  switch (type) {
    case "line":
      return [
        { name: "x1", label: "X1", type: "number", step: 0.1 },
        { name: "y1", label: "Y1", type: "number", step: 0.1 },
        { name: "z1", label: "Z1", type: "number", step: 0.1 },
        { name: "x2", label: "X2", type: "number", step: 0.1 },
        { name: "y2", label: "Y2", type: "number", step: 0.1 },
        { name: "z2", label: "Z2", type: "number", step: 0.1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "linewidth", label: "Line Width", type: "number", min: 1, max: 10, step: 1 }
      ];

    case "circle":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radius", label: "Radius", type: "number", min: 0.1, step: 0.1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "linewidth", label: "Line Width", type: "number", min: 1, max: 10, step: 1 }
      ];

    case "rectangle":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "width", label: "Width", type: "number", min: 0.1, step: 0.1 },
        { name: "height", label: "Height", type: "number", min: 0.1, step: 0.1 },
        { name: "angle", label: "Angle (°)", type: "number", step: 1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "linewidth", label: "Line Width", type: "number", min: 1, max: 10, step: 1 }
      ];

    case "cube":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "width", label: "Width", type: "number", min: 0.1, step: 0.1 },
        { name: "height", label: "Height", type: "number", min: 0.1, step: 0.1 },
        { name: "depth", label: "Depth", type: "number", min: 0.1, step: 0.1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "sphere":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radius", label: "Radius", type: "number", min: 0.1, step: 0.1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "cylinder":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radius", label: "Radius", type: "number", min: 0.1, step: 0.1 },
        { name: "height", label: "Height", type: "number", min: 0.1, step: 0.1 },
        { name: "segments", label: "Segments", type: "number", min: 3, step: 1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "cone":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radius", label: "Radius", type: "number", min: 0.1, step: 0.1 },
        { name: "height", label: "Height", type: "number", min: 0.1, step: 0.1 },
        { name: "segments", label: "Segments", type: "number", min: 3, step: 1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "torus":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radius", label: "Outer Radius", type: "number", min: 0.1, step: 0.1 },
        { name: "tube", label: "Tube Radius", type: "number", min: 0.1, step: 0.1 },
        { name: "radialSegments", label: "Radial Segments", type: "number", min: 3, step: 1 },
        { name: "tubularSegments", label: "Tubular Segments", type: "number", min: 3, step: 1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "polygon":
      // For polygon, we'll provide fields for center coordinates and radius
      // Complex point editing would need a custom editor component
      return [
        { name: "x", label: "X (Center)", type: "number", step: 0.1 },
        { name: "y", label: "Y (Center)", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radius", label: "Radius", type: "number", min: 0.1, step: 0.1 },
        { name: "sides", label: "Number of Sides", type: "number", min: 3, step: 1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "extrusion":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        {
          name: "shape",
          label: "Shape Type",
          type: "select",
          options: [
            { value: "rect", label: "Rectangle" },
            { value: "circle", label: "Circle" }
          ]
        },
        {
          name: "width",
          label: "Width",
          type: "number",
          min: 0.1,
          step: 0.1,
          showIf: (props: { shape: string }) => props.shape === "rect"
        },
        {
          name: "height",
          label: "Height",
          type: "number",
          min: 0.1,
          step: 0.1,
          showIf: (props: { shape: string }) => props.shape === "rect"
        },
        {
          name: "radius",
          label: "Radius",
          type: "number",
          min: 0.1,
          step: 0.1,
          showIf: (props: { shape: string }) => props.shape === "circle"
        },
        { name: "depth", label: "Depth", type: "number", min: 0.1, step: 0.1 },
        { name: "bevel", label: "Bevel", type: "checkbox" },
        {
          name: "bevelThickness",
          label: "Bevel Thickness",
          type: "number",
          min: 0.1,
          step: 0.1,
          showIf: (props: { bevel: any }) => props.bevel
        },
        {
          name: "bevelSize",
          label: "Bevel Size",
          type: "number",
          min: 0.1,
          step: 0.1,
          showIf: (props: { bevel: any }) => props.bevel
        },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];
    case "tube":
      // For tube, we need a more complex editor for path points
      // Here we provide basic properties
      return [
        { name: "radius", label: "Tube Radius", type: "number", min: 0.1, step: 0.1 },
        { name: "tubularSegments", label: "Segments Along Path", type: "number", min: 1, step: 1 },
        { name: "radialSegments", label: "Segments Around Tube", type: "number", min: 3, step: 1 },
        { name: "closed", label: "Closed Path", type: "checkbox" },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" },
        { name: "path", label: "Path Points", type: "pointList", minPoints: 2 }
      ];

    case "lathe":
      // For lathe, we need a complex editor for profile points
      return [
        { name: "x", label: "X (Center)", type: "number", step: 0.1 },
        { name: "y", label: "Y (Center)", type: "number", step: 0.1 },
        { name: "z", label: "Z (Center)", type: "number", step: 0.1 },
        { name: "segments", label: "Segments", type: "number", min: 3, step: 1 },
        { name: "phiStart", label: "Start Angle (rad)", type: "number", step: 0.1 },
        { name: "phiLength", label: "Arc Length (rad)", type: "number", min: 0, max: 6.28, step: 0.1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" },
        { name: "points", label: "Profile Points", type: "pointList", minPoints: 2 }
      ];

    case "text":
    case "text3d":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "text", label: "Text Content", type: "text" },
        { name: "size", label: "Font Size", type: "number", min: 1, step: 0.5 },
        { name: "depth", label: "Extrusion Depth", type: "number", min: 0, step: 0.1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "bevel", label: "Bevel", type: "checkbox" },
        {
          name: "font",
          label: "Font",
          type: "select",
          options: [
            { value: "Arial", label: "Arial" },
            { value: "Helvetica", label: "Helvetica" },
            { value: "Times New Roman", label: "Times New Roman" }
          ]
        }
      ];

    case "grid":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "size", label: "Grid Size", type: "number", min: 1, step: 1 },
        { name: "divisions", label: "Division Count", type: "number", min: 1, step: 1 },
        { name: "colorCenterLine", label: "Center Line Color", type: "color" },
        { name: "colorGrid", label: "Grid Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        {
          name: "plane",
          label: "Grid Plane",
          type: "select",
          options: [
            { value: "xy", label: "XY Plane" },
            { value: "xz", label: "XZ Plane" },
            { value: "yz", label: "YZ Plane" }
          ]
        }
      ];

    case "workpiece":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "width", label: "Width", type: "number", min: 0.1, step: 0.1 },
        { name: "height", label: "Height", type: "number", min: 0.1, step: 0.1 },
        { name: "depth", label: "Depth", type: "number", min: 0.1, step: 0.1 },
        {
          name: "material",
          label: "Material",
          type: "select",
          options: [
            { value: "aluminum", label: "Aluminum" },
            { value: "steel", label: "Steel" },
            { value: "wood", label: "Wood" },
            { value: "plastic", label: "Plastic" },
            { value: "brass", label: "Brass" }
          ]
        },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "group":
      // For group elements, we only provide position properties
      // Individual elements within the group need separate editing
      return [
        { name: "x", label: "X (Group Center)", type: "number", step: 0.1 },
        { name: "y", label: "Y (Group Center)", type: "number", step: 0.1 },
        { name: "z", label: "Z (Group Center)", type: "number", step: 0.1 },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "elements", label: "Group Elements", type: "list", listType: "element" }
      ];

    // ======= PRIMITIVE AVANZATE =======
    case "pyramid":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "baseWidth", label: "Base Width", type: "number", min: 0.1, step: 0.1 },
        { name: "baseDepth", label: "Base Depth", type: "number", min: 0.1, step: 0.1 },
        { name: "height", label: "Height", type: "number", min: 0.1, step: 0.1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "prism":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radius", label: "Radius", type: "number", min: 0.1, step: 0.1 },
        { name: "height", label: "Height", type: "number", min: 0.1, step: 0.1 },
        { name: "sides", label: "Sides", type: "number", min: 3, step: 1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "hemisphere":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radius", label: "Radius", type: "number", min: 0.1, step: 0.1 },
        { name: "segments", label: "Segments", type: "number", min: 3, step: 1 },
        {
          name: "direction",
          label: "Direction",
          type: "select",
          options: [
            { value: "up", label: "Up" },
            { value: "down", label: "Down" }
          ]
        },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "ellipsoid":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radiusX", label: "Radius X", type: "number", min: 0.1, step: 0.1 },
        { name: "radiusY", label: "Radius Y", type: "number", min: 0.1, step: 0.1 },
        { name: "radiusZ", label: "Radius Z", type: "number", min: 0.1, step: 0.1 },
        { name: "segments", label: "Segments", type: "number", min: 3, step: 1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "capsule":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radius", label: "Radius", type: "number", min: 0.1, step: 0.1 },
        { name: "height", label: "Height", type: "number", min: 0.1, step: 0.1 },
        {
          name: "direction",
          label: "Direction",
          type: "select",
          options: [
            { value: "x", label: "X" },
            { value: "y", label: "Y" },
            { value: "z", label: "Z" }
          ]
        },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    // ======= ELEMENTI 2D AGGIUNTIVI =======
    case "ellipse":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radiusX", label: "Radius X", type: "number", min: 0.1, step: 0.1 },
        { name: "radiusY", label: "Radius Y", type: "number", min: 0.1, step: 0.1 },
        { name: "segments", label: "Segments", type: "number", min: 3, step: 1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "linewidth", label: "Line Width", type: "number", min: 1, max: 10, step: 1 }
      ];

    case "arc":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radius", label: "Radius", type: "number", min: 0.1, step: 0.1 },
        { name: "startAngle", label: "Start Angle (rad)", type: "number", step: 0.1 },
        { name: "endAngle", label: "End Angle (rad)", type: "number", step: 0.1 },
        { name: "segments", label: "Segments", type: "number", min: 3, step: 1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "linewidth", label: "Line Width", type: "number", min: 1, max: 10, step: 1 }
      ];

    case "triangle":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "points", label: "Vertices", type: "pointList", exactPoints: 3 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "linewidth", label: "Line Width", type: "number", min: 1, max: 10, step: 1 }
      ];

    // ======= CURVE AVANZATE =======
    case "spline":
      return [
        { name: "points", label: "Control Points", type: "pointList", minPoints: 2 },
        { name: "divisions", label: "Divisions", type: "number", min: 1, step: 1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "linewidth", label: "Line Width", type: "number", min: 1, max: 10, step: 1 }
      ];

    case "bezier":
      return [
        { name: "points", label: "Control Points", type: "pointList", minPoints: 4 },
        { name: "divisions", label: "Divisions", type: "number", min: 1, step: 1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "linewidth", label: "Line Width", type: "number", min: 1, max: 10, step: 1 }
      ];

    case "nurbs":
      return [
        { name: "points", label: "Control Points", type: "pointList", minPoints: 4 },
        { name: "degree", label: "Degree", type: "number", min: 1, max: 5, step: 1 },
        { name: "divisions", label: "Divisions", type: "number", min: 1, step: 1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "linewidth", label: "Line Width", type: "number", min: 1, max: 10, step: 1 }
      ];

    // ======= OPERAZIONI BOOLEANE =======
    case "boolean-union":
    case "boolean-subtract":
    case "boolean-intersect":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "operands", label: "Operand Elements", type: "list", listType: "element" },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    // ======= OPERAZIONI DI TRASFORMAZIONE =======
    case "revolution":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "profile", label: "Profile Points", type: "pointList", minPoints: 2 },
        { name: "segments", label: "Segments", type: "number", min: 3, step: 1 },
        { name: "angle", label: "Revolution Angle (rad)", type: "number", min: 0, max: 6.28, step: 0.1 },
        {
          name: "axis",
          label: "Rotation Axis",
          type: "select",
          options: [
            { value: "x", label: "X Axis" },
            { value: "y", label: "Y Axis" },
            { value: "z", label: "Z Axis" }
          ]
        },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "sweep":
      return [
        { name: "profile", label: "Cross Section", type: "pointList", minPoints: 3 },
        { name: "path", label: "Path Points", type: "pointList", minPoints: 2 },
        { name: "radius", label: "Path Radius", type: "number", min: 0.1, step: 0.1 },
        { name: "segments", label: "Segments", type: "number", min: 3, step: 1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "loft":
      return [
        { name: "profiles", label: "Section Profiles", type: "pointList", minPoints: 3 },
        { name: "positions", label: "Section Positions", type: "pointList", minPoints: 2 },
        { name: "closed", label: "Closed", type: "checkbox" },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    // ======= ELEMENTI INDUSTRIALI =======
    case "thread":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "diameter", label: "Diameter", type: "number", min: 0.1, step: 0.1 },
        { name: "pitch", label: "Pitch", type: "number", min: 0.1, step: 0.1 },
        { name: "length", label: "Length", type: "number", min: 0.1, step: 0.1 },
        {
          name: "handedness",
          label: "Handedness",
          type: "select",
          options: [
            { value: "right", label: "Right-handed" },
            { value: "left", label: "Left-handed" }
          ]
        },
        {
          name: "standard",
          label: "Standard",
          type: "select",
          options: [
            { value: "metric", label: "Metric" },
            { value: "imperial", label: "Imperial" }
          ]
        },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "chamfer":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "width", label: "Width", type: "number", min: 0.1, step: 0.1 },
        { name: "height", label: "Height", type: "number", min: 0.1, step: 0.1 },
        { name: "depth", label: "Depth", type: "number", min: 0.1, step: 0.1 },
        { name: "distance", label: "Chamfer Distance", type: "number", min: 0.1, step: 0.1 },
        { name: "edges", label: "Edges to Chamfer", type: "list", listType: "edge" },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "fillet":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "width", label: "Width", type: "number", min: 0.1, step: 0.1 },
        { name: "height", label: "Height", type: "number", min: 0.1, step: 0.1 },
        { name: "depth", label: "Depth", type: "number", min: 0.1, step: 0.1 },
        { name: "radius", label: "Fillet Radius", type: "number", min: 0.1, step: 0.1 },
        { name: "edges", label: "Edges to Fillet", type: "list", listType: "edge" },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "gear":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "moduleValue", label: "Module", type: "number", min: 0.1, step: 0.1 },
        { name: "teeth", label: "Number of Teeth", type: "number", min: 3, step: 1 },
        { name: "thickness", label: "Thickness", type: "number", min: 0.1, step: 0.1 },
        { name: "pressureAngle", label: "Pressure Angle (°)", type: "number", min: 0, max: 45, step: 1 },
        { name: "holeDiameter", label: "Center Hole Diameter", type: "number", min: 0, step: 0.1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "spring":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radius", label: "Spring Radius", type: "number", min: 0.1, step: 0.1 },
        { name: "wireRadius", label: "Wire Radius", type: "number", min: 0.1, step: 0.1 },
        { name: "turns", label: "Number of Turns", type: "number", min: 1, step: 0.5 },
        { name: "height", label: "Total Height", type: "number", min: 0.1, step: 0.1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    // ======= ELEMENTI DI ASSEMBLAGGIO =======
    case "screw":

    case "bolt":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "size", label: "Size", type: "text" },
        { name: "length", label: "Length", type: "number", min: 0.1, step: 0.1 },
        { name: "thread", label: "Thread Specification", type: "text" },
        { name: "grade", label: "Material Grade", type: "text" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "color", label: "Color", type: "color" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "nut":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "size", label: "Size", type: "text" },
        { name: "thread", label: "Thread Specification", type: "text" },
        {
          name: "type",
          label: "Nut Type",
          type: "select",
          options: [
            { value: "hex", label: "Hex Nut" },
            { value: "square", label: "Square Nut" },
            { value: "flange", label: "Flange Nut" }
          ]
        },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "color", label: "Color", type: "color" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "washer":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "size", label: "Size", type: "text" },
        { name: "outerDiameter", label: "Outer Diameter", type: "number", min: 0.1, step: 0.1 },
        { name: "thickness", label: "Thickness", type: "number", min: 0.1, step: 0.1 },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "color", label: "Color", type: "color" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "rivet":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "diameter", label: "Diameter", type: "number", min: 0.1, step: 0.1 },
        { name: "length", label: "Length", type: "number", min: 0.1, step: 0.1 },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "color", label: "Color", type: "color" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    // ======= ELEMENTI ARCHITETTONICI =======
    case "wall":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "length", label: "Length", type: "number", min: 0.1, step: 1 },
        { name: "height", label: "Height", type: "number", min: 0.1, step: 1 },
        { name: "thickness", label: "Thickness", type: "number", min: 0.1, step: 0.1 },
        { name: "openings", label: "Openings", type: "list", listType: "opening" },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "floor":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "width", label: "Width", type: "number", min: 0.1, step: 1 },
        { name: "length", label: "Length", type: "number", min: 0.1, step: 1 },
        { name: "thickness", label: "Thickness", type: "number", min: 0.1, step: 0.1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "roof":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "width", label: "Width", type: "number", min: 0.1, step: 1 },
        { name: "length", label: "Length", type: "number", min: 0.1, step: 1 },
        { name: "height", label: "Height", type: "number", min: 0.1, step: 1 },
        {
          name: "style",
          label: "Roof Style",
          type: "select",
          options: [
            { value: "flat", label: "Flat" },
            { value: "pitched", label: "Pitched" }
          ]
        },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "window":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "width", label: "Width", type: "number", min: 0.1, step: 0.1 },
        { name: "height", label: "Height", type: "number", min: 0.1, step: 0.1 },
        { name: "thickness", label: "Thickness", type: "number", min: 0.1, step: 0.1 },
        {
          name: "style",
          label: "Window Style",
          type: "select",
          options: [
            { value: "simple", label: "Simple" },
            { value: "divided", label: "Divided Panes" }
          ]
        },
        { name: "frameColor", label: "Frame Color", type: "color" },
        { name: "color", label: "Glass Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "door":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "width", label: "Width", type: "number", min: 0.1, step: 0.1 },
        { name: "height", label: "Height", type: "number", min: 0.1, step: 0.1 },
        { name: "thickness", label: "Thickness", type: "number", min: 0.1, step: 0.1 },
        {
          name: "style",
          label: "Door Style",
          type: "select",
          options: [
            { value: "simple", label: "Simple" },
            { value: "paneled", label: "Paneled" }
          ]
        },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "stair":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "width", label: "Width", type: "number", min: 0.1, step: 1 },
        { name: "height", label: "Height", type: "number", min: 0.1, step: 1 },
        { name: "depth", label: "Depth", type: "number", min: 0.1, step: 1 },
        { name: "steps", label: "Number of Steps", type: "number", min: 1, step: 1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "column":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radius", label: "Radius", type: "number", min: 0.1, step: 0.1 },
        { name: "height", label: "Height", type: "number", min: 0.1, step: 1 },
        {
          name: "style",
          label: "Column Style",
          type: "select",
          options: [
            { value: "simple", label: "Simple" },
            { value: "doric", label: "Doric" },
            { value: "ionic", label: "Ionic" },
            { value: "corinthian", label: "Corinthian" }
          ]
        },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    // ======= ELEMENTI SPECIALI =======
    case "path3d":
      return [
        { name: "points", label: "Path Points", type: "pointList", minPoints: 2 },
        { name: "radius", label: "Path Thickness", type: "number", min: 0.1, step: 0.1 },
        { name: "segments", label: "Segments", type: "number", min: 3, step: 1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "point-cloud":
      return [
        { name: "points", label: "Points", type: "pointList", minPoints: 1 },
        { name: "pointSize", label: "Point Size", type: "number", min: 0.1, step: 0.1 },
        { name: "colors", label: "Point Colors", type: "colorList" },
        { name: "color", label: "Default Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "mesh":
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "vertices", label: "Vertices", type: "pointList", minPoints: 3 },
        { name: "faces", label: "Faces", type: "list", listType: "face" },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    // ======= STRUMENTI DI MISURAZIONE =======
    case "linear-dimension":
      return [
        { name: "startPoint", label: "Start Point", type: "point3d" },
        { name: "endPoint", label: "End Point", type: "point3d" },
        {
          name: "offsetDirection",
          label: "Offset Direction",
          type: "select",
          options: [
            { value: "x", label: "X Axis" },
            { value: "y", label: "Y Axis" },
            { value: "z", label: "Z Axis" }
          ]
        },
        { name: "offsetAmount", label: "Offset Amount", type: "number", min: 0, step: 1 },
        {
          name: "unit",
          label: "Unit",
          type: "select",
          options: [
            { value: "mm", label: "mm" },
            { value: "cm", label: "cm" },
            { value: "m", label: "m" },
            { value: "in", label: "in" }
          ]
        },
        { name: "precision", label: "Decimal Precision", type: "number", min: 0, max: 6, step: 1 },
        { name: "color", label: "Color", type: "color" },
        { name: "linewidth", label: "Line Width", type: "number", min: 1, max: 5, step: 0.5 },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "angular-dimension":
      return [
        { name: "vertex", label: "Vertex", type: "point3d" },
        { name: "startPoint", label: "First Line End", type: "point3d" },
        { name: "endPoint", label: "Second Line End", type: "point3d" },
        { name: "radius", label: "Arc Radius", type: "number", min: 1, step: 1 },
        { name: "precision", label: "Decimal Precision", type: "number", min: 0, max: 2, step: 1 },
        { name: "color", label: "Color", type: "color" },
        { name: "linewidth", label: "Line Width", type: "number", min: 1, max: 5, step: 0.5 },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "radius-dimension":
      return [
        { name: "center", label: "Circle Center", type: "point3d" },
        { name: "pointOnCircle", label: "Point on Circle", type: "point3d" },
        { name: "precision", label: "Decimal Precision", type: "number", min: 0, max: 6, step: 1 },
        { name: "color", label: "Color", type: "color" },
        { name: "linewidth", label: "Line Width", type: "number", min: 1, max: 5, step: 0.5 },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "diameter-dimension":
      return [
        { name: "center", label: "Circle Center", type: "point3d" },
        { name: "pointOnCircle", label: "Point on Circle", type: "point3d" },
        { name: "precision", label: "Decimal Precision", type: "number", min: 0, max: 6, step: 1 },
        { name: "color", label: "Color", type: "color" },
        { name: "linewidth", label: "Line Width", type: "number", min: 1, max: 5, step: 0.5 },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    // ======= STRUMENTI DI DISEGNO =======
    case "drawing-pen":
      return [
        { name: "points", label: "Pen Stroke Points", type: "pointList", minPoints: 2 },
        { name: "penSize", label: "Pen Size", type: "number", min: 1, max: 10, step: 0.5 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "drawing-highlighter":
      return [
        { name: "points", label: "Highlighter Stroke Points", type: "pointList", minPoints: 2 },
        { name: "highlighterSize", label: "Highlighter Size", type: "number", min: 1, max: 30, step: 1 },
        { name: "color", label: "Color", type: "color" },
        { name: "opacity", label: "Opacity", type: "number", min: 0.1, max: 1, step: 0.1 },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "drawing-text":
      return [
        { name: "position", label: "Text Position", type: "point3d" },
        { name: "text", label: "Text Content", type: "text" },
        { name: "textSize", label: "Text Size", type: "number", min: 8, max: 72, step: 1 },
        {
          name: "font",
          label: "Font",
          type: "select",
          options: [
            { value: "Arial", label: "Arial" },
            { value: "Helvetica", label: "Helvetica" },
            { value: "Times New Roman", label: "Times New Roman" },
            { value: "Courier New", label: "Courier New" }
          ]
        },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "drawing-eraser":
      return [
        { name: "points", label: "Eraser Path Points", type: "pointList", minPoints: 2 },
        { name: "eraserSize", label: "Eraser Size", type: "number", min: 5, max: 50, step: 1 },
        { name: "showEraserPath", label: "Show Eraser Path", type: "checkbox" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    case "drawing-screenshot-area":
      return [
        { name: "startPoint", label: "Area Start Point", type: "point3d" },
        { name: "endPoint", label: "Area End Point", type: "point3d" },
        {
          name: "format",
          label: "Image Format",
          type: "select",
          options: [
            { value: "png", label: "PNG" },
            { value: "jpg", label: "JPG" },
            { value: "svg", label: "SVG" }
          ]
        },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];

    default:
      // Fallback per qualsiasi tipo di elemento non gestito
      return [
        { name: "x", label: "X", type: "number", step: 0.1 },
        { name: "y", label: "Y", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "width", label: "Width", type: "number", min: 0.1, step: 1 },
        { name: "height", label: "Height", type: "number", min: 0.1, step: 1 },
        { name: "depth", label: "Depth", type: "number", min: 0.1, step: 1 },
        { name: "radius", label: "Radius", type: "number", min: 0.1, step: 1 },
        { name: "segments", label: "Segments", type: "number", min: 3, step: 1 },
        { name: "color", label: "Color", type: "color" },
        { name: "rotation", label: "Rotation", type: "vector3", unit: "°" },
        { name: "wireframe", label: "Wireframe", type: "checkbox" }
      ];
  }
};
