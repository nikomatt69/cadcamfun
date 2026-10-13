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

const MODELING = `# Modelling in 3D

Objects are built in 3D, always: cad_edit action add for every part, shape or assembly. cad_edit action add_entities is only for a flat sketch the user explicitly asks for. A "car", "bottle" or "bracket" is never a set of rectangles and circles: it is solids, and it should look like the thing. Read the drawing first with cad action describe; the tools create the project and the drawing when there are none, so never ask the user to.

## Conventions
- Millimetres and radians. \`x,y,z\` is the centre of a solid and the origin of a profile.
- \`cylinder\` and \`cone\` stand along Z; a \`capsule\` lies along its \`direction\` (default y; give \`z\` to stand it). \`revolution\` turns its profile about \`axis\`: profile \`x\` is the radius, \`y\` the height along the axis; \`axis: "y"\` (default) stands it on Z, \`"x"\` lays it along X.
- Everything is Z-up: a \`wall\` is long on X, thick on Y and tall on Z; \`column\`, \`spring\`, \`bolt\`, \`screw\`, \`nut\` and \`washer\` have their axis on Z; a \`stair\` climbs on Z and runs toward -Y; \`floor\` and \`roof\` use \`width\` (X) and \`depth\` (Y).
- \`rectangle\`, \`circle\`, \`polygon\` are flat on the XY plane at height \`z\`.
- Put related parts on one layer (\`layer: "car"\`); the layer is created if needed.
- **Layers and components**: one layer per system (\`layer: "body"\`, \`"wheels"\`, \`"fixtures"\`; created if needed, each with its own colour). A part made of several solids is a \`component\` (\`name\`, \`x,y,z\`, \`elements\` = its children placed relative to the component), so it can be selected, moved and machined as one thing; a Boolean stays its own element.
- **Change what exists**: cad_edit action transform moves, turns and scales by id, and makes copies (a row: \`dx\` with \`copies\`; a ring: \`rotateDegrees\` + \`about\` + \`copies\`), so never rebuild a part to move it. cad_edit action group gathers parts into a component or opens one. cad_edit action editor creates, renames, colours, hides and locks layers, switches 3D/2D, fits the view, selects, isolates and undoes.
- **Repeated geometry is a program**: a bolt circle, a grid of holes, a lattice, ribs or fifty similar operations are one \`code_mode\` program, not fifty calls in the conversation. Call the tools under \`tools\` with the arguments you would give them directly, \`await\` every call, and return one short summary: \`for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; await tools.cad_edit({ action: "add", elements: [{ type: "cylinder", layer: "holes", x: 40 * Math.cos(a), y: 40 * Math.sin(a), z: 0, radius: 3, height: 10 }] }) } return "8 holes"\`. Each call inside the program shows in the editor the moment it finishes, exactly like a direct call, so a long program is a build the user watches. Stop the program on the first \`ok: false\` (\`const r = JSON.parse(await tools.cad_edit(...)); if (!r.ok) return r\`) instead of looping on a failure.
- **Work like a coding agent**: for anything bigger than one shape, say the plan in a line, build it in steps (a few calls, one subsystem each, on its own layer), call cad action check after the model is complete and fix what it reports, then go on to CAM (cam_edit action create, cam_edit action generate, cam_edit action verify) when the user wants it machined.
- One call holds at most 40 elements (a long call is cut off by the model's output limit): build big things in steps, each a few calls, in the order a person would build it. Each element in a call is judged on its own: the valid ones are added, the invalid ones are listed under \`skipped\` with their index; resend only those, corrected.

## Recipes
- **Block with a hole**: \`cube\` + \`cylinder\` (taller than the block), then \`boolean-subtract\` with \`operands: [0, 1]\` (indexes of the two elements in the same call).
- **Bottle, vase, shaft, pulley**: ONE \`revolution\`. Give the half section as profile points from the axis outwards, bottom to top, e.g. \`[{x:0,y:0},{x:30,y:0},{x:30,y:150},{x:10,y:200},{x:10,y:260}]\`; use 32+ segments (default).
- **Part the user will change the dimensions of** ("make it 10 mm wider", "I need it in three sizes"): ONE \`parametric\` element instead of loose solids. \`history.parameters\` holds the named dimensions (numbers or expressions of each other: \`"half": "width / 2"\`), \`history.features\` builds the part in order. A plate with a hole: \`parameters: {width: 60, depth: 40, thick: 8, hole: 10}\`, a \`sketch\` on plane \`XY\` with a rectangle (points p1..p4, lines l1..l4, \`fixed\` p1, \`horizontal\`/\`vertical\` on the sides, \`length\` l1 = \`"width"\`, l2 = \`"depth"\`), an \`extrude\` of it by \`"thick"\` (\`operation: "new"\`), then a \`hole\` on plane \`XY\` at \`offset: "thick"\`, \`at: ["width / 2", "depth / 2"]\`, \`diameter: "hole"\`, \`depth: "thick"\`. Validate a new history with cad action parametric_validate before creating it; its prompt contains an exact JSON example. To change a parameter later, inspect the part and update it with \`expectedRevision\` (the features stay); send a whole \`history\` only to change the features themselves. The tool tells you at once what the history cannot build.
- **Plate with a pattern of holes**: one \`cube\` plate, the holes as \`cylinder\`s, one \`boolean-subtract\` with the plate first.
- **Bracket / L profile**: \`extrusion\` with \`profile\` points (>= 3, closed automatically) and \`depth\`.
- **Pipe along a path**: \`sweep\` with \`path\` points and a round \`radius\`.
- **Vehicle**: body as a \`cube\` or an \`extrusion\` of the side profile, cabin as a smaller \`cube\`, wheels as four \`cylinder\`s turned to the axle (\`rotation\` in DEGREES: a cylinder stands along Z, so a wheel on a Y axle needs rotation {x: 90}), lights and details as small solids. Say what is simplified.
- **From a DXF or SVG drawing**: cad_edit action import with the file text and a \`depth\` (a drawing has no height - ask). Closed outlines become solids standing on Z0, circles and inner loops become holes. If it reports open outlines, say so and offer a larger \`gap\`; never close them by guessing. To work from an image or a dimensioned drawing you can only look at, read the numbers yourself and build with cad_edit action add.
- **Standard parts**: \`gear\`, \`spring\`, \`bolt\`, \`screw\`, \`nut\`, \`washer\` take their size and defaults from the catalogue.

## Design space
- Right-handed, Z up, XY the ground plane. Solids are placed by their CENTRE. A cube's width is its X extent, height its Y extent, depth its Z extent; cylinders, cones and tori stand along Z.
- \`rotation\` is in DEGREES, arc and revolution angles in RADIANS.

## After modelling
Run cad action check: it finds sizes that are not positive, rotation typed in radians, booleans with missing operands, duplicates, parts that float, and parts outside the stock. Fix what it reports, then describe the drawing again and check the count and the bounds; report ids and positions, not prose. To change something use cad_edit action modify with the ids you were given; to remove, cad_edit action delete with \`confirm: true\` only when the user asked.

## Element types
Every type \`cad_edit\` action add accepts, with the fields it takes. Anything not listed here does not exist; a type the editor cannot show is a type you cannot create.

${elementCatalogueLines()}`

