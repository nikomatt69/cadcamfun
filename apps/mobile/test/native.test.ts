import { describe, expect, test } from "bun:test"
import { keychainStore, pinnedFetch, type NativeBridge } from "../src/companion/native.ts"

const FP = "ab".repeat(32)

const bridge = (handlers: Record<string, (args: Record<string, unknown>) => unknown>, onChannel?: (cb: (m: unknown) => void) => void): NativeBridge => ({
  invoke: async <T,>(command: string, args: Record<string, unknown> = {}) => {
    const handler = handlers[command]
    if (!handler) throw new Error(`unexpected command ${command}`)
    return handler(args) as T
  },
  channel: <T,>(cb: (m: T) => void) => {
    onChannel?.(cb as (m: unknown) => void)
    return { __channel: true }
  },
})

describe("pinnedFetch", () => {
  test("sends the fingerprint, headers and body to Rust and rebuilds the Response", async () => {
    let seen: Record<string, unknown> = {}
    const f = pinnedFetch(bridge({ companion_request: (args) => ((seen = args), { status: 201, headers: [["content-type", "application/json"]], body: Array.from(new TextEncoder().encode('{"ok":true}')) }) }), FP)
    const res = await f("https://192.168.1.20:8443/api/projects/p/vcs/commit", { method: "POST", headers: { authorization: "Bearer t", "content-type": "application/json" }, body: '{"message":"x"}' })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ ok: true })
    expect(seen.fingerprint).toBe(FP)
    const req = seen.request as { method: string; url: string; headers: Array<[string, string]>; body: number[] }
    expect(req).toMatchObject({ method: "POST", url: "https://192.168.1.20:8443/api/projects/p/vcs/commit" })
    expect(req.headers).toContainEqual(["authorization", "Bearer t"])
    expect(new TextDecoder().decode(new Uint8Array(req.body))).toBe('{"message":"x"}')
  })

  test("a 204 has no body", async () => {
    const f = pinnedFetch(bridge({ companion_request: () => ({ status: 204, headers: [], body: [] }) }), FP)
    expect((await f("https://h/api/x")).status).toBe(204)
  })

  test("the assistant stream is delivered chunk by chunk", async () => {
    let send: (m: unknown) => void = () => {}
    const f = pinnedFetch(bridge({
      companion_stream: async () => {
        send({ event: "head", data: { status: 200, headers: [["content-type", "text/event-stream"]] } })
        send({ event: "chunk", data: Array.from(new TextEncoder().encode("data: one\n\n")) })
        send({ event: "chunk", data: Array.from(new TextEncoder().encode("data: two\n\n")) })
        send({ event: "end" })
      },
    }, (cb) => (send = cb)), FP)
    const res = await f("https://h/api/ai/chat/stream", { method: "POST", body: "{}" })
    expect(res.headers.get("content-type")).toBe("text/event-stream")
    expect(await res.text()).toBe("data: one\n\ndata: two\n\n")
  })

  test("a pinning failure surfaces as a readable error", async () => {
    const f = pinnedFetch(bridge({ companion_request: () => { throw { kind: "connect", message: "certificate fingerprint does not match the paired desktop" } } }), FP)
    await expect(f("https://h/api/x")).rejects.toMatchObject({ message: expect.stringContaining("fingerprint") })
  })
})

describe("keychainStore", () => {
  test("round trips the pairing through the Keychain commands only", async () => {
    const vault = new Map<string, string>()
    const store = keychainStore(bridge({
      secret_get: ({ key }) => vault.get(key as string) ?? null,
      secret_set: ({ key, value }) => void vault.set(key as string, value as string),
      secret_delete: ({ key }) => void vault.delete(key as string),
    }))
    expect(await store.load()).toBeUndefined()
    const pairing = { baseUrl: "https://192.168.1.20:8443", token: "t".repeat(32), fingerprint: FP, name: "Studio" }
    await store.save(pairing)
    expect(await store.load()).toEqual(pairing)
    await store.clear()
    expect(await store.load()).toBeUndefined()
  })
})
