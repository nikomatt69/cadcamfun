/**
 * The legacy MCP route family: `/api/mcp/config` (picked by `?source=`), `/api/mcp/config/:id`
 * (the stored row) and `/api/mcp/server-info`.
 *
 * Legacy messages, validation order and status codes are reproduced verbatim, bugs included,
 * because the pages were ported bug for bug:
 *
 * - `validateServerConfig` of the collection route only accepts the types `url` and `stdio`
 *   while the legacy form submits `sse`, so "Add Server" answers
 *   `Server type must be either "url" or "stdio"`;
 * - `DELETE /api/mcp/config?source=claude` looks the server up and then answers
 *   `Server X removed from registry` without removing anything;
 * - the config file POST rejects every body that is not `{ mcpServers: [...] }` with
 *   `Invalid configuration format` — which is exactly what the config editor sends, since it
 *   posts the whole export envelope back;
 * - the config file GET exports only the types `sse` and `stdio`, so a `url`-typed row makes
 *   the export fail with `Invalid server type in export: url`.
 *
 * Differences from legacy are noted where they happen: v6 puts the group behind
 * `Authorization` (the legacy `?source=claude` branch skipped `requireAuth`), the three
 * `?source=` variants all read the one local registry — the `MCPServerConfig` rows — and
 * `server-info` answers with the legacy failure payloads instead of live capabilities, as v6
 * ships no MCP SDK, SSE connector or stdio process manager.
 */
import {
  Api,
  CurrentUser,
  McpBadRequest,
  McpConfigEntry,
  McpEnvBadRequest,
  McpEnvInternal,
  McpEnvMethodNotAllowed,
  McpEnvNotFound,
  McpInternal,
  McpNotFound,
  type McpServerEntry,
  type McpServerPatch
} from "@cadcamfun/api"
import { schema } from "@cadcamfun/db"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { McpRepo } from "../repos/mcp-repo.ts"

type DbValues = Partial<typeof schema.mCPServerConfigTable.$inferInsert>
type CreateValues = DbValues & { readonly id?: string; readonly name: string }
type UpdateValues = DbValues
type ImportValues = DbValues & { readonly id: string; readonly name: string }
type ExportEntry = typeof McpConfigEntry.Type

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? value as Record<string, unknown> : {}

/** `error.message || fallback`: the text the legacy handlers put in their 500 bodies. */
const messageOf = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback

/** Legacy collection-route failure: `{ success: false, error: error.message || fallback }`. */
const envInternal = (fallback: string) => (error: unknown) =>
  Effect.logError("Error in MCP config API", error).pipe(
    Effect.andThen(Effect.fail(new McpEnvInternal({ success: false, error: messageOf(error, fallback) })))
  )

/** Legacy `:id` / `server-info` failure: `{ error: error.message || fallback }`. */
const keyedInternal = (fallback: string) => (error: unknown) =>
  Effect.logError("Error in MCP config API", error).pipe(
    Effect.andThen(Effect.fail(new McpInternal({ error: messageOf(error, fallback) })))
  )

/**
 * Legacy `validateServerConfig` of `config.ts` — the rules every create runs, and the reason
 * the form's `sse` type is rejected. Returns the legacy message, or `undefined` when valid.
 */
const validateCreate = (data: Record<string, unknown>): string | undefined => {
  const name = data.name
  if (!name || typeof name !== "string" || name.trim() === "") return "Server name is required"
  const type = data.type
  if (!type || (type !== "url" && type !== "stdio")) return 'Server type must be either "url" or "stdio"'
  if (type === "url") {
    if (!data.url || typeof data.url !== "string" || data.url.trim() === "") return "URL is required for URL servers"
    return undefined
  }
  if (!data.command || typeof data.command !== "string" || data.command.trim() === "") {
    return "Command is required for stdio servers"
  }
  if (data.args && !Array.isArray(data.args)) return "Arguments must be an array of strings"
  return undefined
}

/** Legacy `validateServerConfig` of `config/[id].ts` — the update rules, which never check the type. */
const validateUpdate = (data: Record<string, unknown>): string | undefined => {
  const name = data.name
  if (name !== undefined && (typeof name !== "string" || name.trim() === "")) return "Server name is required"
  if (data.type === "sse") {
    if (data.url !== undefined && (typeof data.url !== "string" || data.url.trim() === "")) {
      return "URL is required for SSE servers"
    }
  } else if (data.type === "stdio") {
    if (data.command !== undefined && (typeof data.command !== "string" || data.command.trim() === "")) {
      return "Command is required for stdio servers"
    }
    if (data.args !== undefined && !Array.isArray(data.args)) return "Arguments must be an array of strings"
  }
  return undefined
}

