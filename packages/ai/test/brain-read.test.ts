import { afterAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runAction } from "../src/actions/catalogue.ts"
import type { ActionContext } from "../src/actions/action.ts"
import { projectHabitsFile, projectMemoryFile, readBrainPage } from "../src/nikcli/project-files.ts"

const root = mkdtempSync(join(tmpdir(), "brain-read-"))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const write = (path: string, text: string) => { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, text) }

describe("reading the host memory files whole", () => {
  test("pages through a file longer than the context excerpt, to the end", async () => {
    const dir = join(root, "long")
    const text = Array.from({ length: 400 }, (_, i) => `fact ${i}: the bore is H7`).join("\n")
    write(projectMemoryFile(dir), text)
    let offset = 0, assembled = ""
    for (let guard = 0; guard < 50; guard++) {
      const page = await readBrainPage(dir, "memory", offset, 1000)
      if (!page.ok) throw new Error(page.error)
      expect(page.totalChars).toBe(text.length)
      assembled += page.content
      if (page.nextOffset === null) break
      expect(page.nextOffset).toBe(offset + page.content.length)
      offset = page.nextOffset
    }
    expect(assembled).toBe(text)
  })

  test("the habits file is separate, a missing file is an empty document, a runaway file is refused with its size", async () => {
    const dir = join(root, "kinds")
    write(projectHabitsFile(dir), "prefers metric, H7 bores")
    expect(await readBrainPage(dir, "habits", 0, 100)).toMatchObject({ ok: true, content: "prefers metric, H7 bores", nextOffset: null })
    expect(await readBrainPage(dir, "memory", 0, 100)).toEqual({ ok: true, file: "memory", offset: 0, content: "", totalChars: 0, nextOffset: null })
    write(projectMemoryFile(dir), "x".repeat(1024 * 1024 + 1))
    expect(await readBrainPage(dir, "memory", 0, 100)).toMatchObject({ ok: false, error: expect.stringContaining("over the") })
  })

  test("memory.brain_read forwards the validated request and says so when a host has no memory files", async () => {
    const seen: unknown[] = []
    const withHost = { projectId: "p", handlers: { brain: async (id: string, input: unknown) => { seen.push([id, input]); return { ok: true, file: "memory", offset: 0, content: "x", totalChars: 1, nextOffset: null } } } } as unknown as ActionContext
    expect(await runAction("memory.brain_read", {}, withHost)).toMatchObject({ ok: true, content: "x" })
    expect(seen).toEqual([["p", { file: "memory", offset: 0, maxChars: 10_000 }]])
    const without = { projectId: "p", handlers: {} } as unknown as ActionContext
    expect(await runAction("memory.brain_read", { file: "habits" }, without)).toMatchObject({ ok: false, error: expect.stringContaining("not available") })
    expect(await runAction("memory.brain_read", { maxChars: 0 }, withHost)).toMatchObject({ ok: false })
  })
})
