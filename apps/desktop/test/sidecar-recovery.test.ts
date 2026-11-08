import { afterEach, expect, test } from "bun:test"
import { acceptSidecarStatus, followingFetch, resetEndpoint, sidecarNotice, type Endpoint } from "../src/app/sidecar.ts"
import { clientLayer, readClient, runtimeForLayer } from "../src/app/client.ts"

const endpoint: Endpoint = { baseUrl: "http://127.0.0.1:3001", token: "launch-token" }
afterEach(resetEndpoint)

test("an already constructed typed client follows the ready port, preserving auth and schema decoding", async () => {
  const seen: Array<{ url: string; auth: string | null }> = []
  const base = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    seen.push({ url: request.url, auth: request.headers.get("authorization") })
    return Response.json([])
  }, { preconnect: fetch.preconnect })
  const runtime = runtimeForLayer(clientLayer(endpoint, followingFetch(endpoint, base)))
  try {
    const client = await readClient(runtime)
    await runtime.run(client.projects.list())
    acceptSidecarStatus({ state: "restarting" })
    acceptSidecarStatus({ state: "ready", port: 4999 })
    expect(await runtime.run(client.projects.list())).toEqual([])
    expect(seen).toEqual([
      { url: "http://127.0.0.1:3001/api/projects", auth: "Bearer launch-token" },
      { url: "http://127.0.0.1:4999/api/projects", auth: "Bearer launch-token" }
    ])
  } finally { runtime.dispose() }
})

test("request bodies, headers, query and cancellation survive while other origins remain untouched", async () => {
  const requests: Request[] = []
  const base = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init); requests.push(request)
    return new Response("ok")
  }, { preconnect: fetch.preconnect })
  const transport = followingFetch(endpoint, base)
  acceptSidecarStatus({ state: "ready", port: 4002 })
  const abort = new AbortController()
  await transport(new Request(`${endpoint.baseUrl}/api/test?x=1`, { method: "POST", body: "payload", headers: { "x-test": "yes" }, signal: abort.signal }))
  expect(requests[0]!.url).toBe("http://127.0.0.1:4002/api/test?x=1")
  expect(await requests[0]!.text()).toBe("payload")
  expect(requests[0]!.headers.get("x-test")).toBe("yes")
  abort.abort()
  expect(requests[0]!.signal.aborted).toBe(true)
  await transport("https://example.com/test")
  expect(requests[1]!.url).toBe("https://example.com/test")
})

test("invalid or non-ready status payloads cannot redirect a client", async () => {
  const urls: string[] = []
  const base = Object.assign(async (input: RequestInfo | URL) => { urls.push(String(input)); return new Response() }, { preconnect: fetch.preconnect })
  for (const payload of [null, {}, { state: "ready", port: "4" }, { state: "ready", port: 0 }, { state: "ready", port: 65536 }, { state: "ready", port: 1.5 }, { state: "failed", port: 5 }]) acceptSidecarStatus(payload)
  await followingFetch(endpoint, base)(`${endpoint.baseUrl}/api/health`)
  expect(urls).toEqual([`${endpoint.baseUrl}/api/health`])
})

test("the person is told about a restart once, about the recovery, and about a permanent failure; a first start is silent", () => {
  const replay = (payloads: unknown[]) => {
    let restarting = false
    const notices: unknown[] = []
    for (const payload of payloads) {
      const next = sidecarNotice(payload, restarting)
      restarting = next.restarting
      if (next.notice !== undefined) notices.push(next.notice)
    }
    return notices
  }
  expect(replay([{ state: "starting" }, { state: "ready", port: 3001 }])).toEqual([])
  expect(replay([{ state: "ready", port: 3001 }, { state: "restarting" }, { state: "restarting" }, { state: "ready", port: 4999 }])).toEqual(["restarting", "recovered"])
  expect(replay([{ state: "restarting" }, { state: "failed", message: "x" }])).toEqual(["restarting", "failed"])
  // A second crash after a recovery is announced again; malformed payloads change nothing.
  expect(replay([{ state: "restarting" }, { state: "ready", port: 1 }, { state: "restarting" }, null, 7, {}])).toEqual(["restarting", "recovered", "restarting"])
})

const recorder = () => {
  const urls: string[] = []
  const base = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => { urls.push(new Request(input, init).url); return new Response("ok") }, { preconnect: fetch.preconnect })
  return { urls, base }
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 10))

test("a call made while the sidecar restarts waits for the new port instead of failing against the old one", async () => {
  const { urls, base } = recorder()
  const transport = followingFetch(endpoint, base)
  acceptSidecarStatus({ state: "ready", port: 4001 })
  acceptSidecarStatus({ state: "restarting" })
  const pending = transport(`${endpoint.baseUrl}/api/projects`)
  await tick()
  expect(urls).toEqual([])
  acceptSidecarStatus({ state: "ready", port: 4002 })
  await pending
  expect(urls).toEqual(["http://127.0.0.1:4002/api/projects"])
})

test("a permanent failure, a reset and an abort all release the calls that wait", async () => {
  for (const release of [() => acceptSidecarStatus({ state: "failed", message: "x" }), () => resetEndpoint()]) {
    const { urls, base } = recorder()
    acceptSidecarStatus({ state: "restarting" })
    const pending = followingFetch(endpoint, base)(`${endpoint.baseUrl}/api/projects`)
    await tick()
    expect(urls).toEqual([])
    release()
    await pending
    expect(urls).toHaveLength(1)
  }
  const { urls, base } = recorder()
  acceptSidecarStatus({ state: "restarting" })
  const abort = new AbortController()
  const pending = followingFetch(endpoint, base)(`${endpoint.baseUrl}/api/projects`, { signal: abort.signal })
  abort.abort()
  await pending.catch(() => undefined)
  expect(urls.length).toBeLessThanOrEqual(1)
})

test("another origin never waits for the sidecar", async () => {
  const { urls, base } = recorder()
  acceptSidecarStatus({ state: "restarting" })
  await followingFetch(endpoint, base)("https://example.com/x")
  expect(urls).toEqual(["https://example.com/x"])
})
