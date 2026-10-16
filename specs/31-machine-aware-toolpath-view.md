# Machine-aware toolpath view (mill in a vise, lathe in a chuck, printer on a bed)

Status: **built** except §5.5 (rotary mills), see §12 (2026-10-17). Cross-WP increment: WP2 `packages/core/src/cam` (frames, interpreter, setup, checks), WP3 `packages/api` (one optional field on the parse response), WP7 `apps/desktop/src/viewport/view3d` (CAM scene), WP6 `apps/desktop/src/features/cam` (setup fields, visualizer shell), WP8 `packages/ai` (skill, actions, context). Contracts in [04-core-cam](04-core-cam.md), [06-desktop-ui](06-desktop-ui.md) and [29-native-cam-kernel](29-native-cam-kernel.md) §3, §8 are extended here, not replaced.

## 0. Goal

The toolpath visualizer shows each program the way its machine runs it:

- **Mill (3-axis)**: the spindle turns the tool; the part is clamped in a **vise** (or clamps / plate) and does not move. Axes and the work zero follow how the part sits in the vise.
- **Lathe (2-axis X/Z)**: the **part turns** in the chuck about the spindle axis (machine Z); the tool does not turn, it travels in X (diameter) and Z (along the axis) with lathe logic. No Y.
- **3D printer**: nothing turns; the nozzle deposits material layer by layer on a bed; travel and extrusion look different; the build grows in +Z.

The AI knows exactly what the view shows (machine, frames, workholding, what moves and turns), can set the workholding, and its checks use the same geometry the view draws. No regression: every current test stays green, mill programs keep their current coordinates on screen, and every new behaviour has tests, including the edge cases of §9.

## 1. Baseline (verified 2026-10-17, `main` @ 063eed5, clean tree)

Run before writing this spec; it is the safety point every phase is compared against.

| Gate | Result |
| --- | --- |
| `bun test apps/desktop/src/viewport` + core `setup`, `indexing`, `safety`, `kernel/assembly`, `kernel/kinematics` | 68 pass, 0 fail |
| `bun test packages/core/test/cam/{machine,path-and-interpreter,five-axis,probing-origins,program-evidence,generator-stock,regressions,subprogram-interpreter}.test.ts` | 155 pass, 0 fail |
| `bun test packages/core/test/cam/{generator,generator-parity,viewer,generator-multiaxis,generator-cycles}.test.ts` | 128 pass, 0 fail |
| `bun test apps/desktop/test/{cam-page,cam-verify,cam-operation-results,cam-kernel}.test.ts` | 21 pass, 0 fail (63 s) |
| `bun test packages/ai/test/{skills,tool-prompts,context-breakdown}.test.ts` | 15 pass, 0 fail |
| `bunx tsc -p packages/core/tsconfig.json --noEmit` / `apps/desktop` | clean / clean |

Phase gates (§10) re-run these plus the new suites; the full `bun test packages apps` is run in chunks under ~100 s (machine load).

## 2. Current state (what the code does today)

### 2.1 Pipeline

```
generator (mill/lathe/printer text) ─┐
imported / edited text ──────────────┼─► sidecar POST /api/toolpaths/parse ─► analyseGcode ─► interpretGcode ─► Program (1 toolpath "gcode")
kernel artifact (mill, named ops) ───┼─► program as returned (not reparsed)
assistant operation results ─────────┘─► combineCamOperations (not reparsed)
                                                         │
CamPage ─► ToolpathVisualizer ─► View3D(visionMode "cam") ─► buildPlayback (segments) ─► lines + tool assembly at positionAt(t)
```

- `ToolpathVisualizer.tsx` passes `program`, `stock` (box), `tools`/`defaultTool` (mill only), playback props and display toggles to `View3D`. It has no notion of machine kind.
- `View3D` (`viewport/view3d/view3d.tsx`) is shared with the CAD editor. World = program coordinates, Z up (`camera.up = (0,0,1)`). It draws a 500 mm grid in XY, three long axis lines coloured **X blue, Y magenta, Z spring-green** (`view3d.tsx:172`), plus a 12 mm `AxesHelper` at `props.origin` which is **X red, Y green, Z blue** — the two triads disagree. Stock = edge box. The tool assembly (`cam.kernel.assemblyMeshes`, tip at origin, axis +Z) is translated to `positionAt(t)`; it never rotates. `Orient` moves and rotary words are skipped (`playback.ts:21`).
- `machine.ts` already holds the authoritative kinematics table (`KINEMATICS`, `ORIGINS`, `cadToLathe`, `checkAxes`). It is used by the AI (`cam.machine`, `cam.analyze`) and the origin UI, **not by the viewer**.
- `setup.ts` has `WorkFrame` (`workToWorld` / `worldToWork`, validated right-handed) and `ManufacturingSetup` with fixture boxes; nothing in the UI builds one. The verifier (`verify/verify.ts`) checks `fixtures` boxes; `cam_edit.verify` accepts `fixtures` from the AI.
- Kernel machines (`kernel/machines.ts`) carry `table { length, width, gap }`; 5-axis trunnions are modelled in `indexing.ts` / `five-axis.ts` / `kernel/kinematics.ts` (table turns, tool stays +Z).

### 2.2 Defects found (reproduced with `generateLatheGCode` / `generate3DPrinterGCodeForElement` → `analyseGcode`)

