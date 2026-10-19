# Machine simulation at Fusion 360 / hyperMILL level: every kinematics, every operation, the right tool

Status: **P1, P2, P3 built**, **P5 built (presets, poses, limits)** (2026-10-20); P4 S1 removal partially implemented (another session); P6–P9 open.
See §9. Analysis written at `main` @ 9aa648c. It extends
[31-machine-aware-toolpath-view](31-machine-aware-toolpath-view.md) (machine scene, motion track, frames, set-up checks) and
[29-native-cam-kernel](29-native-cam-kernel.md) (kinematics, collision, stock); it does not replace them. Owners: WP2
`packages/core/src/cam`, WP7 `apps/desktop/src/viewport/view3d`, WP6 `apps/desktop/src/features/cam`, WP8 `packages/ai`,
mobile follows through the workspace preview payload (spec 13 §6).

## 0. Goal

The owner's request (2026-10-19): *the visualizer must show every kinematics, every machining operation and the right tool
for each operation in 3D, as well as possible: a viewer at the level of Fusion 360 and hyperMILL.*

Measurable meaning, used as the acceptance bar of §7:

1. **Every kinematics**: any program for a supported machine class is drawn on that machine: the axes that move do move, by
   their joint values, within their limits, with the machine bodies that carry them (§1 A).
2. **Every operation**: every operation the generator, the kernel or a post can emit, and every common word of an imported
   program, is replayed as motion (no silently dropped holes, cycles or compensation), and each move reads as what it is
   (rapid, approach, plunge, cut, link, retract, cycle, probe touch) (§1 B, C).
3. **The right tool**: the tool drawn for each operation is the tool that operation uses (its own tool, per toolpath), of a
   shape that can do that operation, with its holder; a tool that cannot do the operation is flagged, never drawn silently
   (§1 D).
4. **Material**: the stock is cut live as the program plays, and the result can be compared with the part (§1 E).
5. **Safety**: collisions of tool, holder and machine bodies with stock, part, fixtures and each other, and axis-limit
   overruns, are found on the same timeline that is drawn and can be jumped to (§1 F).

## 1. Reference: what Fusion 360 and hyperMILL simulators show

Public feature set of Fusion 360 *Simulate / Simulate with machine* and hyperMILL *Machine and material removal simulation*
(hyperMILL VIRTUAL Machining is out of scope: it is a controller-level digital twin).

| # | Capability | Fusion 360 | hyperMILL |
| --- | --- | --- | --- |
| A1 | Machine model: kinematic chain of bodies (base, column, head, trunnion, rotary table, spindle, turret) moved by joint values | yes (machine library, .mch) | yes (machine model per post) |
| A2 | Machine classes: 3-axis VMC, 4-axis (A on X), 5-axis table-table (AC, BC), head-table (B head + C table), head-head (fork), lathe 2-axis, mill-turn (C, Y, B), router gantry | yes | yes |
| A3 | Axis limits, home, travel display (DRO per axis), rotary unwinding, singularity | yes | yes |
| A4 | TCP / TRAORI / tilted planes (G68.2, CYCLE800, PLANE SPATIAL) drawn correctly | yes | yes |
| B1 | Every operation replayed: 2D/3D milling, cycles (drill, peck, tap, bore, back-bore), thread mill, probing, turning cycles, grooving, threading, parting | yes | yes |
| B2 | Cutter compensation (G41/G42) drawn on the compensated path | yes | yes (on post side) |
| C1 | Move classes coloured: rapid, lead-in/out, plunge/ramp, cut, link, retract | yes | yes |
| C2 | Colour by operation, tool, feed, Z level, tool-axis tilt; tool-axis vectors on 5-axis paths | yes | yes |
| C3 | Operation / setup browser: isolate, hide, simulate one operation, a range, a setup | yes | yes |
| C4 | Timeline with operation bands, tool changes, collision markers; step by move, NC line, operation; NC editor sync | yes | yes |
| D1 | Tool library: end mills, ball, bull, tapered, lollipop/undercut, barrel / circle-segment, dovetail, T-slot, thread mill, chamfer, spot, drill, reamer, tap, boring head, face mill, form; lathe ISO inserts + holders; probes | yes | yes (incl. barrel tools) |
| D2 | Holders as real profiles (ER, shrink fit, hydraulic, Weldon, arbor; BT/HSK/CAT taper), gauge length | yes | yes |
| D3 | Tool per operation, holder per tool, tool change shown | yes | yes |
| E1 | Live material removal (3-axis and 5-axis), smooth, at speed | yes | yes |
| E2 | Stock carried across operations and setups (rest stock), stock export | yes | yes |
| E3 | Comparison with the part: gouge / excess colour map, tolerance | yes | yes |
| F1 | Collision: tool shank and holder vs stock/part/fixture; rapids into material | yes | yes |
| F2 | Machine collision: heads, tables, trunnion vs everything; near-miss clearance | yes | yes |
| F3 | Event list, jump to event, stop at collision | yes | yes |
| G1 | Section view, measure, transparency, camera follow tool, machine/part-only view | yes | yes |
| G2 | Performance: millions of moves, live removal at interactive frame rates | yes | yes |

## 2. Current state, measured

### 2.1 What exists (and is good)

- **Machine scene** (spec 31, `viewport/view3d/machine-scene.ts`, `cam/viewer/*`): mill vise / clamps / plate / table, lathe
  chuck, jaws, collet, tailstock, live turned profile, printer bed, build volume, nozzle, progressive beads; RGB triad with
  spindle sense; red segments into the workholding (`checkSetup`, `collidingMoves`); motion track (spindle, CSS, plane, E,
  coolant, line).
