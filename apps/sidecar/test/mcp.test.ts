/**
 * MCP configuration routes (spec 11): `/api/mcp/config` (all three `?source=` variants),
 * `/api/mcp/config/:id` and `/api/mcp/server-info`, asserted with the legacy status codes and
 * messages — including the bugs the ported pages reproduce: the collection answers with an
 * envelope instead of an array, `validateServerConfig` rejects the form's `sse` type, the file
 * POST refuses the export envelope the config editor posts back, the export cannot serialise a
 * `url`-typed row, and the collection `DELETE` reports a removal it never performs.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const get = (path: string) => app.call(path)
const post = (path: string, json: unknown) => app.call(path, { method: "POST", json })
const put = (path: string, json: unknown) => app.call(path, { method: "PUT", json })
const del = (path: string) => app.call(path, { method: "DELETE" })

/** The legacy collection body: `{ success: false, error }` (the `:id` routes drop `success`). */
const envError = (error: string) => ({ success: false, error })

describe("/api/mcp/config", () => {
  test("every route needs the launch token", async () => {
    const anon = (path: string, init: RequestInit & { json?: unknown } = {}) => app.call(path, { ...init, auth: false })
    expect((await anon("/api/mcp/config")).status).toBe(401)
    expect((await anon("/api/mcp/config", { method: "POST", json: {} })).status).toBe(401)
    expect((await anon("/api/mcp/config/nope")).status).toBe(401)
    expect((await anon("/api/mcp/server-info", { method: "POST", json: { serverId: "x" } })).status).toBe(401)
  })

  test("the list is the legacy envelope, never the array the pages expect", async () => {
    const list = await get("/api/mcp/config")
    expect(list.status).toBe(200)
    expect(Array.isArray(list.body)).toBe(false)
    expect(list.body).toEqual({ success: true, source: "claude", servers: [], count: 0 })

    const file = await get("/api/mcp/config?source=file")
    expect(file.status).toBe(200)
    expect(file.body.source).toBe("file")
    expect(file.body.config).toEqual({ mcpServers: [] })
    expect(typeof file.body.exportedAt).toBe("string")
  })

  test("an unknown config source is rejected", async () => {
    const r = await get("/api/mcp/config?source=nope")
    expect(r.status).toBe(400)
    expect(r.body).toMatchObject(envError("Unknown config source: nope. Supported: claude, database, file"))
  })

  test("create validates like the legacy collection route", async () => {
    const noName = await post("/api/mcp/config", { type: "url", url: "https://a.test" })
    expect(noName.status).toBe(400)
    expect(noName.body).toMatchObject(envError("Server name is required"))

    // The legacy form submits `sse`, which this validator has never accepted.
    const sse = await post("/api/mcp/config", { name: "SSE", type: "sse", url: "https://a.test" })
    expect(sse.status).toBe(400)
    expect(sse.body).toMatchObject(envError('Server type must be either "url" or "stdio"'))

    const noUrl = await post("/api/mcp/config", { name: "Url", type: "url" })
    expect(noUrl.status).toBe(400)
    expect(noUrl.body).toMatchObject(envError("URL is required for URL servers"))

    const noCommand = await post("/api/mcp/config", { name: "Stdio", type: "stdio" })
    expect(noCommand.status).toBe(400)
    expect(noCommand.body).toMatchObject(envError("Command is required for stdio servers"))
  })

  test("creates a claude registration and answers with the legacy message", async () => {
    const r = await post("/api/mcp/config", { name: "Claude Reg", type: "url", url: "https://claude.test/mcp" })
    expect(r.status).toBe(201)
    expect(r.body.success).toBe(true)
    expect(r.body.source).toBe("claude")
    expect(r.body.connectionTest).toBeNull()
    expect(r.body.message).toBe("Server Claude Reg registered successfully with Claude MCP")
    expect(r.body.server).toMatchObject({ name: "Claude Reg", type: "url", url: "https://claude.test/mcp", enabled: true })
    expect(typeof r.body.server.id).toBe("string")
    expect(typeof r.body.server.createdAt).toBe("string")
  })

  test("the database branch drops the URL, exactly like legacy", async () => {
    const r = await post("/api/mcp/config?source=database", { name: "Db Reg", type: "url", url: "https://db.test/mcp" })
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ success: true, source: "database", message: "Server Db Reg created in database" })
    // Legacy stored `url` only for the type `sse`, which the shared validator rejects first.
    expect(r.body.server.url).toBeNull()

    const list = await get("/api/mcp/config")
    expect(list.body.count).toBe(2)
  })

  test("the export cannot serialise a url-typed row, and server-info refuses it", async () => {
    const exportFail = await get("/api/mcp/config?source=file")
    expect(exportFail.status).toBe(500)
    expect(exportFail.body).toMatchObject(envError("Invalid server type in export: url"))

    const info = await post("/api/mcp/server-info", { serverId: (await get("/api/mcp/config")).body.servers[0].id })
    expect(info.status).toBe(400)
    expect(info.body).toMatchObject({ error: "Unknown server type: url" })
  })

  test("collection PUT and DELETE only exist for the claude source", async () => {
    const dbPut = await put("/api/mcp/config?source=database", { serverName: "Db Reg" })
    expect(dbPut.status).toBe(405)
    expect(dbPut.body).toMatchObject(envError("Method PUT not allowed for database config"))

    const filePut = await put("/api/mcp/config?source=file", { serverName: "Db Reg" })
    expect(filePut.status).toBe(405)
    expect(filePut.body).toMatchObject(envError("Method PUT not allowed for config file"))

    const dbDel = await app.call(`/api/mcp/config?source=database&name=${encodeURIComponent("Db Reg")}`, { method: "DELETE" })
    expect(dbDel.status).toBe(405)
    expect(dbDel.body).toMatchObject(envError("Method DELETE not allowed for database config"))

    const fileDel = await app.call(`/api/mcp/config?source=file&name=${encodeURIComponent("Db Reg")}`, { method: "DELETE" })
    expect(fileDel.status).toBe(405)
    expect(fileDel.body).toMatchObject(envError("Method DELETE not allowed for config file"))
  })

  test("collection PUT addresses the server by name", async () => {
    const missing = await put("/api/mcp/config", { name: "Claude Reg" })
    expect(missing.status).toBe(400)
    expect(missing.body).toMatchObject(envError("Server name is required for updates"))

    const unknown = await put("/api/mcp/config", { serverName: "Nope" })
    expect(unknown.status).toBe(404)
    expect(unknown.body).toMatchObject(envError("Server Nope not found"))

    // The merged body still has the type `url`, so the create validator runs again.
    const ok = await put("/api/mcp/config", { serverName: "Claude Reg", enabled: false })
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({
      success: true, source: "claude", message: "Server Claude Reg updated successfully"
    })
    expect(ok.body.server.enabled).toBe(false)
  })

  test("collection DELETE reports a removal it never performs", async () => {
    const missing = await del("/api/mcp/config")
    expect(missing.status).toBe(400)
    expect(missing.body).toMatchObject(envError("Server name is required for deletion"))

    const unknown = await app.call(`/api/mcp/config?name=${encodeURIComponent("Nope")}`, { method: "DELETE" })
    expect(unknown.status).toBe(404)
    expect(unknown.body).toMatchObject(envError("Server Nope not found"))

    const ok = await app.call(`/api/mcp/config?name=${encodeURIComponent("Claude Reg")}`, { method: "DELETE" })
    expect(ok.status).toBe(200)
    expect(ok.body).toEqual({
      success: true,
      source: "claude",
      message: "Server Claude Reg removed from registry",
      note: "Server configurations are managed by Claude MCP client internally"
    })
    // Legacy never unregistered anything — the server is still there.
    const list = await get("/api/mcp/config")
    expect(list.body.servers.map((s: { name: string }) => s.name)).toContain("Claude Reg")
  })
})