| # | Defect | Evidence |
| --- | --- | --- |
| D1 | Lathe: `G18` reported `unsupported`; the program is drawn in the world XZ plane with **X as a diameter** (a Ø48 pass is drawn at 48 mm from the axis, twice the real radius) and the spindle axis vertical. | turning: warnings `["line 9: unsupported G18"]`, bounds x 0..52 |
| D2 | Lathe threading: `G32` reported `unsupported` on every pass; the passes are replayed with the previous modal motion (drawn as rapids, not feed). | threading: `unsupported G32` ×N |
| D3 | Lathe: no chuck, no round stock, the part does not rotate; the tool drawn (if any) is a milling cutter. `previewDefaultTool` is undefined for lathes, so a sphere marker is shown. | `CamPage.tsx` `previewDefaultTool` |
| D4 | Printer: `G28`, `G92` reported `unsupported`; `E` is never parsed, so all 505 moves of a 20 mm cube are identical `Linear` moves: travel and extrusion look the same; a `G92 X/Y/Z` shift would be ignored. | printer: tags `{ Linear: 505 }` |
| D5 | Printer: the stock box of the CAD workpiece is drawn although a printer has no stock; no bed, no build volume, no nozzle. | `ToolpathVisualizer.stock` |
| D6 | Mill: no vise/clamps/table drawn; workholding exists only as verifier boxes the AI may pass. | — |
| D7 | Mill (generator path): the preview stock is placed in **CAD** coordinates (`stockOf`: centre `x, y`, `topZ`) while the generator shifts the geometry to **work** coordinates (`originShift`: `dx = -stock.x` …). Stock and toolpath are drawn apart whenever the stock is not centred on the CAD origin, `topZ ≠ 0`, or `originType ≠ workpiece-center`. The kernel path is correct (`kernelStockOf` subtracts `artifact.origin`). | `job.ts:70`, `dispatch.ts:33` |
| D8 | The machine kind of a parsed program is never known by the viewer: an imported lathe program on a page whose generator is set to mill is drawn as a mill job, and vice versa. | — |
| D9 | The tool never turns, so "spindle on" vs "spindle off" (probe, M5) is invisible; an axisymmetric mesh would not show rotation anyway. | `view3d.tsx:470` |
| D10 | Unsupported words are toasted only on "Process G-code"; the 3D view shows a partial program without saying so. | `CamPage.processGCode` |
| D11 | `Orient` (3+2) and rotary words are dropped from playback: indexed/5-axis programs are drawn without the table/tool tilt. | `playback.ts:21` |

The mobile toolpath screens list programs and do not draw them in 3D; they are out of scope.

## 3. Principles (binding for every phase)

1. **One kinematics table.** `machine.ts` `KINEMATICS` stays the source for the AI, `checkAxes` and now the viewer. New facts (rotation sense, workholding, display mapping) are added there or next to it in `packages/core/src/cam`, never duplicated in the UI or a prompt.
2. **The IR does not change.** `ProgramSchema`/`MoveSchema` stay as they are (posts, evidence digests, saved programs depend on them). Lathe X stays a diameter in the IR; extrusion, spindle state and plane travel in a parallel, optional **motion track** (§4.4). Old saved programs decode unchanged.
3. **Program frame is the truth; display is a pure mapping.** Every point drawn is `display = D(setup) · program`. `D` is a pure, tested function in core. For a 3-axis mill and a printer `D` is the identity, so today's mill screen coordinates, camera targets and AI vision coordinates do not move.
4. **Draw what is verified, mark what is assumed.** Workholding the user/AI configured is solid and feeds the verifier; workholding the viewer assumes (defaults) is translucent and labelled *assumed*, exactly like the assumed tool holder today (`assemblyMeshes(..., { assumeHolder })`, 35 % opacity). An assumed vise never creates a verification claim.
5. **Pure core, thin renderer.** Everything testable (frames, bodies, poses, rotation angle, deposited layers, turned profile, collisions, inference) is a pure function in core returning plain data. `View3D` only turns that data into Three.js objects; tests do not need WebGL (the test DOM has none).
6. **Integrate, no parallel systems.** Setup fields extend `ToolpathSettings` (persisted in saved programs, decoded with defaults); the AI uses the existing `cam.machine`, `cam.analyze`, `cam_edit.stock_set`, `cam_edit.verify` actions; the visualizer stays `ToolpathVisualizer` + `View3D`.
7. **Numeric fields** in new UI use `NumberField` (comma decimals, expressions), never `type=number`.

## 4. Core model (`packages/core/src/cam`, WP2)

### 4.1 Machine setup descriptor — `cam/viewer/machine-setup.ts` (new)

```ts
type MillWorkholding =
  | { kind: "vise"; jawAxis: "x" | "y"; clampDepth: number; jawHeight: number; jawThickness: number; jawLength: number; maxOpening: number; parallels: number }
  | { kind: "clamps"; count: 2 | 4; height: number }        // strap clamps on the long sides, boxes
  | { kind: "plate" }                                      // fixture plate / vacuum: only the table under the stock
  | { kind: "none" }

interface LatheWorkholding {
  kind: "chuck-3jaw" | "chuck-4jaw" | "collet"
  gripLength: number        // stock length inside the jaws, mm
  chuckDiameter: number     // body Ø, mm (default max(160, 2.6 × stockDiameter))
  jawHeight: number         // radial jaw size, mm
  tailstock: boolean        // live centre on the free end
}

type PrinterKinematics = "cartesian" | "corexy" | "bed-slinger" | "delta"

type MachineSetup =
  | { kind: "mill"; axes: 3 | 4 | 5; rotary?: { layout: "table-AC" | "table-BC"; pivot: Vec3 }; workholding: MillWorkholding; table?: { length: number; width: number }; stock: StockBox; workOffset: WorkOffset; assumed: ReadonlySet<"workholding" | "table" | "stock"> }
  | { kind: "lathe"; turret: "rear" | "front"; xMode: "diameter" | "radius"; zero: "face" | "chuck"; stock: { diameter: number; length: number; bore: number }; workholding: LatheWorkholding; assumed: … }
  | { kind: "3dprinter"; kinematics: PrinterKinematics; bed: { width: number; depth: number; origin: "corner" | "center" }; buildHeight: number; nozzle: number; filament: number; assumed: … }
```

