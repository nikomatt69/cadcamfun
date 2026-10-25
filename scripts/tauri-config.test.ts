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
    const registered = [...handler.matchAll(/(?:commands|power)::([a-z_]+)/g)].map((m) => m[1]!)
    const implementation = ["commands.rs", "power.rs"].map((name) => text(join(native, "src", name))).join("\n")
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
    expect(permissions.some((id) => id.startsWith("fs:") || id.startsWith("dialog:"))).toBe(false)
    expect(permissions).not.toContain("window-state:default")
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
    expect(frontend).toMatch(/new Function\s*\(/)
    expect(directives(config.app.security.csp).get("script-src")).toContain("'unsafe-eval'")
    expect(config.app.security.freezePrototype).toBe(false)
  })

  test("App Store configuration excludes the optional private-API material", () => {
    const appStore = JSON.parse(text(join(native, "tauri.appstore.conf.json"))) as { app: { macOSPrivateApi: boolean; security: { capabilities: string[] }; windows: { transparent: boolean }[] } }
    expect(appStore.app.macOSPrivateApi).toBe(false)
    expect(appStore.app.security.capabilities).toEqual(["main"])
    expect(appStore.app.windows.every((window) => !window.transparent)).toBe(true)
  })
})

// ──────────────────────── least-privilege lint (spec 56 §3 G, §10) ────────────────────────
// `lintNativeShell` is a pure function of the files below, so every rule is also run against a deliberately broken copy of the tree:
// a rule that stops detecting its violation fails its own fixture test.

interface Tree {
  readonly buildRs: string
  readonly libRs: string
  readonly rustSources: string
  readonly cargoToml: string
  readonly cargoLock: string
  readonly denyToml: string
  readonly capabilities: ReadonlyMap<string, readonly string[]>
  /** Webview sources (tests excluded) and the guest-js helpers the webview imports, by path. */
  readonly callers: ReadonlyMap<string, string>
}

/** Commands the shell implements that no webview code invokes yet. A new command without a caller is a violation; so is a stale entry here. */
const PENDING_CALLER: Readonly<Record<string, string>> = {
  pick_file: "native open dialog: the import dialogs still use the browser file input",
  secret_delete: "GitHub token sign-out is not wired to the keyring yet",
  set_recent_projects: "the tray's recent-projects submenu waits for the webview push (shared/state/recents.ts)",
}

/** Permission → the webview code that justifies it. A grant that is not here, or whose evidence is gone, is a violation. */
const CALLER_EVIDENCE: Readonly<Record<string, RegExp>> = {
  "core:default": /@tauri-apps\/api\/(core|event|window)/,
  "core:window:allow-destroy": /\.destroy\(/,
  "log:default": /@tauri-apps\/plugin-log/,
  "notification:allow-is-permission-granted": /@tauri-apps\/plugin-notification/,
  "notification:allow-request-permission": /@tauri-apps\/plugin-notification/,
  "notification:allow-notify": /@tauri-apps\/plugin-notification/,
  "shell:allow-open": /@tauri-apps\/plugin-shell/,
  "core:window:allow-set-progress-bar": /\.setProgressBar\(/,
  "clipboard-manager:allow-write-text": /@tauri-apps\/plugin-clipboard-manager/,
  "liquid-glass:default": /tauri-plugin-liquid-glass-api/,
}

/** Plugins the shell registers for Rust only: no capability may grant the webview anything from them. */
const RUST_ONLY_PLUGINS: Readonly<Record<string, string>> = {
  dialog: "save/open dialogs run in the guarded native commands",
  opener: "reveals completed exports from updater.rs; the webview opens links through plugin-shell",
  updater: "driven by the update commands",
  os: "the webview only calls platform(), which reads a global injected at init and sends no IPC (plugin-os dist-js)",
  "window-state": "restores geometry in Rust",
  "single-instance": "forwards second launches in Rust",
  "prevent-default": "injects a script; it has no IPC surface",
}

/** Permission pairs that grant the same capability twice. */
const OVERLAPPING: readonly (readonly [RegExp, RegExp, string])[] = [
  [/^shell:allow-open$/, /^opener:(default|allow-open-url|allow-default-urls)$/, "URL opening is granted through both plugin-shell and plugin-opener"],
]

const lockPackages = (lock: string): Map<string, string[]> => new Map(lock.split("[[package]]").slice(1).map((block) => {
  const name = /^name = "([^"]+)"/m.exec(block)?.[1] ?? ""
  const dependencies = /^dependencies = \[([\s\S]*?)\]/m.exec(block)?.[1] ?? ""
  return [name, [...dependencies.matchAll(/"([^"\s]+)/g)].map((m) => m[1]!)] as const
}))

