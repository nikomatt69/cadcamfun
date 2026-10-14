import { describe, expect, test } from "bun:test"
import { toolOutput } from "../src/tools/tool-output.ts"

describe("tool output: whole value, bounded text", () => {
  test("a result that fits is the plain JSON text, not bounded", () => {
    const out = toolOutput({ ok: true, ids: ["e1"] })
    expect(out).toEqual({ text: JSON.stringify({ ok: true, ids: ["e1"] }), bounded: false, omissions: [], outcome: "succeeded" })
  })

  test("a large program keeps its identity whole and declares what the text leaves out", () => {
    const lines = Array.from({ length: 6000 }, (_, i) => `G1 X${i} Y${i} F800`)
    const value = { ok: true, operationId: "op-1", programHash: "a".repeat(64), revision: "r9", lines: lines.length, program: lines, preview: lines.join("\n") }
    const out = toolOutput(value, 4000)
    expect(out.bounded).toBe(true)
    expect(out.text.length).toBeLessThanOrEqual(4000)
    const parsed = JSON.parse(out.text) as Record<string, any>
    expect(parsed.operationId).toBe("op-1")
    expect(parsed.programHash).toBe("a".repeat(64))
    expect(parsed.revision).toBe("r9")
    expect(parsed.lines).toBe(6000)
    expect(parsed._preview.complete).toBe(false)
    expect(parsed._preview.fullCharacters).toBe(JSON.stringify(value).length)
    const program = (parsed._preview.omitted as Array<Record<string, unknown>>).find((o) => o.path === "program")
    expect(program).toMatchObject({ total: 6000, unit: "items" })
    expect((parsed.program as unknown[]).length).toBe(program?.returned as number)
  })

  test("protected ids are never shortened, even when they alone exceed the budget", () => {
    const ids = Array.from({ length: 3000 }, (_, i) => `element-${i}`)
    const out = toolOutput({ ok: true, ids, drawingId: "d", projectId: "p", elements: ids.map((id) => ({ id })) }, 2000)
    expect(out.bounded).toBe(true)
    expect(out.text.length).toBeLessThan(2000)
    expect(JSON.parse(out.text)).toMatchObject({ ok: true, drawingId: "d", projectId: "p", _preview: { complete: false } })
    expect(out.outcome).toBe("succeeded")
  })

  test("a top-level list is wrapped so the preview can be attached", () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: `m${i}`, name: `Material ${i}`, note: "x".repeat(80) }))
    const parsed = JSON.parse(toolOutput(rows, 3000).text) as { items: unknown[]; _preview: { omitted: Array<{ path: string; total: number }> } }
    expect(parsed.items.length).toBeGreaterThan(0)
    expect(parsed._preview.omitted[0]).toMatchObject({ path: "$", total: 500 })
  })

  test("the outcome is classified from the whole value", () => {
    expect(toolOutput({ ok: false, error: "No drawing." }).outcome).toBe("refused")
    expect(toolOutput({ ok: true, complete: false, nextOffset: 40, hits: [] }).outcome).toBe("partial")
    expect(toolOutput({ ok: false, _tag: "ActionConflict", message: "moved" }).outcome).toBe("conflict")
  })
})
