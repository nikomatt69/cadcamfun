# 45 — Sketcher depth, interactive solving and direct editing

Status: specified 2026-10-24 (not built). Part of [spec 39](39-professional-parity-master-plan.md). Closes C8, C13 of
[spec 33](33-kernel-gap-analysis.md). Owner: WP1 (`cad/sketch*.ts`, `cad/brep/face-edit.ts`, `cad/face-edit.ts`); desktop
sketcher UI is WP6/WP7 (`apps/desktop/src/features/cad`). Depends on [41](41-persistent-topological-naming.md).

## 1. Where it stands (verified)

- Sketch entities: point, line, circle, arc, ellipse, spline. The spline is a Catmull-Rom curve through points
  (`SketchSpline.points`); K1 keeps nominal curve provenance for ellipse / Bezier / NURBS shapes at profile time
  (`sketch-curves.ts`).
- 24 constraint kinds (fixed, coincident, horizontal / vertical (+Points), distance(X/Y), length, parallel, perpendicular,
  equalLength, equalRadius, radius, diameter, angle, pointOnLine / Circle / Ellipse, midpoint, symmetric,
  tangentLineCircle, tangentCircles, concentric, ellipseSize). `solveSketch` is Levenberg–Marquardt with DOF analysis and statuses
  `fully-constrained | under-constrained | over-constrained | conflicting | failed`.
- `sketch-edit.ts`: trim, extend, entity intersections. `sketch-shapes.ts`: shape expansion (rectangle, polygon, slot…).
- Sketch planes: principal planes and `plane` features (offset, angle, three points, planar face).
- Direct editing: planar push/pull and draft exact; curved by mesh (`smooth-face.ts`); mates.
- Per spec 33 §3 the desktop has no drag-to-edit sketcher on the solver (not re-verified for this spec).

## 2. Work items

### 2.1 Sketch

| ID | Item | Gate |
|---|---|---|
| K1 | **Project / intersect / offset-edges to sketch.** Entities derived from model edges and faces (refs, spec 41), kept associative: when the model changes, projected geometry updates; `reference` entities are non-driving. Silhouette projection of a body onto the plane. | project a cylinder edge onto a skew plane: the ellipse is exact (semi-axes to 1e-9); edit the cylinder radius → the projected entity follows |
| K2 | **NURBS splines**: control-point splines (degree, weights, knots) and fit-point splines (interpolation with end tangents), conversion between them; tangent / curvature-continuity / fixed-tangent-direction constraints on splines; spline-on-endpoint tangency to line / arc. | fit spline through 7 points keeps them to 1e-9; tangent constraint to an arc satisfied to 1e-8 rad; profile area exact against the nominal curve |
| K3 | **Sketch tools in the solver**: offset (with corner handling), fillet / chamfer 2D, mirror, linear / circular / path patterns (as driving relations), polygon, slot, conic, sketch text, point-on-spline, fix / lock, curve length constraint, collinear, smooth, symmetric about axis for arcs. | each tool produces constraints (not frozen geometry) and keeps DOF correct; offset of a rounded rectangle by d gives analytic perimeter |
| K4 | **3D sketch**: points, lines, arcs, splines in 3D; constraints on 3D (coincident, length, angle, plane-on, parallel to axis); used for sweep paths and routing. | helical 3D spline path drives a sweep (spec 44 S5) |
| K5 | **Sketch blocks / sub-sketches**: reusable constrained groups with an insertion transform and exposed parameters. | a block inserted twice moves rigidly; editing the block parameter updates both |
| K6 | **Diagnostics**: for `over-constrained` / `conflicting` return the *minimal* conflicting constraint set (QR rank analysis with a deletion filter), the remaining DOF list per entity (which point can still move) and redundant constraints; "driven dimension" (reference dimension) kind. | seeded conflicts of 2…5 constraints: the reported set is minimal in ≥ 95 % of 200 random cases and always contains a culprit (target) |
| K7 | **Interactive drag solve.** Incremental solver: warm start from the previous solution, sparse Jacobian, active set limited to the connected component of the dragged entity, deterministic pose given the same drag path; a `dragSketch(sketch, entityId, target)` API returning updated positions. | 200-entity sketch, one drag step: ≤ 8 ms median in the core (target; the UI budget is 16 ms); result equals a cold solve to 1e-9 |
| K8 | **Desktop sketcher**: drag-to-edit, dimension entry with expressions, constraint glyphs, DOF colouring, snap (existing `cad/snap.ts`), sketch on face by ref. Driven only through the K7 API; no solver logic in the UI. | happy-dom panel tests for the interaction state machine; a real-window run recorded in the commit |

### 2.2 Direct editing

| ID | Item | Gate |
|---|---|---|
| D1 | **Delete face with heal** on any body: remove the face, extend / intersect the neighbours until closed (planar / quadric neighbours exact; NURBS via spec 44 S6). | box with a through-hole: delete the hole wall → solid box, volume exact; STEP-imported body works the same |
| D2 | **Offset face** (move a face along its normal or a vector) for any analytic face with neighbour re-intersection; **move / rotate face** (translate a planar face along its plane, tilt about an edge). | pocket floor offset by 2 mm: volume change = area × 2 exact; cylinder wall offset changes radius |
| D3 | **Replace face** with another surface; **split face**; **merge coplanar faces** (clean after Booleans). | planar merge reduces face count, volume equal |
| D4 | **Thin extrude**, **extrude from face until next / to body / symmetric**, **extrude cut with draft**, join / cut / intersect / new body for every sweep-type feature (some exist: extend uniformly). | extrude "up to next" stops at the first obstructing face exactly |
| D5 | **Direct edit of imported STEP**: all operations above create history features (`directEdit` kind) that replay on the imported base solid with refs. | edit-then-rebuild round trip is deterministic |

## 3. Honest limits

- A drag with an over-constrained sketch stops at the constraint boundary and reports it; it never relaxes a constraint.
- Direct edits that need a surface the kernel cannot intersect (NURBS×NURBS before spec 42 R5) are refused with the surface pair.
- Conversion of arbitrary raster / mesh to sketches is out of scope.

## 4. Order

K6, K2, K3, K1 (needs spec 41 N3), D1–D3, K7, K8, K4, K5, D4, D5.