const WORKFLOW = `# From model to verified G-code

Follow the loop; do not skip a step and do not call a program safe before the last one.

1. cad action describe: what is there, its bounds and ids. Nothing to machine means stop and say so.
2. library action lookup_material and library action lookup_tool: use the user's tool and material; if there is none, say which assumption you made.
3. cam action suggest: depth, stepdown, cutting speed, chip load and warnings for this drawing.
4. cam_edit action create with a type (contour, pocket, drill, engrave, profile, threading, 3d_surface) and parameters: \`toolDiameter\`, \`depth\` (positive, below the stock top), \`stepdown\`, \`feedrate\`, \`rpm\`, \`material\`, \`offset\` (outside for a part contour, inside for a pocket wall).
5. cam_edit action generate for the operation id.
6. cam action analyze: static checks (travel limits, missing spindle or feed).
7. cam_edit action verify: simulate it on the stock. Pass what you know: \`tool.cuttingLength\`, \`tool.stickout\`, \`tool.holderDiameter\`, \`fixtures\`, \`targetSolids\` for the finished part.
8. Errors? cam_edit action update, then generate and verify again. Repeat until the report has no errors or you can state what blocks it.

Report: the operation, the parameters you chose and why, the verification result with what it did NOT model, and the next decision for the user.`

const VERIFICATION = `# Reading a verification report

cam_edit action verify replays the G-code on a height-field model of the stock. It answers "does this program damage anything it knows about", never "is this safe on the machine".

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
| InterpreterWarning | a line of the program could not be read and was skipped | that move was NOT verified; regenerate, or simplify the line the message names |

Always state what was modelled (\`modelled\` in the result): without a holder, fixtures or a target part those checks did not run. Volume and air-cut numbers are planning figures. An InterpreterWarning means part of the program was never replayed, so the rest of the report does not cover it. Never write "safe", "certified" or "collision-free": write "no errors found in what was modelled".`

