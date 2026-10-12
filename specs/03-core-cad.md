# WP1 — CAD geometry core (`packages/core/src/cad`)

Status: done; targeted solid geometry and document preservation hardening implemented. Owner dir: `packages/core/src/cad` (+ `packages/core/package.json`, `tsconfig.json`, `src/index.ts` barrel for the `cad` exports).

Pure, I/O-free TypeScript. No DOM, no Three.js, no Bun APIs, no database. Must run in Bun, in the webview, and in a Worker.

Legacy reference (domain knowledge only): `.reference/src/types/cad2d/{geometry,entities,commands,tools}.ts`, `.reference/src/types/cad.ts`, `.reference/src/lib/cad/`, `.reference/src/lib/constraints/`, `.reference/src/lib/canvas/`.

## 1. Primitives (`vec.ts`)

```ts
export interface Vec2 { readonly x: number; readonly y: number }
export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }
```

Plain immutable objects (no classes) so they serialise through JSON and Schema unchanged. Functions: `add, sub, scale, dot, cross2, length, distance, normalize, lerp, rotate, angleOf, fromPolar`, 3D equivalents prefixed `…3`. Constants `EPS = 1e-9`; `approxEq(a, b, eps)`.

## 2. Entities (`entities.ts`)

Schema-first, discriminated by `_tag` (replaces the legacy `EntityType` enum + `type` field). Every entity extends a base:

```ts
BaseEntity = { id: string, layerId: string, visible: boolean, locked: boolean,
               lineStyle?: LineStyle, transform?: Transform2D, userData?: Record<string, unknown> }
```

Selection state is **not** part of the entity (legacy had `selected` on entities; keep selection in UI state).

| `_tag` | Fields |
| --- | --- |
| `Line` | `start`, `end` |
| `Circle` | `center`, `radius` (> 0) |
| `Arc` | `center`, `radius`, `startAngle`, `endAngle`, `clockwise` (radians, normalised to `[0, 2π)`) |
| `Polyline` | `points: Vec2[]` (≥ 2), `closed`, optional per-vertex `bulge[]` (DXF-style arc segments) |
| `Rectangle` | `corner1`, `corner2` |
| `Ellipse` | `center`, `radiusX`, `radiusY`, `rotation` |
| `Spline` | `controlPoints`, `degree` (1–5), `closed`, optional `knots` |
| `Text` | `position`, `text`, `fontSize`, `fontFamily`, `rotation`, `alignment`, `baseline` |
| `Dimension` | `start`, `end`, `text`, `textPosition`, `arrowSize`, `textSize`, `dimensionType` |
| `Hatch` | `boundary: Vec2[]`, `pattern`, `scale`, `angle`, `fillColor?` |
| `Block` | `name`, `basePoint`, `entities: Entity[]` (recursive, via `Schema.suspend`) |

Export `Entity` (union), `isClosedShape(entity)`, and `Schema.decodeUnknownEffect(Entity)` helpers. A `Drawing` document type: `{ id, name, units: "mm" | "inch", layers: Layer[], entities: Entity[], version: number }`; this is the shape stored in `Drawing.data` (JSON) — keep a `schemaVersion` field and a `migrateDrawing(unknown)` function for forward compatibility.

## 3. Operations over entities

