# 33 — CAD and CAM kernel gap analysis (Fusion 360 / hyperMILL reference)

> 2026-10-24: the forward plan for every open item below (C*, M*, K3–K7) is [spec 39](39-professional-parity-master-plan.md) and specs 40–55. This spec stays the measured ledger of what was closed and when.

## Owner-authorized completion increment (2026-10-22)

The owner accepted the current-source reclassification and requests implementation of the actual gaps, with regression
protection. This section preserves that request across sessions. It is a concrete continuation of this kernel scope, not a
claim that an RM step or commercial parity is complete. Historical inventories below are evidence of past states, not a
current missing-feature list. Read the source and this ledger before resuming.

Verified starting point: clean HEAD `9dbbb5c`; 2,416 core tests passed. A subsequent focused remeasurement passed 20 tests
and reproduced the issues below. Existing STEP/healing, IGES, 3-axis carried-stock rest, adaptive stay-down links, scallop,
variable straight-edge fillets, assembly loops and GD&T must remain functional. The tolerance budget is informational in
the current public contract; its value is not measured physical error. A refusal is evidence of an unsupported capability,
not implementation of that capability.

### Scope and acceptance ledger

- **K0 — correctness fixes (closed).** The magazine-capacity error is now collected before the claims and the release
  assessment, so a 3-tool job on a 1-tool magazine returns `release: "blocked"` and a failed `machine-limits` claim naming
  the magazine. A tangent-hole Boolean recovery keeps its provenance: the parametric rebuild reports
  `bore: degenerate alignment: the second operand was displaced by 5.2e-5 mm …`, `historyToStep` carries the same warnings
  beside an exported valid body, and the assistant's `cad.parametric_exact` contract has an optional `warnings` field (older
  results without it stay decodable). Evidence: `packages/core/src/cad/history-recovery.test.ts`,
  `packages/core/src/cam/kernel/machine-claims.test.ts`, `packages/ai/test/parametric-exact.test.ts`.
- **K1 — nominal curves (closed for the named families).** Shape expansion keeps the historical construction entity ids and
  constraints and attaches runtime-only nominal curve provenance to the solved sketch; the display sampler and the exact
  profile adapter consume the same geometry. An ellipse is four rational quadratic Bézier spans (an exact conic), a Bezier
  or NURBS keeps its knots, a spline keeps the sketcher's uniform Catmull-Rom law as cubic spans. Measured: the builder's
  12 x 6 mm ellipse extrudes to 6 exact faces (4 extrusion + 2 planes) with the analytic volume to 1e-7 mm³, its display
  profile stays within the 0.01 mm chord budget, a parameter edit keeps the nominal curve (0.25, 12 and 80 mm radii), a cubic
  Bezier profile has its analytic area, a revolution and a straight sweep keep the nominal profile, and the independent
  OpenCascade reader reads the STEP of an ellipse, a slender ellipse, a Bezier, a revolution and a sweep at their analytic
  volumes (within 0.1 %). Refusals replace approximations: a nominal curve used as a sweep path is refused with an explicit
  reason instead of silently using the construction chords, and trim/extend refuse to edit construction geometry while
  keeping the nominal curve of unrelated geometry. Fixed on the way: the Newton projection of a curve now takes a descent
  step where the squared distance has negative curvature, which had dropped faces of a slender ellipse from the
  triangulation. Evidence: `packages/core/src/cad/sketch-curves.test.ts`,
  `packages/core/src/cad/history-nominal-curves.test.ts`, `packages/core/src/cad/sketch-edit.test.ts`,
  `apps/desktop/test/cad-iges.test.ts`.
- **K2 — general blends (first family closed).** The concave circular rim between an outward spherical cap and a plane is now
  a blend candidate and is blended with an exact rolling-circle construction: the section is the meridian of the rolling
  circle and of the remaining sphere, revolved, so both contact circles are exact and no tangent Boolean is needed. Measured:
  the fillet surface is a torus, the two contact circles have matching normals to 1e-9, the volume equals the analytic
  sectional volume (the plane, the rolling circle and the sphere) for cap depths above and below the equator and under an
  arbitrary rigid placement, the shell is valid, and STEP reads it back with the same volume. Refusals stay explicit: a rim
  that reaches another boundary of the support, a chamfer of this family, a trimmed cap and an interacting blend are refused
  with their reason and leave the body unchanged. The parametric history uses this native result for the derived mesh (the
  exact prefix plus a checked tessellation), so viewport and CAM no longer keep the old sharp rim; other selections keep
  the previous mesh blend path. Evidence: `packages/core/src/cad/brep/blend-sphere-plane.test.ts`,
  `packages/core/src/cad/history-curved-fillet.test.ts`. The coaxial cone/plane foot is the same kind of result: the revolved
  rolling ball is an exact torus, the added volume matches the analytic section, a fillet wider than the cone face is refused,
  and the parametric history derives the mesh from that solid (`packages/core/src/cad/brep/blend-cone-plane.test.ts`). Still
  open in K2: a rim between two curved faces, tangent chains, blend junctions and the general rolling-ball law (the existing
  variable fillet keeps its circular cross-section law).
- **K3 — surface modeling (pending).** General trimming curves and normal-offset/thickening of curved patches, with a
  controlled geometric error, self-intersection handling and checked topology. Existing rectangular/isoparametric trim,
  planar normal thickening and explicit curved axial thickening stay supported. General normal offsets need not be
  rational NURBS exactly; approximation must meet a declared tolerance rather than silently change the requested geometry.
- **K4 — general multiaxis execution (first increment closed).** The multiaxis operation now carries an explicit
  `mode: "parallel" | "contour"` from the shared operation schema through the HTTP and assistant contracts into the kernel:
  omitting it keeps the previous parallel generation and the same NC bytes, the two modes produce distinct NC, and an
  unknown mode fails decoding. The contour strategy no longer joins reachable contact samples across an unreachable
  interval: it retracts and starts a new section, so the path never cuts through a gap. Required contact samples that were
  unreachable or never cleared the part are counted and make `part-coverage` unresolved with that count, so a program with
  uncovered regions cannot read as complete coverage. Evidence: `packages/core/src/cam/kernel/five-axis-job.test.ts`,
  `packages/core/test/cam/five-axis.test.ts`, `apps/sidecar/test/cam-kernel.test.ts`. Still open in K4: contact generation
  over regions hidden from the vertical-ray search, path-level orientation corridors and collision planning wired into
  generation, head/table and head/head machines, bounded intermediate motion, singularities and safe rewinds.
- **K5 — stock and quality evidence (pending; first seed landed).** A rotary replay on a five-axis machine seeds its voxel
  stock from the height field the three-axis operations carved (`carryHeightField` in `kernel/execute.ts`). Five-axis moves
  are not written into that field, so the seed is the predecessor stock. The carry is one-sided: a voxel wholly above every
  overlapping column is certainly gone, a voxel whose top rises above the lowest column in its footprint is only possibly
  gone, and nothing is ever put back. An untouched field leaves the raw box. A three-axis-only job still has no voxel
  bracket. The bracket stays a bracket: `material-removed` is not passed, `no-gouge` stays unresolved for turned moves, and
  the tolerance budget stays informational. Evidence: `packages/core/src/cam/kernel/stock.test.ts`,
  `packages/core/src/cam/kernel/rest-stock.test.ts`, `packages/core/src/cam/kernel/five-axis-job.test.ts`. Still open:
  gouge and residual proof of the final NC, machine clearance under explicit controller assumptions, declared rigid setup
  transfers, numerical error budgets, and any change to the public tolerance contract. Unknown or excessive bounds cannot
  establish requested-quality verification.
- **K6 — turning/mill-turn (pending; boring preview landed).** `planBoring` in `kernel/turning.ts` bores a declared pilot out
  to a finished internal profile. The bar is the same solid cylinder the external plan uses; the cavity grows inward from
  the pilot; every removed volume is analytic and the worked stock partitions as removed + remaining + unmachined. A
  finished diameter below the pilot, a bore that breaks out of the bar, an unordered profile, and a bar the chuck cannot
  hold are refused and emit no NC. The external NC bytes of the reference fixture are unchanged. Release stays `preview`:
  an ideal point tool. This planner is not a manufacturing-job operation and is not `cam.turn`. Evidence:
  `packages/core/src/cam/kernel/turning.test.ts`. Still open: grooves, threading, parting, insert compensation, chuck
  clearance beyond the bar-diameter refusal, live tools, the C axis, stock transfer, and qualification on a real machine.
  The external-turning preview and the legacy turning generator stay as they were.
