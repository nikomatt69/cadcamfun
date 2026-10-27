# 57 — Parity ledger: verified state of specs 40–55 and the gaps no spec covers

Status: written 2026-10-25. Part of [spec 39](39-professional-parity-master-plan.md). This document **builds nothing**. It replaces the
stale "Status" lines of specs 40–55 as the single place that says what is built; those specs keep their design and gates. Owner: WP1 + WP2
(read-only audit). The plan that orders the open items is [spec 62](62-execution-plan-2026-q4.md).

## 1. Method and its limits

- Every row below was checked in the source tree (`packages/core/src`, `apps/desktop/src`, `apps/sidecar/src`, `scripts/`) and in
  `git log` on 2026-10-25. "Built" means: the module exists, a test file for it exists, and a commit names it. **This audit ran no test
  suite and no benchmark**; a row is not a pass report. Where a gate figure of a spec (a recall, a time, a tolerance) was not measured, the row
  says "gate not measured".
- States: **built** (all of the item's text), **partial** (a named slice; the rest is listed), **open** (nothing of it exists), **n/v** (not
  verified: the item's code could not be located or judged in this pass; do not read it as open or built).
- Commit hashes are the commit that added or last extended the named slice, found with `git log`; where a commit swept several unrelated files
  (`cecc771b`, titled "Refactor CAD component styles", is where `scale.ts` and `catalogue.ts` first appear) the row says so.
- Nothing here is a parity claim. The scorecard of [spec 55](55-evidence-performance-qualification.md) §5 is still the only allowed
  vocabulary and **does not exist yet** (E3 open), so no area has a recorded level.

## 2. Ledger

### 2.1 Spec 40 — one exact truth per body

| ID | State | Evidence / what remains |
|---|---|---|
| U0 | built | coverage matrix `cad/history-exactness.test.ts`, `cad/history-cells.ts` (`eec7d3b0`) |
| U1 | built | modelled thread exact `cad/thread-brep.ts` (`9130c945`); more than 24 turns when the caller can wait (`0ec9b6a0`) |
| U2 | partial | draft / push-pull exact for hole walls, boss sides, cones, balls, rings, domes, bulbs, fillet bands, chains and NURBS patch move / offset (`13fc0393`, `6f088b63`, `17bd3eb4`, `c8dd3f94`, `95520e78`, `fcd37273`, `fb943a80`, `07395973`, `7c3f4dfc`, `99e827c3`); fillets ending in corner blends are a refusal by design; planar-face draft of arbitrary faces exists since 2026-10-14 (`brep/draft.ts`) |
| U3 | open | waits for spec 43 B1 (non-coaxial curved blends) |
| U4 | built | `cad/brep/scale.ts` non-uniform scale, first commit `cecc771b` (sweep commit) |
| U5 | built | `cad/brep/catalogue.ts` exact catalogue elements, first commit `cecc771b` (sweep commit) |
| U6 | built | one derived tessellation per body, `bodyTessellation` (`6a5fce9c`) |
| U7 | open | blocked by owner decision D1; the mesh `rebuild` still runs beside `rebuildExact` |

### 2.2 Spec 41 — persistent naming

| ID | State | Evidence / what remains |
|---|---|---|
| N1–N8 | open | `cad/brep/naming.ts` is 96 lines and holds only `uniqueFaceNames` (neighbour-keyed names, `8ef17f62`), applied to `ExactBody` output; no provenance tables, no `resolve(ref)`, no refs in the history, drawings or CAM. `faceByName` / `matchFaces` (2026-10-21) are lookups by that name, not lineage |

### 2.3 Spec 42 — Booleans and robustness

| ID | State | Evidence / what remains |
|---|---|---|
| R0 | partial | structured `BooleanError.diagnostic` (stage, operand, face, remedy, attempts) `3bef3d2c`, `7b4e159b`; no counters or seeded report script |
| R1 | built (n/v run) | seed-14 fold closed by `a8134360`; no `seed 14` pin remains in `cad/brep/fuzz.test.ts` (grep). The suite was not re-run here |
| R2 | open | classification still uses epsilon comparisons; no adaptive predicates (not found in `classify.ts`) |
| R3 | open | same-domain detection without displacement not found; non-manifold contact still recovers by displacing B (`7b4e159b`) |
| R4 | partial | tangent contact recovery by displacement, `booleanStrict` without recovery; no analytic contact analysis |
| R5 | partial | analytic and NURBS marching exists in `brep/intersect.ts`; no general NURBS x NURBS with singular points; gate not measured |
| R6 | n/v | tolerance growth rules on merge not located |
| R7 | partial | volume identities U+I=A+B, S+I=A and sampled check as recovery guards (`4bc4204c`); not applied to every Boolean in production; `face-empty` in `validate.ts` |
| R8 | open | no face-pair BVH; fully rounded box corner Booleans remain the known slow case |

### 2.4 Specs 43 and 44 — blends / shell / offset and surfaces

| ID | State | Evidence / what remains |
|---|---|---|
| B1 | partial | `blend.ts` (`48746f4f`), `blend-sphere-plane.ts`, coaxial curved-face rim fillets (tori); no non-coaxial or NURBS rolling ball |
| B2, B3, B5, B6, B7 | open | no G1 chain propagation as a kernel feature, no vertex blends, no face / full-round fillet, no setback, no overflow repair (fillets ending in corner blends are refused) |
| B4 | partial | variable radius on **straight** edges (`a5ec6adf`); `fillet-edit.ts` changes a band's radius |
| O1 | partial | analytic offsets inside shell and chain offset (`chain-edit.ts`); no general API |
| O2 | partial | `nurbs-offset.ts` approximate offset / draft by fitted cubic nets with `tessellatedVolume`, error carried (`7c3f4dfc`); self-intersection handling n/v |
| O3 | partial | exact shell of planes + cylinders (`941dba73`) and of faces of revolution (`d8a2bc49`), revolutions and sweeps (2026-10-14); no shell of any body |
| O4, O5 | open | no per-face thickness; corner style option n/v |
| S1, S2, S7 | partial | `surface-patch.ts`: `trimSurfacePatch`, `thickenSurfacePatch`, `stitchSurfacePatches`, `buildSurfaceOperation` (`76256b6f`); desktop `SurfacingPanel.tsx`; no (u,v) p-curve general trim, no declared self-intersection handling |
| S3–S6, S8 | open | no guide-rail loft with G1 / G2, no fill / network, no twist-scale sweep laws, no extend / untrim / replace face, no curve fitting toolbox (`path-sweep.ts` and `loft.ts` stay exact for simple cases) |
| A1, A2 | open | no zebra, curvature comb, curvature maps, draft map or continuity report (no hit in `packages/core/src`) |

### 2.5 Specs 45, 46, 47 — sketch / direct edit, assembly, industrial modules

| ID | State | Evidence / what remains |
|---|---|---|
| 45 K1 | open | no project / intersect to sketch |
| 45 K2 | partial | ellipse and Catmull-Rom spline (`sketch-curves.ts`); no NURBS control-point / fit-point splines |
| 45 K3 | partial | trim and extend (`c870a1df`); no offset, 2D fillet, patterns as relations |
| 45 K4–K8 | open | no 3D sketch, blocks, minimal-conflict diagnostics, incremental drag solve, drag-to-edit sketcher (DOF analysis exists in `sketch.ts`, 24 constraint kinds) |
| 45 D1, D3, D5 | open | no delete-face-with-heal, replace / split / merge faces, direct edit of imported STEP as history |
| 45 D2, D4 | partial | face move / push-pull (`brep/face-edit.ts`), hole / boss / fillet / NURBS edits (spec 33 C8, spec 40 U2); no general offset face with neighbour re-intersection |
| 46 A1, A2, A4, A5, A7 | open | no definition / occurrence model, constraint mates (mates are placement transforms: `mateTransform`), in-context refs, configurations, lazy load |
| 46 A3 | partial | joints with limits, gear and rack couplings, forward solver (`19b23e56`, `31a13967`); closed loops and a Grübler check n/v |
| 46 A6 | partial | **view-only** animated exploded view in the desktop (`features/cad/lib/exploded-view.ts`, `b3a0fb56`); no explode steps in the model, no trails, not per configuration |
| 46 A8, A9, A10 | partial | BOM, exact interference and clearance (`d9b550d1`, `e14e8078`), `motionStudy`; no assembly features, no driving laws / contact, no per-pair interference policy |
| 47 SM1–SM5 | partial | `cad/sheet-metal.ts` (`80cc2672`, 296 lines): thickening, corner rounding, edge flanges with reliefs, hems, outline development, `flatPatternDxf`; no bend-aware body, no contour flange, no 3D unfold with refold, no bend table |
| 47 SM6, SM7 | open | no forming tools; `dfm.ts` has no sheet-metal rules |
| 47 W1–W3, MT1–MT3 | open | no weldment, cut list, mold, parting line, core / cavity (no hit in `packages/core/src`) |

### 2.6 Specs 48, 49, 50 — simulation, drawings, exchange

| ID | State | Evidence / what remains |
|---|---|---|
| 48 F1–F9 | open | no FEA, mesher or solver code anywhere in `packages/core` |
| 49 G1, G2 | partial | exact B-rep drawing edges `brep/drawing-edges.ts`, projection, hidden lines, section, detail (`drawing/*`); analytic conic projection and broken-out / auxiliary views n/v |
| 49 G3, D3, T3 | n/v | line-type standard, collision-free dimension layout, BOM table with auto balloons not judged |
| 49 D1, D4 | open | no associative views (no model refs; no hit for `associativ|faceRef` in `drawing/`) |
| 49 D2 | partial | dimensions from features (`drawing/dimensions.ts`) |
| 49 T1 | partial | GD&T feature control frames (14 characteristics), datums, balloons (`879c9cfc`, `drawing/gdt.ts`); modifiers, composite frames and datum targets n/v |
| 49 T2 | partial | balloons only; no surface texture, weld symbols, hole tables |
| 49 O1 | partial | title block (`ef43f7aa`, `drawing/title-block.ts`), sheet; revision table and multi-sheet n/v |
| 49 O2 | open | the PDF written by the desktop (`jpegSheetPdf` in `features/cad/lib/drawing-export.ts`) wraps a **raster JPEG**; there is no vector PDF writer in core |
| 49 O3 | partial | `DrawingPanel.tsx` exists; the editing scope of the spec is n/v |
| 49 P1, P2 | open | no 3D annotations (PMI) and no AP242 semantic PMI |
| 50 X1 | partial | STEP write (AP214 product structure) and read of assemblies through `MAPPED_ITEM` / `NEXT_ASSEMBLY_USAGE_OCCURRENCE`; no colours, ids / names round trip n/v |
| 50 X2, X3 | open | no semantic PMI, no conformance corpus |
| 50 X4, X5 | n/v | extra surface entity coverage and external validator not judged |
| 50 X6 | partial | IGES reader / writer `brep/iges.ts` (`76256b6f`); transformation matrices (124, chained) on geometry, vertex lists and solids, reflections included, refused on shared topology and when they scale (2026-10-27); lines read with an arc-length parameter so a moved IGES body stays valid; 102 / 118 / 140 / 142 / 143 and subfigures (308 / 408) open |
| 50 X7 | partial | `cad/dxf.ts`; no blocks / hatches / dimensions both ways verified; DWG decision D2 |
| 50 X8, X9 | open | `mesh-clean.ts` (weld, topology) exists but there is no STL / OBJ / 3MF **import** into a body and no faceted-to-analytic recovery |
| 50 X10 | partial | STL, OBJ, glTF, 3MF export of exact bodies (`470d04ae`); no faceted STEP |

### 2.7 Specs 51, 52 — five-axis and turning

| ID | State | Evidence / what remains |
|---|---|---|
| 51 F1–F3 | open | multiaxis contacts are still vertical-ray based; no tool-axis strategies (no lead / tilt / auto-tilt code); **no collision in generation** (`operations/multiaxis.ts` states head-tilting machines and holder collision are not covered); `kernel/collision.ts` and `motion.ts` (`53caa7b6`) are checks, not planners |
| 51 F4 | built (slice) | swarf of cone, cylinder and flat-ruled walls, shank and holder checked, desktop `KernelSwarf.tsx` (`2a983c61`, `bc9a452b`, `4d5f2a02`, `4ba45019`); planar-NURBS walls, tapered cutters and the on-gate holder collision stay open |
| 51 F5 | open | no multi-orientation roughing of undercuts |
| 51 F6 | partial | simultaneous contour finishing on a trunnion (`c226d46d`); no flowline / morph / projection |
| 51 F7 | open | `kernel/head.ts` (`b8d33699`, `639c7114`) is a module, **not referenced by `kernel/execute.ts`** |
| 51 F8 | partial | joint blocks by interpolation tolerance in `motion.ts`; interior-of-move deviation and pole bypass not covered (spec text) |
| 51 F9 | built | TCP words for Haas `G234`, Fanuc `G43.4`, Siemens `TRAORI`, Heidenhain `M128` (`e403b4d1`); gate "IK replay within 0.005 mm" n/v |
| 51 F10 | partial | rotary moves cut a voxel stock with a sure / possible bracket (`a53c86df`, spec 32 P6 `48208ad0`); no tri-dexel and no analytic-volume gate |
| 52 T1–T7, M1–M4, P1, P2 | open | `kernel/turning.ts` is 332 lines, an external-turning **preview** (face skim, diameter roughing, `planBoring` not a job operation); the legacy `generator/lathe.ts` has no evidence; the interpreter replays lathe `G70–G76` cycles (spec 32 P2 `ec1a163d`) but no kernel path writes them |

### 2.8 Spec 53 — stock, simulation, verification

| ID | State | Evidence / what remains |
|---|---|---|
| V1 | open | stock is a Z-dexel (`cam/model/dexel.ts`), a height field (`verify/heightfield.ts`) and a voxel bracket (`kernel/stock.ts`); no tri-dexel |
| V2 | partial | the interpreter (spec 32 P1/P2 `c669ee2d`, `ec1a163d`) and `verifyToolpath` exist; no bound on a claim, no fault-injection set (100 seeded overcuts), claims not promoted on bounds |
| V3 | partial | machine models and rotary-only block replay (spec 32 P5 `88e0df37`); no IK tip-error gate |
| V4 | partial | machine bodies, collisions on the timeline against the live stock, holders as outlines (spec 32 P7 `e9ac94bb`, `47d0044e`, P8 `93b64b23`); a `machine-collision` claim with all-pairs completeness n/v |
| V5 | open | the tolerance budget is informational (spec text, `ToleranceBudget` in the contract) |
| V6 | partial | rest machining from the stock the earlier operations left (`b5c6abaf`, `a05a63b5`); no setup transfer / flip with stock carried |
| V7 | partial | `cam/verify/deviation.ts`, `cam/sim/deviation-colors.ts`; gate on a sphere fixture not measured |
| V8 | n/v | `cycleTimeSeconds` is in the artifact; whether it models acceleration / jerk was not judged |

### 2.9 Spec 54 — CAM breadth

| ID | State | Evidence / what remains |
|---|---|---|
| C1 | partial (4 slices) | post as data: `cam/post/definition.ts` (`de8957bf`), library storage (`ead369df`), desktop `KernelPost.tsx` (`41fc2ed1`), machine names a post (`9e40ae10`); word formats / line numbering / modal rules as fields open |
| C2, C3 | open | no new dialect (Mazak, Okuma, Mitsubishi, Brother, Tormach, ShopMill) and no post tester CLI |
| R1 | partial | pockets with islands (`888f03af`), bars and domes in the shadow solid (`e4462e65`); bosses / slots / steps / grooves / chamfer bands as named features, face refs and the 40-part corpus open |
| R2, R3 | open | operation sequence is still planner branches; no minimum stick-out search |
| R4 | partial | orientation half: `cam/setup-plan.ts` (`31444376`), per-setup shadow reading (`97061d37`); no WCS planning, fixture / vise clearance, tool-aware reach |
| L1, L3 | open | no ISO 13399; no tool life counters (the sidecar has `tools.ts` / `tools-storage.ts` and the desktop `ToolSection.tsx` as an app-level tool table, which the kernel does not own) |
| L2 | partial | `cam/kernel/cutting-data.ts`, `materials.ts` default table with power / torque / deflection limits; no user-editable versioned table |
| Q1 | partial | `optimizedOrder` (2-opt) for drilling, stay-down links in adaptive; no global linking and no 15 % measurement |
| Q2 | partial | adaptive clearing, `arc-fit.ts`, adaptive feeds (`generator/postpass.ts`); no trochoidal slot, no spline output (`G5.1` not produced by any post) |
| Q3 | partial | pencil as rest finishing; no morph / flowline / projection |
| Q4 | partial | `generator/probe.ts` exists; macro-variable branching and per-controller probing output n/v |
| H1 | built (kernel programs) | `cam/kernel/setup-sheet.ts` (`8a24895f`), route, assistant `cam.setup_sheet`, button in `KernelSection.tsx`; thumbnails, PDF, templates open |

### 2.10 Spec 55 — evidence, performance, qualification

| ID | State | Evidence / what remains |
|---|---|---|
| E1 | open | no `packages/core/test/corpus/`, no manifest, no `bun run corpus` |
| E2 | partial | `bun run bench:cam` (`scripts/cam-performance.ts`, informational, three CAM seams, machine fingerprint) is spec 55 §3.1; no `bun run bench`, no budgets file, no comparison rule |
| E3 | open | no scorecard; the honest baseline is not recorded |
| E4–E8 | open | no public STEP / IGES set, no CAM reference set, no scale fixtures, no qualification schema, no nightly corpus / bench job in `.github/workflows` (`ci.yml`, `ci-pipeline.yml`, `build-platforms.yml`, `release.yml`, `publish*.yml`, `ios.yml`) |

## 3. Gaps that no spec in 39–56 covers

Found while building this ledger; each has a new spec. Where the item was in an older spec only as an assumption, that is stated.

| # | Gap (verified) | Why it matters (Fusion 360 / hyperMILL class) | Spec |
|---|---|---|---|
| G1 | The history has no **suppress, rollback marker, groups, edit-in-place or incremental rebuild**, and reorder is one step at a time checked against *declared* references only (`moveFeature` / `dependentsOf` know sketch, pattern, mirror, sweep, loft and plane references, not the implicit "acts on the body built so far" order). `rebuild` "replays the history from the top" (`cad/history.ts:803`). Spec 46 A1 / A5 and spec 47 assume suppression flags that do not exist | the timeline is the daily surface of Fusion; without suppress / rollback a configuration (spec 46 A5) cannot exist | [58](58-parametric-timeline.md) |
| G2 | A CAM program **does not know that the model changed**. The kernel artifact carries `identity.part` (a digest) but nothing compares it with the current history; no stale flag, no re-targeting of operations by face refs, no regeneration policy, no diff | Fusion regenerates toolpaths after a model edit; hyperMILL keeps jobs associative to the CAD model | [59](59-cad-to-cam-associativity.md) |
| G3 | **No user-owned operation templates, job lists or rule engine.** Spec 54 R2 replaces planner branches by rules but defines no user rule format, no template library, no batch regeneration | hyperMILL Automation Center / Fusion CAM templates | [60](60-cam-templates-automation.md) |
| G4 | **The force model is per operation, not per move; no engagement-based feed, no stability, no tool-life model.** `cam/kernel/cutting-data.ts` already has a Kienzle force / power / torque model, chip thinning and a stepped-cantilever deflection for **one nominal cut** per operation (handbook starting values, not calibrated); `adaptFeeds` (`generator/postpass.ts`) slows corners and small radii from the **G-code text and the tool diameter**, not from the stock; spec 54 Q2 and L3 are geometry and counters | hyperMILL MAXX Machining, Fusion adaptive feed | [61](61-process-physics.md) |
| G5 | **Two CAM paths**: the legacy `cam/generator/*` programs have no kernel artifact, so no evidence, no setup sheet, no stale detection | one structure ("un unico organo"); spec 29 holds the kernel contract but no retirement plan | handled as a limit in [59](59-cad-to-cam-associativity.md) §6 and as a decision in [62](62-execution-plan-2026-q4.md) |
| G6 | **Generative design / topology optimisation**: nothing exists and spec 48 (FEA) is not built | Fusion generative design | horizon item of [62](62-execution-plan-2026-q4.md) §6; no spec until spec 48 F1–F5 pass |
| G7 | **Rendering, appearance library, animation of assemblies / toolpaths as media** | Fusion Render / Animation workspaces | out of scope for this plan, recorded so it is a choice and not an omission |
| G8 | A spec 55 corpus-first rule is violated by every earlier spec: no area has a measured level | no parity statement is possible | spec 55 E1–E3 is the first item of the plan |

## 4. Owner decisions still open (spec 39 §4, plus new)

No answer to D1–D7 is recorded in the repository or in the project notes as of this ledger; every default of spec 39 §4 therefore stands.

| # | Decision | Blocks |
|---|---|---|
| D1 | retire the mesh history rebuild | spec 40 U7, spec 58 W5 (one rebuild path) |
| D2 | native CAD formats (Parasolid, SAT, JT, SLDPRT, DWG) | spec 50 X7 DWG; nothing else |
| D3 | FEA solver as TypeScript or WASM | spec 48 start |
| D4 | specialist 5-axis packages (impeller, port, barrel, tube) | spec 51 §5 |
| D5 | other processes (wire EDM, laser / plasma, waterjet, nesting) | spec 54 §3 |
| D6 | subdivision / T-spline sculpting | none (out of scope by default) |
| D7 | machine qualification partner and controller list | spec 55 §6, any release level above `verified-model` |
| D8 (new) | history schema version bump for suppress / groups: a one-way migration or a read-compatible superset | spec 58 T1 |
| D9 (new) | default regeneration policy of a stale program: `ask` (default), `auto-safe`, `never` | spec 59 A4 |
| D10 (new) | where templates live: project, library item (category `cam-template`), or organisation | spec 60 P1 |
| D11 (new) | calibration data source for the force model (a cutting-test partner, vendor data entered by the user, or none) | spec 61 §3.6 |
| D12 (new) | legacy `cam/generator/*` programs (no kernel artifact): keep read-only, convert on request, or retire | the claim that CAM has one structure; spec 59 §6 follow-up |

## 5. Corrections to earlier text

- Spec 39 §1.1 sizes are lower bounds; on 2026-10-25 `packages/core/src/cad` is 116 files / 29 223 lines, `cad/brep` 83 files / 16 727 lines,
  `cam` 25 / 4 745, `cam/kernel` 53 / 10 306, `cam/operations` 21 / 5 263, `cam/post` 13 / 1 521, `drawing` 13 / 2 166 (`wc -l`, tests included in the
  directory counts).
- Spec 39 §1.1 says history has 24 feature kinds; the `type:` literals in `history.ts` today are 24 (coil, combine, draft, extrude, fillet, hole,
  loft, mate, mirror, move, pattern, plane, primitive, pushpull, revolve, rib, scale, sheet, shell, sketch, split, sweep, text, thread).
- Spec 53 §1 says the budget is informational; unchanged. Spec 54 §1 "no setup sheets" is out of date (H1 built).
- Spec 55 states "no shared answer"; `bench:cam` exists (spec 55 §3.1) but no corpus or scorecard.

## 6. Change log

- 2026-10-25: created. Ledger of 16 specs, eight gaps outside them (specs 58–61), decisions D8–D12.
- 2026-10-27: X6 row (IGES 124). Outside any spec: the history rebuild keeps one exact replay advanced on demand (`exactReplay`), so named faces and curved fillets no longer replay the exact prefix each time.
