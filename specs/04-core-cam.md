# WP2 — CAM and G-code core (`packages/core/src/cam`)

Status: **done; targeted cycle/arc safety hardening verified** (IR, five operations, `generic`/`fanuc`/`grbl` posts with modal emission, reference interpreter, goldens and a regression test per legacy bug; `linuxcnc` and `haas` are reserved ids, not implemented). Owner dir: `packages/core/src/cam`. Depends on WP1 types (`Vec2`, `Vec3`, `Entity`, `tessellate`, `offsetPolyline`) — import them from `../cad/index.ts`; until WP1 lands, code against the interfaces in `03-core-cad.md`.

Pure and I/O-free, same rules as WP1.

Legacy reference (domain knowledge only; **do not port verbatim**): `.reference/src/lib/gcodeGenerator.ts`, `.reference/src/lib/cam/{unifiedGcodeGenerator,geometryProcessor,geometryToolpathIntegrator}.ts`, `.reference/src/lib/{fanucGcodeGenerator,fanucOptimizer,advanced-post-processor,gCodeGenerationUtils,cncControllers}.ts`.

## 1. Pipeline

```
Entities (WP1)  ──►  Operations  ──►  Toolpath IR (moves)  ──►  Post-processor  ──►  G-code text
   geometry           strategy           machine-neutral            dialect             string
```

Each stage is a pure function. The IR is the contract between stages and is what the viewport draws (WP7) and what the simulator walks.

## 2. Toolpath IR (`ir.ts`)

```ts
type Move =
  | { _tag: "Rapid";  to: Vec3 }
  | { _tag: "Linear"; to: Vec3; feed: number }                       // mm/min
  | { _tag: "Arc";    to: Vec3; center: Vec2; clockwise: boolean; feed: number } // IJ-capable, helical if to.z differs
  | { _tag: "Dwell";  seconds: number }
  | { _tag: "Comment"; text: string }
Toolpath = { id, name, toolId, spindleRpm, coolant: "off" | "flood" | "mist", moves: Move[] }
Program  = { name, units: "mm" | "inch", workOffset: "G54"…"G59", toolpaths: Toolpath[] }
```

All coordinates in millimetres in the IR; unit conversion happens only in the post-processor. Arcs carry the **true centre** (absolute); the post computes `I/J` relative to the start point.

Utility functions: `toolpathLength`, `toolpathBounds`, `estimateTime(toolpath, rapidRate)`, `validate(program, machine)` (travel limits, feed limits, missing tool).

## 3. Operations (`operations/*.ts`)

Schema-defined parameter records (`Schema.Class`), each with a pure `generate(params, geometry, tool, stock): Toolpath`:

| Operation | Behaviour |
| --- | --- |
| `Profile` | Inside/outside/on-line contour using `offsetPolyline` with tool radius (+ allowance); climb/conventional; multi-pass depth by `stepdown`; lead-in/out (`direct`, `ramp`, `helix`, `arc`); optional tabs |
| `Pocket` | Contour-parallel clearing with `stepover` (% of tool diameter); islands supported; finishing pass; ramp/helix entry |
| `Drill` | Peck (`peck`), chip-break, dwell; point ordering by nearest-neighbour; canned-cycle capable (emit `G81/G83` only if the post supports it, else expanded moves) |
| `Face` | Zig-zag surfacing across the stock top with stepover and overshoot |
| `Engrave` | Follow open/closed paths at constant depth |

Common params: `safeHeight`, `clearanceHeight`, `retractHeight`, `totalDepth` (positive number, converted to negative Z), `stepdown`, `feed`, `plungeFeed`, `spindleRpm`. All depth/feed defaults use `??`, never `||` (a legitimate `0` must survive).

Tool model (`tool.ts`): `{ id, name, kind: "endmill" | "ballnose" | "drill" | "vbit" | "facemill", diameter, flutes, maxRpm, stickout? }`; stock model: `{ x, y, z, origin, material }`.

## 4. Post-processors (`post/*.ts`)

