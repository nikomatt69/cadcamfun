import { expect, test } from "bun:test"
import { abortable, createCloudTransport, createFetchTransport, createPinnedTransport, type PinnedModule, type StreamHandle } from "../modules/companion-net/transport"
import { CompanionError } from "../lib/client"
import type { Pairing } from "../lib/pairing"

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

test("the account's access token travels as x-identity-token and the pairing keeps the bearer", async () => {
  const seen: Record<string, string>[] = []
  const module = { ...moduleFor({ readNext: async () => ({ done: true }), cancel() {} }), request: async (_b: string, _p: string, _m: string, headers: Record<string, string>) => { seen.push(headers); return { status: 200, body: "{}" } } }
  await createPinnedTransport(pairing, module, async () => "jwt-1").request("/api/projects", "GET")
  await createPinnedTransport(pairing, module, async () => undefined).request("/api/projects", "GET")
  expect(seen[0]?.["x-identity-token"]).toBe("jwt-1")
  expect(seen[0]?.authorization).toBe(`Bearer ${pairing.token}`)
  expect(seen[1]?.["x-identity-token"]).toBeUndefined()
})

const cloudPairing: Pairing = { baseUrl: "https://cloud.cadcam.fun", token: pairing.token, name: "Cloud", fingerprint: "", mode: "cloud", workspaceId: "workspace-123" }

test("native cloud requests select the explicit PKI ABI and expose conditional/back-off headers", async () => {
  const seen: Record<string, string>[] = []
  const module: PinnedModule = {
    request: async () => { throw new Error("Pinned ABI must not be selected for cloud") },
    streamStart: async () => { throw new Error("Pinned ABI must not be selected for cloud") },
    cloudRequest: async (_b, _p, _m, headers) => { seen.push(headers); return { status: 200, body: "{}", headers: { ETag: '"revision"', "Retry-After": "3", "set-cookie": "hidden" } } },
    cloudStreamStart: async (_b, _p, _m, headers) => { seen.push(headers); return { readNext: async () => ({ done: true, status: 200 }), cancel() {} } },
  }
  const transport = createCloudTransport(cloudPairing, module, async () => "signed-jwt")
  const response = await transport.request("/api/projects", "GET", undefined, undefined, { "if-none-match": '"revision"', "x-identity-token": "injected", authorization: "injected" })
  await transport.stream("/api/events", "GET").next()
  expect(response.headers).toEqual({ etag: '"revision"', "retry-after": "3" })
  expect(seen).toHaveLength(2)
  expect(seen[0]?.["x-identity-token"]).toBe("signed-jwt")
  expect(seen[0]?.authorization).toBe(`Bearer ${pairing.token}`)
  expect(seen[0]?.["if-none-match"]).toBe('"revision"')
})

test("cloud sign-out and failed refresh refuse both request and stream before any native call", async () => {
  let calls = 0
  const module: PinnedModule = {
    ...moduleFor({ readNext: async () => ({ done: true }), cancel() {} }),
    cloudRequest: async () => { calls++; return { status: 200, body: "{}" } },
    cloudStreamStart: async () => { calls++; return { readNext: async () => ({ done: true }), cancel() {} } },
  }
  for (const identity of [undefined, async () => undefined, async (): Promise<string> => { throw new Error("Refresh failed") }]) {
    const transport = createCloudTransport(cloudPairing, module, identity)
    await expect(transport.request("/api/projects", "GET")).rejects.toBeInstanceOf(CompanionError)
    await expect(transport.stream("/api/events", "GET").next()).rejects.toBeInstanceOf(CompanionError)
  }
  expect(calls).toBe(0)
})

test("cloud PKI failure and an older native build never fall back to pinned or browser requests", async () => {
  const old = moduleFor({ readNext: async () => ({ done: true }), cancel() {} })
  await expect(createCloudTransport(cloudPairing, old, async () => "jwt").request("/api/projects", "GET")).rejects.toThrow("updated")
  const module: PinnedModule = { ...old, cloudRequest: async () => { throw new Error("HTTPS certificate verification failed") }, cloudStreamStart: async () => { throw new Error("HTTPS certificate verification failed") } }
  const transport = createCloudTransport(cloudPairing, module, async () => "jwt")
  await expect(transport.request("/api/projects", "GET")).rejects.toThrow("certificate")
  await expect(transport.stream("/api/events", "GET").next()).rejects.toThrow("certificate")
  await expect(createPinnedTransport(cloudPairing, old).request("/api/projects", "GET")).rejects.toThrow("cloud transport")
  expect(() => createCloudTransport(pairing, old)).toThrow("Invalid cloud")
})

test("cloud stream refusal carries Retry-After and cancellation releases its handle", async () => {
  let cancelled = 0
  const module: PinnedModule = { ...moduleFor({ readNext: async () => ({ done: true }), cancel() {} }), cloudRequest: async () => ({ status: 200, body: "{}" }), cloudStreamStart: async () => ({ readNext: async () => ({ done: true, status: 429, headers: { "Retry-After": "7" } }), cancel: () => cancelled++ }) }
  try {
    await createCloudTransport(cloudPairing, module, async () => "jwt").stream("/api/events", "GET").next()
    throw new Error("Expected refusal")
  } catch (error) {
    expect(error).toBeInstanceOf(CompanionError)
    expect((error as CompanionError).retryAfterMs).toBe(7000)
  }
  expect(cancelled).toBe(1)
})

test("cancelling cloud authentication does not wait for a stuck refresh or start the native request later", async () => {
  let calls = 0
  let release: (token: string) => void = () => {}
  const identity = new Promise<string>((resolve) => { release = resolve })
  const module: PinnedModule = { ...moduleFor({ readNext: async () => ({ done: true }), cancel() {} }), cloudRequest: async () => { calls++; return { status: 200, body: "{}" } }, cloudStreamStart: async () => { calls++; return { readNext: async () => ({ done: true }), cancel() {} } } }
  const controller = new AbortController()
  const transport = createCloudTransport(cloudPairing, module, () => identity)
  const request = transport.request("/api/projects", "GET", undefined, controller.signal)
  const stream = transport.stream("/api/events", "GET", undefined, controller.signal).next()
  const observed = Promise.allSettled([request, stream])
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.resolve()
    controller.abort()
    const results = await Promise.race([observed, new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error("Cancellation waited for refresh")), 1000) })])
    for (const result of results) {
      expect(result.status).toBe("rejected")
      if (result.status === "rejected") expect((result.reason as Error).message).toContain("cancelled")
    }
    expect(calls).toBe(0)
  } finally {
    clearTimeout(timeout)
    release("late-jwt")
  }
})

test("browser cloud mode also fails closed and refuses redirects", async () => {
  let calls = 0
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls++
    expect(init?.redirect).toBe("error")
    expect(new Headers(init?.headers).get("x-identity-token")).toBe("jwt")
    return Response.json({})
  }) as typeof fetch
  await expect(createFetchTransport(cloudPairing, fetcher).request("/api/projects", "GET")).rejects.toBeInstanceOf(CompanionError)
  await expect(createFetchTransport(cloudPairing, fetcher).stream("/api/events", "GET").next()).rejects.toBeInstanceOf(CompanionError)
  expect(calls).toBe(0)
  await createFetchTransport(cloudPairing, fetcher, async () => "jwt").request("/api/projects", "GET")
  expect(calls).toBe(1)
})
