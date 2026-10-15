import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import { applyHostPatches, ENVIRONMENT_MARKER, HOST_PATCHES, HostPatchError, INSTANCE_CONFIG_MARKER, MEDIA_RULE_MARKER, REGISTRATION_MARKER, STEP_INSTRUCTIONS_MARKER, hostPatchesPlugin, patchHostSource } from "../src/nikcli/host-patches.ts"

/** The marker must exist exactly once in the pinned bundle; a bump that moves it fails here, not in a user's chat. */
describe("host patch: images in tool results", () => {
  const bundle = readFileSync(createRequire(import.meta.url).resolve("@nikcli-ai/sdk-next"), "utf8")

  test("the pinned bundle has the rule exactly once, and it is the one the patch means", () => {
    expect(bundle.split(MEDIA_RULE_MARKER)).toHaveLength(2)
    const at = bundle.indexOf(MEDIA_RULE_MARKER)
    const before = bundle.slice(Math.max(0, at - 400), at)
    expect(before).toContain("function supportsMediaInToolResults(model)")
    expect(before).toContain("@ai-sdk/anthropic")
  })

  test("the patch answers false and changes nothing else", () => {
    const patched = patchHostSource(bundle)
    expect(patched).not.toContain(MEDIA_RULE_MARKER)
    const at = patched.indexOf("function supportsMediaInToolResults(model)")
    expect(patched.slice(at, at + 520)).toContain("return false;\n}")
    // Exactly the declared substitutions, nothing else in 15 MB of host.
    expect(patched).toBe(HOST_PATCHES.reduce((source, patch) => source.replace(patch.marker, () => patch.replacement), bundle))
  })
})

/** Partial compatibility is an explicit error: every patch is reported, and a bundle missing any of them is refused. */
describe("host patch report", () => {
  const bundle = readFileSync(createRequire(import.meta.url).resolve("@nikcli-ai/sdk-next"), "utf8")

  test("the pinned bundle takes every patch, each exactly once", () => {
    const { report, source } = applyHostPatches(bundle)
    expect(report).toEqual(HOST_PATCHES.map(({ name }) => ({ name, status: "applied" })))
    expect(source).toBeDefined()
    for (const patch of HOST_PATCHES) expect(bundle.split(patch.marker), patch.name).toHaveLength(2)
  })

  test("a bundle without a marker, or with one twice, is refused with a report naming each patch", () => {
    expect(applyHostPatches("function other() {}").source).toBeUndefined()
    expect(applyHostPatches("function other() {}").report.every((entry) => entry.status === "missing")).toBe(true)
    const withoutEnvironment = bundle.replace(ENVIRONMENT_MARKER, "")
    const partial = applyHostPatches(withoutEnvironment)
    expect(partial.source).toBeUndefined()
    expect(partial.report.find((entry) => entry.name === "cad-environment")?.status).toBe("missing")
    expect(partial.report.filter((entry) => entry.status === "applied")).toHaveLength(HOST_PATCHES.length - 1)
    expect(applyHostPatches(`${bundle}\n${MEDIA_RULE_MARKER}`).report[0]).toEqual({ name: "media-in-tool-results", status: "ambiguous" })
    expect(() => patchHostSource(withoutEnvironment)).toThrow(HostPatchError)
    expect(() => patchHostSource(withoutEnvironment)).toThrow("cad-environment (missing)")
  })
})

describe("host patch: one configuration file per Instance", () => {
  const bundle = readFileSync(createRequire(import.meta.url).resolve("@nikcli-ai/sdk-next"), "utf8")

  test("the loader reads the Instance's own file after the global one, and still no ancestor or worktree file", () => {
    const at = bundle.indexOf(INSTANCE_CONFIG_MARKER)
    expect(bundle.lastIndexOf("async function loadState(ctx, directories, projectFiles)", at)).toBeGreaterThan(at - 2000)
    const patched = patchHostSource(bundle)
    const loader = patched.slice(patched.indexOf("async function loadState(ctx, directories, projectFiles)"), patched.indexOf("function makeScopedState(paths, appFs)"))
    expect(loader).toContain('if (Flag.NIKCLI_DISABLE_PROJECT_CONFIG) {\n        result = mergeConfigConcatArrays(result, await loadFile(path120.join(ctx.directory, "nikcli.json")));')
    expect(loader.indexOf("await global2()")).toBeLessThan(loader.indexOf("ctx.directory, \"nikcli.json\""))
    // Discovery stays off: with the flag set, findUp is never called and ancestor `.nikcli` folders are not listed.
    expect(patched).toContain('const found = Flag.NIKCLI_DISABLE_PROJECT_CONFIG ? [] : yield* appFs.findUp("nikcli.json", ctx.directory, ctx.worktree);')
  })

  test("the SDK registration answers one close for the batch it registered", () => {
    const patched = patchHostSource(bundle)
    const at = patched.indexOf('const register = Effect248.fn("NikCli.tools.register")')
    const body = patched.slice(at, patched.indexOf("return yield* Effect248.succeed(", at))
    expect(bundle).toContain(REGISTRATION_MARKER)
    expect(body).toContain("handles.push(yield* registry.register(tool));")
    expect(body).toContain("yield* handle.close;")
    expect(body).toContain("return { close };")
  })

  test("the environment keeps date, platform and locale, and drops the coding workspace", () => {
    const patched = patchHostSource(bundle)
    const at = patched.indexOf("async function environmentImpl(ctx, config)")
    const env = patched.slice(at, patched.indexOf("async function nativeEnvironmentImpl(ctx, config)", at))
    for (const kept of ["Today's date", "User locale", "User timezone", "Platform", "<language>"]) expect(env).toContain(kept)
    for (const dropped of ["Working directory", "git repo", "Package manager", "monitor tool", "<command_execution>"]) expect(env).not.toContain(dropped)
  })
})

