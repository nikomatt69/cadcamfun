# 49 — Drawings and model-based definition: exact edges, associativity, assemblies, full GD&T, PMI

Status: specified 2026-10-24 (not built). Part of [spec 39](39-professional-parity-master-plan.md). Closes C14 of
[spec 33](33-kernel-gap-analysis.md). Owner: `packages/core/src/drawing` (WP1); adapters WP3/WP4/WP6. Depends on
[41](41-persistent-topological-naming.md) (associativity), [46](46-assembly-and-configurations.md) (assembly drawings),
[50](50-data-exchange.md) (PMI in STEP).

## 1. Where it stands (verified)

- Pipeline of [spec 12](12-professional-cad-cam.md) "Technical drawings from the 3D model": `project.ts` (creased, boundary and
  silhouette edges of a **mesh**, sampled hidden-line removal), `section.ts` (plane cut, hatching), `dimensions.ts` (from
  history features: holes, threads, fillets, extrusion sizes, ISO 286 tolerances), `sheet.ts` (A4 / A3 / A2, frame, zone
  grid, title block, first / third angle), `svg.ts`, DXF writer, `gdt.ts` (GD&T frames, datum features, balloons, validation),
  acceptance test `liquid-mixer.test.ts`.
- `cad/brep/drawing-edges.ts` (92 lines) gives exact B-rep edges for drawings.
- Spec 12 lists as not covered: exact silhouettes of curved faces (a faceted cylinder's outline is drawn from facets),
  collision-free dimension placement (overlaps are detected, not solved), assembly drawings, associative editing, PDF as a
  follow-up (symbols in `gdt.ts` are drawn from lines and arcs so they can go to PDF without fonts).

## 2. Work items

### 2.1 Geometry

| ID | Item | Gate |
|---|---|---|
| G1 | **Exact projection.** Edges from the B-rep (`drawing-edges.ts`) projected analytically: lines → lines, circles → ellipses (exact semi-axes, as NURBS conics), NURBS → NURBS; **analytic silhouettes** of cylinders, cones, spheres, tori and extrusion / revolution surfaces; silhouette of NURBS by marching the `n·v = 0` curve; hidden-line removal by exact visibility on sampled points with face-ray tests against the tessellation (visibility), and linework emitted as analytic curves. | a cylinder viewed obliquely: silhouette lines are exact tangent lines to the projected ellipses (distance 1e-9); an ISO view of a sphere outline is a circle of radius R |
| G2 | **View types**: projected, auxiliary (normal to a chosen edge / face), section (full, half, offset, aligned, revolved), detail (with leader and scale), broken-out section, break view, crop view, partial view, exploded assembly view (spec 46 A6). Section cutting planes are drawn per ISO 128-3 with arrows and labels. | each view type produced on a fixture; hatch only inside the cut region (existing even-odd rule) |
| G3 | **Visual style**: line types and weights per ISO 128-20 (visible, hidden, centre, dimension, phantom), thread representation per ISO 6410 (minor/major circle ¾), tangent edge handling (hidden / thin / removed), hatch pattern library by material (ISO 128-50). | threaded hole rendering matches the ISO 6410 convention on the fixture |

### 2.2 Associativity and dimensions

| ID | Item | Gate |
|---|---|---|
| D1 | **Associative views.** A view stores (model ref, orientation, scale, section definition by refs); rebuild regenerates linework when the model rebuilds; manual annotations stay attached via refs (spec 41). | change a hole position by 5 mm: all dimensions and the view update with no manual change |
| D2 | **Dimension types** referencing model entities: linear, aligned, angular, radius, diameter, arc length, ordinate, baseline, chain, chamfer, coordinate; **driven** dimensions read the model; optional **driving dimensions in drawings** (change flows to the part) behind a user setting and the feature-history permission. | dimension to an edge follows its edge when the part changes |
| D3 | **Automatic placement without collisions**: a layout solver (greedy by distance rule + 1-D interval packing along each side + overlap resolution by shifting and stacking) that *solves* what today is only detected. | on the liquid-mixer fixture and 5 other crowded parts: 0 overlapping texts/extension lines (target), spacing per ISO 129-1 |
| D4 | **Tolerances**: limit / fit notation (ISO 286 tables exist in `fasteners.ts`), general tolerances (ISO 2768), dimension tolerance display modes, tolerance from the model's property. | H7/g6 callouts show correct deviations from the tables |

### 2.3 Annotations (full GD&T)

| ID | Item | Gate |
|---|---|---|
| T1 | **Complete ISO 1101 / ASME Y14.5**: the 14 characteristics, material-condition modifiers (M, L, P, F, T, U, CZ), projected tolerance zone, composite frames, datum targets, multiple datum references with precedence, free-state; validity rules from ISO 5459 and ISO 1101 (`validateGdt` extended). | rule tests: e.g. flatness takes no datum, position needs ≥ 1; invalid combos are rejected with the clause |
| T2 | **Surface texture** (ISO 21920: Ra, Rz, lay, process), **weld symbols** (ISO 2553 from weldment data, spec 47 W3), **notes, leaders, balloons with stacked text, hole tables, bend tables, revision tables**, centre marks / centre lines, **symbols drawn as vector geometry** (no font dependency, as `gdt.ts` does). | symbols render to SVG, DXF and PDF identically |
| T3 | **BOM table** from the assembly (spec 46) with balloons auto-numbered, configuration-aware, grouped by definition, with properties (material, mass, vendor). | assembly of 12 parts with 3 repeated definitions → 3 BOM rows with quantities |

### 2.4 Sheets and output

| ID | Item | Gate |
|---|---|---|
| O1 | Sheet sizes A0–A4 and ANSI A–E, templates (title block fields, revision table, zones), multi-sheet drawings and sheet index, scale per view. | each size laid out; fit warnings as today |
| O2 | **PDF output** (vector, embedded standard font subset or outlined text), plus SVG and DXF (existing); DWG is decision D2 of spec 39. | PDF opens in the independent reader; page size exact in mm |
| O3 | Drawing editor in the desktop: move views / dimensions, edit text, add annotations on refs, print preview; no logic in the UI beyond calling the core. | happy-dom tests; real-window run recorded in the commit |

### 2.5 PMI / MBD

| ID | Item | Gate |
|---|---|---|
| P1 | **3D annotations**: dimensions, GD&T and notes attached to faces / edges (refs) in a saved annotation plane ("capture") on the part; stored in the history as `pmi` data, shown in the viewport. | annotations survive a rebuild and move with the entity |
| P2 | **STEP AP242 semantic PMI export / import** (shape dimension, geometric tolerance, datum) with the references to faces; tessellated presentation as a fallback. See [spec 50](50-data-exchange.md) X1. | NIST PMI test-case subset (spec 50 X3) round-trips with all tolerances present |

## 3. Gates (suite)

`drawing/*.test.ts` keeps the liquid-mixer acceptance; add `drawing-exact.test.ts` (G1/G2), `drawing-associative.test.ts` (D1/D2),
`drawing-layout.test.ts` (D3), `gdt-rules.test.ts` (T1), `drawing-pdf.test.ts` (O2).

## 4. Honest limits

- Exact silhouettes of general NURBS surfaces use marching with a stated tolerance (default 0.005 mm of the drawing).
- Auto-placement is a heuristic: it guarantees *no overlaps* on the test set, not aesthetics equal to a draftsperson.
- Standards coverage is by clause list in the tests; certification as an ISO / ASME drawing tool is not claimed.

## 5. Order

G1 → D1 → D2 → D3 → G2 → T1 → O2 → G3 → T3 → T2 → O1 → O3 → P1 → P2.
