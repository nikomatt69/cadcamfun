import { describe, expect, test } from "bun:test"
import { createAutosave } from "./autosave.ts"

describe("autosave recovery", () => {
  test("a failed flush stays dirty and a later flush writes the current revision", async () => {
    let revision = "stored"
    let failNext = true
    const writes: string[] = []
    const save = createAutosave({
      revision: () => revision,
      enabled: () => true,
      intervalMs: () => 60_000,
      save: async () => {
        if (failNext) { failNext = false; throw new Error("temporary disk error") }
        writes.push(revision)
        return revision
      }
    })
    try {
      await save.baseline("stored")
      revision = "edited-1"
      await expect(save.saveNow("flush")).rejects.toThrow("temporary disk error")
      expect(save.state()).toBe("error")
      expect(save.error()).toBe("temporary disk error")

      revision = "edited-2"
      await save.saveNow("flush")
      expect(writes).toEqual(["edited-2"])
      expect(save.state()).toBe("clean")
      expect(save.error()).toBeUndefined()
    } finally {
      save.dispose()
    }
  })

  test("flush queues behind an in-flight write and preserves edits made during it", async () => {
    let revision = "stored"
    let release: (() => void) | undefined
    const writes: string[] = []
    const save = createAutosave({
      revision: () => revision,
      enabled: () => true,
      intervalMs: () => 60_000,
      save: async () => {
        const snapshot = revision
        writes.push(snapshot)
        if (writes.length === 1) await new Promise<void>((resolve) => { release = resolve })
        return snapshot
      }
    })
    try {
      await save.baseline("stored")
      revision = "edited-1"
      const first = save.saveNow("auto")
      await Promise.resolve()
      await Promise.resolve()
      revision = "edited-2"
      const flush = save.saveNow("flush")
      release?.()
      await Promise.all([first, flush])
      expect(writes).toEqual(["edited-1", "edited-2"])
      expect(save.state()).toBe("clean")
    } finally {
      save.dispose()
    }
  })
})