const PARAMETERS = `# Cutting parameters, as a starting point

Use the tool and material library values first, then cam action suggest. Without them, start here and say they are starting values.

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
- cam_edit action verify is exact in height and one cell wide sideways. For micron checks narrow \`stock\` to the feature (a few mm), \`resolution\` 0.002-0.005, \`tolerance\` 0.001, and give the finished part in \`targetSolids\`.
- A pass means "no gouge beyond the tolerance at that resolution", never "in tolerance on the machine".`

const MACHINES = `# Machines, axes and zeros

The same drawing becomes a different program on each machine. Program as if the TOOL moves round a fixed workpiece (ISO 841); what differs is what turns and what is made. Call cam action machine for the exact table.

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
- cam action analyze with \`machineType\` catches what is illogical for the axes: Y on a lathe, X through the axis, a cut away from the chuck, a spindle that never started, cold extrusion, a build that goes down.
- cam_edit action verify simulates mills only.`

const DRAWINGS = `# From drawings and images to 3D

Three kinds of input, three routes. Pick by what the user attached (the message lists "Attached files").

## DXF, SVG or STEP file
- cad_edit action import with \`attachment\` (the file name) and \`depth\` (mm). It chains lines and arcs into closed profiles, extrudes each outer profile from Z0 along +Z, makes circles and inner loops holes, and reports outlines it could not close. Ask for the thickness if the user gave none; it is the only thing a flat drawing cannot say.
- STEP (\`attachment\` is enough, the part brings its height): reads prismatic parts from the flat face looking down; its warnings say what it did not read (steps, pockets with a floor, slopes, curved faces). Report them, and if the part was modelled lying on another plane retry with \`up: "y"\` or \`"x"\`. It is not a full STEP kernel: do not promise free-form surfaces.\n- DXF is read in its own units (\`$INSUNITS\`) and lands in mm; SVG needs \`scale\` (mm per SVG unit) when it is not 1: a 96 dpi export in px is 0.2646.
- Open outlines: report how many, offer a larger \`gap\` (mm) and say where the break probably is. Never close a profile by guessing.
- Several parts in one file become several solids; give each a clear \`name\` and, if the user wants them stacked or moved, use cad_edit action modify.
- Afterwards run cad action check, then continue to CAM.

## Image of a drawing or a photo
- Look first, then list what you read: every dimension with its unit, the view it belongs to, tolerances and notes. Say what is unreadable or missing instead of filling it in.
- Build from the numbers with cad_edit action add: the base solid from the overall size, features one by one (holes as cylinders and one boolean-subtract, pockets, fillets as spheres/tori or a revolution profile, chamfers as extrusion profiles). A hole with a tolerance gets the middle of the limits.
- Three-view drawings: front gives X and Z, top gives X and Y, side gives Y and Z. Check that the same size read from two views agrees; if not, ask which is right.
- A photo has no scale: ask for one known dimension, then derive the rest and label them as estimates.
- After building, compare against the numbers you read: cad action describe gives the bounds; report any difference.

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

const PARAMETRIC = `# Parametric parts in cadcamfun

A part the user will iterate on ("in three sizes", "depending on the part family", "we'll tune this with the customer") is one parametric element, not loose solids.

## Anatomy