/** `{ ...existing, ...updateData }`, where a field absent from the JSON body stays absent. */
const merge = (existing: unknown, patch: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = asRecord(existing)
  for (const [key, value] of Object.entries(patch)) if (value !== undefined) out[key] = value
  return out
}

/**
 * Row for a new server. The legacy `claude` branch stored `url` for the type `url` while the
 * `database` branch stored it only for the type `sse` (dead code, as the shared validator
 * rejects `sse` first) — kept, since both branches ran that validator.
 */
const createValues = (payload: McpServerPatch, source: "claude" | "database"): CreateValues => {
  const type = payload.type ?? ""
  const stdio = type === "stdio"
  const keepsUrl = source === "claude" ? type === "url" : type === "sse"
  return {
    ...(payload.id !== undefined ? { id: payload.id } : {}),
    name: payload.name ?? "",
    type,
    url: keepsUrl ? payload.url ?? null : null,
    command: stdio ? payload.command ?? null : null,
    args: (stdio && Array.isArray(payload.args) ? payload.args : stdio ? [] : null) as unknown as CreateValues["args"],
    workingDirectory: stdio ? payload.workingDirectory ?? null : null,
    enabled: payload.enabled !== false
  }
}

/**
 * Legacy config-file import entry → row, with the transaction's thrown messages kept as-is
 * (they left as 500 bodies through the outer `catch`).
 */
const importValues = (raw: unknown): { readonly values: ImportValues } | { readonly error: string } => {
  const server = asRecord(raw)
  const { id, name, type } = server
  if (typeof id !== "string" || !id || typeof name !== "string" || !name || typeof type !== "string" || !type) {
    return { error: "Server ID, name and type are required" }
  }
  const common = { id, name, type, enabled: (server.enabled ?? false) as boolean }
  if (type === "sse") {
    const url = server.url
    if (typeof url !== "string" || !url.trim()) return { error: "URL is required for SSE servers" }
    return { values: { ...common, url } }
  }
  if (type === "stdio") {
    const command = server.command
    if (typeof command !== "string" || !command.trim()) return { error: "Command is required for stdio servers" }
    return {
      values: {
        ...common,
        command,
        args: (Array.isArray(server.args) ? server.args : []) as unknown as ImportValues["args"],
        workingDirectory: server.workingDirectory ? String(server.workingDirectory) : null
      }
    }
  }
  return { error: "Invalid server type encountered" }
}

/** The legacy stdio fallback capabilities, as arrays — the shape the contract and the UI types use. */
const stdioFallback = (name: string) => ({
  name,
  version: "1.0.0",
  instructions: "Error retrieving capabilities: stdio process manager is not available in this build",
  resources: [
    { name: "Status", description: "Server status information", uriTemplate: "resource://status" }
  ],
  tools: [
    {
      name: "echo",
      description: "Echo the input back to the output",
      parameters: {
        type: "object",
        properties: { text: { type: "string", description: "Text to echo" } },
        required: ["text"]
      }
    }
  ]
})

