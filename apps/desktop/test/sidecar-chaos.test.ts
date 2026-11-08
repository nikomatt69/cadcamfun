import "./helpers/dom-global.ts"
import { afterAll, afterEach, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Stream } from "effect"
import type { LiveEvent } from "@cadcamfun/api"
import { acceptSidecarStatus, followingFetch, resetEndpoint, type Endpoint } from "../src/app/sidecar.ts"
import { retryingWrites } from "../src/app/retrying-writes.ts"
import { clientLayer, readClient, runtimeForLayer } from "../src/app/client.ts"
import type { Client } from "../src/shared/state/client.ts"

setDefaultTimeout(60_000)

/**
 * Chaos test: the desktop transport against a REAL sidecar process that is killed and restarted on a new port, with the same
 * sequence of events the Tauri shell emits (`sidecar-status` restarting / ready). No window and no Tauri: `refreshEndpoint` is a
 * no-op here, so the `ready` event is what rebinds the live client, exactly like in the shell.
 */
const entry = new URL("../../sidecar/src/main.ts", import.meta.url).pathname
const migrations = new URL("../../../packages/db/drizzle", import.meta.url).pathname
const token = "sidecar-chaos-test-token"

interface Running {
  readonly child: ReturnType<typeof Bun.spawn>
  readonly port: number
  readonly baseUrl: string
  readonly reader: ReadableStreamDefaultReader<Uint8Array>
}

const spawned = new Set<Running["child"]>()
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function start(dataDir: string): Promise<Running> {
  const child = Bun.spawn([process.execPath, "--no-env-file", entry], {
    env: { ...process.env, CADCAMFUN_TOKEN: token, CADCAMFUN_DATA_DIR: dataDir, CADCAMFUN_MIGRATIONS_DIR: migrations, CADCAMFUN_AI_OFFLINE: "1" },
    stdin: "pipe", stdout: "pipe", stderr: "pipe"
  })
  spawned.add(child)
  const errors = new Response(child.stderr).text()
  const reader = child.stdout.getReader()
  const decoder = new TextDecoder()
  let timer: ReturnType<typeof setTimeout> | undefined
  const ready = (async () => {
    let output = ""
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) throw new Error(`Sidecar exited before ready: ${output}\n${await errors}`)
      output += decoder.decode(chunk.value, { stream: true })
      const newline = output.indexOf("\n")
      if (newline < 0) continue
      const event: unknown = JSON.parse(output.slice(0, newline))
      if (typeof event !== "object" || event === null || !("event" in event) || event.event !== "ready" || !("port" in event) || typeof event.port !== "number") {
        throw new Error(`Unexpected startup event: ${output}`)
      }
      return event.port
    }
  })()
  try {
    const port = await Promise.race([ready, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Sidecar ready timeout")), 30_000) })])
    return { child, port, baseUrl: `http://127.0.0.1:${port}`, reader }
  } catch (error) {
    child.kill("SIGKILL")
    await child.exited
    throw error
  } finally { clearTimeout(timer) }
}

/** What a crash looks like: no goodbye, no shutdown command. */
async function kill(running: Running): Promise<void> {
  running.child.kill("SIGKILL")
  await running.child.exited
  await running.reader.cancel().catch(() => undefined)
}

async function shutdown(running: Running): Promise<void> {
  if (running.child.exitCode !== null) return
  const stdin = running.child.stdin as unknown as { write(text: string): void; flush(): void }
  stdin.write('{"event":"shutdown"}\n')
  stdin.flush()
  await Promise.race([running.child.exited, sleep(15_000)])
  if (running.child.exitCode === null) running.child.kill("SIGKILL")
  await running.child.exited
  await running.reader.cancel().catch(() => undefined)
}

/** The typed client built exactly as `App.tsx` builds it. */
const connect = (first: Running) => {
  const endpoint: Endpoint = { baseUrl: first.baseUrl, token }
  const runtime = runtimeForLayer(clientLayer(endpoint, retryingWrites(followingFetch(endpoint))))
  return { runtime, client: readClient(runtime) }
}

const escapes: unknown[] = []
const onRejection = (reason: unknown) => { escapes.push(reason) }

beforeAll(() => { process.on("unhandledRejection", onRejection) })
afterAll(() => { process.off("unhandledRejection", onRejection) })
afterEach(async () => {
  resetEndpoint()
  for (const child of spawned) { if (child.exitCode === null) child.kill("SIGKILL"); await child.exited }
  spawned.clear()
})

const isTransportError = (error: unknown): boolean => {
  const tag = typeof error === "object" && error !== null && "_tag" in error ? String((error as { _tag: unknown })._tag) : ""
  return tag === "TransportError" || tag === "HttpClientError" || tag === "RequestError" || /TransportError/.test(String(error))
}

/** Runs every promise to the end, so a failure names the call that failed instead of hiding the others. */
const settle = async <T>(calls: ReadonlyArray<Promise<T>>) => {
  const results = await Promise.allSettled(calls)
  const failures = results.flatMap((result, index) => result.status === "rejected" ? [`call ${index}: ${String(result.reason)}`] : [])
  expect(failures).toEqual([])
  expect(results.every((result) => result.status === "fulfilled" && !isTransportError(result.value))).toBe(true)
  return results.map((result) => (result as PromiseFulfilledResult<T>).value)
}

const names = async (runtime: ReturnType<typeof connect>["runtime"], client: Client) =>
  (await runtime.run(client.projects.list())).map((project) => project.name).sort()

describe("sidecar restart after a crash", () => {
  // The killed sidecar's task lease is still valid for 30 s; its replacement takes it over because its owner process is gone.
  test("a SIGKILLed sidecar can be restarted at once on the same data dir", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "cadcamfun-chaos-lease-"))
    try {
      const a = await start(dataDir)
      await kill(a)
      const b = await start(dataDir)
      expect(b.port).toBeGreaterThan(0)
      await shutdown(b)
    } finally { rmSync(dataDir, { recursive: true, force: true }) }
  })
})