A parametric element holds \`history: { parameters, features }\`.

- \`parameters\`: named dimensions, numbers or expressions of each other (\`"half": "width / 2"\`). Cycles are rejected.
- \`features\` run in order: \`sketch\`, \`extrude\` (optional \`edge\` chamfer/fillet round the end faces, \`corner\` rounding of the profile and \`taper\` draft angle), \`revolve\`, \`hole\` (\`kind\`: simple, counterbore, countersink), \`pattern\` (linear, circular or grid), \`mirror\`, \`sweep\` (profile along a path sketch, optional \`bendRadius\` for pipe bends), \`loft\` (through sketch sections), \`shell\` (hollow an extrude, full revolve or sweep, optionally open) and \`fillet\` (round or chamfer edges between planar faces). A dimension is a parameter name or an expression.
- Sketches take parametric \`shapes\` (rectangle, circle, polygon, ellipse, slot, polyline, spline/Bezier/NURBS curve) as well as hand-built entities; more features exist beyond these: \`primitive\` (3D catalogue solids with parametric measures), \`coil\`, \`move\`, \`scale\`, \`split\`, \`combine\`. The \`fusion-360-modelling\` skill maps every Fusion 360 command to one of them.
- History is a JSON object, never a string. Features and constraints use \`type\`; sketch entities use \`kind: point|line|circle|arc\`. Lines use point IDs in \`p1/p2\`; circles use a point ID in \`center\`. Validate with \`cad\` action \`parametric_validate\` before \`cad_edit\` action \`parametric_create\`, and send this exact example (a Ø20 cylinder) rather than inventing a rectangle entity:

\`\`\`json
{"history":{"parameters":{"radius":10,"height":20},"features":[{"id":"profile","type":"sketch","plane":"XY","sketch":{"entities":[{"id":"origin","kind":"point","x":0,"y":0},{"id":"outline","kind":"circle","center":"origin","radius":10}],"constraints":[{"type":"fixed","point":"origin","x":0,"y":0},{"type":"radius","circle":"outline","value":"radius"}]}},{"id":"body","type":"extrude","sketch":"profile","depth":"height","operation":"new"}]}}
\`\`\`

Send it to \`cad\` with \`{"action":"parametric_validate","history":{...}}\`. Change \`parameters.height\` to resize it; \`cad_edit\` \`parametric_update\` does that on an existing part with its revision.

## Workflow

1. If the user names a quantity that will change (count, diameter, thickness, hole spacing), make it a parameter.
2. Sketch on plane \`XY\` by default, with named lengths tied to parameters.
3. Extrude with \`operation: "new"\`, \`direction: "up"\`, \`depth\` set to a parameter name.
4. Add features that reference parameter names, then call cad action parametric_validate validate. Repair the reported paths and rebuild errors before create; switching to cad_edit action add cannot bypass the same history schema.
5. End with cad action check. On \`RebuildFailed\`, read the cause, fix it, repeat.
6. Save on an \`ai/<topic>\` branch with vcs_edit action commit (see the version-control-cadcam skill).

## Standard parts and design rules

- cad action parametric_validate \`action: "recipe"\` generates mounting_plate, flange, l_bracket, stepped_shaft, enclosure, pipe_bend (long-radius bend by default, \`bendRadius\` 0 = mitred) or duct_transition from design inputs (fastener size, diameters, bolt count); holes follow ISO 273, counterbores ISO 4762 / DIN 974, keyways DIN 6885, and edge distance and spacing rules are enforced. Edit its parameters afterwards.
- \`action: "fastener"\` returns thread, tap drill, clearance and counterbore sizes. \`action: "dfm"\` returns the manufacturability findings for a process, cutter and material; fix errors before CAM.

## Exact model (B-rep)

- Every validate and recipe report carries \`exact\`: per body the exact solid's volume, area, centroid, \`throughHoles\`, face count and surface kinds (plane, cylinder, cone, sphere, torus, nurbs), or the \`reason\` the body has only its mesh. Quote volumes and masses from \`exact\`, not from the mesh \`volumeMm3\`.
- cad action \`parametric_exact\` (\`elementId\` or \`history\`, \`includeStep: true\`) returns the same and the STEP AP214 file of the exact bodies, for the user's other CAD systems.
- Exact features: plain extrude, revolve, hole (all kinds), the analytic catalogue solids (cube, cylinder, cone, sphere, hemisphere, torus, prism, pyramid) with their rotation, move, uniform scale, mirror, pattern, split, combine and every union, subtract and intersect. Fillet, shell, sweep, loft, coil, edge or corner treatments, drafts and the other catalogue solids keep only the mesh: when a part is for STEP or inspection, build it from exact features and say which bodies are mesh-only.

## Editing later

- Resize: cad action parametric_validate inspect, then update with the real elementId, returned expectedRevision and \`parameters: {width:70}\`. Features and element ID stay. Inspect again if the revision is stale.
- Add a feature: append it to the same parametric's history.
- Rewrite the whole history only when the user asks. It is destructive.

## When not to use parametric

- One-off solids the user will not dimension-drive.
- Expressions that chain beyond about ten steps. Split the part.

## Limitations

- Not available in a history: fillets against curved faces, variable-radius fillets, shell of a Boolean result, loft guide rails and tangency, pattern along a path. Say so instead of faking them.`

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

