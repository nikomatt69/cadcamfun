# WP2 — CAM and G-code core (`packages/core/src/cam`)

Status: **done; targeted cycle/arc safety hardening verified** (IR, five operations, `generic`/`fanuc`/`grbl` posts with modal emission, reference interpreter, goldens and a regression test per legacy bug; `linuxcnc` and `haas` are reserved ids, not implemented). Owner dir: `packages/core/src/cam`. Depends on WP1 types (`Vec2`, `Vec3`, `Entity`, `tessellate`, `offsetPolyline`) — import them from `../cad/index.ts`; until WP1 lands, code against the interfaces in `03-core-cad.md`.

## Parametric machining continuation contract (2026-10-13)

WP2 derives drilling, contour, pocket, thread and external turning paths from WP1 feature history. Selected turning uses the revolution envelope in diameter X / negative axial Z, grows inferred stock to contain the part, and retracts radially before axial travel. Unsupported selected turning profiles fail explicitly. Mill program clearance follows the stock top. Surface roughing preserves its reachable regions and ramp-angle limits while avoiding entry on near-collapsed offset loops. WP8 exposes deterministic plan validation and revision-bound review through existing CAM actions; WP4 owns project reads and persisted verification evidence. No CAD kernel changes, commits or roadmap completion are included.

Pure and I/O-free, same rules as WP1.

## Additive height and coverage contract (2026-10-24)

WP2's owner-requested printing increment deepens `cam/print` and the printer kernel adapter.
Layer tops must end at the placed model's exact height; a non-integral last layer and a part
thinner than the requested first layer must not be discarded. The layer's actual thickness
drives slicing planes and extrusion volume. If the final remainder is below 0.04 mm,
redistribute the last two layers rather than emitting a sub-resolution tail; keep the
last layer at or below the requested layer height. The nominal profile remains the request.
Wall coverage and spill checks must inspect every model layer, including isolated missing
layers between previously sampled planes. Coverage evidence must state its raster resolution
and checked layer count. These checks remain planar deposition evidence; they do not claim
volumetric support, thermal or mechanical certification. No RM completion is implied.

## Additive NC replay contract (2026-10-24)

The print verification module must use the shared reference interpreter for machine motion
and E semantics (modal/relative motion, coordinate resets and units), rather than a second
motion parser. Its two adapters are the generator and the native printer kernel; the layer
preview also consumes its bead replay. The interface accepts the authoritative layer tops
and thicknesses separately from NC annotations. Comments may name a feature for display but
cannot move a bead to another height or supply its extrusion volume. Unknown NC instructions
must prevent a passed replay claim. Arc deposition is replayed with a stated chord bound.
Plate/build-envelope checks include non-extruding travel, and startup evidence requires
explicit homing plus nozzle/required-bed temperature waits before deposition. Custom opaque
macros are not evidence of completed homing or heating. This is commanded-state evidence,
not a temperature-sensor or physical machine qualification.

## Current-source kernel completion (2026-10-22)

## Additive source-mesh contract (2026-10-24)

WP2's print module validates every supplied mesh before numeric coercion, placement, union,
orientation or slicing. Coordinates must form finite XYZ triples; indices must form complete
triangles of non-negative in-range integers, including when a valid mesh is supplied beside
an invalid one. Serialized mesh vertices/faces and element/container transforms must not
silently default malformed data or discard malformed faces. Errors refuse the whole requested
print in both plan and execution with `InvalidInput`; the generator returns its existing
explicit error result. Validation never returns a program for only the valid subset.

The source must be a closed orientable manifold of non-zero finite volume. Reuse WP1 topology
and point welding for diagnostics at an explicit 1e-7 mm vertex coincidence tolerance, without
changing the source coordinates or filling openings. A whole inside-out closed shell remains
supported by the slicer's documented winding correction. This check does not certify absence
of geometric self-intersections. WP1's topology interface accepts read-only array-like doubles
without Float32 narrowing; existing CAD behavior and callers remain unchanged.

