import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test"
import { act, createElement, type ReactNode } from "react"
import { createRequire } from "node:module"
interface TestRoot { render(node: ReactNode): void; unmount(): void }
const { createRoot } = createRequire(import.meta.url)("react-dom/client") as { createRoot: (container: Element) => TestRoot }
import { Window } from "../../desktop/node_modules/happy-dom/lib/index.js"
import { useResource } from "../lib/use-resource"

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
let win: Window
const previous = new Map<string, PropertyDescriptor | undefined>()
beforeAll(() => {
  win = new Window({ url: "http://localhost" })
  for (const key of ["window", "document", "navigator", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"]) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : (win as unknown as Record<string, unknown>)[key] })
  }
})
afterAll(() => {
  for (const [key, value] of previous) {
    if (value) Object.defineProperty(globalThis, key, value)
    else Reflect.deleteProperty(globalThis, key)
  }
  win.happyDOM.abort()
})

const harness = () => {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: TestRoot = createRoot(container)
  let current!: ReturnType<typeof useResource<string>>
  function Probe({ fetcher, resourceKey }: { fetcher: (signal: AbortSignal) => Promise<string>; resourceKey: string }) {
    current = useResource(fetcher, resourceKey)
    return null
  }
  return {
    read: () => current,
    render: async (fetcher: (signal: AbortSignal) => Promise<string>, resourceKey = "project") => { await act(async () => root.render(createElement(Probe, { fetcher, resourceKey }))) },
    dispose: async () => { await act(async () => root.unmount()); container.remove() }
  }
}

describe("mobile resource request ownership", () => {
  test("changing desktop client with the same key aborts the old fetch and ignores its late result", async () => {
    const old = deferred<string>(), next = deferred<string>()
    let oldSignal!: AbortSignal
    const first = (signal: AbortSignal) => { oldSignal = signal; return old.promise }
    const second = () => next.promise
    const view = harness()
    try {
      await view.render(first)
      await view.render(second)
      expect(oldSignal.aborted).toBe(true)
      await act(async () => { next.resolve("new desktop"); await next.promise })
      expect(view.read().data).toBe("new desktop")
      await act(async () => { old.resolve("old desktop"); await old.promise })
      expect(view.read().data).toBe("new desktop")
      expect(view.read().loading).toBe(false)
    } finally { await view.dispose() }
  })

  test("manual reload cancels its predecessor and keeps stale content while refreshing", async () => {
    const pending = deferred<string>()
    let calls = 0, signal!: AbortSignal
    const fetcher = (nextSignal: AbortSignal) => { calls += 1; signal = nextSignal; return calls === 1 ? Promise.resolve("initial") : pending.promise }
    const view = harness()
    try {
      await view.render(fetcher)
      expect(view.read().data).toBe("initial")
      let first!: Promise<void>, second!: Promise<void>
      await act(async () => { first = view.read().reload() })
      const superseded = signal
      expect(view.read().data).toBe("initial")
      expect(view.read().loading).toBe(true)
      await act(async () => { second = view.read().reload() })
      expect(superseded.aborted).toBe(true)
      await act(async () => { pending.resolve("updated"); await Promise.all([first, second]) })
      expect(view.read().data).toBe("updated")
      expect(view.read().error).toBeUndefined()
    } finally { await view.dispose() }
  })

  test("unmount aborts work and prevents reload from launching another request", async () => {
    const pending = deferred<string>()
    let signal!: AbortSignal, calls = 0
    const fetcher = (value: AbortSignal) => { signal = value; calls += 1; return pending.promise }
    const view = harness()
    await view.render(fetcher)
    const reload = view.read().reload
    await view.dispose()
    expect(signal.aborted).toBe(true)
    pending.resolve("late")
    await pending.promise
    await reload()
    expect(calls).toBe(1)
  })
})


describe("mobile pairing provider lifecycle", () => {
  const pairing = { baseUrl: "https://desktop.local", token: "0123456789abcdef", fingerprint: "a".repeat(64), name: "Desktop" }
  let load: () => Promise<typeof pairing | undefined> = async () => pairing
  let health: () => Promise<{ status: number; body: string }> = async () => ({ status: 200, body: "{}" })
  let clears = 0
  mock.module("react-native", () => ({ AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) }, Platform: { OS: "ios" } }))
  mock.module("../lib/native", () => ({
    nativeAvailable: true,
    launchPairLink: async () => null,
    warmLocalNetwork: () => undefined,
    pairingStore: { load: () => load(), save: async () => undefined, clear: async () => { clears += 1 } },
    pinnedTransport: () => ({ request: (path: string) => path === "/api/health" ? health() : Promise.resolve({ status: 200, body: JSON.stringify({ configured: false, host: "nikcli" }) }), async *stream() {} })
  }))
  mock.module("../lib/store", () => ({ uiPreferencesReady: Promise.resolve(), useUIStore: { getState: () => ({ setAssistantDesktop() {} }) } }))
  mock.module("../lib/storage", () => ({
    pairingStore: { load: () => load(), save: async () => undefined, clear: async () => { clears += 1 } },
  }))
  mock.module("../lib/offline-queue", () => ({
    drainQueueWith: async () => undefined,
    refreshOfflineQueueCount: async () => 0,
  }))

  const provider = async () => {
    const { ServerProvider, useServer } = await import("../lib/server")
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    let state!: ReturnType<typeof useServer>
    function Capture() { state = useServer(); return null }
    await act(async () => root.render(createElement(ServerProvider, null, createElement(Capture))))
    return { read: () => state, dispose: async () => { await act(async () => root.unmount()); container.remove() } }
  }

  test("an offline desktop keeps its saved pairing and finishes boot", async () => {
    load = async () => pairing
    health = async () => { throw new Error("Desktop is asleep") }
    clears = 0
    const view = await provider()
    try {
      expect(view.read().booting).toBe(false)
      expect(view.read().config).toEqual(pairing)
      expect(view.read().connectivity).toBe("offline")
      expect(view.read().connectionError).toBe("Desktop is asleep")
      expect(clears).toBe(0)
    } finally { await view.dispose() }
  })

  test("Keychain failures end boot with a recoverable pairing error", async () => {
    load = async () => { throw new Error("Keychain is unavailable") }
    const view = await provider()
    try {
      expect(view.read().booting).toBe(false)
      expect(view.read().config).toBeNull()
      expect(view.read().connectionError).toBe("Keychain is unavailable")
    } finally { await view.dispose() }
  })

  test("scan and deep-link callers receive the actual bridge, certificate and authentication failure", async () => {
    load = async () => undefined
    for (const failure of [
      { status: 0, message: "Received 6 arguments, but 7 was expected" },
      { status: 0, message: "Certificate does not match the pairing QR code" },
      { status: 401, message: "Unauthorized" },
      { status: 403, message: "Not available to a companion device" },
    ]) {
      health = async () => {
        if (failure.status === 0) throw new Error(failure.message)
        return { status: failure.status, body: JSON.stringify({ message: failure.message }) }
      }
      const view = await provider()
      try {
        await act(async () => {
          await expect(view.read().save(pairing)).rejects.toThrow(failure.message)
        })
        expect(view.read().config).toBeNull()
        expect(view.read().connectionError).toBe(failure.message)
        expect(view.read().connectivity).toBe(failure.status === 0 ? "offline" : "auth-required")
      } finally { await view.dispose() }
    }
  })

  test("pairing can succeed on retry after a native connection failure", async () => {
    load = async () => undefined
    health = async () => { throw new Error("Local network permission pending") }
    const view = await provider()
    try {
      await act(async () => {
        await expect(view.read().save(pairing)).rejects.toThrow("Local network permission pending")
      })
      health = async () => ({ status: 200, body: "{}" })
      await act(async () => { expect(await view.read().save(pairing)).toBe(true) })
      expect(view.read().config).toEqual({ ...pairing, hosts: [pairing.baseUrl] })
      expect(view.read().connectivity).toBe("online")
      expect(view.read().connectionError).toBeNull()
    } finally { await view.dispose() }
  })

  test("clearing a pairing invalidates an in-flight health response", async () => {
    load = async () => pairing
    health = async () => ({ status: 200, body: "{}" })
    const view = await provider()
    try {
      const pending = deferred<{ status: number; body: string }>()
      health = () => pending.promise
      let checking!: Promise<void>
      await act(async () => { checking = view.read().recheck() })
      await act(async () => { await view.read().clear() })
      await act(async () => { pending.resolve({ status: 200, body: "{}" }); await checking })
      expect(view.read().config).toBeNull()
      expect(view.read().connectivity).toBe("disconnected")
      expect(view.read().ai).toBeNull()
    } finally { await view.dispose() }
  })
})
