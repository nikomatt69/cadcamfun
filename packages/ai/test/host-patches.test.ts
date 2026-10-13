import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { MEDIA_RULE_MARKER, patchHostSource } from "../src/nikcli/host-patches.ts"

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
    const patched = patchHostSource(bundle)!
    expect(patched).toBeDefined()
    expect(patched.length).toBe(bundle.length - MEDIA_RULE_MARKER.length + "return false;".length)
    expect(patched).not.toContain(MEDIA_RULE_MARKER)
    const at = patched.indexOf("function supportsMediaInToolResults(model)")
    expect(patched.slice(at, at + 520)).toContain("return false;\n}")
    // Exactly the one substitution, nothing else in 15 MB of host.
    expect(patched).toBe(bundle.replace(MEDIA_RULE_MARKER, () => "return false;"))
  })

  test("a bundle without the marker, or with it twice, is left alone", () => {
    expect(patchHostSource("function other() {}")).toBeUndefined()
    expect(patchHostSource(`${MEDIA_RULE_MARKER}\n${MEDIA_RULE_MARKER}`)).toBeUndefined()
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
