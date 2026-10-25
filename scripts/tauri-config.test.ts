import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const root = join(import.meta.dir, "..")
const native = join(root, "apps/desktop/src-tauri")
const source = join(root, "apps/desktop/src")
const text = (path: string): string => readFileSync(path, "utf8")
const config = JSON.parse(text(join(native, "tauri.conf.json"))) as {
  app: { withGlobalTauri: boolean; security: { capabilities: string[]; csp: string; devCsp: string; freezePrototype: boolean } }
  bundle: { externalBin: string[]; fileAssociations: { ext: string[] }[] }
}
interface Capability {
  readonly $schema: string
  readonly identifier: string
  readonly windows: string[]
  readonly remote?: unknown
  readonly permissions: (string | { identifier: string })[]
}
const capabilities = readdirSync(join(native, "capabilities"))
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(text(join(native, "capabilities", name))) as Capability)
const permissionIds = (capability: Capability): string[] => capability.permissions.map((p) => typeof p === "string" ? p : p.identifier)
const main = capabilities.find((c) => c.identifier === "main")
const permissions = capabilities.flatMap(permissionIds)
const files = [...new Bun.Glob("**/*.{ts,tsx}").scanSync({ cwd: source })]
const frontend = files.map((name) => text(join(source, name))).join("\n")

describe("Tauri native boundary configuration", () => {
  test("only named local capabilities reach the main webview", () => {
    expect(config.app.withGlobalTauri).toBe(false)
    expect(main).toBeDefined()
    const declared = capabilities.map((c) => c.identifier)
    for (const id of config.app.security.capabilities) expect(declared).toContain(id)
    for (const capability of capabilities) {
      expect(capability.$schema).toBe("../gen/schemas/desktop-schema.json")
      expect(capability.windows).toEqual(["main"])
      expect(capability.remote).toBeUndefined()
      expect(new Set(permissionIds(capability)).size).toBe(capability.permissions.length)
    }
  })

  test("every custom command is registered, implemented and explicitly granted", () => {
    const build = text(join(native, "build.rs"))
    const manifest = /const COMMANDS:[\s\S]*?=\s*&\[([\s\S]*?)\];/.exec(build)?.[1]
    expect(manifest).toBeDefined()
    const commands = [...(manifest ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]!)
    const lib = text(join(native, "src/lib.rs"))
    const handler = /generate_handler!\[([\s\S]*?)\]/.exec(lib)?.[1] ?? ""
    const registered = [...handler.matchAll(/commands::([a-z_]+)/g)].map((m) => m[1]!)
    const implementation = text(join(native, "src/commands.rs"))
    const implemented = [...implementation.matchAll(/#\[tauri::command\]\s*pub (?:async )?fn ([a-z_]+)/g)].map((m) => m[1]!)
    expect(commands.length).toBeGreaterThan(0)
    expect([...registered].sort()).toEqual([...commands].sort())
    expect([...implemented].sort()).toEqual([...commands].sort())
    const granted = permissions.filter((id) => id.startsWith("allow-"))
    expect([...granted].sort()).toEqual(commands.map((command) => `allow-${command.replaceAll("_", "-")}`).sort())
  })

  test("file access stays in guarded native commands and shell spawning stays native", () => {
    for (const plugin of ["fs", "dialog"]) {
      const granted = permissions.filter((id) => id.startsWith(`${plugin}:`))
      const used = frontend.includes(`@tauri-apps/plugin-${plugin}`) || frontend.includes(`plugin:${plugin}|`)
      if (!used) expect(granted).toEqual([])
    }
    expect(permissions).not.toContain("fs:default")
    for (const id of ["shell:allow-spawn", "shell:allow-execute", "shell:allow-stdin-write", "shell:allow-kill"]) expect(permissions).not.toContain(id)
    expect(permissions).toContain("allow-save-file")
    expect(permissions).toContain("allow-read-opened-file")
    expect(permissions).toContain("allow-take-opened-files")
    expect(config.bundle.externalBin).toContain("binaries/sidecar")
    expect(config.bundle.fileAssociations.flatMap((association) => association.ext).sort()).toEqual(["cadcam", "gcode", "nc"])
  })

  test("clipboard grants only the text write used by copy buttons", () => {
    expect(permissions.filter((id) => id.startsWith("clipboard-manager:"))).toEqual(["clipboard-manager:allow-write-text"])
    expect(frontend.includes("@tauri-apps/plugin-clipboard-manager")).toBe(true)
  })

  test("the initialization-only reload guard has no frontend permission surface", () => {
    expect(permissions.filter((id) => id.startsWith("prevent-default:"))).toEqual([])
  })

  test("notification access is limited to permission checks, consent and delivery", () => {
    expect(permissions.filter((id) => id.startsWith("notification:"))).toEqual([
      "notification:allow-is-permission-granted",
      "notification:allow-request-permission",
      "notification:allow-notify"
    ])
  })

  test("CSP blocks embedded objects and remote connections while preserving local runtime features", () => {
    const directives = (policy: string): Map<string, string[]> => new Map(policy.split(";").map((part) => part.trim().split(/\s+/)).filter(([key]) => key).map(([key, ...values]) => [key!, values]))
    for (const policy of [config.app.security.csp, config.app.security.devCsp]) {
      const parsed = directives(policy)
      expect(parsed.get("object-src")).toEqual(["'none'"])
      expect(parsed.get("base-uri")).toEqual(["'self'"])
      expect(parsed.get("form-action")).toEqual(["'self'"])
      expect(parsed.get("frame-ancestors")).toEqual(["'none'"])
      expect(parsed.get("worker-src")).toContain("blob:")
      expect(parsed.get("script-src")).toContain("'unsafe-eval'")
      expect(parsed.get("connect-src")).toContain("http://127.0.0.1:*")
      for (const origin of parsed.get("connect-src") ?? []) {
        expect(["'self'", "http://127.0.0.1:*", "ipc:", "http://ipc.localhost", "ws://localhost:*", "http://localhost:*"]).toContain(origin)
      }
    }
    expect(directives(config.app.security.csp).get("script-src")).toContain("'wasm-unsafe-eval'")
    expect(config.app.security.freezePrototype).toBe(false)
  })

  test("App Store configuration excludes the optional private-API material", () => {
    const appStore = JSON.parse(text(join(native, "tauri.appstore.conf.json"))) as { app: { macOSPrivateApi: boolean; security: { capabilities: string[] }; windows: { transparent: boolean }[] } }
    expect(appStore.app.macOSPrivateApi).toBe(false)
    expect(appStore.app.security.capabilities).toEqual(["main"])
    expect(appStore.app.windows.every((window) => !window.transparent)).toBe(true)
  })
})