const FUSION = `# Fusion 360 commands in cadcamfun

Every command a designer reaches for in Fusion 360 has a counterpart in the parametric history. Use it instead of loose solids whenever the user may change a size, and tie every measure to a named parameter.

## Sketch (a \`sketch\` feature on plane XY, YZ or ZX, with an \`offset\`)

- Put profiles in \`sketch.shapes\` (no points to place, no constraints to write; fully constrained; every measure takes a number or an expression of the parameters):
  - 2-point or centre rectangle: \`{id, kind:"rectangle", at:[x,y], width, height, centered?}\`
  - circle: \`{kind:"circle", at, diameter}\`; polygon: \`{kind:"polygon", at, sides, radius, flats?, rotation?}\`; ellipse: \`{kind:"ellipse", at, radiusX, radiusY}\`
  - slot: \`{kind:"slot", at, length, width, angle?}\` (length is end to end, round ends included); any outline: \`{kind:"polyline", points:[[x,y],...]}\`
  - spline through points: \`{kind:"curve", curve:"spline", points}\`; control-point spline: \`curve:"nurbs"\` (degree 3 by default) or \`curve:"bezier"\`. An open curve is a sweep path; \`chord:true\` closes it with a straight line to make a profile; \`closed:true\` closes a spline or nurbs smoothly.
- Hand-built \`entities\` and \`constraints\` (point, line, circle, arc; tangent, parallel, symmetric, ...) are for drawings the shapes cannot express. A shape's points are named \`<id>.p0\`, \`<id>.v1\`, ... when you need to constrain against them.
- Two shapes in one sketch, one inside the other, make a ring: the inner loop is a hole.

## Work planes (Construct)

- A sketch, hole or text lies on XY, YZ, ZX or on the id of an earlier \`plane\` feature: \`{id:"top", type:"plane", from:{kind:"offset", base:"XY", distance:"height"}}\`, \`{kind:"angle", base:"XY", angle:30, about:"u"}\` (a tilted plane), \`{kind:"points", points:[p1,p2,p3]}\`, or **sketch on a face**: \`{kind:"face", near:[x,y,z], normal:[0,0,1]}\` puts the plane on the planar face of an existing body at its centre (a top face reads like XY, so sketch coordinates are measured from the face centre) and follows the face when a parameter changes. Use it for bosses, pockets, holes and text on a face instead of guessing offsets.

## Create

- Extrude (one side, \`direction\` down or symmetric, \`taper\` draft, \`edge\` and \`corner\` chamfer or fillet, \`operation\` new, union, subtract or intersect): \`extrude\`. A cut through the part: \`subtract\` with \`direction:"symmetric"\` and a depth larger than the part.
- Revolve (about the plane's x or y axis, or a line of the sketch; \`angle\` in degrees): \`revolve\`. Sweep (a profile sketch along a path sketch, \`bendRadius\` for pipe bends): \`sweep\`. Loft through two or more sketches, \`smooth\` optional: \`loft\`.
- Coil, spring or helix about Z: \`coil\` (radius, pitch above the wire diameter, turns, wireDiameter, round or square, right or left hand).
- Rib / web: \`rib\` (an earlier sketch with OPEN line chains drawn on the face the rib stands on; \`thickness\`, \`depth\`; united by default). Sheet metal: \`sheet\` (one open line chain is the profile; \`thickness\`, \`width\`, inside \`bendRadius\`, material \`side\` left/right/centre of the line); the flat pattern length is returned as \`flatPatterns\` by the validation report.
- Modelled thread: \`thread\` (\`kind\` external = a threaded rod, internal = the cutter of a tapped hole; \`diameter\`, ISO \`pitch\`, \`length\`, \`at\` [x,y], \`offset\` = start height along Z; handedness). Pitches from the fastener tables (M8 1.25, M10 1.5): ask \`parametric_fastener\`.
- Text (emboss or engrave): \`text\` (\`text\`, cap \`height\`, \`depth\`, \`plane\` and \`offset\` at the face, \`at\`, \`align\`; operation union raises it, subtract with direction down cuts it in).
- Every solid of the 3D catalogue (box, cylinder, cone, sphere, ellipsoid, torus, prism, pyramid, hemisphere, capsule, gear, extrusion, revolution, sweep, loft, spring, bolt, screw, nut, washer, wall, floor, window, door, column, roof, stair): \`primitive\` with \`params\` (the same fields as the 3D elements: width, height, depth, radius, tubeRadius, sides, moduleValue, teeth, ...), \`at\` (the centre), \`rotation\` (degrees) and \`operation\`, so a catalogue solid can also cut.
- Make what is already drawn parametric: \`cad\` \`parametric_from_element\` returns the history of an element (its measures become named parameters, a flat shape gets a \`depth\`, a component becomes one feature per part), \`cad_edit\` \`parametric_convert\` stores the twin and leaves the original for you to delete once it is checked. Use it whenever the user asks to make something parametric or to change a drawn part by its dimensions.
- Hole (simple, counterbore, countersink; sized from the fastener tables with \`parametric_fastener\`): \`hole\`.

## Modify and arrange

- Fillet and chamfer edges: \`fillet\` (\`style\`, \`edges\` selection). Shell: \`shell\` (\`open\` top, bottom or both). Draft: \`taper\` on the extrude.
- Press Pull a flat face: \`pushpull\` (\`near\` a point on the face, \`normal\` to choose the top or the bottom, \`distance\` positive grows the body, negative cuts it; holes in the face stay).
- Draft one face of any body: \`draft\` (\`near\` a point on the face, \`angle\`, \`pull\` direction, \`neutral\` plane position; positive leans the wall inward above the neutral plane). Join two bodies rigidly face to face: \`mate\` (\`body\` moves its \`face\` flush against \`to.face\`, \`offset\` gap, \`spin\` degrees); both bodies must exist (operation new for the second).
- Combine bodies by id: \`combine\` (join, cut, intersect; \`keepTools\`). Split Body with a plane: \`split\`. Move/Copy: \`move\` (rotate in degrees, then translate; \`copy\`). Scale: \`scale\` (one factor or three).
- Rectangular and circular pattern: \`pattern\` (linear, grid, circular) of an earlier tool; mirror: \`mirror\` through XY, YZ or ZX at an offset.

## Parameters

- Fusion's Change Parameters is \`parameters\`: numbers or expressions (\`"half": "width / 2"\`, \`"pitch": "wire * 2.5"\`, units mm cm m in deg rad, functions sin cos sqrt min max ...). Name them for what they mean, not "d1".
- Change a size later with \`cad_edit\` \`parametric_update\`; try variants first with \`cad\` \`parametric_test\` (nothing is written). A shape's measures are also reachable one by one (width, diameter, radius, length, angle).

## What is not there

Sheet-metal flanges with hems, flat-pattern DXF export and relief cuts (\`sheet\` makes the bent strip and reports its flat length), thread cosmetics on existing cylinders (build the thread as a tool instead), assembly joints other than the rigid face \`mate\` (revolute, slider; use \`move\` for a pose), and press/pull or draft of curved faces. Say so and use the nearest feature rather than inventing a field.

## Example (it builds: a plate with a slot and three posts)

\`\`\`json
${JSON.stringify(FUSION_EXAMPLE_HISTORY)}
\`\`\`

Validate with \`cad\` action \`parametric_validate\`, read the issues, then \`cad_edit\` action \`parametric_create\`.
`