- **Rotary pose** (`cam/viewer/rotary.ts`, `view3d.tsx:276`): table-AC / table-BC trunnions, part or machine frame, tool lean
  `R^T·Z`, table group turned about the pivot, angles interpolated per move. Only the flat table box turns: no trunnion
  cradle, no rotary platter, no head. Spec 31 §12 still lists §5.5 as "not done"; it is partly done since e3d0124.
- **Tool models** (`cam/tool-model.ts`): 16 revolved mill shapes (flat, roughing, ball, bull, corner rounding, chamfer,
  engraver, spot, drill, reamer, tapered, face mill, thread mill, disc, dovetail, boring bar), probe, setter, 7 lathe insert
  outlines, nozzle; per-toolpath models in playback (`toolGroupFor`), assumed holder translucent.
- **Material models in core, not drawn live**: `verify/heightfield.ts` (3-axis height field, the verifier),
  `model/dexel.ts` (Z-dexel with holes and undercuts), `kernel/stock.ts` (voxel stock with sure/possible removal, tilted
  tool). The desktop only shows the verifier's 2D height map canvas (`VerifyPanel.tsx`).
- **Collision in core, not drawn**: `kernel/collision.ts` (holder capsules, certified clearance), `kernel/motion.ts` (5-axis
  blocks), `kernel/machine-clearance.ts` (holder vs table in the release gate), `kernel/head.ts` (tilting head B, not used by
  the viewer).

### 2.2 Defects found (reproduced 2026-10-19 with `generateToolpath` and `analyseGcode`; the probes become the P0 tests of §5)

| # | Defect | Evidence |
| --- | --- | --- |
| V1 | **Wrong tool for the operation.** The drawn tool follows `settings.toolType`, never `operationType`. On a lathe every operation whose tool type is not itself a lathe type draws a **turning** insert: threading, grooving, parting and boring all showed `insert:turning`. On a mill `drill`, `threading`, `engrave` draw whatever `toolType` says (default flat end mill). No rule says which tool can do which operation. | probe: `lathe/threading tool=insert:turning`, `lathe/parting tool=insert:turning`, `mill/drill tool=flat` |
| V2 | **Tapping and boring cycles vanish.** `G84`, `G74` (tap, rigid tap with `M29`), `G85 G86 G76 G89` (bore) are `unsupported`: the hole moves are not drawn at all, only the rapids between holes. The generator's own cycle table (`generator/cycles.ts`) emits `G84 G85 G86 G87 G89 G74`. | `tap {"Rapid":3} unsupported G84`; `bore {"Rapid":5} unsupported G85 G86 G76 G89` |
| V3 | **Cutter compensation drawn on the programmed line.** `G41/G42` unsupported; the generator emits them when `useToolCompensation` is on (`generator/mill.ts:66`). The path is drawn a tool radius away from where the tool cuts. | `mill/contour+comp unsupported G42` |
| V4 | **Tilted planes and local frames ignored.** `G68.2 G53.1 G69`, `G52`, `G10 L2` unsupported (moves drawn in the untilted / unshifted frame); Siemens `CYCLE800` is **silently** ignored (not even listed as unsupported). | `tilted unsupported G68.2 G53.1 G69`; `cycle800 unsupported []` |
| V5 | **Lathe canned cycles not replayed.** `G70 G71 G72 G73 G76` (lathe) are unsupported: a G71 roughing program draws one approach. Imported Fanuc lathe programs almost always use them. Mill-turn polar `G112/G113` unsupported. | `latheG71 unsupported G71 G71 G70`; `latheG76 {"Rapid":2}` |
| V6 | `G61 / G64` (exact stop / blending) reported unsupported: a false "partial preview" on every program that sets them. | `exact unsupported G61 G64` |
| V7 | No machine model: only the table box exists; no column, head, spindle housing, trunnion cradle, rotary platter, turret, gantry. No axis limits drawn, no DRO of joint values. 4-axis (A on X), head-table and head-head machines are not representable (`RotaryLayout = "table-AC" \| "table-BC"`, `MachineForProgramSchema.fiveAxis.layout` the same). | `indexing.ts:29`, `generator/schema.ts` |
| V8 | No live material removal for milling (3-axis or 5-axis); no deviation map in 3D; stock not carried between operations in the viewer. | `VerifyPanel.tsx` 2D canvas only |
| V9 | Moves are only "rapid" or "cut" (`playback.ts`): no lead-in/out, plunge/ramp, link, retract classes; colour only by tool. No tool-axis vectors on 5-axis paths. No per-operation browser, isolate or timeline bands. | `PlaybackSegment.rapid: boolean` |
| V10 | Holders are a single cylinder (`holder { diameter, length }`); no holder library or taper; lathe inserts are flat outlines without holder/turret; no tap, lollipop, barrel, slot-mill, back-chamfer, counterbore shapes. | `tool-model.ts` `MillShape` |
| V11 | Collision only against workholding boxes (`checkSetup`): no holder/shank vs stock or part, no rapid-into-stock in the viewer, no machine-body collision, no event list. | `setup-checks.ts` |
| V12 | Scale: playback builds one JS object per segment (`PlaybackSegment[]`) and one `TimedMove` per move, twice (playback + timeline). Arcs are re-tessellated by tolerance. No measured budget for > 1 M moves. | `playback.ts`, `timeline.ts` |

## 3. Principles (binding, inherited from spec 31 §3 and extended)

1. **One machine description.** A machine is a kinematic chain (§4.1) in core; the viewer, the collision checks, the posts
   and the AI read the same object. `KINEMATICS` (machine.ts), `RotaryLayout` (indexing.ts) and `HeadKinematic` (head.ts) become
   views of it, not parallel tables.
2. **The IR does not change shape**; new per-move facts (move class, operation id, compensation, joint values) travel in
   parallel arrays aligned by construction, like the motion track (spec 31 §4.4), with the same stale-track guard.