- `StockBox` is in **program (work) coordinates**: `{ min: Vec3; max: Vec3 }`. Fixes D7: `millSetupOf` converts the CAD stock with the same `originShift` + `topZ` shift the generator applied (one shared helper exported from `generator/dispatch.ts`, used by both — not re-derived).
- Builders: `millSetupOf(settings, stock, machine?)`, `latheSetupOf(settings)`, `printerSetupOf(settings, extras)`, and `setupFromArtifact(artifact)` (kernel; stock from `kernelStockOf` maths, table from the kernel machine). Each fills defaults and records which parts are `assumed`.
- Validation `validateMachineSetup(setup): SetupIssue[]` (reuses `SetupIssue` of `setup.ts`): positive finite sizes; `gripLength < stock.length`; `clampDepth < stock depth`; stock width across the jaws ≤ `maxOpening`; bore < diameter; bed sizes > 0. Issues are shown in the visualizer and returned to the AI; an invalid setup still draws (with the issue), never throws in the render path.

### 4.2 Display mapping — `cam/viewer/frames.ts` (new)

Frames (every function names its source and target, spec 29 §3):

| Frame | Meaning |
| --- | --- |
| `program` | coordinates as written in the NC (after `G92`/`G50` coordinate setting, in mm). Lathe X is a diameter (G7) or a radius (G8). |
| `work` | `program` with lathe X turned into a radius. Equal to `program` for mill/printer. |
| `display` | Three.js world, Z up, mm. What `View3D` draws. |
| `machine` | (5-axis, optional view) the work frame after the table rotation `R(A|B, C)` of `indexing.ts`. |

`displayPoint(setup, p: Vec3, frame = "part"): Vec3`:

- **mill**: identity. (`frame = "machine"` on a rotary mill applies `partToMachine` of `indexing.ts` with the current angles; §5.5.)
- **lathe**: the spindle axis is horizontal, the chuck on the **left**, the free end on the right, as an operator sees a lathe. `display.x = Z_work`, `display.y = 0`, `display.z = s · r` with `r = X/2` (diameter mode) or `X` (radius mode), `s = +1` for a `rear` turret (slant bed: tool above the axis, +X up), `s = −1` for a `front` turret (tool on the operator side, drawn below the axis as in the ISO front-type XZ diagram). The part is axisymmetric, so placing the tool plane at this azimuth is geometrically exact. With `zero = "chuck"` nothing changes in the mapping (Z is already measured from the stock's back end in the program); only the chuck/stock placement differs (§4.3).
- **3dprinter**: identity (bed coordinates; Z0 = bed surface).

`displayAxes(setup)`: the triad the view draws, from `KINEMATICS[kind].axes`: name, display direction, colour (**X red `#ef4444`, Y green `#22c55e`, Z blue `#3b82f6`** — the convention of `AxesHelper`, Fusion and most CAM), positive label, which body moves (`moves`), and rotary indicators (lathe: `C` spindle arrow round display +x; mill: `S` arrow round the tool axis; 5-axis: A/B/C arcs on the table). Lathe has **no Y** in the triad. Printer adds `E` as a label on the nozzle, not an axis.

`inverseDisplayPoint` exists for picking and for the AI ("what program coordinate is under the cursor"); round-trip tests to 1e-9.

### 4.3 Bodies — `cam/viewer/machine-bodies.ts` (new)

`machineBodies(setup): Body[]`, display coordinates, each `{ id, role: "stock" | "fixture" | "table" | "chuck" | "jaw" | "bed" | "build-volume" | "tailstock", shape: Box | Cylinder | Ring, assumed: boolean, moves: "static" | "spindle" | "bed-y" | "bed-z" | "table-rotary" }`.

- **Mill / vise** (`jawAxis: "x"`: jaws parallel to X, clamping across Y — the usual vise on a VMC, fixed jaw at the back +Y, moving jaw towards the operator −Y):
  - stock box from `setup.stock`;
  - two jaw boxes: length `jawLength` along X centred on the stock, thickness `jawThickness` along Y touching the stock faces, top at `stock.min.z + clampDepth`, height `jawHeight`;
  - parallels: two thin boxes under the stock, height `parallels`;
  - vise body (base) under the jaws; table box under everything (`table` from the kernel machine, else assumed 600 × 400).
  - `jawAxis: "y"` rotates the jaw layout 90°.
  - `clamps`: strap boxes on the two long sides at the stock top, `plate`: table only, `none`: stock only.
- **Lathe**: stock cylinder (Ø `diameter`, bore `bore`, length `length`) along display +x; with `zero = "face"` it spans `x ∈ [−length, 0]`, with `zero = "chuck"` `x ∈ [0, length]`; chuck body cylinder behind the stock back end (`x < back + gripLength` covered by jaws), 3 or 4 jaw boxes at 120°/90° gripping `gripLength`; collet: a tapered sleeve; tailstock centre cone at the free end when `tailstock`. Stock, chuck and jaws have `moves: "spindle"`: they turn together.
- **Printer**: bed plate (`width × depth`, 4 mm thick, top at Z0, placed from `origin`: corner → `[0,W]×[0,D]`, centre → `[−W/2,W/2]×[−D/2,D/2]`), build volume wireframe up to `buildHeight`. `moves`: `bed-y` for bed-slinger, `bed-z` for cartesian/corexy, `static` for delta.

`fixtureBoxes(setup): VerifyFixture[]` = the non-assumed workholding bodies as boxes in **work** coordinates → the verifier's `fixtures` (§6). For a lathe the chuck becomes a cylinder envelope used by the lathe check (§6.2), not a verifier box (the verifier simulates mills only).

### 4.4 Motion track — `cam/viewer/motion-track.ts` (new) + interpreter

The viewer needs per-move machine state that the IR does not carry. `analyseGcode` builds moves 1:1 from interpreter segments, so a parallel array aligns by construction:

```ts
interface MotionState {
  readonly spindle: "cw" | "ccw" | "off"   // M3 / M4 / M5 (M19 orient = off)
  readonly rpm: number                     // S; with G96 the computed rpm at this X (clamped by G50 S / G92 S)
  readonly css: boolean                    // G96 constant surface speed
  readonly plane: 17 | 18 | 19
  readonly xMode: "diameter" | "radius"    // G7 / G8 (lathe), default diameter
  readonly extrude: number                 // filament mm pushed during this move (≤ 0 = travel/retract)
  readonly tool: number | undefined        // last T word
  readonly coolant: "off" | "flood" | "mist"
  readonly feedMode: "min" | "rev"         // G94 / G95
  readonly line: number                    // source line (editor highlight, AI references)
}
interface MotionTrack { readonly states: ReadonlyArray<MotionState>; readonly unsupported: ReadonlyArray<{ line: number; word: string }> }
```

- `Analysis` gains `motion?: MotionTrack`; `ParseResponseSchema` gains `motion: Schema.optionalKey(MotionTrackSchema)` (WP3, backward compatible: old clients ignore it, old responses decode).
- Programs that were not parsed (kernel artifact, operation results) get `motionTrackFromProgram(program)`: spindle `cw` at `toolpath.spindleRpm` (> 0) else `off`, plane 17, no extrusion. Same type, so the viewer has one path.
- Alignment guard: if `states.length !== expandMoves(...)` count of the program actually drawn, the track is dropped and the fallback is used (test: hand-edited program with a stale track).

Interpreter changes (`testing/gcode-interpreter.ts`; it is also the evidence/verify/cost replay, so each change keeps mill output bit-identical — guarded by the existing suites plus a golden of segment arrays for the mill fixtures):

| Word | New behaviour |
| --- | --- |
| `G18`, `G19` | accepted; arcs in the active plane: centre from `I/K` (G18) or `J/K` (G19) or `R`; emitted as **linear chords** (sagitta ≤ 0.01 mm, the `ARC_SAGITTA` of `machine-clearance.ts`) because the IR `Arc` is XY-only. Direction per ISO 6983: viewed from the positive end of the axis normal to the plane. G17 arcs unchanged. |
| `G7` / `G8` | accepted; recorded in the track (`xMode`), no geometric scaling in the interpreter (the program frame keeps X as written). |
| `G32`, `G33`, `G76` single-line | `G32/G33`: a feed move along the thread, `F` = pitch (mm/rev), feed in mm/min = pitch × rpm for time; kind `linear`. `G76` stays unsupported (listed). |
| `G96`, `G97`, `G94`, `G95` | accepted; recorded in the track. |
| `G50` | `G50 S…` = max spindle speed (track); `G50 X… Z…` = coordinate setting like `G92` (Fanuc lathe). Disambiguated by the words present. |
| `G92` | `X/Y/Z` words set the current position (coordinate offset applied to all following absolute moves until `G92.1`); `E` resets the extruder position only; `G92 S…` alone (lathe, G-code system B/C) = max spindle speed, like `G50 S`. |
| `G28` | accepted; no drawn motion; the next move starts from the setup's home (printer: bed origin; mill/lathe: unchanged position) and the track marks a `home` event. |
| `E` | parsed on every motion block; `M82` absolute (default), `M83` relative; `extrude = E_now − E_before` stored in the track. |
| `M104/M109/M140/M190/M106/M107` | recorded (temperature/fan), no motion. |
| `G70–G75` (lathe canned cycles), `G71` etc. | still unsupported; listed in `MotionTrack.unsupported` and shown in the view (§5.6). Expansion is a later increment. |

`checkAxes` and `analyzeGcode` keep their current outputs except that the removed `unsupported Gxx` warnings disappear for words that are now handled (asserted).

### 4.5 Machine kind of a program — `inferMachineKind(gcode)` (in `machine.ts`)

Returns `{ kind, confidence: "explicit" | "strong" | "weak", reasons: string[] }`:

- printer — any `E` word on a motion block, or `M104/M109/M140/M190`, or `M82/M83`;
- lathe — `G18` with no `Y` words, or `G96`/`G32`/`G7`/`G50 S`, or `T0101`-style 4-digit turret words with X/Z only;
- mill — `G17`/`G43`/`Y` motion/`G81–G83`;
- conflicting evidence → highest-scoring kind with `weak` and the conflict listed; empty text → `undefined`.

Resolution order in the page (`resolveMachineKind`): (1) the user's override in the visualizer; (2) the source that produced the text (generator settings `machineType` when `camStore.gcode` is the generator's output; kernel artifact → mill; saved program snapshot `settings.machineType`); (3) inference when the text was imported or edited; (4) `mill`. A mismatch between (2)/(3) and the inferred kind (strong) shows a warning badge ("Looks like a lathe program; the generator is set to mill") — never a silent switch.

