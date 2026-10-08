import { describe, expect, test } from "bun:test"
import { CompanionClient, CompanionError } from "../src/companion/client.ts"
import { PairingError, parsePairingLink } from "../src/companion/pairing.ts"
import { sseParser } from "../src/companion/sse.ts"

const FP = "ab".repeat(32)
const link = (over: Record<string, string> = {}) => {
  const q = new URLSearchParams({ host: "https://192.168.1.20:8443", token: "t".repeat(32), fp: FP, name: "Studio Mac", ...over })
  return `cadcamfun://pair?${q}`
}

describe("pairing", () => {
  test("parses a valid link", () => {
    expect(parsePairingLink(link())).toEqual({ baseUrl: "https://192.168.1.20:8443", token: "t".repeat(32), fingerprint: FP, name: "Studio Mac" })
  })
  test("rejects insecure or malformed links", () => {
    for (const bad of [link({ host: "http://192.168.1.20" }), link({ token: "short" }), link({ fp: "zz" }), "https://example.com", "nonsense", link({ host: "nope" })]) {
      expect(() => parsePairingLink(bad)).toThrow(PairingError)
    }
  })
})

describe("sse", () => {
  test("reassembles frames split across chunks and skips garbage", () => {
    const parse = sseParser()
    expect(parse('data: {"type":"delta","sessionId":"s","te')).toEqual([])
    expect(parse('xt":"Hi"}\n\ndata: not json\n\n: comment\n\ndata: {"type":"done","sessionId":"s","text":"Hi"}\r\n\r\n')).toEqual([
      { type: "delta", sessionId: "s", text: "Hi" },
      { type: "done", sessionId: "s", text: "Hi" },
    ])
  })
})

describe("CompanionClient", () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fake = (respond: (url: string, init: RequestInit) => Response) =>
    new CompanionClient({ baseUrl: "https://mac", token: "tok" }, (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return respond(url, init)
    }) as unknown as typeof fetch)

  test("sends the bearer token and JSON bodies; maps errors", async () => {
    const client = fake((url) => (url.endsWith("/merge") ? new Response(JSON.stringify({ message: "A reviewer requested changes" }), { status: 403 }) : Response.json({ ok: true }, { status: 201 })))
    await client.review("p 1", 3, "approve", "LGTM")
    expect(calls[0]!.url).toBe("https://mac/api/projects/p%201/pulls/3/reviews")
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer tok")
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ verdict: "approve", body: "LGTM" })
    const err = await client.merge("p", 3).catch((e) => e)
    expect(err).toBeInstanceOf(CompanionError)
    expect(err).toMatchObject({ status: 403, message: "A reviewer requested changes" })
  })

  test("streams assistant events", async () => {
    const enc = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('data: {"type":"tool_call","sessionId":"s","callId":"1","tool":"vcs_start_change","input":{}}\n\ndata: {"type":"del'))
        c.enqueue(enc.encode('ta","sessionId":"s","text":"Done"}\n\n'))
        c.close()
      },
    })
    const client = fake(() => new Response(body))
    const types: string[] = []
    for await (const e of client.chat("p", "make the plate wider")) types.push(e.type)
    expect(types).toEqual(["tool_call", "delta"])
  })
})
