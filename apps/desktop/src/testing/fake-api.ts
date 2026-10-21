import { Effect, Layer, Schema } from "effect"
import { cam } from "@cadcamfun/core"
import { ApiClient as Service, clientLayer } from "../app/client.ts"
import type { Client } from "../shared/state/client.ts"

export type ApiClient = Client
type Row = Record<string, unknown> & { id: string; name: string }
export interface FakeApiSeed {
  readonly projects?: ReadonlyArray<{ readonly id: string; readonly name: string }>
  readonly materials?: ReadonlyArray<Row>
  readonly tools?: ReadonlyArray<Row>
  readonly machineConfigs?: ReadonlyArray<Row>
  readonly toolpaths?: ReadonlyArray<Row>
}
export interface FakeApiOptions { readonly seed?: FakeApiSeed; readonly now?: () => string }
export interface FakeStore {
  projects: Row[]
  drawings: Row[]
  materials: Row[]
  tools: Row[]
  machineConfigs: Row[]
  toolpaths: Row[]
  notifications: Array<Record<string, unknown> & { id: string }>
  organizations: Array<Record<string, unknown> & { id: string; name: string }>
}
export class FakeApiError extends Error {
  readonly _tag = "FakeApiError"
  constructor(readonly details: { readonly endpoint: string; readonly message: string }) { super(details.message) }
}
export type FakeApi = Client & {
  readonly store: FakeStore
  failNext(endpoint: string, error?: FakeApiError): void
  createdIds(): ReadonlyArray<string>
}

// Use the real generated client over an in-memory HTTP transport: payloads and
// responses undergo the same schema decoding as the sidecar, without casts.
/**
 * Decodes a request body into a value: strings are JSON, bytes are decoded as UTF-8,
 * and a stream (what `fetch` hands a `Request` body) is drained. Anything else is
 * treated as an empty payload, matching what an endpoint with no fields would send.
 */
const decodeBody = async (body: unknown): Promise<unknown> => {
  try {
    if (typeof body === "string") return body === "" ? {} : JSON.parse(body)
    if (body instanceof Uint8Array) return body.length === 0 ? {} : JSON.parse(new TextDecoder().decode(body))
    if (ArrayBuffer.isView(body) || body instanceof ArrayBuffer) {
      const bytes = body instanceof ArrayBuffer ? new Uint8Array(body) : new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
      return bytes.length === 0 ? {} : JSON.parse(new TextDecoder().decode(bytes))
    }
    if (body instanceof ReadableStream) {
      const text = await new Response(body).text()
      return text === "" ? {} : JSON.parse(text)
    }
    if (typeof body === "object" && body !== null) return body
  } catch {
    return {}
  }
  return {}
}

/**
 * The generator routes are pure functions of the request, so the browser preview runs the very same
 * `cam.generator` code the sidecar does and answers with the contract Schemas' encoding.
 */
const generatorRoute = (kind: string, body: unknown): { readonly status: number; readonly body: unknown } => {
  const g = cam.generator
  try {
    switch (kind) {
      case "generate": {
        const outcome = g.generateToolpath(Schema.decodeUnknownSync(g.GenerateRequestSchema)(body))
        if (outcome.error !== undefined) return { status: 400, body: { message: outcome.error } }
        return { status: 200, body: Schema.encodeSync(g.GenerateResponseSchema)(outcome.response) }
      }
      case "suggest": {
        const request = Schema.decodeUnknownSync(g.SuggestRequestSchema)(body)
        return { status: 200, body: Schema.encodeSync(g.SuggestResponseSchema)(g.suggestFor(request.settings, request.geometry as cam.generator.GeometryInput)) }
      }
      default: {
        const request = Schema.decodeUnknownSync(g.ParseRequestSchema)(body)
        const analysis = g.analyseGcode(request.gcode, request.name)
        return { status: 200, body: Schema.encodeSync(g.ParseResponseSchema)({ warnings: analysis.warnings, stats: analysis.stats, program: analysis.program }) }
      }
    }
  } catch (cause) {
    return { status: 400, body: { message: cause instanceof Error ? cause.message : String(cause) } }
  }
}