The owner accepted spec 33's **Owner-authorized completion increment**. WP2 owns K0 final release consistency and K4–K6
multiaxis execution, shared stock/quality evidence and turning/mill-turn in `cam/` and its tests. Collect machine-capacity
errors before claims/release; a hard error cannot yield a verified artifact. Preserve existing NC behavior unless an
explicitly tested correction requires changing it. The current tolerance budget remains informational until K5's contract
is amended across its consumers; blocking all existing jobs is not completion of precision verification. Track verified
progress and open deliverables in spec 33. This concrete kernel continuation does not change global RM statuses.

K4's first execution increment adds optional `mode: "parallel" | "contour"` to the existing multiaxis operation. Omission
retains parallel generation and existing NC. The operation schema, manufacturing HTTP request and assistant request reuse
the same strategy schema; invalid modes fail decoding. Artifact operation parameters record the resolved mode. Contours
must retract across missing/unreachable contact samples instead of joining their neighbours through an unchecked gap.
Skipped required samples remain visible as unresolved part coverage. General 3D contact, path-level collision planning,
head machines and shared volumetric evidence remain separate open acceptance gates in K4/K5.

## Kernel performance and AI responsiveness (2026-10-21, implemented; full-suite verification in progress)

Optimize measured hot paths without reducing sampling resolution, changing cutter geometry, tolerances, NC bytes or verification evidence. The drop-cutter may seed its branch-and-bound search with an actual nearby column; every rejection must retain the existing conservative bound. Verify against exhaustive footprint evaluation and complete pre-change manufacturing artifacts. WP8 owns bounded automatic recovery and provider inactivity deadlines; integration may move kernel preparation off the sidecar event loop through the existing scoped worker. Regression gates include the full repository test suite.

## CAM kernel licensing contract (2026-10-21)

The owner requests proprietary licensing for the CAM kernel, with use and
distribution permitted only by written authorization from **Nicola Mattioli**.
`packages/core/src/cam/LICENSE` records those terms for the licensor-owned CAM
source and its compiled forms; a local `README.md` makes the scope discoverable.
This change is limited to WP2 documentation: the repository root license,
third-party licenses, runtime behavior and package-wide metadata remain unchanged.
The terms preserve mandatory legal exceptions and do not claim ownership of user
models, generated toolpaths/G-code or machined parts merely through kernel use.

## Native CAM kernel architecture contract (2026-10-13)

[Spec 29](29-native-cam-kernel.md) defines the owner-requested deep CAM kernel: immutable manufacturing snapshots, authoritative CAD geometry through native B-rep/mesh Adapters, stock lineage shared across operations, separate cutter-location/machine/controller motion, continuous assembly collision checks, independent replay of final NC bytes and capability-specific release evidence. It records the current Implementation's limits and the degree-to-radian compatibility Seam. Status: design only; the existing exports, generation behavior and acceptance results remain as recorded below. Implementation follows the existing owner scopes and ordered-step prerequisites; this contract does not mark a professional kernel as built.

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
- Geometry checks independent of text: parse the emitted G-code with a small reference interpreter (`gcode-interpreter.ts`, test-only helper in `features/cam/testing/`) and assert: final Z never below `-totalDepth`, no cutting move below clearance outside the stock bounds, every `Arc` radius at start equals radius at end within 1e-6, total path length equals `toolpathLength(ir)`.
- Regression tests for each bug in §5.
- Determinism: generating the same program twice yields byte-identical text.
- Property test: for random closed polygons, an outside `Profile` toolpath never enters the polygon (min distance from path to polygon ≥ tool radius − 1e-6).

## 7. Out of scope here

Material removal simulation and collision checking (a later WP; the IR is designed to feed it), 4/5-axis, toolpath optimisation across operations (rapid-order TSP), cloud/AI optimisation (WP8 calls these functions as tools).

## 8. As built