| File | Exports | Notes |
| --- | --- | --- |
| `bounds.ts` | `boundingBox(entity)`, `unionBounds(boxes)`, `boundsOfDrawing` | Exact for arcs (include axis extrema inside the sweep), ellipses (rotated), splines (convex hull of control points is acceptable) |
| `transform.ts` | `applyTransform(entity, t)`, `translate/rotate/scale/mirror(entity, …)`, `composeTransforms` | Non-uniform scale of a circle produces an `Ellipse`; uniform scale keeps `Circle` |
| `tessellate.ts` | `tessellate(entity, tolerance): Vec2[][]` | Chord-height tolerance in mm; arcs/circles/ellipses/splines → polylines; used by CAM and rendering. Closed shapes return a closed ring (first ≠ last point, `closed` flag separate) |
| `intersect.ts` | `intersect(a, b): Vec2[]` | line–line, line–circle/arc, circle–circle, polyline segments; no false positives outside arc sweep |
| `snap.ts` | `findSnap(entities, cursor, settings): Snap \| undefined` | Types: endpoint, midpoint, center, intersection, perpendicular, tangent, nearest, quadrant (as in legacy `SnapType`); priority order and tolerance from `SnapSettings` |
| `offset.ts` | `offsetPolyline(points, distance, closed): Vec2[][]` | Mitre joins with limit, arc joins optional; may return several loops; remove self-intersecting loops. Used for cutter compensation (WP2 calls it) |
| `shapes.ts` | `rectangleToPolyline`, `regularPolygon`, `slot`, `fillet(lineA, lineB, r)`, `chamfer(...)` | Constructors/modifiers used by the UI tools |
| `dxf.ts` (stretch) | `parseDxf(text): Drawing`, `writeDxf(drawing): string` | LINE, CIRCLE, ARC, LWPOLYLINE (with bulge), TEXT; ignore unknown entities with a warning list in the result |

## 4. 3D model (minimal for v6.0)

`solid.ts`: parametric primitives only — `Box`, `Cylinder`, `Sphere`, `Extrude(profile: Vec2[], height)`, `Revolve(profile, axis, angle)` described as **data** (Schema), plus `meshOf(solid, tolerance): { positions: Float32Array; indices: Uint32Array }` producing a triangle mesh for the viewport and for bounding-box/stock computations. Boolean CSG is **out of scope** for v6.0.

## 5. Acceptance tests (must exist)

- Bounding box of a quarter-circle arc equals the analytic box; of a rotated ellipse matches a dense-sample reference within 1e-6.
- `tessellate` of a circle with tolerance `t` never deviates from the true circle by more than `t` (property test over radii 0.1–1000 mm).
- `intersect(circle, line)` returns 0/1/2 points for miss/tangent/secant; tangent case within `EPS`.
- `offsetPolyline` of a unit square by +0.1 → square of side 1.2 (mitre); by −0.6 → empty.
- Round-trip: `Schema.decode(Entity)(Schema.encode(Entity)(e))` equals `e` for every `_tag`.
- `migrateDrawing` accepts a legacy drawing JSON sample and yields a valid `Drawing`.

## 6. Out of scope here

Rendering, hit-testing in screen space, command history/undo (UI state, WP6/WP7), constraint solver (deferred; `.reference/src/lib/constraints/` is informational).

## 7. As built

### 7.1 Barrel

`packages/core/src/index.ts` exports the CAD API **flat** (`export * from "./cad/index.ts"`) and as a namespace (`export * as cad`); the CAM layer (WP2) is exported only as `export * as cam from "./cam/index.ts"` because both layers define generic names (`Move`, `Path`, ...). Add further layers the same way.

### 7.2 Public exports of `features/cad/index.ts` (by file)

