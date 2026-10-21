# 33 — CAD and CAM kernel gap analysis (Fusion 360 / hyperMILL reference)

Status: analysis measured on 2026-10-19 against `main` (`ed73e6c` → `8b3a3712`), followed by the fixes listed in
§5. Owner request: "analizza i gap mancanti nel core del cad e del cam kernel e il loro utilizzo nel sidecar, httpapi e desktop …
li aggiorniamo con il mancante". This spec is the inventory the follow-up work is ordered from. It does not claim parity: the gates
of [spec 12](12-professional-cad-cam.md) and the release claims of [spec 29](29-native-cam-kernel.md) still decide that.

Method: read the kernel sources (`packages/core/src/cad`, `cad/brep`, `cam/operations`, `cam/kernel`, `cam/generator`), the
HTTP contracts (`packages/api/src`), the sidecar handlers (`apps/sidecar/src/http`, `services/ai.ts`), the desktop features
(`apps/desktop/src/features/{cad,cam}`) and the assistant actions (`packages/ai/src/actions`), and counted which kernel entry
points each layer actually calls. Older summaries (spec 14 §2–3) are partly stale; where they disagree this spec is the measured
state.

## 1. CAD kernel

### 1.1 What exists

| Area | Where | Notes |
| --- | --- | --- |
| Parametric history, 24 feature types | `cad/history.ts` | sketch, extrude (edge/corner/taper), revolve, hole (simple/counterbore/countersink, threads, fits), pattern (linear/circular/grid), mirror, sweep, loft, shell, fillet/chamfer, primitive, coil, move, scale, split, combine, rib, sheet, thread, text, pushpull, draft, mate, plane |
| Constraint sketcher | `cad/sketch.ts` | point/line/arc/circle, 24 constraint kinds (incl. tangent, equal, symmetric, point-on), LM solver, DOF |
| Mesh kernel | `csg.ts`, `mesh-clean.ts`, `mesh-topology.ts` | closed-manifold BSP Booleans, topology/genus checks |
| Exact B-rep | `cad/brep/*`, `history-brep.ts` | analytic + NURBS faces, exact Booleans, fillet/chamfer of straight and coaxial edges, shells, sweeps, lofts, drafts and push-pull of planar faces, STEP read/write, mass properties, validation, hole recognition |
| Engineering layer | `fasteners.ts`, `smart-fasteners.ts`, `dfm.ts`, `recipes.ts`, `assembly-analysis.ts` | ISO tables, DFM rules, 7 recipes, interference/BOM/joints from holes |
| Drawings | `drawing/*` | projected views, section, detail, dimensions from history features, sheet + SVG/PDF |

### 1.2 Gaps, ranked by value for a Fusion-class modeller

| # | Gap | Today | Why it matters |
| --- | --- | --- | --- |
| C1 | **Mirror / pattern of whole bodies** | only the tool of a feature | half-part modelling, multi-body layouts — **closed in this pass** (§5) |
| C2 | Exact model of `coil`, `rib`, `sheet`, `text`, modelled `thread` | rib/sheet/text/coil exact (this pass); modelled thread still mesh only, with a reason | STEP export and B-rep CAM features lose these bodies |
| C3 | Fillets of non-coaxial curved edges, variable radius, setback vertex blends | refused or mitred | pipe T-junctions, cast parts, consumer products |
| C4 | Chamfer by two distances / distance-angle | mesh and exact, shared callout geometry; API/AI and desktop controls | **closed in this continuation** (§5); unequal callouts require a uniquely more horizontal first face |
| C5 | Shell of a Boolean result, a loft, a partial revolution; per-face thickness | refused | housings built from several features |
| C6 | Persistent naming (topological naming) | selections by point / box | edits upstream re-pick faces silently or fail |
| C7 | Surface modelling: patch, trim, stitch, thicken, offset surface | absent | class-A and freeform parts |
| C8 | Direct editing: offset / delete / replace face on any body | planar push-pull only (exact), curved by mesh | imported STEP editing |
| C9 | Pattern along a path, pattern of faces | pattern along a path done (mesh + exact + API/AI schema); pattern of faces still absent | chains, ribs on curves |
| C10 | Sheet metal: flange on an edge, reliefs, corner closures, multi-bend unfold of a 3D part | base flange + hems + flat pattern | real sheet-metal parts |
| C11 | Assembly joint solver (several joints, motion limits, cam/gear joints), motion study | one rigid `mate` per body | mechanisms (the rack-and-pinion target of the harness goal) |
| C12 | Exact holes on work planes | mesh only on work planes | tilted / face holes lose exactness and CAM features — **closed in this pass** (§5) |
| C13 | Sketch: splines, ellipses, offset/trim/extend/project tools in the solver | splines (Catmull-Rom through points) and ellipses (semi-axis unknowns, `ellipseSize`/`pointOnEllipse`) in the solver, profiles and exact loops (sampled chords); offset/trim/extend/project tools still absent | freeform profiles must be approximated |
| C14 | Drawings: GD&T beyond flatness, balloons/BOM, assembly drawings, exact silhouettes | partial | production sheets |