### 8.1 Layout and exports

`packages/core/src/index.ts` exports this layer as `cam` (`import { cam } from "@cadcamfun/core"`, or `features/cam/index.ts` directly).

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

## 12. 3D surface machining (`model/*`, `operations/surface*.ts`, `generator/surface.ts`)

The `3d_surface` operation no longer follows each element's outline: the selected solids are one **part model** and the strategies work from the finished shape.

- **Model** (`model/`): every solid element is meshed (`element-mesh.ts`, same axis conventions as `createThreeObject`, chord tolerance from the settings), dropped into a Z-dexel grid (`dexel.ts`; booleans are interval algebra, so undercuts, holes and union/subtract/intersect results are exact) and reduced to a height field. The grid cell comes from the tolerance and the tool and is coarsened when the part would need more than 1.5 M columns (a warning says so).
- **Drop-cutter** (`Surface.tip`): the lowest tip height at (x, y) with no part of the cutter (flat, ball, corner radius, V-bit) inside the part; never lower than the true surface (conservative by half a cell). A stock-to-leave `allowance` grows the cutter in every direction. **Contours** are marching squares with bisection refinement; loops nest into regions with islands.
- **Strategies** (`SurfaceParams.strategy`): `roughing` clears Z level by level (the region the tool centre may occupy is exact, cleared with the pocket engine, helix/ramp entry, islands), `parallel` is a raster at `angle` (zig-zag or one way; line spacing from `stepover`, or from the cusp height `scallop` for a ball cutter: `s = 2 sqrt(2Rh - h^2)`), `waterline` is the constant-Z contour of the surface, `rest` (`operations/rest.ts`) clears only what a previous, larger tool (`restFrom`: diameter, kind, tip radius, allowance) left at the same Z levels: a tool centre is visited only when its disc comes within the tool radius of unswept material (exact Euclidean distance transform over the contour grid; the swept area is the previous tool's allowed centres widened by its radius). Material thinner than two model cells is below the resolution of the part model and is left for the finishing pass. Roughing and rest clear each region with `clearing`: `contour` (the pocket engine) or `adaptive` (`operations/adaptive.ts`): the stock in process is a raster, the centre line of every pass is the exact level set `distance to uncut stock = R - ae` of its Euclidean distance transform (marching squares), cut where the centre may not go and cut, then the stock is updated and the next pass lies one `ae` nearer the walls. The radial depth of cut is held at `engagement` % of the tool diameter by construction, around islands and walls alike; a last pass along the region's edge takes stock thinner than a pass. A rest pass hands it only the stock the previous tool left (`material`) and peels it from free air, without a helix. Verified on a 24 mm pocket (no centre leaves the region, 0.1 % of the reachable material left, no move near a full slot; the contour-parallel pocket cuts a strip 1.5x wider at the 90th percentile and a full slot in the corners), around an island, through the verifier on a boss (no gouge), and for rest on the inside corner. Cost: 0.45 s for 30 x 30 mm, 5.4 s for 120 x 120 mm per level. Proven against an analytic sphere, by `cam.verify` (no gouge), and for `rest` on an inside corner between two walls: no centre enters a wall, every unswept point the small tool can reach is covered, and the path stays near the corner.
- **Generator** (`generator/surface.ts`, called from `selectedToolpath`): solids are placed on the stock like any element and cut as one part; elements that are not solids keep their per-element outline path. Settings: `surfaceStrategy` (roughing|parallel|waterline), `scallop`, `rasterAngle`, `rasterOneWay`, `surfaceClearing` (contour|adaptive) + `adaptiveEngagement`, `useRestMachining` + `restToolDiameter` (a roughing becomes a `rest` pass; the finishing strategies ignore it and say so); with `finishingPass` a roughing is followed by a real finishing pass (`finishingStrategy` contour = waterline, parallel = raster) and the roughing leaves `finishingAllowance` on the part. A tool that cannot cut a surface (V-bit, drill, ...) is reported and an end mill of the same diameter is used. The engine's moves are written as plain G0/G1/G2/G3.
- **Finishing pass of outline operations** (`contour`, `profile`, `pocket`): pass 1 keeps `finishingAllowance` on the wall (the offset grows by that much), pass 2 cuts the wall to size at the same depth levels; with `offset: center` or an allowance of 0 the program says it was skipped. Only the `contour` strategy exists for outlines (the generator says so for the others).
- UI: the generator panel shows the strategy, angle, cusp height and one-way for `3d_surface`; AI: `cam_create_operation` / `cam_update_operation` document the parameters.
- Not covered: 4/5-axis, tool-holder collision in the strategies (the verifier checks the emitted program), rest machining from a stock model carried between operations (`rest` is computed from the previous tool's geometry, assuming it cut the same Z levels with the same allowance; a previous tool whose levels differ is not modelled), rest finishing (pencil / scallop); adaptive clearing's own limits: the raster resolution (`ae` / 5) bounds how thin a remnant it chases, a sharp corner of the region or an island puts material on several sides at once (the load there is below a full slot, not at `ae`), and the area removed per length reads above `ae` on rings that cut outward.

## 13. Rest finishing, thread milling and indexed (3+2) machining

- **Rest finishing / pencil** (`operations/surface.ts`): `parallel` and `waterline` with `restFrom` follow the new tool's own drop-cutter path, kept only where the previous tool's path is higher than it by more than `restThreshold` (default 0.02 mm). After a larger ball this is pencil machining: the creases and fillets the big ball bridged. Pieces are open paths and the tool lifts between them. Generator: `useRestMachining` with a finishing `surfaceStrategy` (the previous tool is `restToolDiameter`, a ball when the current tool is a ball).
- **Thread milling** (`operations/thread.ts`, generator `threading` on a mill, which used to fall back to a contour with a note): a helix round a hole (internal) or a boss (external), one pitch of Z per revolution, ISO metric depths (`H1 = 0.54127 P` internal, `h3 = 0.61343 P` external), radial passes from the minor diameter to the full depth plus optional spring passes, right- or left-hand, climb or conventional (which decides the direction round; the hand decides rising or descending), a tangent entry (a half circle inside a hole, an S-curve outside a boss) and exit, and the feed scaled from the cutter's centre to its edge. The cutter must fit the minor diameter of an internal thread.
- **Indexed (3+2)** (`indexing.ts`, `Orient` move in the IR, emitted as a rotary `G0 A.. B.. C..`): an operation is made on a tilted `WorkFrame`; `indexToolpath` turns the frame's z axis into trunnion-table angles (`table-AC`: C about Z then A tilt about X; `table-BC`: C then B about Y; each normal has two solutions, the smaller tilt inside the limits is taken) and carries every point from the work frame through the part to machine coordinates (`R (part - pivot) + pivot`). Because R lays the work plane horizontal, arcs stay arcs in G17, helices stay helices and a drilling cycle still runs down machine Z. Not covered: a head that tilts (the pivot then moves with the tool length), tilted-plane controller cycles (G68.2, CYCLE800), RTCP, and simultaneous 5-axis; `cam.verify` skips `Orient`, so a verification must be given the stock in machine coordinates.

## 9. Change log

- 2026-10-24: additive NC replay increment implemented. Beads and travel now use the shared
  interpreter; authoritative layer slabs replace NC HEIGHT/LAYER annotations as geometric
  evidence. Added explicit print-dialect, heater-wait/homing, travel-envelope and bead-width
  checks, bounded arc replay, physical deposition-speed claims, inch-E conversion and missing
  geometry uncertainty. Fixed start-mode ordering, relative-E rounding drift, first positioning
  without priming and the end lift at build height. Printing regressions pass 91 tests;
  generator/HTTP/desktop integration passes 93 tests; numeric/view regressions pass 62 tests.
  Core typecheck passes. Full enterprise qualification remains open in spec 33 §9.12.

- 2026-10-24: printing correctness increment: final slabs and thin first layers retain the
  model height, actual thickness drives extrusion, wall/spill evidence inspects every model
  layer, diagonal clipping includes corner intersections, and model-bead volume evidence
  excludes startup priming. Removed a conflicting namespace import in the existing generator
  tests and made the default nozzle-to-layer calculation stable at 0.3 mm. Verification
  results are recorded in spec 33 §9.11; this does not close the full additive evidence scope.

- 2026-10-22: K5 first seed and K6 boring preview (the evidence is recorded in spec 33's ledger). A rotary replay seeds its voxel stock from the three-axis height field; the carry only tightens the bracket and a three-axis-only job still has no voxel bracket. `planBoring` opens a declared pilot to a finished internal profile with analytic volumes and stays `preview`; it is not a job operation. Verification: `packages/core/src/cam/kernel/{stock,rest-stock,turning,five-axis-job}.test.ts` (36 tests).

- 2026-10-22: spec 33's owner-authorized completion increment, K0 and the first increment of K4
  (the evidence is recorded in spec 33's ledger). K0: the magazine-capacity error is collected
  before the claims and the release assessment, so a program that needs more tools than the
  machine's magazine holds returns `release: "blocked"` and a failed `machine-limits` claim
  naming the magazine; a hard error can no longer coexist with a verified artifact. K4: the
  multiaxis operation takes an explicit `mode: "parallel" | "contour"` from the shared operation
  schema through the HTTP and assistant contracts into the kernel — omitting it keeps the
  previous parallel generation and the same NC bytes, the two modes produce distinct NC, and an
  unknown mode fails decoding; the contour strategy retracts across an unreachable interval
  instead of joining the reachable samples through it, and required contact samples that were
  unreachable or never cleared the part are counted and make `part-coverage` unresolved, so a
  program with uncovered regions cannot read as complete coverage. Verification:
  `packages/core/src/cam/kernel/{five-axis-job,machine-claims}.test.ts`,
  `packages/core/test/cam/five-axis.test.ts`, `apps/sidecar/test/cam-kernel.test.ts`, the core
  suite and the workspace typecheck.

- 2026-10-22: added the 3D-printing parity analysis to [spec 33](33-kernel-gap-analysis.md) §9: the printer is
  at parity in the layers that describe a machine and draw one (machine table, tool model, program checks,
  viewer, 3D viewport, CAD manufacturability) and absent in the layers that make one (native kernel,
  additive stock, verification replay). The ledger (P0–P24) is the inventory the follow-up work is ordered
  from. Analysis only: no code, contract, runtime or roadmap change.

- 2026-10-21: documented the owner-requested proprietary CAM kernel license,
  naming Nicola Mattioli as licensor; added scoped license and discovery notice
  under `packages/core/src/cam`. No executable code or root license changes.

- 2026-10-13: added the native CAM kernel contract in [spec 29](29-native-cam-kernel.md): geometry/stock/motion/controller Seams, capability-specific quality and final-NC evidence, legacy conversion Adapters, migration gates and independent acceptance fixtures. Design only; existing runtime behavior and implementation statuses are unchanged.

- 2026-10-13: integrated the parametric-machining worktree with the current named work-plane history contract.
  Turning feature extraction explicitly reports unsupported custom work planes instead of indexing the three
  principal-plane frames with an arbitrary plane reference. A regression crosses `historyFeatures` with a
  real tilted-plane revolution. Existing local CAD/drawing changes are preserved.

- Manufacturing setup contract: `setup.ts` defines rigid right-handed work frames, revisioned stock/fixtures/tool assemblies and pure world/work point conversions. `validateSetup` reports finite geometry, orthonormal frame, unique tool/fixture identifiers and clearance-envelope errors. All geometry uses mm; the frame maps work coordinates to world coordinates. This is setup validation, not collision certification. Public functions are exported through the CAM barrel.

- v1: initial spec incl. legacy bug list.
- v2: WP2 implemented; status set to done. Added the as-built section: IR `Cycle` extension, operations, posts (`generic`, `fanuc`, `grbl`), reference interpreter, goldens (`UPDATE_GOLDEN=1` instead of `--update-snapshots`), regression tests per legacy bug, and the deviations listed above (`linuxcnc`/`haas` not implemented, `useCannedCycles` defaults to true, `emit` takes partial options).
- v3: Safety audit: document fail-closed arc/cycle emission, bounded peck expansion, R-plane positioning, repeated-hole execution and modal dwell reset before implementation. Regression tests stay inside the WP2-owned source directory.
- v3 verification: `bun test packages/core` passed (573 tests, 0 failures, 275451 assertions); `bunx tsc -p packages/core/tsconfig.json --noEmit` exited 0. Existing test assertions and all golden files remain unchanged; `features/cam/safety.test.ts` adds 11 targeted safety tests. No cross-WP edits.
- v4: Added §10 toolpath verification (`cam.verify`): height-field stock removal, rapid / shank / holder / fixture / below-stock findings, gouge and uncut stock against `target.solids`, a display preview, and the generator bridge. Exposed as `POST /api/toolpaths/verify`, the AI tool `cam_verify_toolpath` and the desktop "Verify" tab.
- v5: Added §11 machines, axes and zeros (kinematics table, axis consistency check, probing cycles, work offsets, per-machine origins) and the design-space counterpart; corrected the lathe axis senses, the lathe spindle word and the printer placement.
- v6.1: Added §13 (rest finishing, thread milling replacing the contour fallback, indexed 3+2 with the `Orient` move).
- v6: Wired the generator's `useAdaptiveFeeds` (it was a checkbox connected to nothing): `adaptFeeds` slows the feed into and out of corners (linearly from 15 degrees to half at 90) and on curves tighter than 1.5 tool diameters (never below 40 %), leaving rapids, vertical moves and helical entries alone; mill only.
- v6: Added adaptive (engagement-bounded) clearing for surface roughing and rest, `clearing` / `engagement`, and the generator's `surfaceClearing` / `adaptiveEngagement`.
- v6: Added `rest` surface strategy (rest roughing from a previous tool) and wired the generator's `useRestMachining`, which previously was a checkbox connected to nothing.
- v6: Added §12 3D surface machining (part model from solids, drop-cutter, roughing / parallel / waterline strategies, generator integration, real finishing pass for outlines and surfaces).

## Oriented manual setups (2026-10-19)

Status: implemented; verification tracked in [spec 34](34-oriented-cam-setups.md). The native kernel accepts six CAD directions facing the spindle, rotates meshes/stock/exact features together and emits a separate three-axis program. Lateral/bottom workholding and full-part coverage remain unresolved. Downward-facing triangles above the underside prevent height-field replay from certifying hidden surfaces, including explicit-operation jobs. This does not implement rotary helical machining or certify multi-setup stock transfer.

Change log: 2026-10-19 — added manual setup orientation across the existing kernel/snapshot interface and evidence for inaccessible surfaces; global RM statuses unchanged.

### Open CAD surface exclusion (2026-10-21)

The spec 33 CAD increment owns a single guard in `model/element-mesh.ts` and its test: an explicitly open B-rep surface is not a volume part model. Desktop rendering uses its B-rep tessellation independently. This guard prevents a curved patch from becoming a fictitious stock/part volume. CAM implementation and other viewer changes remain outside the increment.

### External turning preview continuation (2026-10-21)

- Owners: WP2 native CAM, WP3 action schemas, WP4 AI handler storage, WP6 CAM result mirroring, WP8 catalogue and machine replay, under spec 29's turning continuation contract.
- `kernel/turning.ts` exports `planTurning`: face skim, diameter-bounded external roughing, profile finishing, piecewise-linear stock snapshots and analytic volume accounting including the untouched bar tail. Taper intersections are retained, invalid/non-finite profiles and excessive pass counts are refused, and NC returns axially only after radial clearance of the original bar. G94/G97 explicitly select feed/minute and fixed RPM.
- This is an ideal point-tool preview; insert compensation, workholding, grooves, threads, parting and controller qualification are not certified. Internal boring is the separate preview below. The analytic volume is before NC rounding, and every successful result remains `preview`.
- `cam.turn` reads the external plan, `cam_edit.turn` stores the same NC and settings in the existing portable CAM document, and the desktop mirrors it into its lathe viewer. `cam.review` reports preview/stale; `cam.machine` uses stored stock settings and the shared B-head/C-spindle poses, tool models, limits and chuck phase. Positioned-C milling does not remove an entire annular band in the assistant's turned profile.
- Evidence: `kernel/turning.test.ts`, `packages/ai/test/{cam-kernel-actions,cam-wire,machine-kinematics}.test.ts`, `apps/sidecar/test/ai-turning.test.ts`, and the turning persistence/mirroring case in `apps/desktop/test/cam-kernel.test.ts`.

### Internal boring preview and rotary stock seed (2026-10-22)

- `kernel/turning.ts` exports `planBoring`: a declared pilot is opened out to a finished internal profile. The cavity grows inward, every removed volume is the solid of revolution of the pass, and the worked stock partitions as removed + remaining + unmachined. A finished diameter below the pilot, a bore that breaks out of the bar, an unordered profile, and a bar the chuck cannot hold are refused and emit no NC. The external fixture's NC bytes are unchanged. Release stays `preview`. `planBoring` is not a manufacturing-job operation and is not `cam.turn`. Grooves, threading, parting, insert compensation, live tools and machine qualification stay out of scope.
- A rotary replay on a five-axis machine seeds its voxel stock from the height field the three-axis operations carved (`carryHeightField`). Five-axis moves are not written into that field. The carry only removes: a voxel wholly above every overlapping column is certainly gone, a voxel that only rises above the lowest column in its footprint is possibly gone, and an untouched field leaves the raw box. A three-axis-only job has no voxel bracket. The bracket stays a bracket; turned moves are not gouge-checked, and the tolerance budget stays informational.
- Evidence: `packages/core/src/cam/kernel/turning.test.ts`, `packages/core/src/cam/kernel/stock.test.ts`, `packages/core/src/cam/kernel/rest-stock.test.ts`, `packages/core/src/cam/kernel/five-axis-job.test.ts`.

### Machine catalogue and machine configurations (2026-10-21)

- Owners: WP2 native CAM, WP3 shared schemas, WP4 sidecar routes and AI handlers, WP6 desktop library and CAM panel, WP8 catalogue and prompts, under spec 29's machine catalogue contract.
- `kernel/machines.ts` holds two catalogues: `MACHINES` (milling centres) and `LATHES` (turning and mill-turn centres), together in `MACHINE_CATALOGUE`. A machine carries its `kind` and, for a turning centre, what it holds and turns (bar capacity, chuck, B head range, C spindle, Y travel). The milling kernel refuses a turning centre with the reason; the turning plan bounds the bar and the spindle with the machine it is given.
- New presets with their published sources: KERN Micro HD HSK25 / HSK40 (B/C table, B -110..+110 degrees, continuous C, 50 000 / 42 000 rpm, Heidenhain TNC7 Klartext post), Mazak INTEGREX i-200 class and Okuma MULTUS B300II class mill-turn centres (B -30..+210 / -30..+195 degrees, Y 210 / 160 mm, C continuous / 360 degrees, Ø65 bar), and a plain 2-axis CNC lathe of the class. A published stroke is not a work-coordinate bound; the pivot, the chuck and the datum stay assumptions.
- `kernel/machine-config.ts` is the seam with the library: `kernelMachineOfConfig` makes a saved `MachineConfig` row the machine the kernel plans against, `machineConfigOf` and `DEFAULT_MACHINE_CONFIGS` make the built-in catalogue visible in the Resources library, and `postOfController` maps a controller name to the post that speaks it. A configuration the kernel cannot machine is refused, never guessed.
- `kernel/machine-profile.ts` is the one place that knows the shapes a machine configuration may be written in (the Resources form, the assistant's record, the canonical profile): `profileOfConfig` reads any of them into one `MachineProfile`, `configOfProfile` writes the canonical one back, and the profile carries what the kernel can act on (the spindle and its power curve, the feed, the axes and their travel, the rotary table, the turning data, the work offsets, the accuracy). A field that is absent says "the machine does not say", never a default the kernel would plan against.
- Evidence: `kernel/machine-config.test.ts` (the adapter, the round trip, the refused configurations, the refusal of a turning centre by the milling kernel), `kernel/turning.test.ts` (the bar and the spindle bounds), `packages/ai/test/cam-kernel-actions.test.ts` (the catalogue of machines and the bounded turning plan), `apps/sidecar/test/machine-config-defaults.test.ts` (the built-in rows and the configurations of the library), and the machine case in `apps/desktop/test/cam-kernel.test.ts`.

### Performance change log (2026-10-21)

The drop-cutter seeds its search from an actual column near the tool axis, enabling the existing conservative block rejection immediately. Exhaustive footprint comparisons cover flat/ball/bull/V/drill profiles, allowances, holes, cliffs and non-square cells (1,803 assertions). Block, mounting-plate and dome planning/manufacturing outputs matched the pre-change artifacts byte for byte. `PrepareOptions.stockFromPartBottom` places CAD stock from the unrotated part meshes inside the worker; worker/inline equality covers NC, identity, verification evidence and manual +X setup as well as +Z. Core typecheck passed. Full-suite validation remains in progress.

### 3D printing parity with mill and lathe (2026-10-22, analysis)

[Spec 33](33-kernel-gap-analysis.md) §9 holds the measured inventory. The summary for WP2 (`packages/core/src/cam`):

- **At parity today**: the machine table (`cam/machine.ts`: axes X Y Z E, additive process, plate origin, and the printer-only checks `PRINTER_SPINDLE` / `PRINTER_COLD_EXTRUSION` / `PRINTER_LAYER_DOWN` / `PRINTER_NOT_HOMED`), the tool model (the nozzle family), the viewer and the 3D viewport (beads, layers, progressive deposit), the CAD print-process manufacturability rules, the print-time and material estimates and the bed-fit check.
- **Missing in the native kernel**: the machine kind (`kernel/contracts.ts:32` is `"mill" | "lathe"`), a print strategy, an E axis in the IR (`cam/ir.ts:104-112`), a deposition stock model (`kernel/stock.ts:20-35` is removal-only), deposition material data, printer presets in the catalogue, and a reasoned refusal where the kernel still cannot run a printer (`kernel/machine-config.ts:39-47` returns `undefined` with no message).
- **Missing in the generator**: the six declared printer operations are inert (all six produce byte-identical G-code), the default infill pattern (`grid`) extrudes nothing, the generator's warnings are dropped (`"; WARNING:"` vs the collected `"; Warning:"`), only the first selected element is printed, and a real CAD part falls back to its bounding box.
- **Missing in verification**: `verifyToolOf` is mill-only and every replay check is `not-run` for a printer.
- **Reproduced defects (measured, not read)**: the final retraction asks for E −2 in absolute mode and retracts 28.076 mm instead of 2; a composite declares a placement its children never receive and prints 5 mm above the bed; a part that does not fit the bed still reports `evidence.result = "passed"`; the common optimizer and arc fitter drop extrusion; and the part's rotation and scale are ignored.

No executable change is made by this entry; the remediation order and the owner directories per WP are in spec 33 §9.9.
