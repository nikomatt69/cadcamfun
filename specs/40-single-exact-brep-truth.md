# 40 — One exact model per body: the mesh becomes derived

Status: specified 2026-10-24 (not built). Part of [spec 39](39-professional-parity-master-plan.md). Owner: WP1.
Files: `packages/core/src/cad/{history.ts,history-brep.ts,history-edit.ts}`, `cad/brep/*`; adapters named in §6.

## 1. Problem

SolidWorks, Creo and Fusion keep one boundary representation per body; display and CAM meshes are tessellations of it. Here a
parametric history is replayed **twice**: `rebuild` (`history.ts`) produces triangle-mesh bodies by BSP Booleans, and
`rebuildExact` (`history-brep.ts`) replays the same features as exact B-reps "from the parameters and the solved sketches
`rebuild` already computed".

**Measured state (2026-10-24, `cad/history-exactness.test.ts`, 56 cells).** 49 cells are exact, 7 are mesh-only with a reason:
modelled thread, push/pull of a curved face, draft of a curved face, non-uniform scale, and the catalogue elements ellipsoid,
gear and capsule. One more cell documents a *refusal* rather than a mesh fallback: the fillet of a pipe T-junction curve finds no
blend edge (spec 43 B1). Loft, uniform scale, shell of a Boolean result, sweeps, coils, ribs, sheets and text are exact (the
older header of `history-brep.ts` listed loft as mesh-only; it was stale). Consequences that remain:

- the viewport and the CAM dexels see the **mesh**, STEP and drawings see the **B-rep**; they can disagree (spec 33 K2 had to
  re-derive the mesh from the exact body for one blend family);
- every feature is implemented twice, and a body that touches one unsupported feature silently loses its exact model;
- selection (spec 41) cannot be exact on a mesh body.

**Found by the matrix and fixed on the way.** `transformBrep` with a scaling did not scale the parameter bounds of line edges
(a line is parametrised by arc length), so every uniformly scaled body with straight edges was an *invalid* B-rep (edges
ending 5-20 mm from their vertices). It affected the `scale` feature and the STEP-import `scale` option. Fixed in
`brep/topology.ts` and covered by `brep/transform.test.ts` (13 of its 20 tests fail without the fix).
Also noted: a feature with an unknown `operation` string (for example `"cut"` on an extrude, valid only on `combine`) is not
reported as an issue by either replay; the types forbid it, input from the assistant is validated by its schema.

## 2. Target

- `Body = { brep: Brep } | { mesh: Mesh, reason: string }`. The second form exists only for imported meshes and for features
  that are still refused (with the reason shown to the user), never as a silent fallback.
- The viewport, CAM (`buildPartModelFromMeshes`), mass properties, interference and drawings read a **tessellation cache**
  derived from the B-rep (`brep/tessellate.ts`, chord tolerance and angle tolerance as parameters, face ids kept so picking maps
  a triangle to a face).
- `rebuild` (mesh) is demoted to `legacyMesh` and removed only under owner decision D1 of spec 39.

## 3. Work items

| ID | Item | Gate |
|---|---|---|
| U0 | **Coverage matrix** (built: `cad/history-exactness.test.ts`, 56 cells, baseline recorded). `cad/history-exactness.test.ts` enumerates every feature kind × option set (extrude edge / corner / taper, hole kinds, thread, loft, shell variants, fillet families, draft, push/pull, scale, catalogue primitives, pattern kinds incl. path and bodies, mirror, split, combine, coil, rib, sheet, text) and records `exact` / `mesh-only(reason)`. The file is the baseline and fails when a cell regresses from exact to mesh-only. | matrix committed; every `mesh-only` cell has a reason string; test fails if a previously exact cell degrades |
| U1 | **Modelled thread exact.** The exact sweep cannot yet keep the thread profile radial about the axis (spec 33 §4 item 2). Build the thread as a helical sweep with a radial-frame option in `path-sweep.ts`, union with the shank in one Boolean per thread (not per turn). | M6×1 and ½"-13 UNC threads: valid B-rep, volume within 0.2 % of the analytic thread volume, STEP read back by the OpenCascade reader at 0.1 %; 58-turn thread under the 15 s budget |
| U2 | **Curved-face draft and push/pull exact.** Implement as offset / tilted surface replacement for cylinder, cone, sphere, torus and NURBS faces with re-intersection of neighbours (shares machinery with spec 43 offset). Refusal for faces whose neighbours cannot be re-intersected. | draft of a cylindrical wall 2° from a neutral plane: volume equals the analytic frustum within 1e-7 mm³ relative; push/pull of a spherical cap changes volume by the analytic cap formula |
| U3 | **Non-coaxial curved blends** are specified in [spec 43](43-general-blends-shell-offset.md); U3 only wires the result into the history replay and removes the mesh-only cell. | cell turns exact when spec 43 B1 lands |
| U4 | **Non-uniform scale.** Exact for planes and NURBS (affine map is a NURBS-preserving transform); cylinders become elliptic extrusions, spheres become ellipsoid NURBS surfaces (rational). Refuse with a reason where the image is not representable (cones, tori). | box ×(1,2,3): exact planes; cylinder along a scaled axis becomes an `extrusion` of an ellipse; volumes scale by sx·sy·sz to 1e-12 |
| U5 | **Catalogue elements.** Every catalogue primitive that `catalogueBrep` does not cover gets an exact builder or a typed refusal listed in the matrix. | matrix has no cell without a reason |
| U6 | **Derived mesh cache.** One function `bodyMesh(body, tolerance)` used by viewport, CAM and export; cached by `(brep hash, tolerance)`; mesh and B-rep volumes agree within the tessellation bound (Float32 positions: compare at 1e-5). | viewport, `buildPartModelFromMeshes` and `export-mesh.ts` all call it; cache hit ratio test; a mesh/BREP volume parity test over the matrix fixtures |
| U7 | **Retire the mesh replay** (only with decision D1). Delete `rebuild`'s Boolean path for exact-capable features; keep the sketch solver and parameter evaluation, which both replays already share. | all `history-*.test.ts` pass on the B-rep path alone; CAM goldens unchanged byte for byte |

## 4. Design notes

- The sketch solve and parameter evaluation are shared today (`rebuildExact` takes the `RebuildResult`); keep that seam. The
  work is moving the **feature dispatch** to one implementation that builds a B-rep, not changing the solver.
- The tessellation must stay watertight at shared edges (it already is for STEP-exported bodies: `brep/tessellate.ts`).
  Display-only smoothing (crease normals) is a property of the mesh derived from the B-rep, not of the model.
- Performance: the exact path is slower than the BSP path on simple parts. Keep `rebuildExact`'s `budgetMs`; when the budget is
  exceeded the result carries `reason: "budget"` and the last good exact prefix, as today.
- CAM consumes meshes (dexels, drop-cutter). Because tessellation error enters the CAM tolerance, the CAM kernel must record
  the tessellation tolerance in the program evidence (spec 53 V5).

## 5. Honest limits

- Imported meshes (STL / OBJ / 3MF) stay mesh bodies; spec 50 X5 specifies faceted-to-analytic recovery.
- Tessellation error is bounded by the chosen chord tolerance, not zero.

## 6. Adapters

`packages/api` (rebuild report fields `exact: boolean`, `reason?`), sidecar (parametric handler), `packages/ai`
(`cad.parametric_exact` already has `warnings`), desktop viewport (picks by face id), CAM planner (`brep-part.ts`).

## 7. Order

U0 first (baseline, cheap, exposes the truth), U6, U1, U2, U4, U5, U3 with spec 43, U7 last and only with D1.
