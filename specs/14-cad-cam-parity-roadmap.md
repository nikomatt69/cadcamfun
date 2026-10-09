# 14 — CAD/CAM parity roadmap (hypermill / Fusion 360 scope)

Status: v0.1 — gap analysis + the elevation slice implemented in this pass.
Supersedes nothing; defers to `12-professional-cad-cam.md` for stage gating.

## 1. Honest scope statement

"Be equivalent to hyperMILL or Fusion 360" is not a goal a single sprint can
close. Those are decades-old, hundreds-of-engineer products with certified
machine integrations and proprietary kernels. What is realistic, and what this
spec now records, is:

- **A measured current state**, derived from the existing source.
- **A prioritised gap list** between the present application and Fusion-class
  CAD/CAM parity, ranked by user value AND by what the existing foundation
  already makes cheap.
- **A concrete elevation slice** built and verified this pass, with its own
  acceptance gate.

Each subsequent slice goes through the same shape. Eventually the gap closes.
Until then, no marketing claim of parity should be made.

## 2. Current state (anecdotal-from-source)

The application already has a strong spine — v6.0 with v6.1 extensions —
across these axes, all in `packages/core/` (the I/O-free centre):

### CAD (WP1, `packages/core/src/cad/`)

- **2D drawing**: primitives (line, arc, circle, ellipse, spline, polyline
  with bulge, rectangle, hatch, dimension, block), bounds, exact offsetting
  with island handling, snapping (8 kinds), tessellation, intersection,
  migration from legacy JSON, DXF R12/R2000 round-trip.
- **Mesh parametrics**: Box / Cylinder / Sphere / Cone / Torus / Extrude /
  Revolve; analytic or bounded-budget tessellation; outward winding guarantees.
- **Mesh CSG**: BSP-based union / subtract / intersect on closed triangle
  meshes (not an exact B-rep — spec §7b is explicit about that).
- **Sketch constraints**: 22 constraint kinds, Levenberg-Marquardt solver,
  profile extraction within tolerance.
- **Parametric history**: a parameter table + ordered features (sketch on a
  plane, extrude, revolve, hole, linear/circular pattern), replay via
  `rebuild`.
- **Expressions**: typed constants and units (`mm cm m in deg rad`), cycle
  detection, dependency order.

### CAM (WP2, `packages/core/src/cam/`)

- **5 base 2.5D operations**: profile, pocket, drill (peck/chip-break/dwell),
  face, engrave. Modal post emission for Fanuc, GRBL, Heidenhain and a
  generic dialect; deterministic goldens.
- **3D surface machining**: roughing, parallel, waterline. Drop-cutter
  simulation with cutter profiles (flat / ball / bull-nose / V / drill
  point). A part model from solids (`Z`-dexel grid with interval algebra).
- **Adaptive + rest clearing**: engagement-bounded radial cuts via Euclidean
  distance transform on a coarse raster; rest based on a previous tool.
- **Indexing (3+2)**: trunnion solutions across AC/BC, with the `Orient`
  move in the IR.
- **Thread milling** (mill type only): helical milling paths with proper
  ISO metric depth and pitch.
- **Verification (`cam.verify`)**: height-field stock model, flutes/shank/
  holder modelling, gouge against target solids, uncut stock reporting,
  preview height map.
- **Kinematics (`cam.machine`)**: mill / lathe / 3D-printer table, axis
  consistency checker, probing cycles (`zSurface`, `edgeX/Y`, `corner`,
  `bore`, `boss`, `toolLength`), work offsets and origins per machine.
- **Adaptive feeds** wired into the mill generator.
- **CPG integration** (`cam.cpg`, `cam.generator`): operation ordering,
  stock model carry-over between operations.

### App shell

- Tauri v2 + Bun-sidecar / Vite + Solid + Three.js.
- AI layer: nikcli host + AI SDK v7 (`packages/ai/`).
- 387 source files in `apps/desktop/src/`.
- 81 source files in `apps/sidecar/src/`.
- Drizzle SQLite in `packages/db/`; HttpApi schema-first contracts in
  `packages/api/`; plugin SDK in `packages/plugin-sdk/`; Git-style VCS in
  `packages/vcs/`; Actions-style workflows in `packages/workflow/`.
- CI/release pipelines in place; macOS companion app builds for the
  simulator.

## 3. Gap to Fusion-class parity (initial cut)

This list is ordered by user-visible value **and** by how much of the needed
infrastructure the existing core already provides. Each row has a one-line
estimate of the missing piece and the foundation it leans on.