function lintNativeShell(tree: Tree): string[] {
  const problems: string[] = []
  const commands = [...(/const COMMANDS:[\s\S]*?=\s*&\[([\s\S]*?)\];/.exec(tree.buildRs)?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]!)
  const registered = [...(/generate_handler!\[([\s\S]*?)\]/.exec(tree.libRs)?.[1] ?? "").matchAll(/(?:commands|power)::([a-z_]+)/g)].map((m) => m[1]!)
  const granted = [...tree.capabilities.values()].flat()
  for (const command of commands) {
    if (!registered.includes(command)) problems.push(`command ${command} is in build.rs but missing from generate_handler!`)
    if (!granted.includes(`allow-${command.replaceAll("_", "-")}`)) problems.push(`command ${command} is in build.rs but no capability grants allow-${command.replaceAll("_", "-")}`)
  }
  for (const command of registered) if (!commands.includes(command)) problems.push(`generate_handler! lists ${command}, which build.rs does not declare`)

  const sources = [...tree.callers.values()]
  const invoked = (command: string): boolean => sources.some((source) => new RegExp(`["'\`]${command}["'\`]`).test(source))
  for (const command of commands) {
    if (!invoked(command) && !(command in PENDING_CALLER)) problems.push(`command ${command} has no webview caller (call it, or list it in PENDING_CALLER with a reason)`)
    if (invoked(command) && command in PENDING_CALLER) problems.push(`command ${command} now has a caller: remove it from PENDING_CALLER`)
  }
  for (const grant of granted.filter((id) => id.startsWith("allow-"))) {
    if (!commands.includes(grant.slice("allow-".length).replaceAll("-", "_"))) problems.push(`capability grants ${grant}, which matches no build.rs command`)
  }

  const everything = sources.join("\n")
  for (const grant of granted.filter((id) => !id.startsWith("allow-"))) {
    const evidence = CALLER_EVIDENCE[grant]
    if (evidence === undefined) problems.push(`permission ${grant} has no caller rule: add it to CALLER_EVIDENCE once the webview uses it`)
    else if (!evidence.test(everything)) problems.push(`permission ${grant} has no caller in the webview`)
  }

  const seen = new Set<string>()
  for (const [file, ids] of tree.capabilities) for (const id of ids) {
    if (seen.has(id)) problems.push(`permission ${id} is granted more than once (again in ${file})`)
    seen.add(id)
  }
  for (const id of seen) if (/^core:[a-z]+:default$/.test(id) && seen.has("core:default")) problems.push(`${id} is already part of core:default`)
  for (const [first, second, why] of OVERLAPPING) if ([...seen].some((id) => first.test(id)) && [...seen].some((id) => second.test(id))) problems.push(why)

  const manifest = Bun.TOML.parse(tree.cargoToml) as { dependencies?: Record<string, unknown>; target?: Record<string, { dependencies?: Record<string, unknown> }> }
  const dependencies = new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.values(manifest.target ?? {}).flatMap((target) => Object.keys(target.dependencies ?? {}))])
  for (const dependency of dependencies) {
    const identifier = dependency.replaceAll("-", "_")
    if (!tree.rustSources.includes(`${identifier}::`) && !tree.rustSources.includes(`${identifier}!`)) problems.push(`dependency ${dependency} is not used by any Rust source`)
  }
  const plugins = [...dependencies].filter((name) => name.startsWith("tauri-plugin-")).map((name) => name.slice("tauri-plugin-".length))
  for (const plugin of plugins) {
    const grants = [...seen].filter((id) => id.startsWith(`${plugin}:`))
    if (grants.length === 0 && !(plugin in RUST_ONLY_PLUGINS)) problems.push(`tauri-plugin-${plugin} has no capability and is not listed in RUST_ONLY_PLUGINS`)
    if (grants.length > 0 && plugin in RUST_ONLY_PLUGINS) problems.push(`tauri-plugin-${plugin} is listed as Rust-only but a capability grants ${grants.join(", ")}`)
  }
  for (const id of seen) {
    const plugin = /^([a-z-]+):/.exec(id)?.[1]
    if (plugin !== undefined && plugin !== "core" && !plugins.includes(plugin)) problems.push(`permission ${id} belongs to a plugin that Cargo.toml does not depend on`)
  }

  const deny = Bun.TOML.parse(tree.denyToml) as { bans?: { deny?: { crate: string; wrappers?: string[] }[] } }
  const locked = lockPackages(tree.cargoLock)
  for (const banned of deny.bans?.deny ?? []) {
    const users = [...locked].filter(([, dependencies]) => dependencies.includes(banned.crate)).map(([name]) => name)
    if (locked.has(banned.crate) && users.some((user) => !(banned.wrappers ?? []).includes(user))) problems.push(`Cargo.lock contains banned crate ${banned.crate}, used by ${users.join(", ")}`)
  }
  return problems
}

