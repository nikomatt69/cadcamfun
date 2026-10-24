# 39 — Professional parity master plan (Fusion 360 / SolidWorks / Creo / hyperMILL)

Status: specified 2026-10-24. Nothing in specs 40–55 is built by this document. Owner request: "analizza i kernel cad e dimmi
cosa manca per renderlo un cad a livello di fusion360 creo hypermill solidworks ecc", then "procedi con tutto e crea tutte le
specs". This spec is the index, the rules and the dependency order of the sixteen detail specs. It replaces no earlier spec:
[spec 12](12-professional-cad-cam.md) keeps the honest gap list, [spec 33](33-kernel-gap-analysis.md) keeps the K0–K7 ledger and
the historical C/M inventory, [spec 29](29-native-cam-kernel.md) keeps the CAM kernel contract, [spec 32](32-machine-simulation-parity.md)
keeps the simulator. Where this plan and an older spec disagree on *current state*, read the source; on *what to build next*,
this plan wins.

## 1. Method

The analysis read `packages/core/src/{cad,cad/brep,cam,drawing}`, specs 12, 14, 20, 29, 32, 33 and the project notes, and
checked the facts below against the source. It ran no benchmark. A number in a spec is either measured in the source tree (and
cited) or a **target** (marked "target"); a target is not a claim.

### 1.1 What exists (verified in source on 2026-10-24)

| Area | Size / shape | Where |
|---|---|---|
| Exact B-rep | ~10 500 lines; index tables (vertex+tol, edge+tol, coedge+p-curve, loop, face, shell); surfaces plane / cylinder / cone / sphere / torus / NURBS / revolution / extrusion; curves line / circle / ellipse / NURBS | `cad/brep/{topology,geom,nurbs}.ts` |
| Operations | Booleans (`boolean.ts`), constant + variable fillet and chamfer (`blend.ts`), shell (`shell.ts`), sweeps / path sweeps (`sweep.ts`, `path-sweep.ts`), loft (`loft.ts`), draft, push/pull, sewing, heal, validation, mass, distance, hole recognition | `cad/brep/*` |
| Exchange | STEP read/write (AP-style entities incl. assemblies via `MAPPED_ITEM`), IGES 5.3, STL / OBJ / glTF / 3MF from an exact body, DXF | `brep/{step,iges,export-mesh}.ts`, `cad/dxf.ts` |
| History | 24 feature kinds, mesh rebuild (`history.ts`, 1 799 lines) plus a second exact replay (`history-brep.ts`, 1 554 lines) | `cad/history*.ts` |
| Sketch | point / line / arc / circle / ellipse / Catmull-Rom spline; 24 constraint kinds; LM solver with DOF analysis; trim / extend | `cad/sketch*.ts` |
| Assembly | joints (fixed, revolute, prismatic, cylindrical, ball, planar), gear / rack couplings, motion study, exact interference and clearance, BOM, smart fasteners | `cad/{kinematics,assembly-analysis,smart-fasteners}.ts` |
| Drawing | projection, hidden lines, section, detail, dimensions from features, GD&T frames / datums / balloons, sheet, SVG | `drawing/*` |
| CAM | 2.5D, 3D finishing families, rest, adaptive, thread mill, tap / ream, 3+2, trunnion simultaneous parallel / contour, external turning preview, FDM printing; posts Fanuc / Haas / Heidenhain / Siemens / GRBL / generic; replay verification, claims and release levels | `cam/*` |

### 1.2 The gaps, in one table

| Spec | Area | Closes (older ids) | Depends on |
|---|---|---|---|
| [40](40-single-exact-brep-truth.md) | One exact model per body (mesh becomes derived) | C2, C5 (part) | — |
| [41](41-persistent-topological-naming.md) | Persistent naming and lineage | C6, K7 | 40 (partly) |
| [42](42-kernel-robustness-booleans.md) | Boolean / SSI robustness, tolerant modelling | fuzz pin, recovery-by-displacement | — |
| [43](43-general-blends-shell-offset.md) | Rolling-ball blends, vertex blends, shell and offset of any body | C3, C5, K2 | 42, 44 (offset) |
| [44](44-surface-modelling.md) | Trim, offset, loft with rails, fill / network, continuity analysis | C7, K3 | 42 |
| [45](45-sketch-and-direct-editing.md) | 3D sketch, projection, NURBS splines, interactive solve, direct edit | C8, C13 | 41 |
| [46](46-assembly-and-configurations.md) | Components, loops, in-context, configurations, large assemblies | C11 | 41 |
| [47](47-industrial-cad-modules.md) | Sheet metal completion, weldments, mold tools | C10 | 41, 43 |
| [48](48-simulation-fea.md) | Linear static FEA, then modal and thermal | — | 41 |
| [49](49-drawings-and-mbd.md) | Exact drawing edges, associativity, assembly drawings, full GD&T, PMI | C14 | 41, 46 |
| [50](50-data-exchange.md) | STEP AP242 (assembly, colour, PMI), IGES depth, native formats, mesh import | — | 41, 55 |
| [51](51-five-axis-cam.md) | Swarf, multi-axis roughing, auto-tilt, head machines, collision in generation | M5, K4 | 53 |
| [52](52-turning-and-mill-turn.md) | Kernel turning and mill-turn | M3, K6 | 53 |
| [53](53-stock-simulation-verification.md) | Exact-bound stock, final-NC proof, full machine simulation | K5, M4, M9 | spec 32 |
| [54](54-cam-breadth.md) | Posts and post builder, feature recognition, tool library, linking, other processes | M6–M8 | 53 |
| [55](55-evidence-performance-qualification.md) | Corpus, benchmarks, scale, qualification, parity scorecard | gate 1 of spec 12 | — |