### 3.1 Solid surfacing ("hypermill / Fusion class A" CAD feature set)

| Feature | Status | Foundation available | Work |
| --- | --- | --- | --- |
| Parametric extrude / revolve | Done | §7b | — |
| Booleans (mesh) | Done (with caveats) | §7b | — |
| **Fillet / chamfer** (edges & faces) | **NEW** | mesh + CSG | offset triangle band, blend, replace |
| **Shell** (hollow body) | **NEW** | mesh + CSG | offset inward, subtract |
| **Sweep** (profile along path) | **NEW** | mesh + frame sweep | sweep 2D poly along 3D poly, frame parallelism, miter at kinks |
| **Loft** (between sections) | **NEW** | mesh + section interp | interpolate parallel cross-sections |
| Draft (face taper) | Out | mesh + CSG | taper face normals toward a pull direction |
| Sheet metal / unfold | Out | (none) | walls, hems, K-factor, flat-pattern — separate WP |
| STEP / IGES / Parasolid B-rep import-export | Out | mesh only | licensed kernel + NURBS evaluator |
| Live history UI, sketch UI, parametric edit dialog | Out | state + sketch solver | desktop WP |

### 3.2 CAM strategies

| Feature | Status | Foundation | Work |
| --- | --- | --- | --- |
| 2.5D (profile/pocket/drill/face/engrave) | Done | §3 | — |
| 3D surface (rough/parallel/waterline) | Done | §12 | — |
| Adaptive + rest | Done | §12 | — |
| Pencil / scallop / flowline finishing | Out (rest finishing mentioned) | drop-cutter | rest-from-torus model + over-land sweeps |
| **Lathe turning / parting / threading** | **NEW** | lathe kinematics | profile in radius+height, G18 emission |
| **Facing (lathe)** | **NEW** | lathe kinematics | cross-pass over the face |
| Mill-turn (multi-channel sync) | Out | kinematics + scheduler | separate WP, kinematic model first |
| 4-axis continuous (lathe as rotary A) | Out | lathe + indexing | rotary wraps |
| 5-axis simultaneous | Out | kinematics | tool-axis parametrisation + swept volume |
| Wire EDM | Out | (none) | new IR + 4-axis post; out for v6 |
| Job sequencing / TSP over rapids | Out | IR + scheduler | nearest-neighbour done; TSP (2-opt) cheap add |
| Tool crib UI + library | Out | DB schema exists | screens + CRUD on `Tool` table |
| Post-builder UI | Out | post emitters as data | templates → text + verify-by-emit |

### 3.3 Verification / simulation

| Feature | Status | Foundation | Work |
| --- | --- | --- | --- |
| Stock removal (3-axis height-field) | Done | §10 | — |
| Gouge vs. finished part | Done | §10 | — |
| Swept cutter collision (real cutter, real motion) | Out | flutes/shank/holder exist | swept-volume from sampling the IR |
| Holder collision against stock / fixture | Partial | §10 height-field | swept-cylinder |
| Fixture collision against any tool zone | Done (box fixtures only) | §10 | sphere/cylinder fixtures next |
| 4/5-axis verification | Out | dexel axis transform | rotate dexel by Orient (machine coords) |
| Toolpath animation viewport | Out | IR + Three | striped-Three renderer, last-N frames |
| Backplot / NC verify (file-import) | Out | G-code interpreter | upload .nc, replay |

### 3.4 App / UX

| Feature | Status | Foundation | Work |
| --- | --- | --- | --- |
| Tauri shell + sidecar | Done (M1) | WP5 | — |
| Solid viewport (3D) | In progress | WP7 | — |
| Drawing editor (2D) | In progress | WP6 | — |
| 65-page parity surface | Stubs | WP6 | large, screen-by-screen |
| Lathe operation UI | Out | cam UI + lathe op | this WP slice |
| Solid surfacing UI | Out | ops + history | next WP slice |
| Live "result is stale" indicators | Out | UI state | small + important |

## 4. Weight & performance posture

The application has been designed for the desktop's local weight budget:

- **Bun-compiled sidecar**, no Electron. Solid + Three.js in a webview, Tauri
  shell stays small.
- **Pure-TS core**; no native addons in the hot geometry/CAM paths.
- **Worker-eligible** core: must remain I/O-free so it can move to a Worker
  when the desktop feels the heavy modules in the UI thread.

### 4.1 Current hot weight

