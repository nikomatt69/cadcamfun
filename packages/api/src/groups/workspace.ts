import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, InternalError, NotFound } from "../errors.ts"

/**
 * Read-only workspace the phone may draw. Lists omit the stored document. Previews are bounded meshes and
 * toolpath polylines computed on the desktop. Nothing in this group writes.
 */
const id = { id: Schema.String }
const drawingParams = { id: Schema.String, drawingId: Schema.String }
const componentParams = { id: Schema.String, componentId: Schema.String }
const toolpathParams = { id: Schema.String, toolpathId: Schema.String }

const Vec3 = Schema.Tuple([Schema.Number, Schema.Number, Schema.Number])

export const PreviewBounds = Schema.Struct({ min: Vec3, max: Vec3 })
export type PreviewBounds = typeof PreviewBounds.Type

export const WorkspaceEntry = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  subtitle: Schema.NullOr(Schema.String),
  updatedAt: Schema.String,
})
export type WorkspaceEntry = typeof WorkspaceEntry.Type

export const MeshPart = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  triangleStart: Schema.Number,
  triangleCount: Schema.Number,
})
export type MeshPart = typeof MeshPart.Type

export const MeshPreview = Schema.Struct({
  positions: Schema.Array(Schema.Number),
  indices: Schema.Array(Schema.Number),
  normals: Schema.Array(Schema.Number),
  bounds: PreviewBounds,
  parts: Schema.Array(MeshPart),
  truncated: Schema.Boolean,
  revision: Schema.String,
})
export type MeshPreview = typeof MeshPreview.Type

export const PreviewParameter = Schema.Struct({ key: Schema.String, value: Schema.String })
export type PreviewParameter = typeof PreviewParameter.Type

export const ComponentPreview = Schema.Struct({
  ...MeshPreview.fields,
  parameters: Schema.Array(PreviewParameter),
})
export type ComponentPreview = typeof ComponentPreview.Type

/**
 * The part a program cuts, as a mesh: the drawing the document was made from. The phone draws it beside the path,
 * like the desktop's CAM preview draws the workpiece.
 */
export const PartPreview = Schema.Struct({
  positions: Schema.Array(Schema.Number),
  indices: Schema.Array(Schema.Number),
  normals: Schema.Array(Schema.Number),
  bounds: PreviewBounds,
  parts: Schema.Array(MeshPart),
  truncated: Schema.Boolean,
})
export type PartPreview = typeof PartPreview.Type

export const ToolpathStats = Schema.Struct({
  rapidMoves: Schema.Number,
  linearMoves: Schema.Number,
  circularMoves: Schema.Number,
  machineFunctions: Schema.Number,
})
export type ToolpathStats = typeof ToolpathStats.Type

export const ToolpathReview = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  operationType: Schema.NullOr(Schema.String),
  gcode: Schema.String,
  stats: ToolpathStats,
  revision: Schema.String,
  updatedAt: Schema.String,
})
export type ToolpathReview = typeof ToolpathReview.Type

export const ToolpathSegment = Schema.Struct({
  kind: Schema.Literals(["rapid", "linear", "circular"]),
  line: Schema.Number,
  from: Vec3,
  to: Vec3,
})
export type ToolpathSegment = typeof ToolpathSegment.Type

const Point3 = Schema.Struct({ x: Schema.Number, y: Schema.Number, z: Schema.Number })

/** The machine around the program (spec 31 §5): the phone tessellates these shapes and draws them as-is. */
export const PreviewBodyShape = Schema.Union([
  Schema.Struct({ type: Schema.Literal("box"), min: Point3, max: Point3 }),
  Schema.Struct({ type: Schema.Literal("cylinder-x"), x0: Schema.Number, x1: Schema.Number, radius: Schema.Number, inner: Schema.Number }),
  Schema.Struct({ type: Schema.Literal("cone-x"), x0: Schema.Number, x1: Schema.Number, r0: Schema.Number, r1: Schema.Number }),
])
export type PreviewBodyShape = typeof PreviewBodyShape.Type

export const PreviewBody = Schema.Struct({
  id: Schema.String,
  role: Schema.Literals(["stock", "jaw", "parallel", "vise-base", "clamp", "table", "chuck", "collet", "tailstock", "bed", "build-volume"]),
  shape: PreviewBodyShape,
  rotateX: Schema.optionalKey(Schema.Number),
  spins: Schema.Boolean,
  assumed: Schema.Boolean,
  obstacle: Schema.Boolean,
  wire: Schema.optionalKey(Schema.Boolean),
})
export type PreviewBody = typeof PreviewBody.Type

export const PreviewToolGlyph = Schema.Struct({
  family: Schema.Literals(["mill", "lathe", "nozzle"]),
  diameter: Schema.Number,
  width: Schema.Number,
  noseRadius: Schema.Number,
  insert: Schema.String,
  internal: Schema.Boolean,
  turret: Schema.optionalKey(Schema.Literals(["rear", "front"])),
})
export type PreviewToolGlyph = typeof PreviewToolGlyph.Type

/** From `segment` on, the spindle turns `rate` signed display revolutions per second. */
export const PreviewSpinRun = Schema.Struct({ segment: Schema.Number, rate: Schema.Number })
export type PreviewSpinRun = typeof PreviewSpinRun.Type