| File | Exports |
| --- | --- |
| `vec.ts` | `Vec2`, `Vec3`, `EPS`, `TAU`, `approxEq`, `vec2/vec3`, `ZERO2/ZERO3`, `add sub scale dot cross2 length distance normalize lerp rotate angleOf fromPolar midpoint perp negate vecApproxEq`, `add3 sub3 scale3 dot3 cross3 length3 distance3 normalize3 lerp3` |
| `arc-math.ts` | `normalizeAngle`, `arcSweep`, `signedSweep`, `angleInArc`, `pointOnCircle`, `bulgeToArc`, `sweepToBulge`, `arcSegmentCount` |
| `entities.ts` | Schemas `LineSchema ... BlockSchema`, `EntitySchema`, `DrawingSchema`, `LayerSchema`, `LineStyleSchema`, `ColorSchema`, `Transform2DSchema`, `Vec2Schema/Vec3Schema`; types `Entity`, `EntityTag`, `LineEntity ... BlockEntity`, `Drawing`, `Layer`, `Units`; helpers `isClosedShape`, `decodeEntity/encodeEntity/isEntity`, `decodeDrawing/encodeDrawing/isDrawing`, `emptyDrawing`, `baseEntity`, `makeArc`, `ENTITY_TAGS`, `CURRENT_SCHEMA_VERSION` |
| `box.ts` | `Bounds2D` (`{minX,minY,maxX,maxY}`) and box helpers (`unionBox`, `boxContains`, `inflateBox`, ...) |
| `bounds.ts` | `boundingBox`, `unionBounds`, `boundsOfDrawing`, `arcBounds`, `ellipseBounds` |
| `transform.ts` | `Affine2D`, `applyTransform`, `translate`, `rotateEntity`, `scaleEntity`, `scaleUniform`, `mirror`, `composeTransforms`, `invertAffine`, `applyAffine`, `transformOf`, affine constructors |
| `tessellate.ts` | `tessellate`, `arcPoints`, `ellipsePoints`, `ellipseSegmentCount`, `bulgedPolylinePoints`, `dropClosingDuplicate`, `closeRing`, `isRing` |
| `spline.ts` | `splinePolyline` (analytic tolerance bound), `evaluateSpline`, `sampleSpline`, knot helpers |
| `intersect.ts` | `intersect`, `intersectSegments`, `intersectSegmentCircle`, `intersectLineCircle` (infinite line), `intersectCircles`, `curvePrimitives` |
| `snap.ts` | `findSnap`, `SnapType`, `SnapSettings`, `DEFAULT_SNAP_SETTINGS`, `Snap` |
| `offset.ts` | `offsetPolyline`, `offsetRings`, `offsetPolygon`, `OffsetOptions`, `OffsetPath`, `selfIntersects` |
| `shapes.ts` | `rectangleToPolyline`, `regularPolygon`, `slot`, `fillet`, `chamfer`, `makeRectangle/makeLine/makePolyline/makeEllipse`, ring helpers (`signedArea`, `winding`, `reverseRing`, `dedupePoints`, `ringLength`) |
| `solid.ts` | `SolidSchema` (+ per-solid schemas), `Solid`, `meshOf`, `meshVolume`, `meshBounds`, `solidBounds`, `stockBox` |
| `dxf.ts` | `parseDxf`, `writeDxf`, `DxfResult` |
| `migrate.ts` | `migrateDrawing`, `DrawingMigrationError`, `droppedEntities` |
| `testing.ts` | small entity builders (`line`, `circle`, `arc`, `polyline`, ...) shared by tests and UI fixtures |

### 7.3 Semantics worth knowing