## 2. CAM kernel

### 2.1 What exists

| Area | Where |
| --- | --- |
| 2.5D: face, adaptive, pocket, profile (leads, tabs), bore (helical), drill/spot (G81/G82/G83/G73), thread milling, engrave, chamfer/deburr | `cam/operations/*`, kernel `execute.ts` |
| 3D: roughing (contour/adaptive), rest roughing, parallel, waterline, steep-shallow, rest finishing/pencil — **and now scallop (3D offset), spiral, radial, flat-area** | `operations/surface.ts` |
| 5-axis: indexed 3+2 (AC/BC trunnion), simultaneous parallel/contour finishing on a trunnion (kernel `multiaxis`), voxel stock bracket for tilted removal, joint-move collision, head B / head AB kinematics (module only) | `cam/indexing.ts`, `five-axis.ts`, `kernel/{motion,stock,collision,head}.ts` |
| Kernel orchestration | `cam/kernel`: materials (ISO P/M/K/N/S/H grades), cutting data with power/torque/deflection limits, feature planning from history or B-rep, NC replay evidence, claims and release levels |
| Posts | generic/LinuxCNC, Fanuc, Haas, GRBL, Heidenhain (advanced), subprograms |
| Verification | height-field replay, gouge vs part, rapid-in-stock, holder/shank, machine table clearance, travel |
| Turning | legacy generator only (`generator/lathe.ts`): facing, turning, boring, threading, grooving, parting, knurling |

### 2.2 Gaps, ranked

| # | Gap | Today | Notes |
| --- | --- | --- | --- |
| M1 | **3D finishing families**: constant scallop, spiral, radial, horizontal | raster/waterline/steep-shallow only; legacy spiral/radial finishing silently fell back to a raster | **closed in this pass** (§5) |
| M2 | Hole making in the kernel: rigid tapping (G84), reaming (G85), boring cycles, back-boring; tap/reamer/boring-bar cutters | drill and spot only; threads are milled | the interpreter already replays G84/G85 (spec 32 P2) — **closed in this pass** (§5); back-boring (G87) still missing |
| M3 | Turning in the kernel (facing, OD/ID roughing and finishing, grooving, threading, parting) with stock evolution | legacy generator only, no kernel evidence | mill-turn later |
| M4 | Stock-aware rest: operation B consumes the stock A left (spec 29 §6) | rest from a previous tool diameter | voxel stock exists for 5-axis only |
| M5 | 5-axis strategies: swarf, 5x contour, multi-axis roughing, automatic tilting from a 3-axis path (collision avoidance) | parallel/contour lean on a trunnion | head-table and head-head machines in the kernel |
| M6 | Pencil as a standalone strategy (bi-tangency), morph / flowline / projection finishing | pencil = rest finish after a larger ball | |
| M7 | Toolpath linking optimisation (2-opt/TSP over rapids, stay-down links in 2.5D) | 2-opt over nearest neighbour for point ordering (`optimizedOrder`, used by drill); stay-down links in 2.5D still open | cycle time |
| M8 | Holder-aware automatic tool length (minimum stick-out) | fixed stick-out per cutter | rigidity, chatter |
| M9 | Machine simulation parity (right tool per operation, interpreter words, machine model, live removal) | **spec 32, in progress in the collaborating session** | P1/P2 landed; P3 player/P4 S1 removal partial, including cutter profiles and deterministic rewind; full gates open |

## 3. Integration: what each layer reaches