const rustSources = readdirSync(join(native, "src")).filter((name) => name.endsWith(".rs")).map((name) => text(join(native, "src", name))).join("\n")
const guestJs = readdirSync(join(native, "guest-js")).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts")).map((name) => [join("guest-js", name), text(join(native, "guest-js", name))] as const)
const realTree: Tree = {
  buildRs: text(join(native, "build.rs")),
  libRs: text(join(native, "src/lib.rs")),
  rustSources,
  cargoToml: text(join(native, "Cargo.toml")),
  cargoLock: text(join(native, "Cargo.lock")),
  denyToml: text(join(native, "deny.toml")),
  capabilities: new Map(readdirSync(join(native, "capabilities")).filter((name) => name.endsWith(".json")).map((name) => [name, permissionIds(JSON.parse(text(join(native, "capabilities", name))) as Capability)] as const)),
  callers: new Map([...files.filter((name) => !/\.test\.tsx?$/.test(name)).map((name) => [name, text(join(source, name))] as const), ...guestJs]),
}
const capabilityWith = (extra: string[], file = "main.json"): Tree => ({
  ...realTree,
  capabilities: new Map([...realTree.capabilities, [file, [...(file === "main.json" ? realTree.capabilities.get("main.json") ?? [] : []), ...extra]]]),
})