/**
 * The real cutter of an operation: the tool the program runs, drawn at the playhead. The phone draws it with these
 * numbers instead of a generic marker (preview format 4).
 */
export const PreviewCutter = Schema.Struct({
  diameter: Schema.Number,
  fluteLength: Schema.Number,
  shankDiameter: Schema.Number,
  stickout: Schema.Number,
  noseRadius: Schema.Number,
  holder: Schema.Struct({
    diameter: Schema.Number,
    length: Schema.Number,
    kind: Schema.String,
    assumed: Schema.Boolean,
  }),
})
export type PreviewCutter = typeof PreviewCutter.Type

/** One operation of a program: a toolpath and the run of path segments it drew. */
export const PreviewOperation = Schema.Struct({
  index: Schema.Number,
  name: Schema.String,
  toolId: Schema.String,
  startSegment: Schema.Number,
  endSegment: Schema.Number,
  cutter: Schema.optionalKey(PreviewCutter),
})
export type PreviewOperation = typeof PreviewOperation.Type

/** A contact on the playback clock: the tool into the workholding, into the stock left, a near miss. */
export const PreviewCollisionEvent = Schema.Struct({
  code: Schema.String,
  severity: Schema.Literals(["error", "warning"]),
  seconds: Schema.Number,
  segment: Schema.Number,
  line: Schema.optionalKey(Schema.Number),
  message: Schema.String,
})
export type PreviewCollisionEvent = typeof PreviewCollisionEvent.Type

export const PreviewMachine = Schema.Struct({
  kind: Schema.Literals(["mill", "lathe", "3dprinter"]),
  source: Schema.Literals(["override", "kernel", "generator", "inferred", "settings"]),
  mismatch: Schema.optionalKey(Schema.Struct({
    inferred: Schema.Literals(["mill", "lathe", "3dprinter"]),
    reasons: Schema.Array(Schema.String),
  })),
  axes: Schema.Number,
  turns: Schema.String,
  workholding: Schema.String,
  assumed: Schema.Array(Schema.Literals(["workholding", "table", "stock"])),
  xMode: Schema.optionalKey(Schema.Literals(["diameter", "radius"])),
  turret: Schema.optionalKey(Schema.Literals(["rear", "front"])),
  bodies: Schema.Array(PreviewBody),
  spin: Schema.Array(PreviewSpinRun),
  /** Indices of the segments whose move runs into the workholding (drawn red). */
  collisions: Schema.Array(Schema.Number),
  /** The program's operations (preview format 4); absent in an older server's payload. */
  operations: Schema.optionalKey(Schema.Array(PreviewOperation)),
  /** The contacts on the playback clock (preview format 4); absent in an older server's payload. */
  events: Schema.optionalKey(Schema.Array(PreviewCollisionEvent)),
  tool: PreviewToolGlyph,
})
export type PreviewMachine = typeof PreviewMachine.Type

export const ToolpathPreview = Schema.Struct({
  segments: Schema.Array(ToolpathSegment),
  bounds: PreviewBounds,
  stock: PreviewBounds,
  truncated: Schema.Boolean,
  stats: ToolpathStats,
  /** Present when the payload carries the machine scene (format 3); absent in older servers. */
  machine: Schema.optionalKey(PreviewMachine),
  /** The part the program cuts (format 4); absent when the document names no drawing. */
  part: Schema.optionalKey(PartPreview),
  revision: Schema.String,
})
export type ToolpathPreview = typeof ToolpathPreview.Type

export const LibraryCatalogue = Schema.Struct({
  materials: Schema.Array(WorkspaceEntry),
  tools: Schema.Array(WorkspaceEntry),
  machines: Schema.Array(WorkspaceEntry),
  components: Schema.Array(WorkspaceEntry),
})
export type LibraryCatalogue = typeof LibraryCatalogue.Type

const readErrors = [BadRequest, NotFound, InternalError] as const

export class WorkspaceGroup extends HttpApiGroup.make("workspace")
  .add(
    HttpApiEndpoint.get("drawings", "/api/projects/:id/workspace/drawings", { params: id, success: Schema.Array(WorkspaceEntry), error: readErrors }),
    HttpApiEndpoint.get("drawingPreview", "/api/projects/:id/workspace/drawings/:drawingId/preview", { params: drawingParams, success: MeshPreview, error: readErrors }),
    HttpApiEndpoint.get("components", "/api/projects/:id/workspace/components", { params: id, success: Schema.Array(WorkspaceEntry), error: readErrors }),
    HttpApiEndpoint.get("componentPreview", "/api/projects/:id/workspace/components/:componentId/preview", { params: componentParams, success: ComponentPreview, error: readErrors }),
    HttpApiEndpoint.get("toolpaths", "/api/projects/:id/workspace/toolpaths", { params: id, success: Schema.Array(WorkspaceEntry), error: readErrors }),
    HttpApiEndpoint.get("toolpath", "/api/projects/:id/workspace/toolpaths/:toolpathId", { params: toolpathParams, success: ToolpathReview, error: readErrors }),
    HttpApiEndpoint.get("toolpathPreview", "/api/projects/:id/workspace/toolpaths/:toolpathId/preview", { params: toolpathParams, success: ToolpathPreview, error: readErrors }),
    HttpApiEndpoint.get("library", "/api/projects/:id/workspace/library", { params: id, success: LibraryCatalogue, error: readErrors }),
  )
{}
