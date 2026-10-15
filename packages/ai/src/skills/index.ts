/// <reference path="../text.d.ts" />
/**
 * The skills of the `cadcam` agent: short, task-shaped playbooks the model loads on demand with nikcli's
 * `skill` tool. nikcli discovers them as `<config>/skills/<name>/SKILL.md`, so `installSkills` writes them
 * there whenever the host config is written. The text is what an experienced CAM programmer would tell a
 * new colleague, tied to the tools this app really has; it makes no promise the tools do not keep.
 */
import { mkdir, readdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { cam } from "@cadcamfun/core"
import { ELEMENT_SPECS, elementCatalogueLines } from "../element-catalog.ts"
import cad3dModeling from "./text/cad-3d-modeling.md" with { type: "text" }
import camOperationWorkflow from "./text/cam-operation-workflow.md" with { type: "text" }
import toolpathVerification from "./text/toolpath-verification.md" with { type: "text" }
import cuttingParameters from "./text/cutting-parameters.md" with { type: "text" }
import drillingAndHoles from "./text/drilling-and-holes.md" with { type: "text" }
import precisionAndTolerances from "./text/precision-and-tolerances.md" with { type: "text" }
import industrialStandards from "./text/industrial-standards.md" with { type: "text" }
import machinesAndAxes from "./text/machines-and-axes.md" with { type: "text" }
import drawingsAndImages from "./text/drawings-and-images.md" with { type: "text" }
import pluginAuthoring from "./text/plugin-authoring.md" with { type: "text" }
import parametricDesign from "./text/parametric-design.md" with { type: "text" }
import fusion360Modelling from "./text/fusion-360-modelling.md" with { type: "text" }
import composedCamPrograms from "./text/composed-cam-programs.md" with { type: "text" }
import versionControlCadcam from "./text/version-control-cadcam.md" with { type: "text" }
import workflowsCadcam from "./text/workflows-cadcam.md" with { type: "text" }
import machiningCyclePresets from "./text/machining-cycle-presets.md" with { type: "text" }
import projectAutoMemory from "./text/project-auto-memory.md" with { type: "text" }
import stockAndFixtures from "./text/stock-and-fixtures.md" with { type: "text" }

/** Written next to a skill that came from the user's store, so a deleted one can be cleaned from the host config. */
export const USER_MARKER = ".user-skill"

/**
 * What each cutter type is for. The list of types is the generator's own schema, so a type the generator
 * gains is documented here by name instead of becoming something the model must guess; the gloss is ours.
 */
const TOOL_TYPE_GLOSS: Readonly<Record<string, string>> = {
  endmill: "flat end mill, the default for almost everything",
  ballnose: "ball nose, for curved surfaces",
  drill: "twist drill; the cycle comes from the operation",
  vbit: "V-bit, for engraving and for a cut chamfer",
  chamfer: "chamfer mill, for a real chamfer pass",
  threadmill: "thread mill, for helical thread milling",
  reamer: "reamer, for a bore that is finished, not cut",
  probe: "touch probe, for a probing operation",
  toolsetter: "tool setter, for measuring length and diameter"
}
const TOOL_TYPE_NOTES = cam.generator.ToolTypeSchema.literals
  .map((type) => `\`${type}\` (${TOOL_TYPE_GLOSS[type] ?? "look it up before using"})`)
  .join(", ")

export interface CadCamSkill {
  readonly name: string
  readonly description: string
  readonly category: string
  readonly tags: ReadonlyArray<string>
  readonly body: string
}

/** A history the skill quotes: the tests rebuild it, so the example the assistant copies is one that builds. */
export const FUSION_EXAMPLE_HISTORY = {
  parameters: { width: 80, depth: 50, thick: 8, slotLength: 30, slotWidth: 6, boss: 5, bossHeight: 10 },
  features: [
    { id: "base_sketch", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "plate", kind: "rectangle", at: [0, 0], width: "width", height: "depth", centered: true }] } },
    { id: "base", type: "extrude", sketch: "base_sketch", depth: "thick", operation: "new" },
    { id: "slot_sketch", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "slot", kind: "slot", at: [0, 10], length: "slotLength", width: "slotWidth" }] } },
    { id: "slot_cut", type: "extrude", sketch: "slot_sketch", depth: "thick * 3", direction: "symmetric", operation: "subtract" },
    { id: "post", type: "primitive", element: "cylinder", params: { radius: "boss", height: "bossHeight" }, at: [-25, -12, "thick + bossHeight / 2"], operation: "union" },
    { id: "posts", type: "pattern", feature: "post", kind: "linear", count: 3, step: [25, 0, 0] }
  ]
} as const