3. **Pure core, thin renderer.** Joint values, bodies' poses, removal, deviation, collisions, classification are pure
   functions in `packages/core/src/cam`. `View3D` builds Three.js objects from plain data. Everything testable without WebGL.
4. **Draw what is verified, mark what is assumed** (spec 31 §3.4): assumed machine bodies, holders, inserts and stock are
   translucent and listed; they never create a verification claim.
5. **Unsupported is never silent.** Any word with an effect on motion that is not replayed is listed in
   `MotionTrack.unsupported` (fixes the `CYCLE800` silence); the "partial preview" chip stays the user's signal.
6. **One timeline.** Everything drawn at time t (tool, joints, stock, collisions, NC line) is read from one timeline built
   once per program; scrubbing is deterministic (spec 31 §5.7).
7. **Integrate**: `ToolpathVisualizer` + `View3D` + `machine-scene.ts` stay the viewer; the AI uses `cam.machine`,
   `cam.analyze`, `cam_edit.*`; no second viewer.

## 4. Architecture

### 4.1 Machine model — `cam/machine-model/` (new, WP2)

```ts
type Joint =
  | { kind: "linear"; name: "X" | "Y" | "Z" | "U" | "V" | "W"; axis: Vec3; limits: [number, number]; home: number }
  | { kind: "rotary"; name: "A" | "B" | "C"; axis: Vec3; pivot: Vec3; limits?: [number, number]; continuous: boolean; home: number }
interface Link { id: string; parent: string | "base"; joint?: Joint; bodies: ReadonlyArray<BodyShape>; role: "base" | "column" | "head" | "spindle" | "table" | "trunnion" | "platter" | "turret" | "gantry" }
interface MachineModel {
  id: string; kind: "mill" | "lathe" | "mill-turn" | "router" | "3dprinter"
  links: ReadonlyArray<Link>                 // two chains: base → … → tool flange, base → … → workpiece mount
  toolChain: string; workChain: string       // ids of the flange and the work mount links
  tcp: "control" | "program"                 // how its programs are written (rotary.ts semantics)
  rapid: { linear: number; rotary: number }  // mm/min, deg/min — the playback clock uses them
  assumed: ReadonlyArray<string>
}
```

- **Presets** (data, not code): `vmc-3`, `vmc-4a` (A rotary on X, tailstock optional), `trunnion-ac`, `trunnion-bc`,
  `head-table-bc` (B head + C table), `head-head-ac` (fork head), `router-gantry`, `lathe-2x` (rear/front turret),
  `mill-turn-cy` (C spindle + Y + live tooling; drawing only in this spec), and the printers of spec 31. Bodies are boxes,
  cylinders and revolved profiles sized from the kernel machine (`kernel/machines.ts` table, travel) and flagged assumed.
- **Forward kinematics** `poseOf(model, joints): Map<linkId, Matrix4>` and `tipOf(model, joints, gauge)`; **inverse**
  `jointsFor(model, tip: Vec3, axis: Vec3, previous): JointSolution | Unreachable` choosing the solution closest to the
  previous joints (shortest rotary path, unwinding on continuous C), reporting singularity (tilt ≈ 0 with free C) and limit
  overruns. `indexing.ts` `anglesFor` / `tableRotation` and `head.ts` become the two-rotary special cases and are tested
  equal on their existing fixtures (bit-identical).
- **Program → joints** `jointTrack(program, model, setup)`: per timed move, joint values at start and end, from the program
  frame (`rotary.ts` `coordinates: part | machine`, TCP or not, G68.2 frames from §4.3). A parallel array aligned with the
  timeline (principle 2).
- **Selection**: the CAM machine library entry chooses the model; `MachineForProgramSchema.fiveAxis.layout` widens to the
  preset ids (old values decode to `trunnion-ac` / `trunnion-bc`). Without a library entry the model is inferred from the
  words used (A/B/C, header comments, TCP words) as `rotaryOfProgram` does today, and flagged assumed.

### 4.2 Operation → tool — `cam/operation-tools.ts` (new, WP2)

One table, the source for the viewer, the generator UI, the planner and the AI:

```ts
const OPERATION_TOOLS: Record<OperationKey, { allowed: ReadonlyArray<ToolShape>; preferred: ToolShape; why: string }>
// mill:   contour/profile → flat|roughing|bull|tapered|chamfer(finishing edge) ; pocket/adaptive → flat|roughing|bull
//         drill → drill|spot|reamer|boringBar|tap ; threading → threadmill|tap ; engrave → engraver|chamfer|flat(small)
//         3d_surface roughing → flat|bull|roughing ; finishing → ball|bull|barrel|tapered|lollipop ; chamfer/deburr → chamfer|cornerRounding
//         probing → probe ; face → facemill|flat|bull ; multiaxis → ball|bull|barrel|tapered|lollipop
// lathe:  facing|turning → turning|facing ; boring → boring ; threading → threading ; grooving → grooving
//         parting → parting ; knurling → knurling
```

- `toolForOperation(settings | operationSpec, library?)`: the tool model the preview draws for **that** operation: the
  operation's own tool (per toolpath `toolId`), else the library tool when it fits, else the preferred shape at the
  operation's diameter, flagged `assumed: ["type"]`. This replaces `previewToolModel`'s "toolType wins" rule (V1).
- `toolOperationIssues(op, tool)`: `TOOL_CANNOT_DO_OPERATION` (a turning insert parting, a ball mill drilling, a flat mill
  threading), `TOOL_TOO_LARGE_FOR_FEATURE` (diameter vs hole / groove width / pocket corner), `TOOL_REACH` (flute length or
  stickout < depth), `THREAD_PITCH_MISMATCH` (tap/threadmill pitch vs thread). Shown on the tool label in the viewer, in the
  generator's tool section and returned by `cam.analyze`.