### 1.3 Dependency order

```
55 (corpus + scorecard)  ──────────────────────────────────────────────────────────────┐ gates for all
42 robustness ─┬─► 43 blends/shell/offset ─► 47 industrial CAD                          │
               └─► 44 surfaces ────────────┘                                            │
40 one exact truth ─► 41 naming ─┬─► 45 sketch + direct edit                            │
                                 ├─► 46 assembly ─► 49 drawings/MBD ─► 50 exchange (PMI)│
                                 └─► 48 FEA                                             │
53 stock/sim/verify ─┬─► 51 five-axis ─► 54 CAM breadth                                 │
                     └─► 52 turning                                                     ┘
```

Waves (specs inside a wave have disjoint owned directories and can run in parallel):

- **Wave A (foundation):** 55 harness first (corpus, bench, scorecard), 42, 40, 53.
- **Wave B:** 41, 44, 43, 51, 52.
- **Wave C:** 45, 46, 47, 48, 54.
- **Wave D:** 49, 50 (need naming, assemblies and the corpus).

## 2. Rules every spec inherits

1. **No parity claim without gate evidence.** A capability is reported with the scorecard level of spec 55 §5, never with the
   word "parity". Passing tests of a strategy name is not evidence.
2. **Refusal over approximation.** A feature the kernel cannot do exactly returns a typed refusal with a reason and leaves the
   body unchanged. An approximation is allowed only with a declared tolerance carried in the result.
3. **Regression protection.** Every work item adds a test that fails on the pre-change behaviour, keeps the existing suites green
   and does not regenerate goldens to hide a semantic change. Kernel suites run in chunks under 110 s from the repo root.
4. **Independent oracle.** Exactness is asserted against an analytic reference (Green's formula, closed-form volumes), an
   independent reader (the OpenCascade reader used by `apps/desktop/test/cad-iges.test.ts`) or a sampled truth (grid / Monte
   Carlo), never against the kernel's own output.
5. **One structure.** Extend `cad/`, `cad/brep/`, `cam/`, `cam/kernel/`, `drawing/` in place. No parallel kernel, no second
   history. Contract changes go through the owning spec first, then `packages/api`, sidecar, AI schema (24 000-character tool
   prompt budget: add parameter names only) and desktop adapters; regenerate clients with `bun run generate`.
6. **Pure core.** Geometry and toolpath code stays I/O-free, synchronous, and honours `withBudget` / `checkBudget`
   (`cad/brep/budget.ts`) so a pathological input cannot hold the sidecar thread.
7. **Effect v4 and Drizzle conventions** of [spec 01](01-conventions.md) for anything touching services or storage; nothing here
   adds a native dependency without an owner decision recorded in the work item (see each spec's "Decisions for the owner").
8. **Ownership.** WP1 `packages/core/src/cad`, WP2 `packages/core/src/cam`, drawing in `packages/core/src/drawing`; adapters
   WP3 `packages/api`, WP4 `apps/sidecar`, WP6/WP7 `apps/desktop`, WP8 `packages/ai`. A work item names the adapters it needs.

## 3. Definition of done for a work item

1. The spec's gate test exists, fails before and passes after.
2. `bun check -p packages/core/tsconfig.json` clean; touched adapter packages typecheck.
3. Existing suites of the touched area pass (list them in the commit message).
4. The spec's "State" table is updated with commit and evidence; the scorecard row of spec 55 changes level only with the gate.
5. Refusals are documented in the spec's "Honest limits" list.

## 4. Decisions for the owner (collected from all specs)

| # | Decision | Default if not answered |
|---|---|---|
| D1 | Retire the mesh history rebuild (spec 40 phase 3) once the coverage matrix is 100 % exact or refused | keep it as `legacyMesh` fallback, flagged |
| D2 | Native CAD formats (Parasolid, ACIS/SAT, JT, SLDPRT, DWG): licensed library, user-side conversion, or not supported (spec 50 §6) | STEP / IGES / DXF are the contract; native formats not supported |
| D3 | FEA solver as TypeScript or WASM (spec 48) | TypeScript, sparse Cholesky + PCG |
| D4 | Specialist CAM packages (impeller, port, barrel, tube) (spec 51 §7) | not started |
| D5 | Other processes (wire EDM, laser / plasma, waterjet, nesting) (spec 54 §7) | 2D laser / plasma first |
| D6 | Subdivision / T-spline sculpting (spec 44 §8) | out of scope |
| D7 | Machine qualification partner and controller list (spec 55 §6) | none; release level stays `preview` for turning, `verified-model` for milling |

## 5. Change log

- 2026-10-24: created with specs 40–55.
