import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import type { ToolHandlersShape } from "@cadcamfun/ai"
import { makeApp } from "./helpers.ts"
import { makeParametricRunner } from "./helpers/parametric.ts"

/** The assistant makes what is already drawn parametric: read the history, store the twin, edit it by its parameters. */
let app: Awaited<ReturnType<typeof makeApp>>
let handlers: ToolHandlersShape
let projectId: string
const run = makeParametricRunner(() => handlers, () => projectId)
const SLOW = 120_000

beforeAll(async () => {
  app = await makeApp(); handlers = await app.toolHandlers()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Make parametric" } })).body.id
})
afterAll(async () => { await app.dispose() })

const add = async (element: Record<string, unknown>): Promise<{ id: string; element: Record<string, unknown> }> => {
  const added = await handlers.addElements(projectId, [element]) as { ok: boolean; ids: string[]; elements: Array<Record<string, unknown>> }
  expect(added.ok).toBe(true)
  return { id: added.ids[0]!, element: added.elements[0]! }
}
const close = (got: number, want: number, relative: number): void => { expect(Math.abs(got - want) / Math.abs(want), `${got} vs ${want}`).toBeLessThan(relative) }

describe("every kind of element, made parametric", () => {
  const cases: ReadonlyArray<Record<string, unknown>> = [
    { type: "cube", width: 30, height: 20, depth: 10, x: 50, y: 20, z: 5, name: "Block", color: "#3366ff" },
    { type: "cylinder", radius: 9, height: 40, wireframe: false }, { type: "gear", moduleValue: 2, teeth: 20, thickness: 8, holeDiameter: 10 },
    { type: "wall", length: 300, thickness: 20, height: 100 }, { type: "bolt", size: "M10", length: 50 },
    { type: "spring", radius: 20, wireRadius: 2, turns: 5, height: 60 }, { type: "stair", width: 100, height: 150, depth: 200, steps: 10 },
    { type: "sweep", radius: 4, path: [{ x: 0, y: 0, z: 0 }, { x: 60, y: 0, z: 0 }, { x: 60, y: 60, z: 0 }] }
  ]
  for (const input of cases) {
    test(`${String(input["type"])}: the twin has the volume of the original, in the same place`, async () => {
      const { id, element } = await add(input)
      const read = await run({ action: "from_element", elementId: id })
      expect(read.ok, JSON.stringify(read).slice(0, 300)).toBe(true)
      expect(read.source).toEqual({ id, type: input["type"] })
      const made = await run({ action: "convert", elementId: id })
      expect(made.ok, JSON.stringify(made).slice(0, 300)).toBe(true)
      const twin = made.elements[0]
      expect(twin).toMatchObject({ type: "parametric", x: element["x"] ?? 0, y: element["y"] ?? 0, z: element["z"] ?? 0 })
      if (input["color"] !== undefined) expect(twin.color).toBe(input["color"])
      const inspected = await run({ action: "inspect", elementId: made.ids[0] })
      expect(inspected.ok).toBe(true)
      close(inspected.volumeMm3, cam.model.volumeOf(cam.model.elementMesh(element, 0.01)!), 2e-3)
      // The original is still there until the person removes it.
      expect(JSON.stringify(await handlers.describeDrawing(projectId))).toContain(id)
    }, SLOW)
  }
})

describe("editing the twin by its dimensions", () => {
  test("one parameter resizes it, and the revision protects the edit", async () => {
    const { id } = await add({ type: "cube", width: 30, height: 20, depth: 10 })
    const made = await run({ action: "convert", elementId: id, name: "Adjustable block" })
    expect(made.elements[0].name).toBe("Adjustable block")
    const twin = made.ids[0]
    const before = await run({ action: "inspect", elementId: twin })
    expect(before.history.parameters).toEqual({ width: 30, height: 20, depth: 10 })
    const changed = await run({ action: "update", elementId: twin, expectedRevision: before.revision, parameters: { width: 60 } })
    expect(changed.ok).toBe(true)
    close(changed.report.volumeMm3, 60 * 20 * 10, 1e-3)
    expect((await run({ action: "update", elementId: twin, expectedRevision: before.revision, parameters: { width: 70 } })).ok).toBe(false)
  }, SLOW)

  test("a flat shape is extruded by a depth parameter; a component becomes one feature per part", async () => {
    const { id } = await add({ type: "rectangle", width: 40, height: 20 })
    const made = await run({ action: "convert", elementId: id, depth: 6 })
    expect(made.ok).toBe(true)
    const inspected = await run({ action: "inspect", elementId: made.ids[0] })
    close(inspected.volumeMm3, 40 * 20 * 6, 1e-3)
    expect(inspected.history.parameters).toMatchObject({ width: 40, height: 20, depth: 6 })

    const component = await add({ type: "component", name: "Fixture", elements: [{ type: "cube", width: 20, height: 20, depth: 20 }, { type: "cylinder", radius: 5, height: 30, x: 40 }] })
    const parts = await run({ action: "convert", elementId: component.id })
    expect(parts.ok).toBe(true)
    const stored = await run({ action: "inspect", elementId: parts.ids[0] })
    expect(stored.bodyCount).toBe(2)
    expect(stored.history.features.map((f: { id: string }) => f.id)).toEqual(["c0_cube", "c1_cylinder"])
  }, SLOW)
})

describe("what cannot be made parametric is said, and nothing is created", () => {
  test("text, an unknown id and a bad depth", async () => {
    const parametricParts = async () => ((await handlers.grep(projectId, { query: "parametric", parametricOnly: true, includeParameters: false, offset: 0, limit: 50 })) as { total: number }).total
    const before = await parametricParts()
    const text = await add({ type: "text3d", text: "CAD", height: 8 })
    for (const input of [{ elementId: text.id }, { elementId: "nope" }, { elementId: text.id, depth: -1 }]) {
      const refused = await run({ action: "convert", ...input })
      expect(refused.ok).toBe(false)
      expect(typeof refused.error).toBe("string")
    }
    expect((await run({ action: "from_element", elementId: text.id })).error).toContain("no solid to make parametric")
    expect(await parametricParts()).toBe(before)
  }, SLOW)
})
