/**
 * The Resources generator: what "generate" means per library kind, and the brief the assistant receives.
 *
 * Each Resources page reuses the assistant instead of a second AI pipeline: the brief names the catalogue tools the
 * assistant must call and enumerates every parameter the kind stores, so a generated row is complete — units named,
 * no empty fields — rather than a name with a hollow body. Components are real geometry: the assistant builds the
 * part with `cad_edit`, then saves it with `parts.save` and fills its metadata.
 *
 * The module is pure: the dialog renders it, `buildGenerationPrompt` turns the form into the brief, and the tests
 * check both against the parameters the Resources pages actually store.
 */
import { cam } from "@cadcamfun/core"

export type ResourceKind = "materials" | "tools" | "machines" | "components"

/** One stored parameter the generator must fill: what it is, and the unit or rule the model must respect. */
export interface GenerationParameter {
  readonly name: string
  readonly hint: string
}

export interface ResourceGeneration {
  readonly singular: string
  readonly plural: string
  /** The catalogue tools the assistant calls (`library_edit`, `parts`, …), as the UI shows them. */
  readonly tools: ReadonlyArray<string>
  readonly parameters: ReadonlyArray<GenerationParameter>
  /** One-click requests the dialog offers under the free-text box. */
  readonly examples: ReadonlyArray<string>
  readonly placeholder: string
  /** What makes this kind different, shown under the form. */
  readonly note: string
}

const TOOL_TYPE_LINES: ReadonlyArray<string> = Object.entries(cam.TOOL_TYPES)
  .map(([machine, types]) => `${machine}: ${types.join(", ")}`)

