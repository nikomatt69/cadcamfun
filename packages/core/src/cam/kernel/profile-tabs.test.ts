import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { Schema } from "effect"
import { buildRecipe } from "../../cad/recipes.ts"
import { interpretGcode } from "../testing/gcode-interpreter.ts"
import { planOnly, runJob, type CamArtifact, type ManufacturingJob, type OperationSpec } from "./index.ts"
import { OperationSpecSchema } from "./schema.ts"

setDefaultTimeout(100_000)

// A plate cut through the full stock height: nothing holds the part once the outline is closed (spec 69 A1).
const block = {
  positions: [0, 0, 0, 60, 0, 0, 60, 40, 0, 0, 40, 0, 0, 0, 10, 60, 0, 10, 60, 40, 10, 0, 40, 10],
  indices: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
}
const stock = { min: { x: -3, y: -3, z: 0 }, max: { x: 63, y: 43, z: 10 } }
const ring = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 40 }, { x: 0, y: 40 }]

const job = (operations: ReadonlyArray<OperationSpec>, over: Partial<ManufacturingJob> = {}): ManufacturingJob => ({
  schemaVersion: 1, id: "tabs", name: "Tabs", material: "6061", part: { kind: "meshes", meshes: [block] }, stock, operations, ...over
})
const outline = (extra: Record<string, unknown> = {}): OperationSpec =>
  ({ id: "outline", strategy: "profile", tool: "flat-6", loop: ring, side: "outside", top: 10, bottom: 0, allowance: 0, finish: true, ...extra }) as OperationSpec
const ok = (r: ReturnType<typeof runJob>): CamArtifact => {
  if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
  return r.value
}
const status = (a: CamArtifact, id: string) => a.claims.find((c) => c.id === id)?.status

describe("profile tabs and lead-in in a kernel job (spec 69 A1)", () => {
  const plain = ok(runJob(job([outline()])))
  // The closed path starts in the middle of the bottom edge: 0.25 and 0.5 are the middles of the right and the top edge.
  const tabbed = ok(runJob(job([outline({ tabs: [{ position: 0.25, width: 6, height: 3 }, { position: 0.5, width: 6, height: 3 }] })])))

  test("the tabs leave material standing and the program still verifies", () => {
    // Two tabs of 6 mm standing material, the 3 mm margin of stock deep and 3 mm high: about 2 x 6 x 3 x 3 = 108 mm³ more than the plain cut leaves.
    const left = tabbed.stock.finalVolume - plain.stock.finalVolume
    expect(left).toBeGreaterThan(90)
    expect(left).toBeLessThan(150)
    expect(status(tabbed, "no-gouge")).toBe("passed")
    expect(status(tabbed, "material-removed")).toBe("passed")
    expect(tabbed.stock.maxRemaining).toBe(0)
  })

  test("a taller tab leaves proportionally more", () => {
    const one = (height: number) => ok(runJob(job([outline({ tabs: [{ position: 0.25, width: 6, height }] })]))).stock.finalVolume - plain.stock.finalVolume
    expect(one(6) / one(3)).toBeGreaterThan(1.8)
    expect(one(6) / one(3)).toBeLessThan(2.2)
  })

  test("the NC rises over the tab and goes back down", () => {
    const run = interpretGcode(tabbed.nc)
    const heights = new Set(run.segments.flatMap((s) => (s.kind === "linear" || s.kind === "arc" ? [Math.round(s.to.z * 100) / 100] : [])))
    // The wall is cut at the part bottom and the tool travels at the tab height (work Z: top of the stock is 0).
    expect(heights.has(-10)).toBe(true)
    expect(heights.has(-7)).toBe(true)
  })

  test("tabs of another operation do not hide stock that is really left", () => {
    // The tab footprint allows only its own height: a plate left uncut elsewhere is still reported.
    const partial = ok(runJob(job([outline({ bottom: 5, tabs: [{ position: 0.25, width: 6, height: 3 }] })])))
    expect(status(partial, "material-removed")).toBe("failed")
  })

  test("the lead-in type is a field of the operation", () => {
    const direct = ok(runJob(job([outline({ leadIn: "direct" })])))
    const arc = ok(runJob(job([outline({ leadIn: "arc", leadRadius: 3 })])))
    expect(direct.nc).not.toBe(arc.nc)
    expect(status(direct, "no-gouge")).toBe("passed")
    expect(status(arc, "no-gouge")).toBe("passed")
  })

  test("a bad tab is refused with its place", () => {
    const decode = Schema.decodeUnknownSync(OperationSpecSchema)
    const spec = { id: "o", tool: "flat-6", strategy: "profile", loop: ring, side: "outside", top: 10, bottom: 0 }
    expect(() => decode({ ...spec, tabs: [{ position: 1.5, width: 6, height: 3 }] })).toThrow()
    expect(() => decode({ ...spec, tabs: [{ position: 0.5, width: 0, height: 3 }] })).toThrow()
    expect(() => decode({ ...spec, leadIn: "swoop" })).toThrow()
    expect(decode({ ...spec, tabs: [{ position: 0.5, width: 6, height: 3 }], leadIn: "ramp" })).toBeDefined()
  })

  test("quality.tabs makes the planner hold a through-cut outline", () => {
    const recipe = buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: false })
    const plate = { id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, history: recipe.history }
    const planned = planOnly({ ...job([]), part: { kind: "elements", elements: [plate] }, stock: { min: { x: -3, y: -3, z: 0 }, max: { x: 123, y: 83, z: 13 } }, operations: undefined, quality: { tabs: { count: 3, width: 5, height: 2 } } })
    if (planned.status !== "ok") throw new Error(planned.issues.map((i) => i.message).join("; "))
    const profiles = planned.value.operations.filter((o) => o.strategy === "profile")
    expect(profiles.length).toBeGreaterThan(0)
    for (const p of profiles) expect(p.strategy === "profile" && p.tabs?.length).toBe(3)
    expect(planned.value.notes.join(" ")).not.toMatch(/hold the part by tabs/)
  })
})
