import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"
import type { AiMessage } from "../src/features/ai/lib/types.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })

const message = (patch: Partial<AiMessage>): AiMessage => ({
  id: "m1", role: "assistant", text: "Built the plate.", createdAt: "2026-11-03T10:00:00.000Z", events: [], status: "done", ...patch
})

const mount = async (shown: AiMessage) => {
  const { render } = await import("solid-js/web")
  const { AppProvider } = await import("../src/shared/state/context.ts")
  const { AiProvider } = await import("../src/features/ai/store/context.tsx")
  const { MessageBubble } = await import("../src/features/ai/components/MessageBubble.tsx")
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  const dispose = render(() => AppProvider({ state: app.state, get children() {
    return AiProvider({ get children() { return MessageBubble({ message: shown, onCopy: () => undefined, copiedId: undefined, onOpenProviders: () => undefined, onRegenerate: () => undefined }) } })
  } }), root)
  return { root, dispose }
}

describe("a recovered answer says so (RM-10)", () => {
  test("the note shows under an answer rebuilt after the connection dropped, in the language of the interface", async () => {
    const { t, setLocale } = await import("../src/i18n/index.ts")
    const { root, dispose } = await mount(message({ recovered: true }))
    try {
      const note = root.querySelector("[data-testid='ai-recovered-note']")
      expect(note?.textContent).toBe(t("ai.recovered.note"))
      expect(note?.textContent).toContain("recovered")
    } finally { dispose() }
    await setLocale("it")
    const italian = await mount(message({ recovered: true }))
    try { expect(italian.root.querySelector("[data-testid='ai-recovered-note']")?.textContent).toContain("recuperata") }
    finally { italian.dispose(); await setLocale("en") }
  })

  test("a normal answer, a user message and an answer still streaming carry no note", async () => {
    for (const shown of [message({}), message({ role: "user", recovered: true }), message({ status: "streaming", recovered: true })]) {
      const { root, dispose } = await mount(shown)
      try { expect(root.querySelector("[data-testid='ai-recovered-note']")).toBeNull() } finally { dispose() }
    }
  })
})
