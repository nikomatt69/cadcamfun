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

export const ToolpathPreview = Schema.Struct({
  segments: Schema.Array(ToolpathSegment),
  bounds: PreviewBounds,
  stock: PreviewBounds,
  truncated: Schema.Boolean,
  stats: ToolpathStats,
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