## 5. Viewer (`apps/desktop/src/viewport/view3d`, WP7; `features/cam`, WP6)

### 5.1 Props

`View3DProps` gains (all optional; CAD callers pass none and see no change):

```ts
readonly machine?: cam.viewer.MachineSetup
readonly motion?: cam.viewer.MotionTrack
readonly machineDisplay?: { showWorkholding: boolean; showMachineTriad: boolean; spin: boolean; frame: "part" | "machine"; depositMode: "progressive" | "all"; layer?: number }
```

When `machine` is absent `View3D` behaves exactly as today (CAD editor, and CAM before the page passes it). The CAD triad colours are not changed by this spec (WP7 owner decision; listed in §11).

### 5.2 Mill

- Bodies from §4.3; assumed ones translucent with an *assumed* tag in the legend.
- Tool assembly as today, plus a **flute marker** (a thin helical strip or two opposite flat stripes on the cutting part, from `assemblyMeshes` profile) so rotation is visible. The assembly turns about its +Z at the display rate (§5.7), sense from `MotionState.spindle`: M3 = clockwise seen from the spindle looking at the part (ISO 6983) = negative rotation about display +Z; M4 positive; `off` still.
- Machine triad at the work zero (`workOffset` label, e.g. `G54`), X red / Y green / Z blue, arrows labelled with `positive` text from `KINEMATICS` on hover.
- Camera default for mill: operator view (from −Y, slightly above, +X to the right) = the current `perspective` direction `[1, −1, 0.8]`: unchanged.
- Tool path entering a fixture body: the segment is drawn red and listed in the stats overlay (from §6.1, same function as the check).

