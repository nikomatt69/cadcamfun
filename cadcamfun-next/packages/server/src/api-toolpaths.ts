import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { Machines, Operations, Toolpaths } from "@cadcamfun/cam"
import { ProjectNotFound } from "./api-errors"

export class ToolpathNotFound extends Schema.TaggedError<ToolpathNotFound>()("ToolpathNotFound", {
  id: Schema.String,
}) {}

const Stats = Schema.Struct({
  moves: Schema.Int,
  cutDistance: Schema.Finite,
  rapidDistance: Schema.Finite,
  estimatedSeconds: Schema.Finite,
})

export const ToolpathSummary = Schema.Struct({
  id: Schema.String,
  projectId: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.String),
  controller: Machines.Controller,
  stats: Stats,
  versions: Schema.Int,
  updatedAt: Schema.String,
})
export type ToolpathSummary = typeof ToolpathSummary.Type

/** A saved CAM result: G-code plus the program and setup it came from. */
export const SavedToolpath = Schema.Struct({
  ...ToolpathSummary.fields,
  gcode: Schema.String,
  program: Schema.optional(Toolpaths.Program),
  setup: Schema.optional(Operations.Setup),
  createdAt: Schema.String,
})
export type SavedToolpath = typeof SavedToolpath.Type

export const ToolpathVersion = Schema.Struct({
  id: Schema.String,
  toolpathId: Schema.String,
  message: Schema.optional(Schema.String),
  gcode: Schema.String,
  createdAt: Schema.String,
})
export type ToolpathVersion = typeof ToolpathVersion.Type

export const ToolpathComment = Schema.Struct({
  id: Schema.String,
  toolpathId: Schema.String,
  author: Schema.String,
  content: Schema.String,
  createdAt: Schema.String,
})
export type ToolpathComment = typeof ToolpathComment.Type

export const ToolpathInput = Schema.Struct({
  name: Schema.NonEmptyString,
  description: Schema.optional(Schema.String),
  controller: Machines.Controller,
  gcode: Schema.String,
  program: Schema.optional(Toolpaths.Program),
  setup: Schema.optional(Operations.Setup),
  stats: Stats,
})

const NotFound = ToolpathNotFound.pipe(HttpApiSchema.status(404))
const id = { id: Schema.String }

export class ToolpathsApi extends HttpApiGroup.make("toolpaths").add(
  HttpApiEndpoint.get("listForProject", "/projects/:projectId/toolpaths", {
    params: { projectId: Schema.String },
    success: Schema.Array(ToolpathSummary),
  }),
  HttpApiEndpoint.post("create", "/projects/:projectId/toolpaths", {
    params: { projectId: Schema.String },
    payload: ToolpathInput,
    success: SavedToolpath,
  }),
  HttpApiEndpoint.get("get", "/toolpaths/:id", { params: id, success: SavedToolpath, error: NotFound }),
  HttpApiEndpoint.put("update", "/toolpaths/:id", {
    params: id,
    payload: Schema.Struct({
      name: Schema.optional(Schema.NonEmptyString),
      description: Schema.optional(Schema.String),
      gcode: Schema.String,
      program: Schema.optional(Toolpaths.Program),
      stats: Schema.optional(Stats),
      message: Schema.optional(Schema.String),
    }),
    success: SavedToolpath,
    error: NotFound,
  }),
  HttpApiEndpoint.delete("remove", "/toolpaths/:id", { params: id, error: NotFound }),
  HttpApiEndpoint.get("versions", "/toolpaths/:id/versions", {
    params: id,
    success: Schema.Array(ToolpathVersion),
    error: NotFound,
  }),
  HttpApiEndpoint.post("restore", "/toolpaths/:id/versions/:versionId/restore", {
    params: { id: Schema.String, versionId: Schema.String },
    success: SavedToolpath,
    error: NotFound,
  }),
  HttpApiEndpoint.get("comments", "/toolpaths/:id/comments", {
    params: id,
    success: Schema.Array(ToolpathComment),
    error: NotFound,
  }),
  HttpApiEndpoint.post("addComment", "/toolpaths/:id/comments", {
    params: id,
    payload: Schema.Struct({ author: Schema.optional(Schema.String), content: Schema.NonEmptyString }),
    success: ToolpathComment,
    error: NotFound,
  }),
  HttpApiEndpoint.delete("removeComment", "/toolpaths/:id/comments/:commentId", {
    params: { id: Schema.String, commentId: Schema.String },
    error: NotFound,
  }),
) {}