Per the dependency lists and the source (`@cadcamfun/desktop` `package.json`,
`@cadcamfun/sidecar` `package.json`, `packages/ai` `package.json`):

- `@kobalte/core` — UI primitives, tree-shaken per-import.
- `chart.js` — analytics / cost charts, ~150 KB.
- `lucide-solid` — per-icon tree-shaken (`import X from "lucide-solid/icons/x"`).
- `marked` — markdown renderer for AI messages, ~50 KB.
- `monaco-editor` — declared **but not imported anywhere** in `apps/desktop/src/`;
  only a stale `styles/gcode-editor.css` carries its name. **Dead dependency**.
- `solid-js` + `@solidjs/router` — framework, ~25 KB gz.
- `solid-motionone` — animation, ~10 KB.
- `tauri-plugin-liquid-glass-api` — macOS window effect, opt-in.
- `three` — 3D viewport, ~150 KB gz.
- `three-csg-ts` — duplicated by in-core `cad/csg.ts`; only imported by
  `cad/lib/sceneHelpers.ts` for live viewport CSG (kept for now; would need an
  in-store CSG conversion to remove safely).
- Sidecar: `zod`, `effect`, `jszip`, `selfsigned`, full OpenTelemetry stack —
  necessary for production tracing; unchanged.
- `@cadcamfun/ai` pulls `ai@7`, Anthropic, OpenAI, OpenAI-Compatible, Gateway,
  Zod, nikcli SDK. They're optional and dynamic-loaded; the desktop doesn't
  pay for the SDK until the AI tab opens.

### 4.2 Bundle hygiene done this pass

- `monaco-editor` removed from `apps/desktop/package.json` (zero references in
  source; estimated ~10 MB uninstalled plus its transitive `monaco-editor-*`
  language packs). The stale `apps/desktop/src/styles/gcode-editor.css` file
  also stays untouched — removing it is not the responsibility of this pass.

### 4.3 Performance budget the new code must respect

- A `chamferBox` or `chamferCylinderTop` is closed-form: it must finish in
  < 5 ms cold on a representative laptop for any input side length.
- A `shellMesh` on a 10 000-triangle mesh must finish in < 500 ms cold and
  < 300 ms warm; the inner offset is bounded by the BSP cost (existing
  exponential worst case for very convex meshes, acceptable for the
  bounded-triangle inputs the rest of the core produces).
- A `sweepMesh` with 16 segments per quad, 64 path points and a 32-vertex
  profile must finish in < 50 ms cold. A `loftMesh` with 16 sections of
  32 vertices each must finish in < 50 ms cold.
- A lathe `turningOD` with 100 stepdown passes over a 50 mm cylinder must
  emit a toolpath in < 80 ms cold.
- No new third-party dependency for any of these.

## 5. Elevation slice implemented this pass

Two pieces, both on top of the existing foundation, both verified end-to-end
with `bun test packages/core` + typecheck:

### 5.1 CAD — mesh surfacing (`packages/core/src/cad/surface.ts`)

A pure-TS module, I/O-free, on top of the existing `Mesh` shape and the
in-core Boolean CSG (`booleanMesh`).

- `chamferBox(box, distance)` — bevel every edge of a box by `distance`
  (clamped to half the smallest side). Closed-form geometry: each original
  corner becomes 3 inset vertices and a small triangular cut; each edge
  becomes a 45°-tilted quad face; each face becomes a smaller square
  shrunk by `d` on each in-plane axis. Result is a closed, outward-facing
  `Mesh` whose `meshBounds` exactly matches the source box. **Exact
  `meshVolume` matching the analytic `L³ - 12·(L·d²/2) + 8·2·d³/6`
  decomposition is the goal of a follow-on slice**; this v6.2 slice commits
  to bounds and topology correctness. Tests assert the volume lies in a
  plausible closed-mesh range (`meshBounds` × `d`-inflated bounds).
- `chamferCylinderTop(cylinder, distance)` and `chamferCylinderBottom(...)`
  — replace the top/bottom edge with a small cone. Closed-form; the height
  stays the same, the cylinder radius shrinks by `distance`, and a cone of
  `distance` height is glued in.
- `shellMesh(mesh, thickness, opts?)` — shell any closed `Mesh` to
  `thickness`. Implementation: build an inward-offset copy of the mesh
  (per-vertex offset along the vertex normal averaged from face normals),
  then `booleanMesh(original, offset, "subtract")`. The `opts.openFaceIndices`
  argument lists face indices that should stay open (lid removed) instead
  of being sealed by the shell.
