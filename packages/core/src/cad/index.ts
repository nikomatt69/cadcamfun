/** Public surface of the CAD geometry core (WP1). */
import type { EntityTag } from "./entities.ts"
import {
  ArcSchema,
  BlockSchema,
  CircleSchema,
  DimensionSchema,
  EllipseSchema,
  HatchSchema,
  LineSchema,
  PolylineSchema,
  RectangleSchema,
  SplineSchema,
  TextSchema
} from "./entities.ts"

export * from "./vec.ts"
export * from "./arc-math.ts"
export * from "./box.ts"
export * from "./entities.ts"
export * from "./shapes.ts"
export * from "./bounds.ts"
export * from "./spline.ts"
export * from "./tessellate.ts"
export * from "./transform.ts"
export * from "./intersect.ts"
export * from "./offset.ts"
export * from "./snap.ts"
export * from "./dxf.ts"
export * from "./solid.ts"
export * from "./gear.ts"
export * from "./migrate.ts"
export * from "./testing.ts"

/**
 * Per-tag Schema lookup. The union alone is enough for decoding, but callers that
 * work on a single entity kind (the editor toolbar, the parameter forms) need the
 * narrow codec without a cast.
 */
const perTagSchemas = {
  Line: LineSchema,
  Circle: CircleSchema,
  Arc: ArcSchema,
  Polyline: PolylineSchema,
  Rectangle: RectangleSchema,
  Ellipse: EllipseSchema,
  Spline: SplineSchema,
  Text: TextSchema,
  Dimension: DimensionSchema,
  Hatch: HatchSchema,
  Block: BlockSchema
} as const

export const entitySchemaOf = (tag: EntityTag): (typeof perTagSchemas)[EntityTag] => perTagSchemas[tag]
export * from "./tolerance.ts"
export * from "./design.ts"
export * from "./import-drawing.ts"
export * from "./import-step.ts"

export * from "./expr.ts"
export * from "./sketch.ts"
export * from "./csg.ts"
export * from "./history.ts"
export * from "./sketch-shapes.ts"
export * from "./sketch-edit.ts"
export * from "./kinematics.ts"
export * from "./parametric-from-element.ts"
export * from "./history-edit.ts"
export * from "./history-timeline.ts"
export * from "./script.ts"
export * from "./sheet-metal.ts"
export * from "./thread.ts"
export * from "./thread-brep.ts"
export * from "./text-solid.ts"
export { findPlanarFace, type PlanarFace, type FaceQuery } from "./face-edit.ts"
export * from "./element-transform.ts"
// Surface helpers add their own `Mesh` interface (already exported through
// `solid.ts`); only the runtime-shaped types it owns are re-exported.
export { chamferBox, chamferCylinderTop, chamferCylinderBottom, sweepMesh, loftMesh, shellMesh, surfaceBounds, surfaceVolume } from "./surface.ts"

export * from "./scene-evidence.ts"
export * from "./fasteners.ts"
export * from "./profile-shape.ts"
export * from "./dfm.ts"
export * from "./recipes.ts"
export * from "./sweep-loft.ts"
export * from "./edge-blend.ts"
export * from "./stroke-font.ts"
export * from "./mesh-clean.ts"
export * from "./mesh-topology.ts"
export * from "./mesh-normals.ts"

// Exact B-rep kernel (SMLib-style) and the exact replay of parametric histories.
export * as brep from "./brep/index.ts"
export * from "./history-brep.ts"
export * from "./scene-step.ts"
export * from "./smart-fasteners.ts"
export * from "./assembly-analysis.ts"
export * from "./scene-automation.ts"
export * from "./scene-analysis.ts"