### 5.3 Lathe

- Bodies: chuck + jaws + stock (+ tailstock) turning together about display +x; a contrasting stripe on the stock and the jaws make the rotation visible.
- **Turned part, live**: `turnedProfile(setup, playback, t)` (core, pure) keeps the outer radius per Z bin (bin = 0.05 mm, capped at 20 000 bins) as the minimum tool-tip radius reached by feed moves with the spindle on, and the inner radius for boring/internal tools (`toolType` boring / `turningOperation` internal: the maximum radius reached inside the bore). The stock is drawn as the revolved profile at time t (lathe-revolve mesh, 64 segments) instead of the raw cylinder: the user sees the part being turned. Point tool (nose radius 0) — stated in the legend.
- Tool: `latheToolMeshes(toolType, turret)` (core): turning/facing = rhombic 80° insert (CNMG-like) on a square shank; threading = 60° profile; grooving/parting = blade of width = `toolDiameter`; boring = round bar along +Z out of the bore. The tool tip is the program point; the shank extends radially away from the axis (+display z for rear turret). The tool never turns.
- Triad: Z (blue) along the spindle axis pointing away from the chuck, X (red) radial with label "X Ø" in diameter mode, `C` arrow for the spindle sense: M3 = clockwise seen from the headstock looking at the part = **positive** rotation about display +x (machine +Z); M4 negative.
- Camera default for lathe: `front` (looking from −y), the XZ plane flat on screen, chuck left — the drawing a lathe operator reads. The preset buttons keep their names; `fit` frames stock + chuck.
- Grid in the XZ display plane (y = 0) for lathe, XY for mill/printer.

### 5.4 3D printer

- Bed, build volume, nozzle (hotend cone, Ø `nozzle` tip) instead of a cutter; no stock box (D5).
- Extrusion moves (`extrude > 0`) drawn as **deposited beads** (line width ≈ `extrusionWidth`, colour by layer height ramp), travel (`extrude ≤ 0` and no E) as thin dashed lines, retractions (`extrude < 0`) as small markers. `depositMode: "progressive"` shows only what has been deposited up to t (the build grows); `"all"` shows everything; `layer` limits to Z ≤ that layer (layer slider in the settings panel, layers from `printerLayers(program, motion)`: distinct Z of extruding moves, vase mode handled as continuous Z with a layer per 360° of travel).
- Physical motion option (`frame: "machine"`): bed-slinger → the bed + deposited part translate in −Y by the nozzle Y while the nozzle stays at Y0; cartesian/corexy → the bed drops by Z; delta → nozzle moves. Default `part` (bed fixed), same as the program.
- Triad at the bed origin; Z labelled "build".

### 5.5 Rotary mills (D11)

- `Orient` moves: the playback carries the current A/B/C; in `part` frame the tool axis is drawn tilted by `R⁻¹·(+Z)` at the indexed angles (the part stays fixed); in `machine` frame the table group (table, fixture, stock, path) rotates by `R` about the pivot and the tool stays vertical — exactly the trunnion model of `indexing.ts`.
- Simultaneous rotary words (`rotary` on `Linear`/`Rapid`) interpolate the angles along the segment.
- `tcp: "program"` programs are already in machine coordinates: the `machine` frame shows them as written and the `part` frame applies `R⁻¹` — tested both ways against `partToMachine`.

### 5.6 Visualizer shell (`ToolpathVisualizer.tsx`, WP6)

- New prop `machine` + `motion` from `CamPage` (built with the resolver of §4.5 and the builders of §4.1). `stock` prop is kept for compatibility and becomes derived from `machine` for mill.
- Header badge: machine kind + source (`generator`, `kernel`, `saved`, `inferred`) + override select (Mill / Lathe / 3D printer); mismatch warning (§4.5).
- Settings panel, new section **Machine**: show workholding, show machine triad, spin (default on; off when `prefers-reduced-motion`), frame part/machine (rotary mills, printers), deposit mode + layer slider (printer).
- Stats overlay adds: machine, spindle state at t (`S12000 CW`, `chuck M3 S800`, `nozzle 200 °C`), current program point **and** display point, current line (from the track), unsupported lines count with a "partial preview" chip listing them (D10).
- Setup fields (generator sections, `NumberField`): mill — workholding kind, jaw axis, clamp depth, jaw height, parallels height; lathe — turret, grip length, chuck kind, tailstock, bore; printer — kinematics, build height. They extend `ToolpathSettingsSchema` with `withDefault` (old configs and saved programs decode with defaults) and are marked "configured" once edited, which turns the matching bodies from *assumed* to solid (§3.4).

### 5.7 Animation rules

- Display spin rate = `min(rpm / 60, 2) × playbackRate` rev/s (2 rev/s cap avoids stroboscopic aliasing at 60 fps; real rpm is shown as text). `css` lathe programs use the computed rpm. Paused playback: no spin, the frame scheduler stays idle (current behaviour of `FrameScheduler`, no regression in idle CPU).
- Spin angle is a pure function of playback time (`spinAngle(track, playback, t)` integrates the per-segment rates), so scrubbing is deterministic and the AI capture of a frame is reproducible.
- The viewport capture (`registerViewportCapture`) renders with the spin angle frozen at the current t.

## 6. Checks that use the same geometry

### 6.1 Mill workholding

- `fixtureBoxes(setup)` feeds `cam_edit.verify` / the Verify panel **only for configured** workholding (§3.4). The verifier already reports `FixtureCollision` with the fixture id.
- `checkWorkholding(program, setup)` (core, static, fast): flags feed/rapid segments whose tool envelope (radius from the cutter, length from the stickout) enters a jaw/clamp/parallel box, cuts below `stock.min.z` over a parallel, or a jaw top above the stock top (`clampDepth ≥ depth`). Codes `MILL_INTO_VISE`, `MILL_INTO_CLAMP`, `MILL_INTO_PARALLEL`, `VISE_ABOVE_STOCK`, `STOCK_WIDER_THAN_VISE`. Used by the view (red segments) and by `cam.analyze` when a setup is known.