- Generator UI: choosing an operation narrows the tool type list and switches to the preferred type when the current one is
  not allowed (with an undo toast); the lathe `toolType` follows the lathe operation by default (fixes the probe result).
- Multi-operation programs: each toolpath already carries its `toolId`; `combineCamOperations` and the kernel artifact keep
  per-operation tool models in `toolModels` (View3D prop exists), so a program with drill → tap → chamfer draws three
  different tools with a tool-change marker between them.

### 4.3 Interpreter completeness — `testing/gcode-interpreter.ts` (WP2)

Mill output for every word handled today stays bit-identical (spec 31 golden fingerprints). New words:

| Word | Behaviour in the replay |
| --- | --- |
| `G84`, `G74`, `M29` rigid | tap: feed in at `F` (= pitch × S on G94, pitch on G95), dwell `P`, **spindle reverse** in the track, feed out at the same rate; `G74` left-hand (M4 in, M3 out) |
| `G85 G89` | bore: feed in, (`G89` dwell), feed out |
| `G86` | bore: feed in, spindle stop, rapid out |
| `G76` (mill), `G87` | fine bore: feed in, orient (M19), shift `Q` away from the wall, rapid out; back bore from below |
| `G41 / G42 D…`, `G40` | cutter compensation computed in the replay: offset of the programmed contour by the tool radius (from the tool model of the active `T`/`D`), Fanuc type-B start-up and cancel, intersection joins at corners, arcs offset as arcs; segments flagged `compensated`; impossible offsets (radius > concave arc) listed as `COMP_GOUGE` |
| `G61 G64 G9` | accepted, recorded (no geometry) |
| `G52`, `G10 L2/L20` | local shift / work offset set, applied to following absolute moves |
| `G68 / G69` (2D rotation), `G68.2 / G53.1 / G69`, `CYCLE800`, `PLANE SPATIAL` (Heidenhain, when imported), `TRAORI / TRAFOOF`, `G43.4 / G49` | frame stack: tilted work plane with its rotary positioning (`G53.1`, CYCLE800 direction), moves in the tilted frame mapped to part coordinates; TCP sets `coordinates: "part"` for the joint track; unknown cycle calls listed as unsupported (principle 5) |
| lathe `G70 G71 G72 G73` | expanded by the replay from the `P…Q` profile block (Fanuc 0i / two-block syntax): roughing passes along Z (`G71`) or X (`G72`), pattern repeat (`G73`), finish pass (`G70`); limits as Fanuc (monotone profile for type I) |
| lathe `G76` (two-block), `G92` thread cycle | thread passes from P/Q/R depth rules, infeed angle, chamfer-out; drawn as feed at pitch × rpm |
| lathe `G74 / G75` peck along Z / X, `G83 / G87` live-tool drilling | expanded |
| `G112 / G113`, `G12.1 / G13.1` polar | X/C polar interpolation to display XY on the face (mill-turn) |

Each new word gets a characterization fixture and an expected segment list; `inferMachineKind` learns the lathe cycles.

### 4.4 Move semantics — `cam/viewer/move-class.ts` (new)

Per timed move: `class: "rapid" | "approach" | "plunge" | "ramp" | "cut" | "lead-in" | "lead-out" | "link" | "retract" | "cycle" | "probe" | "dwell"`,
plus `operation` (index of the toolpath/operation) and `toolChange` markers.

- From the source when known: generator and kernel strategies tag their moves (kernel `execute.ts` already knows lead-ins,
  ramps and links; the tags go into the parallel track, not the IR).
- From geometry for imported programs: rapid = rapid; feed with only −Z = plunge; feed with Z falling over XY = ramp;
  feed above the stock top = link/approach; first/last feed arc tangent to a cut = lead-in/out; expanded cycle parts =
  cycle; G38/G31 = probe. Classification is deterministic and tested on fixtures.
- Colour modes in the viewer: by **operation** (default for multi-op), **tool**, **move class** (Fusion palette: rapid red
  dashed, lead green, plunge orange, cut blue, link yellow), **feed** (ramp), **Z level**, **tool-axis tilt** (5-axis).
  Optional tool-axis vectors every N mm on rotary programs.

### 4.5 Material removal — `cam/sim/` (new)

Three tiers, one interface `StockSim { apply(moveRange, tool): void; mesh(): MeshDelta; deviation(part): Float32Array }`:

| Tier | Model | When | Base |
| --- | --- | --- | --- |
| S1 | height field (one Z per cell) | 3-axis mills, vertical tool | `verify/heightfield.ts` (already exact for 3-axis); cell 0.1–0.5 mm by stock size |
| S2 | tri-dexel (rays along X, Y, Z) | 3+2, 4/5-axis, undercut tools (lollipop, T-slot, dovetail) | `model/dexel.ts` (Z-dexel) extended to three directions; swept tool volume per move from the tool profile |
| S3 | turned profile | lathe | `viewer/turned-profile.ts` (done) |

- **Live**: a worker (`viewport/view3d/mesh-worker.ts` already runs mesh jobs) applies moves up to t in chunks and returns
  changed tiles; the renderer updates only those tiles (S1: displaced grid tiles; S2: surface nets per dirty block).
  Scrubbing back replays from the nearest checkpoint (snapshots every N moves / operation boundary).
- **Rest stock across operations and setups**: the result of operation k is the start of k+1; a setup change re-places the
  stock with the setup's work frame. The same stock feeds the kernel's rest roughing (single source).
- **Comparison**: deviation per surface vertex against the part mesh (`cam/model` meshes): colour map gouge (red) / on
  tolerance (green) / excess (blue), tolerance from the operation; max gouge and its move listed and jumpable.
