import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import JSZip from "jszip"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const manifest = (over: Record<string, unknown> = {}) => ({
  id: "hello-plugin", name: "Hello", version: "1.0.0", description: "d", author: "a", main: "dist/main.js",
  engines: { cadcam: "^1.0.0" }, permissions: ["model:read"], ...over
})

async function zipOf(files: Record<string, string>) {
  const zip = new JSZip()
  for (const [name, content] of Object.entries(files)) zip.file(name, content)
  return zip.generateAsync({ type: "uint8array" })
}

async function install(files: Record<string, string>, auth = true) {
  const form = new FormData()
  form.set("file", new File([await zipOf(files) as BlobPart], "plugin.zip", { type: "application/zip" }))
  return app.call("/api/plugins/install", { method: "POST", body: form, auth })
}

const JS = "export function activate() { return {} }"

describe("/api/plugins", () => {
  test("every route requires the launch token", async () => {
    expect((await app.call("/api/plugins", { auth: false })).status).toBe(401)
    expect((await install({}, false)).status).toBe(401)
  })

  test("starts empty", async () => {
    const r = await app.call("/api/plugins")
    expect(r.status).toBe(200)
    expect(r.body).toEqual([])
  })

  test("install rejects archives without a usable manifest", async () => {
    const none = await install({ "readme.txt": "x" })
    expect(none.status).toBe(400)
    expect(none.body.error).toContain("manifest.json not found")
    const missing = await install({ "manifest.json": JSON.stringify({ id: "x" }) })
    expect(missing.status).toBe(400)
    expect(missing.body.error).toContain("missing required fields (id, version, main)")
    const invalid = await install({ "manifest.json": JSON.stringify(manifest({ id: "Bad Id", version: "1.0" })), "dist/main.js": JS })
    expect(invalid.status).toBe(400)
    expect(invalid.body.error).toStartWith("Invalid plugin manifest:")
  })

  test("install, list, get, serve, bootstrap, config, enable/disable, update, uninstall", async () => {
    const files = { "manifest.json": JSON.stringify(manifest()), "dist/main.js": JS, "assets/logo.svg": "<svg/>" }
    const created = await install(files)
    expect(created.status).toBe(201)
    expect(created.body.message).toBe("Plugin Hello (v1.0.0) installed successfully.")
    expect(created.body.plugin).toMatchObject({ id: "hello-plugin", state: "installed", enabled: false, version: "1.0.0", errorCount: 0 })

    expect((await install(files)).status).toBe(409)
    expect((await app.call("/api/plugins")).body).toHaveLength(1)
    expect((await app.call("/api/plugins/hello-plugin")).body.manifest.name).toBe("Hello")
    expect((await app.call("/api/plugins/nope")).status).toBe(404)

    const served = await app.call("/api/plugins/serve?id=hello-plugin&file=dist/main.js")
    expect(served.status).toBe(200)
    expect(served.headers.get("content-type")).toContain("application/javascript")
    expect(served.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
    expect(new TextDecoder().decode(served.bytes)).toBe(JS)
    expect((await app.call("/api/plugins/serve?id=hello-plugin&file=assets/logo.svg")).headers.get("content-type")).toBe("image/svg+xml")
    expect((await app.call("/api/plugins/serve?id=hello-plugin&file=missing.js")).status).toBe(404)
    // Leading `../` segments are stripped (as in the legacy route), so nothing outside the plugin is reachable.
    expect((await app.call("/api/plugins/serve?id=hello-plugin&file=..%2F..%2Fsecret.txt")).status).toBe(404)
    expect((await app.call("/api/plugins/serve?id=hello-plugin&file=a..b")).status).toBe(400)

    const boot = await app.call("/api/plugins/bootstrap.js?id=hello-plugin")
    expect(boot.status).toBe(200)
    expect(boot.headers.get("content-type")).toBe("application/javascript; charset=utf-8")
    expect(boot.headers.get("cache-control")).toBe("private, no-store")
    expect(boot.body).toContain('const pluginCodeUrl = "/api/plugins/serve?id=hello-plugin&file=dist%2Fmain.js"')
    expect((await app.call("/api/plugins/bootstrap.js?id=ghost")).status).toBe(404)

    expect((await app.call("/api/plugins/hello-plugin/config")).body).toEqual({})
    const saved = await app.call("/api/plugins/hello-plugin/config", { method: "PUT", json: { speed: 3 } })
    expect(saved.body).toEqual({ message: "Configuration updated successfully." })
    expect((await app.call("/api/plugins/hello-plugin/config", { method: "POST", json: { speed: 4 } })).status).toBe(200)
    expect((await app.call("/api/plugins/hello-plugin/config")).body).toEqual({ speed: 4 })
    expect((await app.call("/api/plugins/ghost/config", { method: "PUT", json: {} })).status).toBe(404)

    expect((await app.call("/api/plugins/hello-plugin/enable", { method: "POST" })).body).toEqual({ message: "Plugin hello-plugin enabled successfully." })
    expect((await app.call("/api/plugins/hello-plugin")).body).toMatchObject({ enabled: true, state: "enabled" })
    expect((await app.call("/api/plugins/hello-plugin/disable", { method: "POST" })).body).toEqual({ message: "Plugin hello-plugin disabled successfully." })
    expect((await app.call("/api/plugins/ghost/enable", { method: "POST" })).status).toBe(404)

    const badUpdate = await app.call("/api/plugins/hello-plugin/update", { method: "PATCH", json: { manifest: manifest({ version: "x" }) } })
    expect(badUpdate.status).toBe(400)
    expect(badUpdate.body.error).toBe("Invalid manifest data provided.")
    expect(badUpdate.body.details.length).toBeGreaterThan(0)
    const updated = await app.call("/api/plugins/hello-plugin/update", { method: "PUT", json: { manifest: manifest({ version: "1.1.0" }), config: { speed: 9 } } })
    expect(updated.status).toBe(200)
    expect(updated.body).toMatchObject({ version: "1.1.0", enabled: false, state: "installed" })
    expect((await app.call("/api/plugins/hello-plugin/config")).body).toEqual({ speed: 9 })

    const gone = await app.call("/api/plugins/hello-plugin", { method: "DELETE" })
    expect(gone.body).toEqual({ message: "Plugin hello-plugin uninstalled successfully." })
    expect((await app.call("/api/plugins/hello-plugin")).status).toBe(404)
    expect((await app.call("/api/plugins/serve?id=hello-plugin&file=dist/main.js")).status).toBe(404)
  })

  test("a nested archive folder is accepted and dependencies are enforced", async () => {
    const dep = await install({
      "pkg/manifest.json": JSON.stringify(manifest({ id: "needs-dep", dependencies: { base: "^1.0.0" } })), "pkg/dist/main.js": JS
    })
    expect(dep.status).toBe(400)
    expect(dep.body.error).toBe("Missing dependency: base (^1.0.0)")
    const base = await install({ "pkg/manifest.json": JSON.stringify(manifest({ id: "base" })), "pkg/dist/main.js": JS })
    expect(base.status).toBe(201)
    expect((await app.call("/api/plugins/serve?id=base&file=dist/main.js")).status).toBe(200)
    expect((await install({ "manifest.json": JSON.stringify(manifest({ id: "needs-dep", dependencies: { base: "^1.0.0" } })), "dist/main.js": JS })).status).toBe(201)
    const blocked = await app.call("/api/plugins/base", { method: "DELETE" })
    expect(blocked.status).toBe(500)
    expect(blocked.body.error).toBe("Cannot uninstall plugin base because it is required by: needs-dep")
  })
})

describe("/api/plugins/registry", () => {
  test("is empty without a registry folder", async () => {
    expect((await app.call("/api/plugins/registry")).body).toEqual([])
    expect((await app.call("/api/plugins/registry/search?q=x")).body).toEqual([])
    expect((await app.call("/api/plugins/registry/search?q=%20")).status).toBe(400)
    expect((await app.call("/api/plugins/registry/nothing")).status).toBe(404)
  })

  test("lists, fetches and searches manifests found on disk", async () => {
    const dir = join(app.dataDir, "plugins-registry", "gear-tools")
    mkdirSync(dir, { recursive: true })
    const entry = {
      id: "gear-tools", name: "Gear Tools", version: "1.0.0", description: "Involute gears", author: "ACME",
      entryPoint: "main.js", dependencies: {}, permissions: [], extensionPoints: [], minAppVersion: "1.0.0"
    }
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(entry))
    expect((await app.call("/api/plugins/registry")).body).toEqual([entry])
    expect((await app.call("/api/plugins/registry/gear-tools")).body).toEqual(entry)
    expect((await app.call("/api/plugins/registry/search?q=INVOLUTE")).body).toEqual([entry])
    expect((await app.call("/api/plugins/registry/search?q=zzz")).body).toEqual([])
  })
})
