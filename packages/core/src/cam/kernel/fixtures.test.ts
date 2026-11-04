/** Spec 69 C3: fixture bodies - builders, the holding decision and its place in `setup-workholding`. */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import type { CamArtifact, ManufacturingJob, OperationSpec } from "./contracts.ts"
import { runJob } from "./execute.ts"
import { clampBody, cylinderBody, holdingOf, meshBody, supportBody, viseBodies } from "./fixtures.ts"

setDefaultTimeout(100_000)

const block = {
  positions: [0, 0, 0, 60, 0, 0, 60, 40, 0, 0, 40, 0, 0, 0, 10, 60, 0, 10, 60, 40, 10, 0, 40, 10],
  indices: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
}
const stock = { min: { x: -3, y: -3, z: -2 }, max: { x: 63, y: 43, z: 12 } }
const face: OperationSpec = { id: "face", strategy: "face", tool: "flat-6", bottom: 10 } as OperationSpec
const job = (fixtures: ManufacturingJob["fixtures"]): ManufacturingJob => ({
  schemaVersion: 1, id: "fx", name: "Fixtures", material: "6061", part: { kind: "meshes", meshes: [block] }, stock, operations: [face], quality: { resolution: 0.5 }, fixtures
})
const ok = (r: ReturnType<typeof runJob>): CamArtifact => {
  if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
  return r.value
}
const claim = (a: CamArtifact, id: string) => a.claims.find((c) => c.id === id)!

describe("builders", () => {
  test("a vise is two jaws and a bed, closed on the stock faces", () => {
    const v = viseBodies({ id: "vise", stock, gripHeight: 6 })
    expect(v.map((b) => b.id)).toEqual(["vise-fixed", "vise-moving", "vise-bed"])
    expect(v[0]!.max.x).toBeCloseTo(stock.min.x, 9)
    expect(v[1]!.min.x).toBeCloseTo(stock.max.x, 9)
    expect(v[0]!.max.z).toBeCloseTo(stock.min.z + 6, 9)
    expect(v[2]!.max.z).toBeCloseTo(stock.min.z, 9)
  })
  test("a cylinder and a mesh are given by their bounding boxes", () => {
    const c = cylinderBody("pad", { x: 10, y: 20 }, 5, 0, 8)
    expect([c.min.x, c.max.y, c.max.z]).toEqual([5, 25, 8])
    const m = meshBody("soft", block)
    expect([m.min.x, m.max.x, m.max.z]).toEqual([0, 60, 10])
  })
})

describe("holdingOf", () => {
  test("jaws closed on opposite faces hold the stock", () => {
    const h = holdingOf(viseBodies({ id: "v", stock, gripHeight: 6 }), stock)
    expect(h.held).toBe(true)
    expect(h.detail).toMatch(/opposite X faces/)
  })
  test("jaws opened by a gap touch nothing and hold nothing", () => {
    const h = holdingOf(viseBodies({ id: "v", stock, gripHeight: 6, slack: 1, bedHeight: 0 }), stock)
    expect(h.held).toBe(false)
    expect(h.detail).toMatch(/no fixture body touches/)
  })
  test("a single jaw is not enough; a clamp against a support is", () => {
    const [fixed] = viseBodies({ id: "v", stock, gripHeight: 6, bedHeight: 0 })
    expect(holdingOf([fixed!], stock).held).toBe(false)
    const clamp = clampBody("strap", { x: 10, y: 0, z: 12 }, { x: 30, y: 20, z: 20 })
    const bed = supportBody("bed", { x: -10, y: -10, z: -20 }, { x: 70, y: 50, z: -2 })
    expect(holdingOf([clamp, bed], stock).held).toBe(true)
    expect(holdingOf([clamp], stock).held).toBe(false)
  })
})

describe("setup-workholding in a kernel job", () => {
  test("a vise that holds the stock and stays clear of the tool passes, naming the grip", () => {
    const a = ok(runJob(job(viseBodies({ id: "v", stock, gripHeight: 6 }))))
    const c = claim(a, "setup-workholding")
    expect(c.status).toBe("passed")
    expect(c.detail).toMatch(/held by geometry/)
  })
  test("open jaws are clear of the tool but do not hold: the claim stays unresolved with the reason", () => {
    const a = ok(runJob(job(viseBodies({ id: "v", stock, gripHeight: 6, slack: 2 }))))
    const c = claim(a, "setup-workholding")
    expect(c.status).toBe("unresolved")
    expect(c.detail).toMatch(/do not hold the stock/)
    expect(a.release).toBe("preview")
  })
  test("a clamp in the tool's path fails the claim", () => {
    const strap = clampBody("strap", { x: 5, y: 5, z: 9 }, { x: 40, y: 20, z: 14 })
    const a = ok(runJob(job([strap, supportBody("bed", { x: -10, y: -10, z: -20 }, { x: 70, y: 50, z: -2 })])))
    expect(claim(a, "setup-workholding").status).toBe("failed")
  })
  test("bodies without a role are checked for clearance only, as before", () => {
    const plain = { id: "away", min: { x: 100, y: 0, z: -10 }, max: { x: 120, y: 40, z: 5 } }
    const a = ok(runJob(job([plain])))
    expect(claim(a, "setup-workholding").status).toBe("passed")
    expect(claim(a, "setup-workholding").detail).toMatch(/not checked/)
  })
})