- **Honesty**: the bracket of `kernel/stock.ts` (sure / possible) is kept for the evidence record; the viewer draws the
  "possible" surface and reports the resolution used.

### 4.6 Collision — `cam/sim/collision.ts` (wraps `kernel/collision.ts`)

Checked on the one timeline with the joint track:

- tool cutting part vs part (gouge, from §4.5 deviation), **non-cutting parts** (shank, neck, holder) vs stock and part,
  rapids into material, holder vs fixtures (spec 31 bodies, now with the holder profile), machine links vs workpiece chain
  and fixtures, axis-limit overruns and singularity passes from §4.1.
- Each event: `{ time, move, line, kind, bodies, depth or clearance }`; near misses below a clearance (default 2 mm) as
  warnings. Events drive red segments, timeline markers, "stop at collision" and the AI.

### 4.7 Tool and holder library — `cam/tool-model.ts` + `cam/holders.ts` (new)

- New mill shapes: `tap` (thread form, chamfer lead, pitch; spindle reverse in the cycle), `lollipop` (ball on a neck),
  `barrel` (circle-segment: lens, oval, tapered barrel — hyperMILL MAXX finishing), `slotMill`, `backChamfer`,
  `counterbore` (pilot), `form` (arbitrary revolved profile from the library). Each with its cutter mapping for cutting data
  (`cutterOf`) and its envelope for collisions.