describe("/api/mcp/config/:id", () => {
  test("unknown identifiers answer `Configuration not found`", async () => {
    const r = await get("/api/mcp/config/does-not-exist")
    expect(r.status).toBe(404)
    expect(r.body).toMatchObject({ error: "Configuration not found" })
  })

  test("reads, updates and validates the stored row", async () => {
    const id = (await get("/api/mcp/config")).body.servers.find((s: { name: string }) => s.name === "Db Reg").id

    const read = await get(`/api/mcp/config/${id}`)
    expect(read.status).toBe(200)
    expect(read.body).toMatchObject({ name: "Db Reg", type: "url" })
    expect(typeof read.body.userId).toBe("string")
    expect(typeof read.body.updatedAt).toBe("string")

    const blank = await put(`/api/mcp/config/${id}`, { name: "   " })
    expect(blank.status).toBe(400)
    expect(blank.body).toMatchObject({ error: "Server name is required" })

    const typeChange = await put(`/api/mcp/config/${id}`, { type: "stdio" })
    expect(typeChange.status).toBe(400)
    expect(typeChange.body).toMatchObject({ error: "Cannot change server type after creation" })

    // The update validator runs before the "cannot change the type" rule, like legacy.
    const badUrl = await put(`/api/mcp/config/${id}`, { type: "sse", url: " " })
    expect(badUrl.status).toBe(400)
    expect(badUrl.body).toMatchObject({ error: "URL is required for SSE servers" })

    const badArgs = await put(`/api/mcp/config/${id}`, { type: "stdio", args: "not-an-array" })
    expect(badArgs.status).toBe(400)
    expect(badArgs.body).toMatchObject({ error: "Arguments must be an array of strings" })

    const ok = await put(`/api/mcp/config/${id}`, { name: "Db Renamed", enabled: false })
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ name: "Db Renamed", enabled: false })
  })

  test("deletes with a 204 and nothing after it", async () => {
    const id = (await get("/api/mcp/config")).body.servers.find((s: { name: string }) => s.name === "Db Renamed").id
    const removed = await del(`/api/mcp/config/${id}`)
    expect(removed.status).toBe(204)
    expect(removed.body).toBeUndefined()
    expect((await get(`/api/mcp/config/${id}`)).status).toBe(404)
  })
})

