import { describe, expect, test } from "bun:test"
import { Effect, Exit, Scope } from "effect"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { isolatedPaths } from "../src/nikcli/isolation.ts"
import { modelsCacheFile } from "../src/nikcli/models-cache.ts"
import { makeNikCliRuntime } from "../src/nikcli/runtime.ts"

const stubFetch = (respond: () => Response): typeof fetch =>
  Object.assign(async () => respond(), { preconnect: () => undefined })

describe("runtime admission", () => {
  test("scope closure forbids new hosts and ignores late warming", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "ai-lifetime-"))
    const scope = Effect.runSync(Scope.make())
    let warm!: () => void
    let toolsRead = 0
    try {
      const runtime = await Effect.runPromise(makeNikCliRuntime({
        dataDir, providers: [], systemPrompt: "x", toolsFor: () => { toolsRead++; return [] },
        warmAfter: new Promise<void>((r) => { warm = r })
      }).pipe(Scope.provide(scope)))
      await Effect.runPromise(Scope.close(scope, Exit.void))
      warm()
      await new Promise((r) => setTimeout(r, 300))
      await expect(Effect.runPromise(runtime.host("p"))).rejects.toThrow("closed")
      await expect(Effect.runPromise(runtime.worker({ projectId: "p", parentSessionId: "s" }))).rejects.toThrow("closed")
      await expect(Effect.runPromise(runtime.setProviderKey("fake", "test"))).rejects.toThrow("closed")
      await expect(Effect.runPromise(runtime.updateProviders([]))).rejects.toThrow("closed")
      await expect(Effect.runPromise(runtime.reloadSkills())).rejects.toThrow("closed")
      expect(() => runtime.catalogueReady).toThrow("closed")
      expect(toolsRead).toBe(0)
    } finally { await Effect.runPromise(Scope.close(scope, Exit.void)); rmSync(dataDir, { recursive: true, force: true }) }
  })

  test("a fresh runtime restores the full bundled catalogue without a download", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "ai-catalogue-"))
    const scope = Effect.runSync(Scope.make())
    const originalFetch = globalThis.fetch
    let downloads = 0
    try {
      const runtime = await Effect.runPromise(makeNikCliRuntime({
        dataDir, providers: [], systemPrompt: "x", toolsFor: () => [], catalogue: { network: true }
      }).pipe(Scope.provide(scope)))
      globalThis.fetch = Object.assign(async () => { downloads++; throw new Error("No network") }, { preconnect: originalFetch.preconnect })
      await expect(runtime.catalogueReady).resolves.toBe("bundled")
      expect(existsSync(modelsCacheFile(isolatedPaths(dataDir)))).toBe(true)
      expect(downloads).toBe(0)
      await expect(runtime.catalogueReady).resolves.toBe("bundled")
    } finally {
      globalThis.fetch = originalFetch
      await Effect.runPromise(Scope.close(scope, Exit.void))
      rmSync(dataDir, { recursive: true, force: true })
    }
  })
})
