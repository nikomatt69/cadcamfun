# 50 — Data exchange: STEP AP242, IGES depth, mesh import, native formats

Status: specified 2026-10-24 (not built). Part of [spec 39](39-professional-parity-master-plan.md). Owner: WP1
(`cad/brep/{step,iges,export-mesh}.ts`, `cad/{import-step,import-drawing,dxf}.ts`); adapters WP3/WP4/WP6. Depends on
[41](41-persistent-topological-naming.md) (names), [55](55-evidence-performance-qualification.md) (corpus).

Verified state of every item (2026-10-25): see [spec 57](57-parity-ledger-2026-10-25.md); it supersedes the status line above.

## 1. Where it stands (verified)

- `step.ts` (926 lines) reads and writes: `MANIFOLD_SOLID_BREP`, `BREP_WITH_VOIDS`, `FACETED_BREP`, `SHELL_BASED_SURFACE_MODEL`,
  `ADVANCED_FACE` over plane / cylinder / cone / sphere / torus / B-spline (rational, with knots) / extrusion / revolution /
  degenerate toroidal surfaces; curves line / circle / ellipse / B-spline / polyline / trimmed / surface / seam / intersection
  curves; units (SI, conversion-based); assembly structure via `MAPPED_ITEM`, `ITEM_DEFINED_TRANSFORMATION`,
  `REPRESENTATION_RELATIONSHIP*`. `healBrep` is wired into `stepToElements`; STEP reading was verified against the independent
  OpenCascade reader on selected bodies (ellipse, Bezier, revolution, sweep) at volumes within 0.1 %.
- `iges.ts` reads / writes IGES 5.3 B-rep, diagnosing unsupported entities and transformations.
- `export-mesh.ts`: STL (binary / ASCII), OBJ, glTF 2.0, 3MF from an exact body.
- DXF read / write (`dxf.ts`, `import-drawing.ts`).
- Desktop import/export dialog wired to the core above: STEP exact both ways; IGES exact both ways
  (`igesToElements` / `sceneToIges` in `scene-step.ts`, the same scene traversal and skip report as STEP);
  STL / OBJ / PLY mesh import through the shared Three.js loaders (`mesh-file-import.ts`); STL / OBJ / GLB
  scene export through the canvas. IGES directory names hold 8 characters, so part names truncate on
  round trip while geometry is exact.
- Spec 12 gate 1 is open for lack of recorded evidence on a real-part corpus.

## 2. Work items

### 2.1 STEP

| ID | Item | Gate |
|---|---|---|
| X1 | **AP242 (and AP214 / AP203) product structure and presentation**: `PRODUCT` / `PRODUCT_DEFINITION` names and ids, `NEXT_ASSEMBLY_USAGE_OCCURRENCE` trees (round trip with spec 46 definitions / occurrences), **colours** (`STYLED_ITEM`, `COLOUR_RGB`, per face / body), **layers**, **names of faces** (spec 41 keys), units, descriptions / properties (material, mass user attributes), **geometric validation properties** (volume, area, centroid) written and checked on read. | a 3-level assembly with colours exports and re-imports with identical tree, names, colours, and the validation properties agree to 1e-6 relative |
| X2 | **Semantic PMI** (AP242 ed.2): `DIMENSIONAL_SIZE`, `DIMENSIONAL_LOCATION`, `GEOMETRIC_TOLERANCE` family, `DATUM`, `DATUM_FEATURE`, `SHAPE_ASPECT` for the referenced faces, plus graphic presentation (`ANNOTATION_OCCURRENCE`) as a fallback. Pairs with spec 49 P2. | the NIST CTC/FTC subset (X3) imports with all tolerances and datum references; export re-reads in the independent reader |
| X3 | **Conformance corpus** (spec 55 §2): public STEP test sets (NIST MBE PMI test cases CTC/FTC, a set of open-licence STEP parts and assemblies, OCCT sample files where licensing allows), each with a manifest (source, licence, expected volume / area / face count / colours / PMI count); a runner reports pass / refuse / wrong-with-reason per file. | corpus runner exists and its table is committed; target ≥ 95 % of files read to a valid body or a typed refusal, 0 silently wrong volumes (> 1e-4) |
| X4 | **Surface types and topology gaps**: `OFFSET_SURFACE`, `RECTANGULAR_TRIMMED_SURFACE`, `CURVE_BOUNDED_SURFACE`, `BOUNDED_SURFACE` composites, `COMPOSITE_CURVE`, `SURFACE_OF_*` variants, non-manifold `GEOMETRIC_SET`/wireframe; units and tolerance contexts (`UNCERTAINTY_MEASURE_WITH_UNIT`) → `Vertex.tol`. | every entity type present in the corpus is either supported or listed as an explicit refusal |
| X5 | **Writer conformance**: schema-valid output (AP242 `FILE_SCHEMA` strings), pass an external STEP syntax / geometry validator available in CI (decision recorded when chosen), STEP at 1e-11 round-trip remains the gate in `gates.test.ts`. | validator reports 0 errors on a generated set |