- **Entities** follow section 2. `Polyline.bulge`, when present, has exactly one entry per point (Schema-checked). `Arc` angles must already be normalised to `[0, 2π)` (`makeArc`/`normalizeAngle`); equal start and end angle means a full circle.
- **Blocks**: children are block-local and placed at `basePoint` (`world = local + basePoint`); `bounds`, `tessellate`, DXF export and the CAM geometry input all follow this. `applyTransform` moves `basePoint` and applies only the *linear* part to the children.
- **`entity.transform`** is the local-to-world `Transform2D` (scale, rotate, translate). `bounds`/`tessellate` do not apply it; `applyTransform(entity, IDENTITY_AFFINE)` bakes it. `applyTransform` always returns an entity **without** `transform` (it is folded in exactly once).
- **`tessellate(entity, tolerance): Vec2[][]`** returns plain point lists; a closed shape returns its ring without a repeated closing point. Whether a single-ring entity is closed is `isClosedShape(entity)` (the spec's "separate closed flag"). Guarantees: circles/arcs/polyline bulges use the exact chord-sag formula; ellipses use the bound `h = sqrt(8·tol / max(rx, ry))` (safe for very flat ellipses); splines are subdivided per knot span with an analytic second-derivative bound (`splinePolyline`). All are verified by property tests against dense reference sampling. `tolerance` is clamped to `>= 1e-6` mm and at most 65536 segments are produced per entity.
- **`intersect(a, b)`** is exact for lines, polylines (bulge arcs included), rectangles, circles and arcs; a segment never reports a hit beyond its ends and an arc never outside its sweep; tangency within `INTERSECT_EPS` is one point; collinear overlaps report nothing. Ellipses and splines go through a 0.0001 mm tessellation; blocks are flattened.
- **Offsetting** (`offsetPolyline(points, distance, closed, options?)`): a **positive distance offsets to the right of the direction of travel** (counter-clockwise ring grows). Algorithm: raw offset with mitre/round/bevel joins, split at all intersections, keep pieces at least `|distance|` from every original segment and on the correct side, chain the pieces. Several loops can result (a dumbbell splits), collapsed features vanish, and `offsetRings([...], distance, { keep: "inside" })` offsets a boundary together with its islands (used by the pocket). Options: `mitreLimit` (default 2.5), `arcJoins`, `joinFallback: "bevel" | "round"` (round joins are tangent-chord polygons, so they never come closer than `|distance|`), `arcTolerance`, `keep`.
- **`fillet(corner, a, b, radius)` / `chamfer(corner, a, b, d)`** work on two legs meeting at `corner` and return the two tangent/cut points (`undefined` when the legs are too short), instead of taking `Line` entities.
- **`findSnap(entities, cursor, settings)`**: `SnapSettings = { enabled, types (priority order), tolerance (mm), gridEnabled, gridSpacing, referencePoint? }`. `perpendicular` and `tangent` need `referencePoint` (the point being drawn from). Endpoints are the source vertices (arc ends, rectangle corners, open-spline ends), midpoints include bulge-arc midpoints and rectangle edges, quadrants exist for circles, ellipses and arcs (only inside the sweep), `nearest` works on every outline. Invisible entities are skipped; locked ones still snap. Intersection candidates are only computed for entities whose box is within the tolerance of the cursor.
- **`meshOf(solid, tolerance)`** returns `{ positions: Float32Array; indices: Uint32Array }`, outward-facing counter-clockwise triangles; `meshVolume`/`meshBounds` support stock computations. Curved subdivision responds to tolerance and declared resolution acts as a minimum; bounded-budget failures are explicit `RangeError`s. Chord budgets describe analytic subdivision before Float32 storage, not certified exact geometry at arbitrary coordinate magnitude. `Revolve` revolves a profile in the XZ plane about Z; `Extrude` extrudes a closed XY profile along signed Z height.
- **`migrateDrawing(unknown)`** returns `Effect<Drawing, DrawingMigrationError>`; it upgrades the v5 shape (lower-case `type`, `selected` flags, loose layer lists) and drops entities it cannot migrate (`droppedEntities(input)` reports how many). A newer `schemaVersion` fails with the tagged error.
- **DXF** (`parseDxf(text, options?) => { drawing, warnings }`; the spec's bare `Drawing` return became a result record so unknown entities can be reported): LINE, CIRCLE, ARC, LWPOLYLINE with bulge, full ELLIPSE, TEXT/MTEXT, LAYER table (name, colour, hidden, locked) and `$INSUNITS` (inch/cm/m converted to mm). `writeDxf` writes an R2000 layout; clockwise arcs are swapped to DXF's counter-clockwise form, rectangles become closed polylines, splines and hatches become polyline approximations (0.01 mm), blocks are flattened, dimensions are not exported. Skipped entity types are reported once per type with a count.

### 7.4 Deviations from the original text

- `Entity` is exported both as a type and as `EntitySchema` (a value cannot share the name in `verbatimModuleSyntax` barrels); decoders are `decodeEntity`/`decodeDrawing` (Effect) and `isEntity`.
- `migrateDrawing`, `parseDxf` and `fillet`/`chamfer` have the signatures described above.
- `applyTransform` converts a non-similar transform of an **arc** into a sampled polyline (an elliptical arc has no entity); circles, ellipses, rectangles (axis-aligned results) and polylines with bulge are handled exactly.
- Tests live in `packages/core/test/` (`geometry.test.ts`, `offset.test.ts`, `spline.test.ts`, `dxf.test.ts`); run `bun test packages/core`.

## 7b. Parametric modelling (supersedes the exclusions of §4 and §6 for sketch constraints and Boolean CSG)

Added after v6.0, each with tests; all pure, in `cad/`:

- **`expr.ts`** — parameter expressions (`width / 2 + 3in`, `sin(30deg)`, `max(a, b)`), units `mm cm m in deg rad`, functions and constants, and `resolveParameters`, which evaluates a table of named parameters in dependency order and reports cycles and unknown names per parameter instead of throwing.
- **`sketch.ts`** — a constraint sketch (points, lines, circles, arcs) with 22 constraint kinds (coincident, fixed, horizontal / vertical, distance / length / distanceX / distanceY, parallel, perpendicular, equal length / radius, radius / diameter, angle, point on line / circle, midpoint, symmetric, tangent line-circle and circle-circle, concentric). Solved by Levenberg-Marquardt with a central-difference Jacobian; the result carries a status (`fully-constrained`, `under-constrained`, `over-constrained`, `conflicting`, `failed`), the degrees of freedom (unknowns minus the rank of the Jacobian), the points that can still move, and, on a conflict, the constraints that miss. `sketchProfiles` chains lines and arcs through their shared points into closed polygons (circles on their own) within a tolerance.
- **`csg.ts`** — Boolean union / subtraction / intersection of closed triangle meshes by BSP. The result is a closed triangle mesh whose volume and outline are right up to the meshing tolerance. **It is not an exact B-rep**: faces are not trimmed analytic surfaces, splitting leaves T-junctions, and there is no topology to fillet or to measure a face on (spec 12 gate 1 is still open). Also `translateMesh`, `rotateMesh`, `mergeMeshes`.
- **`history.ts`** — a parametric feature history: a parameter table and an ordered list of features (sketch on XY / YZ / ZX with an offset, extrude, revolve, hole, linear and circular pattern), replayed from the top by `rebuild`. Dimensions are numbers or expressions, so `withParameter(history, "width", 60)` re-solves every sketch and rebuilds every solid and Boolean after it. Bodies are meshes; `cam/model` turns them into a part model (`buildPartModelFromMeshes`). A feature that cannot be built is an entry in `issues` and is skipped.
- **Not covered:** fillet, chamfer, shell, draft, sweep, loft; sketch constraints between entities of different sketches (projection); an editor UI for the sketch and the timeline.

## 8. Change log

- Current drawing migration direct-decodes complete tagged documents, preserving every entity kind, recursive blocks, transforms and metadata. Legacy lower-case documents and sparse early tagged exports retain migration compatibility. Import reporting no longer counts preserved current entities as dropped. Invalid current drawings and future versions still fail with `DrawingMigrationError`.

- Planar extrusion and partial-revolution caps use winding-preserving ear clipping instead of centroid fans, so simple concave profiles do not produce triangles outside the part. Partial-revolution bounds include sweep endpoints and angular extrema, including negative sweeps. Degenerate/non-triangulable profiles fail explicitly.

- Curved solid meshing now uses the requested positive finite chord tolerance: declared segment/ring counts are minimum resolutions, not overrides. Circular subdivision uses the existing analytic sag bound; sphere and torus split the error budget across two parameter directions. Requests beyond a bounded mesh budget fail explicitly instead of silently violating tolerance. This remains a triangle-mesh Module, not a B-rep kernel.

- Solid correctness hardening: cylinder meshes honor the declared axis using orientation-preserving coordinate permutations; torus meshes sweep a circular tube in the radial/axial plane, with rotation as tube phase. Analytic torus bounds use major plus minor radius in the radial plane and minor radius along the axis. Negative extrusions have ordered bounds and outward-facing meshes. Regression tests live beside the solid implementation.

- v6.1: Added §7b (expressions, constraint sketch solver, mesh CSG, parametric history).
- v1: initial spec.
- v2: WP1 implemented; status set to done. Added the as-built section (barrel layout, exports, semantics, deviations). Replaced the single-polyline offsetter by the robust split/trim/chain algorithm with `offsetRings` for islands; analytic tolerance bounds for splines and ellipses; blocks are block-local; `applyTransform` folds the local transform exactly once; DXF import/export rewritten (layers, units, sequential bulge parsing, correct clockwise arcs).
- Geometry fixes found while making the acceptance suite green:
  - `offsetPolyline` offsets to the **right** of travel for a positive distance, so
    a counter-clockwise ring grows (`+0.1` on a 1 mm square → 1.2 mm side, as §5
    requires); the previous left-normal implementation shrank it.
  - An inward offset whose mitres overrun their own segments is **collapsed** to
    nothing (`−0.6` on a 1 mm square yields nothing) instead of returning a
    self-intersecting ring; open paths are no longer filtered by area, so
    offsetting a straight line still returns a line.
  - Arc joins sweep with the turn direction of the corner, and bulge alignment is
    only reported for the ring that survived the join pass.
  - `slot` is a real stadium: the semicircular caps are centred on the two segment
    ends (they used to share the midpoint, producing a single circle).
  - Closed (periodic) B-splines evaluate over `pointCount` spans with a knot
    vector extended `degree` steps on both sides, so `evaluateSpline(0)` equals
    `evaluateSpline(1)`; the previous span clamp made the curve constant.
- Acceptance-test corrections (the expectations contradicted the documented
  conventions, so the tests changed, not the geometry):
  - arc bounds: a 0°→180° counter-clockwise sweep reaches `+3` on Y, and a
    clockwise 90°→−90° sweep stays on the right half;
  - DXF bulge: positive bulge is counter-clockwise, so a left-to-right segment
    *dips* below the chord (centre on the left of travel); the mirrored case is
    asserted too;
  - snap priority keeps the legacy order (endpoint, midpoint, center,
    intersection, …), so the intersection test now crosses where the entities do
    not share a midpoint, and a new test pins the priority itself.

### 2026-10-09 — Shared scene evidence contract

`sceneGeometryText(elements)` provides deterministic geometry serialization shared by the desktop and sidecar for SHA-256 capture correlation. IDs, geometry, transforms and feature histories participate; presentation/layer labels do not (the capture carries actual layer/view state separately). This accommodates the existing editor's layer-id mapping without accepting changed geometry. It does not prove the renderer finished loading; viewport capture checks renderer readiness separately.

Neutral-file interoperability uses the existing editor mesh representation. A desktop-local OpenCascade decoder can expose STEP/IGES/BREP triangulation and source B-rep face metadata through the existing attachment import; the core's parametric histories and analytic solids remain unchanged. An imported tessellation never claims recovered feature history or exact machining certification.

### Surfacing validation found during agent integration

The full geometry suite verifies chamfer/shell meshes because AI measurements and CAM depend on real mesh volumes. Chamfer edge/corner vertices must meet the inset face corners and share welded indexes; every closed edge has opposite directed incidence. Inward vertex normals must account for triangle corner angles, so subdividing a planar face does not change its offset. The analytic chamfered-box reference decomposes each retained corner as a tetrahedron of volume d³/6, not d³/3.