export const RESOURCE_GENERATION: Readonly<Record<ResourceKind, ResourceGeneration>> = {
  materials: {
    singular: "Material",
    plural: "Materials",
    tools: ["library_edit"],
    parameters: [
      { name: "name", hint: "the alloy and condition as the shop writes it (6061-T6, S235JR)" },
      { name: "description", hint: "one line: where the values come from, heat treatment, stock form" },
      { name: "properties.density", hint: "kg/m³" },
      { name: "properties.hardness", hint: "value with its scale (HB, HV, HRC)" },
      { name: "properties.thermalConductivity", hint: "W/(m·K)" },
      { name: "properties.elasticModulus", hint: "GPa" },
      { name: "properties.poissonRatio", hint: "between 0 and 0.5" },
      { name: "properties.yieldStrength", hint: "MPa" },
      { name: "properties.ultimateStrength", hint: "MPa" },
      { name: "properties.color", hint: "hex preview colour (#rrggbb)" },
      { name: "isPublic", hint: "library visibility" }
    ],
    examples: ["Aluminium 6061-T6 plate", "S235JR structural steel", "Delrin POM-C", "8 mm cast acrylic"],
    placeholder: "Name the material (alloy, condition, stock form); every property is filled from it.",
    note: "The assistant writes materials with `library_edit` → `upsert_material`; all properties are stored, not just the name."
  },
  tools: {
    singular: "Tool",
    plural: "Tools",
    tools: ["library_edit"],
    parameters: [
      { name: "name", hint: "what the label says (Ø6 3-flute carbide end mill)" },
      { name: "type", hint: `a supported cutter type — ${TOOL_TYPE_LINES.join("; ")}` },
      { name: "diameter", hint: "mm" },
      { name: "material", hint: "cutter material (carbide, HSS, diamond-coated, …)" },
      { name: "numberOfFlutes", hint: "flutes" },
      { name: "maxRPM", hint: "spindle ceiling from the maker, rpm" },
      { name: "coolantType", hint: "flood, mist, through, air or none" },
      { name: "cuttingLength", hint: "flute length, mm" },
      { name: "totalLength", hint: "overall length, mm" },
      { name: "shankDiameter", hint: "mm" },
      { name: "cornerRadius", hint: "corner or nose radius, mm (0 is a sharp corner)" },
      { name: "tipAngle", hint: "included or taper angle, degrees (pointed tools)" },
      { name: "threadPitch", hint: "mm (thread mills and taps)" },
      { name: "holderDiameter", hint: "holder body, mm" },
      { name: "holderLength", hint: "holder length, mm" },
      { name: "stickout", hint: "from the holder to the tip, mm" },
      { name: "notes", hint: "the speeds and feeds the maker recommends" },
      { name: "isPublic", hint: "library visibility" }
    ],
    examples: [
      "A set of 4 carbide end mills Ø3, 6, 8 and 12 mm for aluminium",
      "Ø6 mm 3-flute carbide end mill, 20 mm flute length",
      "M6 spiral tap for aluminium",
      "90° countersink, Ø10 mm shank"
    ],
    placeholder: "Describe the cutter(s): type, sizes, material to machine. Every dimension and its holder are filled in.",
    note: "The assistant writes cutters with `library_edit` → `upsert_tool`; a parameter the cutter type does not have is left out with a reason, never filled with a guess."
  },
  machines: {
    singular: "Configuration",
    plural: "Configurations",
    tools: ["library_edit"],
    parameters: [
      { name: "name", hint: "as the shop calls it (Haas VF-2)" },
      { name: "kind", hint: "mill, lathe or 3Dprinter" },
      { name: "description", hint: "controller and what the machine is used for" },
      { name: "postProcessor", hint: "post / emulator id (fanuc, grbl, heidenhain, linuxcnc, …)" },
      { name: "kinematics", hint: "min and max travel for every axis the machine has (X, Y, Z, A, B, C), mm or degrees" },
      { name: "workOffsets", hint: "the offsets the control keeps, e.g. G54..G59" },
      { name: "probing", hint: "probe cycles, stylus radius and offset, when the machine has a probe" },
      { name: "maxRPM", hint: "spindle ceiling, rpm" },
      { name: "maxFeed", hint: "feed ceiling, mm/min" },
      { name: "isPublic", hint: "library visibility" }
    ],
    examples: ["Haas VF-2 mill, Fanuc", "Tormach 8L lathe, LinuxCNC", "Generic GRBL mill 300×180×60 mm", "Bambu Lab X1C, 256×256×256 mm"],
    placeholder: "Name the machine and its controller; the travel envelope, spindle and feed ceilings come with it.",
    note: "The assistant writes machines with `library_edit` → `upsert_machine_config`: kinematics per axis, post processor, work offsets and ceilings — the same rows the CAM reads."
  },
  components: {
    singular: "Component",
    plural: "Components",
    tools: ["cad_edit", "parts"],
    parameters: [
      { name: "name", hint: "what the part is called in the library" },
      { name: "description", hint: "what it is and its key size (L-bracket 60×60×6 mm)" },
      { name: "type", hint: "mechanical, standard, custom, …" },
      { name: "geometry", hint: "real 3D elements added with `cad_edit` → `add`, every feature dimension in mm" },
      { name: "layer", hint: "the draft elements go on one named layer, so they are easy to find" },
      { name: "elements", hint: "saved with `parts` → `save`: the element ids, their relative placement and count" },
      { name: "isPublic", hint: "library visibility" }
    ],
    examples: ["An L-bracket 60×60×6 mm with two Ø6 holes", "A 20-tooth spur gear, module 2", "A 12 mm shaft coupler with two set screws"],
    placeholder: "Describe the part with its overall size; the assistant builds it, saves it and fills its metadata.",
    note: "A component is real geometry: the assistant builds the part in the open project with `cad_edit`, saves it with `parts` → `save`, and the draft elements stay on their layer so you can see and reuse them."
  }
}

/** The write the assistant performs for one kind; the pages watch the call to reload when a row lands. */
export const GENERATION_WRITE_ACTIONS: Readonly<Record<ResourceKind, ReadonlyArray<string>>> = {
  materials: ["library_edit.upsert_material"],
  tools: ["library_edit.upsert_tool"],
  machines: ["library_edit.upsert_machine_config"],
  components: ["parts.save"]
}

