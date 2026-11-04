/**
 * Stock carried between setups (spec 69 C4). A replayed setup leaves a height field (`ResidualStock`); the next setup, fixed in another
 * orientation, sees that solid through its own frame. This module reads the old field along the new setup's tool axis:
 *
 *   column   for the oriented point `(x, y)` of the new setup, the solid is the set of `z` whose CAD point lies, in the old frame, in
 *            the old field's solid (between its floor and its top, inside its grid). The highest solid `z` is where the new height
 *            field starts, and the solid length is kept so the air below it (what the earlier setup removed from the other side) is
 *            not counted as stock.
 *   bound    every transition of solid to air is found by bisection to 1 micrometre; the old field is itself a grid of its cell, so the
 *            carried stock errs by up to that cell laterally (the `stock-replay` term of the new setup states its own cell).
 *
 * A height field holds one solid run per column in its own direction; seen from another direction a column can hold several runs, and
 * all of them are summed. What it cannot hold is an undercut of the old setup (nothing reaches there with a vertical tool).
 */
import { applyPoint, type Transform } from "../../cad/brep/math.ts"
import type { ResidualStock } from "./contracts.ts"
import { setupTransform, type SetupOrientation } from "../setup.ts"

/** The inverse of a signed permutation (a rotation): its transpose. */
export const transposeOf = (t: Transform): Transform => {
  const m = t.m
  return { m: [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]], t: { x: 0, y: 0, z: 0 } }
}

/** The stock box of a setup (oriented coordinates) in CAD world coordinates. */
export const cadStockOf = (stock: { readonly min: { x: number; y: number; z: number }; readonly max: { x: number; y: number; z: number } }, orientation: SetupOrientation): { readonly min: { x: number; y: number; z: number }; readonly max: { x: number; y: number; z: number } } => {
  const back = transposeOf(setupTransform(orientation))
  const cs = [stock.min.x, stock.max.x].flatMap((x) => [stock.min.y, stock.max.y].flatMap((y) => [stock.min.z, stock.max.z].map((z) => applyPoint(back, { x, y, z }))))
  return { min: { x: Math.min(...cs.map((c) => c.x)), y: Math.min(...cs.map((c) => c.y)), z: Math.min(...cs.map((c) => c.z)) }, max: { x: Math.max(...cs.map((c) => c.x)), y: Math.max(...cs.map((c) => c.y)), z: Math.max(...cs.map((c) => c.z)) } }
}

export const carriedColumns = (residual: ResidualStock, into: Transform): ((x: number, y: number, zLow: number, zHigh: number) => { top: number; solid: number }) => {
  const r = residual
  const old = setupTransform(r.orientation)
  const back = transposeOf(into)
  const solidAt = (x: number, y: number, z: number): boolean => {
    const cad = applyPoint(back, { x, y, z })
    const p = applyPoint(old, cad)
    const i = Math.floor((p.x - r.origin.x - r.minX) / r.cellX), j = Math.floor((p.y - r.origin.y - r.minY) / r.cellY)
    if (i < 0 || j < 0 || i >= r.nx || j >= r.ny) return false
    const w = p.z - r.origin.z
    return w >= r.floor && w <= r.top[j * r.nx + i]!
  }
  const step0 = Math.max(Math.min(r.cellX, r.cellY, 0.5) / 2, 0.02)
  return (x, y, zLow, zHigh) => {
    const step = Math.max(step0, (zHigh - zLow) / 600)
    // Bisect the solid / air transition between `solidZ` and `airZ` (one is solid, the other not).
    const edge = (solidZ: number, airZ: number): number => {
      let s = solidZ, a = airZ
      for (let k = 0; k < 12 && Math.abs(s - a) > 1e-3; k++) { const m = (s + a) / 2; if (solidAt(x, y, m)) s = m; else a = m }
      return (s + a) / 2
    }
    let top = -Infinity, solid = 0
    let runTop: number | undefined
    let prevZ = zHigh, prevSolid = solidAt(x, y, zHigh)
    if (prevSolid) { runTop = zHigh; top = zHigh }
    for (let z = zHigh - step; ; z -= step) {
      const zz = Math.max(z, zLow)
      const s = solidAt(x, y, zz)
      if (s !== prevSolid) {
        const e = prevSolid ? edge(prevZ, zz) : edge(zz, prevZ)
        if (prevSolid) { solid += (runTop ?? e) - e; runTop = undefined }
        else { runTop = e; if (top === -Infinity) top = e }
      }
      prevZ = zz; prevSolid = s
      if (zz <= zLow) break
    }
    if (prevSolid && runTop !== undefined) solid += runTop - zLow
    return { top, solid }
  }
}
