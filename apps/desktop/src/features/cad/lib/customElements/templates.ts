/**
 * The custom element templates the editor offers (legacy `customElements/templates.ts`).
 *
 * Each entry is a ready-made definition: parameters, a geometry body and the material it previews
 * with. The geometry bodies are ported verbatim from the legacy templates so an element authored
 * against them behaves the same.
 */
import type { CustomElementDefinition, CustomElementParameter, CustomElementTemplate } from "../../types/customElements.ts"
import { t } from "../../../../i18n/index.ts"

export const customElementTemplates: Readonly<Record<string, CustomElementTemplate>> = {
  basicBox: {
    get name() { return t("cad.template.basicBox.name") },
    get description() { return t("cad.template.basicBox.description") },
    category: "Basic Shapes",
    tags: ["box", "basic", "primitive"],
    parameters: {
      width: { type: "number", default: 50, min: 1, max: 1000, step: 1, get description() { return t("cad.template.basicBox.width.description") }, get label() { return t("cad.template.basicBox.width.label") } },
      height: { type: "number", default: 50, min: 1, max: 1000, step: 1, get description() { return t("cad.template.basicBox.height.description") }, get label() { return t("cad.template.basicBox.height.label") } },
      depth: { type: "number", default: 50, min: 1, max: 1000, step: 1, get description() { return t("cad.template.basicBox.depth.description") }, get label() { return t("cad.template.basicBox.depth.label") } },
      color: { type: "color", default: "#1e88e5", get description() { return t("cad.template.basicBox.color.description") }, get label() { return t("cad.template.basicBox.color.label") } },
      wireframe: { type: "boolean", default: false, get description() { return t("cad.template.basicBox.wireframe.description") }, get label() { return t("cad.template.basicBox.wireframe.label") } },
    },
    geometryCode: `// Parametric box geometry
const geometry = new THREE.BoxGeometry(
  parameters.width,
  parameters.height,
  parameters.depth
);

return geometry;`,
    materialConfig: {
      type: "standard",
      properties: { color: "parameters.color", wireframe: "parameters.wireframe" },
    },
  },

  parametricGear: {
    get name() { return t("cad.template.parametricGear.name") },
    get description() { return t("cad.template.parametricGear.description") },
    category: "Mechanical",
    tags: ["gear", "mechanical", "parametric"],
    parameters: {
      teeth: { type: "number", default: 20, min: 6, max: 100, step: 1, get description() { return t("cad.template.parametricGear.teeth.description") }, get label() { return t("cad.template.parametricGear.teeth.label") } },
      module: { type: "number", default: 1, min: 0.1, max: 10, step: 0.1, get description() { return t("cad.template.parametricGear.module.description") }, get label() { return t("cad.template.parametricGear.module.label") } },
      thickness: { type: "number", default: 5, min: 1, max: 50, step: 0.5, get description() { return t("cad.template.parametricGear.thickness.description") }, get label() { return t("cad.template.parametricGear.thickness.label") } },
      holeRadius: { type: "number", default: 2, min: 0, max: 20, step: 0.1, get description() { return t("cad.template.parametricGear.holeRadius.description") }, get label() { return t("cad.template.parametricGear.holeRadius.label") } },
      color: { type: "color", default: "#b0bec5", get description() { return t("cad.template.parametricGear.color.description") }, get label() { return t("cad.template.parametricGear.color.label") } },
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
      type: "standard",
      properties: { color: "parameters.color", metalness: 0.3, roughness: 0.4 },
    },
  },

  lBracket: {
    get name() { return t("cad.template.lBracket.name") },
    get description() { return t("cad.template.lBracket.description") },
    category: "Structural",
    tags: ["bracket", "mounting", "structural"],
    parameters: {
      width1: { type: "number", default: 50, min: 10, max: 200, step: 1, get description() { return t("cad.template.lBracket.width1.description") }, get label() { return t("cad.template.lBracket.width1.label") } },
      width2: { type: "number", default: 50, min: 10, max: 200, step: 1, get description() { return t("cad.template.lBracket.width2.description") }, get label() { return t("cad.template.lBracket.width2.label") } },
      thickness: { type: "number", default: 5, min: 2, max: 20, step: 1, get description() { return t("cad.template.lBracket.thickness.description") }, get label() { return t("cad.template.lBracket.thickness.label") } },
      height: { type: "number", default: 10, min: 5, max: 50, step: 1, get description() { return t("cad.template.lBracket.height.description") }, get label() { return t("cad.template.lBracket.height.label") } },
      color: { type: "color", default: "#607d8b", get description() { return t("cad.template.lBracket.color.description") }, get label() { return t("cad.template.lBracket.color.label") } },
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
      type: "standard",
      properties: { color: "parameters.color", metalness: 0.7, roughness: 0.3 },
    },
  },

  spiralSpring: {
    get name() { return t("cad.template.spiralSpring.name") },
    get description() { return t("cad.template.spiralSpring.description") },
    category: "Mechanical",
    tags: ["spring", "mechanical", "coil"],
    parameters: {
      radius: { type: "number", default: 10, min: 1, max: 50, step: 0.5, get description() { return t("cad.template.spiralSpring.radius.description") }, get label() { return t("cad.template.spiralSpring.radius.label") } },
      wireRadius: { type: "number", default: 1, min: 0.1, max: 5, step: 0.1, get description() { return t("cad.template.spiralSpring.wireRadius.description") }, get label() { return t("cad.template.spiralSpring.wireRadius.label") } },
      turns: { type: "number", default: 8, min: 1, max: 20, step: 1, get description() { return t("cad.template.spiralSpring.turns.description") }, get label() { return t("cad.template.spiralSpring.turns.label") } },
      height: { type: "number", default: 50, min: 10, max: 200, step: 1, get description() { return t("cad.template.spiralSpring.height.description") }, get label() { return t("cad.template.spiralSpring.height.label") } },
      color: { type: "color", default: "#9e9e9e", get description() { return t("cad.template.spiralSpring.color.description") }, get label() { return t("cad.template.spiralSpring.color.label") } },
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
      type: "standard",
      properties: { color: "parameters.color", metalness: 0.8, roughness: 0.2 },
    },
  },

  customText3D: {
    get name() { return t("cad.template.customText3D.name") },
    get description() { return t("cad.template.customText3D.description") },
    category: "Text & Symbols",
    tags: ["text", "3d", "typography"],
    parameters: {
      text: { type: "string", default: "HELLO", get description() { return t("cad.template.customText3D.text.description") }, get label() { return t("cad.template.customText3D.text.label") } },
      size: { type: "number", default: 20, min: 5, max: 100, step: 1, get description() { return t("cad.template.customText3D.size.description") }, get label() { return t("cad.template.customText3D.size.label") } },
      depth: { type: "number", default: 5, min: 1, max: 20, step: 0.5, get description() { return t("cad.template.customText3D.depth.description") }, get label() { return t("cad.template.customText3D.depth.label") } },
      font: { type: "select", default: "helvetiker", options: ["helvetiker", "gentilis", "droid sans", "droid serif"], get description() { return t("cad.template.customText3D.font.description") }, get label() { return t("cad.template.customText3D.font.label") } },
      color: { type: "color", default: "#4285f4", get description() { return t("cad.template.customText3D.color.description") }, get label() { return t("cad.template.customText3D.color.label") } },
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
      type: "standard",
      properties: { color: "parameters.color", metalness: 0.1, roughness: 0.8 },
    },
  },

  honeycombPattern: {
    get name() { return t("cad.template.honeycombPattern.name") },
    get description() { return t("cad.template.honeycombPattern.description") },
    category: "Patterns",
    tags: ["honeycomb", "hexagon", "pattern"],
    parameters: {
      cellSize: { type: "number", default: 10, min: 2, max: 50, step: 1, get description() { return t("cad.template.honeycombPattern.cellSize.description") }, get label() { return t("cad.template.honeycombPattern.cellSize.label") } },
      rows: { type: "number", default: 5, min: 1, max: 20, step: 1, get description() { return t("cad.template.honeycombPattern.rows.description") }, get label() { return t("cad.template.honeycombPattern.rows.label") } },
      cols: { type: "number", default: 5, min: 1, max: 20, step: 1, get description() { return t("cad.template.honeycombPattern.cols.description") }, get label() { return t("cad.template.honeycombPattern.cols.label") } },
      thickness: { type: "number", default: 2, min: 0.5, max: 10, step: 0.5, get description() { return t("cad.template.honeycombPattern.thickness.description") }, get label() { return t("cad.template.honeycombPattern.thickness.label") } },
      color: { type: "color", default: "#ffeb3b", get description() { return t("cad.template.honeycombPattern.color.description") }, get label() { return t("cad.template.honeycombPattern.color.label") } },
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
      type: "standard",
      properties: { color: "parameters.color", metalness: 0.2, roughness: 0.6 },
    },
  },
}

