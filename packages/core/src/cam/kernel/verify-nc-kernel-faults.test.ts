/**
 * Fault injection on programs the kernel wrote (spec 72 P0-4, whole-job level): seeded overcuts are put into the finishing passes of the
 * kernel's own NC for several real parts, and the independent replay (`verifyNc`) must find every one, with the NC line of the move that
 * carries it; the unmodified programs must verify clean. The overcut moves one wall point of a deep finishing pass toward the part.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { buildRecipe } from "../../cad/index.ts"
import { partMeshes } from "../model/model.ts"
import { runJob } from "./execute.ts"
import { jobOfSnapshot } from "./snapshot.ts"
import { verifyNc } from "./verify-nc.ts"
import type { CamArtifact } from "./contracts.ts"

setDefaultTimeout(600_000)

const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }

const parts: ReadonlyArray<{ readonly name: string; readonly elements: ReadonlyArray<Record<string, unknown>> }> = [
  { name: "plate 40x30x8", elements: [{ id: "plate", type: "cube", width: 40, height: 30, depth: 8, x: 0, y: 0, z: 0 }] },
  { name: "plate 56x36x10", elements: [{ id: "plate", type: "cube", width: 56, height: 36, depth: 10, x: 0, y: 0, z: 0 }] },
  { name: "mounting plate", elements: [{ id: "mount", type: "parametric", history: buildRecipe("mounting_plate", { width: 90, depth: 60, thickness: 10, fastener: "M5", counterbore: true } as never).history }] }
]

interface Case { readonly artifact: CamArtifact; readonly elements: ReadonlyArray<Record<string, unknown>> }
const make = (elements: ReadonlyArray<Record<string, unknown>>): Case => {
  const job = jobOfSnapshot({ schemaVersion: 1, id: "fault", name: "Fault", material: "6061", machine: "vmc-standard", elements } as never)
  if (job.status !== "ok") throw new Error(job.issues.map((i) => i.message).join("; "))
  const run = runJob(job.value)
  if (run.status !== "ok") throw new Error(run.issues.map((i) => i.message).join("; "))
  return { artifact: run.value, elements }
}

const check = (c: Case, nc: string) => {
  const o = c.artifact.origin, b = c.artifact.stockBounds
  const part = partMeshes(c.elements as never)!.meshes.map((m) => ({ positions: Float64Array.from(m.positions, (v, i) => v - [o.x, o.y, o.z][i % 3]!), indices: m.indices }))
  return verifyNc({
    nc, part, stock: { min: { x: b.min.x - o.x, y: b.min.y - o.y, z: b.min.z - o.z }, max: { x: b.max.x - o.x, y: b.max.y - o.y, z: b.max.z - o.z } },
    tools: c.artifact.tools.map((t) => ({ number: t.number, cutter: t })), tolerance: 0.01, allowance: 0.3, cell: 0.3
  })
}

/** Finishing lines that carry an explicit X or Y far enough outside the part's footprint to be a wall pass at depth, and the shifted copy. */
const injectable = (c: Case): ReadonlyArray<{ readonly index: number; readonly shift: (d: number) => string }> => {
  const o = c.artifact.origin
  const meshes = partMeshes(c.elements as never)!.meshes
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, topZ = -Infinity
  for (const m of meshes) for (let i = 0; i < m.positions.length; i += 3) {
    minX = Math.min(minX, m.positions[i]! - o.x); maxX = Math.max(maxX, m.positions[i]! - o.x)
    minY = Math.min(minY, m.positions[i + 1]! - o.y); maxY = Math.max(maxY, m.positions[i + 1]! - o.y)
    topZ = Math.max(topZ, m.positions[i + 2]! - o.z)
  }
  const lines = c.artifact.nc.split("\n")
  const start = lines.findIndex((l) => /FINISH/i.test(l) && /^\(OP\d/.test(l))
  const out: Array<{ index: number; shift: (d: number) => string }> = []
  let z = Number.NaN
  lines.forEach((line, index) => {
    const mz = /Z(-?[\d.]+)/.exec(line)
    if (mz) z = Number(mz[1])
    if (index < start || start < 0 || /^G0|^\(/.test(line) || !(z < topZ - 2.5)) return
    const mx = /X(-?[\d.]+)/.exec(line), my = /Y(-?[\d.]+)/.exec(line)
    // A wall vertex of a straight pass: an explicit X beyond the left or right face, or an explicit Y beyond the front or back face (the other
    // coordinate modal or inside the footprint). Arcs are left alone: their centre words would no longer match the moved end point.
    if (/\b[GIJ][23]?\b|\bI-?[\d.]|\bJ-?[\d.]|^G[23]/.test(line)) return
    if (mx && (Number(mx[1]) < minX - 0.5 || Number(mx[1]) > maxX + 0.5) && (!my || (Number(my[1]) >= minY && Number(my[1]) <= maxY))) {
      const x = Number(mx[1]), toward = x < minX ? 1 : -1
      out.push({ index, shift: (d) => line.replace(/X(-?[\d.]+)/, `X${(x + toward * d).toFixed(3)}`) })
    } else if (my && (Number(my[1]) < minY - 0.5 || Number(my[1]) > maxY + 0.5) && (!mx || (Number(mx[1]) >= minX && Number(mx[1]) <= maxX))) {
      const y = Number(my[1]), toward = y < minY ? 1 : -1
      out.push({ index, shift: (d) => line.replace(/Y(-?[\d.]+)/, `Y${(y + toward * d).toFixed(3)}`) })
    }
  })
  return out
}

describe("verifyNc on programs the kernel wrote, with seeded overcuts", () => {
  for (const [p, part] of parts.entries()) {
    test(`${part.name}: the program verifies clean, and 5 seeded overcuts of 0.5 to 1.5 mm in its deep finishing passes are all found`, () => {
      const c = make(part.elements)
      const clean = check(c, c.artifact.nc)
      expect(clean.findings.filter((f) => f.kind === "gouge")).toEqual([])
      const candidates = injectable(c)
      expect(candidates.length).toBeGreaterThanOrEqual(2)
      const random = rng(7000 + p)
      const missed: string[] = []
      for (let k = 0; k < 5; k++) {
        const target = candidates[Math.floor(random() * candidates.length)]!
        const depth = Math.round((0.5 + random() * 1) * 100) / 100
        const lines = c.artifact.nc.split("\n")
        lines[target.index] = target.shift(depth)
        const result = check(c, lines.join("\n"))
        const gouge = result.findings.find((f) => f.kind === "gouge")
        if (gouge === undefined) missed.push(`line ${target.index + 1} by ${depth} mm: ${result.verdict}`)
      }
      expect(missed).toEqual([])
    })
  }
})
