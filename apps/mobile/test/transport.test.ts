import { expect, test } from "bun:test"
import { abortable, createFetchTransport, createPinnedTransport, type PinnedModule, type StreamHandle } from "../modules/companion-net/transport"

const pairing = { baseUrl: "https://desktop.local", token: "0123456789abcdef", fingerprint: "a".repeat(64), name: "Desktop" }
const moduleFor = (handle: StreamHandle): PinnedModule => ({ request: async () => ({ status: 200, body: "{}" }), streamStart: async () => handle })

test("awaits the native stream handle and exits on done, releasing it", async () => {
  let reads = 0, cancelled = 0
  const transport = createPinnedTransport(pairing, moduleFor({ readNext: async () => ++reads === 1 ? { done: false, data: "frame" } : { done: true, status: 200 }, cancel: () => cancelled++ }))
  const chunks = []
  for await (const chunk of transport.stream("/api/events", "GET")) chunks.push(chunk)
  expect(chunks).toEqual(["frame"])
  expect(reads).toBe(2)
  expect(cancelled).toBe(1)
})

test("native HTTP errors and native failures surface instead of silent success", async () => {
  for (const terminal of [{ done: true, status: 401 }, { done: true, error: "Pin mismatch" }]) {
    const transport = createPinnedTransport(pairing, moduleFor({ readNext: async () => terminal, cancel() {} }))
    await expect(transport.stream("/api/events", "GET").next()).rejects.toThrow()
  }
})

test("aborting a blocked read cancels its native handle", async () => {
  const controller = new AbortController()
  let cancelled = 0
  const transport = createPinnedTransport(pairing, moduleFor({ readNext: () => new Promise(() => {}), cancel: () => cancelled++ }))
  const pending = transport.stream("/api/events", "GET", undefined, controller.signal).next()
  await Promise.resolve()
  controller.abort()
  await expect(pending).rejects.toThrow("cancelled")
  expect(cancelled).toBeGreaterThan(0)
})

test("settled reads remove abort listeners", async () => {
  const controller = new AbortController()
  let added = 0, removed = 0
  const add = controller.signal.addEventListener.bind(controller.signal)
  const remove = controller.signal.removeEventListener.bind(controller.signal)
  controller.signal.addEventListener = ((...args: Parameters<AbortSignal["addEventListener"]>) => { added++; return add(...args) }) as AbortSignal["addEventListener"]
  controller.signal.removeEventListener = ((...args: Parameters<AbortSignal["removeEventListener"]>) => { removed++; return remove(...args) }) as AbortSignal["removeEventListener"]
  for (let i = 0; i < 20; i++) await abortable(controller.signal, Promise.resolve(i))
  expect(added).toBe(20)
  expect(removed).toBe(20)
})

test("browser/test transport preserves split UTF-8 and releases stream reader", async () => {
  const bytes = new TextEncoder().encode("café 🛠️")
  const fetcher = (async () => new Response(new ReadableStream({ start(c) { for (const byte of bytes) c.enqueue(Uint8Array.of(byte)); c.close() } }))) as unknown as typeof fetch
  const transport = createFetchTransport(pairing, fetcher)
  let text = ""
  for await (const chunk of transport.stream("/api/events", "GET")) text += chunk
  expect(text).toBe("café 🛠️")
})