const COMPOSED_CAM = `# Composing CAM programs

A real part has many operations. Plan them in this order and do not skip ahead.

1. Probe the work offset (cam_edit action create with \`type: "probing"\`). Use the result as the zero.
2. Face the top (\`face\`) to establish a reference plane.
3. Rough (\`roughing\` or \`adaptive\`), leaving a small allowance (0.1 to 0.3 mm).
4. Rest-machine what the big tool could not reach (\`rest\`) with a smaller tool.
5. Finish (\`parallel\`, \`waterline\` or \`scallop\`), climb milling, stepover 5 to 15 percent of the diameter.
6. Drill before tapping or thread milling (\`drill\`, peck cycle for deep holes).
7. Chamfer or engrave last.
8. Indexing (3+2) only after the bulk is removed.

## Picking an operation

- Closed outline, outside a part: \`profile\`.
- Closed outline, inside a recess: \`pocket\`.
- Hole pattern: \`drill\` (peck when depth is at least 3 times the diameter; pilot above 12 mm).
- Curved face: \`parallel\` for a uniform zig-zag, \`waterline\` for constant Z, \`scallop\` for constant cusp, \`pencil\` to blend.
- Deep pockets: \`adaptive\` then \`rest\`.
- Lathe body: \`facing\`, then \`turning_od\`, then \`parting\`; \`threading_od\` if needed.

## Picking a tool

Use library action lookup_tool. Confirm the cutter radius fits the smallest inside radius, the cutting length covers the depth, and RPM stays under both the tool and machine maximum.

\`toolType\` is what an operation says the cutter IS, and the generator reads it: ${TOOL_TYPE_NOTES}. Everything else (diameter, flutes, reach, materials) comes from the library row.

## Setups

A flip is a new setup with its own stock, origin, work offset, fixtures and tools. Never reuse the first setup's depths.

## Verifying each operation

For every operation: cam_edit action generate, then cam action analyze, then cam_edit action verify. Fix by cause, regenerate, verify again. After three rounds on the same finding, report the blocker. Report what was modelled; never write "safe".`