- **K7 — persistent references (first increment).** A push/pull or a draft may name the face (`name`, for example `plate.top`).
  The named face is the one that moves or tilts, on the exact replay and on the mesh rebuild, even when `near` is stale. A name
  that no longer exists is an error and the body is left unchanged; it is never replaced by a nearby face. The assistant
  history schema accepts the optional field on both features. The moved face keeps its own name (the push/pull's tool does not
  rename it to `pushpull.top`), so a later feature can still refer to the face that was moved. Evidence:
  `packages/core/src/cad/history-brep.test.ts`, `packages/core/src/cad/history-face-reference.test.ts`,
  `packages/ai/test/modeling-features.test.ts`. Still open: lineage through faces that a later feature splits, deletes or
  modifies, and selection by name in drawings and CAM. A nearest-face heuristic must never silently resolve an ambiguous
  design reference.

Specialist barrel/swarf/impeller/tube packages remain explicit future product choices, not prerequisites silently added to
the six accepted functional gaps. Do not claim missing features from stale sections, derive parity from passing tests or
strategy names, or promise that all possible regressions have been excluded.

### Ownership and verification

The named kernel continuation owns WP1 `packages/core/src/cad`, WP2 `packages/core/src/cam` and their tests plus the
corresponding design specs. Cross-WP contracts must be amended in the owning design spec before touching API/sidecar/AI/
desktop adapters; changes must propagate through existing interfaces instead of introducing duplicate implementations.
This exception is the owner's concrete kernel request under roadmap `00-how-to-follow.md` section 1; unrelated RM work
and global RM statuses are unchanged.

Deepen the existing geometry, stock, motion and evidence modules. Their interface is the test surface; record supported
geometry, error bounds and refusal semantics. Reuse existing adapters at each real seam for locality and leverage. Write
regression tests that fail on the pre-change behavior, keep independent analytic/external-reader checks, run relevant
package tests and typechecks, regenerate the web API reference before workspace checking, and broaden to downstream and
repository-wide gates when the changed contracts justify it. Do not regenerate goldens to conceal a semantic change.

Implementation log: K0, K1, K2 (first family, including the coaxial cone/plane foot), K4 (first increment) and K7 (named push/pull and draft) are implemented with the evidence named in their
entries. Gates run on this tree: `bun check -p packages/core/tsconfig.json` clean over 417 files; the core suite passes
(2,427 tests over 164 files at the K0/K1 baseline, and 193 tests over the four CAD history and blend suites after the K2
mesh wiring); the workspace typecheck passes all 15 package tasks; the repository suite's failures are sandbox limits (a
local server cannot bind a port, Metal cannot write its cache), and the 66 tests re-run outside the sandbox pass. K5's
rotary voxel seed and K6's internal boring preview then landed: `kernel/stock.test.ts`, `kernel/rest-stock.test.ts`,
`kernel/turning.test.ts` and `kernel/five-axis-job.test.ts` pass (36 tests). K3 and the rest of K2, K4, K5, K6 and K7
have not run an acceptance gate and stay open.

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
| M3 | Turning in the kernel (facing, OD/ID roughing and finishing, grooving, threading, parting) with stock evolution | legacy generator only, no kernel evidence | **external turning closed in this pass** (§8): face skim, diameter-bounded roughing on the evolving stock and profile finishing, with the bar and the spindle bounded by the turning centre; internal boring is a preview planner (`planBoring`, §8.1), not a job operation; grooves, threads and parting still open; mill-turn later |
| M4 | Stock-aware rest: operation B consumes the stock A left (spec 29 §6) | rest from a previous tool diameter | 3-axis rest reads the carried height field; a rotary replay seeds its voxel stock from that field (K5 first seed). Setup transfers and gouge proof of the final NC stay open |
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

### 7.11 Silent wrong results: found by a wider fuzz, guarded (2026-10-21)

A wider aligned sweep (seeds 17-90, off-line script; the CI test keeps 16 + 16 + 12) found what the validity checks cannot see: **valid, closed solids with the wrong volume**.

- seed 41 (sphere r 4.5 x cylinder r 3.5, aligned): the displaced recovery returned a solid 8.7 % off (intersection 106.6, truth 171.5 by Monte Carlo with exact membership) because one of the two displacement directions made the pipeline produce a wrong but valid result.
- seed 81 (torus R 4.5 r 2.5 x sphere r 4.5 whose south pole lies exactly on the torus): intersection 102.67 against 101.845 by a 360^3 grid (+0.8 %), difference A-B 0.8 low, union and B-A right; displaced by 1e-4 / 1e-3 mm the intersection is **10.27**, valid. Cause not found yet: a sphere pole on or near the other solid's surface makes a fragment misclassified; the exact volume of each result is right, the fragment set is not.

Guards added in `booleanBrep` (the strict pipeline `booleanStrict` is unchanged):
1. a **pole or apex on the other solid's surface** (sphere poles, cone apexes, `poleOnOther`) goes straight to the recovery, not through the strict pipeline;
2. every **recovered** result is checked against the operands by a 3000-point low-discrepancy sample of their box (exact point location in each operand) against the result's exact volume (6 sigma);
3. and by the **volume identities** of the displaced pair, `V(A u B) + V(A n B) = V(A) + V(B)` and `V(A - B) + V(A n B) = V(A)`, which resolve what the sample cannot (the 0.8 % case): the three operations are computed once per displaced pair and shared (`displacedSet`), the exact volume of each result is cached.
With these seed 41 is correct (the bad direction is rejected) and seed 81 returns the intersection 101.824 (grid 101.845); the first operation on a pole-on-surface pair costs ~30 s (three booleans and four exact masses), the others come from the cache. `fuzz.test.ts` displaced tolerance is 1e-3 because the three operations may be displaced differently.

Open, in order of value: the misclassification itself (a fragment touching a sphere pole), a Boolean-level identity check cheap enough to run on every result of a history replay (today only on the recovery path), and the 10-15 s torus x torus / torus x sphere cases (seeds 74, 80, 82: `SLOW` in the sweep).

### 7.12 The misclassification was a tessellation bug (2026-10-21)

