import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { isolatedPaths } from "../../../packages/ai/src/nikcli/isolation.ts"
import { saveMod, setModEnabled } from "../../../packages/ai/src/nikcli/mods.ts"
import { startFakeOpenAi } from "../../../packages/ai/test/helpers/fake-openai.ts"

const repo = fileURLToPath(new URL("../../../", import.meta.url))

test("compiled assistant extensions execute hooks, reload consent and deliver contributed modes", async () => {
  const root = await mkdtemp(join(tmpdir(), "cadcam-compiled-extensions-"))
  const binary = join(root, process.platform === "win32" ? "sidecar.exe" : "sidecar")
  let child: ReturnType<typeof Bun.spawn<"pipe", "pipe", "pipe">> | undefined
  let fake: ReturnType<typeof startFakeOpenAi> | undefined
  let stderr: Promise<string> = Promise.resolve("")
  let stdout: Promise<void> = Promise.resolve()
  let exitCode: number | null = null
  try {
    // The production compiler applies the mandatory pinned-host patches and includes its kernel worker.
    const platform = process.platform === "win32" ? "windows" : process.platform
    const build = Bun.spawn([process.execPath, "--no-env-file", join(repo, "scripts/compile-sidecar.ts"), join(repo, "apps/sidecar/src/main.ts"), `bun-${platform}-${process.arch}`, binary], { cwd: repo, stdout: "pipe", stderr: "pipe" })
    const buildTimeout = setTimeout(() => build.kill(), 90_000)
    try {
      const [out, err, code] = await Promise.all([new Response(build.stdout).text(), new Response(build.stderr).text(), build.exited])
      expect(code, err.slice(-2000) + out.slice(-2000)).toBe(0)
    } finally { clearTimeout(buildTimeout) }

    fake = startFakeOpenAi(() => ({ text: "Compiled extension check complete." }))
    const marker = join(root, "owned-hook.txt")
    const source = (file: string) => `export const register = (on) => {
  on("prompt.submit", {}, async ($, event, next) => {
    await $.fs.write(${JSON.stringify(file)}, event.text)
    return next(event)
  })
}`
    const sentinel = join(root, "user-install-hook.txt")
    const userConfig = join(root, ".config", "nikcli")
    await mkdir(join(userConfig, "plugins"), { recursive: true })
    const userMod = join(userConfig, "plugins", "user-mod.js")
    await writeFile(userMod, source(sentinel))
    await writeFile(join(userConfig, "nikcli.json"), JSON.stringify({ plugin: [pathToFileURL(userMod).href] }))
    const paths = isolatedPaths(join(root, "data"))
    saveMod(paths, { id: "compiled_probe", description: "Record the submitted prompt in the disposable test directory.", source: source(marker) })
    setModEnabled(paths, "compiled_probe", true)
    const token = "compiled-extension-fixture-token"
    child = Bun.spawn([binary], {
      cwd: root,
      env: {
        PATH: process.env["PATH"] ?? "", HOME: root, USERPROFILE: root,
        CADCAMFUN_TOKEN: token, CADCAMFUN_DATA_DIR: join(root, "data"),
        CADCAMFUN_MIGRATIONS_DIR: join(repo, "packages/db/drizzle"),
        CADCAMFUN_AI_OFFLINE: "true", CADCAMFUN_AI_MINIMAX_BASE_URL: fake.baseUrl
      },
      stdin: "pipe", stdout: "pipe", stderr: "pipe"
    })
    stderr = new Response(child.stderr).text()
    const startup = setTimeout(() => child?.kill(), 30_000)
    let ready: { event?: string; port?: number }
    try {
      const reader = child.stdout.getReader()
      let text = ""
      try {
        while (!text.includes("\n")) {
          const chunk = await reader.read()
          if (chunk.done) throw new Error(`Sidecar stopped before ready: ${(await stderr).slice(-2000)}`)
          text += new TextDecoder().decode(chunk.value)
        }
      } finally { reader.releaseLock() }
      ready = JSON.parse(text.split("\n")[0]!) as typeof ready
    } finally { clearTimeout(startup) }
    const output = child.stdout.getReader()
    stdout = (async () => {
      try { while (!(await output.read()).done) { /* Drain logs so the child never blocks on its pipe. */ } }
      finally { output.releaseLock() }
    })()
    expect(ready.event).toBe("ready")
    expect(ready.port).toBeNumber()
    const base = `http://127.0.0.1:${ready.port}`
    const request = (method: string, path: string, body?: unknown) => fetch(base + path, {
      method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30_000)
    })
    const json = async (method: string, path: string, body?: unknown): Promise<Record<string, unknown>> => {
      const response = await request(method, path, body)
      const value: unknown = await response.json()
      expect(response.ok, JSON.stringify(value)).toBe(true)
      return value as Record<string, unknown>
    }
    const project = await json("POST", "/api/projects", { name: "Compiled extensions" })
    const projectId = project["id"]
    expect(projectId).toBeString()
    await json("PUT", "/api/ai/credentials", { provider: "minimax", key: "local-fixture-key" })
    const turn = async (message: string, mode?: string) => {
      const response = await request("POST", "/api/ai/chat/stream", { projectId, message, includeContext: false, model: { provider: "minimax", model: "MiniMax-M2" }, ...(mode ? { mode } : {}) })
      const body = await response.text()
      expect(response.ok, body).toBe(true)
      const events = body.split("\n").filter((line) => line.startsWith("data:")).map((line) => JSON.parse(line.slice(5)) as { type: string; text?: string })
      expect(events.at(-1), body).toMatchObject({ type: "done", text: "Compiled extension check complete." })
    }
    await turn("initial compiled hook")
    const initial = await readFile(marker, "utf8")
    expect(initial).toContain("initial compiled hook")
    await json("PUT", "/api/ai/extensions/mods/compiled_probe", { enabled: false })
    await turn("disabled compiled hook")
    expect(await readFile(marker, "utf8")).toBe(initial)
    await json("PUT", "/api/ai/extensions/mods/compiled_probe", { enabled: true })
    await turn("re-enabled compiled hook")
    const reenabled = await readFile(marker, "utf8")
    expect(reenabled).toContain("re-enabled compiled hook")
    await json("DELETE", "/api/ai/extensions/mods/compiled_probe")
    await turn("removed compiled hook")
    expect(await readFile(marker, "utf8")).toBe(reenabled)

    const pluginId = "com.example.compiled"
    const pluginMarker = join(root, "plugin-hook.txt")
    const instructions = "COMPILED_PLUGIN_MODE_EVIDENCE: report measured geometry only."
    await json("POST", "/api/ai/extensions/plugins", {
      manifest: JSON.stringify({
        id: pluginId, name: "Compiled extension", version: "1.0.0", apiVersion: "1", entry: "index.js", capabilities: ["ai:mod", "ai:mode"],
        contributes: {
          mods: [{ id: "probe", title: "Compiled hook", description: "Record submitted prompts.", entry: "mod.js" }],
          modes: [{ id: "measure", title: "Measure", description: "Measure current geometry.", instructions }]
        }
      }),
      source: "export const aiTools = {}", files: { "mod.js": source(pluginMarker) }
    })
    await json("PUT", `/api/ai/extensions/plugins/${pluginId}`, { enabled: true })
    let before = fake.requests.length
    await turn("enabled plugin hook", `${pluginId}:measure`)
    const pluginPrompt = await readFile(pluginMarker, "utf8")
    expect(pluginPrompt).toContain("enabled plugin hook")
    expect(JSON.stringify(fake.requests.slice(before))).toContain(instructions)
    await json("PUT", `/api/ai/extensions/plugins/${pluginId}`, { enabled: false })
    before = fake.requests.length
    await turn("disabled plugin hook", `${pluginId}:measure`)
    expect(await readFile(pluginMarker, "utf8")).toBe(pluginPrompt)
    expect(JSON.stringify(fake.requests.slice(before))).not.toContain(instructions)
    expect(existsSync(sentinel)).toBe(false)
  } finally {
    if (child !== undefined) {
      const timeout = setTimeout(() => child?.kill(), 5_000)
      try {
        try { child.stdin.write('{"event":"shutdown"}\n'); await child.stdin.end() } catch { child.kill() }
        exitCode = await child.exited
        await Promise.all([stderr, stdout])
      } finally { clearTimeout(timeout) }
    }
    fake?.stop()
    await rm(root, { recursive: true, force: true })
  }
  expect(exitCode).toBe(0)
}, 180_000)
