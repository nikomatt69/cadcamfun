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

### 6.1 Follow-up 2026-10-30 (second kernel session)

Evidence rule as above; tests are `fuzz-residuals.test.ts`, `tolerance.test.ts`, `heal-circle.test.ts`, `history-import.test.ts`
(23 new tests); the sweep tool is `packages/core/src/cad/brep/fuzz-sweep.ts` (`bun run ... 121 240 aligned`).

| Item | What | Evidence |
|---|---|---|
| R3/R4 residual: sphere pole on a torus (seed 81) and an intersection circle that is a sphere's seam through its poles (seed 116) | Solved in place, exactly. Before any displacement a **bare** sphere or torus operand (one face, what `makeSphere` / `makeTorus` build) is rebuilt with another frame (a sphere's axis is turned so its poles and seam leave the contact; a torus is turned about its axis): the same solid, other parametrisation. The reframed pair must agree with the operands (sampled volume) and satisfy the volume identities to 1e-7, else the next frame, else the displacement. `BooleanCounters.reframed` counts it; no warning, because nothing moved. | `fuzz-residuals.test.ts`: seeds 81 and 116, 0 warnings, 0 displacements, identities 1e-7, intersection volume within 1 % of a 400 000-point Halton oracle built from the analytic solids. The strict result of seed 81 was valid but wrong by 0.85 mm3 before (the pole routing is what caught it) |
| Seed 170 (121-240 range) | Fixed by the same reframing (sphere seam against a cylinder), 0 warnings | sweep below |
| Seed 33: torus x cylinder | **Not solved.** The torus's lowest tube circle touches the cylinder's lowest line exactly at the cylinder's end rim: the two intersection branches cross at a point that lies on the rim and the end cap's section curve is tangent to the rim there. The same torus against a cylinder 8 mm long (the crossing inside the face) or 5 mm long (no contact) is solved by the plain pipeline; with the crossing on the rim it needs singular-point branching of the SSI (R5). The displacement stays as the reported last resort and now **names the case**: `degenerate alignment (torus x cylinder: singular surface intersection ... ): the second operand was displaced by 2.2e-3 mm ...; the result is exact only to that distance` | `fuzz-residuals.test.ts` seed 33: identities 1e-3, intersection within 2 % of the oracle, the warning names the surfaces and the reason |
| R6 tolerance across Booleans | A Boolean result carries the largest operand tolerance plus the fit measured on the result (`validateBrep` now reports `edgeDeviation` and `vertexGap`; `tolerance.ts` `inheritTolerance`). Exact operands and an exact operation stay at the model tolerance (1e-6) however long the chain; an operand looser than 1.5 x the model tolerance makes the result add its measured fit on top. Past the declared limit (`toleranceLimit`: 10 x the model tolerance, or 3e-6 x the body size) the affected faces are marked `loose` and the result carries a warning; `loose` faces stay loose through later Booleans. `BooleanOptions.maxTolerance` sets the limit, `BooleanStats.maxTolerance` reports the result. | `tolerance.test.ts`: 50 Booleans on a plate with holes end at tolerance <= 1.0001e-6 with exact volume; a loose operand gives a loose result with the warning; a 6-Boolean chain on a loose body grows the tolerance and stays loose |
| R6 STEP export | `writeStepBreps` throws `StepExportError` (part, tolerance, limit, loose faces) for a body with a `loose` face or a tolerance above the limit; `allowLoose: true` writes it with `LOOSE <part>: ...` in `FILE_DESCRIPTION` and the largest tolerance as the file's uncertainty. `sceneToStep` skips a loose body with the reason instead of failing the file. | `tolerance.test.ts`, `history-import.test.ts` |
| R6 heal: circles | `healBrep` refits circle edges within the healing tolerance: an arc moves (radius and plane kept) to the nearer circle through both end vertices, a full circle through its one vertex; a move above the tolerance is kept and listed in `HealReport.refitNotes`; `circlesRefitted`, `curveMove` report it. Ellipses and splines are still not refitted. An unrepairable body is still refused with the gap | `heal-circle.test.ts`: a cylinder with 30 micrometre per-face rim shifts heals to the exact volume, a half hole through a box edge (arcs with two vertices) too, a 300 micrometre shift with tolerance 1e-5 is refused with the gap |
| Imported STEP -> history | `importStepToHistory` (`cad/history-import.ts`) reads, validates and heals each solid and keeps it as a base body in `History.bases`; both replays start from the bases. Open or unrepairable bodies are refused with the heal's diagnostics (open edges, the gap, the tolerance that would close it). A body that healed but is loose is accepted and reported loose. | `history-import.test.ts`: exploded box (30 micrometre gaps) imported, healed, then a through hole, a blind pocket and a mirror-join rebuild to the analytic volume within 1e-9 (exact replay) and 0.5 % (mesh replay); a 3 mm gap is refused with "above the healing tolerance" and the tolerance that would heal it; a body missing a face is refused |

**Fuzz (aligned mode, `fuzz-sweep.ts`, 360 Booleans per range):**

| Seeds | Before (this session) | After | Failures | Wrong volumes |
|---|---|---|---|---|
| 1-120 | 3 displaced (2.5 %): 33, 81, 116 | **1 displaced (0.83 %): 33** (3 Booleans); 6 Booleans reframed | 0 | 0 (identities 1e-6 undisplaced, 1e-3 displaced) |
| 121-240 | 1 displaced (0.83 %): 170 | **0 displaced (0 %)**; 3 Booleans reframed | 0 | 0 |

Gate 1 (<= 1 % displaced) holds on both ranges, by one seed on the first. It does not hold for "no displacement at all": seed 33 remains,
and 500 seeds were not run.

**Left open (not claimed)**

- R1 (seed 14 fold), R5 (general SSI), R7 (valid-but-wrong on every Boolean), R8 (performance): untouched.
- R3 same-domain merge covers planes, and cylinders and cones with an identical parametrisation that meet along a closed ring; spheres,
  tori, faces with a different reference direction and curved faces that meet along any other edge are not merged. The "coaxial cylinder of equal radius with a different seam" case is solved
  (volumes exact) but leaves the two faces.
- R4: a pole or apex on a curved face of the other solid is solved exactly only when the operand is a **bare** sphere or torus
  (reframing). A sphere that is already a trimmed face of a larger body, and a cone apex on a curved face, still go through the
  displacement (reported, named). Tori tangent along a circle and general analytic-versus-NURBS tangency are untested. The "kept in
  place" result is not a non-manifold solid: it is the manifold-by-duplication form, so a consumer that merges coincident edges
  would see the pinch again.
- Seed 33 (singular SSI point on a face rim), see 6.1: needs R5 branching.
- R6: the tolerance rule is body-level (every entity of a result takes the largest operand tolerance), not per entity; ellipses and
  splines are not refitted by `healBrep`; the STEP reader does not mark a body loose from the file's own uncertainty; IGES export
  has no loose check. `History.bases` is a kernel field: the assistant/API history schema and the desktop timeline do not know it
  yet (spec 72 change log lists the exact follow-up), so a base body is not persisted by those layers.
