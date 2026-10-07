import { afterEach, describe, expect, test } from "bun:test"
import { clearAttachments, putAttachment } from "../src/attachments.ts"
import { renderNotes, renderWorkspaceContext } from "../src/workspace-context.ts"
import { systemPrompt } from "../src/prompts/system.ts"

afterEach(() => clearAttachments())

const snapshot = (count: number) => ({
  page: "cad", projectId: "9b3dd00c-aaaa", name: "Bracket", units: "mm", displayUnits: "inch", tolerance: 0.005, decimals: 3, viewMode: "3d",
  totalElementCount: count, selectedElementCount: 1, selectedIds: ["id-000002-xxxxxxxx"], omittedElementCount: 0,
  elements: Array.from({ length: count }, (_, i) => ({ id: `id-${String(i).padStart(6, "0")}-xxxxxxxx`, type: i % 2 === 0 ? "cube" : "cylinder", name: `Part ${i}`, x: i, y: 0, z: 5, width: 10, height: 20, depth: 5 })),
  layers: [{ id: "l1", name: "default", visible: true, locked: false }, { id: "l2", name: "hidden", visible: false, locked: true }],
  activeLayer: "default",
  cam: {
    gcodeLines: 120, gcodePreview: Array.from({ length: 40 }, (_, i) => `G1 X${i} Y0`).join("\n"),
    settings: { machineType: "lathe", operationType: "turning", toolDiameter: 8, toolType: "turning", workOffset: "G55" },
    controller: "fanuc", material: "steel", toolpaths: [{ id: "t1", name: "Rough", moveCount: 80 }],
    verification: { state: "errors", errors: 2, issues: [{ code: "Gouge", line: 12 }, { code: "ShankCollision", line: 40 }] }
  }
})

describe("workspace context", () => {
  test("states the units, the tolerance in microns and the selection first", () => {
    const text = renderWorkspaceContext(snapshot(4))
    expect(text).toContain("drawing \"Bracket\"")
    expect(text).toContain("the user reads inch on screen (tools still take mm)")
    expect(text).toContain("0.005 mm (5 µm)")
    expect(text).toContain("1 selected (id-000002-xxxxxxxx)")
    expect(text).toContain("Model: 4 elements (2 cube, 2 cylinder)")
    expect(text).toContain("hidden (hidden) (locked)")
  })

  test("machining and verification are summarised, the state is not guessed", () => {
    const text = renderWorkspaceContext(snapshot(1))
    expect(text).toContain("machine lathe")
    expect(text).toContain("operation turning")
    expect(text).toContain("offset G55")
    expect(text).toContain("Verification: 2 error(s) [Gouge@L12, ShankCollision@L40]")
    expect(renderWorkspaceContext({ cam: { verification: { state: "not-run" } } })).toContain("Verification: not run yet")
    expect(renderWorkspaceContext({})).not.toContain("undefined")
  })

  test("a big model fits the budget and says what was left out", () => {
    const text = renderWorkspaceContext(snapshot(400), { budget: 2_500 })
    expect(text.length).toBeLessThanOrEqual(2_700)
    expect(text).toMatch(/\d+ not shown - call cad_describe_drawing/)
    expect(text).toContain("* id-000002-xxxxxxxx cube")
  })

  test("attached files are named", () => {
    putAttachment("p1", "plate.dxf", "0")
    expect(renderWorkspaceContext(snapshot(1), { projectId: "p1" })).toContain("Attached files: plate.dxf.")
  })

  test("notes are capped and say how many are not shown", () => {
    const notes = Array.from({ length: 40 }, (_, i) => ({ key: `n${i}`, value: "x".repeat(200) }))
    const text = renderNotes(notes)
    expect(text.length).toBeLessThan(1_800)
    expect(text).toContain("older not shown")
    expect(renderNotes([])).toBe("")
  })

  test("the system prompt carries the workflow, attachments and when to ask", () => {
    const prompt = systemPrompt("ctx")
    for (const phrase of ["Workflow:", "cad_check_design", "cad_import_drawing", "Asking:", "a mill turns the tool"]) expect(prompt).toContain(phrase)
    expect(prompt).not.toContain("{{")
  })
})