const VERSION_CONTROL = `# Version control for the agent

The cadcam agent edits on an \`ai/<topic>\` branch and opens a pull request. A person reviews and merges.

## Order of operations

1. vcs action status: branch, dirty files, open pull requests.
2. Start a change on an \`ai/<topic>\` branch. Do not edit on a dirty working copy.
3. Make the CAD and CAM edits.
4. Commit with a short imperative message saying what and why.
5. Open the pull request with a title and body. This triggers the \`pullRequest\` workflows.

## Refused actions

- Commit, restore or merge on \`main\` for an AI actor.
- Merging a pull request whose latest verdict is \`request-changes\`.
- Pushing to GitHub: a person does that.

## Diff

vcs action diff returns entity-level changes (property path, before, after). Read it before writing the pull request body.

## Restore

vcs_edit action restore rolls named ids back to an earlier commit on the current \`ai/*\` branch. Use it when a \`RebuildFailed\` is faster to revert than to repair. Not available on \`main\`.`

const WORKFLOWS_CAM = `# Workflows in cadcamfun

A \`.cadcamfun/workflows/*.yml\` file defines one workflow. Triggers (\`on:\`) are \`push\`, \`pullRequest\` or \`manual\`. Jobs run steps in order; a step may read an earlier step's outputs with \`\${{ steps.<id>.outputs.<key> }}\`.

## Registered steps

- \`project/validate\`: every entity JSON parses, its id matches the file name, and it has a name.
- \`project/require-gcode\`: every toolpath has committed G-code.
- \`cam/verify\`: replays each program through the verifier; fails on errors.
- \`cam/gcode\`: regenerates each program from its stored request and compares with the committed G-code; fails when stale.

An unknown \`uses:\` fails the workflow before any step runs.

## Dispatching

- vcs_edit action run_workflows runs the manual workflows on the checked-out branch and returns their run ids.
- \`pullRequest\` workflows fire when a pull request is opened.
- \`push\` workflows fire on commit.

## Example

\`\`\`yaml
name: validate-and-cut
on:
  push: { branches: [main, "ai/**"], paths: ["toolpaths/**"] }
  pullRequest: { branches: [main] }
jobs:
  qa:
    steps:
      - id: v  uses: project/validate
      - id: rg uses: cam/gcode
      - id: vf uses: cam/verify
      - id: m  uses: project/require-gcode
\`\`\`

## Reading a run

Each run reports job-start, step and job-end events. A step has \`uses\`, a status (\`success\`, \`failure\` or \`skipped\`), and an optional message and outputs. A failing step never hides the verdict of the steps before it.`

const CYCLE_PRESETS = `# Reusable machining cycle presets

Load the operation schema before applying a preset. Read the actual machine, material, cutter, stock, origin and selected geometry. A preset is an ordered strategy, never invented feeds or a universal machine setting.

- Closed recess: pocket, then a finishing pass with explicit allowance and a cutter that fits the inside radii.
- External contour: profile after internal machining; include tabs or confirmed workholding where the schema supports them.
- Deep recess: adaptive roughing, rest machining with a smaller cutter, then finish the selected faces.
- Hole series: drill, with the supported peck cycle for depth; tapping or thread milling only with confirmed pitch and controller support.
- Rotational part: facing, turning_od, then parting; threading_od only after confirming pitch, tool and machine.

Use library action lookup_tool and cam action suggest for starting values. Create operations through cam_edit action create, generate through cam_edit action generate, analyse through cam action analyze, and verify through cam_edit action verify. Preserve real operation ids, predecessor links and remaining stock. Each flipped setup needs its own coordinate origin and fixtures. Report unsupported cycle/controller combinations instead of substituting an unrelated cycle.`

const AUTO_MEMORY = `# Project memory and continuation

Before work, read memory action recall and inspect the live document. Automatically save confirmed reusable units, machine/work offset, material, workholding choices, named design constraints and user corrections through memory_edit action remember after successful work. Use stable keys to replace obsolete facts. Never save secrets, speculative geometry, failed operations or raw conversation logs.

Project notes are loaded into fresh turns. Treat them as historical evidence and reconcile them with the current setup and revisions. Delegate a bounded job with real drawing/operation ids, units, constraints, setup and expected report. Specialists inherit the parent model and context, but their permissions still govern their work. After compaction, inspect the recorded ids and revisions before resuming mutations; preserve completed work and unresolved questions.`

