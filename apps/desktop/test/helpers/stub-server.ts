/**
 * Boots a real sidecar-shaped HTTP server in-process (Bun) so the *real* typed
 * `ApiClient` can be exercised: `HttpApiClient` over `fetch`, decoded by the
 * endpoint Schemas. Component tests use the in-memory fake; this proves the live path.
 */
import { Api } from "@cadcamfun/api"
import type { Endpoint } from "../../src/app/sidecar.ts"

export interface StubServer {
  readonly endpoint: Endpoint
  /** Requests the stub saw, as `"METHOD /path"`; handy for asserting the bearer header. */
  readonly requests: () => ReadonlyArray<{ readonly line: string; readonly auth: string | undefined }>
  close(): Promise<void>
}

const project = (id: string, name: string) => ({
  id,
  name,
  description: null,
  createdAt: "2026-01-01T12:00:00.000Z",
  updatedAt: "2026-01-01T12:00:00.000Z",
  ownerId: "user-local",
  organizationId: null,
  isPublic: false,
  owner: { id: "user-local", name: "Local profile", email: null },
  organization: null,
  _count: { drawings: 0, components: 0 }
})

/**
 * Serves the handful of endpoints the boot sequence and the shell status bar touch.
 * Anything else answers 404 with the API's `{ message }` shape.
 */
export const startStubApi = async (options: { readonly token?: string } = {}): Promise<StubServer> => {
  const token = options.token ?? "stub-token"
  const seen: Array<{ line: string; auth: string | undefined }> = []
  const projects = [project("p-1", "Bracket"), project("p-2", "Enclosure")]

  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      const line = `${request.method} ${url.pathname}`
      seen.push({ line, auth: request.headers.get("authorization") ?? undefined })
      // `Api` adds `HealthGroup` *without* `Authorization`, so /health is public; every
      // other group is behind the bearer middleware (packages/api/src/index.ts).
      if (url.pathname === "/api/health") {
        return Response.json({ status: "ok", timestamp: new Date().toISOString() })
      }
      if (request.headers.get("authorization") !== `Bearer ${token}`) {
        return Response.json({ _tag: "Unauthorized", message: "unauthorized" }, { status: 401 })
      }
      if (url.pathname === "/api/projects" && request.method === "GET") {
        return Response.json(projects)
      }
      if (url.pathname === "/api/projects" && request.method === "POST") {
        return Response.json(project("p-3", "Created"), { status: 201 })
      }
      if (url.pathname.startsWith("/api/projects/")) {
        const id = url.pathname.slice("/api/projects/".length)
        const found = projects.find((p) => p.id === id)
        if (found === undefined) return Response.json({ _tag: "NotFound", message: "not found" }, { status: 404 })
        if (request.method === "DELETE") return Response.json({ message: "deleted" })
        return Response.json(found)
      }
      return Response.json({ _tag: "NotFound", message: `no stub for ${line}` }, { status: 404 })
    }
  })

  void Api // the stub mirrors `Api`; importing it keeps this file honest about the contract
  return {
    endpoint: { baseUrl: `http://127.0.0.1:${server.port}`, token },
    requests: () => [...seen],
    close: async () => {
      await server.stop(true)
    }
  }
}