describe("Tauri least-privilege lint", () => {
  test("the shipped tree has no violations", () => {
    expect(lintNativeShell(realTree)).toEqual([])
  })

  test("a command declared in build.rs without its permission, or missing from generate_handler!, is reported", () => {
    const withCommand = (name: string): Tree => ({ ...realTree, buildRs: realTree.buildRs.replace('"get_logs_dir",', `"get_logs_dir",\n    "${name}",`) })
    const problems = lintNativeShell(withCommand("frobnicate"))
    expect(problems).toContain("command frobnicate is in build.rs but missing from generate_handler!")
    expect(problems).toContain("command frobnicate is in build.rs but no capability grants allow-frobnicate")
    expect(lintNativeShell({ ...realTree, libRs: realTree.libRs.replace("commands::get_logs_dir,", "") })).toContain("command get_logs_dir is in build.rs but missing from generate_handler!")
  })

  test("a grant for a command that does not exist, and a new command nobody calls, are reported", () => {
    expect(lintNativeShell(capabilityWith(["allow-ghost-command"]))).toContain("capability grants allow-ghost-command, which matches no build.rs command")
    const orphan = { ...realTree, callers: new Map([...realTree.callers].map(([name, body]) => [name, body.replaceAll('"get_logs_dir"', '"renamed"')] as const)) }
    expect(lintNativeShell(orphan)).toContain("command get_logs_dir has no webview caller (call it, or list it in PENDING_CALLER with a reason)")
  })

  test("a pending-caller entry that gained a caller must be removed from the list", () => {
    const wired = { ...realTree, callers: new Map([...realTree.callers, ["new.ts", 'invoke("pick_file")'] as const]) }
    expect(lintNativeShell(wired)).toContain("command pick_file now has a caller: remove it from PENDING_CALLER")
  })

  test("a plugin permission nothing calls, or that has no rule, is reported", () => {
    expect(lintNativeShell(capabilityWith(["os:default"]))).toContain("permission os:default has no caller rule: add it to CALLER_EVIDENCE once the webview uses it")
    const silent = { ...realTree, callers: new Map([...realTree.callers].map(([name, body]) => [name, body.replaceAll("@tauri-apps/plugin-shell", "@tauri-apps/plugin-gone")] as const)) }
    expect(lintNativeShell(silent)).toContain("permission shell:allow-open has no caller in the webview")
  })

  test("duplicate and overlapping grants are reported", () => {
    expect(lintNativeShell(capabilityWith(["log:default"], "second.json"))).toContain("permission log:default is granted more than once (again in second.json)")
    expect(lintNativeShell(capabilityWith(["core:path:default"]))).toContain("core:path:default is already part of core:default")
    expect(lintNativeShell(capabilityWith(["opener:allow-open-url"]))).toContain("URL opening is granted through both plugin-shell and plugin-opener")
  })

  test("a Rust-only plugin that gains a webview grant, or a plugin nothing uses, is reported", () => {
    expect(lintNativeShell(capabilityWith(["dialog:allow-open"]))).toContain("tauri-plugin-dialog is listed as Rust-only but a capability grants dialog:allow-open")
    expect(lintNativeShell(capabilityWith(["fs:allow-read-file"]))).toContain("permission fs:allow-read-file belongs to a plugin that Cargo.toml does not depend on")
    const unused = { ...realTree, cargoToml: realTree.cargoToml.replace("tauri-plugin-opener = \"2\"", "tauri-plugin-opener = \"2\"\ntauri-plugin-store = \"2\"\nleft-pad = \"1\"") }
    expect(lintNativeShell(unused)).toContain("dependency tauri-plugin-store is not used by any Rust source")
    expect(lintNativeShell(unused)).toContain("dependency left-pad is not used by any Rust source")
  })

  test("a banned crate in Cargo.lock is reported, a wrapped one is allowed", () => {
    expect(realTree.cargoLock).toContain('name = "tauri-plugin-fs"')
    const banned = { ...realTree, cargoLock: `${realTree.cargoLock}\n[[package]]\nname = "tauri-plugin-http"\nversion = "2.0.0"\n\n[[package]]\nname = "needs-http"\nversion = "1.0.0"\ndependencies = [\n "tauri-plugin-http",\n]\n` }
    expect(lintNativeShell(banned)).toContain("Cargo.lock contains banned crate tauri-plugin-http, used by needs-http")
  })
})