/**
 * The values a playbook quotes from the code, so the text never drifts from it: `{{name}}` in a `text/*.md` file is
 * replaced here. Any other `{{...}}` (a workflow's `${{ steps.x.outputs.y }}`) is left as written.
 */
const SKILL_VALUES: Readonly<Record<string, () => string>> = {
  elementCatalogue: () => elementCatalogueLines(),
  fusionExample: () => JSON.stringify(FUSION_EXAMPLE_HISTORY),
  toolTypes: () => TOOL_TYPE_NOTES
}

/** A playbook with its placeholders filled; an unknown placeholder is a programming error, caught by the tests. */
export const skillText = (template: string): string =>
  template.trim().replace(/\{\{([a-zA-Z]+)\}\}/g, (match, name: string) => {
    const value = SKILL_VALUES[name]
    if (value === undefined) throw new Error(`Unknown skill placeholder ${match}`)
    return value()
  })

export const CADCAM_SKILLS: ReadonlyArray<CadCamSkill> = [
  { name: "cad-3d-modeling", description: `Model 3D and 2D geometry in the open editor (${Object.keys(ELEMENT_SPECS).length} element types): conventions, recipes for common parts, how to build complex objects.`, category: "cad", tags: ["cad", "3d", "modeling"], body: skillText(cad3dModeling) },
  { name: "cam-operation-workflow", description: "The loop from a drawing to verified G-code: describe, parameters, operation, generate, analyse, verify, fix.", category: "cam", tags: ["cam", "workflow", "gcode"], body: skillText(camOperationWorkflow) },
  { name: "toolpath-verification", description: "How to read and report a cam_edit action verify result: every finding code, its cause and its fix, and what was not modelled.", category: "cam", tags: ["cam", "verification", "safety"], body: skillText(toolpathVerification) },
  { name: "cutting-parameters", description: "Speeds, feeds, stepdown and stepover starting points by material, and the formulas behind them.", category: "cam", tags: ["cam", "feeds", "speeds"], body: skillText(cuttingParameters) },
  { name: "drilling-and-holes", description: "Drilling operations: cycles, peck rules, through-hole depth, large holes.", category: "cam", tags: ["cam", "drilling"], body: skillText(drillingAndHoles) },
  { name: "precision-and-tolerances", description: "Working to microns: nominal sizes, tolerance on round shapes, ISO 286 grades, finishing strategy and what the verification can and cannot show.", category: "cam", tags: ["precision", "tolerance", "iso286"], body: skillText(precisionAndTolerances) },
  { name: "industrial-standards", description: "Mechanical and industrial rules for professional parts: ISO 2768 general tolerances, ISO 286 fits, surface finish, ISO 273 / ISO 4762 fastener holes, tap drills, DIN 6885 keys, ISO 54 gears, preferred numbers, design rules per process (milling, turning, sheet metal, casting, printing) and material densities.", category: "cad", tags: ["iso", "din", "tolerance", "fits", "dfm", "standards"], body: skillText(industrialStandards) },
  { name: "machines-and-axes", description: "Mill, lathe and 3D printer: what turns, the sense of every axis, zeros and work offsets, touch probes and tool setters, and how to check a program against its machine.", category: "cam", tags: ["machines", "axes", "origin", "probing"], body: skillText(machinesAndAxes) },
  { name: "drawings-and-images", description: "From a DXF/SVG file, an image of a dimensioned drawing, a photo or a sketch to a 3D model: which tool, what to ask, how to check the result.", category: "cad", tags: ["cad", "import", "dxf", "svg", "image"], body: skillText(drawingsAndImages) },
  { name: "plugin-authoring", description: "Write an extension for the app (command, panel, post-processor, operation): manifest, capabilities, module shape and rules.", category: "dev", tags: ["plugin", "extension", "sdk"], body: skillText(pluginAuthoring) },
  { name: "parametric-design", description: "When and how to build a parametric element: named dimensions, expressions, when to choose parametric over loose solids, how to edit later.", category: "cad", tags: ["cad", "parametric", "dimensions"], body: skillText(parametricDesign) },
  { name: "fusion-360-modelling", description: "Fusion 360 commands mapped to parametric features: shapes, curves (spline, Bezier, NURBS), sweep, revolve, loft, coil, rib, sheet metal, modelled threads, text, push/pull, draft, joints, catalogue solids, combine, split, move, scale, patterns and parameters.", category: "cad", tags: ["cad", "parametric", "fusion360", "sweep", "revolve", "nurbs"], body: skillText(fusion360Modelling) },
  { name: "composed-cam-programs", description: "Compose CAM programs with several operations: sequencing, stock carry-over, multi-setup, lathe plus mill, verification per operation.", category: "cam", tags: ["cam", "workflow", "milling", "lathe"], body: skillText(composedCamPrograms) },
  { name: "version-control-cadcam", description: "How the agent uses the git-style version control: branches, commits, pull requests and the rules that keep AI writes safe.", category: "vcs", tags: ["vcs", "branches", "pr"], body: skillText(versionControlCadcam) },
  { name: "workflows-cadcam", description: "How the agent uses the Actions-style workflows: YAML shape, registered uses steps, interpolation, and when to dispatch manually.", category: "workflows", tags: ["workflows", "actions", "automation"], body: skillText(workflowsCadcam) },
  { name: "machining-cycle-presets", description: "Reusable pocket, contour, adaptive, drilling and turning sequences with explicit machine and verification requirements.", category: "cam", tags: ["cam", "cycles", "presets"], body: skillText(machiningCyclePresets) },
  { name: "project-auto-memory", description: "Automatically retain verified project facts and resume connected CAD/CAM tasks after delegation or compaction.", category: "general", tags: ["memory", "context", "continuation"], body: skillText(projectAutoMemory) },
  { name: "stock-and-fixtures", description: "Stock, origin and fixtures: how to describe them so the verification can catch collisions.", category: "cam", tags: ["cam", "setup", "fixtures"], body: skillText(stockAndFixtures) }
]

