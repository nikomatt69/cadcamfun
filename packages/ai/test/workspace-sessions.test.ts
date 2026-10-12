import { describe, expect, test } from "bun:test"
import { Effect, Layer, Redacted, Stream } from "effect"
import { AiConfig } from "../src/ai-config.ts"
import { AiCredentials } from "../src/credentials.ts"
import { DirectModel } from "../src/direct-model.ts"
import { AiHost, AiService } from "../src/service.ts"
import { BackgroundTaskManager } from "../src/nikcli/background-tasks.ts"
import { findHostSession } from "../src/nikcli/chat.ts"
import type { NikCliRuntime, ProjectHost } from "../src/nikcli/runtime.ts"

const fixture = () => {
  const sessions = new Map([ ["ses_native_a", { id: "ses_native_a", title: "Bracket", directory: "/scratch/a" }] ])
  const prompts: string[] = [], aborts: string[] = []
  let created = 0, unavailable = false
  const hosts = new Map<string, ProjectHost>()
  const host = (projectId: string): ProjectHost => {
    const cached = hosts.get(projectId)
    if (cached) return cached
    const directory = `/scratch/${projectId}`
    const value = { projectId, directory, client: {
      session: {
        get: async ({ sessionID }: { sessionID: string }) => {
          if (unavailable) throw new Error("Storage unavailable")
          const session = sessions.get(sessionID)
          if (!session) throw { reason: "UnexpectedStatus", cause: { status: 404 } }
          return session
        },
        create: async () => { const session = { id: `created-${++created}`, title: "Chat", directory }; sessions.set(session.id, session); return session },
        abort: async ({ sessionID }: { sessionID: string }) => { aborts.push(sessionID); return true },
        messages: async () => []
      },
      events: { subscribe: async function* () { yield { type: "server.connected", properties: {} } } },
      "session-prompt": { prompt: async ({ sessionID }: { sessionID: string }) => {
        prompts.push(sessionID)
        return { info: { id: "answer", role: "assistant", finish: "stop" }, parts: [{ id: "text", type: "text", text: "Built and checked." }] }
      } }
    } } as unknown as ProjectHost
    hosts.set(projectId, value)
    return value
  }
  const runtime = { host: (projectId: string) => Effect.succeed(host(projectId)) } as unknown as NikCliRuntime
  const scheduler = new BackgroundTaskManager({})
  const base = Layer.mergeAll(AiCredentials.layer, AiConfig.layer({ dataDir: "/unused", forceGateway: false }), Layer.succeed(AiHost, { runtime, scheduler }))
  const layer = AiService.layer.pipe(Layer.provideMerge(DirectModel.layer.pipe(Layer.provideMerge(base))))
  return { host, layer, prompts, aborts, creations: () => created, unavailable: () => { unavailable = true } }
}

describe("project workspace session continuity", () => {
  test("restores a persisted native identity without creating or discarding host history", async () => {
    const f = fixture()
    const turn = Effect.gen(function* () {
      yield* (yield* AiCredentials).set("openai", Redacted.make("offline-test"))
      return yield* (yield* AiService).chat({ projectId: "a", sessionId: "ses_native_a", message: "Continue the bracket", admitSession: async () => true }).pipe(Stream.runCollect)
    })
    // Two service lifetimes model a restart of the adapter's volatile identity map.
    for (let i = 0; i < 2; i++) {
      const events = await Effect.runPromise(turn.pipe(Effect.provide(f.layer)))
      expect(events.at(-1)).toMatchObject({ type: "done", sessionId: "ses_native_a", text: "Built and checked." })
    }
    expect(f.prompts).toEqual(["ses_native_a", "ses_native_a"])
    expect(f.creations()).toBe(0)
  })

  test("the shared native database cannot redirect a turn or abort to another workspace", async () => {
    const f = fixture()
    await Effect.runPromise(Effect.gen(function* () {
      yield* (yield* AiCredentials).set("openai", Redacted.make("offline-test"))
      const ai = yield* AiService
      expect((yield* ai.chat({ projectId: "b", sessionId: "ses_native_a", message: "Change it" }).pipe(Stream.runCollect, Effect.exit))._tag).toBe("Failure")
      expect((yield* ai.abort("ses_native_a", "b").pipe(Effect.exit))._tag).toBe("Failure")
      expect(yield* ai.removeSession("ses_native_a", "b")).toBe(false)
    }).pipe(Effect.provide(f.layer)))
    expect(f.prompts).toEqual([])
    expect(f.aborts).toEqual([])
    expect(f.creations()).toBe(0)
  })

  test("transient native lookup failures do not silently replace a conversation", async () => {
    const f = fixture()
    f.unavailable()
    await expect(Effect.runPromise(findHostSession(f.host("a"), "ses_native_a"))).rejects.toThrow("Storage unavailable")
    expect(f.creations()).toBe(0)
  })

  test("only a confirmed missing native session creates a replacement", async () => {
    const f = fixture()
    await Effect.runPromise(Effect.gen(function* () {
      yield* (yield* AiCredentials).set("openai", Redacted.make("offline-test"))
      const events = yield* (yield* AiService).chat({ projectId: "a", sessionId: "legacy-client", message: "Start", admitSession: async () => true }).pipe(Stream.runCollect)
      expect(events.at(-1)).toMatchObject({ type: "done", sessionId: "created-1" })
    }).pipe(Effect.provide(f.layer)))
    expect(f.creations()).toBe(1)
  })
})
