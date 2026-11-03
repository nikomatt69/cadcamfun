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
        { name: "angle", get label() { return t("cad.prop.angle") }, type: "number", step: 1 },
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
        { name: "radius", get label() { return t("cad.prop.outerRadius") }, type: "number", min: 0.1, step: 0.1 },
        { name: "tube", get label() { return t("cad.prop.tubeRadius") }, type: "number", min: 0.1, step: 0.1 },
        { name: "radialSegments", get label() { return t("cad.prop.radialSegments") }, type: "number", min: 3, step: 1 },
        { name: "tubularSegments", get label() { return t("cad.prop.tubularSegments") }, type: "number", min: 3, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "polygon":
      // For polygon, we'll provide fields for center coordinates and radius
      // Complex point editing would need a custom editor component
      return [
        { name: "x", get label() { return t("cad.prop.xCenter") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.prop.yCenter") }, type: "number", step: 0.1 },
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
          get label() { return t("cad.prop.shapeType") },
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
        { name: "bevel", get label() { return t("cad.prop.bevel") }, type: "checkbox" },
        {
          name: "bevelThickness",
          get label() { return t("cad.prop.bevelThickness") },
          type: "number",
          min: 0.1,
          step: 0.1,
          showIf: (props: { bevel: any }) => props.bevel
        },
        {
          name: "bevelSize",
          get label() { return t("cad.prop.bevelSize") },
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
        { name: "radius", get label() { return t("cad.prop.tubeRadius") }, type: "number", min: 0.1, step: 0.1 },
        { name: "tubularSegments", get label() { return t("cad.prop.segmentsAlongPath") }, type: "number", min: 1, step: 1 },
        { name: "radialSegments", get label() { return t("cad.prop.segmentsAroundTube") }, type: "number", min: 3, step: 1 },
        { name: "closed", get label() { return t("cad.prop.closedPath") }, type: "checkbox" },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" },
        { name: "path", get label() { return t("cad.prop.pathPoints") }, type: "pointList", minPoints: 2 }
      ];

    case "lathe":
      // For lathe, we need a complex editor for profile points
      return [
        { name: "x", get label() { return t("cad.prop.xCenter") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.prop.yCenter") }, type: "number", step: 0.1 },
        { name: "z", get label() { return t("cad.prop.zCenter") }, type: "number", step: 0.1 },
        { name: "segments", get label() { return t("pages.segments") }, type: "number", min: 3, step: 1 },
        { name: "phiStart", get label() { return t("cad.prop.startAngleRad") }, type: "number", step: 0.1 },
        { name: "phiLength", get label() { return t("cad.prop.arcLengthRad") }, type: "number", min: 0, max: 6.28, step: 0.1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" },
        { name: "points", get label() { return t("cad.prop.profilePoints") }, type: "pointList", minPoints: 2 }
      ];

    case "text":
    case "text3d":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "text", get label() { return t("cad.prop.textContent") }, type: "text" },
        { name: "size", get label() { return t("cad.field.fontSize") }, type: "number", min: 1, step: 0.5 },
        { name: "depth", get label() { return t("cad.prop.extrusionDepth") }, type: "number", min: 0, step: 0.1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "bevel", get label() { return t("cad.prop.bevel") }, type: "checkbox" },
        {
          name: "font",
          get label() { return t("cad.prop.font") },
          type: "select",
          options: [
            { value: "Arial", label: "Arial" }, // i18n-ok font family name
            { value: "Helvetica", label: "Helvetica" }, // i18n-ok font family name
            { value: "Times New Roman", label: "Times New Roman" } // i18n-ok font family name
          ]
        }
      ];

    case "grid":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "size", get label() { return t("cad.snap.gridSize") }, type: "number", min: 1, step: 1 },
        { name: "divisions", get label() { return t("cad.prop.divisionCount") }, type: "number", min: 1, step: 1 },
        { name: "colorCenterLine", get label() { return t("cad.prop.centerLineColor") }, type: "color" },
        { name: "colorGrid", get label() { return t("cad.prop.gridColor") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        {
          name: "plane",
          get label() { return t("cad.prop.gridPlane") },
          type: "select",
          options: [
            { value: "xy", get label() { return t("cad.prop.xyPlane") } },
            { value: "xz", get label() { return t("cad.prop.xzPlane") } },
            { value: "yz", get label() { return t("cad.prop.yzPlane") } }
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
        { name: "x", get label() { return t("cad.prop.xGroupCenter") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.prop.yGroupCenter") }, type: "number", step: 0.1 },
        { name: "z", get label() { return t("cad.prop.zGroupCenter") }, type: "number", step: 0.1 },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "elements", get label() { return t("cad.prop.groupElements") }, type: "list", listType: "element" }
      ];

    // ======= PRIMITIVE AVANZATE =======
    case "pyramid":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "baseWidth", get label() { return t("cad.prop.baseWidth") }, type: "number", min: 0.1, step: 0.1 },
        { name: "baseDepth", get label() { return t("cad.prop.baseDepth") }, type: "number", min: 0.1, step: 0.1 },
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
        { name: "sides", get label() { return t("cad.prop.sides") }, type: "number", min: 3, step: 1 },
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
          get label() { return t("cad.prop.direction") },
          type: "select",
          options: [
            { value: "up", label: "Up" },
            { value: "down", get label() { return t("cad.prop.down") } }
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
        { name: "radiusZ", get label() { return t("cad.prop.radiusZ") }, type: "number", min: 0.1, step: 0.1 },
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
          get label() { return t("cad.prop.direction") },
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
        { name: "startAngle", get label() { return t("cad.prop.startAngleRad") }, type: "number", step: 0.1 },
        { name: "endAngle", get label() { return t("cad.prop.endAngleRad") }, type: "number", step: 0.1 },
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
        { name: "points", get label() { return t("cad.prop.vertices") }, type: "pointList", exactPoints: 3 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "linewidth", get label() { return t("cad.toolpanel.lineWidth") }, type: "number", min: 1, max: 10, step: 1 }
      ];

    // ======= CURVE AVANZATE =======
    case "spline":
      return [
        { name: "points", get label() { return t("cad.prop.controlPoints") }, type: "pointList", minPoints: 2 },
        { name: "divisions", get label() { return t("cad.prop.divisions") }, type: "number", min: 1, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "linewidth", get label() { return t("cad.toolpanel.lineWidth") }, type: "number", min: 1, max: 10, step: 1 }
      ];

    case "bezier":
      return [
        { name: "points", get label() { return t("cad.prop.controlPoints") }, type: "pointList", minPoints: 4 },
        { name: "divisions", get label() { return t("cad.prop.divisions") }, type: "number", min: 1, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "linewidth", get label() { return t("cad.toolpanel.lineWidth") }, type: "number", min: 1, max: 10, step: 1 }
      ];

    case "nurbs":
      return [
        { name: "points", get label() { return t("cad.prop.controlPoints") }, type: "pointList", minPoints: 4 },
        { name: "degree", get label() { return t("cad.field.degree") }, type: "number", min: 1, max: 5, step: 1 },
        { name: "divisions", get label() { return t("cad.prop.divisions") }, type: "number", min: 1, step: 1 },
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
        { name: "operands", get label() { return t("cad.prop.operandElements") }, type: "list", listType: "element" },
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
        { name: "profile", get label() { return t("cad.prop.profilePoints") }, type: "pointList", minPoints: 2 },
        { name: "segments", get label() { return t("pages.segments") }, type: "number", min: 3, step: 1 },
        { name: "angle", get label() { return t("cad.prop.revolutionAngleRad") }, type: "number", min: 0, max: 6.28, step: 0.1 },
        {
          name: "axis",
          get label() { return t("cad.prop.rotationAxis") },
          type: "select",
          options: [
            { value: "x", get label() { return t("cad.prop.xAxis") } },
            { value: "y", get label() { return t("cad.prop.yAxis") } },
            { value: "z", get label() { return t("cad.prop.zAxis") } }
          ]
        },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "sweep":
      return [
        { name: "profile", get label() { return t("cad.prop.crossSection") }, type: "pointList", minPoints: 3 },
        { name: "path", get label() { return t("cad.prop.pathPoints") }, type: "pointList", minPoints: 2 },
        { name: "radius", get label() { return t("cad.prop.pathRadius") }, type: "number", min: 0.1, step: 0.1 },
        { name: "segments", get label() { return t("pages.segments") }, type: "number", min: 3, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "loft":
      return [
        { name: "profiles", get label() { return t("cad.prop.sectionProfiles") }, type: "pointList", minPoints: 3 },
        { name: "positions", get label() { return t("cad.prop.sectionPositions") }, type: "pointList", minPoints: 2 },
        { name: "closed", get label() { return t("cad.prop.closed") }, type: "checkbox" },
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
        { name: "pitch", get label() { return t("cad.prop.pitch") }, type: "number", min: 0.1, step: 0.1 },
        { name: "length", get label() { return t("cad.prop.length") }, type: "number", min: 0.1, step: 0.1 },
        {
          name: "handedness",
          get label() { return t("cad.prop.handedness") },
          type: "select",
          options: [
            { value: "right", get label() { return t("cad.prop.rightHanded") } },
            { value: "left", get label() { return t("cad.prop.leftHanded") } }
          ]
        },
        {
          name: "standard",
          get label() { return t("cad.material.standard") },
          type: "select",
          options: [
            { value: "metric", get label() { return t("cad.prop.metric") } },
            { value: "imperial", get label() { return t("cad.prop.imperial") } }
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
        { name: "distance", get label() { return t("cad.prop.chamferDistance") }, type: "number", min: 0.1, step: 0.1 },
        { name: "edges", get label() { return t("cad.prop.edgesToChamfer") }, type: "list", listType: "edge" },
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
        { name: "radius", get label() { return t("cad.prop.filletRadius") }, type: "number", min: 0.1, step: 0.1 },
        { name: "edges", get label() { return t("cad.prop.edgesToFillet") }, type: "list", listType: "edge" },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "gear":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "moduleValue", get label() { return t("cad.prop.module") }, type: "number", min: 0.1, step: 0.1 },
        { name: "teeth", get label() { return t("cad.prop.numberOfTeeth") }, type: "number", min: 3, step: 1 },
        { name: "thickness", get label() { return t("cad.prop.thickness") }, type: "number", min: 0.1, step: 0.1 },
        { name: "pressureAngle", get label() { return t("cad.prop.pressureAngle") }, type: "number", min: 0, max: 45, step: 1 },
        { name: "holeDiameter", get label() { return t("cad.prop.centerHoleDiameter") }, type: "number", min: 0, step: 0.1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "spring":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "radius", get label() { return t("cad.prop.springRadius") }, type: "number", min: 0.1, step: 0.1 },
        { name: "wireRadius", get label() { return t("cad.prop.wireRadius") }, type: "number", min: 0.1, step: 0.1 },
        { name: "turns", get label() { return t("cad.prop.numberOfTurns") }, type: "number", min: 1, step: 0.5 },
        { name: "height", get label() { return t("cad.prop.totalHeight") }, type: "number", min: 0.1, step: 0.1 },
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
        { name: "length", get label() { return t("cad.prop.length") }, type: "number", min: 0.1, step: 0.1 },
        { name: "thread", get label() { return t("cad.prop.threadSpecification") }, type: "text" },
        { name: "grade", get label() { return t("cad.prop.materialGrade") }, type: "text" },
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
        { name: "thread", get label() { return t("cad.prop.threadSpecification") }, type: "text" },
        {
          name: "type",
          get label() { return t("cad.prop.nutType") },
          type: "select",
          options: [
            { value: "hex", get label() { return t("cad.prop.hexNut") } },
            { value: "square", get label() { return t("cad.prop.squareNut") } },
            { value: "flange", get label() { return t("cad.prop.flangeNut") } }
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
        { name: "outerDiameter", get label() { return t("cad.prop.outerDiameter") }, type: "number", min: 0.1, step: 0.1 },
        { name: "thickness", get label() { return t("cad.prop.thickness") }, type: "number", min: 0.1, step: 0.1 },
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
        { name: "length", get label() { return t("cad.prop.length") }, type: "number", min: 0.1, step: 0.1 },
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
        { name: "length", get label() { return t("cad.prop.length") }, type: "number", min: 0.1, step: 1 },
        { name: "height", get label() { return t("cad.height") }, type: "number", min: 0.1, step: 1 },
        { name: "thickness", get label() { return t("cad.prop.thickness") }, type: "number", min: 0.1, step: 0.1 },
        { name: "openings", get label() { return t("cad.prop.openings") }, type: "list", listType: "opening" },
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
        { name: "length", get label() { return t("cad.prop.length") }, type: "number", min: 0.1, step: 1 },
        { name: "thickness", get label() { return t("cad.prop.thickness") }, type: "number", min: 0.1, step: 0.1 },
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
        { name: "length", get label() { return t("cad.prop.length") }, type: "number", min: 0.1, step: 1 },
        { name: "height", get label() { return t("cad.height") }, type: "number", min: 0.1, step: 1 },
        {
          name: "style",
          get label() { return t("cad.prop.roofStyle") },
          type: "select",
          options: [
            { value: "flat", get label() { return t("browser.mode.flat") } },
            { value: "pitched", get label() { return t("cad.prop.pitched") } }
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
        { name: "thickness", get label() { return t("cad.prop.thickness") }, type: "number", min: 0.1, step: 0.1 },
        {
          name: "style",
          get label() { return t("cad.prop.windowStyle") },
          type: "select",
          options: [
            { value: "simple", get label() { return t("cam.gen.ai.simple") } },
            { value: "divided", get label() { return t("cad.prop.dividedPanes") } }
          ]
        },
        { name: "frameColor", get label() { return t("cad.prop.frameColor") }, type: "color" },
        { name: "color", get label() { return t("cad.prop.glassColor") }, type: "color" },
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
        { name: "thickness", get label() { return t("cad.prop.thickness") }, type: "number", min: 0.1, step: 0.1 },
        {
          name: "style",
          get label() { return t("cad.prop.doorStyle") },
          type: "select",
          options: [
            { value: "simple", get label() { return t("cam.gen.ai.simple") } },
            { value: "paneled", get label() { return t("cad.prop.paneled") } }
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
        { name: "steps", get label() { return t("cad.prop.numberOfSteps") }, type: "number", min: 1, step: 1 },
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
          get label() { return t("cad.prop.columnStyle") },
          type: "select",
          options: [
            { value: "simple", get label() { return t("cam.gen.ai.simple") } },
            { value: "doric", get label() { return t("cad.prop.doric") } },
            { value: "ionic", get label() { return t("cad.prop.ionic") } },
            { value: "corinthian", get label() { return t("cad.prop.corinthian") } }
          ]
        },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    // ======= ELEMENTI SPECIALI =======
    case "path3d":
      return [
        { name: "points", get label() { return t("cad.prop.pathPoints") }, type: "pointList", minPoints: 2 },
        { name: "radius", get label() { return t("cad.prop.pathThickness") }, type: "number", min: 0.1, step: 0.1 },
        { name: "segments", get label() { return t("pages.segments") }, type: "number", min: 3, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "point-cloud":
      return [
        { name: "points", get label() { return t("cad.toolpanel.tool.point-cloud") }, type: "pointList", minPoints: 1 },
        { name: "pointSize", get label() { return t("cad.prop.pointSize") }, type: "number", min: 0.1, step: 0.1 },
        { name: "colors", get label() { return t("cad.prop.pointColors") }, type: "colorList" },
        { name: "color", get label() { return t("cad.prop.defaultColor") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "mesh":
      return [
        { name: "x", get label() { return t("cad.field.x") }, type: "number", step: 0.1 },
        { name: "y", get label() { return t("cad.field.y") }, type: "number", step: 0.1 },
        { name: "z", label: "Z", type: "number", step: 0.1 },
        { name: "vertices", get label() { return t("cad.prop.vertices") }, type: "pointList", minPoints: 3 },
        { name: "faces", get label() { return t("cad.prop.faces") }, type: "list", listType: "face" },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    // ======= STRUMENTI DI MISURAZIONE =======
    case "linear-dimension":
      return [
        { name: "startPoint", get label() { return t("cad.prop.startPoint") }, type: "point3d" },
        { name: "endPoint", get label() { return t("cad.prop.endPoint") }, type: "point3d" },
        {
          name: "offsetDirection",
          get label() { return t("cad.prop.offsetDirection") },
          type: "select",
          options: [
            { value: "x", get label() { return t("cad.prop.xAxis") } },
            { value: "y", get label() { return t("cad.prop.yAxis") } },
            { value: "z", get label() { return t("cad.prop.zAxis") } }
          ]
        },
        { name: "offsetAmount", get label() { return t("cad.prop.offsetAmount") }, type: "number", min: 0, step: 1 },
        {
          name: "unit",
          get label() { return t("cad.prop.unit") },
          type: "select",
          options: [
            { value: "mm", get label() { return t("cad.millimeters") } },
            { value: "cm", label: "cm" },
            { value: "m", label: "m" },
            { value: "in", label: "in" }
          ]
        },
        { name: "precision", get label() { return t("cad.prop.decimalPrecision") }, type: "number", min: 0, max: 6, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "linewidth", get label() { return t("cad.toolpanel.lineWidth") }, type: "number", min: 1, max: 5, step: 0.5 },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "angular-dimension":
      return [
        { name: "vertex", get label() { return t("cad.prop.vertex") }, type: "point3d" },
        { name: "startPoint", get label() { return t("cad.prop.firstLineEnd") }, type: "point3d" },
        { name: "endPoint", get label() { return t("cad.prop.secondLineEnd") }, type: "point3d" },
        { name: "radius", get label() { return t("cad.prop.arcRadius") }, type: "number", min: 1, step: 1 },
        { name: "precision", get label() { return t("cad.prop.decimalPrecision") }, type: "number", min: 0, max: 2, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "linewidth", get label() { return t("cad.toolpanel.lineWidth") }, type: "number", min: 1, max: 5, step: 0.5 },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "radius-dimension":
      return [
        { name: "center", get label() { return t("cad.prop.circleCenter") }, type: "point3d" },
        { name: "pointOnCircle", get label() { return t("cad.prop.pointOnCircle") }, type: "point3d" },
        { name: "precision", get label() { return t("cad.prop.decimalPrecision") }, type: "number", min: 0, max: 6, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "linewidth", get label() { return t("cad.toolpanel.lineWidth") }, type: "number", min: 1, max: 5, step: 0.5 },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "diameter-dimension":
      return [
        { name: "center", get label() { return t("cad.prop.circleCenter") }, type: "point3d" },
        { name: "pointOnCircle", get label() { return t("cad.prop.pointOnCircle") }, type: "point3d" },
        { name: "precision", get label() { return t("cad.prop.decimalPrecision") }, type: "number", min: 0, max: 6, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "linewidth", get label() { return t("cad.toolpanel.lineWidth") }, type: "number", min: 1, max: 5, step: 0.5 },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    // ======= STRUMENTI DI DISEGNO =======
    case "drawing-pen":
      return [
        { name: "points", get label() { return t("cad.prop.penStrokePoints") }, type: "pointList", minPoints: 2 },
        { name: "penSize", get label() { return t("cad.prop.penSize") }, type: "number", min: 1, max: 10, step: 0.5 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "drawing-highlighter":
      return [
        { name: "points", get label() { return t("cad.prop.highlighterStrokePoints") }, type: "pointList", minPoints: 2 },
        { name: "highlighterSize", get label() { return t("cad.prop.highlighterSize") }, type: "number", min: 1, max: 30, step: 1 },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "opacity", get label() { return t("cad.material.opacity") }, type: "number", min: 0.1, max: 1, step: 0.1 },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "drawing-text":
      return [
        { name: "position", get label() { return t("cad.field.textPosition") }, type: "point3d" },
        { name: "text", get label() { return t("cad.prop.textContent") }, type: "text" },
        { name: "textSize", get label() { return t("cad.field.textSize") }, type: "number", min: 8, max: 72, step: 1 },
        {
          name: "font",
          get label() { return t("cad.prop.font") },
          type: "select",
          options: [
            { value: "Arial", label: "Arial" }, // i18n-ok font family name
            { value: "Helvetica", label: "Helvetica" }, // i18n-ok font family name
            { value: "Times New Roman", label: "Times New Roman" }, // i18n-ok font family name
            { value: "Courier New", label: "Courier New" } // i18n-ok font family name
          ]
        },
        { name: "color", get label() { return t("library.color") }, type: "color" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "drawing-eraser":
      return [
        { name: "points", get label() { return t("cad.prop.eraserPathPoints") }, type: "pointList", minPoints: 2 },
        { name: "eraserSize", get label() { return t("cad.prop.eraserSize") }, type: "number", min: 5, max: 50, step: 1 },
        { name: "showEraserPath", get label() { return t("cad.prop.showEraserPath") }, type: "checkbox" },
        { name: "rotation", get label() { return t("cad.field.rotation") }, type: "vector3", unit: "°" },
        { name: "wireframe", get label() { return t("cad.wireframe") }, type: "checkbox" }
      ];

    case "drawing-screenshot-area":
      return [
        { name: "startPoint", get label() { return t("cad.prop.areaStartPoint") }, type: "point3d" },
        { name: "endPoint", get label() { return t("cad.prop.areaEndPoint") }, type: "point3d" },
        {
          name: "format",
          get label() { return t("cad.prop.imageFormat") },
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