export const McpHandlers = HttpApiBuilder.group(Api, "mcp", Effect.fn(function*(handlers) {
  const repo = yield* McpRepo

  /** Legacy read the caller with `requireAuth`; v6 has the single local profile. */
  const userId = Effect.fn("mcp.userId")(function*() {
    return (yield* CurrentUser).id
  })

  return handlers
    .handle("listConfig", ({ query }) =>
      Effect.gen(function*() {
        const user = yield* userId()
        const source = query.source ?? "claude"
        if (source === "claude" || source === "database") {
          const kind: "claude" | "database" = source
          const servers = [...(yield* repo.list(user))]
          return { success: true as const, source: kind, servers, count: servers.length }
        }
        if (source === "file") {
          const mcpServers: Array<ExportEntry> = []
          for (const row of yield* repo.list(user)) {
            if (row.type === "sse") {
              mcpServers.push({
                id: row.id, name: row.name, type: "sse", url: row.url,
                command: null, args: null, workingDirectory: null, enabled: row.enabled
              })
            } else if (row.type === "stdio") {
              mcpServers.push({
                id: row.id, name: row.name, type: "stdio", url: null, command: row.command,
                args: row.args, workingDirectory: row.workingDirectory, enabled: row.enabled
              })
            } else {
              return yield* new McpEnvInternal({ success: false, error: `Invalid server type in export: ${row.type}` })
            }
          }
          return {
            success: true as const, source: "file" as const, config: { mcpServers },
            exportedAt: new Date().toISOString()
          }
        }
        return yield* new McpEnvBadRequest({
          success: false,
          error: `Unknown config source: ${source}. Supported: claude, database, file`
        })
      }).pipe(Effect.catchTag("DatabaseError", envInternal("Internal server error"))))
    .handle("createConfig", ({ query, payload }) =>
      Effect.gen(function*() {
        const user = yield* userId()
        const source = query.source ?? "claude"
        if (source === "claude" || source === "database") {
          const invalid = validateCreate(asRecord(payload))
          if (invalid !== undefined) return yield* new McpEnvBadRequest({ success: false, error: invalid })
          const values = createValues(payload, source)
          let server: McpServerEntry
          if (source === "claude") {
            server = yield* repo.create(user, values).pipe(Effect.catchTag("DatabaseError", (error) =>
              Effect.fail(new McpEnvInternal({
                success: false,
                error: `Failed to register server: ${messageOf(error, "Unknown error")}`
              }))))
          } else {
            server = yield* repo.create(user, values)
          }
          return source === "claude"
            ? {
                success: true as const, source: "claude" as const, server, connectionTest: null,
                message: `Server ${server.name} registered successfully with Claude MCP`
              }
            : {
                success: true as const, source: "database" as const, server,
                message: `Server ${server.name} created in database`
              }
        }
        if (source === "file") {
          const file = payload.mcpServers
          if (!Array.isArray(file)) return yield* new McpEnvBadRequest({ success: false, error: "Invalid configuration format" })
          const entries: Array<ImportValues> = []
          for (const raw of file) {
            const parsed = importValues(raw)
            if ("error" in parsed) return yield* new McpEnvInternal({ success: false, error: parsed.error })
            entries.push(parsed.values)
          }
          const imported = yield* repo.replaceAll(user, entries)
          return {
            success: true as const, source: "file" as const, imported,
            message: `Imported ${imported} server configurations`
          }
        }
        return yield* new McpEnvBadRequest({
          success: false,
          error: `Unknown config source: ${source}. Supported: claude, database, file`
        })
      }).pipe(Effect.catchTag("DatabaseError", envInternal("Internal server error"))))
    .handle("updateConfig", ({ query, payload }) =>
      Effect.gen(function*() {
        const user = yield* userId()
        const source = query.source ?? "claude"
        if (source === "database") {
          return yield* new McpEnvMethodNotAllowed({ success: false, error: "Method PUT not allowed for database config" })
        }
        if (source === "file") {
          return yield* new McpEnvMethodNotAllowed({ success: false, error: "Method PUT not allowed for config file" })
        }
        if (source !== "claude") {
          return yield* new McpEnvBadRequest({
            success: false,
            error: `Unknown config source: ${source}. Supported: claude, database, file`
          })
        }
        const serverName = payload.serverName
        if (serverName === undefined || serverName === "") {
          return yield* new McpEnvBadRequest({ success: false, error: "Server name is required for updates" })
        }
        const existing = yield* repo.findByName(user, serverName)
        if (!existing) return yield* new McpEnvNotFound({ success: false, error: `Server ${serverName} not found` })
        const invalid = validateCreate(merge(existing, asRecord(payload)))
        if (invalid !== undefined) return yield* new McpEnvBadRequest({ success: false, error: invalid })
        const updated = yield* repo.update(existing.id, updateValues(existing, payload))
        if (!updated) return yield* new McpEnvNotFound({ success: false, error: `Server ${serverName} not found` })
        return {
          success: true as const, source: "claude" as const, server: updated,
          message: `Server ${serverName} updated successfully`
        }
      }).pipe(Effect.catchTag("DatabaseError", envInternal("Internal server error"))))
    .handle("removeConfig", ({ query }) =>
      Effect.gen(function*() {
        const user = yield* userId()
        const source = query.source ?? "claude"
        if (source === "database") {
          return yield* new McpEnvMethodNotAllowed({ success: false, error: "Method DELETE not allowed for database config" })
        }
        if (source === "file") {
          return yield* new McpEnvMethodNotAllowed({ success: false, error: "Method DELETE not allowed for config file" })
        }
        if (source !== "claude") {
          return yield* new McpEnvBadRequest({
            success: false,
            error: `Unknown config source: ${source}. Supported: claude, database, file`
          })
        }
        const name = query.name
        if (name === undefined || name === "") {
          return yield* new McpEnvBadRequest({ success: false, error: "Server name is required for deletion" })
        }
        const existing = yield* repo.findByName(user, name)
        if (!existing) return yield* new McpEnvNotFound({ success: false, error: `Server ${name} not found` })
        // Legacy looks the server up and then answers "removed from registry" without removing it.
        return {
          success: true as const, source: "claude" as const,
          message: `Server ${name} removed from registry`,
          note: "Server configurations are managed by Claude MCP client internally"
        }
      }).pipe(Effect.catchTag("DatabaseError", envInternal("Internal server error"))))
    .handle("getConfig", ({ params }) =>
      Effect.gen(function*() {
        if (params.id === "") return yield* new McpBadRequest({ error: "Invalid server ID" })
        const existing = yield* repo.find(params.id)
        if (!existing) return yield* new McpNotFound({ error: "Configuration not found" })
        return existing
      }).pipe(Effect.catchTag("DatabaseError", keyedInternal("Internal server error"))))
    .handle("updateConfigById", ({ params, payload }) =>
      Effect.gen(function*() {
        if (params.id === "") return yield* new McpBadRequest({ error: "Invalid server ID" })
        const existing = yield* repo.find(params.id)
        if (!existing) return yield* new McpNotFound({ error: "Configuration not found" })
        const invalid = validateUpdate(asRecord(payload))
        if (invalid !== undefined) return yield* new McpBadRequest({ error: invalid })
        if (payload.type !== undefined && payload.type !== existing.type) {
          return yield* new McpBadRequest({ error: "Cannot change server type after creation" })
        }
        const updated = yield* repo.update(existing.id, updateValues(existing, payload))
        if (!updated) return yield* new McpNotFound({ error: "Configuration not found" })
        return updated
      }).pipe(Effect.catchTag("DatabaseError", keyedInternal("Internal server error"))))
    .handle("removeConfigById", ({ params }) =>
      Effect.gen(function*() {
        if (params.id === "") return yield* new McpBadRequest({ error: "Invalid server ID" })
        const existing = yield* repo.find(params.id)
        if (!existing) return yield* new McpNotFound({ error: "Configuration not found" })
        yield* repo.remove(existing.id)
        return undefined
      }).pipe(Effect.catchTag("DatabaseError", keyedInternal("Internal server error"))))
    .handle("serverInfo", ({ payload }) =>
      Effect.gen(function*() {
        const serverId = payload.serverId
        if (serverId === undefined || serverId === "") {
          return yield* new McpBadRequest({ error: "Server ID is required" })
        }
        const config = yield* repo.find(serverId)
        if (!config) return yield* new McpNotFound({ error: "Server configuration not found" })
        if (!config.enabled) return yield* new McpBadRequest({ error: "Server is disabled" })
        // No MCP client in v6: this is the legacy route's own answer when the connect failed.
        if (config.type === "sse") return yield* new McpInternal({ error: "Failed to connect to SSE server" })
        if (config.type === "stdio") return stdioFallback(config.name)
        return yield* new McpBadRequest({ error: `Unknown server type: ${config.type}` })
      }).pipe(Effect.catchTag("DatabaseError", keyedInternal("Failed to get server info"))))

  /** Legacy `dataToUpdate` of `config/[id].ts`: name, enabled, then the fields the stored type owns. */
  function updateValues(existing: McpServerEntry, payload: McpServerPatch): UpdateValues {
    const patch = asRecord(payload)
    const data: UpdateValues = {}
    if (typeof patch.name === "string") data.name = patch.name
    if (typeof patch.enabled === "boolean") data.enabled = patch.enabled
    if (existing.type === "sse") {
      if (typeof patch.url === "string") data.url = patch.url
    } else if (existing.type === "stdio") {
      if (typeof patch.command === "string") data.command = patch.command
      if (patch.args !== undefined) {
        data.args = (Array.isArray(patch.args) ? patch.args : null) as unknown as UpdateValues["args"]
      }
      if (typeof patch.workingDirectory === "string") data.workingDirectory = patch.workingDirectory
    }
    return data
  }
}))
