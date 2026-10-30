import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { DEFAULT_CUTTERS, findCutter, runJob, type Cutter, type ManufacturingJob } from "./index.ts"
import { findMachine } from "./machines.ts"
import { stockContact, voxelStock, removeTipPath } from "./stock.ts"

setDefaultTimeout(100_000)

const ball = findCutter(DEFAULT_CUTTERS, "ball-10")!

describe("stockContact: the shank and holder against the voxel stock", () => {
  const box = () => voxelStock({ x: -20, y: -20, z: 0 }, { x: 20, y: 20, z: 20 }, 2)

  test("a holder sunk into untouched stock is a certain contact; in the air it is none", () => {
    const stock = box()
    // The tip below the stock with the tool straight up: past its flutes the shank rises through the stock.
    const inside = stockContact(stock, ball, { x: 0, y: 0, z: 20 - ball.fluteLength - 6 }, { x: 0, y: 0, z: 1 }, ["shank", "holder"])
    expect(inside.sure).toBeDefined()
    expect(inside.possible).toBe(true)
    // Tip above the stock by more than the flutes and shank: nothing of the non-cutting parts reaches material.
    const high = stockContact(stock, ball, { x: 0, y: 0, z: 20 + ball.stickout + 5 }, { x: 0, y: 0, z: 1 }, ["shank", "holder"])
    expect(high).toEqual({ possible: false })
  })

  test("material the flutes removed is not a contact: the shank follows the cut", () => {
    const stock = box()
    // Cut a straight shaft down from the top with the ball cutter, then ask for its shank in that shaft.
    removeTipPath(stock, ball, [{ x: 0, y: 0, z: 20 }, { x: 0, y: 0, z: 2 }], [{ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }])
    const hit = stockContact(stock, ball, { x: 0, y: 0, z: 2 }, { x: 0, y: 0, z: 1 }, ["shank"])
    expect(hit.sure).toBeUndefined()
  })

  test("a tilted tool is measured along its own axis", () => {
    const stock = box()
    // Tool lying along +X from a tip at the stock's centre: the shank runs through the stock sideways.
    const along = stockContact(stock, ball, { x: -18, y: 0, z: 10 }, { x: 1, y: 0, z: 0 }, ["shank"])
    expect(along.sure).toBeDefined()
    // The same tip with the tool leaning away (axis -X) puts the whole assembly outside the box.
    const away = stockContact(stock, ball, { x: -20 - 1, y: 0, z: 10 }, { x: -1, y: 0, z: 0 }, ["shank", "holder"])
    expect(away.sure).toBeUndefined()
  })
})

describe("the turned moves of a five-axis program are checked on the voxel stock", () => {
  const dome = [{ id: "base", type: "cube", x: 0, y: 0, z: 4, width: 40, height: 40, depth: 8 }, { id: "dome", type: "sphere", x: 0, y: 0, z: 8, radius: 8 }]
  const stock = { min: { x: -22, y: -22, z: 0 }, max: { x: 22, y: 22, z: 17 } }
  const job = (tool: Cutter): ManufacturingJob => ({
    schemaVersion: 1, id: "rc", name: "Dome", material: "6061", part: { kind: "elements", elements: dome }, stock, tools: [tool],
    operations: [{ id: "five-finish", strategy: "multiaxis", tool: tool.id, top: 17, stepover: 20, toolAxis: "normal" }],
    machine: findMachine("trunnion-5ax")!, quality: { resolution: 0.4 }
  })
  const claim = (id: string, r: ReturnType<typeof runJob>) => {
    if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
    return r.value.claims.find((c) => c.id === id)!
  }

  test("a holder wider than the room around the dome is found to touch material, with its NC line", () => {
    const stubby: Cutter = { ...ball, id: "ball-stubby", name: "Ball Ø6 short", diameter: 6, fluteLength: 5, shankDiameter: 6, stickout: 6, holder: { diameter: 44, length: 40 } }
    const r = runJob(job(stubby))
    expect(claim("holder-clearance", r).status).toBe("failed")
    if (r.status === "ok") {
      const issue = r.value.issues.find((i) => i.tag === "HolderCollision" && /table turned/.test(i.message))
      expect(issue).toBeDefined()
      expect(issue!.line).toBeGreaterThan(0)
    }
  })

  test("the default cutter is not reported as colliding, and the claims never pass what was not proven", () => {
    const r = runJob(job(ball))
    expect(claim("holder-clearance", r).status).not.toBe("failed")
    expect(claim("no-rapid-in-stock", r).status).not.toBe("failed")
    // The cut is compared with the part on the tri-dexel replay (spec 72 step 0.3): the ball standing at the foot of the dome reaches
    // into its flank by about half a millimetre, which the old "unresolved" never said.
    expect(claim("no-gouge", r).status).toBe("failed")
    expect(claim("no-gouge", r).detail).toMatch(/tri-dexel/)
  })

  test("the result is deterministic", () => {
    const a = runJob(job(ball)), b = runJob(job(ball))
    if (a.status !== "ok" || b.status !== "ok") throw new Error("the job must run")
    expect(b.value.claims).toEqual(a.value.claims)
    expect(b.value.nc).toBe(a.value.nc)
  })
})