export const CADCAM_SKILLS: ReadonlyArray<CadCamSkill> = [
  { name: "cad-3d-modeling", description: `Model 3D and 2D geometry in the open editor (${Object.keys(ELEMENT_SPECS).length} element types): conventions, recipes for common parts, how to build complex objects.`, category: "cad", tags: ["cad", "3d", "modeling"], body: MODELING },
  { name: "cam-operation-workflow", description: "The loop from a drawing to verified G-code: describe, parameters, operation, generate, analyse, verify, fix.", category: "cam", tags: ["cam", "workflow", "gcode"], body: WORKFLOW },
  { name: "toolpath-verification", description: "How to read and report a cam_edit action verify result: every finding code, its cause and its fix, and what was not modelled.", category: "cam", tags: ["cam", "verification", "safety"], body: VERIFICATION },
  { name: "cutting-parameters", description: "Speeds, feeds, stepdown and stepover starting points by material, and the formulas behind them.", category: "cam", tags: ["cam", "feeds", "speeds"], body: PARAMETERS },
  { name: "drilling-and-holes", description: "Drilling operations: cycles, peck rules, through-hole depth, large holes.", category: "cam", tags: ["cam", "drilling"], body: DRILLING },
  { name: "precision-and-tolerances", description: "Working to microns: nominal sizes, tolerance on round shapes, ISO 286 grades, finishing strategy and what the verification can and cannot show.", category: "cam", tags: ["precision", "tolerance", "iso286"], body: PRECISION },
  { name: "machines-and-axes", description: "Mill, lathe and 3D printer: what turns, the sense of every axis, zeros and work offsets, touch probes and tool setters, and how to check a program against its machine.", category: "cam", tags: ["machines", "axes", "origin", "probing"], body: MACHINES },
  { name: "drawings-and-images", description: "From a DXF/SVG file, an image of a dimensioned drawing, a photo or a sketch to a 3D model: which tool, what to ask, how to check the result.", category: "cad", tags: ["cad", "import", "dxf", "svg", "image"], body: DRAWINGS },
  { name: "plugin-authoring", description: "Write an extension for the app (command, panel, post-processor, operation): manifest, capabilities, module shape and rules.", category: "dev", tags: ["plugin", "extension", "sdk"], body: PLUGINS },
  { name: "parametric-design", description: "When and how to build a parametric element: named dimensions, expressions, when to choose parametric over loose solids, how to edit later.", category: "cad", tags: ["cad", "parametric", "dimensions"], body: PARAMETRIC },
  { name: "fusion-360-modelling", description: "Fusion 360 commands mapped to parametric features: shapes, curves (spline, Bezier, NURBS), sweep, revolve, loft, coil, rib, sheet metal, modelled threads, text, push/pull, draft, joints, catalogue solids, combine, split, move, scale, patterns and parameters.", category: "cad", tags: ["cad", "parametric", "fusion360", "sweep", "revolve", "nurbs"], body: FUSION },
  { name: "composed-cam-programs", description: "Compose CAM programs with several operations: sequencing, stock carry-over, multi-setup, lathe plus mill, verification per operation.", category: "cam", tags: ["cam", "workflow", "milling", "lathe"], body: COMPOSED_CAM },
  { name: "version-control-cadcam", description: "How the agent uses the git-style version control: branches, commits, pull requests and the rules that keep AI writes safe.", category: "vcs", tags: ["vcs", "branches", "pr"], body: VERSION_CONTROL },
  { name: "workflows-cadcam", description: "How the agent uses the Actions-style workflows: YAML shape, registered uses steps, interpolation, and when to dispatch manually.", category: "workflows", tags: ["workflows", "actions", "automation"], body: WORKFLOWS_CAM },
  { name: "machining-cycle-presets", description: "Reusable pocket, contour, adaptive, drilling and turning sequences with explicit machine and verification requirements.", category: "cam", tags: ["cam", "cycles", "presets"], body: CYCLE_PRESETS },
  { name: "project-auto-memory", description: "Automatically retain verified project facts and resume connected CAD/CAM tasks after delegation or compaction.", category: "general", tags: ["memory", "context", "continuation"], body: AUTO_MEMORY },
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
