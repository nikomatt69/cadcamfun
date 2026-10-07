/**
 * The embedded nikcli host has to stay loadable *after* the UI has booted.
 *
 * `bun test` runs every file in one process (spec 08-ai.md §5), and loading the
 * desktop UI leaves Bun's source-map `Error.prepareStackTrace` rewriter installed.
 * With it in place `Error.captureStackTrace` rejects the plain objects axios brands
 * as errors while following redirects, so `@nikcli-ai/sdk-next` — the host — used to
 * fail with `First argument must be an Error object` the moment any UI file ran
 * first, taking every host-backed test down with it. `loadSdk` guards that import;
 * this pins the whole sequence: boot the UI, then start the host.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Effect, Scope } from "effect"
import { bootLiveApp } from "./helpers/live-app.ts"
import { makeNikCliRuntime } from "../../../packages/ai/src/nikcli/runtime.ts"
import { sharedDataDir } from "../../../packages/ai/test/helpers/host-env.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() })
afterAll(async () => { await app.dispose() })

describe("host load after the UI", () => {
  test("booting the settings screen does not stop the embedded host from starting", async () => {
    const { dispose } = app.visit("/settings")
    const scope = Effect.runSync(Scope.make())
    try {
      const runtime = await Effect.runPromise(
        makeNikCliRuntime({
          dataDir: sharedDataDir,
          providers: [],
          systemPrompt: "You are the CAD/CAM assistant.",
          toolsFor: () => []
        }).pipe(Scope.provide(scope))
      )
      // The host resolved its isolated state folder instead of rejecting the import.
      expect(runtime.paths.root).toContain("cadcam-ai-test-")
    } finally {
      dispose()
      await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never))
    }
  }, 60000)
})