export function createFakeApi(options: FakeApiOptions = {}): FakeApi {
  const now = options.now ?? (() => new Date().toISOString())
  const common = () => ({ createdAt: now(), updatedAt: now(), ownerId: "user-local", organizationId: null, isPublic: false })
  const store: FakeStore = {
    projects: (options.seed?.projects ?? []).map((p) => ({ ...common(), description: null, ...p })),
    drawings: [],
    materials: [...(options.seed?.materials ?? [{ ...common(), id: "aluminium", name: "Aluminium 6061", description: null, properties: { density: 2700, costPerUnit: 4.2 } }])],
    tools: [...(options.seed?.tools ?? [{ ...common(), id: "endmill", name: "6 mm end mill", type: "endmill", diameter: 6, material: "carbide", numberOfFlutes: 3, maxRPM: 18000, coolantType: null, cuttingLength: null, totalLength: null, shankDiameter: null, notes: null }])],
    machineConfigs: [...(options.seed?.machineConfigs ?? [{ ...common(), id: "grbl", name: "3018 CNC", type: "mill", description: null, config: { workVolume: { x: 300, y: 180, z: 60 }, maxSpindleSpeed: 18000, maxFeedRate: 2000, controller: "grbl" } }])],
    toolpaths: [...(options.seed?.toolpaths ?? [])],
    notifications: [],
    organizations: []
  }
  const failures = new Map<string, string>()
  const kv = new Map<string, { key: string; value: unknown; updatedAt: string }>()
  const ids: string[] = []
  let sequence = 0
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } })
  const handle: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response> = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const parts = url.pathname.split("/").filter(Boolean)
    const group = parts[1] ?? "health"
    const method = init?.method ?? "GET"
    const failure = failures.get(group)
    if (failure !== undefined) { failures.delete(group); return json({ message: failure }, 500) }
    // Both health paths answer the same body: the legacy `/api/health` and the
    // authenticated `/health` the native boot contract uses.
    if (url.pathname === "/health" || url.pathname === "/api/health") return json({ status: "ok", timestamp: now() })
    // The generated client encodes JSON payloads as bytes, not as a string, so the body
    // has to be decoded from whichever representation the transport was handed.
    const body: unknown = await decodeBody(init?.body)
    const payload = typeof body === "object" && body !== null ? body : {}
    const record = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null ? Object.fromEntries(Object.entries(value)) : {}
    const data = record(payload)
    if (group === "kv") {
      const key = parts[2] === undefined ? undefined : decodeURIComponent(parts[2])
      if (method === "GET" && key === undefined) {
        const prefix = url.searchParams.get("prefix")
        return json({ entries: [...kv.values()].filter((entry) => !prefix || entry.key.startsWith(prefix)).sort((a, b) => a.key.localeCompare(b.key)) })
      }
      if (key !== undefined) {
        if (method === "PUT") {
          if (!/^[A-Za-z0-9_.:-]{1,200}$/.test(key)) return json({ _tag: "BadRequest", message: "Invalid key" }, 400)
          const entry = { key, value: data["value"], updatedAt: now() }
          kv.set(key, entry)
          return json(entry)
        }
        if (method === "DELETE") return kv.delete(key) ? json({ message: "Deleted" }) : json({ _tag: "NotFound", message: "Key not found" }, 404)
        if (method === "GET") {
          const entry = kv.get(key)
          return entry === undefined ? json({ _tag: "NotFound", message: "Key not found" }, 404) : json(entry)
        }
      }
    }
    if (group === "notifications") {
      if (method === "POST" && parts[2] === "mark-all-read") {
        const count = store.notifications.filter((n) => n["isRead"] !== true).length
        for (const n of store.notifications) n["isRead"] = true
        return json({ message: "All notifications marked as read", count })
      }
      const nid = parts[2]
      if (method === "GET" && nid === undefined) {
        const rows = [...store.notifications].sort((a, b) => String(b["createdAt"]).localeCompare(String(a["createdAt"])))
        return json({ notifications: rows, unreadCount: rows.filter((n) => n["isRead"] !== true).length, nextCursor: null })
      }
      const found = store.notifications.find((n) => n.id === nid)
      if (found === undefined) return json({ message: "Notification not found" }, 404)
      if (method === "PUT") { found["isRead"] = data["isRead"] === true; return json(found) }
      if (method === "DELETE") { store.notifications = store.notifications.filter((n) => n.id !== nid); return json({ message: "Notification deleted successfully" }) }
    }
    if (group === "organizations") {
      const oid = parts[2]
      if (method === "GET" && oid === undefined) return json(store.organizations.map((o) => ({ description: null, createdAt: now(), updatedAt: now(), role: "ADMIN", userCount: 1, projectCount: 0, ...o })))
      if (method === "POST" && oid === undefined) {
        if (typeof data["name"] !== "string" || !data["name"].trim()) return json({ message: "Organization name is required" }, 400)
        const org = { id: `organizations-${++sequence}`, name: data["name"], description: typeof data["description"] === "string" ? data["description"] : null, createdAt: now(), updatedAt: now() }
        store.organizations.push(org); ids.push(org.id)
        return json(org, 201)
      }
      const org = store.organizations.find((o) => o.id === oid)
      if (org === undefined) return json({ message: "Organization not found" }, 404)
      if (method === "GET") return json({ description: null, createdAt: now(), updatedAt: now(), ...org, members: [{ id: "user-local", name: "Local profile", email: null, image: null, role: "ADMIN", joinedAt: now() }], projectCount: 0, userRole: "ADMIN" })
      if (method === "PUT") { Object.assign(org, { name: typeof data["name"] === "string" ? data["name"] : org.name, description: data["description"] ?? null, updatedAt: now() }); return json(org) }
      if (method === "DELETE") { store.organizations = store.organizations.filter((o) => o.id !== oid); return json({ message: "Organization deleted successfully" }) }
    }
    if (group === "ai" && parts[2] === "permission" && parts[3] === "reply" && method === "POST") {
      return json({ message: "Permission reply sent" })
    }
    if (group === "ai" && parts[2] === "chat" && parts[3] === "abort" && method === "POST") {
      return json({ message: "Aborted" })
    }
    if (group === "toolpaths" && method === "POST" && ["generate", "suggest", "parse"].includes(parts[2] ?? "")) {
      const answer = generatorRoute(parts[2] ?? "", body)
      return json(answer.body, answer.status)
    }
    const collection = group === "machine-configs" ? store.machineConfigs : group === "projects" ? store.projects : group === "drawings" ? store.drawings : group === "materials" ? store.materials : group === "tools" ? store.tools : group === "toolpaths" ? store.toolpaths : undefined
    if (collection === undefined) return json({ message: "Not implemented in browser preview" }, 501)
    const envelope = (value: unknown, status = 200) => group === "machine-configs" ? json({ success: true, data: value }, status) : json(value, status)
    const relations = (row: Row) => group === "projects" ? { ...row, owner: { id: "user-local", name: "Local profile", email: null }, organization: null, _count: { drawings: store.drawings.filter((d) => d["projectId"] === row.id).length, components: 0 } } : row
    const id = parts[2]
    if (group === "projects" && parts[3] === "drawings") {
      if (!store.projects.some((p) => p.id === id)) return json({ message: "Project not found" }, 404)
      if (method === "GET") return json(store.drawings.filter((d) => d["projectId"] === id))
      const row: Row = { id: `drawing-${++sequence}`, name: "Drawing", description: null, data: null, thumbnail: null, createdAt: now(), updatedAt: now(), ...data, projectId: id }
      store.drawings.push(row); ids.push(row.id)
      return json(row, 201)
    }
    if (method === "GET" && !id) {
      const rows = collection.filter((row) => !url.searchParams.get("projectId") || row["projectId"] === url.searchParams.get("projectId"))
      return envelope(group === "machine-configs" ? { configs: rows, total: rows.length } : rows.map(relations))
    }
    if (method === "POST" && !id) {
      if (typeof data["name"] !== "string" || !data["name"].trim()) return json({ message: "Name is required" }, 400)
      const defaults = group === "tools" ? { type: "endmill", diameter: 6, material: "carbide", numberOfFlutes: null, maxRPM: null, coolantType: null, cuttingLength: null, totalLength: null, shankDiameter: null, notes: null } : group === "toolpaths" ? { data: null, type: null, operationType: null, gcode: null, thumbnail: null, createdBy: "user-local", drawingId: null, materialId: null, toolId: null, machineConfigId: null } : { properties: {} }
      const row: Row = { ...common(), ...defaults, description: null, ...data, id: `${group}-${++sequence}`, name: data["name"] }
      collection.push(row); ids.push(row.id)
      // Machine configs answer through the legacy envelope helpers, which default to
      // 200 even on create; the other collections declare 201 in the contract.
      return envelope(row, group === "machine-configs" ? 200 : 201)
    }
    const index = collection.findIndex((r) => r.id === id)
    const row = collection[index]
    if (row === undefined) return json({ message: "Not found" }, 404)
    if (method === "DELETE") {
      collection.splice(index, 1)
      if (group === "projects") { store.drawings = store.drawings.filter((d) => d["projectId"] !== id); store.toolpaths = store.toolpaths.filter((d) => d["projectId"] !== id) }
      return envelope({ message: "Deleted" })
    }
    if (method === "PUT") {
      const updated = { ...row, ...data, id: row.id, name: typeof data["name"] === "string" ? data["name"] : row.name, updatedAt: now() }
      collection[index] = updated
      return envelope(group === "toolpaths" ? { ...updated, message: "Updated" } : relations(updated))
    }
    if (group === "drawings") return json({ ...row, project: { id: row["projectId"], name: "Project", ownerId: "user-local", organization: null } })
    if (group === "tools" || group === "materials") return json({ ...row, owner: null, organization: null })
    return envelope(relations(row))
  }
  const transport = Object.assign(handle, { preconnect: globalThis.fetch.preconnect })
  const layer = clientLayer({ baseUrl: "http://preview.local", token: "preview" }, transport)
  const client = Effect.runSync(Effect.service(Service).pipe(Effect.provide(layer)))
  return Object.assign(client, { store, createdIds: () => [...ids], failNext: (endpoint: string, error?: FakeApiError) => { failures.set(endpoint === "machineConfigs" ? "machine-configs" : endpoint, error?.message ?? "Request failed") } })
}

export const fakeApiLayer = (options?: FakeApiOptions) => Layer.succeed(Service, createFakeApi(options))
