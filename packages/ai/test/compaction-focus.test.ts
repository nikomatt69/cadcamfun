import { afterAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { installEngineeringLedgerMod, setCompactionFocus } from "../src/nikcli/engineering-ledger-mod.ts"

const root = mkdtempSync(join(tmpdir(), "compaction-focus-"))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const ledger = { version: 1 as const, projectId: "p", drawingId: "d", revision: "r1", capturedAt: "2026-11-02T00:00:00Z", units: { length: "mm" as const, angle: "rad" as const }, resources: [], stock: { configured: false, digest: "none" }, operations: [], pendingTasks: [], omissions: [] }

/** `/compact <focus>`: the summary prompt carries the person's focus for that session only, and only while the compaction runs. */
describe("compaction focus", () => {
  test("the compacting hook adds the focus of its own session and nothing once it is cleared", async () => {
    const mod = installEngineeringLedgerMod(root, async () => ({ ledger }))
    try {
      const loaded = await import(mod.spec) as { CadcamEngineeringLedger: (input: { directory: string }) => Promise<Record<string, (input: unknown, output: { prompt?: string; context?: string[] }) => Promise<void>>> }
      const hooks = await loaded.CadcamEngineeringLedger({ directory: "/project" })
      const compacting = hooks["experimental.session.compacting"]!
      const promptFor = async (sessionID: string) => { const output: { prompt?: string; context?: string[] } = { context: [] }; await compacting({ sessionID }, output); return output.prompt ?? "" }

      expect(await promptFor("s1")).not.toContain("concentrate on")
      setCompactionFocus("s1", "  the bore tolerances and the vise setup  ")
      const focused = await promptFor("s1")
      expect(focused).toContain("concentrate on: \"the bore tolerances and the vise setup\"")
      expect(focused).toContain("engineering_state")
      expect(await promptFor("s2")).not.toContain("concentrate on")
      setCompactionFocus("s1", undefined)
      expect(await promptFor("s1")).not.toContain("concentrate on")
      setCompactionFocus("s1", "x".repeat(900))
      expect((await promptFor("s1")).match(/x+/g)!.sort((a, b) => b.length - a.length)[0]!.length).toBe(500)
      setCompactionFocus("s1", "   ")
      expect(await promptFor("s1")).not.toContain("concentrate on")
    } finally { mod.close() }
  })
})