- Holders as **revolved profiles**: ER collet chuck, shrink fit, hydraulic, Weldon side-lock, shell-mill arbor, tapping
  chuck; spindle taper BT30/BT40/HSK-A63/CAT40 drawn above the gauge line; gauge length = tip to taper gauge line. A tool
  resource references a holder; unknown holder = assumed ER (today's `assumedHolderOf`).
- Lathe: ISO insert shapes by code (C 80°, D 55°, V 35°, W 80° trigon, T 60°, S 90°, R round), clearance, nose radius,
  in a holder (ISO 5608, e.g. PCLNR / MVJNR / SDJCR) with hand and approach angle; boring bars as round bars with minimum
  bore; grooving / parting blades with width and max depth; the turret disc with stations for multi-tool programs.
- The Resources tool page and the viewer draw the same model (already the rule of `tool-model.ts`).

### 4.8 Player and inspection (WP6/WP7)

- **Operation browser** next to the viewport: setups → operations → tool, eye (show/hide), isolate, "simulate this
  operation", time and length per operation; the colour swatch of the operation.
- **Timeline** under the viewport: operation bands, tool-change ticks, collision / gouge markers, current NC line; step by
  move, by NC line, by operation; speed on a log scale (0.1× … 1000×); "stop at collision".
- **NC editor sync**: the editor highlights the line at t; clicking a line seeks there (the track carries `line`).
- **DRO panel**: X Y Z A B C (joint values) and program X Y Z, feed, S, T, D, H, active frame (G54/G68.2), with limit
  bars per axis.
- **View**: machine full / table only / part only; section plane; measure (point-to-point, wall thickness on the simulated
  stock); camera follow tool; transparency per group; tool-axis vectors.

### 4.9 Rendering and scale

- Path buffers built once in a worker as typed arrays (positions, colours by mode, per-vertex time), drawn as one
  `LineSegments` per colour mode; the playhead is a shader uniform (time ≤ t visible), so progressive display costs no
  rebuild. Fat lines (`Line2`) only for the active operation.
- Timeline and playback merged into one typed structure (`Float64Array` start/duration, `Int32Array` path/index), shared
  by the viewer, the sim and the checks (fixes the double model of V12).
- Budgets (gate of V8 phase): 1 M moves load ≤ 2 s and play at 60 fps on the reference Mac; S1 removal of a 300×200 stock at
  0.25 mm live at ≥ 30 fps for 10 k moves/s of playback.

### 4.10 AI awareness (WP8)

`cam.machine` returns the machine model (chain, limits, presets) and, with `gcode`/`operationId` + `at`, the joint values,
the active frame, the tool per operation, collisions and limit events; `cam.analyze` adds `toolOperationIssues`, unsupported
words and collision events; the workspace context `Preview:` line names the machine model, the operation at t and its tool;
vision `spatial` adds joints and the active frame. Prompts point to `cam.machine` (spec 31 §7.7), they never restate tables.

### 4.11 Mobile

The workspace preview payload (spec 13 §6, format 3) gains, per phase, the operation tool models (V1), move classes (V3),
machine links with joint keyframes (V5) and a decimated height-field stock (V4). The phone stays a viewer: no simulation
runs on it.

## 5. Phases and gates

Ordered by value to the owner per unit of work; each phase is committed and merged into local `main` when its gate passes
(spec 31 §10 rule). Baseline = spec 31 §1 suites + `tool-model.test.ts` + `machine-view.test.ts` + `cam-machine-view.test.ts`,
run in chunks under 100 s.

| Phase | Content | Fixes | Gate |
| --- | --- | --- | --- |
| P0 | Characterization: segment fingerprints of every interpreter fixture, tool model per operation snapshot (the probe of §2.2 as a test), timeline/playback equality | — | baseline green |
| P1 | **Right tool per operation**: `operation-tools.ts`, `toolForOperation`, `toolOperationIssues`, generator UI narrowing, lathe tool follows operation, per-operation tool models in multi-op and kernel programs, tap / lollipop / barrel / slot / back-chamfer / counterbore shapes | V1, part of V10 | every operation draws an allowed tool (table-driven test over all operations × machines); mismatch findings; desktop page test |
| P2 | **Interpreter completeness**: §4.3 words (tap, bore, comp, frames, local offsets, lathe cycles, polar) | V2–V6 | per-word fixtures; mill fingerprints bit-identical; the §2.2 probes report no unsupported words |
| P3 | **Move semantics and player**: move classes, colour modes, operation browser, timeline bands, NC sync, DRO (program coordinates) | V9 | classification fixtures; page tests; screenshots of a multi-op program in each colour mode |
| P4 | **Live 3-axis removal** (S1), rest stock across operations, deviation map vs part, gouge jump | V8 (3-axis) | removal equals the verifier height field at the end (same cells); deviation numbers equal `verify`; perf budget of §4.9 for S1 |
| P5 | **Machine models**: kinematic chain, presets (VMC, 4-axis A, trunnion AC/BC, head-table, head-head, router, lathe turret), FK/IK, joint track, limits/singularity/unwind, machine bodies moving, DRO joints | V7 | FK/IK tests (round trip 1e-9, equality with `indexing.ts` / `head.ts` fixtures); limit and unwind cases; screenshots per preset at t=0/mid/end |
| P6 | **5-axis / 3+2 removal** (S2 tri-dexel) and undercut tools | V8 (multi-axis) | removal volume vs analytic cases (slot, tilted pocket, T-slot undercut) within one voxel; perf budget |
| P7 | **Collision**: holder/shank vs stock/part, rapids into stock, machine links, events list, stop-at-collision | V11 | table of collision cases incl. near misses; no false positive on the existing release-gate fixtures |
| P8 | **Holder and lathe tooling library**: holder profiles and tapers, ISO inserts with holders, turret; scale work of §4.9 | V10, V12 | library round trip; collision uses the holder profile; 1 M-move budget |
| P9 | **AI and mobile**: §4.10, §4.11 | — | `skills`, `tool-prompts` (24 000-char budget), `context-breakdown`, mobile preview tests |
| Final | full `bun test packages apps` (chunked), `tsc` core/api/ai/desktop/sidecar/mobile | — | 0 fail; change log here and in `00-overview.md` |

P1 and P2 are independent of each other and of the machine model; they remove the visible wrong results first. P5 is the
largest single piece and the precondition of P6/P7.

## 6. Test plan (per phase, beyond the gates)

- **Operations × tools** (P1): for every `(machine, operationType)` of the generator schema and every kernel `strategy`,
  the drawn tool model is in `OPERATION_TOOLS.allowed`; for every disallowed pair `toolOperationIssues` returns the code;
  the lathe default follows the operation; multi-op program drill → tap → chamfer draws three tools and two tool changes.
- **Words** (P2): G84 with `F = pitch·S` gives in/out at the same rate and the spindle reverses in the track; G74 the
  opposite; G85/G86/G89/G76 retract behaviours; G41 on a square + inner arc offsets by R exactly, start-up/cancel moves,
  `COMP_GOUGE` on an arc of radius < R; G68.2 J45 maps a +X move to (cos45, 0, −sin45) in part frame; CYCLE800 likewise;
  G52/G10 shifts; G71 type I profile gives passes at depth U with finish allowance U/W; G76 two-block thread passes count
  and depths per Fanuc formula; G112 maps X/C to the face.
- **Classes** (P3): plunge/ramp/link/lead-in detection on generator outputs and imported fixtures; deterministic.
- **Removal** (P4/P6): pocket depth exact, scallop height of a ball finishing pass within the analytic value ± one cell,
  rest stock of op k equals start of op k+1, scrubbing back and forth gives identical meshes (checkpoint replay).
- **Kinematics** (P5): FK of every preset at home and at limits; IK chooses the shortest rotary path; C unwinds past ±360
  on a continuous axis; singularity flagged at B≈0 with C free; head-head tip moves with tool length (gauge), table-table does
  not.
- **Collision** (P7): holder hits a 40 mm wall when stickout is 30; rapid at Z−1 inside stock; trunnion cradle vs spindle
  head at A = −110; clearance 1.5 mm reported as near miss.
- **No regression**: CAD `View3D` without `machine` builds the same object tree (spec 31 test); mill 3-axis programs keep
  their screen coordinates; disposal returns live geometry count to baseline.

## 7. Parity checklist (what "Fusion / hyperMILL level" means here)

Parity is claimed per row of §1 only when its phase gate passed **and** it was checked in the running app (spec 31 lesson:
tests have no WebGL; screenshots through the `run` skill). Today: A1–A4 partial (trunnion pose only), B1 partial (no tap,
bore, lathe cycles), B2 no, C1–C4 no, D1 partial, D2 no, D3 partial (per-toolpath tool, wrong per-operation default), E1
lathe only, E2–E3 no, F1–F3 workholding boxes only, G1 partial, G2 unmeasured.

## 8. Decisions and limits

- **No controller emulation**: the replay interprets ISO/Fanuc words and the listed Siemens/Heidenhain frame cycles; it is
  not a virtual NC kernel (look-ahead, jerk, real cycle time per controller are out of scope; time stays feed-based).
- **Machine bodies are envelopes**, sized from typical machine classes and flagged assumed until a shop enters its own
  (a CAD import of a real machine model is a later increment).
- **Tri-dexel** over voxels for S2: memory scales with surface, not volume; the voxel stock of `kernel/stock.ts` stays the
  evidence bracket, not the display.
- **Out of scope**: robots, Swiss-type lathes, sub-spindle transfer, multi-channel synchronisation, additive-subtractive
  hybrids.

## 9. Implementation status

### P1 — the right tool per operation (2026-10-19)

- `cam/operation-tools.ts`: `OPERATION_TOOLS` (generator operations with their variants — 3D finishing, internal turning — and
  every kernel strategy via `strategyKey`), `toolKindOf`, `toolTypeForOperation`, `toolForOperation`, `previewToolModel`
  (moved here from `tool-model.ts`), `toolOperationIssues` / `settingsToolIssues` (`TOOL_CANNOT_DO_OPERATION`, `TOOL_REACH`,
  `TOOL_FLUTE_LENGTH`, `THREAD_PITCH_MISMATCH`, `TOOL_TOO_LARGE_FOR_FEATURE`).
- Lathe: a tool type that is not an insert draws the operation's insert (threading insert, parting / grooving blade, boring
  bar for boring and internal turning), flagged assumed; `latheSetupOf`, the phone preview and `cam.machine` use it.
