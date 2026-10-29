import { t } from "../../../i18n/index.ts"
/** What the property panel shows for each element type: one entry per editable field. */
export interface PropertyField {
  name: string
  label: string
  type: "number" | "color" | "checkbox" | "select" | "text" | "vector3" | "point3d" | "pointList" | "list" | "colorList"
  step?: number
  min?: number
  max?: number
  unit?: string
  /** Whole numbers only; defaults to true for counts (segments, sides, teeth...), see `numberRulesFor`. */
  integer?: boolean
  minPoints?: number
  maxPoints?: number
  exactPoints?: number
  listType?: string
  options?: { value: string; label: string }[]
  showIf?: (properties: any) => boolean
}

/** Fields that count things: a typed `32,5` there is an error, not a dimension. */
const COUNT_FIELDS: ReadonlySet<string> = new Set(["segments", "radialSegments", "tubularSegments", "heightSegments", "widthSegments", "sides", "divisions", "steps", "teeth", "degree", "precision", "count", "copies"])

/** How a number field's typed text is checked: limits, whole numbers for counts, degrees for angles. */
export const numberRulesFor = (field: PropertyField): { min?: number; max?: number; integer: boolean; degrees: boolean } => ({
  ...(field.min !== undefined ? { min: field.min } : {}),
  ...(field.max !== undefined ? { max: field.max } : {}),
  integer: field.integer ?? COUNT_FIELDS.has(field.name),
  degrees: field.unit === "°" || /\(°\)|angle/i.test(field.label) || /angle/i.test(field.name)
})

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
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "linewidth", get label() { return t("cad.toolpanel.lineWidth") }, type: "number", min: 1, max: 10, step: 1 }
      ];

    case "circle":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radius", get label() { return t("cad.field.radius") }, type: "number", min: 0.1, step: 0.1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "linewidth", get label() { return t("cad.toolpanel.lineWidth") }, type: "number", min: 1, max: 10, step: 1 }
      ];

    case "rectangle":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "width", get label() { return t("cad.width") }, type: "number", min: 0.1, step: 0.1 },
        { name: "height", get label() { return t("cad.height") }, type: "number", min: 0.1, step: 0.1 },
        { name: "angle", label: "Angle (°)", type: "number", step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "linewidth", get label() { return t("cad.toolpanel.lineWidth") }, type: "number", min: 1, max: 10, step: 1 }
      ];

    case "cube":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "width", get label() { return t("cad.width") }, type: "number", min: 0.1, step: 0.1 },
        { name: "height", get label() { return t("cad.height") }, type: "number", min: 0.1, step: 0.1 },
        { name: "depth", get label() { return t("cad.depth") }, type: "number", min: 0.1, step: 0.1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "sphere":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radius", get label() { return t("cad.field.radius") }, type: "number", min: 0.1, step: 0.1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "cylinder":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radius", get label() { return t("cad.field.radius") }, type: "number", min: 0.1, step: 0.1 },
        { name: "height", get label() { return t("cad.height") }, type: "number", min: 0.1, step: 0.1 },
        { name: "segments", get label() { return t("pages.segments") }, type: "number", min: 3, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "cone":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radius", get label() { return t("cad.field.radius") }, type: "number", min: 0.1, step: 0.1 },
        { name: "height", get label() { return t("cad.height") }, type: "number", min: 0.1, step: 0.1 },
        { name: "segments", get label() { return t("pages.segments") }, type: "number", min: 3, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "torus":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radius", label: "Outer Radius", type: "number", min: 0.1, step: 0.1 },
        { name: "tube", label: "Tube Radius", type: "number", min: 0.1, step: 0.1 },
        { name: "radialSegments", label: "Radial Segments", type: "number", min: 3, step: 1 },
        { name: "tubularSegments", label: "Tubular Segments", type: "number", min: 3, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "polygon":
      // For polygon, we'll provide fields for center coordinates and radius
      // Complex point editing would need a custom editor component
      return [
        { name: "x", label: "X (Center)", type: "number", step: 0.1 },
        { name: "y", label: "Y (Center)", type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radius", get label() { return t("cad.field.radius") }, type: "number", min: 0.1, step: 0.1 },
        { name: "sides", get label() { return t("cam.gen.op.sides") }, type: "number", min: 3, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "extrusion":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        {
          name: "shape",
          label: "Shape Type",
          type: "select",
          options: [
            { value: "rect", get label() { return t("cad.rectangle") } },
            { value: "circle", get label() { return t("cad.circle") } }
          ]
        },
        {
          name: "width",
          get label() { return t("cad.width") },
          type: "number",
          min: 0.1,
          step: 0.1,
          showIf: (props: { shape: string }) => props.shape === "rect"
        },
        {
          name: "height",
          get label() { return t("cad.height") },
          type: "number",
          min: 0.1,
          step: 0.1,
          showIf: (props: { shape: string }) => props.shape === "rect"
        },
        {
          name: "radius",
          get label() { return t("cad.field.radius") },
          type: "number",
          min: 0.1,
          step: 0.1,
          showIf: (props: { shape: string }) => props.shape === "circle"
        },
        { name: "depth", get label() { return t("cad.depth") }, type: "number", min: 0.1, step: 0.1 },
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
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];
    case "tube":
      // For tube, we need a more complex editor for path points
      // Here we provide basic properties
      return [
        { name: "radius", label: "Tube Radius", type: "number", min: 0.1, step: 0.1 },
        { name: "tubularSegments", label: "Segments Along Path", type: "number", min: 1, step: 1 },
        { name: "radialSegments", label: "Segments Around Tube", type: "number", min: 3, step: 1 },
        { name: "closed", label: "Closed Path", type: "checkbox" },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" },
        { name: "path", label: "Path Points", type: "pointList", minPoints: 2 }
      ];

    case "lathe":
      // For lathe, we need a complex editor for profile points
      return [
        { name: "x", label: "X (Center)", type: "number", step: 0.1 },
        { name: "y", label: "Y (Center)", type: "number", step: 0.1 },
        { name: "z", label: "Z (Center)", type: "number", step: 0.1 },
        { name: "segments", get label() { return t("pages.segments") }, type: "number", min: 3, step: 1 },
        { name: "phiStart", label: "Start Angle (rad)", type: "number", step: 0.1 },
        { name: "phiLength", label: "Arc Length (rad)", type: "number", min: 0, max: 6.28, step: 0.1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" },
        { name: "points", label: "Profile Points", type: "pointList", minPoints: 2 }
      ];

    case "text":
    case "text3d":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "text", label: "Text Content", type: "text" },
        { name: "size", get label() { return t("cad.field.fontSize") }, type: "number", min: 1, step: 0.5 },
        { name: "depth", label: "Extrusion Depth", type: "number", min: 0, step: 0.1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
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
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "size", get label() { return t("cad.snap.gridSize") }, type: "number", min: 1, step: 1 },
        { name: "divisions", label: "Division Count", type: "number", min: 1, step: 1 },
        { name: "colorCenterLine", label: "Center Line Color", type: "color" },
        { name: "colorGrid", label: "Grid Color", type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
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
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "width", get label() { return t("cad.width") }, type: "number", min: 0.1, step: 0.1 },
        { name: "height", get label() { return t("cad.height") }, type: "number", min: 0.1, step: 0.1 },
        { name: "depth", get label() { return t("cad.depth") }, type: "number", min: 0.1, step: 0.1 },
        {
          name: "material",
          get label() { return t("cad.viewMaterial") },
          type: "select",
          options: [
            { value: "aluminum", get label() { return t("cam.explorer.materialName.aluminum") } },
            { value: "steel", get label() { return t("cam.gen.mat.steel") } },
            { value: "wood", get label() { return t("cam.gen.mat.wood") } },
            { value: "plastic", get label() { return t("cam.gen.mat.plastic") } },
            { value: "brass", get label() { return t("cam.gen.mat.brass") } }
          ]
        },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "group":
      // For group elements, we only provide position properties
      // Individual elements within the group need separate editing
      return [
        { name: "x", label: "X (Group Center)", type: "number", step: 0.1 },
        { name: "y", label: "Y (Group Center)", type: "number", step: 0.1 },
        { name: "z", label: "Z (Group Center)", type: "number", step: 0.1 },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "elements", label: "Group Elements", type: "list", listType: "element" }
      ];

    // ======= PRIMITIVE AVANZATE =======
    case "pyramid":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "baseWidth", label: "Base Width", type: "number", min: 0.1, step: 0.1 },
        { name: "baseDepth", label: "Base Depth", type: "number", min: 0.1, step: 0.1 },
        { name: "height", get label() { return t("cad.height") }, type: "number", min: 0.1, step: 0.1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "prism":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radius", get label() { return t("cad.field.radius") }, type: "number", min: 0.1, step: 0.1 },
        { name: "height", get label() { return t("cad.height") }, type: "number", min: 0.1, step: 0.1 },
        { name: "sides", label: "Sides", type: "number", min: 3, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "hemisphere":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radius", get label() { return t("cad.field.radius") }, type: "number", min: 0.1, step: 0.1 },
        { name: "segments", get label() { return t("pages.segments") }, type: "number", min: 3, step: 1 },
        {
          name: "direction",
          label: "Direction",
          type: "select",
          options: [
            { value: "up", label: "Up" },
            { value: "down", label: "Down" }
          ]
        },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "ellipsoid":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radiusX", get label() { return t("cad.field.radiusX") }, type: "number", min: 0.1, step: 0.1 },
        { name: "radiusY", get label() { return t("cad.field.radiusY") }, type: "number", min: 0.1, step: 0.1 },
        { name: "radiusZ", label: "Radius Z", type: "number", min: 0.1, step: 0.1 },
        { name: "segments", get label() { return t("pages.segments") }, type: "number", min: 3, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "capsule":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radius", get label() { return t("cad.field.radius") }, type: "number", min: 0.1, step: 0.1 },
        { name: "height", get label() { return t("cad.height") }, type: "number", min: 0.1, step: 0.1 },
        {
          name: "direction",
          label: "Direction",
          type: "select",
          options: [
            { value: "x", get label() { return t("cad.field.x") } },
            { value: "y", get label() { return t("cad.field.y") } },
            { value: "z", label: "Z" }
          ]
        },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    // ======= ELEMENTI 2D AGGIUNTIVI =======
    case "ellipse":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radiusX", get label() { return t("cad.field.radiusX") }, type: "number", min: 0.1, step: 0.1 },
        { name: "radiusY", get label() { return t("cad.field.radiusY") }, type: "number", min: 0.1, step: 0.1 },
        { name: "segments", get label() { return t("pages.segments") }, type: "number", min: 3, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "linewidth", get label() { return t("cad.toolpanel.lineWidth") }, type: "number", min: 1, max: 10, step: 1 }
      ];

    case "arc":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radius", get label() { return t("cad.field.radius") }, type: "number", min: 0.1, step: 0.1 },
        { name: "startAngle", label: "Start Angle (rad)", type: "number", step: 0.1 },
        { name: "endAngle", label: "End Angle (rad)", type: "number", step: 0.1 },
        { name: "segments", get label() { return t("pages.segments") }, type: "number", min: 3, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "linewidth", get label() { return t("cad.toolpanel.lineWidth") }, type: "number", min: 1, max: 10, step: 1 }
      ];

    case "triangle":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "points", label: "Vertices", type: "pointList", exactPoints: 3 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "linewidth", get label() { return t("cad.toolpanel.lineWidth") }, type: "number", min: 1, max: 10, step: 1 }
      ];

    // ======= CURVE AVANZATE =======
    case "spline":
      return [
        { name: "points", label: "Control Points", type: "pointList", minPoints: 2 },
        { name: "divisions", label: "Divisions", type: "number", min: 1, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "linewidth", get label() { return t("cad.toolpanel.lineWidth") }, type: "number", min: 1, max: 10, step: 1 }
      ];

    case "bezier":
      return [
        { name: "points", label: "Control Points", type: "pointList", minPoints: 4 },
        { name: "divisions", label: "Divisions", type: "number", min: 1, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "linewidth", get label() { return t("cad.toolpanel.lineWidth") }, type: "number", min: 1, max: 10, step: 1 }
      ];

    case "nurbs":
      return [
        { name: "points", label: "Control Points", type: "pointList", minPoints: 4 },
        { name: "degree", get label() { return t("cad.field.degree") }, type: "number", min: 1, max: 5, step: 1 },
        { name: "divisions", label: "Divisions", type: "number", min: 1, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "linewidth", get label() { return t("cad.toolpanel.lineWidth") }, type: "number", min: 1, max: 10, step: 1 }
      ];

    // ======= OPERAZIONI BOOLEANE =======
    case "boolean-union":
    case "boolean-subtract":
    case "boolean-intersect":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "operands", label: "Operand Elements", type: "list", listType: "element" },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    // A parametric part: its geometry comes from its history, edited in the parametric panel below the form.
    case "parametric":
    case "brep":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    // ======= OPERAZIONI DI TRASFORMAZIONE =======
    case "revolution":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "profile", label: "Profile Points", type: "pointList", minPoints: 2 },
        { name: "segments", get label() { return t("pages.segments") }, type: "number", min: 3, step: 1 },
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
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "sweep":
      return [
        { name: "profile", label: "Cross Section", type: "pointList", minPoints: 3 },
        { name: "path", label: "Path Points", type: "pointList", minPoints: 2 },
        { name: "radius", label: "Path Radius", type: "number", min: 0.1, step: 0.1 },
        { name: "segments", get label() { return t("pages.segments") }, type: "number", min: 3, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "loft":
      return [
        { name: "profiles", label: "Section Profiles", type: "pointList", minPoints: 3 },
        { name: "positions", label: "Section Positions", type: "pointList", minPoints: 2 },
        { name: "closed", label: "Closed", type: "checkbox" },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    // ======= ELEMENTI INDUSTRIALI =======
    case "thread":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "diameter", get label() { return t("library.tool.diameter") }, type: "number", min: 0.1, step: 0.1 },
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
          get label() { return t("cad.material.standard") },
          type: "select",
          options: [
            { value: "metric", label: "Metric" },
            { value: "imperial", label: "Imperial" }
          ]
        },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "chamfer":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "width", get label() { return t("cad.width") }, type: "number", min: 0.1, step: 0.1 },
        { name: "height", get label() { return t("cad.height") }, type: "number", min: 0.1, step: 0.1 },
        { name: "depth", get label() { return t("cad.depth") }, type: "number", min: 0.1, step: 0.1 },
        { name: "distance", label: "Chamfer Distance", type: "number", min: 0.1, step: 0.1 },
        { name: "edges", label: "Edges to Chamfer", type: "list", listType: "edge" },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "fillet":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "width", get label() { return t("cad.width") }, type: "number", min: 0.1, step: 0.1 },
        { name: "height", get label() { return t("cad.height") }, type: "number", min: 0.1, step: 0.1 },
        { name: "depth", get label() { return t("cad.depth") }, type: "number", min: 0.1, step: 0.1 },
        { name: "radius", label: "Fillet Radius", type: "number", min: 0.1, step: 0.1 },
        { name: "edges", label: "Edges to Fillet", type: "list", listType: "edge" },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "gear":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "moduleValue", label: "Module", type: "number", min: 0.1, step: 0.1 },
        { name: "teeth", label: "Number of Teeth", type: "number", min: 3, step: 1 },
        { name: "thickness", label: "Thickness", type: "number", min: 0.1, step: 0.1 },
        { name: "pressureAngle", label: "Pressure Angle (°)", type: "number", min: 0, max: 45, step: 1 },
        { name: "holeDiameter", label: "Center Hole Diameter", type: "number", min: 0, step: 0.1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "spring":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radius", label: "Spring Radius", type: "number", min: 0.1, step: 0.1 },
        { name: "wireRadius", label: "Wire Radius", type: "number", min: 0.1, step: 0.1 },
        { name: "turns", label: "Number of Turns", type: "number", min: 1, step: 0.5 },
        { name: "height", label: "Total Height", type: "number", min: 0.1, step: 0.1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    // ======= ELEMENTI DI ASSEMBLAGGIO =======
    case "screw":

    case "bolt":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "size", get label() { return t("cad.status.size") }, type: "text" },
        { name: "length", label: "Length", type: "number", min: 0.1, step: 0.1 },
        { name: "thread", label: "Thread Specification", type: "text" },
        { name: "grade", label: "Material Grade", type: "text" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "nut":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "size", get label() { return t("cad.status.size") }, type: "text" },
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
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "washer":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "size", get label() { return t("cad.status.size") }, type: "text" },
        { name: "outerDiameter", label: "Outer Diameter", type: "number", min: 0.1, step: 0.1 },
        { name: "thickness", label: "Thickness", type: "number", min: 0.1, step: 0.1 },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "rivet":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "diameter", get label() { return t("library.tool.diameter") }, type: "number", min: 0.1, step: 0.1 },
        { name: "length", label: "Length", type: "number", min: 0.1, step: 0.1 },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    // ======= ELEMENTI ARCHITETTONICI =======
    case "wall":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "length", label: "Length", type: "number", min: 0.1, step: 1 },
        { name: "height", get label() { return t("cad.height") }, type: "number", min: 0.1, step: 1 },
        { name: "thickness", label: "Thickness", type: "number", min: 0.1, step: 0.1 },
        { name: "openings", label: "Openings", type: "list", listType: "opening" },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "floor":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "width", get label() { return t("cad.width") }, type: "number", min: 0.1, step: 1 },
        { name: "length", label: "Length", type: "number", min: 0.1, step: 1 },
        { name: "thickness", label: "Thickness", type: "number", min: 0.1, step: 0.1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "roof":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "width", get label() { return t("cad.width") }, type: "number", min: 0.1, step: 1 },
        { name: "length", label: "Length", type: "number", min: 0.1, step: 1 },
        { name: "height", get label() { return t("cad.height") }, type: "number", min: 0.1, step: 1 },
        {
          name: "style",
          label: "Roof Style",
          type: "select",
          options: [
            { value: "flat", get label() { return t("browser.mode.flat") } },
            { value: "pitched", label: "Pitched" }
          ]
        },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "window":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "width", get label() { return t("cad.width") }, type: "number", min: 0.1, step: 0.1 },
        { name: "height", get label() { return t("cad.height") }, type: "number", min: 0.1, step: 0.1 },
        { name: "thickness", label: "Thickness", type: "number", min: 0.1, step: 0.1 },
        {
          name: "style",
          label: "Window Style",
          type: "select",
          options: [
            { value: "simple", get label() { return t("cam.gen.ai.simple") } },
            { value: "divided", label: "Divided Panes" }
          ]
        },
        { name: "frameColor", label: "Frame Color", type: "color" },
        { name: "color", label: "Glass Color", type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "door":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "width", get label() { return t("cad.width") }, type: "number", min: 0.1, step: 0.1 },
        { name: "height", get label() { return t("cad.height") }, type: "number", min: 0.1, step: 0.1 },
        { name: "thickness", label: "Thickness", type: "number", min: 0.1, step: 0.1 },
        {
          name: "style",
          label: "Door Style",
          type: "select",
          options: [
            { value: "simple", get label() { return t("cam.gen.ai.simple") } },
            { value: "paneled", label: "Paneled" }
          ]
        },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "stair":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "width", get label() { return t("cad.width") }, type: "number", min: 0.1, step: 1 },
        { name: "height", get label() { return t("cad.height") }, type: "number", min: 0.1, step: 1 },
        { name: "depth", get label() { return t("cad.depth") }, type: "number", min: 0.1, step: 1 },
        { name: "steps", label: "Number of Steps", type: "number", min: 1, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "column":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radius", get label() { return t("cad.field.radius") }, type: "number", min: 0.1, step: 0.1 },
        { name: "height", get label() { return t("cad.height") }, type: "number", min: 0.1, step: 1 },
        {
          name: "style",
          label: "Column Style",
          type: "select",
          options: [
            { value: "simple", get label() { return t("cam.gen.ai.simple") } },
            { value: "doric", label: "Doric" },
            { value: "ionic", label: "Ionic" },
            { value: "corinthian", label: "Corinthian" }
          ]
        },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    // ======= ELEMENTI SPECIALI =======
    case "path3d":
      return [
        { name: "points", label: "Path Points", type: "pointList", minPoints: 2 },
        { name: "radius", label: "Path Thickness", type: "number", min: 0.1, step: 0.1 },
        { name: "segments", get label() { return t("pages.segments") }, type: "number", min: 3, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "point-cloud":
      return [
        { name: "points", get label() { return t("cad.toolpanel.tool.point-cloud") }, type: "pointList", minPoints: 1 },
        { name: "pointSize", label: "Point Size", type: "number", min: 0.1, step: 0.1 },
        { name: "colors", label: "Point Colors", type: "colorList" },
        { name: "color", label: "Default Color", type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "mesh":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "vertices", label: "Vertices", type: "pointList", minPoints: 3 },
        { name: "faces", label: "Faces", type: "list", listType: "face" },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
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
            { value: "mm", get label() { return t("cad.millimeters") } },
            { value: "cm", label: "cm" },
            { value: "m", label: "m" },
            { value: "in", label: "in" }
          ]
        },
        { name: "precision", label: "Decimal Precision", type: "number", min: 0, max: 6, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "linewidth", get label() { return t("cad.toolpanel.lineWidth") }, type: "number", min: 1, max: 5, step: 0.5 },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "angular-dimension":
      return [
        { name: "vertex", label: "Vertex", type: "point3d" },
        { name: "startPoint", label: "First Line End", type: "point3d" },
        { name: "endPoint", label: "Second Line End", type: "point3d" },
        { name: "radius", label: "Arc Radius", type: "number", min: 1, step: 1 },
        { name: "precision", label: "Decimal Precision", type: "number", min: 0, max: 2, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "linewidth", get label() { return t("cad.toolpanel.lineWidth") }, type: "number", min: 1, max: 5, step: 0.5 },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "radius-dimension":
      return [
        { name: "center", label: "Circle Center", type: "point3d" },
        { name: "pointOnCircle", label: "Point on Circle", type: "point3d" },
        { name: "precision", label: "Decimal Precision", type: "number", min: 0, max: 6, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "linewidth", get label() { return t("cad.toolpanel.lineWidth") }, type: "number", min: 1, max: 5, step: 0.5 },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "diameter-dimension":
      return [
        { name: "center", label: "Circle Center", type: "point3d" },
        { name: "pointOnCircle", label: "Point on Circle", type: "point3d" },
        { name: "precision", label: "Decimal Precision", type: "number", min: 0, max: 6, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "linewidth", get label() { return t("cad.toolpanel.lineWidth") }, type: "number", min: 1, max: 5, step: 0.5 },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    // ======= STRUMENTI DI DISEGNO =======
    case "drawing-pen":
      return [
        { name: "points", label: "Pen Stroke Points", type: "pointList", minPoints: 2 },
        { name: "penSize", label: "Pen Size", type: "number", min: 1, max: 10, step: 0.5 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "drawing-highlighter":
      return [
        { name: "points", label: "Highlighter Stroke Points", type: "pointList", minPoints: 2 },
        { name: "highlighterSize", label: "Highlighter Size", type: "number", min: 1, max: 30, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "opacity", get label() { return t("cad.material.opacity") }, type: "number", min: 0.1, max: 1, step: 0.1 },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "drawing-text":
      return [
        { name: "position", get label() { return t("cad.field.textPosition") }, type: "point3d" },
        { name: "text", label: "Text Content", type: "text" },
        { name: "textSize", get label() { return t("cad.field.textSize") }, type: "number", min: 8, max: 72, step: 1 },
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
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "drawing-eraser":
      return [
        { name: "points", label: "Eraser Path Points", type: "pointList", minPoints: 2 },
        { name: "eraserSize", label: "Eraser Size", type: "number", min: 5, max: 50, step: 1 },
        { name: "showEraserPath", label: "Show Eraser Path", type: "checkbox" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
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
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    default:
      // Fallback per qualsiasi tipo di elemento non gestito
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "width", get label() { return t("cad.width") }, type: "number", min: 0.1, step: 1 },
        { name: "height", get label() { return t("cad.height") }, type: "number", min: 0.1, step: 1 },
        { name: "depth", get label() { return t("cad.depth") }, type: "number", min: 0.1, step: 1 },
        { name: "radius", get label() { return t("cad.field.radius") }, type: "number", min: 0.1, step: 1 },
        { name: "segments", get label() { return t("pages.segments") }, type: "number", min: 3, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];
  }
};
