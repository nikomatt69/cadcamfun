import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/http-api"
import { Doc } from "@cadcamfun/core"
import { Machines, Materials, Operations, Tools, Toolpaths } from "@cadcamfun/cam"

export const ProjectSummary = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  updatedAt: Schema.String,
  elements: Schema.Int,
  operations: Schema.Int,
})
export type ProjectSummary = typeof ProjectSummary.Type

export const Project = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  document: Doc.CadDocument,
  setup: Operations.Setup,
  createdAt: Schema.String,
  updatedAt: Schema.String,
})
export type Project = typeof Project.Type

export class ProjectNotFound extends Schema.TaggedError<ProjectNotFound>()("ProjectNotFound", {
  id: Schema.String,
}) {}

export class CamFailed extends Schema.TaggedError<CamFailed>()("CamFailed", {
  message: Schema.String,
}) {}

export const Stats = Schema.Struct({
  moves: Schema.Int,
  cutDistance: Schema.Finite,
  rapidDistance: Schema.Finite,
  estimatedSeconds: Schema.Finite,
})

export const GcodeResult = Schema.Struct({
  controller: Machines.Controller,
  gcode: Schema.String,
  program: Toolpaths.Program,
  stats: Stats,
  outOfBounds: Schema.Int,
})
export type GcodeResult = typeof GcodeResult.Type

export const Library = Schema.Struct({
  tools: Schema.Array(Tools.Tool),
  materials: Schema.Array(Materials.Material),
  machines: Schema.Array(Machines.Machine),
})
export type Library = typeof Library.Type

const NotFound = ProjectNotFound.pipe(HttpApiSchema.status(404))

export class SystemApi extends HttpApiGroup.make("system").add(
  HttpApiEndpoint.get("health", "/health", { success: Schema.Struct({ status: Schema.Literal("ok") }) }),
) {}

export class ProjectsApi extends HttpApiGroup.make("projects")
  .add(
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(ProjectSummary) }),
    HttpApiEndpoint.get("get", "/:id", { params: { id: Schema.String }, success: Project, error: NotFound }),
    HttpApiEndpoint.post("create", "/", {
      payload: Schema.Struct({ name: Schema.NonEmptyString, units: Schema.optional(Doc.Units) }),
      success: Project,
    }),
    HttpApiEndpoint.put("save", "/:id", {
      params: { id: Schema.String },
      payload: Schema.Struct({
        name: Schema.optional(Schema.NonEmptyString),
        document: Doc.CadDocument,
        setup: Operations.Setup,
      }),
      success: Project,
      error: NotFound,
    }),
    HttpApiEndpoint.delete("remove", "/:id", { params: { id: Schema.String }, error: NotFound }),
  )
  .prefix("/projects") {}

export class CamApi extends HttpApiGroup.make("cam")
  .add(
    HttpApiEndpoint.get("library", "/library", { success: Library }),
    HttpApiEndpoint.post("gcode", "/gcode", {
      payload: Schema.Struct({
        document: Doc.CadDocument,
        setup: Operations.Setup,
        controller: Schema.optional(Machines.Controller),
      }),
      success: GcodeResult,
      error: CamFailed.pipe(HttpApiSchema.status(422)),
    }),
  )
  .prefix("/cam") {}

/** The typed HTTP contract shared by server and web client. */
export class Api extends HttpApi.make("cadcamfun")
  .add(SystemApi)
  .add(ProjectsApi)
  .add(CamApi)
  .prefix("/api")
  .annotateMerge(OpenApi.annotations({ title: "CADCAMFUN API" })) {}

/** Request body of the streaming `POST /api/ai/chat` endpoint (Server-Sent Events). */
export const ChatRequest = Schema.Struct({
  document: Doc.CadDocument,
  setup: Operations.Setup,
  messages: Schema.Array(Schema.Struct({ role: Schema.Literals(["user", "assistant"]), content: Schema.String })),
})
export type ChatRequest = typeof ChatRequest.Type

/** Events streamed by `POST /api/ai/chat`. */
export type ChatEvent =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "reasoning"; readonly text: string }
  | { readonly type: "tool-call"; readonly id: string; readonly name: string; readonly input: unknown }
  | {
      readonly type: "tool-result"
      readonly id: string
      readonly name: string
      readonly ok: boolean
      readonly result: unknown
    }
  | {
      readonly type: "state"
      readonly document: typeof Doc.CadDocument.Encoded
      readonly setup: typeof Operations.Setup.Encoded
      readonly gcode?: string
    }
  | { readonly type: "error"; readonly message: string }
  | { readonly type: "done" }
