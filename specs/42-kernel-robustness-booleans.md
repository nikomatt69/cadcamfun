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

## 6. Status 2026-10-30 (spec 72 Wave 2, steps 2.1 and 2.2)

Evidence rule: every line below is backed by a test in `packages/core/src/cad/brep/`; what has no test is listed as open.

**Measured before (baseline, same machine):** `boolean/degenerate/fuzz/gates/heal.test.ts` 55 pass / 0 fail. A probe of 30 aligned,
flush, coaxial and tangent pairs sent 10 to the displacement recovery (box edge contact, internally and externally tangent
cylinders, internally tangent spheres, equal coincident spheres, equal-sphere difference, box with a cylinder tangent to a wall
(R5) inside and outside, a sphere resting on and touching a box face). `BooleanCounters` showed `recoveredByDisplacement: 10`.

**Landed**

| Item | What | Evidence |
|---|---|---|
| R2 | `predicates.ts`: `orient2d`, `orient3d`, `incircle` with a filtered fast path and exact floating-point expansions behind it. Used for the winding of a point in a face's boundary polygon (`classify.ts` point-in-face; fragment holes, samples and the even-odd test in `boolean.ts`). Decisions on analytic surfaces (a point against a plane, sphere, cylinder) keep their tolerance: that is a modelling decision, not a sign question. | `predicates.test.ts`: 100 000 `orient2d`, 50 000 `orient3d`, 30 000 `incircle` cases, half within a few ulps of degenerate, against an independent BigInt oracle (0 disagreements); the plain determinant the kernel used before is wrong on > 100 of the `orient2d` cases |
| R3 | Designed coincidence solved in place. The pole shortcut (which sent any sphere pole / cone apex lying on the other solid to the displacement) now routes only poles on curved faces that are not the pole's own surface; a pole on a plane or on an equal sphere/cone goes through the plain pipeline and its answer is checked against a sampled volume. Same-domain merge: fragments on one cylinder or cone (same axis, reference direction, radius/apex) that meet along a closed circle merge into one face (a first version that merged across any shared edge broke a 31-turn helical thread cut in `scene-step.test.ts`; it is limited to rings) (a stack of coaxial cylinders of one radius is one side face, not three). A contact point on a seam sample was found twice (sample and inserted split vertex) and left a zero-length piece: now one node. | `coincidence.test.ts`: 56 cases x 3 operations (boxes with shared / flush faces, cylinders on a box with flush ends and bosses, coaxial cylinders of equal and unequal radius, tangent sets); 0 displacements, `recoveredByDisplacement` 0, volumes within 1e-9 of the analytic value |
| R4 | Tangent and edge contact kept in place (`contact.ts`). A contact along a curve (cylinder tangent to a wall or to a cylinder, boxes sharing an edge) leaves an edge four fragments meet at. The edge becomes two coincident edges, one per wedge of material (wedges found from each fragment's inward direction and material side at the edge middle; cusps of zero angle pair by the same rule), and the vertices at its ends split per fan. A point contact between shells (internally tangent spheres) gets one vertex per shell. The result is a valid manifold B-rep whose coincident edges touch (zero-thickness contact); the volume is exactly the operands'. Each such result carries a warning that names it ("kept in place") and counts in `BooleanCounters.inPlaceContact`; none is a displacement. | `coincidence.test.ts` tangent set (23 cases x 3 operations), `degenerate.test.ts` R5 |
| R6 (heal) | `healBrep` moves geometry inside its tolerance: welded vertices are re-projected onto the faces around them (Gauss-Newton on the squared distances), straight edges are refitted through them, vertex and edge tolerances are measured again, faces whose boundary tolerance exceeds the loose limit (10 x `MODEL_TOL`) carry `Face.loose`, a face written twice is dropped, and an unrepairable body returns diagnostics with the gap to the nearest unmatched edge. `validateBrep` reports `maxTolerance`. | `heal.test.ts`: exploded box with 30 micrometre per-face gaps heals to the exact solid (volume 1e-9, tolerance < 2e-6, 8 vertices re-projected, no loose face) and accepts a subtraction and a union; the weld-only form leaves a 4e-5 tolerance and flags loose faces; a 3 mm gap with tolerance 1e-5 is refused with "above the healing tolerance" and the gap, and heals when the tolerance covers it |

**Fuzz after (probe, aligned mode, seeds 1-120, 360 Booleans):** 0 failures, 0 invalid, volume identities hold; 3 seeds (9 Booleans,
2.5 %) still use the displacement recovery: seed 33 (torus x cylinder, the tube's centre line crosses the cylinder axis: torus seam
meets the intersection curve), seed 81 (sphere pole on a torus, routed to the recovery on purpose), seed 116 (plane through a
sphere's centre and poles: the intersection circle is the sphere's seam). The 1 % target of gate 1 is therefore **not** met on this
sample; `fuzz.test.ts` (16 seeds per mode) asserts zero displacements and passes. Seed 73 (a truncated cone whose apex, outside the
solid, lay on a cylinder) was a false pole contact and is fixed. In-place contacts: 3 seeds. Generic mode, seeds 1-60 (180 Booleans): 0 failures, 0 displacements.

**Left open (not claimed)**

- R1 (seed 14 fold), R5 (general SSI), R7 (valid-but-wrong on every Boolean), R8 (performance): untouched.
- R3 same-domain merge covers planes, and cylinders and cones with an identical parametrisation that meet along a closed ring; spheres,
  tori, faces with a different reference direction and curved faces that meet along any other edge are not merged. The "coaxial cylinder of equal radius with a different seam" case is solved
  (volumes exact) but leaves the two faces.
- R4: a pole or apex on a curved face of the other solid (a sphere pole on a torus) still goes through the displacement recovery,
  reported as before (the strict pipeline was seen 0.8 % off there; `degenerate.test.ts` pins the balanced result). Tori tangent
  along a circle and general analytic-versus-NURBS tangency are untested. The "kept in place" result is not a non-manifold solid:
  it is the manifold-by-duplication form, so a consumer that merges coincident edges would see the pinch again.
- R6: no tolerance growth rules across a chain of Booleans (the 50-Boolean gate), no refusal of `loose` bodies by STEP export,
  circles and splines are not refitted (their vertices take the larger tolerance), and routing imported STEP bodies through
  `healBrep` into a history base feature is outside `packages/core/src/cad/brep` (spec 72 P2-10, import half).
