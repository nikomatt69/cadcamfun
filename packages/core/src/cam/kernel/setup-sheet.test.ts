import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { elementBrep } from "../../cad/scene-step.ts"
import type { History } from "../../cad/history.ts"
import { runJob, setupSheetData, setupSheetHtml, type CamArtifact, type ManufacturingJob } from "./index.ts"

setDefaultTimeout(100_000)

const rect = (id: string, x: number, y: number, width: number, height: number, offset = 0) => ({
  id, type: "sketch", plane: "XY", ...(offset !== 0 ? { offset } : {}), sketch: { entities: [], constraints: [], shapes: [{ id: `${id}r`, kind: "rectangle", at: [x, y], width, height }] }
})
/** Plate 100x60x10 with a 60x40 pocket 6 deep, a 20x20 island on its floor and a Ø6 through hole. */
const history = { parameters: {}, features: [
  rect("base", 0, 0, 100, 60), { id: "plate", type: "extrude", sketch: "base", depth: 10, operation: "new" },
  rect("p", 20, 10, 60, 40, 10), { id: "pocket", type: "extrude", sketch: "p", depth: 6, direction: "down", operation: "subtract" },
  rect("i", 40, 20, 20, 20, 4), { id: "island", type: "extrude", sketch: "i", depth: 6, operation: "union" },
  { id: "h", type: "hole", plane: "XY", offset: 10, at: [10, 30], diameter: 6, depth: 10 }
] } as unknown as History

const artifact = (name = "Plate"): CamArtifact => {
  const placed = elementBrep({ id: "p", type: "parametric", x: 0, y: 0, z: 0, history })
  if (placed.brep === undefined) throw new Error(placed.reason)
  const job: ManufacturingJob = {
    schemaVersion: 1, id: name, name, material: "6061", part: { kind: "elements", elements: [{ id: "stp", type: "brep", name, brep: placed.brep, x: 0, y: 0, z: 0 }] },
    stock: { min: { x: -3, y: -3, z: 0 }, max: { x: 103, y: 63, z: 11 } }
  }
  const r = runJob(job)
  if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
  return r.value
}

describe("the setup sheet", () => {
  const a = artifact()
  const data = setupSheetData(a)
  if (typeof data === "string") throw new Error(data)

  test("it says what the artifact says: tools, operations, times, stock, release", () => {
    expect(data.tools.map((t) => t.number)).toEqual([...a.tools.map((t) => t.number)].sort((x, y) => x - y))
    expect(data.tools.length).toBeGreaterThan(2)
    expect(data.operations.map((o) => o.id)).toEqual(a.operations.map((o) => o.id))
    expect(data.totals.cycleSeconds).toBe(a.cycleTimeSeconds)
    expect(data.totals.cuttingSeconds).toBeCloseTo(a.operations.reduce((s, o) => s + o.timeSeconds, 0), 9)
    expect(data.totals.removedVolume).toBeCloseTo(a.operations.reduce((s, o) => s + o.removedVolume, 0), 9)
    expect(data.release).toBe(a.release)
    expect(data.setup.stock.x).toBeCloseTo(a.stockBounds.max.x - a.stockBounds.min.x, 9)
    expect(data.setup.workOffset).toBe(a.program.workOffset)
    expect(data.identity).toEqual(a.identity)
  })

  test("every operation is under exactly one tool and the per-tool times add up to the cutting time", () => {
    const listed = data.tools.flatMap((t) => t.operations)
    expect([...listed].sort()).toEqual(a.operations.map((o) => o.id).sort())
    expect(data.tools.reduce((s, t) => s + t.seconds, 0)).toBeCloseTo(data.totals.cuttingSeconds, 9)
    for (const o of data.operations) expect(o.tool).toBe(a.tools.find((t) => t.id === a.operations[o.index - 1]!.toolId)!.number)
  })

  test("the island operations are on the sheet with the cutting data the artifact carries", () => {
    const wall = data.operations.find((o) => o.id === "finish-pocket-1-island1")!
    expect(wall.strategy).toBe("profile")
    const outcome = a.operations.find((o) => o.id === wall.id)!
    expect(wall.rpm).toBe(outcome.cutting?.rpm)
    expect(wall.feed).toBe(outcome.cutting?.feed)
  })

  test("the HTML carries every tool and operation, one silhouette per tool, and renders the identity", () => {
    const html = setupSheetHtml(data)
    expect(html.startsWith("<!doctype html>")).toBe(true)
    for (const t of a.tools) expect(html).toContain(`T${t.number}`)
    for (const o of a.operations) expect(html).toContain(o.name.replace(/&/g, "&amp;"))
    expect(html.match(/<svg /g)).toHaveLength(a.tools.length)
    expect(html).toContain(a.identity.nc)
    expect(html).not.toMatch(/<script/i)
  })

  test("a name is escaped, never interpreted", () => {
    const hostile = setupSheetData(a, { title: "<script>alert(1)</script> & \"co\"" })
    if (typeof hostile === "string") throw new Error(hostile)
    const html = setupSheetHtml(hostile)
    expect(html).not.toContain("<script>alert(1)</script>")
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;co&quot;")
  })

  test("a printer artifact has no setup sheet", () => {
    expect(setupSheetData({ ...a, print: {} as never })).toMatch(/print report/)
  })
})