Following up §7.11: the "wrong" sphere fragment was classified correctly and was the right fragment — it **tessellated to no triangles with no warning**, so its volume was missing from the exact mass (10.26 for an intersection whose area check showed a torus patch of 69.06 mm² matching the truth and a sphere face of 0.00). Cause: an intersection vertex a few microns off the seam, near a sphere pole. The seam piece says u = 0, the curve through the same vertex says u = -0.63 (the angle around a pole 6 µm away is arbitrary); the ring builder read that jump as a pole line and built a spike that the triangulation dropped. `isSingular` now treats a point on a sphere within 0.5 % of the radius of a pole as a pole for the purpose of u (it takes u from its neighbours; its 3D point is unchanged). Torus x sphere with the pole displaced 1e-3 mm: intersection 101.78 (was 10.26), union + intersection balance to 1e-3; at displacements of 1e-4 and more the strict pipeline now balances too. Exactly on the surface (or within 1e-5) the strict pipeline is still 0.8 % off (102.668 against the grid's 101.845) — the recovery with the volume identities of §7.11 handles it (a pole on the other surface is routed there directly). Test: `degenerate.test.ts` (pole 1 mm off a torus). Still open: why the strict pipeline is 0.8 % off with the pole exactly on the surface.

### 7.13 E8: exact shell of any body made of planes and cylinders (2026-10-21)

`brep/shell.ts` `shellBrep(brep, wall, { open })`. The cavity of a shell is the body eroded by the wall, and the part of the body less than the wall from its surface is the union of the pieces the surface is made of swept by a ball: a slab per planar face (its outline extruded inward, through `faceProfile`), a band per cylindrical face (revolved rectangle `r - t .. r + t` over the face's axial and angular extent), a cylinder per straight edge, a torus per circular edge (partial arcs too), a sphere per vertex. The cavity is the body minus those pieces and the shell is the body minus the cavity — exact Booleans only, the faces keep their analytic surfaces (planes, coaxial cylinders, a torus where a boss meets its plate). Convex edges and vertices need no piece (the slabs cover them); an edge is re-entrant when a step into one face, away from the edge, comes out in front of the other face's plane (the first test, "the normals' sum probes outside", was wrong — it is the air side at both kinds of edge). Faces left open are not swept, with their edges and vertices, so the cavity reaches them and the face disappears. Pieces that would touch along a line of tangency are made a millionth larger so they cross.

Results: closed box → two shells, cavity `26 x 16 x 6` exact; open top → one shell, volume `6000 - 26 x 16 x 8`; an L bracket → the re-entrant corner rounded by a cylinder, cavity 5374.888 against the grid's 5374.858; a plate with a through hole → cavity `(36 x 26 - pi 7²) x 6` to 1e-6; a boss on a plate → a torus at the foot, volume against exact point location within 4 sigma. Refused with a reason: sphere, cone, torus, NURBS faces, a cylinder thinner than the wall, a circular edge smaller than the wall (the offset is then a spindle), a wall of half the body or more. Tests: `shell.test.ts` (6).

The shell is not wired into the parametric history: its `shell` feature names an extrusion and the mesh rebuild has no counterpart for an arbitrary body, so the exact and mesh bodies would disagree; the function serves exact scene elements and imported STEP solids. Still open for E8: cones, spheres and tori (offset surfaces of revolution), per-face thickness, a face offset outward (thicken), offset of a body (the cavity is `offset` by `-t`; the outward offset needs the same pieces united with the body).

### 7.14 E13 first step: mesh exchange formats; outward offset tried and withdrawn (2026-10-21)

- `brep/export-mesh.ts`: `brepToStl` (binary), `brepToStlAscii`, `brepToObj` (a group per face), `brepToGltf` (glTF 2.0, a primitive per face with the face name in `extras`, metres, embedded buffer), `brepTo3mf` (core spec, millimetres, a stored ZIP written by `zipStore` with CRC-32), all from the exact body's watertight tessellation at a chosen `chordTol` / `angleTolDeg`, vertices welded so the indexed formats are closed manifold meshes. Tests: `export-mesh.test.ts` (STL volume against the exact volume, tighter chord = closer volume, OBJ closed manifold, glTF accessors agree with the buffer, 3MF counts and ZIP directory, the CRC-32 check value 0xCBF43926). Still open for E13: IGES, Parasolid x_t, SAT, STEP AP242 PMI, colours, DXF 3D, and wiring these to the API, the assistant and the export dialog.
- Outward offset of a body by the same dilation (a body united with outward slabs, edge cylinders and vertex spheres) was prototyped and **withdrawn**: the unions of pieces that touch along lines of tangency (an edge cylinder against the slab's outer plane, spheres against cylinders) fail in the Boolean (`edge used 3 times`, faces that give no triangle) even with the pieces enlarged a millionth. The shell does not hit this because its pieces are subtracted from a body whose faces they cross. A reliable offset needs either the offset surfaces and their trimming (a real offset kernel) or a Boolean that handles tangent contact; neither is done.

### 7.15 Exposed to the assistant and the desktop (2026-10-21)

- `cad.distance` (exact gap between two solids, closest points, faces) and `cad.shell` (a shell on paper: exact shell and cavity volumes, shell count, faces left open by face name, or the reason it cannot be made) are assistant read actions: `sceneDistance` / `sceneShell` in core (`scene-analysis.ts`), input and result schemas in `@cadcamfun/api`, the actions in `@cadcamfun/ai` (`cad.txt` prompt, harness inventory regenerated, catalogue budget 31 000 -> 31 500), handlers in the sidecar (`cadShell`, `cadDistance`), tested end to end through the bridge (`ai-exact.test.ts`). `cad.assembly` also lists the closest pairs of parts (`clearance`).
- The desktop assembly automations have a "Closest parts" button (`sceneClearance`): pairs within 5 mm, nearest first, with the exact gap or "overlap".
- `minimumDistance` now detects the overlap of boxes that share planes (every vertex of one lies on a face of the other) by also testing triangle centres.
- Healing (`healBrep`) is applied on STEP import in `stepToElements`, which the desktop import dialog uses; the generated clients are in step (`generate:check` passes).

### 7.16 Seed 14 closed: spurs of several samples (2026-10-21)

The torus x sphere case pinned as a known failure since §7.4 was not a near-tangency (displacements up to 3e-3 of the extent did not help). The intersection piece between two vertices carried a **spur of several samples**: the point sequence ran forward, retraced itself (cosine -1 between consecutive steps) and came back, so the edge's polyline crossed itself in the face's (u, v) and the triangulation refused it. The earlier filter dropped a single reversing sample once; a spur of seven samples lost only its tip. `boolean.ts` now removes reversing non-vertex samples until nothing turns back (at most 200 passes). Added with it: a fit that falls back to straight spans (degree 1) if a cubic through the data strays from a span's chord by more than a quarter of the span (no data of the suite triggers it yet), and a fourth displacement step (3e-3 of the extent) for the recovery. `fuzz.test.ts` no longer pins a failure: aligned 16/16, generic 16/16, blends 12/12.

### 7.17 Wider sweeps, ball and planar joints (2026-10-21)

- Off-line sweeps with the seeded generator (not in CI, they take minutes): seeds 17-90 and 91-125 generic placements, 91-125 aligned — all pass; aligned 17-90 had one failure each of the kinds fixed in §7.11-7.16. Seed 114 aligned (a torus and a sphere that overlap by 0.07 mm: a lens of about 0.05 mm³) is the one failure left in these sweeps: the intersection comes back as a sliver of non-positive volume and the Boolean says so (the union and difference are right, equal to the disjoint results within the lens); it is reported, not silent.
- `kinematics.ts`: `ball` (three turns about the world axes through the origin, x then y then z) and `planar` (two slides in the plane square to the axis, and a turn about it) joints, with tests on analytic poses. Limits are on the single-axis joints only. Still open: closed loops (four-bar), contact/cam joints, limits on ball and planar joints, a desktop animation.

### 7.18 The 0.8 % strict error with a pole near the surface: routed to the recovery (2026-10-21)

The strict pipeline with a sphere pole on the torus (or within ~1e-5 mm of it) gave an intersection 0.8 % high and a difference 0.8 % low, and sound results from about 1e-4 mm. Rather than leave a window of silent error, `poleOnOther` now routes a pole or apex within 2e-4 of the model's size of the other solid's boundary to the recovery, whose volume identities and sampled check pick a consistent displacement. Measured on the §7.11 pair with the pole displaced 0, 1e-5, 5e-5, 1e-4 and 1e-3 mm: union + intersection = A + B and difference + intersection = A to 1e-4 mm³ in every case, intersection 101.81 against the grid's 101.845 (the displacement accounts for the difference); 9-19 s per set of three operations. The strict pipeline itself still has the window (`booleanStrict`); its cause is not found.

### 7.19 Shell of cones, spheres and tori (2026-10-21)

`shellBrep` now also sweeps faces of revolution: a sphere (the annular sector between `R - t` and `R + t` over the face's latitudes), a cone (the strip within `t` of its generator, ends square to it), a torus (the sector of the tube between `r - t` and `r + t`, or for a whole torus one torus less another), each revolved over the face's angular extent (a seam or a point on the axis means the whole turn). The face must be bounded by circles about its axis and meridians. Results (`shell.test.ts`): a ball r 10, wall 2 → cavity `4/3 pi 8^3` exactly; a frustum 6 -> 3 over 10, wall 1 → the eroded frustum exactly; a torus R 10 r 3, wall 1 → `2 pi^2 R (r - t)^2` exactly; a hemispherical dome on a plate (cavity 4769.28, exact point location 4768.9 +- 37) and a countersunk plate (4690.25 against 4688.6 +- 22). Two things found on the way: a planar slab whose hole wall is tangent to a dome's equator (`interpolation points coincide`) needs its outline made 1 % of the wall wider, tried only after a failure because the margin removes a sliver (the countersunk plate's cavity was 5.6 mm³ low with it); and a piece that is tangent to the body along a curve is what the Boolean cannot do, which is also why the outward offset (§7.14) stays open. Still refused: faces of revolution bounded by anything else (a cone cut slantwise), per-face thickness, an offset outward.

### 7.20 Full-suite re-run after `d8a2bc4` (2026-10-21)

The gap left open above ("the suites of all packages were not re-run in full after the last commit") is now measured: `bun test packages apps` ran 5068 tests across 518 files in 633 s — 5040 pass, 28 fail, 9 errors. No B-rep, history, scene, fuzz, shell or kinematics test is among the failures. The failures cluster outside the CAD kernel: source-sidecar lifecycle (3), observability, native provider/MCP connections, phone/companion end-to-end (4), harness inventory, plus one five-axis kernel finish test. Two caveats on attribution: during the run a parallel session was editing `packages/core/src/cam/kernel/{contracts,execute,five-axis-job.test}.ts` in the same worktree, so the five-axis failure is against work in progress, not against `d8a2bc4`; and the run's exit status was masked by the output pipe, so the counts above are the runner's own summary. The committed `packages/web/src/data/api-reference.json` is stale at HEAD (`--check` reports 155 added lines); regenerating it was reverted because it would have mixed in the parallel session's uncommitted API changes. `bun run generate:check` (generated clients) passes. Open items remain exactly as listed in §7.17–§7.19: aligned seed 114 (a 0.07 mm torus/sphere lens reported, not returned), the strict-pipeline pole window, outward offset, per-face shell thickness, E9 surfacing, E11 edge flanges, IGES/Parasolid, variable fillet in history, closed-loop and contact joints.

### 7.21 The nine open gaps of §7.17–§7.20, closed or refused with a reason (2026-10-21)

Every item the previous entries left open, with what the kernel does now and what it measures. The rule throughout: a refusal is a result, a wrong solid is not.

| Item | Status | What it does now | Measured |
| --- | --- | --- | --- |
| Aligned seed 114 | closed | the Boolean's orientation check re-checks the **exact** volume when the coarse one only reports an orientation issue (`brep/boolean.ts`) | the torus R 6.5 r 2 and the sphere r 4 overlap by a lens of 0.0642 mm³; the coarse tessellation measured it as −2.9e-5 mm³ (thinner than its chord), so the result was refused; the lens is now returned and the volume identities hold to 1e-3 |
| The strict pipeline's pole window | closed by routing | `poleOnOther` sends a pole or apex within 2e-4 of the model size to the verified recovery (§7.18) | the test now sweeps five offsets (0, 1e-5, 5e-5, 1e-4, 1e-3 mm): union + intersection = A + B and difference + intersection = A to 1e-4 mm³, intersection 101.81 against the grid's 101.845; `booleanStrict` still has the window, its cause is still not found |
| Per-face wall (`brep/shell.ts`) | closed | `shellBrep(body, wall, { wallByFace })`; a shared edge or vertex takes the thicker of the two walls, so the cavity never breaks through the thinner neighbour | a 30 × 20 × 10 box with the top face at 1 mm and the rest at 2 mm → cavity 26 × 16 × 7 exactly; an unknown face index and a non-positive wall are refused with the reason |
| Outward offset | closed for the shapes it can build, refused otherwise | `offsetBrep`: a sphere and a torus grow analytically; a rectangular box is grown by `2t` per side and every edge of the new box is blended by `t`; any other body uses the boundary dilation (bands, edge cylinders, vertex spheres) united with the body | the ball r 10 → r 12 to 1e-5 relative; the box 30 × 20 × 10 by 2 mm → `V + S t + pi (a+b+c) t^2 + 4/3 pi t^3` to 1e-3 mm³, in the identity frame and in a rotated and translated one; a body whose pieces touch it only along curves is refused with the Boolean's reason (the withdrawn construction of §7.14) |
| Variable fillet in the history | closed | the `fillet` feature takes `radiusEnd` (a radius running linearly along a straight edge from its lexicographically smaller end); the mesh rebuild lofts the two end sections, the exact replay cuts the conical `variableFillet` edge by edge | both rebuilds remove `L (1 - pi/4)(r0^2 + r0 r1 + r1^2)/3` to 1e-4 relative on the removed volume; the exact body classifies in/out across the taper; a chamfer refuses `radiusEnd` |
| Closed loops and contacts (`cad/kinematics.ts`) | closed | a joint marked `closesLoop` is a constraint outside the pose tree; the passive joints are solved by Gauss-Newton on the closure residual with a backtracking line search; the pose reports the closure error per loop (position in mm, axis error dimensionless); contacts report their exact distance, overlap and a clearance violation per frame | a four-bar closes to 1e-6 mm; a loop that cannot close (every joint driven) is refused with the residual; a ball joint's angular misclosure is caught (`closure[0].angularError`), not hidden by the position error; a declared contact whose parts are absent is refused |
| E11 edge flanges (`cad/sheet-metal.ts`) | closed for full-width free edges | `flanges [{end,length,angle}]` on the exposed width edges of an existing sheet, with an optional `relief {width,depth}` that cuts rectangular bend-end notches (turns up to 90°) and updates the flat blank | the mesh and the exact rebuild agree to 1e-6 relative on the volume for ±90° and 60° bends at both ends; the developed length gains the bend allowance; the blank's CUT outline carries the notches and its BEND line is inset |
| E9 free surfaces (`brep/surface-patch.ts`) | closed in the first cut | `surfacePatch` (tensor-product, rational), `trimSurfacePatch` (exact isoparametric curves, never samples), `stitchSurfacePatches` (heals the common edges, keeps the open boundary), `thickenSurfacePatch` (exact normal for a planar patch; an explicitly axial thickness for a curved one) | a trimmed patch stays an open body (`manifoldSolid: false`) with a tessellation; two patches stitched keep 6 boundary edges; the planar thickening is 200 mm³ exactly and the curved axial one 200 mm³ to 1e-5; a curved patch without an explicit direction is refused ("an exact normal offset of a general NURBS surface is not supported"), and a patch that folds across the direction is refused |
| IGES and Parasolid (`brep/iges.ts`) | IGES closed, Parasolid refused | IGES 5.3 (80-column S/G/D/P/T, shared topology, analytic and rational surfaces) written and read; Parasolid returns `parasolidDiagnostic()` | the round trip keeps the volume to 1e-6 and the validity for box, cylinder, cone, sphere, torus and a drilled plate; an unsupported entity type, a transformation on an entity and a truncated record are reported, never guessed |

### 7.22 The IGES writer was wrong, and the internal round trip could not see it (2026-10-21)

The IGES round trip above passed on its own reader and was still wrong: a numeric parameter split across two physical records (`14` written as `1` then `4`) moved a box vertex, and OpenCascade read the body as 1420 mm³ instead of 1680. The writer now keeps every parameter whole (`parameterLines`) and never lets a numeric field straddle a record. The external reader is now the oracle: `apps/desktop/test/cad-iges.test.ts` reads the written file with the installed `occt-import-js` and compares its mesh volume with the exact one (box, cylinder, cone, sphere, torus and a drilled plate, within 0.2 % of OCCT's own triangulation). A writer/reader pair that shares a mistake cannot find it; an independent reader can.

### 7.23 Every new capability is an AI action, and the refusal travels with it (2026-10-21)

The items above are reachable from the assistant, each with a preview that changes nothing and a governed write that stores a checked copy:

| Action | Kind | What it does |
| --- | --- | --- |
| `cad.shell` | read | the shell of a solid on paper, with `wallByFace` overriding named faces |
| `cad.offset` | read | the outward offset on paper: volumes and validity |
| `cad.motion` | read | a motion study over the exact scene parts: closure, contact gaps and clearance violations per frame |
| `cad.surface` | read | a NURBS patch, a stitch or a thickening, checked, with its body kind |
| `cad.exchange` | read | the exact STEP or IGES text of the named solids |
| `cad_edit.shell` / `cad_edit.offset` | write | store a validated copy of that shell or offset; the source stays |
| `cad_edit.surface` | write | store the exact patch (an open surface) or the thickened solid |
| `cad_edit.import` | write | IGES manifold solids (analytic and rational surfaces, shared topology); a Parasolid request returns the unsupported-format diagnostic; an incomplete import stores nothing |

An open surface is a typed body: it is excluded from the exact solid analysis and from the CAM volume model (`cam/model/element-mesh.ts`), so a curved patch never becomes a fictitious stock. The desktop mirrors the new writes into the editor (`features/ai/lib/editor-sync.ts`) and draws an open body from both sides.

Still open, and refused rather than approximated: the strict pipeline's pole window (§7.18), an outward offset of a general body whose dilation pieces touch it only along curves, a general normal offset of a freeform surface, partial-width and adjacent-edge sheet flanges, variable fillets meeting other blended edges, IGES trimmed-surface entities (the writer writes analytic and rational surfaces only), Parasolid, and a general cam-following dynamics for contacts (the motion study reports non-penetration, not forces).

## 8. Turning and the machine catalogue (2026-10-21)

- **M3 external turning** is in the kernel (`kernel/turning.ts`, `cam.turn`, `cam_edit.turn`): face skim, diameter-bounded roughing on the evolving stock, profile finish, analytic volumes with the retained bar tail, always `preview`. The turning centre bounds the bar and the spindle; a bar it cannot hold is refused. Internal boring is the separate preview planner in §8.1 (`planBoring`): analytic volumes from a declared pilot, release stays `preview`, and it is not a job operation. Still open: grooves, threads, parting, insert compensation, chuck clearance, controller qualification.
- **Machine catalogue**: `MACHINES` (milling) and `LATHES` (turning / mill-turn: Mazak INTEGREX i-200 class, Okuma MULTUS B300II class, 2-axis lathe) plus KERN Micro HD HSK25/HSK40 with a native Heidenhain post. The milling kernel refuses a turning centre with its reason.
- **Library seam**: a saved Machine Config becomes the machine the kernel plans against (`kernelMachineOfConfig`); the built-in catalogue is shown in Machine Configs (`GET /api/machine-configs/defaults`, read-only "Built-in"); the CAM panel, the kernel panel and the assistant (`cam.materials`, `machineConfig`) see both.
- Not done: controller mode-switch sequences (turning / positioned C / powered tooling), machine geometry and datum calibration, qualification on real controls. Published strokes are not work-coordinate limits.

## 8. Turning and the machine catalogue (2026-10-21)

Two gaps of §2.2 moved: the external turning of **M3** and the machines themselves (a kernel that only knows classes of machines cannot be the machine the shop owns).

### 8.1 External turning in the kernel

`kernel/turning.ts` (`planTurning`) plans a piecewise-linear profile in the lathe's own coordinates — X is a diameter, z = 0 at the finished face and negative towards the chuck — from bar stock:

- the face is a zero-allowance skim (the stock already starts at z = 0, so no allowance and no removed volume are invented);
- the roughing passes step the diameter down and each pass follows the profile held out by the finishing allowance, clipped at the pass diameter, so the local cut is bounded by the stepdown and never overcuts a taper (the span is split where the envelope crosses the cap);
- the finishing pass follows the profile itself; the removed volume of every pass is the exact solid of revolution, and `stockVolume = partVolume + unmachinedVolume + removedVolume` holds with the untouched bar tail written down explicitly (no parting is implied);
- the NC is lathe NC: `G18 G21 G90 G40 G94 G97`, constant rpm, and the radial retraction happens outside the original bar before the axial return, so the return cannot cross an uncut shoulder.

The plan is a **preview**: an ideal point tool (no insert compensation), no workholding, no grooves, threads or parting, and never a verified release.

`planBoring` is the internal counterpart on the same bar. The caller declares the pilot hole; the cavity grows inward from that pilot to the finished profile; each removed volume is the solid of revolution of the pass, and the worked stock partitions as removed + remaining + unmachined (the pilot volume is already void, so the finished bore is the pilot plus what the passes remove). The NC plunges through the open pilot and retracts axially out of the face. A finished diameter below the pilot, a bore that reaches the outer wall, a profile that does not run from the face towards the chuck, and a bar the chuck cannot hold are refused and emit no NC. The external fixture's NC bytes are unchanged. Release stays `preview`. `planBoring` is not wired into a manufacturing job and is not `cam.turn`.

### 8.2 The machines: a catalogue and the configurations of the library

- `MACHINES` (milling centres) and `LATHES` (turning and mill-turn centres) are separate lists; a machine carries its kind, and the milling kernel refuses a turning centre with the reason instead of running it as a mill.
- New presets with their published sources: KERN Micro HD HSK25 and HSK40 (B/C table, B -110..+110 degrees, continuous C, 50 000 / 42 000 rpm, Heidenhain TNC7 Klartext post), Mazak INTEGREX i-200 class and Okuma MULTUS B300II class mill-turn centres (B -30..+210 / -30..+195 degrees, Y 210 / 160 mm, C continuous / 360 degrees, Ø65 bar). A published stroke is not a work-coordinate bound; the pivot, the chuck and the datum remain calibration.
- `kernel/machine-config.ts` is the seam with the library: a saved `MachineConfig` row becomes the machine the kernel plans against (ceilings, the post its controller asks for, its rotary table), a configuration the kernel cannot machine is refused with the reason, and the built-in catalogue is served as machine configurations (`GET /api/machine-configs/defaults`), shown in the Resources list as read-only built-ins.
- The turning plan is bounded by that machine: a bar its chuck cannot take is refused, and its spindle and feed ceilings cap the plan.

Evidence: `kernel/machine-config.test.ts`, `kernel/turning.test.ts`, `packages/ai/test/cam-kernel-actions.test.ts`, `apps/sidecar/test/machine-config-defaults.test.ts`, the machine case in `apps/desktop/test/cam-kernel.test.ts`.

Still open: grooves, threads and parting in the kernel (internal boring is the preview above, not a job operation); the controller mode-switch sequences between turning, positioned C and powered tooling on a mill-turn; the machine geometry and the datum calibration of every named machine; the qualification of any of them on a real control.

## 9. 3D printing parity with mill and lathe (analysis, 2026-10-22)

### 9.1 The question and how it was measured

Owner request: *"analizza ... se nel cam il kernel della stampa 3d il generatore e tutto cio che riguarda la stampa 3d sia al livello di mill e lathe su tutti i fronti — analizza cosa manca nei kernels nel cam page nel visualizer ecc."*

Method: read the printer path end to end in the core (`packages/core/src/cam/{machine,tool-model,operation-tools,generator,viewer,verify,sim,kernel}`), the contracts (`packages/api/src`), the sidecar (`apps/sidecar/src`), the assistant (`packages/ai/src`) and the desktop CAM page and viewport (`apps/desktop/src/features/cam`, `apps/desktop/src/viewport/view3d`); counted which entry points each layer calls for a mill, a lathe and a printer; and **executed** the printer path to measure what it actually emits rather than what it claims to. Every claim cites `file.ts:line`; the measurements and their commands are in §9.8.

A parallel audit of the same subject was produced in the same working tree (untracked, at `specs/audits/printing-parity/README.md`): it characterises the HTTP surface and the end-to-end paths, this section maps the parity of each layer and holds the ledger the follow-up work is ordered from. Every defect listed in §9.5 was reproduced here independently rather than taken on trust.

**Parity criterion adopted** (so "at the level of mill and lathe" is testable, not an opinion): on a surface, a printer is at parity when it can do what a mill does through the same interface with the same evidence, and where it cannot, it **refuses with a reason** instead of degrading silently.

### 9.2 The parity matrix

| Surface | Mill | Lathe | Printer | Parity |
| --- | --- | --- | --- | --- |
| Machine knowledge (`cam/machine.ts`) | axes X Y Z, G17, spindle, checks | axes X Z, G18, diameter, checks | axes X Y Z E, additive, plate origin, 4 printer checks | **at parity** (ahead: `PRINTER_COLD_EXTRUSION`, `PRINTER_LAYER_DOWN`, `PRINTER_NOT_HOMED` have no mill/lathe analogue) |
| Tool model (`cam/tool-model.ts`) | shapes | inserts | nozzles (brass/hardened/ruby/standard), `:146` | at parity |
| Operation → tool (`cam/operation-tools.ts`) | 12 keys `:33-44` | 8 keys `:45-52` | **1 key** for 6 operations `:53`, `:64` | partial |
| Program checks (`cam/machine.ts:165-244`) | mill checks | lathe checks | 4 printer checks `:220-233`, `:242` | at parity |
| Operation catalogue | 9 (`settings.ts:37`) | 7 (`:39`) | 6 declared (`:41`) | declared only |
| **Generation** — the operation does what its name says | yes | yes | **no**: all six produce byte-identical G-code | **missing** |
| **Part geometry** | mesh / B-rep | revolved profile | primitives only; anything else → **bounding box** | **missing** |
| **Stock / volume model** | subtractive (height field + voxel) | bar stock, analytic volumes | none | **missing** |
| **Verification evidence** | height-field replay, gouge, clearance | turning preview | none (every check `not-run`) | **missing** |
| **Native kernel** (plan → NC → replay → claims → release) | yes | partial (`kernel/turning.ts`) | **absent** | **missing** |
| Machine catalogue | 10 presets | 3 presets | 0 | **missing** |
| Contracts (HTTP / AI) | yes | yes | legacy generator route only | partial |
| Assistant (`packages/ai`) | yes | yes | `cam.machine` and `machine-run` know a printer; `cam.manufacture` (the kernel) does not | partial |
| Mobile companion (`apps/mobile`) | yes | yes | build volume, nozzle glyph, no spindle | at parity |
| Desktop CAM page | yes | yes | legacy generator branch only | partial |
| Visualizer / 3D viewport | yes | yes | **at parity** | at parity |

The headline: **3D printing is at parity in the layers that describe a machine and draw one, and absent in the layers that make one.** The viewer, the machine table, the tool model, the program checks and the CAD manufacturability analysis all know a printer; the native kernel, the verification replay and the additive stock model do not.

### 9.3 Gap ledger — the native CAM kernel (`packages/core/src/cam/kernel`)

| # | Gap | Today | Evidence |
| --- | --- | --- | --- |
| P0 | **The kernel cannot name a printer** | `KernelMachine.kind` is `"mill" \| "lathe"`. The only kind refusal at runtime is the lathe one; the printer's refusal is a **doc comment** (`machine-config.ts:37`: *"the library's kinds the kernel does not machine (`printer`, `laser`) … are refused"*) and not a message a caller ever sees | `kernel/contracts.ts:32`, `kernel/execute.ts:143`, `kernel/machine-config.ts:37` |
| P1 | **No print strategy** | the 11 kernel strategies are all subtractive; `OperationSpec`/`OperationSpecSchema` have no print variant | `kernel/contracts.ts:125-148`, `kernel/schema.ts:43-65` |
| P2 | **The stock model is removal-only** | `VoxelStock` carries `removedSure`/`removedPossible`; `removeTipPath`/`remainingVolume` subtract. There is no deposition and no "as printed" volume | `kernel/stock.ts:20-35` |
| P3 | **The IR has no E axis** | `MoveSchema` is `Rapid \| Linear \| Arc \| Dwell \| Comment \| Cycle \| Orient` — a print program cannot be represented, so the kernel can neither replay nor draw one | `cam/ir.ts:104-112` |
| P4 | **No deposition data for materials** | the material table has ISO-N plastics (POM-C, PMMA, PA6) but every row carries *subtractive* data (`vcCarbide`, `fz10`, `drillFeed10`); there is no extrusion, flow or thermal model | `kernel/materials.ts:278-299` |
| P5 | **No printer in the machine catalogue** | `MACHINES` = 10 mill, `LATHES` = 3 lathe, `MACHINE_CATALOGUE` = 13 entries, none a printer. No bed, build height, kinematics (cartesian/corexy/bed-slinger/delta), nozzle or print-speed ceiling | `kernel/machines.ts:74-127` (measured: 10 / 3 / 13) |
| P6 | **A printer configuration is refused without a reason** | the profile layer knows `printer` (and aliases `3dprinter`/`3-d-printer`/`fff`/`additive`), but `kernelMachineOfProfile` maps it to `undefined` and `kernelMachineOfConfig` returns `undefined` — no issue, no message. The mill and the lathe refusals carry their reason | `kernel/machine-profile.ts:45`, `:367`; `kernel/machine-config.ts:39-47` |
| P7 | **The planner and the claims are subtractive-only** | `planJob` plans 2.5D/3D features from the part; the 12 claim ids are all subtractive (no-gouge, holder-clearance, material-removed…). A print job needs additive claims: layer coverage, wall count, infill, overhang/support, bed fit, filament | `kernel/planner.ts:138`, `kernel/contracts.ts:222` |
| P8 | **The kernel's verification replay is subtractive** | the replay runs the NC with the cutter active and reports *removed* volume; for a printer the removal is the deposition | `kernel/execute.ts` (replay stage), `kernel/contracts.ts:250-270` |

### 9.4 Gap ledger — the generator (`packages/core/src/cam/generator`)

| # | Gap | Today | Evidence |
| --- | --- | --- | --- |
| P9 | **The six printer operation types are inert aliases** | `PrinterOperationSchema` declares `standard \| vase \| support \| infill \| raft \| brim`, but the printer generator never reads `operationType`. **Measured: all six produce byte-identical G-code** (3104 chars each). | `generator/schema.ts:23`, `generator/settings.ts:40-41`, `generator/index.ts:124-128`, `generator/printer.ts:218-230` |
| P10 | **The default infill pattern is not implemented** | `DEFAULT_PRINTER_EXTRAS.infillPattern = "grid"`, but only `"lines"` is implemented; `grid`, `triangles` and `honeycomb` write a warning comment and **extrude nothing**. **Measured: the default path prints zero infill** (34 extruding moves with `grid`, 74 with `lines`). | `generator/schema.ts:244`, `generator/printer-composite.ts:227-258` |
| P11 | **The warning is silently dropped** | the generator emits `"; WARNING: …"` but `warningsIn` collects only `"; Warning:"`. **Measured: the response's `warnings` array is empty while the G-code carries the warning** — the user is never told. | `generator/index.ts:101-102` vs `generator/printer-composite.ts:255`, `generator/printer.ts:185` |
| P12 | **Only the first selected element is printed** | the printer branch takes `geometry.selectedElements[0]`; the mill path machines **every** selected element. **Measured: the second cube of a two-cube selection is absent from the program.** | `generator/index.ts:125-127` vs `generator/dispatch.ts:112` |
| P13 | **A real CAD part cannot be sliced** | `elementBody` handles cube/cylinder/sphere/cone/torus/text; every other type falls back to the **bounding box**. **Measured: a mesh element prints its bbox with a warning**, so the printer cannot print the parts the app actually makes. | `generator/printer.ts:172-189`, `:185-186` |
| P14 | **Supports, raft and brim are placeholders** | `support()` writes `"; TODO: Implement overhang detection logic"`; `raftLayers` and `brimWidth` travel in `PrinterSettings` and are never read. | `generator/printer-composite.ts:261-266`, `generator/printer-base.ts:19-20` |
| P15 | **No per-layer process** | no top/bottom layers, no per-layer speed/flow/temperature, no retraction on travel, no fan control, no purge/prime/wipe beyond the fixed start block. | `generator/printer-base.ts:38-64`, `generator/printer.ts:63-64`, `:101-102`, `:120-121`, `:155-156` |
| P16 | **A printed program has no evidence** | for any non-mill machine every replay check is `not-run`: *"The stock replay covers 3-axis milling, not the 3dprinter"*. The mill has 6 checks; the printer has 0. | `generator/evidence.ts:130`, `:165-167` |
| P17 | **The verification layer refuses the printer explicitly** | `verifyToolOf` returns `undefined` for anything that is not a mill and `verifyRequestFor` answers *"Verification supports milling operations only"* — a lathe and a printer are both refused with a reason; the workholding fixtures are mill-only too. A test pins the refusal. | `cam/verify/request.ts:38-43`, `:71-74`, `:65-70`, `cam/verify/verify.test.ts:224-227` |

### 9.5 Reproduced defects — a printed program that is wrong, not merely missing

These are measured, not read: each was reproduced by running the printer path and reading the output. They come first because a wrong program is worse than an absent one.

| # | Defect | Reproduced | Evidence |
| --- | --- | --- | --- |
| P26 | **The final retraction asks for the wrong amount of filament** | the start block selects absolute extrusion (`M82`) and the end block emits `G1 E-2` with no E reset and no switch to relative. After a cube whose last E is 26.07595, that targets E = −2 and **retracts 28.076 mm instead of 2** | `generator/printer-base.ts:40`, `:57` |
| P27 | **A composite declares a placement its children never receive** | the note says *"bottom at Z0"* while the first extruding move is at **Z 5.200**: `placeOnBed` shifts the composite root, `shiftElement` does not recurse into its members, and the slicer reads the members directly | `generator/printer.ts:196-215`, `generator/elements.ts:503`, `generator/printer-composite.ts:131` |
| P28 | **A program can claim success while it is wrong** | a 200 × 200 mm cube on a 100 × 100 mm bed returns `warnings=[]` and `evidence.result="passed"`; of the eight evidence checks only `generated` is `passed` and the other seven are `not-run`. The bed-fit warning exists in the G-code but never reaches the response (P11) | `generator/evidence.ts:165-167`, `:198`; `generator/printer.ts:214` |
| P29 | **The common post-passes destroy extrusion** | `optimizePath` drops 2 of the 42 extruding moves (42 → 40) because the optimizer compares X/Y/Z/feed and not E; `useArcFitting` emits G2/G3 blocks that carry **no E word**, so those spans are not extruded | `generator/index.ts:144-145`, `generator/postpass.ts:12` |
| P30 | **The part's orientation and scale are ignored** | a cube with `rotationY: 90, scaleX: 2, scaleY: 3, scaleZ: 4` produces **byte-identical** G-code to the plain cube | `generator/printer.ts:39-67`, `generator/printer-composite.ts:85-128` |

### 9.6 Gap ledger — contracts, API, assistant and desktop

| # | Gap | Today | Evidence |
| --- | --- | --- | --- |
| P18 | **The kernel route cannot take a printer** | `POST /api/toolpaths/manufacture` resolves the machine through `findMachine` / `kernelMachineOfConfig`; a printer preset is unknown and a printer configuration is refused with *"it needs a kind it machines (mill or lathe)"*. The generator route does take a printer. | `apps/sidecar/src/services/ai.ts:228-233`, `packages/api/src/groups/toolpath-generator.ts:16-31` |
| P19 | **The kernel panel has no printer** | the kernel section's built-in machine list is `cam.kernel.MACHINES` only. | `apps/desktop/src/features/cam/components/generator/KernelSection.tsx:221` |
| P20 | **The CAM page's capability list does not mention printing** | the groups are cad / mill / drill / lathe / probe / verify / workflow. | `apps/desktop/src/features/cam/components/CapabilitiesOverview.tsx:69-118` |
| P21 | **The CAM page shows no operation picker for a printer** | the palette category for printers exists (standard, vase, support, infill, raft and brim) but the CAM page renders `StrategyPalette` only for `mill \|\| lathe`; a printer gets the element picker, a 2-D preview and the settings instead. The `family={… === "3dprinter" ? "mill" : …}` expression is dead code. So the user sees **no** operation cell at all — and the six the core declares would be inert anyway (P9). | `apps/desktop/src/features/cam/components/generator/OperationSection.tsx:318-337`; `apps/desktop/src/features/cam/components/generator/StrategyPalette.data.ts:116-130` |
| P22 | **The copy promises more than the core does** | *"Standard slicer settings — wall, infill, top / bottom, supports."* There are no top/bottom layers and no supports (P14). The saved-toolpath labels repeat the six inert operation names. | `apps/desktop/src/i18n/en.cam.json:328`, `apps/desktop/src/features/toolpaths/components/shared.tsx:11`, `:24` |
| P23 | **Five machine-kind vocabularies** | `mill\|lathe\|3dprinter` (generator), `mill\|lathe` (kernel machine), `mill\|lathe\|printer\|laser` (machine profile), `mill\|lathe\|printer\|laser` (library API), `mill\|lathe\|3Dprinter` (assistant input). The normalisation lives in one desktop adapter, not in a shared seam. | `generator/schema.ts:20`, `kernel/contracts.ts:32`, `kernel/machine-profile.ts:45`, `packages/api/src/groups/machine-configs.ts:11`, `packages/api/src/ai-action-inputs.ts:91`, `apps/desktop/src/features/cam/lib/machines.ts:73` |
| P24 | **The saved machine catalogue cannot reach the printer** | `GET /api/machine-configs/defaults` serves `MACHINE_CATALOGUE` (mill + lathe); a saved printer configuration exists in the library but the kernel refuses it silently (P6). | `apps/sidecar/test/machine-config-defaults.test.ts:14`, `kernel/machine-config.ts:39-42` |
| P25 | **The assistant can describe a printer but cannot plan one** | `cam.machine` returns the printer's bed, plate origin, build height and kinematics and `machine-run` reports its layers, beads and filament; `cam.manufacture` is the kernel and therefore has no printer (P18). | `packages/ai/src/actions/cam.ts:51`, `:54`; `packages/ai/src/machine-run.ts:105-117`; `packages/ai/src/tools/prompts/cam.txt:4` |
| P31 | **The ribbon can assign an operation type that does not exist** | the ribbon's machining groups are the mill, 5-axis and lathe cells and are **not filtered by machine**. For a printer, `paletteToCoreOperation` falls through to `return paletteId`, so clicking "Contour" writes `operationType: "strategy-contour"`. **Measured: the core schema then refuses it** (`Expected "contour" \| "pocket" \| …`), so the request fails to decode. | `apps/desktop/src/features/cam/components/CamRibbon.tsx:113-116`; `apps/desktop/src/features/cam/components/CamRibbon.data.ts:70-113`; `apps/desktop/src/features/cam/components/generator/StrategyPalette.data.ts:196-201` |
| P32 | **There is no additive simulation** | the stock simulation is refused for every machine that is not a mill (*"a lathe/printer has its own stock representation; displaying a vertical sweep here would invent material removal"*), so the viewport has no solid build-up for a printer — only beads. | `apps/desktop/src/viewport/view3d/stock-simulation.ts:53-58`, `apps/desktop/src/viewport/view3d/view3d.tsx:527`; `packages/core/src/cam/sim/stock-sim.ts:7-8` |
| P33 | **The machine bodies are mill-only** | the 3-D machine model (table, spindle, holder, links) is built only for a mill; a printer gets the bed, the build volume, the nozzle, the beads and the travels — and no body to check a clash against. | `apps/desktop/src/viewport/view3d/machine-scene.ts:422` |

### 9.7 What the printer already has that mill and lathe do not (do not regress it)

This is not a gap list; it is the part of the printer that is already ahead and that any kernel work must carry over.

- **Print-time and material estimates** — `calculateOptimal3DPrintSettings`, `estimatePrintTime` (minutes), `estimateMaterialUsage` (grams). The mill and the lathe have no equivalent estimator. `generator/estimates.ts:41`, `:56`, `:72`.
- **The bed-fit check** — a part larger than the plate is reported, not printed in the air. `generator/printer.ts:212-214`.
- **An extrusion-aware emitter** — `calculateExtrusion` from the filament area, `polygonLayer` with travel moves separated from extruding moves. `generator/printer-base.ts:67-93`.
- **Printer-specific program checks** — a cold extrusion, a layer that goes down, a spindle word on a printer, a program that never homed. `cam/machine.ts:220-233`, `:242`.
- **A bead/layer model with progressive deposit** — `printerDeposits` / `depositedAt`. `cam/viewer/printer-layers.ts:29-58`.
- **The CAD manufacturability analysis for the print process** — `DfmProcess = "mill" \| "turn" \| "print"` with print-specific rules (minimum printable hole, overhang area and overhang share). `cad/dfm.ts:23`, `:479`, `:538`, `:554`. This is why the desktop's DFM panel already understands a printer (`apps/sidecar/src/services/ai.ts:371`).
- **A visualizer and a 3D viewport at mill/lathe parity** — the machine override, "E" instead of the spindle, the deposit mode (as printed so far / whole print), the layer slider, the layer-coloured beads and the travel lines. `apps/desktop/src/features/cam/components/ToolpathVisualizer.tsx:376`, `:410`, `:604`; `apps/desktop/src/viewport/view3d/machine-scene.ts:304-330`; `packages/core/src/cam/viewer/printer-layers.ts`.

Two caveats on that parity: it is reached only through the **legacy generator's** G-code (the kernel builds no printer timeline — P3), and the viewport **disables the playback** for a printer (`apps/desktop/src/viewport/view3d/view3d.tsx:577`).

### 9.8 What was measured, and how

| Measurement | Command | Result |
| --- | --- | --- |
| The six printer operations are inert | `bun run .tmp-probe/printer-probe.ts` (generator, one cube) | `op=standard … op=brim` → **3104 chars each**, identical |
| The default infill pattern prints nothing | `bun run .tmp-probe/printer-probe2.ts` (composite, four patterns) | `grid` → 34 extruding moves + `"; WARNING: Infill pattern 'grid' not fully implemented"`; `lines` → 74; `triangles`/`honeycomb` → 34 |
| The warning is dropped | same probe, `response.warnings` | `warnings=[]` while the G-code carries `"; WARNING:"` |
| A mesh part prints as its bounding box | `bun run .tmp-probe/printer-probe3.ts` | `"; WARNING: Unsupported element type 'mesh' for direct 3D printing."` |
| Only the first selected element is printed | same probe | two cubes → the second is absent; the mill path prints `Element 1` and `Element 2` |
| The kernel refuses a printer configuration | `bun run .tmp-probe/kernel-printer-probe.ts` | `kernelMachineOfConfig(printer)` → `undefined`; `profileOfConfig(...).kind` → `"printer"` (the profile knows it, the kernel machine does not) |
| The catalogue has no printer | same probe | `MACHINES: 10`, `LATHES: 3`, `MACHINE_CATALOGUE: 13`, no printer |
| The final retraction over-retracts | `bun run .tmp-probe/defects2.ts` | `M82` present, last E `26.07595`, retract line `G1 E-2 F3600` → an absolute target of E −2, i.e. **28.07595 mm** of retraction for an asked 2 mm |
| A composite ignores its own placement | `bun run .tmp-probe/defects3.ts` | the note says `bottom at Z0`; the first extruding move is at **Z 5.200** |
| The post-passes destroy extrusion | same probe | E-bearing moves: baseline 42, `optimizePath` **40**; `useArcFitting` emits 2 G2/G3 blocks that carry **no E** |
| Orientation and scale are ignored | `bun run .tmp-probe/defects.ts` | the rotated+scaled cube's NC is **byte-identical** to the plain cube |
| A wrong print reports success | same probe | a 200 × 200 mm cube on a 100 × 100 mm bed → `warnings=[]`, `evidence.result=passed`, checks `generated:passed` + seven `not-run` |
| The ribbon assigns an operation type that does not exist | `bun run .tmp-probe/ribbon.ts` | `paletteToCoreOperation("3dprinter", "strategy-contour")` → `"strategy-contour"`, not a printer operation |
| …and the core schema refuses it | `bun run .tmp-probe/ribbon2.ts` | `DECODE FAILS -> Expected "contour" \| "pocket" \| "drill" \| …` |
| The CAM core suite is green | `bun test packages/core/test/cam packages/core/src/cam` | **1109 pass, 0 fail**, 82 files, 873 602 assertions |
| The API reference is current | `bun --no-env-file packages/web/script/generate-api-reference.mjs --check` | exit 0 — *"API reference: 303 operations, 213 paths, 35 groups, 56 schemas"* |

The probe scripts live in the git-ignored `.tmp-probe/` directory; each measurement above names the script that produced it, so any of them can be re-created and re-run.

### 9.9 Ordered remediation (owner directories, per WP)

The order is the one the project's rules impose: **the owning design spec first**, then the core, then the adapters. Nothing below is implemented by this section.

1. **Spec (no code).** Amend this spec and `04-core-cam.md` with the additive-printing contract: what a print job is, which claims exist, and what a refusal says. Amend `05-api-sidecar.md`, `06-desktop-ui.md` and `08-ai.md` only when their contracts actually change.
2. **WP2 — stop the wrong programs first (P26, P27, P29, P30, P11, P28).** A printer that emits a wrong program is worse than a printer that refuses. Fix the retraction's E semantics, resolve the placement of the whole scene before slicing, keep the post-passes away from extruding input (or make them E-aware with filament conservation), honour the part's transform, make every warning travel, and stop the evidence from reporting "passed" for a program it did not check. Each of these needs a regression test that fails on the pre-change behaviour.
3. **WP2 — make the printer a first-class kernel citizen (P0, P1, P5, P6).** Add `3dprinter` to `KernelMachine.kind`, a print strategy to `OperationSpec`/`OperationSpecSchema`, printer presets to the catalogue (bed, build height, kinematics, nozzle, print speed), and turn the silent `undefined` of P6 into a **reasoned refusal** for everything the kernel still cannot do. Until the rest lands, the kernel must say "a printer is not machined by this kernel" rather than accept a printer it cannot run.
4. **WP2 — make the generator honest (P9, P10, P12, P13, P14).** Either implement the six operations or refuse the five that are not real, with the reason; implement the default infill pattern or change the default to the one that works; print every selected element; slice the **actual** part (mesh or B-rep), never its bounding box; and either implement supports/raft/brim or remove them from the schema.
5. **WP2 — additive evidence (P2, P3, P16, P7, P17).** An E axis in the IR, a deposition volume model, and the additive claims (layer coverage, walls, infill, overhang/support, bed fit, filament) with a replay that measures what was laid down.
6. **WP3/WP4 — expose it (P18, P23, P24).** The kernel route accepts a printer; one machine-kind vocabulary with one normalisation seam, shared by the generator schema, the kernel machine, the machine profile, the library and the assistant.
7. **WP6/WP8 — show it (P19, P20, P21, P22, P31, P32, P33).** The kernel panel lists the printer machines; the capability overview has a printing group; the CAM page offers a printer operation picker that the core can honour; the ribbon cannot assign an operation a printer does not have; the copy matches the behaviour; and the viewport says plainly that there is no additive solid simulation rather than showing a mill's removal.
8. **WP1/WP8 (only after the core).** The CAD DFM already knows the print process; the assistant can expose a print manufacturability read once a print job exists to read.

### 9.10 Status

**Analysis only.** No implementation, no acceptance gate, no roadmap status change. The ledger above is the inventory the follow-up work is ordered from; the same rule as §1 applies: a refusal is evidence of an unsupported capability, not an implementation of it. The RM rows are untouched — this is a continuation of the owner's kernel request, not an RM acceptance claim.

Measured against the working tree of 2026-10-22 (which carries uncommitted CAM/CAD work from a parallel session; the findings here are about the printer and are independent of it).

### 9.11 Printing correctness increment (2026-10-24)

The current source contains the print slicer, kernel adapter, catalogue, HTTP/assistant
contracts and desktop print panels developed after the historical audit above. Their presence
does not close every item in §9.2. This increment verifies and corrects these specific defects:

- A 10 mm model at 0.3 mm layers ended at 9.9 mm; a 0.08 mm model with a 0.2 mm
  first layer produced an empty slice. Layer tops now stop at the actual model top, slice
  planes use each slab's real thickness, and a sub-0.04 mm tail is redistributed with its
  preceding layer. Regression cases include a different first-layer thickness and a 0.03 mm tail.
- A deleted intermediate layer (index 31 of 60) passed the sampled wall-coverage check.
  Wall and spill evidence now inspect every model layer and report the raster resolution.
  Vase spirals above their solid base no longer skip the spill check; a deliberately shifted
  spiral fails the new regression while an unmodified vase passes.
- Diagonal infill through a polygon corner could miss a boundary intersection and leave the
  part. The edge index includes both endpoints with a numeric tolerance and deduplicates the
  intersection parameters. Small-part end-to-end cases now pass the independent spill check.
- Filament volume evidence incorrectly compared startup priming with a model bead's width
  and default thickness. Priming still participates in plate-fit checks but is excluded from
  the model-bead volume comparison, as are the separately modelled bridge and raft beads.

Before correction, all five new height/missing-layer regressions failed. The focused post-fix
run passed 14 tests, including all four height fixtures, isolated missing-layer detection,
corner indexing and the existing NC-tampering checks. Core typecheck passed (443 files).
The final slicer/kernel run passed 79 tests (23,270 assertions), including the vase regression.
Sidecar/desktop integration passed 14 tests (98 assertions), including generation and kernel
release through the live panel and HTTP route. API-reference regeneration and `--check` passed.

The broad core run exposed a pre-existing `arcsIJ` characterization mismatch. Reconstructing
the old fingerprint proved that only the rapid length differed, by one ULP
(`17.19803902718557` versus `17.198039027185573`). The test now checks that value independently
against `sqrt(104) + 7` to 12 decimal places and fingerprints every other field exactly using
the recorded canonical rapid length. Its 12-test file then passed; the recorded fingerprint
and interpreter implementation are unchanged. The broad core run is still in progress.

Still open for enterprise qualification: physical deposition/support coverage beyond this
planar raster model, full printer motion/thermal limits, and evidence that interprets every
supported controller mode without trusting feature/layer comments. This increment makes no
RM completion or machine-qualification claim.

### 9.12 Component value and authoritative print replay (2026-10-24)

The owner's follow-up asks for value in every component. This increment deepens the existing
interfaces rather than adding duplicate print paths:

- **Replay and layer preview:** `print/verify.ts` consumes the shared controller interpreter
  for modal/relative XYZ/E, resets, units and arcs. Arc replay has a 0.01 mm chord bound and
  includes cardinal extrema. Feature markers remain display annotations; layer geometry and
  bead volume use independently supplied layer tops/thicknesses. Missing model geometry is
  explicit unresolved evidence, not an empty list of passing checks.
- **Startup and travel:** all replayed motion, including non-extruding travel, must fit the
  build envelope. Deposited width participates in plate fit. Homed XYZ and explicit nozzle
  and required-bed waits must precede deposition; zero targets, mere heater setpoints and
  opaque macros do not prove readiness. Unsupported print-dialect G/M words, malformed
  coordinates and unsupported axes/tools block replay. Explicit partial-axis homing is
  accumulated until XYZ are all homed.
- **Post:** G90 precedes M82/M83, so relative extrusion actually stays relative. Quantizing
  cumulative E before differencing prevents per-bead rounding drift. A bed too small for a
  prime line still gets explicit first-layer positioning. Default end lifts respect build
  height, and the kernel checks actual depositing feeds instead of the requested speed alone.
- **Assistant:** material discovery now includes filament density/temperatures/cooling/melt
  flow with its qualification basis and full printer profiles. Saved printer profiles and
  the actual kernel print report reach the tool result. Stock notes describe deposited
  filament. A real action/worker regression preserves both verified and blocked releases.
  Cutting-data calls refuse printer presets and unknown machine ids instead of deriving
  milling feeds for them or silently falling back to another machine.
- **Integration:** the shared worktree's unmatched CAD brace and unreachable desktop `face`
  example prevented compilation; syntax/dead-branch repairs restore the consumer gates.

Verification on the increment: 91 slicer/kernel tests pass (23,319 assertions), 62 interpreter/
machine-view tests pass, 93 generator/HTTP/live desktop tests pass (10,474 assertions),
14 AI action/worker tests pass (73 assertions), and 23 prompt/wire/budget checks pass (980
assertions). Core (444 files), AI (531), sidecar (661) and desktop (1,171) typechecks pass.
API-reference freshness and whitespace checks pass. No prompt budget was relaxed.

A later combined vertical run passed its 23 backend/AI tests but encountered a transient
desktop import failure while the shared generator stylesheet was replaced by the shared
panel design system. The now-current desktop module imports `styles/panel.css`; a fresh
live desktop run passes all five print-panel tests (22 assertions). The final targeted
replay run also passes all 11 cases, including malformed NC and partial-axis homing.

The earlier broad `packages/core` run remains live and is not an acceptance result for all
current source changes. It has exposed CAD timeouts (nominal revolution/sweep, naming and
ellipse/spline tests, plus the seeded Boolean fuzz gate) and a legacy expectation of unsupported non-uniform scaling despite
the current implementation's exact result. The old arcsIJ numeric fingerprint failure was
independently resolved as documented in §9.11. These findings need their own current-source
verification before a full-suite or enterprise-completion claim.

Remaining component gates include structural mesh validation before typed-array coercion,
independent support/overhang and volumetric deposition evidence, stationary extrusion and
all firmware-specific state changes, machine-geometry/thermal qualification, and complete
rendered workflow acceptance. This ledger records progress without closing those gates.
