import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

describe("CORS for the Tauri webview", () => {
  test("a preflight from the webview origin is answered without the token", async () => {
    const r = await app.call("/api/projects", {
      method: "OPTIONS", auth: false,
      headers: { origin: "tauri://localhost", "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type,traceparent" }
    })
    expect(r.status).toBe(204)
    expect(r.headers.get("access-control-allow-origin")).toBe("tauri://localhost")
    expect(r.headers.get("access-control-allow-headers")).toContain("traceparent")
  })

  test("authorized responses carry the origin header; unknown origins get none", async () => {
    const ok = await app.call("/api/plugins", { headers: { origin: "http://tauri.localhost" } })
    expect(ok.status).toBe(200)
    expect(ok.headers.get("access-control-allow-origin")).toBe("http://tauri.localhost")
    const dev = await app.call("/api/plugins", { headers: { origin: "http://localhost:1421" } })
    expect(dev.headers.get("access-control-allow-origin")).toBe("http://localhost:1421")
    const other = await app.call("/api/plugins", { headers: { origin: "https://evil.example" } })
    expect(other.headers.get("access-control-allow-origin")).toBeNull()
  })

  test("a request without the token is still refused", async () => {
    const r = await app.call("/api/plugins", { auth: false, headers: { origin: "tauri://localhost" } })
    expect(r.status).toBe(401)
    expect(r.headers.get("access-control-allow-origin")).toBe("tauri://localhost")
  })
})