### 6.2 Lathe

`checkAxes(gcode, "lathe", setup?)` gains, when a setup is given: `LATHE_INTO_CHUCK` (tool tip Z beyond the jaws' front face while X is below the chuck diameter), `LATHE_PAST_STOCK_END` (cutting beyond the stock back end), `LATHE_STICKOUT` (stickout/diameter > 4 without tailstock: deflection warning), `LATHE_BORE_TOO_SMALL` (internal tool inside a bore smaller than the bar). Without a setup, the current checks are unchanged.

### 6.3 Printer

`checkAxes(…, "3dprinter", setup?)` gains `PRINTER_OFF_BED` (extrusion outside the bed rectangle), `PRINTER_ABOVE_VOLUME` (Z > buildHeight), `PRINTER_FIRST_LAYER_HIGH` (first extruding Z > 2 × layerHeight). Existing codes unchanged.

## 7. AI awareness (`packages/ai`, WP8)

1. **Skill** `machines-and-axes.md`: add a section *What the preview shows* (one table: what turns, what is fixed, where the zero and the triad are, how the vise / chuck / bed sit, the rotation senses, *assumed* vs configured workholding) and *Workholding* rules (vise jaw axis, clamp depth ≤ depth − cut depth, grip length and stickout ratio, part on the bed). `stock-and-fixtures.md`: vise and chuck are now first-class setup fields, configured workholding is verified automatically. Keep within the skill budget asserted by `skills.test.ts` / `context-breakdown.test.ts`.
2. **`cam.machine`** returns, in addition to the kinematics table, `display` (from `displayAxes` + body list of the **current project setup** when the host has one) and `rotation` (`spinSense(kind, "M3" | "M4")` with the viewing convention in words).
3. **`cam.analyze`** accepts an optional `setup` (or uses the project's) and adds the §6 checks; it reports `inferMachineKind` when `machineType` is omitted, with its reasons.
4. **`cam_edit.stock_set`** accepts `workholding` (the §4.1 union per machine) and marks it configured; the desktop sync applies it to the generator settings, so the view updates live (Aura rule).
5. **Workspace context** (`workspace-context.ts`): one line, e.g. `Preview: lathe, rear turret, X diameter, Z0 finished face; Ø50×100 stock, 3-jaw chuck grip 20 (stickout 80); part turns M3 S800 (clockwise from the headstock). Partial preview: 2 unsupported lines (G71).` / `Preview: mill, vise jaws along X (assumed), clamp 6 mm, G54 at stock centre top.` / `Preview: printer bed 220×220 corner origin, 50 layers, Z 0.2–10.0.`
6. **Vision capture** (`spatial` of `RenderCapture` in CAM mode): machine kind, frame mapping (`display = …`), body boxes, current program point and display point, spindle state and line at t. The AI can then relate a screenshot to program coordinates without guessing.
7. Prompts never restate the kinematics; they point to `cam.machine` (principle 1).

## 8. Files touched (by owner)

| Owner | Files |
| --- | --- |
| WP2 | `cam/machine.ts` (`inferMachineKind`, `spinSense`, `checkAxes` setup checks), `cam/viewer/{machine-setup,frames,machine-bodies,motion-track,turned-profile,printer-layers,lathe-tools}.ts` (new) + `viewer/index.ts`, `cam/testing/gcode-interpreter.ts`, `cam/generator/{analysis,schema,dispatch}.ts` (track, settings fields, shared origin helper) |
| WP3 | `ParseResponseSchema.motion` (optional) — lives in `cam/generator/schema.ts`, exposed by `packages/api/src/groups/toolpath-generator.ts` (no new endpoint); regenerate clients |
| WP4 | `apps/sidecar/src/http/toolpath-generator.ts` passes `motion` through (no logic) |
| WP7 | `viewport/view3d/{view3d.tsx,playback.ts}` (+ `machine-scene.ts` new: bodies/triad → Three objects, disposal) |
| WP6 | `features/cam/components/ToolpathVisualizer.tsx`, `screens/CamPage.tsx`, `components/generator/{LatheSection,OriginSection,…}.tsx`, `lib/job.ts` (stock in work coordinates), `store/camStore.ts` (`motion`, `machineOverride`), i18n keys |
| WP8 | `skills/text/{machines-and-axes,stock-and-fixtures}.md`, `actions/{cam,cam-edit}.ts`, `workspace-context.ts`, desktop `features/ai/lib/{drawing-context,cam-sync}.ts` |

## 9. Test plan and edge cases

Every row is a test; pure ones in core (`packages/core/test/cam/…`), renderer-free scene tests in `apps/desktop/test/cam-machine-view.test.ts`, page tests in `cam-page.test.ts`, AI in `packages/ai/test`. Tests are written **before** the code of their phase (characterization first for existing behaviour).

### 9.1 Characterization (Phase 0 — pins today, must stay green)

- Mill: `buildPlayback` segments, `positionAt`, `toolAt`, `toolColors` for the existing fixtures; `displayPoint(millSetup, p) === p` for 1 000 random points.
- Interpreter: snapshot of segment arrays (kind, from, to, centre, feed, line) for every mill golden/fixture used by `post.test.ts`, `path-and-interpreter.test.ts`, `subprogram-interpreter.test.ts`; must be bit-identical after Phase 1.
- `analyseGcode` warnings for mill programs unchanged; for lathe/printer, the expected removal of `unsupported G18/G28/G92/G32` is asserted explicitly (it is the fix, not a drift).
- D7 reproduced as a failing test first: stock element at (50, 20, topZ 5) with each `originType` → the stock box must contain the generated contour in work coordinates.

### 9.2 Frames and mapping

- Lathe: `X50 Z-10` → display (−10, 0, 25) rear, (−10, 0, −25) front; G8 radius mode `X25` → same; `X-1` facing overshoot → z = −0.5 (allowed, drawn past the axis by 0.5 mm, no throw); zero `chuck` vs `face` give the same tool-to-stock relation (stock moved, not the path).
- Round trips `inverseDisplayPoint(displayPoint(p)) = p` (1e-9) for all kinds; lathe y is ignored (program Y on a lathe: `LATHE_Y_AXIS` error stays; display drops it and lists it).
- Printer corner vs centre origin: a part centred at (110,110) is on the bed for corner, off the bed for centre on a 220 bed → `PRINTER_OFF_BED`.
- Mill origin types (centre, corner, corner2, machine-zero, custom) × stock offsets × `topZ` ≠ 0 → stock box and toolpath share the frame (D7 fixed).
- Triad: colours RGB, lathe has no Y, labels from `KINEMATICS`.

### 9.3 Interpreter / motion track

- G18 arcs: quarter circles G2/G3 with `I/K` and `R` (±R major arc), full circle, helical in Y; chord sagitta ≤ 0.01; direction per ISO viewed from +Y; G19 likewise; G17 unchanged.
- G32 threading: N passes drawn as feed; time = length / (pitch × rpm); missing F → existing `THREAD_NO_PITCH`.
- G96/G97/G50 S: rpm at X50 with `S200` CSS = 200 000 / (π × 50) ≈ 1273, clamped by `G50 S1000` → 1000; X → 0 does not divide by zero (clamped to G50 or 4 000 default).
- `G50 X Z` and `G92 X Y Z` coordinate setting, `G92.1` cancel; `G92 E0` only resets E.
- E absolute/relative (`M82`/`M83`), retraction (negative), prime moves at the start, travel without E, `G28` home then first move.
- M3/M4/M5/M19 transitions mid-toolpath; tool changes (`T`); coolant.
- Alignment guard: stale track → fallback; kernel/operation programs → `motionTrackFromProgram`.
- `inferMachineKind`: generator outputs of each machine (strong), mixed E+G18 (weak, conflict listed), empty (undefined), mill with `G18` used for a side arc (still mill: Y present).

### 9.4 Bodies and checks

- Vise: jaw axis x/y, clamp depth, parallels; `clampDepth ≥ depth` → `VISE_ABOVE_STOCK`; stock wider than `maxOpening`; contour of an outside profile at full depth with a 6 mm tool next to the jaws → `MILL_INTO_VISE` at the exact segment; pocket inside → none; through-cut below the stock bottom over a parallel → `MILL_INTO_PARALLEL`.
- Assumed vs configured: assumed vise → no verifier fixtures; configured → `fixtures` passed; `cam_edit.verify` finds `FixtureCollision` with the jaw id.
- Lathe: grip ≥ length → validation issue; parting at Z −length with grip 20 → `LATHE_INTO_CHUCK`; stickout 200 on Ø20 → `LATHE_STICKOUT`, not with tailstock; boring bar Ø16 in Ø10 bore → `LATHE_BORE_TOO_SMALL`.
- Turned profile: facing 2 mm shortens the stock end by 2; turning Ø48 over Z0..−100 gives r = 24 over that range and 25 elsewhere; boring raises the inner radius only for internal tools; spindle off → nothing removed; profile at t is monotone non-increasing in material over t.
- Printer layers: 20 mm cube → 50 layers at 0.2 steps; vase mode spiral; deposit at t only includes extruding segments that ended before t (+ partial current one).

### 9.5 Rotation

- `spinSense("mill","M3") = −1` about display +Z; `("lathe","M3") = +1` about display +x (machine +Z); M4 opposite; off = 0.
- `spinAngle` deterministic under scrubbing (t forward/back gives the same angle), capped rate, 0 when paused, 0 with reduced motion.
- 5-axis: `Orient` A30 C90 on `table-AC` in machine frame rotates the stock box exactly as `partToMachine`; part frame tilts the tool axis to `R⁻¹·Z`.

### 9.6 UI and page

- Badge + override select; switching the override re-fits once and does not reset playback time.
- Mismatch warning when an imported printer program is opened with machine type mill.
- Partial preview chip lists G71 lines.
- New setup fields are `NumberField`s, persist in saved programs (save → restore round trip), and old saved programs without them restore with defaults.
- `View3D` without `machine` (CAD editor) builds the same object tree as before (snapshot of object names/types).
- Unmount disposes chuck/jaw/bed/bead geometries (no leak: count of live geometries returns to baseline).
- Performance: 1 M-segment mill program builds the scene in the same time ±10 % as baseline; printer 200 k extruding moves renders with merged buffers (one draw call per layer band).

### 9.7 AI

- Skill text contains the preview table and workholding rules; budget tests pass.
- `cam.machine` returns `display` and `rotation`; `cam.analyze` returns lathe/vise/printer setup findings and the inference with reasons.
- `cam_edit.stock_set` with `workholding` updates the generator settings and the view (desktop sync test).
- Workspace context line per machine; vision `spatial` includes machine, mapping, program/display point.

## 10. Phases and gates

| Phase | Content | Gate (all must pass) |
| --- | --- | --- |
| P0 | Characterization tests of §9.1 (D7 failing test marked `todo` until P2) | baseline of §1 + new characterization green |
| P1 | Core: interpreter words, motion track, `inferMachineKind`, setup descriptors, frames, bodies, `spinSense`, turned profile, printer layers, checks (pure) | §1 suites + §9.2–9.5 core tests; mill segment snapshots bit-identical; `tsc` core |
| P2 | API optional `motion`; sidecar passthrough; page resolver; `job.ts` stock in work coordinates (D7) | api contract test, sidecar parse test, `cam-page`, `cam-kernel`, `cam-verify` |
| P3 | Viewer: machine scene (mill vise/table, lathe chuck/spin/turned part/tool, printer bed/beads/nozzle), triad, rotary frames, animation rules | `cam-machine-view.test.ts`, viewport tests, CAD snapshot unchanged, `tsc` desktop; visual check with the `run` skill: screenshots of the three machines at t = 0, mid, end |
| P4 | UI fields, badge/override, Machine section, partial-preview chip, verifier fixtures from configured workholding | §9.6, `cam-page`, `cam-save` round trip |
| P5 | AI: skill, `cam.machine`, `cam.analyze`, `cam_edit.stock_set`, context line, vision spatial | §9.7, `skills`, `tool-prompts`, `context-breakdown`, `ai-program-sync` |
| Final | full `bun test packages apps` (chunked), `tsc` for core, api, ai, desktop, sidecar | 0 fail; change log line here and in `00-overview.md` |

Each phase is committed and merged into local `main` when its gate passes; nothing from a later phase lands with a red gate.

## 11. Decisions and limits

- **Lathe display azimuth** (tool plane = display XZ, rear turret above, front turret below the axis) is a presentation choice made exact by axisymmetry; documented in the triad legend.
- **Viewing convention for rotation**: ISO 6983 (clockwise seen from the spindle towards the workpiece). Stated in the skill and the `cam.machine` output so the AI and the view agree.
- **No IR change**; G18/G19 arcs are chords in the IR. A plane-aware `Arc` would touch every post and is out of scope.
- **Material removal**: exact for the lathe (1-D profile, point tool). Mill removal stays in the verifier height field (not drawn live here).
- **Not covered**: lathe canned cycles G70–G76 expansion, mill-turn/live tooling, sub-spindle, Y-axis lathes, tilting heads (as in `indexing.ts`), multi-extruder colours beyond tool colours, tool nose radius compensation (G41/G42 on lathes is drawn at the programmed point).
- **CAD triad colours** (X blue, Y magenta, Z green in the CAD viewport) disagree with the RGB origin helper; fixing them in CAD is a WP7 owner decision outside this spec — the CAM view uses RGB from P3.

## 12. Implementation status (2026-10-17)

Done, with tests (`packages/core/test/cam/{machine-view,interpreter-characterization}.test.ts`, `apps/desktop/test/cam-machine-view.test.ts`, `apps/desktop/test/cam-page.test.ts` "the preview shows the program's machine", `packages/ai/test/machine-kinematics.test.ts`) and checked in the running app (Vite + real sidecar, headless Chromium screenshots of the three machines):

- §4.4 interpreter words and the motion track (`viewer/motion-track.ts`, parse response `motion`); milling replay bit-identical (fingerprints recorded before the change).
- §4.1–4.3 set-ups, frames, bodies (`viewer/machine-setup.ts`, `frames.ts`, `machine-bodies.ts`); D7 fixed with the shared `stockInWork`.
- §4.5 `inferMachineKind`; desktop `features/cam/lib/machine-view.ts` resolves the machine shown (pick > producer > clear words > setting) and flags mismatches.
- §5.1–5.4, 5.6, 5.7 viewer: `viewport/view3d/machine-scene.ts` mounted by `View3D` only when `machine` is given; mill vise / clamps / plate, table, flute marker and spindle angle; lathe chuck, jaws, live turned part (`viewer/turned-profile.ts`), lathe tool outlines, horizontal spindle axis, front view by default; printer bed, build volume, nozzle, progressive beads and layer limit (`viewer/printer-layers.ts`); RGB machine triad with S / C rotation arcs; red segments for set-up collisions; machine header (badge, pick, mismatch, partial preview) below the viewport's control bar; Machine section in the settings; spindle / position / line / findings in the stats.
- §5.6 set-up fields: generator section "Workholding" (`components/generator/WorkholdingSection.tsx`, CAD `NumberField`), new `ToolpathSettings` keys with defaults.
- §6 checks: `viewer/setup-checks.ts` `checkSetup` (MILL_INTO_VISE / CLAMP / PARALLEL / TABLE, LATHE_INTO_CHUCK / TAILSTOCK, PRINTER_OFF_BED / ABOVE_VOLUME / FIRST_LAYER_HIGH); `verify/request.ts` `workholdingFixtures` passes the configured vise / clamps to the verifier.
- §7 AI: skill sections (preview, running a program on its machine, workholding); `cam.machine` returns the preview mapping and, with `gcode` / `operationId` (+ `params`, `at`), the program's run on the machine (`packages/ai/src/machine-run.ts`: pose, rotation sense, findings, turned part, printed layers); `cam.analyze` reports `inferredMachine`; the workspace context has a `Preview:` line; vision `spatial` has machine, mapping, pose and findings.

Deviations from the plan above:
- §6.2 / §6.3 are a separate `checkSetup` (timeline-based, shared with the preview) instead of new `checkAxes` codes; `LATHE_PAST_STOCK_END` is covered by `LATHE_INTO_CHUCK`, `LATHE_BORE_TOO_SMALL` is not implemented (the bar diameter of the boring tool is not known).
- §7.4: the workholding is set through the operation `params` of `cam_edit.create` / `update` (they already flow into the generator store, so the preview updates live); `cam_edit.stock_set` is unchanged.
- The first move of a program starts from an unknown machine position (drawn from the origin, as before): the set-up checks test only its end point.
- Found while checking the running app: the 1 mm CAM grid at Z0 occluded every cut below Z0 in the depth buffer (already on `main`: only rapids above the stock were visible). In CAM mode the grid now does not write depth and is drawn first. The CAD viewport's grid is unchanged.
- The live turned profile marks every bin the move covers (sampling at exactly the bin pitch skipped bins through float rounding; regression test added).

Not done: §5.5 rotary mills (Orient / rotary words are still not drawn as table or tool tilt); a fixture-level unit test of the CAM grid depth setting (it needs WebGL; verified by screenshot).

## Change log

- 2026-10-17: spec written from the analysis of `main` @ 063eed5; baseline §1 verified green.
- 2026-10-17: built (§12); full suites green except two failures that also fail on clean `main` (`packages/web` API documentation coverage, a type error in `packages/ai/test/helpers/mcp-server.ts`).
