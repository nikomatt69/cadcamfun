/**
 * The pinned host surface, checked against the bundle this package actually loads.
 *
 * `@nikcli-ai/sdk-next@1.428.0` publishes a bundle with no type declarations, so `src/nikcli/sdk-next.d.ts` is
 * written by hand. Nothing forces it to stay true: a bumped host can rename a namespace, drop a method or move
 * a payload, and the declaration would keep compiling while every call failed at runtime inside the tool bridge.
 * This is the gate AI-10 asks for — the recorded evidence that the surface the host adapter depends on, and the
 * native capabilities the CAD/CAM harness may adopt later, exist in the pinned bundle.
 *
 * Two lists, deliberately separate:
 * - `REQUIRED` is what the package calls today. A missing entry is a defect to fix, not a decision to make.
 * - `ADOPTABLE` is what the pinned host offers and this package deliberately does not use yet (RM-07 owner-bound
 *   tasks and recovery). It is recorded so adopting it is a proved capability rather than a discovery, and so a
 *   bump that removes it is noticed while it is still unused.
 */
import { afterAll, expect, setDefaultTimeout, test } from "bun:test"
import { Effect, Scope } from "effect"
import { defaultProviderSpecs } from "../src/nikcli/config.ts"
import { makeNikCliRuntime } from "../src/nikcli/runtime.ts"
import { sharedDataDir } from "./helpers/host-env.ts"

setDefaultTimeout(90000)

/** Every `namespace.method` (or `namespace.property`) the host adapter reaches. */
const REQUIRED = [
  "session.create", "session.list", "session.get", "session.remove", "session.abort", "session.summarize", "session.messages",
  "session-prompt.prompt", "session-prompt.promptAsync",
  "events.subscribe",
  "provider.list", "provider.auth", "provider.api", "provider.removeAuth",
  "permission.list", "permission.reply",
  "question.list", "question.reply", "question.reject",
  "brain.status", "brain.trigger",
  "experimental.toolIDs", "experimental.tools",
  "config.get", "config-management.reload",
  "top-level.agent", "top-level.dispose", "top-level.skill",
  "tools.register"
] as const

/** Native capability the pinned host offers, not yet used by this package (see RM-07). */
const ADOPTABLE = [
  "session.todo", "session.goal", "session.instructions", "session.children", "session.fork", "session.diff",
  "session.revert", "session.unrevert", "session.pending", "session.pendingSteer", "session.monitor", "session.monitorLog",
  "session.monitorCancel", "session.background", "session.backgroundInspect", "session.backgroundRead",
  "session.backgroundCancel", "session.backgroundResume", "session.contextBreakdown", "session.contextToggle",
  "permission.blocked", "mod.list", "events.global"
] as const

type Path = `${string}.${string}`

const resolve = (root: unknown, path: Path): unknown =>
  path.split(".").reduce<unknown>((value, key) => (value === null || typeof value !== "object" ? undefined : (value as Record<string, unknown>)[key]), root)

const scope = Effect.runSync(Scope.make())

afterAll(async () => {
  await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never))
})

test("the pinned host offers every surface the embedded adapter depends on", async () => {
  const host = await Effect.runPromise(
    makeNikCliRuntime({ dataDir: sharedDataDir, providers: defaultProviderSpecs(), systemPrompt: "surface", toolsFor: () => [] }).pipe(
      Scope.provide(scope),
      Effect.flatMap((runtime) => runtime.host("host-surface"))
    )
  )
  // `tools` is local-only on the embedded host; everything else is the generated client the router serves.
  const client = host.client as unknown as Record<string, unknown>
  const missingRequired = REQUIRED.filter((path) => typeof resolve(client, path) !== "function")
  expect(missingRequired).toEqual([])
  const missingAdoptable = ADOPTABLE.filter((path) => typeof resolve(client, path) !== "function")
  expect(missingAdoptable).toEqual([])
}, 90000)

test("the pinned bundle exports the two entry points the package uses", async () => {
  const sdk = (await import("@nikcli-ai/sdk-next")) as Record<string, unknown>
  expect(typeof sdk["NikCli"]).toBe("object")
  expect(typeof (sdk["NikCli"] as Record<string, unknown>)["create"]).toBe("function")
  expect(typeof (sdk["Tool"] as Record<string, unknown>)["define"]).toBe("function")
})