/**
 * Spec 69 J3: scale fixtures. A job of 500+ operations and a stock of 10^7 replay cells run inside a time budget; where the replay cannot
 * keep its cell it degrades with a declared bound (A5) and says so, and never halts the claims. Figures are printed.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { runJob, type ManufacturingJob, type OperationSpec } from "./index.ts"
import { findMachine } from "./machines.ts"

setDefaultTimeout(240_000)

const grid = (n: number, side: number, pitch: number): OperationSpec[] => {
  const ops: OperationSpec[] = []
  for (let i = 0; i < n; i++) {
    const x = 6 + (i % 25) * pitch, y = 6 + Math.floor(i / 25) * pitch
    ops.push({ id: `spot-${i}`, strategy: "profile", tool: "flat-6-n", loop: [{ x, y }, { x: x + side, y }, { x: x + side, y: y + side }, { x, y: y + side }], side: "inside", top: 6, bottom: 5, finish: false })
  }
  return ops
}

const bigPlate = (operations: OperationSpec[], w: number, h: number, resolution: number): ManufacturingJob => ({
  schemaVersion: 1, id: "scale", name: "Scale plate", material: "6061",
  part: { kind: "elements", elements: [{ id: "plate", type: "cube", x: w / 2, y: h / 2, z: 2.5, width: w, height: h, depth: 5 }] },
  stock: { min: { x: 0, y: 0, z: 0 }, max: { x: w, y: h, z: 6 } },
  operations, machine: findMachine("vmc-standard")!, quality: { resolution }
})

describe("J3 scale fixtures", () => {
  test("550 operations run to the end with every claim decided or declared", () => {
    const t0 = performance.now()
    const r = runJob(bigPlate(grid(550, 10, 15), 390, 340, 1))
    const seconds = (performance.now() - t0) / 1000
    if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
    console.log(`J3 550 operations: ${seconds.toFixed(1)} s, ${r.value.nc.split("\n").length} NC lines, cell ${r.value.stock.cellSize} mm, release ${r.value.release}`)
    expect(r.value.operations.length).toBe(550)
    expect(r.value.operations.every((o) => o.status === "ok")).toBe(true)
    expect(r.value.claims.find((c) => c.id === "nc-replay")!.status).toBe("passed")
    expect(r.value.claims.find((c) => c.id === "no-gouge")!.status).not.toBe("failed")
    expect(seconds).toBeLessThan(200)
  })

  test("a stock of 10^7 replay cells is replayed at a coarser, declared cell, not halted", () => {
    // 600 x 400 mm at 0.15 mm would be 10.7 million columns; the kernel coarsens the cell and says so.
    const t0 = performance.now()
    Bun.gc(true)
    const before = process.memoryUsage()
    const r = runJob(bigPlate(grid(4, 20, 30), 600, 400, 0.15))
    const seconds = (performance.now() - t0) / 1000
    // Memory budget: resident growth over the run (the replay height field and part raster are the big arrays).
    const grewMb = (process.memoryUsage().rss - before.rss) / 1048576
    console.log(`J3 10^7-cell stock memory: rss grew ${grewMb.toFixed(0)} MB`)
    expect(grewMb).toBeLessThan(1500)
    if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
    const cells = (600 / r.value.stock.cellSize) * (400 / r.value.stock.cellSize)
    console.log(`J3 10^7-cell stock: asked 0.15 mm (10.7e6 cells), ran at ${r.value.stock.cellSize} mm (${(cells / 1e6).toFixed(2)}e6 cells), ${seconds.toFixed(1)} s`)
    expect(cells).toBeLessThanOrEqual(1.1e7)
    expect(r.value.stock.cellSize).toBeGreaterThan(0)
    const term = r.value.tolerance!.terms.find((t) => t.id === "stock-replay")!.mm
    expect(term).toBeGreaterThanOrEqual(r.value.stock.cellSize / 2 - 1e-6)
    expect(r.value.issues.some((i) => /replay stopped|halted/.test(i.message))).toBe(false)
    expect(r.value.issues.some((i) => /A replay cell of 0\.150 mm would need/.test(i.message))).toBe(true)
    expect(seconds).toBeLessThan(200)
  })

  test("a part of 200 000 triangles is meshed, planned and replayed inside the budget", () => {
    // A closed sphere (a bump on a base plate would also do): 2n x n quads, 4 n^2 triangles.
    const n = 224, r = 20
    const positions: number[] = [], indices: number[] = []
    for (let a = 0; a <= n; a++) for (let b = 0; b < 2 * n; b++) {
      const th = (Math.PI * a) / n, ph = (Math.PI * b) / n
      positions.push(r * Math.sin(th) * Math.cos(ph) + 25, r * Math.sin(th) * Math.sin(ph) + 25, r * Math.cos(th) + 20)
    }
    for (let a = 0; a < n; a++) for (let b = 0; b < 2 * n; b++) {
      const b1 = (b + 1) % (2 * n)
      const v00 = a * 2 * n + b, v01 = a * 2 * n + b1, v10 = (a + 1) * 2 * n + b, v11 = (a + 1) * 2 * n + b1
      if (a > 0) indices.push(v00, v10, v01)
      if (a < n - 1) indices.push(v01, v10, v11)
    }
    const triangles = indices.length / 3
    const t0 = performance.now()
    const res = runJob({
      schemaVersion: 1, id: "mesh", name: "Large mesh", material: "6061", part: { kind: "meshes", meshes: [{ positions, indices }] },
      stock: { min: { x: 0, y: 0, z: 0 }, max: { x: 50, y: 50, z: 41 } }, machine: findMachine("vmc-standard")!, quality: { resolution: 0.5 }
    })
    const seconds = (performance.now() - t0) / 1000
    console.log(`J3 ${triangles} triangles: ${seconds.toFixed(1)} s, status ${res.status}${res.status === "ok" ? `, release ${res.value.release}` : ""}`)
    expect(triangles).toBeGreaterThan(190_000)
    expect(res.status).toBe("ok")
    expect(seconds).toBeLessThan(200)
  })
})
