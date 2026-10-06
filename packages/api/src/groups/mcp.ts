/**
 * Contract for the legacy MCP route family: `/api/mcp/config` (collection, selected by
 * `?source=`), `/api/mcp/config/:id` (the stored row) and `/api/mcp/server-info`.
 *
 * The legacy handlers answer with two different error bodies: `{ error }` from the `:id`
 * and `server-info` routes, and `{ success: false, error }` from the collection route.
 * Both are modelled as tagged errors so the wire format (status + body keys) is kept.
 *
 * Success bodies are the legacy envelopes: they carry `source` as a literal, which is
 * what lets the client decode the union of the three `?source=` variants.
 */
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"

const opt = Schema.optional
const nullable = Schema.NullOr(Schema.String)
const success = Schema.Literal(true)
const failure = Schema.Literal(false)

// ---- `{ error: string }` bodies (config/:id, server-info) ----
const keyed = { error: Schema.String }
export class McpBadRequest extends Schema.TaggedError<McpBadRequest>()("McpBadRequest", keyed, { httpApiStatus: 400 }) {}
export class McpNotFound extends Schema.TaggedError<McpNotFound>()("McpNotFound", keyed, { httpApiStatus: 404 }) {}
export class McpMethodNotAllowed extends Schema.TaggedError<McpMethodNotAllowed>()("McpMethodNotAllowed", keyed, { httpApiStatus: 405 }) {}
export class McpInternal extends Schema.TaggedError<McpInternal>()("McpInternal", keyed, { httpApiStatus: 500 }) {}

// ---- `{ success: false, error: string }` bodies (/api/mcp/config collection) ----
const envKeyed = { success: failure, error: Schema.String }
export class McpEnvBadRequest extends Schema.TaggedError<McpEnvBadRequest>()("McpEnvBadRequest", envKeyed, { httpApiStatus: 400 }) {}
export class McpEnvNotFound extends Schema.TaggedError<McpEnvNotFound>()("McpEnvNotFound", envKeyed, { httpApiStatus: 404 }) {}
export class McpEnvMethodNotAllowed extends Schema.TaggedError<McpEnvMethodNotAllowed>()("McpEnvMethodNotAllowed", envKeyed, { httpApiStatus: 405 }) {}
export class McpEnvInternal extends Schema.TaggedError<McpEnvInternal>()("McpEnvInternal", envKeyed, { httpApiStatus: 500 }) {}

/** A stored MCP server, as the legacy Prisma row serialised to JSON (`config/[id]`). */
export const McpServerConfig = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  type: Schema.String,
  url: nullable,
  command: nullable,
  /** JSON column: the argument list, or whatever the legacy import stored there. */
  args: Schema.Unknown,
  workingDirectory: nullable,
  enabled: Schema.Boolean,
  userId: nullable,
  createdAt: Schema.String,
  updatedAt: Schema.String
})
export type McpServerEntry = typeof McpServerConfig.Type

/** What the config-editor exports: the row without the ownership/timestamp columns. */
export const McpConfigEntry = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  type: Schema.String,
  url: nullable,
  command: nullable,
  args: Schema.Unknown,
  workingDirectory: nullable,
  enabled: Schema.Boolean
})
export const McpConfigFile = Schema.Struct({ mcpServers: Schema.Array(McpConfigEntry) })

/**
 * Create/update body. Every field is optional because the legacy handlers validate the
 * raw body themselves and answer with their own messages instead of a generic 422.
 */
export const McpServerInput = Schema.Struct({
  id: opt(Schema.String),
  name: opt(Schema.String),
  type: opt(Schema.String),
  url: opt(Schema.String),
  command: opt(Schema.String),
  args: opt(Schema.Unknown),
  workingDirectory: opt(Schema.String),
  defaultWorkingDirectory: opt(Schema.String),
  enabled: opt(Schema.Boolean),
  /** Legacy collection `PUT` addresses the server by name. */
  serverName: opt(Schema.String),
  testConnection: opt(Schema.Boolean),
  /** Config file body (`?source=file`). */
  mcpServers: opt(Schema.Unknown),
  tool_configuration: opt(Schema.Unknown),
  authorization_token: opt(Schema.String)
})
export type McpServerPatch = typeof McpServerInput.Type