export interface GenerationRequest {
  readonly kind: ResourceKind
  readonly request: string
  readonly quantity: number
  readonly makePublic: boolean
  /** Whether the assistant also makes the new rows the open project's defaults (materials, tools, machines). */
  readonly setDefault: boolean
  /** The open project, named for components (the geometry is built in it); optional for the other kinds. */
  readonly projectName?: string | undefined
}

export const MIN_GENERATION_COUNT = 1
export const MAX_GENERATION_COUNT = 12

/** Longest request the brief carries; the assistant's composer allows 4000 characters and the brief adds its own text. */
export const MAX_REQUEST_CHARS = 1200

/** One line, no quote that could end the request early, and bounded: the request is data inside the brief, not part of it. */
export const cleanRequest = (value: string): string =>
  value.replace(/\s+/g, " ").replace(/["“”]/g, "'").trim().slice(0, MAX_REQUEST_CHARS)

export const generationCount = (value: number): number =>
  Math.max(MIN_GENERATION_COUNT, Math.min(MAX_GENERATION_COUNT, Math.trunc(value) || MIN_GENERATION_COUNT))

const CATALOGUE_ACTIONS: Readonly<Record<ResourceKind, string>> = {
  materials: "upsert_material",
  tools: "upsert_tool",
  machines: "upsert_machine_config",
  components: "save"
}

const catalogueStep = (kind: ResourceKind, count: number): string => {
  const boxes = RESOURCE_GENERATION[kind].tools.map((tool) => `\`${tool}\``).join(" then ")
  if (kind === "components") {
    return `Build it: ${boxes} — add the geometry with \`cad_edit\` (action \`add\` for 3D solids, \`add_entities\` for 2D), place it on one new layer (action \`editor\`, layer_create, name it), then call \`parts\` action \`${CATALOGUE_ACTIONS.components}\` with the element ids, the name, the description, the type and the visibility.`
  }
  return `Write each row with \`${RESOURCE_GENERATION[kind].tools[0]}\` action \`${CATALOGUE_ACTIONS[kind]}\` — one call per ${count === 1 ? "row" : "row"}, never a placeholder and never a second call for the same row.`
}

/** The brief handed to the assistant: one request in, complete rows out. */
export const buildGenerationPrompt = (input: GenerationRequest): string => {
  const spec = RESOURCE_GENERATION[input.kind]
  const count = generationCount(input.quantity)
  const request = cleanRequest(input.request)
  const wanted = count === 1 ? `1 ${spec.singular.toLowerCase()}` : `${count} ${spec.plural.toLowerCase()}`
  const visibility = input.makePublic
    ? "Mark the new rows public (visible to every user)."
    : "Keep the new rows private to this account."
  const defaults = input.setDefault && input.kind !== "components"
    ? ` Then call \`library_edit\` action \`set_default\` so the new ${spec.plural.toLowerCase()} seed the open project's operations.`
    : ""
  const parameters = spec.parameters.map((parameter) => `- ${parameter.name}: ${parameter.hint}`).join("\n")
  const project = input.kind === "components" && input.projectName !== undefined && input.projectName !== ""
    ? `\nThe open project is "${input.projectName}": the geometry is built and saved there.`
    : ""
  return [
    `Resources generator — ${spec.plural}.${project}`,
    `Create ${wanted} that match this request: "${request === "" ? `the ${spec.singular.toLowerCase()} the library is missing` : request}".`,
    catalogueStep(input.kind, count),
    "",
    "Fill EVERY parameter of the row — a row with an empty field is incomplete and must not be written:",
    parameters,
    "",
    input.kind === "components"
      ? "Use real dimensions in millimetres and name every feature (holes, radii, thickness) in the reply. Do not delete anything in the drawing: the draft stays on its layer."
      : "Use real, published values for the named item and keep the numbers consistent (lengths that nest, ceilings the machine can reach, a diameter the type allows). When a value is genuinely unknown, choose what a machinist would expect, write it, and list it under \"assumed\" in your reply.",
    visibility + defaults,
    `When the ${count === 1 ? "row" : "rows"} exist, reply with one line each: name — id — the values you wrote.`
  ].join("\n")
}
