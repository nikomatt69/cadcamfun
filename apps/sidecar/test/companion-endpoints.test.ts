import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Api } from "@cadcamfun/api"
import { OpenApi } from "effect/unstable/httpapi"
import { createFetchTransport } from "../../mobile/modules/companion-net/transport.ts"
import { CompanionClient } from "../../mobile/lib/client.ts"
import { parsePairingLink } from "../../mobile/lib/pairing.ts"
import { isCompanionRoute } from "../src/services/companion-gateway.ts"

/**
 * The phone's endpoint contract: every call `apps/mobile/lib/client.ts` makes must be a route the API defines and the
 * companion gateway lets through. A route renamed on the desktop, or a phone call nobody added to the allow-list,
 * fails here instead of as a silent 404/403 on the phone.
 */

const clientSource = readFileSync(new URL("../../mobile/lib/client.ts", import.meta.url), "utf8")

/** `(method, path)` of every desktop call in the client, with path parameters filled with a placeholder. */
const phoneCalls = (): Array<{ method: string; path: string }> => {
  const calls = new Map<string, { method: string; path: string }>()
  const add = (method: string, source: string) => {
    // `${entry}` / `${resource}` stand for every kind the phone manages: each combination is checked on its own.
    const kinds = source.includes("${projectEntry}") ? ["drawings", "components"] : source.includes("${entry}") ? ["drawings", "components", "toolpaths"] : source.includes("${resource}") ? ["materials", "tools", "machine-configs"] : [undefined]
    for (const kind of kinds) {
    const raw = kind ? source.replaceAll("${projectEntry}", kind).replaceAll("${entry}", kind).replaceAll("${resource}", kind) : source
    const path = raw
      .replaceAll(/\$\{this\.workspacePath\(\w+\)\}/g, "/api/projects/P/workspace")
      .replaceAll(/\$\{this\.projectPath\(\w+\)\}/g, "/api/projects/P")
      // An unclosed `${…` starts an optional query string (`${state ? `…`), not a path segment.
      .replace(/\$\{[^}]*$/, "")
      // A whole segment is a path parameter; an expression glued to a segment is a query suffix (`${suffix}`).
      .replaceAll(/\/\$\{[^}]*\}/g, "/X")
      .replaceAll(/\$\{[^}]*\}/g, "")
    calls.set(`${method} ${path}`, { method, path })
    }
  }
  for (const match of clientSource.matchAll(/request(?:<[^(]*?>)?\(\s*"(GET|POST|PUT|PATCH|DELETE)",\s*([`"])([^`"?]*)/g)) add(match[1]!, match[3]!)
  for (const match of clientSource.matchAll(/transport\.stream\(\s*([`"])([^`"?]*)\1?[^,]*,\s*"(GET|POST)"/g)) add(match[3]!, match[2]!)
  // `project(id)` passes the bare project path.
  if (clientSource.includes(`this.request<ProjectSummary>("GET", this.projectPath(id)`)) add("GET", "/api/projects/P")
  return [...calls.values()]
}

const apiRoutes = (() => {
  const document = OpenApi.fromApi(Api)
  return Object.entries(document.paths).flatMap(([template, item]) => {
    const pattern = new RegExp(`^${template.replaceAll(/\{[^}]+\}/g, "[^/]+")}$`)
    return Object.keys(item).map((method) => ({ method: method.toUpperCase(), pattern }))
  })
})()

describe("phone endpoint contract", () => {
  const calls = phoneCalls()

  test("the client's calls are all found (the extraction itself is not silently empty)", () => {
    const keys = calls.map((call) => `${call.method} ${call.path}`)
    for (const expected of [
      "GET /api/health", "GET /api/projects", "GET /api/projects/P", "GET /api/projects/P/workspace/drawings/X/preview",
      "GET /api/projects/P/workspace/toolpaths/X/preview", "POST /api/ai/sessions/prompt", "GET /api/ai/sessions/X/stream",
      "POST /api/ai/chat/stream", "GET /api/projects/P/events", "GET /api/notifications", "DELETE /api/notifications/X",
    ]) expect(keys).toContain(expected)
    expect(calls.length).toBeGreaterThanOrEqual(35)
  })

  test("every phone call is a route the desktop API defines", () => {
    const missing = calls.filter((call) => !apiRoutes.some((route) => route.method === call.method && route.pattern.test(call.path)))
    expect(missing).toEqual([])
  })

  test("every phone call passes the companion gateway's allow-list", () => {
    expect(calls.filter((call) => !isCompanionRoute(call.method, call.path))).toEqual([])
  })
})

const entry = new URL("../src/main.ts", import.meta.url).pathname
const migrations = new URL("../../../packages/db/drizzle", import.meta.url).pathname
const token = "companion-endpoints-token"

describe("phone endpoints on the real HTTP server", () => {
  test("a paired phone reads every screen's data through the gateway; unknown sessions are refused, not unrouted", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "cadcamfun-endpoints-"))
    const child = Bun.spawn([process.execPath, entry], {
      env: { ...process.env, CADCAMFUN_TOKEN: token, CADCAMFUN_DATA_DIR: dataDir, CADCAMFUN_MIGRATIONS_DIR: migrations, CADCAMFUN_AI_OFFLINE: "1" },
      stdin: "pipe", stdout: "pipe", stderr: "ignore",
    })
    try {
      const reader = child.stdout.getReader()
      let out = ""
      while (!out.includes("\n")) {
        const { done, value } = await reader.read()
        if (done) throw new Error("sidecar exited early")
        out += new TextDecoder().decode(value)
      }
      const port = JSON.parse(out.split("\n")[0]!).port as number
      const local = (path: string, init: RequestInit = {}) =>
        fetch(`http://127.0.0.1:${port}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers } })
      const gatewayPort = 20_000 + Math.floor(Math.random() * 20_000)
      await local("/api/companion/enable", { method: "POST", body: JSON.stringify({ port: gatewayPort }) })
      const paired = await (await local("/api/companion/pair", { method: "POST", body: JSON.stringify({ name: "Endpoint iPhone", host: "127.0.0.1" }) })).json()
      const pairing = parsePairingLink(paired.link)
      const pem = readFileSync(join(dataDir, "companion", "cert.pem"), "utf8")
      const pinned = ((url: string, init: RequestInit) => fetch(url, { ...init, tls: { ca: pem, checkServerIdentity: () => undefined } } as RequestInit)) as unknown as typeof fetch
      const transport = createFetchTransport(pairing, pinned)
      const phone = new CompanionClient(transport)

      const project = await (await local("/api/projects", { method: "POST", body: JSON.stringify({ name: "Bracket" }) })).json()
      const drawing = await (await local(`/api/projects/${project.id}/drawings`, {
        method: "POST", body: JSON.stringify({ name: "Plate", data: { elements: [{ id: "box", name: "Box", type: "cube", width: 10, height: 10, depth: 4 }] } }),
      })).json()

      expect((await phone.health()).status).toBeDefined()
      expect((await phone.projects()).map((item) => item.id)).toEqual([project.id])
      expect((await phone.project(project.id)).name).toBe("Bracket")
      expect((await phone.workspaceDrawings(project.id)).map((item) => item.id)).toEqual([drawing.id])
      const mesh = await phone.drawingPreview(project.id, drawing.id)
      expect(mesh.indices.length).toBeGreaterThan(0)
      expect(mesh.parts.map((part) => part.id)).toEqual(["box"])
      expect(await phone.workspaceComponents(project.id)).toEqual([])
      expect(await phone.workspaceToolpaths(project.id)).toEqual([])
      expect(await phone.workspaceLibrary(project.id)).toBeDefined()
      expect((await phone.status(project.id))).toBeDefined()
      expect((await phone.branches(project.id)).current).toBe("main")
      // A project is born with its first commit on `main` (see `ProjectVcs.initialize`), so the phone sees one entry.
      expect((await phone.log(project.id)).map((commit) => commit.message.trim())).toEqual(["Initial commit"])
      expect(await phone.pullRequests(project.id)).toEqual([])
      expect(await phone.runs(project.id)).toEqual([])
      expect((await phone.aiStatus()).configured).toBe(false)
      expect(Array.isArray(await phone.agents())).toBe(true)
      expect(Array.isArray(await phone.aiProviders())).toBe(true)
      expect(Array.isArray(await phone.aiModels())).toBe(true)
      const feed = await phone.notifications()
      expect(feed.notifications).toEqual([])
      expect((feed as { nextCursor?: unknown }).nextCursor).toBeNull()
      // The AI status says honestly which assistant answers: the embedded nikcli host or the direct model path.
      expect(["nikcli", "direct"]).toContain((await phone.aiStatus()).host ?? "missing")

      // Routes the phone can adopt before its client calls them: conversation list and history, through the gateway.
      const sessions = await transport.request(`/api/ai/sessions?projectId=${encodeURIComponent(project.id)}`, "GET")
      expect(sessions.status).toBe(200)
      expect(JSON.parse(sessions.body)).toEqual([])
      const history = await transport.request("/api/ai/sessions/ses_unknown/messages", "GET")
      expect(history.status).toBe(400)

      // The same two routes through the phone's own client: the conversation list of a project, and the
      // stored history of a conversation (an unknown one is refused, not unrouted).
      expect(await phone.sessions(project.id)).toEqual([])
      const refusedHistory = await phone.sessionMessages("ses_unknown").then(() => 200, (error: { status?: number }) => error.status ?? 0)
      expect(refusedHistory).toBeGreaterThanOrEqual(400)
      expect([403, 404, 405]).not.toContain(refusedHistory)

      // Workspace previews answer conditionally through the gateway: the tag survives the hop and a match is a 304.
      const previewPath = `/api/projects/${project.id}/workspace/drawings/${drawing.id}/preview`
      const tagged = await pinned(`${pairing.baseUrl}${previewPath}`, { headers: { authorization: `Bearer ${pairing.token}` } })
      const tag = tagged.headers.get("etag")
      expect(tag).toBeTruthy()
      await tagged.arrayBuffer()
      expect((await pinned(`${pairing.baseUrl}${previewPath}`, { headers: { authorization: `Bearer ${pairing.token}`, "if-none-match": tag! } })).status).toBe(304)

      // The live activity stream opens through the gateway.
      const live = new AbortController()
      const events = phone.events(project.id, live.signal)[Symbol.asyncIterator]()
      const first = await Promise.race([events.next().then(() => "frame"), new Promise<string>((resolve) => setTimeout(() => resolve("open"), 1_500))])
      expect(["frame", "open"]).toContain(first)
      live.abort()

      // Session routes exist and refuse what is not the phone's: a 4xx from the handler, never 403 (gateway) or 404/405 (no route).
      const refused = async (run: () => Promise<unknown>) => run().then(() => 200, (error: { status?: number }) => error.status ?? 0)
      for (const status of [
        await refused(() => phone.sessionState("ses_unknown")),
        await refused(async () => { for await (const _ of phone.sessionStream("ses_unknown", undefined, AbortSignal.timeout(3_000))) break }),
      ]) {
        expect(status).toBeGreaterThanOrEqual(400)
        expect([403, 404, 405]).not.toContain(status)
      }
    } finally {
      child.kill("SIGTERM")
      await child.exited
      rmSync(dataDir, { recursive: true, force: true })
    }
  }, 60_000)
})
