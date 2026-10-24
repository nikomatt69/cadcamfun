/**
 * The exchange evidence of spec 50 and spec 55: every solid the exact replay produces is written to STEP and read
 * back, and the two must be the same solid. The matrix cells are the corpus (one small part per feature kind), so
 * this test is the round-trip gate over the whole catalogue of feature kinds, not over one lucky part.
 *
 * A cell that has no exact model (a documented refusal) has nothing to exchange and is skipped, but it must still say
 * why: the matrix test owns that.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { rebuildExact, brepBox } from "./history-brep.ts"
import { model } from "./script.ts"
import { CELLS } from "./history-cells.ts"
import { massProperties, readStepBreps, validateBrep, writeStepBreps } from "./brep/index.ts"

setDefaultTimeout(110_000)

/** Relative difference of two volumes. */
const rel = (a: number, b: number): number => Math.abs(a - b) / Math.max(Math.abs(b), 1e-9)

describe("STEP round-trip of every matrix cell", () => {
  for (const cell of CELLS) {
    test(cell.id, () => {
      const m = model()
      cell.build(m)
      const ex = rebuildExact(m.build())
      const parts = ex.bodies
        .map((b, i) => ({ b, i }))
        .filter(({ b }) => b.brep !== undefined)
        .map(({ b, i }) => ({ name: `${cell.id}.${i}`, brep: b.brep! }))
      if (parts.length === 0) return
      const text = writeStepBreps(parts, { timestamp: "2026-01-01T00:00:00Z" })
      const back = readStepBreps(text)
      expect(back.warnings).toEqual([])
      expect(back.parts.length).toBe(parts.length)
      for (let i = 0; i < parts.length; i++) {
        const written = parts[i]!.brep
        const read = back.parts[i]!.brep
        // The solid that comes back is a solid.
        expect(validateBrep(read).issues.map((x) => x.message)).toEqual([])
        // The same volume: the exchange is exact, not a close fit.
        const vw = massProperties(written).volume
        const vr = massProperties(read).volume
        expect({ cell: cell.id, part: i, volumeError: rel(vw, vr) < 1e-6 }).toEqual({ cell: cell.id, part: i, volumeError: true })
        // The same place: the boxes agree to the confusion accuracy of the file.
        const bw = brepBox(written), br = brepBox(read)
        const tol = 1e-6 * (1 + Math.max(Math.abs(bw.hi.x - bw.lo.x), Math.abs(bw.hi.y - bw.lo.y), Math.abs(bw.hi.z - bw.lo.z)))
        for (const axis of ["x", "y", "z"] as const) {
          expect(Math.abs(bw.lo[axis] - br.lo[axis])).toBeLessThan(tol)
          expect(Math.abs(bw.hi[axis] - br.hi[axis])).toBeLessThan(tol)
        }
      }
    })
  }
})