export const McpConfigList = Schema.Struct({
  success, source: Schema.Literals(["claude", "database"]), servers: Schema.Array(McpServerConfig), count: Schema.Number
})
export const McpConfigFileExport = Schema.Struct({
  success, source: Schema.Literal("file"), config: McpConfigFile, exportedAt: Schema.String
})
export const McpConfigCreated = Schema.Struct({
  success, source: Schema.Literals(["claude", "database"]), server: McpServerConfig,
  connectionTest: opt(Schema.Unknown), message: Schema.String
})
export const McpConfigImported = Schema.Struct({
  success, source: Schema.Literal("file"), imported: Schema.Number, message: Schema.String
})
export const McpConfigUpdated = Schema.Struct({
  success, source: Schema.Literal("claude"), server: McpServerConfig, message: Schema.String
})
export const McpConfigRemoved = Schema.Struct({
  success, source: Schema.Literal("claude"), message: Schema.String, note: Schema.String
})

/** Capabilities of a live MCP server; arrays, which is what the legacy UI renders. */
export const McpResourceArgument = Schema.Struct({
  name: Schema.String, description: opt(Schema.String), required: opt(Schema.Boolean)
})
export const McpResourceInfo = Schema.Struct({
  name: Schema.String, uriTemplate: opt(Schema.String), description: opt(Schema.String),
  arguments: opt(Schema.Array(McpResourceArgument))
})
export const McpToolInfo = Schema.Struct({
  name: Schema.String, description: opt(Schema.String), parameters: opt(Schema.Unknown)
})
export const McpServerInfo = Schema.Struct({
  name: Schema.String,
  version: opt(Schema.String),
  instructions: opt(Schema.String),
  resources: opt(Schema.Array(McpResourceInfo)),
  tools: opt(Schema.Array(McpToolInfo))
})

const id = { id: Schema.String }

export class McpGroup extends HttpApiGroup.make("mcp")
  .add(
    HttpApiEndpoint.get("listConfig", "/api/mcp/config", {
      query: { source: opt(Schema.String) },
      success: Schema.Union([McpConfigList, McpConfigFileExport]),
      error: [McpEnvBadRequest, McpEnvInternal]
    }),
    HttpApiEndpoint.post("createConfig", "/api/mcp/config", {
      query: { source: opt(Schema.String) },
      payload: McpServerInput,
      success: [
        McpConfigCreated.pipe(Schema.annotate({ httpApiStatus: 201 })),
        McpConfigImported
      ],
      error: [McpEnvBadRequest, McpEnvInternal]
    }),
    HttpApiEndpoint.put("updateConfig", "/api/mcp/config", {
      query: { source: opt(Schema.String) },
      payload: McpServerInput,
      success: McpConfigUpdated,
      error: [McpEnvBadRequest, McpEnvNotFound, McpEnvMethodNotAllowed, McpEnvInternal]
    }),
    HttpApiEndpoint.delete("removeConfig", "/api/mcp/config", {
      query: { source: opt(Schema.String), name: opt(Schema.String) },
      success: McpConfigRemoved,
      error: [McpEnvBadRequest, McpEnvNotFound, McpEnvMethodNotAllowed, McpEnvInternal]
    }),
    HttpApiEndpoint.get("getConfig", "/api/mcp/config/:id", {
      params: id, success: McpServerConfig, error: [McpBadRequest, McpNotFound, McpInternal]
    }),
    HttpApiEndpoint.put("updateConfigById", "/api/mcp/config/:id", {
      params: id, payload: McpServerInput, success: McpServerConfig,
      error: [McpBadRequest, McpNotFound, McpMethodNotAllowed, McpInternal]
    }),
    HttpApiEndpoint.delete("removeConfigById", "/api/mcp/config/:id", {
      params: id, success: HttpApiSchema.NoContent,
      error: [McpBadRequest, McpNotFound, McpMethodNotAllowed, McpInternal]
    }),
    HttpApiEndpoint.post("serverInfo", "/api/mcp/server-info", {
      payload: Schema.Struct({ serverId: opt(Schema.String) }),
      success: McpServerInfo,
      error: [McpMethodNotAllowed, McpBadRequest, McpNotFound, McpInternal]
    })
  )
{}