/** The `SKILL.md` text nikcli reads: front matter then the playbook. */
export const skillMarkdown = (skill: CadCamSkill): string =>
  `---\nname: ${skill.name}\ndescription: ${JSON.stringify(skill.description)}\ncategory: ${skill.category}\ntags: [${skill.tags.join(", ")}]\nversion: "1"\n---\n\n${skill.body}\n`

/**
 * Writes the skills under `<configDir>/skills/`. Folders of ours are replaced, so an edit in this file reaches the host
 * on the next start; anything else in that folder is left alone.
 */
export const installSkills = async (configDir: string, userSkills: ReadonlyArray<{ name: string; description: string; body: string }> = []): Promise<ReadonlyArray<string>> => {
  const root = join(configDir, "skills")
  await mkdir(root, { recursive: true })
  // Skills the user loaded earlier carry a marker; the ones no longer in the store are removed with it.
  for (const entry of await readdir(root).catch(() => [] as string[])) {
    if (await Bun.file(join(root, entry, USER_MARKER)).exists()) await rm(join(root, entry), { recursive: true, force: true })
  }
  for (const skill of CADCAM_SKILLS) {
    const dir = join(root, skill.name)
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, "SKILL.md"), skillMarkdown(skill))
  }
  const loaded: string[] = []
  for (const skill of userSkills) {
    if (CADCAM_SKILLS.some((builtIn) => builtIn.name === skill.name)) continue
    const dir = join(root, skill.name)
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, "SKILL.md"), skillMarkdown({ ...skill, category: "user", tags: ["user"] }))
    await writeFile(join(dir, USER_MARKER), "installed from the user's skills\n")
    loaded.push(skill.name)
  }
  return [...CADCAM_SKILLS.map((skill) => skill.name), ...loaded]
}
