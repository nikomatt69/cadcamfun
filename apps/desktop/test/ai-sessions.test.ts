/**
 * Conversations of the assistant: listed, reopened with their text, renamed, deleted (here and in the host).
 * The persisted store is seeded before the app boots, the way it looks after a restart.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { loadTranscripts } from "../src/features/ai/store/persisted.ts"
import { bootLiveApp } from "./helpers/live-app.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
const seed = (): void => {
  localStorage.setItem("cadcamfun/ai/store-v1", JSON.stringify({
    includeContext: true,
    sessions: [
      { id: "s-new", title: "Bracket with two holes", startedAt: "2026-10-08T10:00:00.000Z", updatedAt: "2026-10-08T10:05:00.000Z", exchanges: 1 },
      { id: "s-old", title: "Lathe zero", startedAt: "2026-10-07T09:00:00.000Z", updatedAt: "2026-10-07T09:30:00.000Z", exchanges: 2 }
    ]
  }))
  const msg = (id: string, role: string, text: string) => ({ id, role, text, createdAt: "2026-10-08T10:00:00.000Z", status: "done" })
  localStorage.setItem("cadcamfun/ai/transcripts-v1", JSON.stringify({
    "s-new": [msg("a", "user", "make a bracket with two holes"), msg("b", "assistant", "Built a 60x30x8 plate with two holes.")],
    "s-old": [msg("c", "user", "where is the lathe zero?"), msg("d", "assistant", "At the chuck face unless latheZero says otherwise.")]
  }))
}
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })

const flush = (ms = 60): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const q = <T extends Element = HTMLElement>(selector: string): T | null => document.querySelector<T>(selector)

describe("assistant sessions", () => {
  test("open, rename and delete a conversation", async () => {
    seed()
    const { dispose } = app.visit("/cad")
    try {
      ;(await app.wait(() => q<HTMLButtonElement>('button[title="Show CAD Assistant"]'), 30000)).click()
      await app.wait(() => q('[data-testid="ai-panel"]'))
      ;(await app.wait(() => q<HTMLButtonElement>('[data-testid="ai-sessions-toggle"]'))).click()
      await app.wait(() => q('[data-testid="ai-session-s-new"]'))
      const titles = Array.from(document.querySelectorAll('[data-testid^="ai-session-s-"]')).map((el) => el.textContent ?? "")
      expect(titles[0]).toContain("Bracket with two holes")
      expect(titles[1]).toContain("Lathe zero")

      // Reopen the older one: its text comes back.
      q('[data-testid="ai-session-s-old"] [data-testid="ai-session-open"]')!.click()
      await flush()
      expect(document.body.textContent).toContain("At the chuck face unless latheZero says otherwise.")
      expect(document.body.textContent).not.toContain("Built a 60x30x8 plate")

      // Rename.
      q('[data-testid="ai-session-s-old"] [data-testid="ai-session-rename"]')!.click()
      await flush()
      const input = q<HTMLInputElement>('[data-testid="ai-session-title"]')!
      input.value = "Lathe zero and chuck"
      input.dispatchEvent(new window.Event("input", { bubbles: true }))
      input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      await flush()
      expect(q('[data-testid="ai-session-s-old"]')?.textContent).toContain("Lathe zero and chuck")
      expect(JSON.parse(localStorage.getItem("cadcamfun/ai/store-v1")!).sessions.map((s: { title: string }) => s.title)).toContain("Lathe zero and chuck")

      // Delete needs a second click; the open one goes and the conversation empties.
      q('[data-testid="ai-session-s-old"] [data-testid="ai-session-delete"]')!.click()
      await flush()
      expect(q('[data-testid="ai-session-s-old"]')).not.toBeNull()
      q('[data-testid="ai-session-s-old"] [data-testid="ai-session-confirm-delete"]')!.click()
      await flush(150)
      expect(q('[data-testid="ai-session-s-old"]')).toBeNull()
      expect(q('[data-testid="ai-session-s-new"]')).not.toBeNull()
      expect(Object.keys(loadTranscripts())).toEqual(["s-new"])
      expect(document.body.textContent).not.toContain("At the chuck face")
    } finally { dispose() }
  }, 60000)
})