describe("desktop transport against a real sidecar restart", () => {
  test("1: restarting event, kill, new port, concurrent reads and a write during the restart, then ready", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "cadcamfun-chaos-1-"))
    const a = await start(dataDir)
    const { runtime, client: pending } = connect(a)
    try {
      const client = await pending
      expect(await names(runtime, client)).toEqual([])
      await runtime.run(client.projects.create({ payload: { name: "Before" } }))
      expect(await names(runtime, client)).toEqual(["Before"])

      acceptSidecarStatus({ state: "restarting" })
      await kill(a)
      // The calls start while nothing answers on the old port and the new one does not exist yet.
      const during = [
        runtime.run(client.projects.list()),
        runtime.run(client.projects.list()),
        runtime.run(client.projects.create({ payload: { name: "During" } })),
        runtime.run(client.projects.list()),
        runtime.run(client.projects.list())
      ] as const
      await sleep(300)
      const b = await start(dataDir)
      expect(b.port).not.toBe(a.port)
      await sleep(200)
      acceptSidecarStatus({ state: "ready", port: b.port })

      const results = (await settle(during as unknown as readonly Promise<unknown>[])) as readonly unknown[]
      const created = results[2] as { name: string }
      expect(created.name).toBe("During")
      for (const index of [0, 1, 3, 4]) {
        const rows = results[index] as ReadonlyArray<{ name: string }>
        expect(rows.map((row) => row.name)).toContain("Before")
      }
      // The write was applied exactly once, whatever the number of attempts that went out.
      expect(await names(runtime, client)).toEqual(["Before", "During"])
      await shutdown(b)
    } finally { runtime.dispose() }
    rmSync(dataDir, { recursive: true, force: true })
    expect(escapes.filter(isTransportError)).toEqual([])
  })

  test("2: kill without a restarting event, ready arrives about 1.5 s later; reads still succeed through retry", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "cadcamfun-chaos-2-"))
    const a = await start(dataDir)
    const { runtime, client: pending } = connect(a)
    try {
      const client = await pending
      await runtime.run(client.projects.create({ payload: { name: "Kept" } }))
      await kill(a)
      const b = await start(dataDir)
      expect(b.port).not.toBe(a.port)
      const started = Date.now()
      // The shell has not noticed yet: the first attempts hit the dead port; ready comes later.
      setTimeout(() => acceptSidecarStatus({ state: "ready", port: b.port }), 1500)
      const reads = await settle([
        runtime.run(client.projects.list()),
        runtime.run(client.projects.list()),
        runtime.run(client.projects.list())
      ])
      for (const rows of reads) expect(rows.map((row) => row.name)).toEqual(["Kept"])
      expect(Date.now() - started).toBeGreaterThanOrEqual(1400)
      // And a write after the rebind lands once.
      await runtime.run(client.projects.create({ payload: { name: "After" } }))
      expect(await names(runtime, client)).toEqual(["After", "Kept"])
      await shutdown(b)
    } finally { runtime.dispose() }
    rmSync(dataDir, { recursive: true, force: true })
    expect(escapes.filter(isTransportError)).toEqual([])
  })

  test("3: the open live stream dies with the sidecar; after ready the reconnect gets server.connected from the new one", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "cadcamfun-chaos-3-"))
    const a = await start(dataDir)
    const { runtime, client: pending } = connect(a)
    const abort = new AbortController()
    try {
      const client = await pending
      const greetings: number[] = []
      let streamEnds = 0
      // The reconnect loop of `startLiveSync`: subscribe, drain, wait out a backoff that doubles, subscribe again.
      const loop = (async () => {
        let delay = 1000
        while (!abort.signal.aborted) {
          try {
            await runtime.run(Effect.flatMap(client.events.subscribeAll(), (stream) =>
              Stream.runForEach(stream, (event: LiveEvent) => Effect.sync(() => {
                delay = 1000
                if (event.type === "server.connected") greetings.push(Date.now())
              }))), { signal: abort.signal })
          } catch { /* a reconnect greeting repairs missed events */ }
          streamEnds++
          if (abort.signal.aborted) break
          await sleep(delay)
          delay = Math.min(delay * 2, 30_000)
        }
      })()
      const until = async (probe: () => boolean, ms: number, what: string) => {
        const deadline = Date.now() + ms
        while (!probe()) { if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`); await sleep(20) }
      }
      await until(() => greetings.length === 1, 10_000, "the greeting from sidecar A")
      acceptSidecarStatus({ state: "restarting" })
      await kill(a)
      await until(() => streamEnds >= 1, 10_000, "the stream to end with sidecar A")
      const b = await start(dataDir)
      expect(b.port).not.toBe(a.port)
      acceptSidecarStatus({ state: "ready", port: b.port })
      const readyAt = Date.now()
      await until(() => greetings.length === 2, 10_000, "the greeting from sidecar B")
      expect(greetings[1]! - readyAt).toBeLessThan(5000)
      // The new stream is live and the same client reads from B.
      expect(await names(runtime, client)).toEqual([])
      abort.abort()
      await loop
      await shutdown(b)
    } finally { abort.abort(); runtime.dispose() }
    rmSync(dataDir, { recursive: true, force: true })
    expect(escapes.filter(isTransportError)).toEqual([])
  })
})