- New mill shapes in `tool-model.ts`: tap (ISO 261 coarse pitch by default, chamfer lead), lollipop, barrel / circle segment
  (`formRadius`), back chamfer, counterbore (pilot); each with its cutter mapping and envelope.
- Desktop: the generator store switches the tool type when a new operation's tool cannot do it (never when the tool type
  itself is chosen); the tool section offers only the types that can do the operation and lists the issues; the visualizer
  lists the active tool's issues; the assistant's combined operations draw each operation's own tool (`operationToolsOf` →
  `View3D.toolModels`), and a lathe program of several operations swaps the insert per toolpath (`MachineSceneInput.pathTools`).
- AI: `cam.machine` with `params.operationType` returns `tool.issues`; skill text lists the new types and the rule.
- Found on the way: `KernelSection.tsx` lacked the `multiaxis` strategy (desktop `tsc` failed on `main`); `profileRuns`
  reported a merged section with its first bin's radius, so `cam.machine` named a Ø44 turn Ø44.014 (the nose-radius bin of the
  shoulder; `packages/ai/test/machine-kinematics.test.ts` failed on `main`). Both fixed.
- Tests: `packages/core/test/cam/operation-tools.test.ts`, `apps/desktop/test/cam-operation-tools.test.ts`.
- Limits: the generator's `toolType` list has no tap / lollipop / barrel (they come from tool resources); the lathe turned
  profile still uses one set-up tool (internal or not) for the whole program.

### P2 — interpreter completeness (2026-10-19)