describe("Rust build and release configuration", () => {
  const cargo = text(join(native, "Cargo.toml"))
  const manifest = Bun.TOML.parse(cargo) as { package: { "rust-version": string }; profile: Record<string, Record<string, unknown>>; lints: { rust: Record<string, string>; clippy: Record<string, string> } }
  const toolchain = Bun.TOML.parse(text(join(native, "rust-toolchain.toml"))) as { toolchain: { channel: string; components: string[] } }

  test("the dev profile keeps debug info small and optimises dependencies", () => {
    expect(manifest.profile.dev?.debug).toBe("line-tables-only")
    expect((manifest.profile.dev as { package: Record<string, { "opt-level": number }> }).package["*"]?.["opt-level"]).toBe(2)
    expect(manifest.profile.release?.panic).toBe("abort")
  })

  test("the lint policy forbids unsafe code and unwrap, which would abort the whole app in release", () => {
    expect(manifest.lints.rust.unsafe_code).toBe("forbid")
    expect(manifest.lints.clippy.unwrap_used).toBe("deny")
    expect(/\bunsafe\s*[{(]|unsafe\s+(fn|impl)\b/.test(rustSources)).toBe(false)
  })

  test("the toolchain file follows stable and ships what CI runs", () => {
    const channel = toolchain.toolchain.channel
    const minimum = manifest.package["rust-version"].split(".").map(Number)
    const channelVersion = channel.split(".").map(Number)
    if (channel !== "stable") expect(channelVersion[0]! > minimum[0]! || (channelVersion[0] === minimum[0] && channelVersion[1]! >= minimum[1]!)).toBe(true)
    expect(toolchain.toolchain.components).toEqual(expect.arrayContaining(["clippy", "rustfmt"]))
  })

  test("Windows signing timestamps over https from the config, and the release script does not override it", () => {
    const windows = (config as unknown as { bundle: { windows: { timestampUrl: string; digestAlgorithm: string } } }).bundle.windows
    expect(windows.timestampUrl.startsWith("https://")).toBe(true)
    expect(windows.digestAlgorithm).toBe("sha256")
    expect(text(join(root, "scripts/build.ts"))).not.toContain("http://timestamp")
    expect((config as unknown as { bundle: { targets: string[] } }).bundle.targets).toEqual(expect.arrayContaining(["nsis", "msi", "deb", "rpm", "dmg", "app"]))
  })

  test("the App Store configuration keeps the main window identical apart from the transparent material", () => {
    const mainWindow = (config as unknown as { app: { windows: Record<string, unknown>[] } }).app.windows[0]!
    const store = JSON.parse(text(join(native, "tauri.appstore.conf.json"))) as { app: { windows: Record<string, unknown>[] } }
    const { transparent: _transparent, ...expected } = mainWindow
    const { transparent: _storeTransparent, backgroundColor, ...actual } = store.app.windows[0]!
    expect(actual).toEqual(expected)
    expect(backgroundColor).toEqual([15, 23, 42, 255])
  })

  test("CI runs cargo-deny and cargo-audit without blocking the pipeline, against the committed policy", () => {
    const ci = text(join(root, ".github/workflows/ci.yml"))
    for (const gate of ["cargo-deny", "cargo-audit"]) {
      const job = new RegExp(`^  ${gate}:\\n([\\s\\S]*?)(?=^  [a-z-]+:\\n|(?![\\s\\S]))`, "m").exec(ci)?.[1] ?? ""
      expect(job).toContain("continue-on-error: true")
    }
    expect(ci).toContain("cargo deny --locked check")
    expect(ci).toContain("cargo audit --file Cargo.lock")
    expect(Bun.TOML.parse(text(join(native, "deny.toml")))).toHaveProperty("licenses.allow")
  })

  test("CI treats Rust diagnostics as advisory while keeping functional validation mandatory", () => {
    interface Step {
      name: string
      run?: string
      "continue-on-error"?: boolean
    }
    const ci = Bun.YAML.parse(text(join(root, ".github/workflows/ci.yml"))) as {
      jobs: Record<string, { "continue-on-error"?: boolean; steps: Step[] }>
    }
    const rust = ci.jobs["src-tauri"]!
    expect(rust["continue-on-error"]).not.toBe(true)
    for (const name of ["cargo fmt", "cargo clippy"]) {
      const step = rust.steps.find((step) => step.name === name)
      expect(step).toBeDefined()
      expect(step?.["continue-on-error"]).toBe(true)
      expect(step?.run).not.toContain("-D warnings")
    }
    for (const [jobName, requiredNames] of [
      ["src-tauri", ["Install dependencies", "Stage the sidecar binary and the migrations resource", "cargo test"]],
      ["workspace", ["Install dependencies", "Typecheck", "Validate workflows", "Verify release automation"]],
      ["mobile", ["Typecheck", "Test companion transport", "Export the iOS JavaScript bundle"]],
    ] as const) {
      const job = ci.jobs[jobName]!
      expect(job["continue-on-error"]).not.toBe(true)
      for (const name of requiredNames) {
        const step = job.steps.find((step) => step.name === name)
        expect(step).toBeDefined()
        expect(step?.["continue-on-error"]).not.toBe(true)
      }
    }
    expect(rust.steps.find((step) => step.name === "cargo test")?.run).toBe("cargo test --locked --all-features")
    for (const [jobName, report] of [["cargo-deny", "cargo deny check"], ["cargo-audit", "cargo audit"]] as const) {
      const steps = ci.jobs[jobName]!.steps
      expect(steps.find((step) => step.name === report)?.["continue-on-error"]).toBe(true)
      expect(steps.some((step) => step.name.startsWith("Report ") && step.run?.includes("::warning::"))).toBe(true)
    }
  })
})
