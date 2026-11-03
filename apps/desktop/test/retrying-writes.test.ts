import { expect, test } from "bun:test"
import { retryingWrites } from "../src/app/retrying-writes.ts"

type Step = Response | Error
/** A fetch that answers from a script and records what it was sent. */
const scripted = (steps: Step[]) => {
  const seen: Array<{ method: string; url: string; key: string | null; body: string }> = []
  const base = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    seen.push({ method: request.method, url: request.url, key: request.headers.get("idempotency-key"), body: await request.text() })
    const step = steps.shift() ?? new Response("exhausted", { status: 500 })
    if (step instanceof Error) throw step
    return step
  }, { preconnect: fetch.preconnect })
  return { base, seen }
}
const fast = { sleep: async () => undefined }
const post = (path = "/api/projects", body = '{"name":"A"}', extra: RequestInit = {}) => new Request(`http://127.0.0.1:3001${path}`, { method: "POST", body, headers: { "content-type": "application/json" }, ...extra })

test("a write lost to a network error is sent again with the same key and the whole body, and its answer returned", async () => {
  const { base, seen } = scripted([new TypeError("fetch failed"), new TypeError("fetch failed"), Response.json({ id: "p1" }, { status: 201 })])
  const response = await retryingWrites(base, fast)(post())
  expect(response.status).toBe(201)
  expect(await response.json()).toEqual({ id: "p1" })
  expect(seen).toHaveLength(3)
  expect(new Set(seen.map((s) => s.key)).size).toBe(1)
  expect(seen[0]!.key).toMatch(/^[0-9a-f-]{36}$/)
  expect(seen.map((s) => s.body)).toEqual(['{"name":"A"}', '{"name":"A"}', '{"name":"A"}'])
})

test("a gateway answer (502, 503, 504) is retried; any other status, a 500 included, is returned at once", async () => {
  const gateway = scripted([new Response("", { status: 503 }), new Response("", { status: 502 }), Response.json({ ok: true })])
  expect((await retryingWrites(gateway.base, fast)(post())).status).toBe(200)
  expect(gateway.seen).toHaveLength(3)
  const refused = scripted([new Response("boom", { status: 500 }), Response.json({ ok: true })])
  expect((await retryingWrites(refused.base, fast)(post())).status).toBe(500)
  expect(refused.seen).toHaveLength(1)
  const conflict = scripted([new Response("", { status: 409 })])
  expect((await retryingWrites(conflict.base, fast)(post())).status).toBe(409)
})

test("the caller's own key is kept; reads and the chat routes are not touched", async () => {
  const own = scripted([Response.json({})])
  await retryingWrites(own.base, fast)(post("/api/projects", "{}", { headers: { "idempotency-key": "mine-1" } }))
  expect(own.seen[0]!.key).toBe("mine-1")

  const read = scripted([new TypeError("fetch failed"), Response.json({})])
  await expect(retryingWrites(read.base, fast)(new Request("http://127.0.0.1:3001/api/projects"))).rejects.toThrow("fetch failed")
  expect(read.seen).toHaveLength(1)
  expect(read.seen[0]!.key).toBeNull()

  const chat = scripted([new TypeError("fetch failed"), Response.json({})])
  await expect(retryingWrites(chat.base, fast)(post("/api/ai/chat", "{}"))).rejects.toThrow("fetch failed")
  expect(chat.seen).toHaveLength(1)
  expect(chat.seen[0]!.key).toBeNull()
})

test("after the last attempt the failure is surfaced: the last gateway answer, or the last network error", async () => {
  const down = scripted([new Response("", { status: 503 }), new Response("", { status: 503 }), new Response("", { status: 504 })])
  expect((await retryingWrites(down.base, fast)(post())).status).toBe(504)
  const dead = scripted([new TypeError("one"), new TypeError("two"), new TypeError("three")])
  await expect(retryingWrites(dead.base, fast)(post())).rejects.toThrow("three")
  expect(dead.seen).toHaveLength(3)
})

test("an aborted request is not retried, and the waits double", async () => {
  const controller = new AbortController()
  const { base, seen } = scripted([new TypeError("fetch failed"), Response.json({})])
  controller.abort()
  await expect(retryingWrites(base, fast)(post("/api/projects", "{}", { signal: controller.signal }))).rejects.toThrow()
  expect(seen.length).toBeLessThanOrEqual(1)

  const waits: number[] = []
  const slow = scripted([new TypeError("a"), new TypeError("b"), Response.json({})])
  await retryingWrites(slow.base, { delayMs: 100, sleep: async (ms) => { waits.push(ms) } })(post())
  expect(waits).toEqual([100, 200])
})