- `testing/gcode-interpreter.ts` replays: `G84`/`G74` tapping (feed in, dwell, spindle reversed in the track, feed out at the
  same rate; `M29` rigid tap), `G85`/`G89` (feed out), `G86`/`G88` (spindle stopped, rapid out), `G76` fine boring (orient,
  shift `Q`, out, back), `G87` back boring; `G41`/`G42`/`G40` cutter compensation (`testing/cutter-comp.ts`: offset lines and
  arcs, inside corners cut back to the intersection, outside corners rolled on an arc of the radius, start-up along the
  first element, Z-only blocks wait with the element, `COMP` errors for an arc the tool does not fit or an element the
  tool overcuts); the radius from `InterpretOptions.toolRadius`, `G10 L12/L13`, or header comments (`T1 D=6.`, this app's
  `Tool: … Ø6mm`); `G52`, `G10 L2` + `G54-G59`, `G68`/`G69`, `G68.2`/`G53.1`, Siemens `CYCLE800` (axis by axis, additive),
  `G90.1`/`G91.1`, `G53` (machine coordinates: no drawn motion, like `G28`), `G61/G64/G9/G5.1/G8/G187/G103` accepted;
  lathe `G70-G76` two-block cycles (`testing/lathe-cycles.ts`: G71/G72 rough + final contour pass, G73 pattern, G70 finish,
  G76 Δd√n with Δdmin and finishing passes, G74/G75 pecks), continuing after the profile blocks; `U`/`W` incremental;
  `G112`/`G113` polar (C is the face's Y; the lathe display keeps Y on the face, turned 180° with a front turret).
- Statements: Siemens keywords and cycle calls are no longer tokenized as words (`CYCLE800(…)` was read as `E800`,
  `TRANS X10` as a move); non-motion keywords are skipped silently, the others listed as unsupported.
- Context decides `G70-G76`: a program with no Y words that uses G18 / G96 / T0101 (or `InterpretOptions.lathe`) reads them
  as lathe cycles; a milling program reads `G70/G71` as Siemens inch/metric, `G73/G74/G76` as milling cycles.
- Generator fix: with `useToolCompensation` the contour was offset by the program **and** compensated by the control (one
  radius too far: ±56 instead of ±53 on the default rectangle) and the side came from the settings, not the path; now the
  program follows the part (`offset: center`), the side follows the path's winding, the start-up runs in along the first
  element.
- `inferMachineKind` knows lathe P..Q cycles, G112 and the milling tap / bore cycles.
- Characterization: the nine milling fixtures stay bit-identical; `dwellAndUnsupported` keeps its segments (fingerprint of
  everything but the errors asserted) and only changes its warnings. Tests: `packages/core/test/cam/interpreter-words.test.ts`
  (24); updated `path-and-interpreter`, `interpreter-characterization`, desktop `cam-page` (partial preview now uses `G51.1`).
- Limits: lathe nose-radius compensation (G41/G42 with G18) is accepted, drawn at the programmed point; G76 is drawn with
  radial infeed; Fanuc lathe system-A `G90/G92/G94` single cycles, `G16` polar coordinates, `G51` scaling, `G51.1` mirror,
  Heidenhain conversational and other Siemens cycles stay unsupported (listed); a tilted plane's tool axis is not yet in the
  motion track (P5).

### P4 continuation — stock replay correctness (2026-10-19)

The existing S1 implementation now passes the correctness regressions without claiming the full P4 gate.
The desktop adapter preserves each kernel cutter's ball/bull/conical profile using `toolModelFromCutter`, with the same
tool precedence as the drawn tool, including `defaultTool`. Explicit non-milling models do not fall back to a mill.
Stock restore/reset invalidates the displayed mesh only when its cells change. Completing a partial move restores
its initial field before full sampling, so curved cutters and arcs leave the same cells regardless of playback history.
Probing moves never remove material, even when the fallback cutter is a mill.
The S1 adapter is restricted to vertical milling: lathe/printer setups and rotary programs keep their existing stock
representation. The stock readout starts at zero and clears when a new program cannot use S1. Worker execution,
3D deviation colours and the full performance/browser gates remain open.

Verification: `bun --no-env-file test --timeout 60000 packages/core/test/cam/stock-sim.test.ts
apps/desktop/test/stock-simulation.test.ts apps/desktop/test/cam-simulation.test.ts apps/desktop/test/cam-page.test.ts`
passes 39 tests. The mounted page checks use a DOM without WebGL; the mesh checks use Three.js buffers directly.

### P3 — move semantics and player (2026-10-19 / 20)

- Core: `viewer/move-class.ts` (`classifyMoves`: rapid, retract, plunge, ramp, lead-in, lead-out, cut, link, cycle, probe,
  dwell; lathe and printer rules; `cycleLinesOf`, `operationSpans`, `timeOfLine`, `moveClassSummary`); `analyseGcode`
  splits a program at its tool changes (`T1`, `T2`… one toolpath each; one tool stays `gcode` / `tool`);
  `testing/header-tools.ts` reads Fusion / HSM `T1 D=6. CR=0. - … - flat end mill` headers; `headerToolModels`,
  `toolTypeIn`, `latheToolModels` (the insert of each lathe tool from its own blocks: G32/G76 threading, G74/G75 grooving,
  a feed to the axis parting); `timedIndexAt` and the desktop `segmentIndexAt` give the move starting at a boundary.
- Desktop: `viewport/view3d/toolpath-colors.ts` (one vertex-coloured line object for the cuts and one for the rapids;
  colour by tool, operation, move class, feed or Z, legend, "path up to the playhead" draw range), `SimulationTimeline`
  (operation bands, tool-change ticks, finding / limit markers, step by move and operation, speed 0.1×–1000×),
  operations panel (show / hide / only / go), NC strip (blocks round the playhead, click to seek), DRO (feed, S, T, move
  class, operation, machine axes), `features/cam/lib/simulation.ts`.
- Checked in the running app (Vite + sidecar + headless Chromium with SwiftShader): a four-tool Fusion-style mill program
  (contour with G41, G83 drilling, G84 tapping, ball finishing) — bands, ticks, T3 tap drawn from its header, the NC strip on
  the G84 block, the move legend; a lathe program (G71/G70 then G76) — the threading insert for T303, the turned profile.
- Tests: `packages/core/test/cam/move-class.test.ts`, `apps/desktop/test/cam-simulation.test.ts`, the "simulation player"
  case of `apps/desktop/test/cam-page.test.ts`.

### P5 — machine models (2026-10-20)

- `viewer/rotary.ts` knows the head machines: `head-table-BC` (B head, C table) and `head-head-AC` (fork head), from the
  header (`HEAD-TABLE-BC`, `HEAD-HEAD-AC`) or a caller's layout; tool axis H·Z in the machine, Rᵀ·H·Z in the part; the
  trunnion maths is unchanged (same calls into `indexing.ts`).
- `viewer/machine-model.ts`: presets `vmc-3`, `vmc-4a`, `trunnion-ac`, `trunnion-bc`, `head-table-bc`, `head-head-ac`,
  `router-gantry`, sized from the set-up's table and the travels given (assumed otherwise, drawn translucent); links base,
  column, head, spindle, fork, table, cradle, platter; `machinePose` places every link in the part frame (part still) or the
  machine frame (base still: the table travels the axes it carries and turns), with the spindle nose a gauge length up the
  tool axis; `checkLimits` reports X/Y/Z travel (Z with the gauge) and A/B/C range overruns at their first move and line
  (errors for entered limits, warnings for assumed ones).
- Viewer: Machine section → "Show the machine", machine class (auto or a preset), part / machine view for every mill;
  `View3D` takes the tool tip, axis and table matrix from the machine pose; the DRO shows the machine axes; limit findings are
  timeline markers and stats lines. `ToolpathVisualizer.machineTravel` takes a library machine's work volume (not wired from
  the machine library yet: that selector is another session's work in progress).
- Interpreter fix found by the tests: a block that only turns the rotary axes (`G0 A90`, `G1 A130 C10`) was dropped; it is
  now a zero-length move with the new angles (the `rotary` characterization fixture re-recorded; the only added segment is
  asserted).
- Checked in the running app: a TCP trunnion A/C program — part view (the machine turns round the still part, the tool
  leans) and machine view (the platter tilts A30 with the vise and stock, the tool vertical), DRO `X22.214 Y-1.214 Z-3.01
  A30 C200`.
- Tests: `packages/core/test/cam/machine-model.test.ts`, "the machine model round a mill" in
  `apps/desktop/test/cam-machine-view.test.ts`.
- Limits: inverse kinematics for non-TCP head machines takes X Y Z as tool tip positions; no singularity or unwinding
  report yet; machine bodies are envelopes, not CAD models; machine-body collision is P7.

## Change log

- 2026-10-19: analysis written from the code at 9aa648c and the probes of §2.2.
- 2026-10-19: P1 built (§9).
- 2026-10-19: P2 built (§9).
- 2026-10-19: continued partial P4 S1 removal: preserved kernel cutter profiles, deterministic partial/full replay,
  rewind/reset mesh invalidation, non-cutting probes, machine scope guards and desktop stock readout; 39 regressions pass.
- 2026-10-20: P3 completed and checked in the running app; P5 machine models built (§9).