```ts
interface Post {
  readonly id: "generic" | "fanuc" | "grbl" | "linuxcnc" | "haas"   // start with generic, fanuc, grbl
  emit(program: Program, options: PostOptions): string
}
PostOptions = { decimals: number /*3*/, lineNumbers?: { start: number; step: number },
                useCannedCycles: boolean, arcMode: "ijk" | "radius" | "linearize",
                header: boolean, tolerance: number }
```

- Header comment block (program name, tool, material, feeds, spindle) is optional and carries **no timestamp by default** (deterministic output; a `stamp?: string` option injects one).
- Prologue: unit (`G21`/`G20`), `G90`, `G17`, `G94`, work offset, tool change (`T… M6`), `M3 S…`, coolant.
- Modal output: do not repeat `G0/G1/G2/G3`, axis words or `F` when unchanged (modal optimisation is part of emission, not a string post-pass).
- Epilogue: retract, `M5`, coolant off, `M30` (grbl: `M2`).
- Arc safety: if `arcMode` is `"ijk"` and the machine/dialect forbids it, or `to` equals the start point (full circle), emit correctly (full circle uses `I/J` with identical start/end; `radius` mode splits into two half-circles); `linearize` flattens via `tessellate` with `tolerance`.

## 5. Bugs found in the legacy generator (must NOT be reproduced; each needs a regression test)

1. **Arc centre wrong**: `generateArcMove` used the chord midpoint as the centre (`I = (p1.x+p3.x)/2 - p1.x`). The centre is the circumcentre of the three points.
2. **Arc detection is a triple test**: `canFormArc(p1,p2,p3)` only checks that three points aren't collinear; any three points form *some* circle, so polylines were turned into arbitrary arcs. Fit arcs only when ≥ 3 consecutive points lie on one circle within `tolerance` (radial residual), and only when the source geometry was originally an arc/circle or `arcFit` is explicitly enabled.
3. **`||` defaults** (`params.safeHeight || 5`, `feedrate || 1000`) turn explicit `0` into the default. Use `??` and validate ranges in the Schema.
4. **Rapid moves at cutting depth between passes**: the generator retracts to `safeHeight` once before all passes, then for pass 2..n issues `G0 X Y` to the contour start while still at the previous pass's depth (a rapid through material). Between passes, either retract to `retractHeight` before the rapid, or (preferred for closed contours) step down along the path without retracting.
5. **Helical entry** was a single `G3` at full depth with `pitchPerRev = radius` unused: no actual spiral. Implement multi-revolution helix: `revolutions = ceil(depth / pitch)`, each revolution a full-circle `G2/G3` with proportional Z, `pitch` ≤ configured `helixPitch`.
6. **Ramp entry** moved to the next point at full depth in one segment (ramp angle unbounded). Limit by `rampAngle` (default 3°) and zig-zag along the contour if the first segment is too short.
7. **Timestamp in the header** made output non-deterministic; golden tests impossible.
8. **String-based optimiser ignores modal state**: it only inspects `G0/G1` lines, so after a `G2/G3` its remembered position is stale and a later `G1` back to the pre-arc position is dropped as "redundant". It also treats `G0` and `G1` to the same point as identical. Modal emission inside the post replaces the string optimiser entirely.
9. **No input validation**: negative or non-finite `depth`/`stepdown` silently produce zero passes (empty cut, no error), and `depth` is read from `params.depth || 5` as a fallback. Validate `totalDepth > 0`, `stepdown > 0` in the Schema and convert the sign once (cut Z = `-pass depth`).

## 6. Acceptance tests (must exist)

- Golden-file tests per post (`generic`, `fanuc`, `grbl`) for: square profile outside/inside, rectangular pocket with an island, 4-hole peck drill, face mill. Goldens live in `packages/core/test/golden/*.nc`; regenerate only with `bun test --update-snapshots` and review the diff.
- Geometry checks independent of text: parse the emitted G-code with a small reference interpreter (`gcode-interpreter.ts`, test-only helper in `src/cam/testing/`) and assert: final Z never below `-totalDepth`, no cutting move below clearance outside the stock bounds, every `Arc` radius at start equals radius at end within 1e-6, total path length equals `toolpathLength(ir)`.
- Regression tests for each bug in §5.
- Determinism: generating the same program twice yields byte-identical text.
- Property test: for random closed polygons, an outside `Profile` toolpath never enters the polygon (min distance from path to polygon ≥ tool radius − 1e-6).