### 2.2 IGES, DXF and others

| ID | Item | Gate |
|---|---|---|
| X6 | **IGES depth**: trimmed surfaces (128 + 142/143), curve on parametric surface (142), composite curve (102), rational B-spline curves / surfaces, surface of revolution (120), tabulated cylinder (122), ruled surface (118), offset surface (140), subfigures / transformation matrices (124/125), units (global section), colours and names. | corpus IGES files read; the existing unsupported-entity diagnostics become shorter |
| X7 | **DXF / DWG**: complete DXF (blocks, inserts, text styles, hatches, splines, dimensions → geometry) both ways; **DWG** only via decision D2 of spec 39. | DXF round trip of the drawing fixtures preserves entity counts and bounds |

### 2.3 Meshes and point data

| ID | Item | Gate |
|---|---|---|
| X8 | **Mesh import**: STL (binary / ASCII), OBJ, 3MF, PLY into mesh bodies with unit / orientation handling, repair (`mesh-clean.ts`: weld, T-junction repair, hole filling, orientation), and a validity report. | known-defective STL fixtures repaired to a closed manifold or refused with the defect list |
| X9 | **Faceted → analytic recovery** ("mesh to B-rep light"): region growing by normal / curvature to detect planes, cylinders, cones, spheres; fit with tolerance; intersect neighbouring fitted surfaces to rebuild edges; result carries a `maxDeviation` and unfit regions stay faceted. | an STL of a box with a bore recovers 7 faces (6 planes + cylinder) with deviation ≤ 0.01 mm; unrecoverable shapes stay mesh bodies |
| X10 | **Mesh export additions**: STEP faceted export for mesh bodies, glTF materials from colours (spec 49/46 properties), USDZ is not planned. | existing exports unchanged |

### 2.4 Native CAD formats (owner decision D2)

Parasolid (`.x_t`, `.x_b`), ACIS (`.sat`, `.sab`), JT, SolidWorks (`.sldprt`, `.sldasm`), Creo (`.prt`, `.asm`), Inventor,
Fusion (`.f3d`), CATIA. These are proprietary or licence-gated; **no work item starts without D2**. The three options and what
each costs:

1. *Licensed translator library* (e.g. a vendor SDK): broad coverage; licence cost and a native binary in the Tauri build.
2. *User-side conversion to STEP / IGES* with import guidance and a diagnostic message: zero licence; this is the default.
3. *Open documented text formats only* (ACIS SAT text, Parasolid transmit text where its specification permits): partial
   coverage and a legal check before implementation.

## 3. Honest limits

- STEP and IGES carry geometry and structure, not the feature history of the source system: imported bodies are dumb solids
  (spec 45 direct edit applies).
- Colours / PMI fidelity is bounded by what the sending system writes.
- Parity with a vendor's own translator on its own file is not claimed.

## 4. Order

X3 (corpus runner first, so every other item has numbers) → X1 → X4 → X6 → X8 → X2 (with spec 49 P2) → X9 → X5 → X7 → X10;
§2.4 only with D2.
