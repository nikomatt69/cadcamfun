import { expect } from "bun:test"
import { saveIdentitySession } from "../../src/app/identity-session.ts"
import { clientLayer, readClient, runtimeForLayer } from "../../src/app/client.ts"

await saveIdentitySession({ issuer: "https://auth.example.test", tokens: { access: "account-token", refresh: "refresh-token", expiresAt: Date.now() + 600_000 } })
const seen: Array<{ path: string; identity: string | null; authorization: string | null }> = []
const transport = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init)
  seen.push({ path: new URL(request.url).pathname, identity: request.headers.get("x-identity-token"), authorization: request.headers.get("authorization") })
  return Response.json(seen.length === 1 ? { configured: true, origin: "https://cloud.example.test", workspaceId: "personal", deviceId: "desktop" } : [])
}, { preconnect: fetch.preconnect })
const runtime = runtimeForLayer(clientLayer({ baseUrl: "http://127.0.0.1:1234", token: "launch-token" }, transport))
try {
  const client = await readClient(runtime)
  await runtime.run(client.cloud.enroll({ payload: { origin: "https://cloud.example.test", name: "Desktop" } }))
  await runtime.run(client.projects.list())
  expect(seen).toEqual([
    { path: "/api/cloud/enroll", identity: "account-token", authorization: "Bearer launch-token" },
    { path: "/api/projects", identity: null, authorization: "Bearer launch-token" },
  ])
} finally { runtime.dispose() }
