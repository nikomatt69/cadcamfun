# 42 — Kernel robustness: Booleans, surface intersection, tolerant modelling

Status: specified 2026-10-24 (not built). Part of [spec 39](39-professional-parity-master-plan.md). Owner: WP1
(`packages/core/src/cad/brep`). Extends the 2026-10-21 enterprise pass recorded in [spec 33](33-kernel-gap-analysis.md) §7.

Verified state of every item (2026-10-25): see [spec 57](57-parity-ledger-2026-10-25.md); it supersedes the status line above.

## 1. Where it stands (verified)

- Topology already carries tolerances: `Vertex.tol`, `Edge.tol`; `validateBrep` checks vertex-on-curve, edge-on-surface, loop
  closure, manifoldness, orientation, Euler–Poincaré and `face-empty`.
- `booleanBrep` (1 315 lines) is exact for analytic faces and NURBS operands the intersection code can march
  (`intersect.ts`: `refineSurfaceSurface`, `meshIntersectionPolylines`, `refineSsiPolyline`, `unwrapSsi`).
- A tangent or coincident contact that makes a non-manifold result is **recovered by displacing operand B by 3e-6…3e-4 of its
  extent**, with a warning (`booleanStrict` disables the recovery). Result volume is then wrong by the displacement.
- `fuzz.test.ts` pins one known failure: generic seed 14, torus × sphere (the intersection curve folds back within 1e-4 mm).
- Known hard-won rules (from the Boolean lessons): coincident edges must meet only at overlap ends; tangential hits drift ~1e-5;
  a sampled point must be inside its fragment; no pole inside a kept sphere patch; reframing a sphere / cylinder surface frame is
  not safe because the seam edge stops matching.

Commercial kernels (Parasolid, ACIS, OpenCascade) do not move an operand to resolve a designed coincidence. A model with flush
faces, coaxial holes or tangent cylinders is the normal case in CAD, not a fuzz curiosity.

## 2. Work items

| ID | Item | Gate |
|---|---|---|
| R0 | **Failure taxonomy and counters.** `BooleanResult.diagnostic` already names the stage; add counters (recovered-by-displacement, strict-failure, empty-result) and a seeded report script `scripts/kernel-fuzz-report.ts` writing JSON. | report runs for seeds 1…500 in < 20 min on the reference machine (target); counters appear in the commit message of any kernel change |
| R1 | **Pinned failure.** Solve generic seed 14 (curve folding back within 1e-4 mm): fold detection in `refineSsiPolyline`, split the polyline at the fold turning point, treat as two branches meeting at a tangent vertex. | seed 14 passes un-pinned; the pin is deleted from `fuzz.test.ts` |
| R2 | **Robust predicates.** Replace epsilon comparisons in classification (`classify.ts`, point-in-face, side tests) with adaptive-precision orientation predicates (Shewchuk-style expansion arithmetic for `orient2d` / `orient3d` / `incircle`) where inputs are polylines or planar loops; analytic surfaces keep tolerance logic with a stated bound. | a predicate unit suite on degenerate inputs (collinear, cocircular, near-coplanar within 1 ulp) agrees with exact rational arithmetic (BigInt) on 10⁵ random cases |
| R3 | **Designed coincidence without displacement.** Same-domain faces (coplanar, coaxial cylinders of equal radius, equal spheres) are detected by surface equality within tolerance and merged / classified analytically before the intersection step. | "designed-coincidence" set (≥ 60 cases: flush faces, coaxial bores of equal and unequal radius, tangent cylinders, hole through a cylinder at an exact axis offset, rim on a face): 0 recoveries by displacement, volumes exact to 1e-9 relative |
| R4 | **Tangent contact** (touching spheres / cylinders along a line, tori tangent along a circle): produce the correct manifold or non-manifold result by analysing the contact as a degenerate intersection (a point / curve of tangency becomes an edge or vertex with `tol` set), not as noise. Non-manifold results are returned as such for `Boolean` types that allow them and reported otherwise. | 20 tangent cases verified against analytic volumes; none relies on displacement |
| R5 | **General SSI.** NURBS × analytic and NURBS × NURBS marching with: seed finding by subdivision / BVH of control nets, step control by curvature, closed-loop detection, singular points (tangency, cusps), branch handling, self-intersection of a single curve. Replaces the mesh-based seeding where it fails. | 200 seeded NURBS pairs: curve error ≤ 1e-6 mm to both surfaces, no missed loops against a dense-grid truth; budget-aware |
| R6 | **Tolerance management.** Rules for growing `Vertex.tol` / `Edge.tol` when two entities are merged (max of tolerances plus the merge distance), a global cap (`MODEL_TOL` multiples) after which the body is flagged `loose`, and a `healBrep` mode that tightens by re-projecting. `validateBrep` reports the largest tolerance. | after a chain of 50 Booleans on a plate with holes the maximum tolerance stays ≤ 1e-6 mm (target); `loose` bodies are refused by STEP export unless opted in |
| R7 | **Valid-but-wrong detection.** Extend the identities (U+I=A+B, S+I=A) to every Boolean in debug mode and to a sampled volume check in production for bodies above a face count; add the `face-empty` style check for poles. | the 2026-10-21 pole case remains caught; no valid-but-wrong in the 500-seed run |
| R8 | **Performance.** Profile with `bun --cpu-prof`; the known slow case is corner Booleans on a fully rounded box. Add spatial indexing (face-pair BVH by face bounding boxes with surface-aware bounds), cache face tessellations per surface, and skip faces far from the other operand (already used for meshing). | fully rounded box Boolean < 5 s (target; today it is the documented slow case); gates budget of 15 s kept |

## 3. Gates (the suite that closes the spec)

1. `fuzz.test.ts` seeds 1…500 in aligned and generic modes: **0 failures, 0 pinned**, ≤ 1 % of cases use displacement recovery,
   and each recovery carries its warning.
2. The "designed-coincidence" set (R3) and the tangent set (R4): 0 recoveries.
3. Volume identities hold on every case; results compared against grid / Monte Carlo truth at 0.2 % (target) to catch
   valid-but-wrong results.
4. STEP round trip of each result validated by the OpenCascade reader.
5. Existing `boolean.test.ts`, `degenerate.test.ts`, `gates.test.ts`, `heal.test.ts` unchanged.

## 4. Honest limits

- Floating point cannot make every Boolean exact; the contract is "valid, within declared tolerance, or a typed refusal".
- NURBS × NURBS with near-tangency over a region (not a curve) can legitimately fail; it returns `BooleanError` with
  `diagnostic.stage = "ssi"` and the surface pair.

## 5. Order

R0, R1, R2, R3 (largest user value), R6, R4, R7, R5, R8. R5 unlocks spec 44 and spec 43 offsets on NURBS.