## 7. Out of scope here

Material removal simulation and collision checking (a later WP; the IR is designed to feed it), 4/5-axis, toolpath optimisation across operations (rapid-order TSP), cloud/AI optimisation (WP8 calls these functions as tools).

## 8. As built

### 8.1 Layout and exports

`packages/core/src/index.ts` exports this layer as `cam` (`import { cam } from "@cadcamfun/core"`, or `src/cam/index.ts` directly).

| File | Contents |
| --- | --- |
| `ir.ts` | Move/Toolpath/Program Schemas and types (`Rapid`, `Linear`, `Arc`, `Dwell`, `Comment`, plus `Cycle`), `makeProgram`, `moveTarget`, `moveFeed`, `moveLength`, `arcSweepBetween`, `isFullCircle`, `arcExtrema`, `expandCycle`, `expandMoves`, `toolpathLength` (feed moves only, cycles expanded), `toolpathPathLength`, `toolpathBounds` (arc extrema included), `toolpathMinZ`, `estimateTime`, `validate` (travel incl. arc extrema, feed, spindle, missing tool), `decode/encodeToolpath/Program` |
| `tool.ts` | `ToolSchema`, `StockSchema`, `toolRadius`, `radiusAtDepth`, `stockBounds`, decoders |
| `params.ts` | `OperationFields`, `withDefault` (default only for a *missing* field), `heightsOrdered`, `passDepths` (throws `RangeError` on non-positive/non-finite input), `levelsOf` |
| `path.ts` | Planar `Path`/`Seg` (lines and arcs): length, reverse, rotate start, slice, tangents, `circlePath`, `pathFromPoints` |
| `arc-fit.ts` | `circumcentre`, `radialResidual`, `fitArcs` |
| `geometry.ts` | `GeometryInput`, `sourcesOf`, `contoursOf`, `regionOf` (boundary + islands), `pointInRing`, `distanceToChain`, `nearestNeighbourOrder` |
| `operations/` | `ProfileParams`/`generateProfile`, `PocketParams`/`generatePocket`, `DrillParams`/`generateDrill`, `FaceParams`/`generateFace`, `EngraveParams`/`generateEngrave` (each also as `Profile = { Params, generate }` etc.), plus `MoveBuilder` and the shared entry/ramp/helix/tab helpers in `common.ts` |
| `post/` | `emitProgram`, `Post`, `PostOptions`, `defaultPostOptions`, `posts` (`generic`, `fanuc`, `grbl`), `getPost`, dialect objects, `formatNumber`, `sanitizeComment`, `toolNumbers` |
| `testing/gcode-interpreter.ts` | `interpretGcode` (test-only; exported as `cam.testing`) |

### 8.2 Semantics