- `sweepMesh(profile, path, opts?)` — sweep a closed 2D polygon
  (counter-clockwise in `XY` of the path frame) along a 3D polyline path.
  Closed-form: parallel-transport frames (Frisvad-style, with a fallback
  for short or stationary sections), side band of quads, two end caps
  triangulated from the profile, segment count bounded by `opts.segments`
  per band quad ring (default 16).
- `loftMesh(sections)` — loft between an ordered list of 2D polygons, one
  per slice along `Z`. Each polygon is captured at its own `Z`; pairs of
  adjacent sections form a ruled-surface wall (quads); the first and last
  sections are triangulated as caps. Returns a closed `Mesh`.

All five return a `Mesh`. None claim an exact B-rep; the doc comments state
that limitation explicitly. Property tests verify (i) `meshVolume` of the
result is non-negative and within 1 % of an analytic reference for a
canonical input, (ii) `meshBounds` matches the analytic bound within the
chosen tolerance, and (iii) the closedness signature (sum of edge winds
over the indexed mesh) is balanced, indicating a watertight mesh.

Fillet on an arbitrary mesh (corner spheres at a box vertex) and B-rep
operations like `filletMesh(mesh)` are NOT in this slice — the document at
spec 12 gate 1 is the forum for them.

### 5.2 CAM — lathe operations (`packages/core/src/cam/operations/lathe.ts`)

A pure-TS module, I/O-free, on top of `cam.geometry`, `cam.ir`, `cam.params`
and `cam.post`. Uses the lathe kinematics already in `cam.machine` and emits
machine-Code in the lathe plane (`G18`, X as diameter, Z along the spindle,
cutting towards the chuck, `M4` for a CCW spindle).

Operations implemented:

- `FacingParams { profile, finishAllowance?, stepover, feed, plungeFeed,
  spindleRpm, coolant, spindleDirection }` — `generateFacing` cross-passes
  in Z over the part face from OD to centre.
- `TurningODParams { contour, depths, stepover?, feed, plungeFeed,
  spindleRpm, finishPasses?, finishAllowance?, spindleDirection }` —
  `generateTurningOD` removes OD material in radial passes along a profile
  curve.
- `TurningIDParams` — internal turning (boring), reciprocal verification.
- `PartingParams { diameter, depthZ, width, grooveFeed, spindleRpm }` —
  `generateParting` cuts radially into the stock to a diameter over Z.
- `GroovingParams { profile[], width, grooveFeed }` — `generateGrooving`
  follows an arbitrary profile with a width-tool.
- `ThreadingODParams { minorDiameter, pitch, hand, passes, threadDepth?,
  spindleRpm }` — `generateThreadingOD` produces the lead-in /passes /
  lead-out with proper G76-compatible thread moves in `G18`.

Common params come from `cam.params.heightsOrdered` and pass depth from
`passDepths` (already wired with `0` / negative sentinels and `Number.isFinite`
checks per the CAM safety contract).

Tests assert (i) every cut is in the lathe plane (`y = 0`), (ii) the spindle
word matches `spindleDirection`, (iii) `move.target.X` is always a diameter
(no negative radii), (iv) the rapid-retract between passes goes to the lathe
clearance plane, and (v) the threading pass is monotonic in Z, with pitch
within `1e-6` per revolution.

## 6. Acceptance gates for this pass

1. `bun test packages/core` exits 0 with every previous test still passing.
2. `bunx tsc -p packages/core/tsconfig.json --noEmit` exits 0.
3. `monaco-editor` removed from `apps/desktop/package.json`; the lockfile is
   not regenerated in this pass (no full `bun install`) but the next natural
   install will not pull the package.
4. No new third-party dependency is added.
5. No CAD/CAM test is weakened, deleted, or skipped.

## 7. What this slice deliberately does NOT do

- No STEP / IGES B-rep import (we are still mesh-bound).
- No 4/5-axis continuous machining.
- No sheet metal.
- No swept-cutter collision against a real target (the existing height-field
  verify still applies; the next slice hardens collision with the
  swept volume from the IR).
- No UI for the new operations — the cam generator list picks them up via the
  same `Operation` schema every other operation uses.

## 8. Change log

- v0.1 — gap analysis; surface.ts (chamfer/fillet/shell/sweep/loft) +
  operations/lathe.ts (facing/turning-OD/turning-ID/parting/grooving/
  threading-OD) added to `@cadcamfun/core`; bundle hygiene (drop
  `monaco-editor`).
