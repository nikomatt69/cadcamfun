/**
 * The provider & model browser of the AI settings tab (spec 08-ai.md §3).
 *
 * The assistant is only as useful as the model it runs on, so the whole flow the user
 * needs has to work end to end against the real sidecar: the catalogue is readable and
 * searchable (by provider *and* by model id), an API key can be saved per provider, and
 * picking a model stores it for the assistant.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })

const flush = (ms = 30): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const query = <T extends Element = HTMLElement>(selector: string): T | null => document.querySelector<T>(selector)
/** The provider rows only — not the search box, the panel or a row's detail. */
const rows = (): string[] =>
  Array.from(document.querySelectorAll("li[data-testid^='ai-provider-']")).map((el) => el.getAttribute("data-testid") ?? "")

const type = (input: HTMLInputElement, value: string): void => {
  input.value = value
  input.dispatchEvent(new window.Event("input", { bubbles: true }))
}

/** Mounts `/settings` and opens the AI tab, where the provider browser lives. */
const openAiSettings = async (): Promise<{ dispose: () => void }> => {
  const { dispose } = app.visit("/settings")
  const tab = await app.wait(() =>
    Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === "AI"), 20000)
  tab.click()
  await app.wait(() => query('[data-testid="ai-provider-settings"]'), 20000)
  await app.wait(() => query('[data-testid="ai-provider-anthropic"]'), 20000)
  await flush()
  return { dispose }
}

describe("AI provider & model browser", () => {
  test("lists the catalogue with its size and filters by provider and by model id", async () => {
    const { dispose } = await openAiSettings()
    try {
      const counts = await app.wait(() => query('[data-testid="ai-catalogue-counts"]'))
      expect(counts?.textContent ?? "").toContain("providers")
      expect(rows().length).toBeGreaterThanOrEqual(4)
      expect(rows()).toContain("ai-provider-openai")

      const search = await app.wait(() => query<HTMLInputElement>('[data-testid="ai-provider-search"]'))
      type(search, "minimax")
      await flush()
      expect(rows()).toEqual(["ai-provider-minimax"])

      // A model id is enough to find its provider.
      type(search, "gpt-5")
      await flush()
      expect(rows()).toEqual(["ai-provider-openai"])

      type(search, "zzzz-nothing")
      await flush()
      expect(rows()).toEqual([])
      expect(document.body.textContent).toContain("No provider or model matches your search.")
    } finally { dispose() }
  }, 60000)

  test("saves an API key for a provider and selects one of its models", async () => {
    const { dispose } = await openAiSettings()
    try {
      const row = await app.wait(() => query(`[data-testid="ai-provider-openai"]`))
      row.querySelector("button")?.click()
      await flush()
      const detail = await app.wait(() => query('[data-testid="ai-provider-detail"]'))
      expect(detail).not.toBeNull()

      const key = detail.querySelector<HTMLInputElement>('[data-testid="ai-provider-key"]') as HTMLInputElement
      type(key, "sk-test-1234567890")
      await flush()
      detail.querySelector<HTMLButtonElement>('button[type="submit"]')?.click()
      // The row flips to the configured state once the sidecar confirms the key.
      const badge = await app.wait(() => {
        const openai = query(`[data-testid="ai-provider-openai"]`)
        return openai?.textContent?.includes("Configured") ? openai : null
      }, 20000)
      expect(badge?.textContent ?? "").toContain("Configured")

      // The row re-renders when the key lands, so the model list is re-read from the DOM.
      const model = query<HTMLButtonElement>('[data-testid="ai-provider-detail"] [data-testid="ai-model-option"]')
      expect(model).not.toBeNull()
      model?.click()
      await flush()
      const current = await app.wait(() => query('[data-testid="ai-current-model"]'))
      expect(current?.textContent ?? "").toContain("openai/")
    } finally { dispose() }
  }, 60000)
})

describe("user-loadable skills (Settings → AI)", () => {
  test("lists the built-in skills, loads one from Markdown, rejects a bad one, removes it", async () => {
    const { dispose } = await openAiSettings()
    try {
      const list = await app.wait(() => query('[data-testid="ai-skills-list"]'))
      await app.wait(() => query('[data-testid="ai-skill-cad-3d-modeling"]'))
      expect(list.textContent).toContain("cad-3d-modeling")
      const editor = await app.wait(() => query<HTMLTextAreaElement>('[data-testid="ai-skill-markdown"]'))
      const save = query<HTMLButtonElement>('[data-testid="ai-skill-save"]')!
      expect(save.disabled).toBe(true)

      editor.value = "no front matter"
      editor.dispatchEvent(new window.Event("input", { bubbles: true }))
      await flush()
      save.click()
      await app.wait(() => query('[data-testid="ai-skill-problem"]'))
      expect(query('[data-testid="ai-skill-problem"]')?.textContent).toContain("front matter")

      editor.value = `---\nname: brass-turning\ndescription: Brass cutting data\n---\n\nFor brass use 0.05 mm per tooth, no coolant, and verify the toolpath before posting.\n`
      editor.dispatchEvent(new window.Event("input", { bubbles: true }))
      await flush()
      save.click()
      await app.wait(() => query('[data-testid="ai-skill-brass-turning"]'))
      expect(editor.value).toBe("")

      query<HTMLButtonElement>('[data-testid="ai-skill-brass-turning"] button')!.click()
      await app.wait(() => (query('[data-testid="ai-skill-brass-turning"]') === null ? true : undefined))
    } finally { dispose() }
  }, 60000)
})