| Capability | Core | Assistant (AI) | HTTP API / sidecar | Desktop |
| --- | --- | --- | --- | --- |
| Parametric rebuild, exact replay, STEP of a history | yes | `cad.parametric`, `parametric_exact` | via AI actions only; `/api/cad/exact/{analyze,assembly,step}` take a scene | Parametric panel (local core), Exact model panel |
| STEP import | `stepToElements` | `cad_edit` read | — | Import dialog |
| Drawings | `generateSheet` | `cad.drawing` | companion previews | Drawing panel |
| DFM, fasteners, recipes | yes | `cad_parametric` actions | via AI | Manufacturability / Recipes sections |
| Sheet-metal flat pattern DXF | `flatPatternDxf` | `flatPatternDxf` per sheet feature in the parametric report | via AI actions | Parametric panel: developed length, bend count, DXF download per sheet feature |
| Sketch solver | `solveSketch` | inside rebuild | — | no interactive drag-to-edit sketcher |
| Kernel CAM job | `runJob`, `planOnly` | `cam.manufacture`, `cam_edit.manufacture` | `POST /api/toolpaths/manufacture` | Kernel section (plan, cutters, evidence) |
| Legacy generator | `generator/*` | `cam_edit` create | `POST /api/toolpaths/generate` | Operation generator |
| Verification | `verifyToolpath` | `cam.verify` | `POST /api/toolpaths/verify` | Verify tab |

Integration defects found and fixed in this pass: the HTTP artifact schema did not list the `multiaxis` strategy the kernel already
produced (a five-axis artifact could not be encoded), the generated clients were stale after the five-axis operation, and the
desktop kernel cutter table typechecked only after the parallel session's fix. Still open: `flatPatternDxf` unreachable from any
layer; no HTTP route rebuilds a parametric history without the assistant; the desktop has no interactive sketcher on the solver.

## 4. Order of work

C4 continuation scope: deepen the existing mesh and B-rep blend modules, with their shared chamfer section calculation,
and preserve the callout through the existing parametric API/assistant and desktop panel adapters. `radius` remains the
first setback; `secondDistance` and `angle` (degrees at the history boundary) are mutually exclusive and chamfer-only.
The first face is the more horizontal face; ambiguous unequal callouts are refused. Distances must be finite and positive,
angles strictly between 0 and 90 degrees and geometrically possible at the selected edge. Invalid callouts leave geometry
unchanged and report the reason. Equal setbacks retain existing behavior, including explicitly equal second distances.
Owners: WP1 CAD blends/history/tests, WP3 parametric schema/tests, WP4 existing parametric handler tests,
WP8 modelling guidance/tests and WP6 existing parametric panel only. CAM simulation changes in the collaborating session
remain a separate scope. Geometry modules receive radians; history/UI callouts retain degrees.

1. M2 hole making in the kernel (tap/ream cycles in the IR, posts, cutters, cutting data, planner choice tap vs thread mill) — **done**.
2. C12 exact holes on work planes and C4 chamfer variants — **done**; C2 exact rib/sheet/text/coil — **done** (modelled thread deferred: the exact sweep cannot yet keep the thread profile radial about the axis, and the per-segment Booleans of a 58-turn helix exceed the replay budget).
3. M4 stock-aware rest between operations (voxel stock for 3-axis too).
4. M3 turning in the kernel.
5. C6 persistent naming before any wider direct-editing work (C8), C11 joint solver for the harness target.
6. Integration: expose `flatPatternDxf` (AI + desktop export), an HTTP parametric rebuild route if a non-AI client needs it.

## 5. Closed in this pass

