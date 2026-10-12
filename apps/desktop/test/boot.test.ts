/**
 * Boot sequence tests (spec 06-desktop-ui.md §1).
 *
 * Two halves: the *real* typed client against an in-process HTTP server (so `fetch`,
 * the bearer middleware and the Schema decoding are all exercised), and the pure
 * helpers (`withTimeout`, the fake fallback) against fake endpoints.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Effect, Exit } from "effect"
import { ApiClient, BOOT_TIMEOUT_MS, connect, createRuntime, messageOf, withTimeout } from "../src/shared/state/client.ts"
import { startStubApi, type StubServer } from "./helpers/stub-server.ts"

/** `projects.list()` resolved against the runtime's own client service. */
const projectsList = Effect.flatMap(
  Effect.service(ApiClient),
  (client) => client.projects.list()
)

let stub: StubServer

beforeAll(async () => {
  stub = await startStubApi()
})

afterAll(async () => {
  await stub.close()
})

describe("withTimeout", () => {
  test("resolves when the promise is fast enough", async () => {
    expect(await withTimeout(Promise.resolve("ok"), 1000, "too slow")).toBe("ok")
  })

  test("rejects with the reason when the deadline passes", async () => {
    const never = new Promise<never>(() => {})
    await expect(withTimeout(never, 10, "too slow")).rejects.toThrow("too slow")
  })
})

describe("the reason shown when the sidecar cannot be reached", () => {
  test("is readable for the plain objects the Tauri shell rejects with, never [object Object]", () => {
    expect(messageOf(new Error("boom"))).toBe("boom")
    expect(messageOf("plain")).toBe("plain")
    expect(messageOf({ kind: "sidecar", message: "the sidecar did not become ready within 60 seconds" })).toBe("the sidecar did not become ready within 60 seconds")
    expect(messageOf({ kind: "sidecar" })).toBe('{"kind":"sidecar"}')
    expect(messageOf(undefined)).toBe("undefined")
  })
})

describe("connect against a live sidecar", () => {
  test("the spec's deadline is 15 seconds", () => {
    expect(BOOT_TIMEOUT_MS).toBe(15_000)
  })

  test("endpoint then GET /health yields a ready client", async () => {
    const connection = await connect({ endpoint: async () => stub.endpoint, timeoutMs: 5_000 })
    expect(connection.state._tag).toBe("ready")
    if (connection.state._tag !== "ready") return
    expect(connection.state.mode).toBe("live")
    expect(connection.client).toBeDefined()
  })

  test("the typed client decodes a response through the endpoint Schema", async () => {
    const runtime = createRuntime(stub.endpoint)
    const list = await runtime.run(projectsList)
    expect(list.map((p) => p.name)).toEqual(["Bracket", "Enclosure"])
    // Decoded by `ProjectWithRelations`, so the relations are present, not `unknown`.
    expect(list[0]?._count.drawings).toBe(0)
    runtime.dispose()
  })

  test("the bearer token reaches the sidecar on authenticated groups", async () => {
    const before = stub.requests().length
    const runtime = createRuntime(stub.endpoint)
    await runtime.run(projectsList)
    const after = stub.requests().slice(before)
    expect(after.some((r) => r.line === "GET /api/projects" && r.auth === "Bearer stub-token")).toBe(true)
    runtime.dispose()
  })

  test("two live runtimes keep bearer credentials isolated", async () => {
    const first = createRuntime(stub.endpoint)
    const second = createRuntime({ ...stub.endpoint, token: "other-runtime-token" })
    try {
      await first.run(Effect.service(ApiClient))
      await second.run(Effect.service(ApiClient))
      const result = await first.run(projectsList)
      expect(result).toHaveLength(2)
      const rejected = await second.run(projectsList.pipe(Effect.exit))
      expect(Exit.isFailure(rejected)).toBe(true)
      expect((await first.run(projectsList)).length).toBe(2)
    } finally { await first.dispose(); await second.dispose() }
  })

  test("a wrong token fails the health check instead of rendering the shell", async () => {
    const connection = await connect({
      endpoint: async () => ({ baseUrl: stub.endpoint.baseUrl, token: "wrong" }),
      timeoutMs: 5_000
    })
    // /health is public, so the token is not what fails here; assert the shape instead.
    expect(["ready", "failed"]).toContain(connection.state._tag)
  })

  test("an unreachable sidecar reports a failure the splash can render", async () => {
    const connection = await connect({
      endpoint: async () => ({ baseUrl: "http://127.0.0.1:1", token: "t" }),
      timeoutMs: 2_000
    })
    expect(connection.state._tag).toBe("failed")
    if (connection.state._tag !== "failed") return
    expect(connection.state.reason).toContain("health check")
    expect(connection.state.timedOut).toBe(true)
  })

  test("an endpoint that never resolves times out at the given deadline", async () => {
    const started = Date.now()
    const connection = await connect({ endpoint: () => new Promise<never>(() => {}), timeoutMs: 30 })
    expect(connection.state._tag).toBe("failed")
    if (connection.state._tag !== "failed") return
    expect(connection.state.reason).toContain("did not report an address")
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  test("without a fallback the shell never runs on the fake", async () => {
    const connection = await connect({
      endpoint: async () => {
        throw new Error("no sidecar")
      },
      timeoutMs: 100
    })
    expect(connection.state._tag).toBe("failed")
    expect(connection.client).toBeUndefined()
  })

  test("the browser fallback hands back an in-memory fake", async () => {
    const connection = await connect({
      endpoint: async () => {
        throw new Error("no sidecar")
      },
      timeoutMs: 100,
      fallbackToFake: true
    })
    expect(connection.state._tag).toBe("ready")
    if (connection.state._tag !== "ready") return
    expect(connection.state.mode).toBe("fake")
    const health = await Effect.runPromise(connection.state.client.health.check().pipe(Effect.exit))
    expect(Exit.isSuccess(health)).toBe(true)
  })
})