- **Z convention**: the stock top is `stock.origin.z` (normally 0); a pass depth `d` cuts at `topZ - d`; `totalDepth` and `stepdown` are validated `> 0` and finite in the Schema (`Schema.Class`, with a cross-field check `clearanceHeight >= safeHeight >= retractHeight`). Heights below the stock top are clamped to it, so a rapid never ends in the material.
- **Defaults** (`withDefault`): clearance 10, safe 5, retract 2, feed 800, plunge feed 300, spindle 10000 rpm, coolant off. They apply only when the field is absent; an explicit `0` is kept.
- **IR extension**: `Cycle { cycle: "drill" | "dwell" | "peck" | "chipBreak", to, feed, peckDepth, dwellSeconds, retractHeight }` keeps drilling intent in the IR. `expandCycle` defines its plain-move expansion (pecks are measured from the R plane; a peck cycle rapids back to 0.5 mm above the last depth, a chip-break cycle retracts 0.5 mm); the same expansion defines its cut length.
- **Profile**: `outside`/`inside`/`onLine` on closed contours (outside is the right of travel for open ones); climb milling assumes a clockwise spindle (material on the left of travel: counter-clockwise around outside contours, clockwise around inside ones). Joins are mitres up to ratio 2, then round (never closer than the tool radius). Circles and arcs stay exact `G2/G3`; polylines only become arcs with `arcFit` (radial residual and chord sag both within `tolerance`). Lead-ins: `direct`, `ramp` (angle-limited laps/zig-zag), `helix` (`ceil(depth/pitch)` full circles, falls back to `ramp` when it does not fit), `arc` (tangent quarter circle in and out, falls back to `direct`). Closed contours step down along the path between passes; open ones lift, reposition and re-enter. Tabs leave `height` of material over `width` mm of path centred at `position` (0..1).
- **Pocket**: contour-parallel offsets of boundary plus islands (all rings offset in one pass), inside-out by default (`order`), `stepover` in percent of the diameter, final finer offset so no band wider than the tool is left, stepover links stay at depth when the straight link is on tool-centre ground, `entry` = `helix | ramp | plunge`, optional `finishPass` with `allowance > 0`. Deeper passes revisit the same XY chains.
- **Drill**: nearest-neighbour order from the origin, `Cycle` per hole (`peck`, `chipBreak`, `dwell` select the cycle). **Face**: zig-zag rows (`stepover` %, `overshoot`, `alongX`) over the stock top or a given box; plunges and stepovers happen outside the stock. **Engrave**: constant-depth path following, closed paths lapped, open paths run back and forth.
- **Posts**: one emitter, three dialects. `PostOptions` fields as in section 4 with defaults `{ decimals: 3, useCannedCycles: true, arcMode: "ijk", header: true, tolerance: 0.01 }`; `emit(program, options?)` takes a partial. Modal state (motion mode, rounded position, feed, cycle words) is tracked while writing; moves that do not move after rounding are skipped without changing modal state; arcs always write `X Y I J` explicitly (`I`/`J` relative to the rounded start point). `generic`: canned cycles, seconds dwell; `fanuc`: `%`/`O` wrapper, safe start block, `G43 H<n>` after `T<n> M6`, millisecond dwell, upper-case comments; `grbl`: no `M6` (later tools pause with `M0`), no canned cycles, `M2`. Tool numbers: numeric tool ids are used as numbers, otherwise numbering follows first use. Unknown arc modes fall back `ijk` to `radius` to `linearize`. `inch` programs convert coordinates, `I/J/R` and feeds at the post.
- **Reference interpreter**: replays `G0 G1 G2 G3 G4 G17 G20/G21 G90 G98/G99 G73 G81 G82 G83 G80` (and accepts `G40 G43 G49 G54-G59 G94`) into plain segments with radii, lengths, minimum Z and M-codes; anything else with a motion effect is reported in `errors`.

### 8.3 Tests

Safety hardening contract:
- `expandCycle` and post emission reject invalid cycles with `RangeError`: coordinates/retract/feed/peck/dwell must be finite, feed positive, increments/dwell non-negative, and hole bottom strictly below the retract plane. Peck/chip-break expansion is bounded to 100,000 pecks and rejects increments that cannot make numeric progress. A zero peck retains the existing single-peck fallback.
- Cycle expansion raises Z to at least the R plane before lateral positioning when starting below R. Canned emission performs the same protective lift. Every `Cycle` emits an executable block even at an identical hole; previously emitted cycle dwell `P` is explicitly reset to zero when requested (`G82` always initializes `P`).
- Post emission rejects arcs with unknown starts, non-finite geometry/feed, non-positive radius/feed, or start/end radius mismatch greater than 1e-6 mm with `RangeError`, rather than substituting a straight cut. Non-full arcs whose XY endpoints collapse at output precision are linearized rather than emitted as unintended full circles.
- These checks are not stock, fixture, tool-envelope or machine-coordinate collision certification; `validate` still requires a supplied machine profile and is not automatically run by the post.

Audit limitations remaining for commercial machine release: `validate` assumes structurally valid program/machine input and does not fail closed on every non-finite field; posts lack comprehensive output-precision/options validation and controller-specific rounded-arc certification. Tool changes and initial positioning need machine-specific safe retract/parking procedures, homing/work-offset verification and tool-length validation. The R-plane lift prevents the identified below-R lateral traverse but does not prove R clears stock or fixtures. Text-level advanced post-processing is a separate surface not certified by this hardening. Material-removal/fixture collision simulation and real-controller acceptance remain required.