| Commit | What | Evidence |
| --- | --- | --- |
| `71a32fe4`, `29d3198c` | five-axis finishing operation and its voxel stock bracket brought onto main from the `kernel-rotary-stock` worktree (the merged worktrees were removed) | kernel suite 108/108 |
| `c117e271` | M1: scallop (geodesic 3D offset over the drop-cutter surface), spiral, radial, flat-area in the surface engine, kernel (`SurfaceMode`, `center`, flat = finish-floor), planner flat-area finish on freeform parts with ledges, legacy generator spiral/radial finishing made real, desktop picker, API `multiaxis`, clients + OpenAPI snapshot (additions only) | `surface-finishing.test.ts`: ring spacing along the tool-centre surface = target (mean within 2 %), no gouge (verifier), coverage of spiral/radial ≤ half a spacing, flat faces at exact height and full coverage; kernel job claims pass |
| `8a10f5b0` (+ part swept into `e6735d31`) | C1: mirror/pattern of bodies (`bodies`, `join`), mesh and exact; AI schema and validation | `history-bodies.test.ts`: half plate mirrored joined is one closed genus-2 body, exact volume to 1e-9, valid B-rep; patterns with matching mesh/exact ids |
| `0ad8c0b9` (the M2 core work was swept into the parallel session's commit) + `37f57511` | M2: rigid tapping and reaming in the kernel — `tap` / `ream` cycles in the IR (G84 with the feed = pitch x speed, G85 fed in and out), tap and reamer cutters with their 3D models, cutting data (speed factor, feed per revolution, tapping torque), the planner tapping a threaded hole when the control can and reaming a fitted bore, the posts refusing a tap they cannot run, the HTTP contract and the assistant's hole skill | `holes.test.ts`: M29 S… + G84 on Fanuc, G84 alone on Haas, the refusal on GRBL, the replay of the tap in and out, the tapping data (45 % of the drilling speed, one pitch per turn, the torque under the machine's), the reamer's data (60 %, 2.5 x the drilling feed, the radial allowance); kernel suite 117/117, CAM 294 + 689, API contracts 3/3 |
| `8b3a3712` | C12: exact holes on work planes — the exact branch resolves the plane a `plane` feature made (offset, angle, three points, a face of the body) and cuts the hole along its normal; the rebuild publishes the resolved work planes, so the CAM sees a tilted hole's entry and direction and the planner reports it as needing an indexed setup instead of dropping it | `history-brep.test.ts`: the hole on an offset plane is the same exact cylinder, the hole on a 30° plane leaves a cylindrical face and a valid B-rep, a hole on a plane that does not exist is an error and the body keeps its model; `work-plane-holes.test.ts`: the entry and the direction follow the plane, a base plane is unchanged, the planner names the tilted hole |
| Uncommitted continuation | C4: two-distance and distance-angle chamfers in the mesh and exact history; finite positive dimensions, mutually exclusive callouts, explicit equal setbacks and geometrically impossible angles handled consistently. Shared section geometry uses radians internally. API/assistant preserve numeric and expression fields; the desktop removes incompatible fields when switching callout/style. | `chamfer-callout.test.ts`: 12 tests including analytic setbacks/volumes, mesh agreement, STEP round-trip, a sloped wedge's removable angle singularity, impossible angles and a conical hole rim. Together with AI and persisted sidecar integration: 41 tests pass. The mounted desktop panel also exercises callout switching. |

Known unrelated failures seen while testing: `packages/ai/test/harness-inventory.test.ts` (sidecar `workspace.ts` handler
resolution; the two assertions disagree with each other) and the AI MCP test helper typecheck; both predate this pass.

| Uncommitted continuation | C2 (partial): exact rib, sheet, text and coil in `history-brep.ts` — rib/sheet extrude the same thickened outlines the mesh cuts, text extrudes the stroke bars (`textBars`, extracted from `textSolid` so mesh and exact share one source), coil sweeps the wire polygon along the helix chords (a true helicoid is not an analytic surface of this kernel). Also fixed: an internal thread's exact replay was labelled `new` instead of `subtract`, so the cut body kept its exact model silently. Modelled thread remains mesh-only (see §4). | `history-rib-exact.test.ts` (3), `history-sheet-exact.test.ts` (2), `history-text-exact.test.ts` (2), `history-coil-exact.test.ts` (3): valid B-reps, exact/mesh volumes agree; full core suite 2213/2213, core typecheck clean |

## 6. Continuation verification and change log

- 2026-10-19: completed C4 from the existing working-tree implementation; preserved the concurrent CAM changes. Core, API,
  AI, sidecar and desktop typechecks pass. API suite: 22/22, including generated-client consistency and OpenAPI.
  C4/core/AI/sidecar integration: 41/41; mounted parametric panel: 33/33 (including a fresh pass of the initial fillet timing
  failure). The broad core run had 2177 passes and three failures while concurrent checks were
  active: the surface performance threshold, the default five-axis timeout and a probe simulation regression loaded before
  the collaborating session's fix. Fresh reruns of all three files pass 16/16; the surface job takes 1.2 s (30 s gate).
  CAM S1 simulation correctness is recorded separately in spec 32; it does not close M4 stock-aware rest planning.
  The global RM statuses remain unchanged: this is continuation of the owner's concrete kernel work, not an RM acceptance claim.

## 7. Enterprise-grade re-measurement (2026-10-21)

Question: "which gaps can we still close to make the CAD kernel enterprise level". Method: the feature inventory of §1 re-checked
against `main` (b496f33), plus a stress battery run against the exact B-rep kernel (32 Boolean/blend cases, `booleanBrep` +
`validateBrep` + `massProperties`, wall-clock timed; probe script not kept, cases listed below so they can become tests).

### 7.1 Measured robustness of the exact kernel

Passing (valid B-rep, analytic volume where one exists): Steinmetz solid (two equal perpendicular cylinders, volume error 1.4e-12,
1.7 s), box minus sphere through a corner, offset perpendicular cylinders, internally tangent cylinders, coincident cylinder
faces (7e-14), concentric sphere shell (7e-15), torus minus box, torus ∪ torus, skew cylinders, cone/cylinder coaxial, apex on a
face, 1e-3 mm hole (3.1 s), fillet of all box edges r=1 and r=4.9, fillet at a box/cylinder junction.

**Failing (Boolean returns an invalid solid, i.e. the replay falls back to the mesh with a reason):**

| # | Case | Failure | Likely cause |
| --- | --- | --- | --- |
| R1 | sphere ∪ sphere, centres on a common coordinate axis (r=5, offset 4 along x) | closed shell with volume 0 | intersection circle passes through the poles / seam of both spheres (parametrisation singularity) |
| R2 | same pair with a tilted frame (offset (2,2.5,1.5), axis (1,1,1)) | edge used 4 times | seam of one sphere crosses the intersection curve at a vertex; seam split not handled |
| R3 | box ∪ sphere with the sphere centre on a box face | edge used by one face only | equator/seam of the sphere coincides with the planar-face intersection (circle = great circle) |
| R4 | torus ∪ sphere centred on the tube; torus − cylinder through the tube centre line | zero-volume shell / open edges | torus seam circles meet the cylinder/sphere intersection curve; tangent-ish self-crossing patches |
| R5 | box − cylinder exactly tangent to a wall | edge used 4 times | tangential contact is not collapsed to a point/line (±0.001 mm either side works, the exact-tangent case does not) |

All five are *degenerate-alignment* failures, not generic ones: a displaced or off-axis variant of every case passes. That is the
classic enterprise-kernel gap: real parts (centred holes, spheres on a face, tangent bosses) are exactly the aligned cases, so
the fallback to mesh happens on the shapes users model most. Lessons already recorded (tangential hits, poles, seams) point at
the same area in `brep/intersect.ts` / `boolean.ts`.

### 7.2 Gaps, ordered for an enterprise kernel

Tier 1 — correctness and robustness (blocks "enterprise" regardless of features)

| # | Gap | Today | Closing it |
| --- | --- | --- | --- |
| E1 | Degenerate-alignment Booleans R1–R5 | invalid solid → mesh fallback | seam/pole-aware SSI for sphere/torus, tangent contact collapse; each case becomes a regression test with analytic volume |
| E2 | Property-based Boolean/blend fuzzing | hand-picked cases only (`fuzz`/`random` appear nowhere in `brep/*.test.ts`) | seeded generator of primitive pairs × placements (aligned + perturbed), invariants: valid, volume = inclusion–exclusion, A∪B − B ⊆ A; run a bounded sample in CI |
| E3 | Tolerance model | one global `MODEL_TOL=1e-6`, `FIT_TOL=1e-5`; no per-edge/vertex tolerance, no healing on import | per-entity tolerance + sewing/healing pass (gap closing, sliver/short-edge removal, face merging) so foreign STEP bodies open and operate |
| E4 | Failure reporting | `BooleanError` message strings | structured diagnostics (stage, face/edge ids, suggested nudge) surfaced to history, API and assistant instead of a silent mesh fallback |
| E5 | Performance gates | 15 s budget on two recipes; a 1 mm hole takes 3 s, Steinmetz 1.7 s | per-operation timing gates, BVH/face-pair culling, incremental tessellation cache across history steps |

Tier 2 — modelling depth (the ranked list of §1.2 that is still open)

| # | Gap | Notes |
| --- | --- | --- |
| E6 | **Persistent naming (C6)** | no face/edge identity survives a rebuild; only `names` on `polyhedron`. Needed before direct editing and before drawings/CAM features can reference faces durably. Design: identity from (feature id, generating entity, role) propagated through Booleans via split/merge records |
| E7 | Fillets: variable radius, setback vertex blends, non-coaxial curved edges, edge chains with tangent propagation, face-face blends (C3) | refused or mitred |
| E8 | Shell/offset of arbitrary bodies and per-face thickness (C5); offset/delete/replace face on any body (C8) | only extrusions, revolutions, sweeps |
| E9 | Surfacing (C7): patch, trim, stitch, thicken, offset surface, curvature continuity checks (G1/G2), zebra/curvature analysis | `surface.ts` is an evaluation helper, not a modelling toolset |
| E10 | Sketch: offset/trim/extend/project, drag solver, over/under-constraint diagnostics (C13) | |
| E11 | Sheet metal: edge flanges, reliefs, corners, multi-bend unfold of 3D parts (C10) | |

Tier 3 — interoperability and product surface

| # | Gap | Notes |
| --- | --- | --- |
| E12 | STEP: assemblies with instancing/product structure, colours/layers (STYLED_ITEM), PMI/GD&T (AP242), AP203/214 variants; STEP *import* of exact bodies into the history (today `import-step.ts` reads 14 entity kinds — polylines/circles/planar faces — while `brep/step.ts` reads the full set) | route imported solids through `readStepBreps` + healing (E3) |
| E13 | Other exchange: IGES, Parasolid x_t, SAT, 3MF/STL exact-to-mesh options, glTF; DXF 3D | |
| E14 | Assembly: joint solver with limits, motion study, interference over motion (C11) | |
| E15 | Analysis: draft/undercut analysis, wall-thickness map, curvature, section properties, clearance/minimum distance between bodies | reuse `massProperties`, `TriBvh` |
| E16 | Drawings: GD&T symbols, balloons/BOM, assembly drawings, exact silhouettes (C14) | |

### 7.3 Recommended order

1. **E1 + E2 together**: fix the five degenerate cases and land the fuzz harness first, so every later kernel change is measured.
   Owner: WP1 (`brep/intersect.ts`, `boolean.ts`, tests only).
2. **E4** (structured diagnostics) because it makes every later failure visible instead of silent.
3. **E3** healing, then **E12** STEP import of exact bodies — the biggest user-visible interoperability win.
4. **E6** persistent naming, then E7/E8 on top of stable selections.
5. E5 performance gates continuously; E9–E11, E13–E16 by product priority.

Nothing in §7 was implemented in this pass; this section is the measured inventory.

### 7.4 E1 and E2 landed (2026-10-21)

`brep/boolean.ts`, tests in `brep/degenerate.test.ts` and `brep/fuzz.test.ts`. The five failures of §7.1 were not one defect:

| Case | Root cause | Fix |
| --- | --- | --- |
| R1, R2 (sphere ∪ sphere) | a piece of a fitted circle got a parameter range of 3π: a sample out of order by ~1e-12 rad counted as a whole extra turn, so the edge ended 1e-4 mm from its vertex | `stepAngle` / `runningAngles`: signed telescoping steps, exact end angle |
| R3 (sphere centred on a face) | a split vertex that falls exactly on a boundary sample of the seam was never inserted (the "strictly between two samples" test missed it), so the equator circle was not connected to the seam | the sample *is* the vertex |
| R4b (torus − cylinder on the centre line) | a half-edge leaving a node took its direction from a sample a few ulps away (rounding noise), so one of four caps was never closed; plus spline hooks from crowded samples | `dirAngle` uses a sample a real distance away; crowded samples dropped before interpolation |
| R4a (torus ∪ sphere on the tube) | one out-of-order sample of the mesh seed made the fitted spline loop | samples that make the curve turn back on itself are dropped |
| R5 (cylinder tangent to a wall) | the contact is a *non-manifold* edge: no valid exact solid exists | `booleanBrep` retries with the second operand displaced by 3e-6 / 3e-5 / 3e-4 of the model extent and says so in `warnings`; `booleanStrict` keeps the no-recovery behaviour |

Fuzzing (`fuzz.test.ts`): seeded random pairs of box / cylinder / sphere / cone / torus, grid-aligned (poles, seams, tangents coincide)
and generic placements, three operations each; invariants: valid result, `V(A∪B)+V(A∩B)=V(A)+V(B)`, `V(A−B)=V(A)−V(A∩B)` (1e-6, 2e-4 when displaced).
Measured: aligned 16/16, generic 15/16. **Open (E1b):** generic seed 14, a torus and a sphere whose intersection curve folds back within 1e-4 mm of itself
(the ring of the torus face self-crosses in (u, v); displacement up to 3e-4 does not separate it). It is pinned in the test as the single allowed failure.

Evidence: core `bun check` clean; brep suites boolean 17, blend 12, loft 4, offset 5, path-sweep 5, face-edit 2, step 7, drawing-edges 7, gates 23, history-brep 31 and the exact-feature suites all pass.

### 7.5 E3, E4 landed; E12 re-read (2026-10-21)

- **E4** structured diagnostics: `BooleanError.diagnostic` = `{ stage: prepare | arrange | validate, operand?, face?, hint, attempts }`; `booleanBrep` throws it with the displacements it tried; the exact replay reason now ends with `(stage: hint)`. Test: `degenerate.test.ts`.
- **E3** healing: `brep/heal.ts` `healBrep` welds vertices within a tolerance (grid bucketed), welds edges that are the same curve between the same vertices (flipping coedge senses), drops collapsed uses, snaps a welded vertex to the mean of the curve ends meeting there, and returns a before/after validation report. `stepToElements` heals an invalid part and reports `healed` (vertices/edges welded) and a warning; a part that stays invalid is reported unchanged. Tests: `heal.test.ts` (5: box and cylinder written per face, 2e-5 mm jitter, Boolean on a healed body, unrepairable body reported), `scene-step.test.ts` (import of an exploded STEP).
- **E12 correction:** §7.2 said STEP import is limited to 14 entity kinds. That is the legacy prismatic reader (`import-step.ts`); the desktop import dialog already uses `stepToElements` (full `readStepBreps`, assembly placement, units, validation), so exact import into the scene exists. Still open: colours/layers (`STYLED_ITEM`), PMI (AP242), and importing an exact body into a *history* (as a base feature) rather than a scene element.

### 7.6 E6 first step: unique, stable face names (2026-10-21)

Measured before: the features already name their faces (`plate.top`, `bore.side0.0`), and an upstream dimension edit keeps the set of names, but a pattern copies the tool's names (two faces `bore.side0.0`) and a fillet makes 20 faces `blend.side0.2` / `sphere`, so a name could not select one face.
`brep/naming.ts` `uniqueFaceNames`, applied to every exact body at the end of `rebuildExact` (the replay itself keeps the raw names): a name used once stays; a shared name is told apart by the names of the neighbouring faces (`blend.side0.2@plate.side0.0+plate.top+sphere`, topological, unchanged by a dimension edit) and, when that is not enough, by position (`bore.side0.0#1`). Test: `history-naming.test.ts` (names unique, set unchanged by a width edit, deterministic for a pattern, blend names carry their neighbours). Still open for E6: names of faces *after a feature that splits them* are positional, a rename of an upstream feature id renames its faces, and no API yet resolves a stored name back to a face after a rebuild (selection by name in fillet/hole/pushpull).

### 7.7 E5 and E15 first steps (2026-10-21)

- **E15 clearance:** `brep/distance.ts` `minimumDistance(A, B)` — candidates from a tessellation, each refined by alternating exact closest-point queries (`brepLocator`), so a sphere pair is exact to 1e-9 (a mesh would be off by its chord); overlap detected by classification. `assemblyClearance(parts, within)` lists the pairs nearer than `within` mm, nearest first, with the closest points. Tests: `distance.test.ts` (boxes, spheres, cylinder/sphere, torus hole/tube, overlap, touching) and `assembly-analysis.test.ts`.
- **E5 performance:** a 1 µm bore through a 10 mm block took 3.2 s: the tessellator compressed the length of a cylinder by a fixed 0.02, so a 10 mm × 0.006 mm strip stayed 32x longer than wide and was refined into 151 000 triangles. The compression now follows the aspect (`tessellate.ts`), 371 ms and 21 000 triangles. `perf.test.ts` pins tessellation size and per-operation times (bores 0.001 to 3 mm). Everything else in the brep, history and drawing suites unchanged.

### 7.8 E6 name resolution and E10 sketch tools (2026-10-21)

- **E6:** `faceByName(brep, name)` and `matchFaces(before, after)` (`brep/naming.ts`): a stored selection follows a rebuilt body — same name, else surface kind plus the names of the faces around it (survives a renamed feature), else the nearest face of the same kind; each new face is taken once. Test in `history-naming.test.ts`.
- **E10:** `cad/sketch-edit.ts`: `entityIntersections` (line/circle/arc pairs, bounded), `trimEntity` (line → the stretches that stay, circle → the arc that stays, arc → its remaining spans, constraints on removed points dropped) and `extendLine` (to the first crossing with a line, circle or arc, error string otherwise). 7 tests with analytic crossings. Still open for E10: project tool, offset of a sketch chain as sketch entities (`offsetRings` works on polylines), drag-to-edit in the desktop.

### 7.9 E14 joint solver and E16 GD&T (2026-10-21)

- **E14:** `cad/kinematics.ts`. Joints (fixed, revolute, prismatic, cylindrical) with limits, given in the zero pose; `solvePose` composes the tree from the ground, applies gear (signed ratio) and rack (pitch radius) couplings, and *reports* limit violations instead of clamping; `validateKinematics` refuses unreachable parts, closed loops, duplicate ids, missing axes and couplings between the wrong joint kinds; `motionStudy` drives a joint over a range and checks every frame for limits and exact clashes between the moved solids (declared-expected pairs ignored). 8 tests with analytic poses (a quarter turn about an offset pivot, an elbow chain, rack arc = pitch radius x angle, a gear ratio, an arm that hits a post between 60 and 130 degrees and crosses its limit at 130). Joints from `jointsFromHoles` (`InferredJoint`) map directly (`revolute`/`fixed`, origin, axis). Still open: ball and planar joints, closed loops (four-bar), contact/cam joints, a desktop animation.
- **E16:** `drawing/gdt.ts`: 14 characteristics of ISO 1101 drawn from strokes (no font), feature control frames (symbol | zone with Ø and (M)/(L) | up to three datums), datum feature symbols, frame leaders and balloons, with validation (datum needed for orientation/location/runout kinds, one capital letter each, no cylindrical zone on a flatness). `generateSheet` takes `gdt`, `datums`, `balloons` placed on world points through a principal view, reports them in `dimensions`, warns when a frame names a datum no symbol defines. The assistant's `cad.drawing` options schema accepts them. Tests: `gdt.test.ts`, `sheet.test.ts`, `action-inputs-cad.test.ts`. Still open: GD&T on section/detail views, automatic datum and balloon placement from the BOM, assembly drawings with exploded views.

### 7.10 E7 first step: variable-radius fillet on a straight edge (2026-10-21)

`brep/blend.ts` `variableFillet(brep, candidate, radiusA, radiusB)`: the radius runs linearly along a straight edge between two planes; the circular cross-section is kept in every plane square to the edge (the surface is the cone through the two end arcs; the rolling-ball envelope of a linearly changing radius differs from it by the second order of the taper). The tool is the exact loft of two homothetic cross-sections — the margin scales with the radius, so the lines of one section pair with the lines of the other and the arc with the arc — extended past a free end along the taper, then one exact Boolean. Test (`blend.test.ts`): box edge 30 mm from 1 to 3 mm removes `L (1 - pi/4)(r0² + r0 r1 + r1²)/3` to 1e-6 relative, valid B-rep, equal radii equal the constant fillet, STEP round trip, refusals (face too narrow, curved edge, non-positive radii). Not wired into the parametric history yet because the mesh rebuild has no variable-radius counterpart (the exact and mesh bodies must agree). Still open for E7: radius laws other than linear (smooth, per-point), variable radius meeting other blended edges (end cuts), setback vertex blends, curved non-coaxial edges, face-face blends.