/** The templates, optionally narrowed to one category. */
export const getTemplatesByCategory = (category?: string): ReadonlyArray<CustomElementTemplate> => {
  const templates = Object.values(customElementTemplates)
  return category ? templates.filter((template) => template.category === category) : templates
}

/** Every category the templates cover, sorted. */
export const getTemplateCategories = (): ReadonlyArray<string> =>
  Array.from(new Set(Object.values(customElementTemplates).map((template) => template.category))).sort()

/** A ready-to-save definition built from a template, or `null` when the key is unknown. */
export const createDefinitionFromTemplate = (
  templateKey: string,
  customName?: string,
): Omit<CustomElementDefinition, "id" | "created" | "modified"> | null => {
  const template = customElementTemplates[templateKey]
  if (template === undefined) return null
  return {
    // The texts of a template resolve through `t()` when read, so the copy takes them once, in the language of the moment.
    name: customName || template.name,
    description: template.description,
    category: template.category,
    tags: [...template.tags],
    version: "1.0.0",
    author: "User",
    parameters: Object.fromEntries(Object.entries(template.parameters).map(([name, parameter]): [string, CustomElementParameter] => [name, { ...parameter }])),
    geometryCode: template.geometryCode,
    materialConfig: template.materialConfig ? { ...template.materialConfig } : undefined,
    previewConfig: template.previewConfig ? { ...template.previewConfig } : undefined,
  }
}