describe("/api/mcp/config?source=file", () => {
  test("a body without `mcpServers` is refused — what the config editor posts", async () => {
    const r = await post("/api/mcp/config?source=file", {})
    expect(r.status).toBe(400)
    expect(r.body).toMatchObject(envError("Invalid configuration format"))
  })

  test("each imported entry is checked inside the legacy transaction", async () => {
    const broken = await post("/api/mcp/config?source=file", { mcpServers: [{ name: "No id", type: "sse" }] })
    expect(broken.status).toBe(500)
    expect(broken.body).toMatchObject(envError("Server ID, name and type are required"))

    const noUrl = await post("/api/mcp/config?source=file", { mcpServers: [{ id: "x", name: "X", type: "sse" }] })
    expect(noUrl.status).toBe(500)
    expect(noUrl.body).toMatchObject(envError("URL is required for SSE servers"))

    const badType = await post("/api/mcp/config?source=file", { mcpServers: [{ id: "x", name: "X", type: "url" }] })
    expect(badType.status).toBe(500)
    expect(badType.body).toMatchObject(envError("Invalid server type encountered"))
  })

  test("imports, exports and lists the three servers", async () => {
    const r = await post("/api/mcp/config?source=file", {
      mcpServers: [
        { id: "srv-stdio", name: "Local FS", type: "stdio", command: "npx", args: ["-y", "@x/y"], workingDirectory: "/tmp/work", enabled: true },
        { id: "srv-sse", name: "Remote", type: "sse", url: "https://sse.test/mcp", enabled: true },
        { id: "srv-off", name: "Disabled", type: "sse", url: "https://off.test/mcp", enabled: false }
      ]
    })
    expect(r.status).toBe(200)
    expect(r.body).toEqual({
      success: true, source: "file", imported: 3,
      message: "Imported 3 server configurations"
    })

    const file = await get("/api/mcp/config?source=file")
    expect(file.status).toBe(200)
    expect(file.body.config.mcpServers).toHaveLength(3)
    expect(file.body.config.mcpServers[0]).toEqual({
      id: "srv-stdio", name: "Local FS", type: "stdio", url: null, command: "npx",
      args: ["-y", "@x/y"], workingDirectory: "/tmp/work", enabled: true
    })

    const list = await get("/api/mcp/config")
    expect(list.body.count).toBe(3)
    // The legacy client pushed `list.body` (an object) through `Array.isArray`, so both pages
    // always rendered their empty state — this is the shape they were given.
    expect(list.body.servers).toHaveLength(3)
  })
})

describe("/api/mcp/server-info", () => {
  const info = (serverId?: string) => post("/api/mcp/server-info", serverId === undefined ? {} : { serverId })

  test("requires a server id, then the stored configuration", async () => {
    const missing = await info()
    expect(missing.status).toBe(400)
    expect(missing.body).toMatchObject({ error: "Server ID is required" })

    const unknown = await info("nope")
    expect(unknown.status).toBe(404)
    expect(unknown.body).toMatchObject({ error: "Server configuration not found" })
  })

  test("a disabled server is refused before anything is opened", async () => {
    const r = await info("srv-off")
    expect(r.status).toBe(400)
    expect(r.body).toMatchObject({ error: "Server is disabled" })
  })

  test("an sse server answers the legacy connect failure", async () => {
    const r = await info("srv-sse")
    expect(r.status).toBe(500)
    expect(r.body).toMatchObject({ error: "Failed to connect to SSE server" })
  })

  test("a stdio server answers the legacy capability fallback", async () => {
    const r = await info("srv-stdio")
    expect(r.status).toBe(200)
    expect(r.body.name).toBe("Local FS")
    expect(r.body.version).toBe("1.0.0")
    expect(r.body.instructions).toContain("Error retrieving capabilities:")
    expect(r.body.resources).toHaveLength(1)
    expect(r.body.resources[0]).toMatchObject({ name: "Status", uriTemplate: "resource://status" })
    expect(r.body.tools).toHaveLength(1)
    expect(r.body.tools[0].name).toBe("echo")
  })
})