`packages/core/test/cam/`: `ir`, `profile`, `pocket`, `drill-face-engrave`, `post`, `golden`, `regressions` (one block per legacy bug, numbered as in section 5), `path-and-interpreter`. Goldens: `packages/core/test/golden/{generic,fanuc,grbl}-{profile-outside,profile-inside,pocket-island,drill-peck,face}.nc`. Regenerate with `UPDATE_GOLDEN=1 bun test packages/core` and review the diff (Bun 1.4 does not expose `--update-snapshots` to the test process, so the spec's flag is replaced by this variable).

### 8.4 Changes made to WP1 for this work

`offsetRings`/`offsetPolyline` were rewritten (see `03-core-cad.md`): CAM needs correct trimming, islands and a no-gouge round join.

## 10. Toolpath verification (`verify/*.ts`)

`cam.verify.verifyToolpath(request)` replays G-code text or a Toolpath IR `Program` against a stock model and reports what the program does to it. Pure and deterministic; nothing here reads a store, a file or the clock.

- **Stock model** (`heightfield.ts`): a height field with one column per cell (a dexel model). Exact for 3-axis work, where a vertical tool can only lower a column. The grid divides the stock box evenly; the cell defaults to a tenth of the tool diameter and is coarsened (with a `ResolutionCoarsened` info issue) to stay inside the cell, sample and work budgets (`MAX_CELLS`, `MAX_SAMPLES`, `WORK_BUDGET`).
- **Tool model** (`tool-model.ts`): coaxial zones from the tip: flutes (flat, ball, bull-nose, V and drill-point profiles), shank, holder. Shank and holder are modelled only when `cuttingLength` / `holderDiameter` are given; an unknown holder never produces a collision.
- **Path** (`path.ts`): lines, arcs and helices are sampled every cell (and every `4 x cell` of vertical travel), canned cycles come from the reference interpreter or `expandCycle`.
- **Findings** (each carries severity, first line, first point, count): `RapidInMaterial`, `ShankCollision`, `HolderCollision`, `FixtureCollision` (box fixtures against every tool zone), `BelowStock`, `InterpreterWarning`, `InvalidInput`. Shank and holder are checked against the stock *before* a sample cuts, because the flutes are about to remove the column the shank must clear.
- **Target** (optional `target.solids`, rasterised from `meshOf`): `Gouge` (error) when a column is cut below the finished part by more than `tolerance`, `UncutStock` (info) for what is left above it. Comparison allows one cell of lateral slack, so quantised walls do not produce false gouges; the price is that a gouge shallower than `tolerance` or narrower than a cell can be missed.
- **Result**: `ok` (no error issue), `issues`, `stats` (removed / remaining volume, engaged vs air-cut feed length, gouge and uncut volumes), and a block-averaged `preview` height map (at most 64 cells on the longer side) for display.
- `request.ts` builds a request from a generator request (`verifyRequestFor`): the tool from the settings, the stock box from the stock and the origin section, a box around the toolpath when there is no stock. Milling only.

Limits, stated so they are not mistaken for guarantees: 3-axis height-field model (no undercuts, no 4/5-axis), one tool per run, box stock and box fixtures, the interpreter's G-code subset. A clean report is evidence about the modelled tool, stock and fixtures at the reported resolution, not a machine certification.

## 11. Machines, axes and zeros (`machine.ts`, `generator/probe.ts`)

Programs are written as the TOOL moving round a fixed workpiece (ISO 841). `KINEMATICS` is the single table of what each machine is: **mill** (the tool rotates; X Y Z; Z0 is the stock top and cuts are negative Z; G17), **lathe** (the workpiece rotates; X is a diameter, Z along the spindle with +Z away from the chuck and the stock at negative Z behind the finished face; no Y; G18), **3D printer** (nothing rotates; X Y plate, Z the layer height which only grows, E the filament; additive). `cadToLathe` / `cadToMachine` map drawing coordinates to those axes; `ORIGINS` lists the zeros each machine offers.

- `checkAxes(gcode, kind)` reports what is illogical for the machine: a Y word on a lathe, X through the axis, cutting away from the chuck, a cut with the spindle off, an extruder word on a mill, cold extrusion, a build that goes down, the wrong plane. Static; the verification stays mill-only.
- Fixed in the generator because the check showed them: lathe turning, internal turning, threading, grooving, parting and knurling now feed towards the chuck (-Z; they used to go the other way); a counter-clockwise spindle is `M4`; a printed part is set down on the plate (bottom at Z0, first layer one layer height up) and centred, instead of being printed at its CAD coordinates (which put parts below the bed), and a part larger than the plate is reported.
- Zeros: mill `workOffset` G54..G59 (G54 is the control's default and is not written) and `originType`; lathe `latheZero` face | chuck (Z shifted by the stock length, direction unchanged); printer `bedOrigin` corner | centre with `bedWidth`, `bedDepth`, `centerOnBed`.
- **Probing** (mill, `operationType: "probing"`, `toolType: "probe" | "toolsetter"`): the spindle stays off; cycles `zSurface`, `edgeX`, `edgeY`, `corner`, `bore`, `boss`, `toolLength`; the stylus is a ball (contact is half a tip diameter before the surface, corrected by every cycle); the result is written to the work offset. Dialects: `linuxcnc` (`G38.2`, `G10 L20 P<n>`) and `fanuc` (`G31`, macro variables of the offset). Bore and boss take four touches and give the centre and the measured diameter.

Design counterpart: `cad/design.ts` holds `DESIGN_SPACE` (right-handed, Z up, XY ground plane, solids placed by their centre, element `rotation` in DEGREES, arc and revolution angles in RADIANS, each solid's own axis) and `checkModel` (non-finite or non-positive sizes, features under the drawing tolerance, rotation typed in radians, boolean operands, duplicates, floating parts, parts outside the stock). `cad/tolerance.ts` holds the drawing tolerance maths (`segmentsFor`, `chordError`).

## 9. Change log

- Manufacturing setup contract: `setup.ts` defines rigid right-handed work frames, revisioned stock/fixtures/tool assemblies and pure world/work point conversions. `validateSetup` reports finite geometry, orthonormal frame, unique tool/fixture identifiers and clearance-envelope errors. All geometry uses mm; the frame maps work coordinates to world coordinates. This is setup validation, not collision certification. Public functions are exported through the CAM barrel.

- v1: initial spec incl. legacy bug list.
- v2: WP2 implemented; status set to done. Added the as-built section: IR `Cycle` extension, operations, posts (`generic`, `fanuc`, `grbl`), reference interpreter, goldens (`UPDATE_GOLDEN=1` instead of `--update-snapshots`), regression tests per legacy bug, and the deviations listed above (`linuxcnc`/`haas` not implemented, `useCannedCycles` defaults to true, `emit` takes partial options).
- v3: Safety audit: document fail-closed arc/cycle emission, bounded peck expansion, R-plane positioning, repeated-hole execution and modal dwell reset before implementation. Regression tests stay inside the WP2-owned source directory.
- v3 verification: `bun test packages/core` passed (573 tests, 0 failures, 275451 assertions); `bunx tsc -p packages/core/tsconfig.json --noEmit` exited 0. Existing test assertions and all golden files remain unchanged; `src/cam/safety.test.ts` adds 11 targeted safety tests. No cross-WP edits.
- v4: Added §10 toolpath verification (`cam.verify`): height-field stock removal, rapid / shank / holder / fixture / below-stock findings, gouge and uncut stock against `target.solids`, a display preview, and the generator bridge. Exposed as `POST /api/toolpaths/verify`, the AI tool `cam_verify_toolpath` and the desktop "Verify" tab.
- v5: Added §11 machines, axes and zeros (kinematics table, axis consistency check, probing cycles, work offsets, per-machine origins) and the design-space counterpart; corrected the lathe axis senses, the lathe spindle word and the printer placement.