/** A skill loaded during a long turn was resent in full on every step (the model kept saying the skills were "reloaded"). */
describe("host patch: instructions folded before every step", () => {
  const bundle = readFileSync(createRequire(import.meta.url).resolve("@nikcli-ai/sdk-next"), "utf8")

  test("the marker is the instruction assembly of the turn's step loop, once", () => {
    expect(bundle.split(STEP_INSTRUCTIONS_MARKER)).toHaveLength(2)
    const at = bundle.indexOf(STEP_INSTRUCTIONS_MARKER)
    const loop = bundle.lastIndexOf("async function runLoopTurn(sessionID, controller)", at)
    expect(loop).toBeGreaterThan(-1)
    // Inside that function's `while (true)` step loop, after the fold the host does once per turn.
    const between = bundle.slice(loop, at)
    expect(between).toContain("InstructionSync.foldDelivered(sessionID);")
    expect(between).toContain("while (true) {")
    expect(between.slice(1)).not.toContain("async function ")
  })

  test("the patched loop folds delivered instructions before each step's assembly", () => {
    const patched = patchHostSource(bundle)
    const at = patched.indexOf(STEP_INSTRUCTIONS_MARKER)
    expect(patched.slice(at - 60, at)).toContain("InstructionSync.foldDelivered(sessionID);\n")
  })
})

describe("host patch: loading", () => {
  test("a fresh process that registers the plugin loads the host through the patch", async () => {
    const script = [
      `import { registerHostPatches, hostPatchesApplied } from ${JSON.stringify(new URL("../src/nikcli/host-patches.ts", import.meta.url).pathname)}`,
      "registerHostPatches()",
      'const sdk = await import("@nikcli-ai/sdk-next")',
      'console.log(JSON.stringify({ applied: hostPatchesApplied(), create: typeof sdk.NikCli?.create }))'
    ].join("\n")
    const run = Bun.spawn(["bun", "-e", script], { cwd: new URL("..", import.meta.url).pathname, stdout: "pipe", stderr: "pipe", env: { ...process.env, NIKCLI_DISABLE_MODELS_FETCH: "1" } })
    const out = await new Response(run.stdout).text()
    await run.exited
    expect(JSON.parse(out.trim().split("\n").at(-1)!)).toEqual({ applied: true, create: "function" })
  }, 60000)
})

describe("host patch: the bundled sidecar", () => {
  test("a bundle built with the patch plugin (what `scripts/compile-sidecar.ts` compiles) carries the corrected rule", async () => {
    // The sidecar is compiled with the host embedded, so a plugin registered at run time never sees it. This builds the same way the
    // compile does (Bun.build with the plugin) and reads the result: the user-visible bug was a compiled sidecar with the old rule.
    const entry = join(import.meta.dir, "fixtures", "host-entry.ts")
    const result = await Bun.build({ entrypoints: [entry], target: "bun", plugins: [hostPatchesPlugin as never] })
    expect(result.success).toBe(true)
    const text = await result.outputs[0]!.text()
    const at = text.indexOf("function supportsMediaInToolResults(model)")
    expect(at).toBeGreaterThan(-1)
    const body = text.slice(at, text.indexOf("function isMultiAgent", at))
    expect(body).toContain("return false;")
    expect(body).not.toContain("nativeProviders.includes(model.api.npm)")
    // Run the function as the host does: an Anthropic-protocol model that takes images no longer gets them inside the tool result,
    // so the host sends them as the user message that follows ("Attached image(s) from tool result:"), which its request lowering accepts.
    const rule = new Function(`${body}; return supportsMediaInToolResults`)() as (model: unknown) => boolean
    const visionModel = { capabilities: { input: { image: true } }, api: { npm: "@ai-sdk/anthropic" } }
    expect(rule(visionModel)).toBe(false)
    expect(rule({ capabilities: { input: { image: false } }, api: { npm: "@ai-sdk/anthropic" } })).toBe(false)
    // And without the plugin the same build keeps the old rule, so this test would fail if the plugin stopped working.
    const plain = await Bun.build({ entrypoints: [entry], target: "bun" })
    const plainText = await plain.outputs[0]!.text()
    expect(plainText).toContain("nativeProviders.includes(model.api.npm)")
    const plainAt = plainText.indexOf("function supportsMediaInToolResults(model)")
    const oldRule = new Function(`${plainText.slice(plainAt, plainText.indexOf("function isMultiAgent", plainAt))}; return supportsMediaInToolResults`)() as (model: unknown) => boolean
    expect(oldRule(visionModel)).toBe(true)
  }, 120000)
})
