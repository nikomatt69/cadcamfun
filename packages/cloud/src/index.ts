import { boundedBody } from "./checkpoint-protocol.ts"
import { verifyCloudIdentity } from "./owner.ts"
import { CloudWorkspace, type CloudEnv } from "./workspace.ts"

export { CloudWorkspace }

/** Authentication runs before starting compute; private checkpoint requests never enter the public application API. */
export const handleCloudRequest = async (request: Request, env: CloudEnv): Promise<Response> => {
  const url = new URL(request.url)
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(env.WORKSPACE_ID)) return new Response(null, { status: 503 })
  const workspace = env.WORKSPACE.getByName(env.WORKSPACE_ID)
  if (url.pathname.startsWith("/__cadcamfun/state/")) return workspace.fetch(request)
  if (request.method === "GET" && url.pathname === "/api/cloud/info") {
    return Response.json({ workspaceId: env.WORKSPACE_ID, name: "CADCAMFUN Cloud", requiresSetup: await workspace.owner() === null }, { headers: { "cache-control": "no-store" } })
  }
  if (!url.pathname.startsWith("/api/")) return new Response(null, { status: 404 })
  let principal
  try { principal = await verifyCloudIdentity(request, env.IDENTITY_ISSUER) }
  catch { return Response.json({ message: "Sign in to your CADCAMFUN account to use this workspace" }, { status: 401 }) }
  let setupCode: string | undefined
  let body: string | undefined
  if (url.pathname === "/api/cloud/enroll") {
    if (request.method !== "POST") return new Response(null, { status: 405 })
    try {
      const input: unknown = JSON.parse(new TextDecoder().decode(await boundedBody(request, 8192)))
      if (typeof input !== "object" || input === null || !("name" in input) || typeof input.name !== "string" || !input.name.trim() || input.name.length > 100) throw new Error("Invalid device name")
      if ("setupCode" in input && input.setupCode !== undefined) {
        if (typeof input.setupCode !== "string" || input.setupCode.length > 512) throw new Error("Invalid setup code")
        setupCode = input.setupCode
      }
      body = JSON.stringify({ name: input.name.trim() })
    } catch { return Response.json({ message: "Enter a device name and a valid setup code" }, { status: 400 }) }
  }
  if (!await workspace.authorize(principal, setupCode)) return Response.json({ message: "This account does not own this cloud workspace, or its setup code is required" }, { status: 403 })
  const headers = new Headers(request.headers)
  headers.delete("x-cadcamfun-cloud-internal")
  headers.delete("x-cadcamfun-companion-device")
  headers.delete("x-session-token")
  headers.delete("cookie")
  headers.delete("content-length")
  headers.set("x-cadcamfun-cloud-subject", principal.subject)
  if (body !== undefined) headers.set("content-type", "application/json")
  return workspace.fetch(new Request(request.url, { method: request.method, headers, body: body ?? request.body, signal: request.signal, redirect: "error" }))
}

export default { fetch: handleCloudRequest } satisfies ExportedHandler<CloudEnv>
