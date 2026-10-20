/**
 * Post-edit diagnostics (the CAD/CAM LSP step): after a successful edit the touched artifact is
 * checked deterministically and the findings ride on the edit's own result — the way nikcli/opencode
 * attach LSP diagnostics to an edit — while reads, refusals and diagnostics failures change nothing.
 */
import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { defineAction, executeAction } from "../src/actions/action.ts"
import { actionById } from "../src/actions/catalogue.ts"
import { postEditDiagnostics } from "../src/diagnostics.ts"
import type { ToolHandlersShape } from "../src/tools/handlers.ts"

const handlers = (overrides: Partial<ToolHandlersShape>): ToolHandlersShape => overrides as ToolHandlersShape
const context = (supplied: Partial<ToolHandlersShape>) => ({ handlers: handlers(supplied), projectId: "p" })

const cadEdit = defineAction({
  id: "cad_edit.add", kind: "write", parameters: z.object({}),
  run: async () => ({ ok: true, drawingId: "d", ids: ["e1"] })
})
const broken = { severity: "error", code: "FLOATING_SOLID", elementId: "e1", message: "Solid e1 touches nothing." }
const warn = { severity: "warning", code: "OUTSIDE_STOCK", elementId: "e1", message: "Solid e1 leaves the stock." }

describe("post-edit diagnostics", () => {
  test("a CAD edit carries the drawing's diagnostics in its own result", async () => {
    const element = { type: "cube", x: 0, y: 0, z: 0, width: 10, height: 10, depth: 10 }
    const result = await executeAction(actionById("cad_edit.add")!, { elements: [element] }, context({
      addElements: async (_project, batch) => ({ ok: true, ids: ["e1"], elements: batch.map((e) => ({ ...e, id: "e1" })), drawingId: "d", projectId: "p" }),
      checkDesign: async () => ({ ok: false, issues: [broken, warn], omitted: 0 })
    })) as unknown as { ok: boolean; diagnostics: { source: string; errors: number; warnings: number; issues: Array<{ code: string; elementId?: string }> } }
    expect(result.ok).toBe(true)
    expect(result.diagnostics.source).toBe("cad")
    expect(result.diagnostics.errors).toBe(1)
    expect(result.diagnostics.warnings).toBe(1)
    expect(result.diagnostics.issues[0]).toMatchObject({ code: "FLOATING_SOLID", elementId: "e1" })
  })

  test("a clean edit still reports that diagnostics ran, with no findings", async () => {
    const element = { type: "cube", x: 0, y: 0, z: 0, width: 10, height: 10, depth: 10 }
    const result = await executeAction(actionById("cad_edit.add")!, { elements: [element] }, context({
      addElements: async (_project, batch) => ({ ok: true, ids: ["e1"], elements: batch.map((e) => ({ ...e, id: "e1" })), drawingId: "d", projectId: "p" }),
      checkDesign: async () => ({ ok: true, issues: [], omitted: 0 })
    })) as unknown as { diagnostics: { errors: number; issues: unknown[] } }
    expect(result.diagnostics.errors).toBe(0)
    expect(result.diagnostics.issues).toEqual([])
  })

  test("a CAM edit diagnoses the stored program it produced, with line numbers", async () => {
    const result = await executeAction(actionById("cam_edit.generate")!, { operationId: "op1" }, context({
      generateGcode: async () => ({ gcode: "G21\nG1 X10 F100\nM30", stats: { lines: 3 } }),
      operationProgram: async () => ({ ok: true as const, operationId: "op1", gcode: "G21\nG1 X10 F100\nM30" })
    })) as unknown as { diagnostics: { source: string; issues: Array<{ code: string; line?: number }> } }
    expect(result.diagnostics.source).toBe("cam")
    expect(result.diagnostics.issues.some((issue) => issue.code === "CUT_WITHOUT_SPINDLE" && issue.line === 2)).toBe(true)
  })

  test("reads, refusals and already-diagnosed results get nothing", async () => {
    const read = defineAction({ id: "cad.describe", kind: "read", parameters: z.object({}), run: async () => ({ ok: true, total: 1 }) })
    expect(await postEditDiagnostics(read, { ok: true }, context({ checkDesign: async () => ({ issues: [broken] }) }))).toBeUndefined()
    expect(await postEditDiagnostics(cadEdit, { ok: false, error: "refused" }, context({ checkDesign: async () => ({ issues: [broken] }) }))).toBeUndefined()
    expect(await postEditDiagnostics(cadEdit, { ok: false, issues: [broken] }, context({ checkDesign: async () => ({ issues: [warn] }) }))).toBeUndefined()
  })

  test("a failing diagnostics check never fails the edit (fail-open, like an LSP that is down)", async () => {
    const element = { type: "cube", x: 0, y: 0, z: 0, width: 10, height: 10, depth: 10 }
    const result = await executeAction(actionById("cad_edit.add")!, { elements: [element] }, context({
      addElements: async (_project, batch) => ({ ok: true, ids: ["e1"], elements: batch.map((e) => ({ ...e, id: "e1" })), drawingId: "d", projectId: "p" }),
      checkDesign: async () => { throw new Error("drawing gone") }
    })) as unknown as { ok: boolean; diagnostics?: unknown }
    expect(result.ok).toBe(true)
    expect(result.diagnostics).toBeUndefined()
  })

  test("a diagnostics check slower than the budget is ignored, so it cannot slow the edit", async () => {
    const started = Date.now()
    const diagnostics = await postEditDiagnostics(cadEdit, { ok: true }, context({
      checkDesign: async () => { await new Promise((resolve) => setTimeout(resolve, 200)); return { issues: [broken] } }
    }), 10)
    expect(diagnostics).toBeUndefined()
    expect(Date.now() - started).toBeLessThan(150)
  })

  test("findings are bounded and the omitted count is honest", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ severity: "info", code: `N${i}`, message: `note ${i}` }))
    const diagnostics = await postEditDiagnostics(cadEdit, { ok: true }, context({ checkDesign: async () => ({ issues: many }) }))
    expect(diagnostics?.issues).toHaveLength(8)
    expect(diagnostics?.omitted).toBe(4)
    expect(diagnostics?.infos).toBe(12)
  })
})
