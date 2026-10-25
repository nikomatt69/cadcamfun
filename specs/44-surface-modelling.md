# 44 — Surface modelling: trim, offset, rail lofts, fill, continuity analysis

Status: specified 2026-10-24 (not built). Part of [spec 39](39-professional-parity-master-plan.md). Closes C7 and K3 of
[spec 33](33-kernel-gap-analysis.md). Owner: WP1 (`cad/brep/{surface-patch,nurbs,loft,sweep}.ts`, new
`cad/brep/{trim,fill,analysis}.ts`). Depends on [42](42-kernel-robustness-booleans.md) R5 (SSI).

Verified state of every item (2026-10-25): see [spec 57](57-parity-ledger-2026-10-25.md); it supersedes the status line above.

## 1. Where it stands (verified)

- NURBS curve/surface evaluation with derivatives, knot insertion, sub-curve, interpolation (`nurbs.ts`).
- `surfacePatch`, rectangular / isoparametric `trimSurfacePatch`, `stitchSurfacePatches` (kind `surface` or `solid`),
  `thickenSurfacePatch` (planar normal and explicit curved axial thickening), `buildSurfaceOperation` (`surface-patch.ts`).
- Coedges can carry p-curves (`Coedge.pcurve`), so trimmed faces in (u,v) are representable by the topology.
- Exact loft of rational ruled columns (`loft.ts`), exact path sweeps (`path-sweep.ts`).
- The older `cad/surface.ts` (826 lines) is a **mesh** module (bevel, shell, sweep, loft on triangles): not surface modelling.
- Absent: general trimming curves, normal offset of curved patches, loft with guide rails or tangency, network / boundary / fill
  surfaces, extend, untrim, replace face, any continuity or curvature analysis.

## 2. Work items

| ID | Item | Gate |
|---|---|---|
| S1 | **General trim.** A face = NURBS surface + loops of p-curves in (u,v) + 3D edge curves. Trim by: a curve projected onto the surface, the intersection with another surface / plane (SSI, spec 42 R5), an isocurve, a split line. Handles holes, multiple regions, untrimming. Tessellation of trimmed NURBS faces (CDT in uv with curvature-adaptive boundary sampling) is added to `brep/tessellate.ts`. | patch trimmed by a plane crossing it: boundary curve lies on both surfaces within 1e-6 mm; trimmed area against grid truth within 0.1 %; mesh is watertight against its neighbour |
| S2 | **Normal offset / thicken of curved patches** with declared `maxError` (see spec 43 O2), self-intersection and cusp handling, result sewn into a closed solid with side walls built from the trim loops. | thickened NURBS hemisphere (radius 20, thickness 2, rational patches): volume within 0.2 % of 2/3·π·(R_o³−R_i³); solid valid |
| S3 | **Loft with guide rails, tangency and closed loops.** Sections + 1…n rails; end conditions G0 / G1 / G2 against adjacent faces; section matching (parameter / arc length, vertex correspondence control); closed and periodic lofts. | loft between two circles with a straight rail equals the cylinder volume to 1e-9; G1 end condition: angle to the neighbour face ≤ 1e-4 rad at 100 samples |
| S4 | **Fill / boundary / network surfaces.** Coons patch for 4 edges, n-sided fill (Gregory or split into 4-sided patches) for n ≥ 3 with G0 / G1 / G2 to the neighbours, interior control by points or guide curves. | 3-sided and 5-sided corner fills: boundary deviation ≤ 1e-6, G1 angle ≤ 1e-3 rad |
| S5 | **Two-rail sweep, twist and scale laws, sweep with guide surface.** Extends `path-sweep.ts`. | twisted sweep of a square: analytic volume of the twisted prism to 1e-4 |
| S6 | **Extend, untrim, replace face, delete face with heal, offset curve on surface, surface split.** | each has a validity + analytic-volume test |
| S7 | **Stitch with gap closing.** Sew within a tolerance with reports of unsewn edges (tolerance-aware, uses spec 42 R6 rules). | open box of 6 patches with 1e-4 gaps → closed valid solid; a 0.1 mm gap is refused with its location |
| S8 | **Curve and surface tools**: fit with tolerance (least squares), degree elevation, knot removal, reparametrisation, curve blend (G1/G2 between curves), project / intersect curves, helix / spiral / spline-on-surface. | fitted curve within the requested tolerance of 200 samples |
| A1 | **Analysis.** Zebra stripes, curvature comb (curves), Gaussian / mean curvature maps (surfaces), draft angle map relative to a pull direction, minimum radius, deviation between two bodies. Output = sampled data (arrays + colour ramps) consumed by the viewport; no rendering in the core. | draft map on a drafted box returns the draft angle ±1e-6 rad; curvature of a sphere equals 1/R ±1e-6 |
| A2 | **Continuity report** across any edge: G0 gap, G1 angle, G2 curvature difference, at N samples with max/mean. | reports match analytic values on cylinder–plane tangent, plane–plane 30° and a G2 NURBS pair |

## 3. Interfaces

`SurfaceBody` stays the open-shell container of `surface-patch.ts`; add `trimFace(face, TrimSpec)`, `loftRails(sections, rails,
conditions)`, `fillSurface(boundary, conditions)`, `offsetFace(face, d)`, `analyse(face | brep, kind, options)`. History:
`surface` feature kinds (patch, trim, loft, fill, offset, thicken, stitch); AI schema parameter names only.

## 4. Gates

Each item's gate above; global gates: every produced body passes `validateBrep`; surface results survive STEP write/read with
the same area (1e-6 relative) in the OpenCascade reader; no operation approximates silently (every approximation reports
`maxError`).

## 5. Honest limits

- Class-A quality (curvature-continuous blends with designer-controlled flow, interactive control-point surfacing) is a user
  interface product; this spec delivers the kernel operations and the analysis data, not the interactive tools.
- Subdivision / T-spline sculpting (Fusion's Form workspace) is **not** included (decision D6 of spec 39, default out of scope).

## 6. Order

S1 → S2 → A2/A1 → S3 → S7 → S4 → S5 → S6 → S8. S1 and S2 unblock spec 43 O2 and spec 40 U2.
