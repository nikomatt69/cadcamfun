/**
 * The skills of the `cadcam` agent: short, task-shaped playbooks the model loads on demand with nikcli's
 * `skill` tool. nikcli discovers them as `<config>/skills/<name>/SKILL.md`, so `installSkills` writes them
 * there whenever the host config is written. The text is what an experienced CAM programmer would tell a
 * new colleague, tied to the tools this app really has; it makes no promise the tools do not keep.
 */
import { mkdir, readdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { ELEMENT_SPECS } from "../element-catalog.ts"

/** Written next to a skill that came from the user's store, so a deleted one can be cleaned from the host config. */
export const USER_MARKER = ".user-skill"

export interface CadCamSkill {
  readonly name: string
  readonly description: string
  readonly category: string
  readonly tags: ReadonlyArray<string>
  readonly body: string
}

const MODELING = `# Modelling in 3D

Objects are built in 3D, always: \`cad_add_elements\` for every part, shape or assembly. \`cad_add_entities\` is only for a flat sketch the user explicitly asks for. A "car", "bottle" or "bracket" is never a set of rectangles and circles: it is solids, and it should look like the thing. Read the drawing first with \`cad_describe_drawing\`; the tools create the project and the drawing when there are none, so never ask the user to.

## Conventions
- Millimetres and radians. \`x,y,z\` is the centre of a solid and the origin of a profile.
- \`cylinder\`, \`cone\`, \`capsule\` stand along Z; \`revolution\` turns its profile about \`axis\` (default Y): profile \`x\` is the radius, \`y\` the height along the axis.
- \`rectangle\`, \`circle\`, \`polygon\` are flat on the XY plane at height \`z\`.
- Put related parts on one layer (\`layer: "car"\`); the layer is created if needed.
- One call holds at most 40 elements (a long call is cut off by the model's output limit): build big things in steps, each a few calls, in the order a person would build it. Each element in a call is judged on its own: the valid ones are added, the invalid ones are listed under \`skipped\` with their index; resend only those, corrected.

## Recipes
- **Block with a hole**: \`cube\` + \`cylinder\` (taller than the block), then \`boolean-subtract\` with \`operands: [0, 1]\` (indexes of the two elements in the same call).
- **Bottle, vase, shaft, pulley**: ONE \`revolution\`. Give the half section as profile points from the axis outwards, bottom to top, e.g. \`[{x:0,y:0},{x:30,y:0},{x:30,y:150},{x:10,y:200},{x:10,y:260}]\`; use 32+ segments (default).
- **Plate with a pattern of holes**: one \`cube\` plate, the holes as \`cylinder\`s, one \`boolean-subtract\` with the plate first.
- **Bracket / L profile**: \`extrusion\` with \`profile\` points (>= 3, closed automatically) and \`depth\`.
- **Pipe along a path**: \`sweep\` with \`path\` points and a round \`radius\`.
- **Vehicle**: body as a \`cube\` or an \`extrusion\` of the side profile, cabin as a smaller \`cube\`, wheels as four \`cylinder\`s turned to the axle (\`rotation\` in DEGREES: a cylinder stands along Z, so a wheel on a Y axle needs rotation {x: 90}), lights and details as small solids. Say what is simplified.
- **From a DXF or SVG drawing**: \`cad_import_drawing\` with the file text and a \`depth\` (a drawing has no height - ask). Closed outlines become solids standing on Z0, circles and inner loops become holes. If it reports open outlines, say so and offer a larger \`gap\`; never close them by guessing. To work from an image or a dimensioned drawing you can only look at, read the numbers yourself and build with \`cad_add_elements\`.
- **Standard parts**: \`gear\`, \`spring\`, \`bolt\`, \`screw\`, \`nut\`, \`washer\` take their size and defaults from the catalogue.

## Design space
- Right-handed, Z up, XY the ground plane. Solids are placed by their CENTRE. A cube's width is its X extent, height its Y extent, depth its Z extent; cylinders, cones and tori stand along Z.
- \`rotation\` is in DEGREES, arc and revolution angles in RADIANS.

## After modelling
Run \`cad_check_design\`: it finds sizes that are not positive, rotation typed in radians, booleans with missing operands, duplicates, parts that float, and parts outside the stock. Fix what it reports, then describe the drawing again and check the count and the bounds; report ids and positions, not prose. To change something use \`cad_modify_entities\` with the ids you were given; to remove, \`cad_delete_entities\` with \`confirm: true\` only when the user asked.`

const WORKFLOW = `# From model to verified G-code

Follow the loop; do not skip a step and do not call a program safe before the last one.

1. \`cad_describe_drawing\`: what is there, its bounds and ids. Nothing to machine means stop and say so.
2. \`lib_lookup_material\` and \`lib_lookup_tool\`: use the user's tool and material; if there is none, say which assumption you made.
3. \`cam_suggest_parameters\`: depth, stepdown, cutting speed, chip load and warnings for this drawing.
4. \`cam_create_operation\` with a type (contour, pocket, drill, engrave, profile, threading, 3d_surface) and parameters: \`toolDiameter\`, \`depth\` (positive, below the stock top), \`stepdown\`, \`feedrate\`, \`rpm\`, \`material\`, \`offset\` (outside for a part contour, inside for a pocket wall).
5. \`cam_generate_gcode\` for the operation id.
6. \`cam_analyze_gcode\`: static checks (travel limits, missing spindle or feed).
7. \`cam_verify_toolpath\`: simulate it on the stock. Pass what you know: \`tool.cuttingLength\`, \`tool.stickout\`, \`tool.holderDiameter\`, \`fixtures\`, \`targetSolids\` for the finished part.
8. Errors? \`cam_update_operation\`, then generate and verify again. Repeat until the report has no errors or you can state what blocks it.

Report: the operation, the parameters you chose and why, the verification result with what it did NOT model, and the next decision for the user.`

const VERIFICATION = `# Reading a verification report

\`cam_verify_toolpath\` replays the G-code on a height-field model of the stock. It answers "does this program damage anything it knows about", never "is this safe on the machine".

| Code | Meaning | What to do |
| --- | --- | --- |
| RapidInMaterial | a G0 move enters the stock | raise the clearance / retract height of the operation; check the first approach |
| ShankCollision | stock above the flutes touches the shank | a longer cutter, less depth per pass, or a smaller stepdown to leave a wider hole |
| HolderCollision | the holder reaches the stock | more stickout, a slimmer holder, or less depth |
| FixtureCollision | the tool, shank or holder hits a fixture box | move the toolpath or the clamp; say which fixture |
| BelowStock | the tip goes below the stock bottom | reduce the depth; through cuts need a spoilboard |
| Gouge | cut below the finished part by more than the tolerance | wrong offset (inside/outside), too much depth, or a wrong tool diameter |
| UncutStock | stock left above the finished part (information) | normal after roughing; finishing passes are needed |
| ResolutionCoarsened | the grid was coarsened to fit the budget | features under one cell are not resolved: say so |

Always state what was modelled (\`modelled\` in the result): without a holder, fixtures or a target part those checks did not run. Volume and air-cut numbers are planning figures. Never write "safe", "certified" or "collision-free": write "no errors found in what was modelled".`

const PARAMETERS = `# Cutting parameters, as a starting point

Use the tool and material library values first, then \`cam_suggest_parameters\`. Without them, start here and say they are starting values.

- Spindle speed: \`rpm = Vc * 1000 / (pi * D)\`; feed: \`F = rpm * flutes * fz\`.
- Surface speed Vc (m/min, carbide): aluminium 200-400, brass 150-300, plastics 150-300, mild steel 80-150, stainless 50-100, titanium 30-60, hardwood 300-600.
- Chip load fz (mm/tooth) for a 6 mm cutter, scale roughly with diameter: aluminium 0.03-0.06, brass 0.03-0.05, plastics 0.04-0.08, mild steel 0.02-0.04, stainless 0.015-0.03, titanium 0.01-0.03.
- Roughing: stepdown up to 1 x D in aluminium and plastics, 0.3-0.5 x D in steel; stepover 40-50 % of D (10-15 % when slotting full width in steel).
- Finishing: leave 0.1-0.3 mm, climb milling, stepover 5-15 % of D.
- Plunge feed 30-50 % of the cutting feed; a drill is fed by the cycle, not by chip load per tooth.
- Never exceed the machine's maximum spindle speed or feed; the analysis flags both.
- Small cutters (< 3 mm) break first: shallow stepdown, light chip load, no full-width slotting.`

const DRILLING = `# Holes

- Use the \`drill\` operation: the generator emits G81 (simple), G82 (dwell), G83 (peck) or G73 (chip break) from the depth and diameter.
- Peck when the depth is more than about 3 x diameter; clear chips every 1-2 x diameter deeper than that.
- Drill the full depth plus the point: a 118 degree point adds about 0.3 x D below the nominal bottom for a through hole; leave the tip inside the spoilboard.
- Holes larger than about 12 mm: pilot drill first or use a pocket / helical interpolation with an end mill.
- Order holes nearest-first (the generator does) and rapid only above the surface: a rapid in material is an error in the verification.
- Always give the verification the real \`cuttingLength\` of the drill: a hole deeper than the flutes drags the shank through the wall.`

const SETUP = `# Stock, origin and fixtures

- The stock is a box in the coordinates of the G-code; its top is Z0 by default and cuts go to negative Z.
- Origin: workpiece centre, corner, or custom; the verification uses the same origin as the generator, so state it when you set it.
- Describe clamps and vises to the verification as boxes (\`fixtures\`: id and min/max X, Y, Z in program coordinates) so a toolpath into a clamp is caught.
- Describe the holder (\`holderDiameter\`, \`stickout\`) when you know it; unknown means not checked, not safe.
- A second setup (flipping the part) is a new operation with its own stock; do not reuse the first one's depths.`

const PRECISION = `# Micron-level work

Dimensions keep every decimal you give, so precision is a matter of what you write and what you check.

## Writing the model
- 1 micron = 0.001 mm. Write nominal sizes with their decimals; model a toleranced feature at the middle of its limits (25 H7: 25.0105 mm; a 25 g6 shaft: 24.986 mm).
- Round shapes are meshes: give \`tolerance: 0.001\` on every round element (or \`segments\`), otherwise a radius of 50 mm is off by 0.24 mm. If the result carries \`warnings\`, the mesh could not reach it: say the deviation it did reach.
- Never round for readability. Report sizes with the decimals that matter.

## ISO 286 tolerance grades (micron, nominal size ranges in mm)
| Range | IT6 | IT7 | IT8 |
| --- | --- | --- | --- |
| 3-6 | 8 | 12 | 18 |
| 6-10 | 9 | 15 | 22 |
| 10-18 | 11 | 18 | 27 |
| 18-30 | 13 | 21 | 33 |
| 30-50 | 16 | 25 | 39 |
| 50-80 | 19 | 30 | 46 |
An H hole starts at its nominal size and goes up by the grade; a shaft size has its own fundamental deviation (g, h, k...): look the letter up, do not guess.

## Machining it
- Roughing leaves 0.1-0.3 mm; one or two finishing passes take 0.05-0.2 mm with a light stepdown. Set \`tolerance\` 0.001 or finer and \`finishingPass\` true.
- G-code is written to 0.001 mm: it cannot express anything finer, so a tolerance under about 3 microns is a matter for the machine, the tool and the setup, not for the program.
- Tool wear, tool deflection, thermal growth and the machine's own accuracy are not modelled. Say so; propose a first-off measurement and an offset correction.

## Checking it
- \`cam_verify_toolpath\` is exact in height and one cell wide sideways. For micron checks narrow \`stock\` to the feature (a few mm), \`resolution\` 0.002-0.005, \`tolerance\` 0.001, and give the finished part in \`targetSolids\`.
- A pass means "no gouge beyond the tolerance at that resolution", never "in tolerance on the machine".`

const MACHINES = `# Machines, axes and zeros

The same drawing becomes a different program on each machine. Program as if the TOOL moves round a fixed workpiece (ISO 841); what differs is what turns and what is made. Call \`cam_describe_machine\` for the exact table.

| | Mill | Lathe | 3D printer |
| --- | --- | --- | --- |
| What turns | the tool (spindle) | the workpiece (chuck) | nothing |
| Process | removes material | removes material | adds material |
| Axes | X Y Z | X (diameter) Z, no Y | X Y Z, E (filament) |
| +Z | up, away from the part | away from the chuck | up the build |
| Z0 | top of the stock | finished front face | the plate |
| A cut goes | to negative Z, then in XY | -Z towards the chuck, X towards the axis | Z up, layer by layer |
| Plane | G17 | G18 | G17 |

## Zeros
- Mill: choose the origin (\`originType\`: stock centre, stock corner, machine zero, custom) and the work offset (\`workOffset\` G54..G59: G54 is the default and is not written). Several parts or setups use different offsets.
- Lathe: \`latheZero\` is the finished face (stock at negative Z) or the chuck face (Z grows towards the front). Moving towards the chuck is -Z in both.
- Printer: \`bedOrigin\` is the plate's front-left corner or its centre (delta printers); the part is always set down on the plate (bottom at Z0) and centred, and it is reported if it does not fit (\`bedWidth\`, \`bedDepth\`).

## Touch probes and tool setters
- \`toolType\` probe or toolsetter, operation \`probing\`, spindle OFF. Cycles: zSurface, edgeX, edgeY, corner, bore, boss, toolLength. The stylus is a ball: contact is half a tip diameter before the surface; the cycles correct for it (\`probeStylus\`).
- The result goes into the chosen work offset, so probing and machining share \`workOffset\`. \`probeDialect\`: linuxcnc (G38.2, G10 L20) or fanuc (G31, macro variables).
- Probe first, machine after: a program that measures its own zero removes setup error. Say which offset it wrote.

## Checking
- \`cam_analyze_gcode\` with \`machineType\` catches what is illogical for the axes: Y on a lathe, X through the axis, a cut away from the chuck, a spindle that never started, cold extrusion, a build that goes down.
- \`cam_verify_toolpath\` simulates mills only.`

const DRAWINGS = `# From drawings and images to 3D

Three kinds of input, three routes. Pick by what the user attached (the message lists "Attached files").

## DXF, SVG or STEP file
- \`cad_import_drawing\` with \`attachment\` (the file name) and \`depth\` (mm). It chains lines and arcs into closed profiles, extrudes each outer profile from Z0 along +Z, makes circles and inner loops holes, and reports outlines it could not close. Ask for the thickness if the user gave none; it is the only thing a flat drawing cannot say.
- STEP (\`attachment\` is enough, the part brings its height): reads prismatic parts from the flat face looking down; its warnings say what it did not read (steps, pockets with a floor, slopes, curved faces). Report them, and if the part was modelled lying on another plane retry with \`up: "y"\` or \`"x"\`. It is not a full STEP kernel: do not promise free-form surfaces.\n- DXF is read in its own units (\`$INSUNITS\`) and lands in mm; SVG needs \`scale\` (mm per SVG unit) when it is not 1: a 96 dpi export in px is 0.2646.
- Open outlines: report how many, offer a larger \`gap\` (mm) and say where the break probably is. Never close a profile by guessing.
- Several parts in one file become several solids; give each a clear \`name\` and, if the user wants them stacked or moved, use \`cad_modify_entities\`.
- Afterwards run \`cad_check_design\`, then continue to CAM.

## Image of a drawing or a photo
- Look first, then list what you read: every dimension with its unit, the view it belongs to, tolerances and notes. Say what is unreadable or missing instead of filling it in.
- Build from the numbers with \`cad_add_elements\`: the base solid from the overall size, features one by one (holes as cylinders and one boolean-subtract, pockets, fillets as spheres/tori or a revolution profile, chamfers as extrusion profiles). A hole with a tolerance gets the middle of the limits.
- Three-view drawings: front gives X and Z, top gives X and Y, side gives Y and Z. Check that the same size read from two views agrees; if not, ask which is right.
- A photo has no scale: ask for one known dimension, then derive the rest and label them as estimates.
- After building, compare against the numbers you read: \`cad_describe_drawing\` gives the bounds; report any difference.

## Sketch by hand
Treat it like a photo: ask for the scale, build the outline as an \`extrusion\` profile, then add features.`

const PLUGINS = `# Programming extensions (plugins)

When the user wants the app to do something new (a parametric generator, a custom post-processor, a command), write a plugin. A plugin is a folder with \`plugin.json\` and an ES module entry. It cannot be installed by a tool: give the user the files and tell them to add the folder in Plugins.

## plugin.json
- \`id\` reverse-DNS (\`com.company.name\`), \`name\`, \`version\` semver, \`apiVersion: "1"\`, \`entry\` (e.g. \`index.js\`).
- \`capabilities\`, only what the code uses: \`drawing:read\`, \`drawing:write\` (implies read), \`toolpath:read\`, \`storage\`, \`ui:panel\`.
- \`contributes\`: \`commands\` [{id, title, keybinding?}], \`panels\` [{id, title, entry}], \`postProcessors\` [{id, title, entry}: exported \`(program, options) => string\`], \`operations\` [{id, title, entry}: exported \`{ schema, generate }\`].

## Module
\`export default definePlugin({ manifest, activate(ctx) { ... return () => cleanup } })\`. Inside \`activate\` get each surface with \`requireCapability(ctx, "drawing:write", "drawing")\` (it throws a clear error when the manifest did not ask for it). Register commands and panels with \`ui.registerCommand\` / \`ui.registerPanel\`; keep state in \`storage\`; undo everything in the returned cleanup.

## Rules
- Units are mm and radians, like the tools. Pure functions for geometry so they can be tested.
- Ask for the least capability; no network, no files outside the plugin's own storage.
- Give a short test: the SDK has a test host, so show how to activate the plugin with it and assert what it registered.
- If the need is a one-off model or operation, do it with the tools instead; a plugin is for something the user will repeat.`

export const CADCAM_SKILLS: ReadonlyArray<CadCamSkill> = [
  { name: "cad-3d-modeling", description: `Model 3D and 2D geometry in the open editor (${Object.keys(ELEMENT_SPECS).length} element types): conventions, recipes for common parts, how to build complex objects.`, category: "cad", tags: ["cad", "3d", "modeling"], body: MODELING },
  { name: "cam-operation-workflow", description: "The loop from a drawing to verified G-code: describe, parameters, operation, generate, analyse, verify, fix.", category: "cam", tags: ["cam", "workflow", "gcode"], body: WORKFLOW },
  { name: "toolpath-verification", description: "How to read and report a cam_verify_toolpath result: every finding code, its cause and its fix, and what was not modelled.", category: "cam", tags: ["cam", "verification", "safety"], body: VERIFICATION },
  { name: "cutting-parameters", description: "Speeds, feeds, stepdown and stepover starting points by material, and the formulas behind them.", category: "cam", tags: ["cam", "feeds", "speeds"], body: PARAMETERS },
  { name: "drilling-and-holes", description: "Drilling operations: cycles, peck rules, through-hole depth, large holes.", category: "cam", tags: ["cam", "drilling"], body: DRILLING },
  { name: "precision-and-tolerances", description: "Working to microns: nominal sizes, tolerance on round shapes, ISO 286 grades, finishing strategy and what the verification can and cannot show.", category: "cam", tags: ["precision", "tolerance", "iso286"], body: PRECISION },
  { name: "machines-and-axes", description: "Mill, lathe and 3D printer: what turns, the sense of every axis, zeros and work offsets, touch probes and tool setters, and how to check a program against its machine.", category: "cam", tags: ["machines", "axes", "origin", "probing"], body: MACHINES },
  { name: "drawings-and-images", description: "From a DXF/SVG file, an image of a dimensioned drawing, a photo or a sketch to a 3D model: which tool, what to ask, how to check the result.", category: "cad", tags: ["cad", "import", "dxf", "svg", "image"], body: DRAWINGS },
  { name: "plugin-authoring", description: "Write an extension for the app (command, panel, post-processor, operation): manifest, capabilities, module shape and rules.", category: "dev", tags: ["plugin", "extension", "sdk"], body: PLUGINS },
  { name: "stock-and-fixtures", description: "Stock, origin and fixtures: how to describe them so the verification can catch collisions.", category: "cam", tags: ["cam", "setup", "fixtures"], body: SETUP }
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
