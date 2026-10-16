import { expect, test } from "bun:test"
import { installDom } from "./helpers/dom.ts"
import { clientLayer, readClient, runtimeForLayer } from "../src/app/client.ts"

test("provider settings connect OpenCode Go with its account key and OpenAI/xAI with native OAuth", async () => {
  installDom()
  const { render } = await import("solid-js/web")
  const { createAppState, AppProvider } = await import("../src/shared/state/context.ts")
  const { AiProvider } = await import("../src/features/ai/store/context.tsx")
  const { ProviderSettings } = await import("../src/features/ai/components/ProviderSettings.tsx")
  const configured = new Set<string>()
  const writes: Array<{ path: string; body: Record<string, string> }> = []
  const opened: string[] = []
  window.open = ((url: string) => { opened.push(url); return null }) as typeof window.open
  const ids = ["openai", "xai", "opencode", "opencode-go"]
  const status = () => ({ host: "nikcli", configured: configured.size > 0, providers: Object.fromEntries(ids.map((id) => [id, configured.has(id) ? "configured" : "missing"])) })
  const transport = Object.assign(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const request = new Request(input, init)
    const path = new URL(request.url).pathname
    if (request.method === "GET") {
      if (path.endsWith("/status")) return Response.json(status())
      if (path.endsWith("/models")) return Response.json([])
      return Response.json(ids.map((id) => ({ id, name: id, source: "config", auth: id.startsWith("opencode") ? ["api"] : ["oauth", "api"], configured: configured.has(id), models: [{ id: "model", name: "Model", provider: id, contextWindow: 200000, maxOutput: 4096, tools: true, vision: false, cost: { input: 0, output: 0 } }] })))
    }
    const body = await request.json() as Record<string, string>
    writes.push({ path, body })
    if (path.endsWith("/authorize")) return Response.json({ attemptId: "fixture-attempt", url: "https://auth.example.test/authorize", instructions: "Approve sign-in in your browser.", method: body.provider === "xai" ? "auto-code" : "auto" })
    configured.add(body.provider!)
    return Response.json(status())
  }, { preconnect: globalThis.fetch.preconnect })
  const runtime = runtimeForLayer(clientLayer({ baseUrl: "http://sidecar.test", token: "fixture" }, transport))
  const client = await readClient(runtime)
  const state = createAppState({ client, runtime, recents: [] })
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  const dispose = render(() => AppProvider({ state, get children() { return AiProvider({ get children() { return ProviderSettings() } }) } }), root)
  const wait = async <A>(read: () => A | null | undefined | false): Promise<A> => {
    const deadline = Date.now() + 5000
    for (;;) { const value = read(); if (value) return value; if (Date.now() > deadline) throw new Error("Provider UI timed out"); await new Promise((resolve) => setTimeout(resolve, 10)) }
  }
  const button = (text: string) => [...root.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent?.trim() === text)
  try {
    for (const provider of ["opencode-go", "openai", "xai"]) {
      const row = await wait(() => root.querySelector(`[data-testid="ai-provider-${provider}"]`))
      row.querySelector<HTMLButtonElement>("button")?.click()
      if (provider === "opencode-go") {
        ;(await wait(() => button("Connect OpenCode account"))).click()
        expect(opened.at(-1)).toBe("https://opencode.ai/auth")
        expect(row.textContent).toContain("subscribe to Go")
        const input = row.querySelector<HTMLInputElement>('[data-testid="ai-provider-key"]')!
        input.value = "fixture-key"
        input.dispatchEvent(new window.Event("input", { bubbles: true }))
        ;(await wait(() => button("Save key")))?.click()
      } else {
        ;(await wait(() => button(provider === "openai" ? "Connect ChatGPT / Codex" : "Connect SuperGrok"))).click()
        ;(await wait(() => button("Finish sign-in")))
        expect(opened.at(-1)).toBe("https://auth.example.test/authorize")
        const code = row.querySelector<HTMLInputElement>('input[aria-label="Authorization code (if shown)"]')
        if (provider === "xai") { expect(code).not.toBeNull(); code!.value = "manual-code"; code!.dispatchEvent(new window.Event("input", { bubbles: true })) }
        else expect(code).toBeNull()
        button("Finish sign-in")!.click()
      }
      await wait(() => root.querySelector(`[data-testid="ai-provider-${provider}"].is-configured`))
      const savedKey = root.querySelector<HTMLInputElement>('[data-testid="ai-provider-key"]')
      expect(savedKey?.value).toBe("")
    }
    expect(writes.find((request) => request.path.endsWith("/credentials"))?.body).toEqual({ provider: "opencode-go", key: "fixture-key" })
    expect(writes.find((request) => request.path.endsWith("/complete") && request.body.provider === "xai")?.body).toEqual({ provider: "xai", attemptId: "fixture-attempt", code: "manual-code" })
  } finally { dispose(); state.dispose(); runtime.dispose(); root.remove() }
})
