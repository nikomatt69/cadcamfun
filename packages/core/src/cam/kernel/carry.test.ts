/** Spec 69 C4: the stock one setup leaves is the stock the next one starts from, and the removal of the setups adds up. */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { carriedColumns } from "./carry.ts"
import type { ManufacturingJob, OperationSpec, ResidualStock } from "./contracts.ts"
import { runSetups, type SetupsArtifact } from "./setups.ts"
import { setupTransform } from "../setup.ts"

setDefaultTimeout(100_000)

const block = {
  positions: [0, 0, 0, 60, 0, 0, 60, 40, 0, 0, 40, 0, 0, 0, 10, 60, 0, 10, 60, 40, 10, 0, 40, 10],
  indices: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
}
const stock = { min: { x: -3, y: -3, z: -2 }, max: { x: 63, y: 43, z: 12 } }
const area = 66 * 46
const face = (id: string, bottom: number): OperationSpec => ({ id, strategy: "face", tool: "flat-6", bottom }) as OperationSpec

const job = (carry: boolean): ManufacturingJob => ({
  schemaVersion: 1, id: "carry", name: "Carry", material: "6061", part: { kind: "meshes", meshes: [block] }, stock, quality: { resolution: 0.5 },
  ...(carry ? { carryStock: true } : {}),
  // Setup 1 faces the top 2 mm; setup 2, flipped, faces the bottom 2 mm (in its own frame the bottom is the top, z' = -z).
  setups: [{ id: "top", operations: [face("face-top", 10)] }, { id: "bottom", orientation: "-Z", operations: [face("face-bottom", 0)] }]
})
const run = (j: ManufacturingJob): SetupsArtifact => {
  const r = runSetups(j)
  if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
  return r.value
}

describe("carriedColumns: a height field read from the other side", () => {
  // 10 x 10 mm plate, 8 mm thick, with a 5 mm deep pocket from the top over x < 5.
  const top = new Float64Array(100).fill(0)
  for (let j = 0; j < 10; j++) for (let i = 0; i < 10; i++) top[j * 10 + i] = i < 5 ? -5 : 0
  const residual: ResidualStock = { orientation: "+Z", origin: { x: 0, y: 0, z: 0 }, nx: 10, ny: 10, minX: 0, minY: 0, cellX: 1, cellY: 1, floor: -8, top }
  const flipped = carriedColumns(residual, setupTransform("-Z"))
  test("from below the column is as tall as the plate, but only the material that is left counts as solid", () => {
    // -Z: z' = -z and y' = -y, so the pocket (x < 5) stays at x' < 5. Floor of the plate -8 -> z' = 8; top 0 -> z' = 0.
    const inPocket = flipped(2.5, -5, -1, 9)
    expect(inPocket.top).toBeCloseTo(8, 2)
    expect(inPocket.solid).toBeCloseTo(3, 2)
    const solid = flipped(7.5, -5, -1, 9)
    expect(solid.top).toBeCloseTo(8, 2)
    expect(solid.solid).toBeCloseTo(8, 2)
  })
  test("a column outside the grid is empty", () => {
    expect(flipped(50, -5, -1, 9).top).toBe(-Infinity)
  })
})

describe("runSetups with carryStock", () => {
  const carried = run(job(true))
  const raw = run(job(false))

  test("setup 2 starts from the stock setup 1 left, and the removal of the setups adds up", () => {
    const [a, b] = carried.setups.map((s) => s.artifact.stock)
    expect(a!.initialVolume).toBeCloseTo(area * 14, -2)
    expect(a!.finalVolume).toBeCloseTo(area * 12, -2)
    // what setup 1 left is what setup 2 starts from (within a cell of the earlier replay)
    expect(Math.abs(b!.initialVolume - a!.finalVolume)).toBeLessThan(area * 0.5)
    // flipped and faced: the plate is down to the part, 10 mm
    expect(b!.finalVolume).toBeCloseTo(area * 10, -2)
    expect(carried.stockCarried).toBe(true)
    expect(carried.removedVolume!).toBeCloseTo(area * 4, -2)
    expect(carried.notes.join(" ")).toMatch(/carried/)
  })

  test("without carryStock each setup starts from the raw stock, as before", () => {
    const [, b] = raw.setups.map((s) => s.artifact.stock)
    expect(b!.initialVolume).toBeCloseTo(area * 14, -2)
    expect(b!.finalVolume).toBeCloseTo(area * 12, -2)
    expect(raw.stockCarried).toBe(false)
    expect(raw.notes.join(" ")).toMatch(/not carried/)
  })

  test("a second facing of the same side is a rest pass: it finds nothing left to cut", () => {
    const again = run({ ...job(true), setups: [{ id: "a", operations: [face("f1", 10)] }, { id: "b", operations: [face("f2", 10)] }] })
    const [, b] = again.setups.map((s) => s.artifact)
    expect(b!.stock.initialVolume - b!.stock.finalVolume).toBeLessThan(area * 0.05)
  })
})
