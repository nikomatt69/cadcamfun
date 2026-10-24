/**
 * Support structures. The layers are rasterised on a grid of one bead width: a cell of layer i is an overhang when it holds
 * material but the layer below, grown by what the overhang angle allows per layer, does not. Every overhang cell asks for
 * support in all the layers under it; a cell is supported in layer k when an overhang above it needs it (leaving the vertical
 * gap), the part itself is not in the way (leaving the horizontal gap) and, when supports may only stand on the plate, nothing
 * of the part lies below it. The last layers under an overhang are the dense interface. The cells are printed as lines that
 * alternate between X and Y with the layer.
 */
import type { Vec2 } from "../../cad/vec.ts"
import { offsetRegion, regionBox, regionKey, regionRings, type Box2, type Region, type Ring } from "./geom.ts"
import type { PrintProfile } from "./profile.ts"
import type { Extrusion } from "./types.ts"

export interface Grid {
  readonly minX: number
  readonly minY: number
  readonly cell: number
  readonly nx: number
  readonly ny: number
}

const MAX_CELLS = 3_000_000

export const gridFor = (box: Box2, cell0: number): Grid => {
  let cell = cell0
  let nx = Math.ceil((box.maxX - box.minX) / cell) + 1
  let ny = Math.ceil((box.maxY - box.minY) / cell) + 1
  while (nx * ny > MAX_CELLS) {
    cell *= 1.25
    nx = Math.ceil((box.maxX - box.minX) / cell) + 1
    ny = Math.ceil((box.maxY - box.minY) / cell) + 1
  }
  return { minX: box.minX, minY: box.minY, cell, nx, ny }
}

/** Cells whose centre is inside the region (even-odd over all its rings). */
export const rasterise = (region: Region, g: Grid): Uint8Array => {
  const mask = new Uint8Array(g.nx * g.ny)
  const rows: number[][] = Array.from({ length: g.ny }, () => [])
  for (const ring of regionRings(region) as Ring[]) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j]!
      const b = ring[i]!
      if (a.y === b.y) continue
      const lo = Math.min(a.y, b.y)
      const hi = Math.max(a.y, b.y)
      const r0 = Math.max(0, Math.ceil((lo - g.minY) / g.cell - 0.5))
      const r1 = Math.min(g.ny - 1, Math.floor((hi - g.minY) / g.cell - 0.5))
      for (let r = r0; r <= r1; r++) {
        const y = g.minY + (r + 0.5) * g.cell
        if (y < lo || y >= hi) continue
        rows[r]!.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y))
      }
    }
  }
  for (let r = 0; r < g.ny; r++) {
    const xs = rows[r]!.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k]! - g.minX) / g.cell - 0.5))
      const c1 = Math.min(g.nx - 1, Math.floor((xs[k + 1]! - g.minX) / g.cell - 0.5))
      for (let c = c0; c <= c1; c++) mask[r * g.nx + c] = 1
    }
  }
  return mask
}

export interface SupportPlan {
  /** Extrusions per layer (empty when supports are off). */
  readonly layers: ReadonlyArray<ReadonlyArray<Extrusion>>
  /** Area that overhangs further than the angle allows, mm^2 (whether or not it is supported). */
  readonly overhangArea: number
  readonly warnings: ReadonlyArray<string>
}

export const planSupports = (regions: ReadonlyArray<Region>, profile: PrintProfile, detectOnly = false): SupportPlan => {
  const empty: SupportPlan = { layers: regions.map(() => []), overhangArea: 0, warnings: [] }
  const boxes = regions.map(regionBox).filter((b): b is Box2 => b !== undefined)
  if (boxes.length === 0 || regions.length < 2) return empty
  const pad = 2 + profile.supportXYGap
  const box: Box2 = {
    minX: Math.min(...boxes.map((b) => b.minX)) - pad, minY: Math.min(...boxes.map((b) => b.minY)) - pad,
    maxX: Math.max(...boxes.map((b) => b.maxX)) + pad, maxY: Math.max(...boxes.map((b) => b.maxY)) + pad
  }
  const w = profile.extrusionWidth
  const g = gridFor(box, w)
  const n = regions.length
  const cells = g.nx * g.ny
  const needTop = new Int32Array(cells).fill(-1)
  const firstModel = new Int32Array(cells).fill(0x7fffffff)
  const reach = Math.tan((profile.supportAngle * Math.PI) / 180) * profile.layerHeight

  let prevKey = ""
  let curr: Uint8Array | undefined
  for (let i = 0; i < n; i++) {
    const key = regionKey(regions[i]!)
    if (key !== prevKey || curr === undefined) curr = rasterise(regions[i]!, g)
    for (let c = 0; c < cells; c++) if (curr[c] && firstModel[c] === 0x7fffffff) firstModel[c] = i
    if (i > 0 && key !== prevKey) {
      const below = regions[i - 1]!
      const allowed = rasterise(reach > 1e-9 ? offsetRegion(below, reach) : below, g)
      const over = new Uint8Array(cells)
      for (let c = 0; c < cells; c++) if (curr[c] && !allowed[c]) over[c] = 1
      // A lone cell is the rasterisation of an edge, not an overhang; a diagonal rim only touches its neighbours at the corners.
      for (let r = 0; r < g.ny; r++) {
        for (let c = 0; c < g.nx; c++) {
          const at = r * g.nx + c
          if (!over[at]) continue
          let neighbours = 0
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if ((dr === 0 && dc === 0) || r + dr < 0 || r + dr >= g.ny || c + dc < 0 || c + dc >= g.nx) continue
              if (over[at + dr * g.nx + dc]) neighbours++
            }
          }
          if (neighbours >= 1) { needTop[at] = i }
        }
      }
    }
    prevKey = key
  }
  // A rim thinner than a cell is only sampled in places, but what it shelters is the whole area under it: grow every flagged cell
  // by one cell so the columns join up.
  const grownNeed = needTop.slice()
  let overhangCells = 0
  for (let r = 0; r < g.ny; r++) {
    for (let c = 0; c < g.nx; c++) {
      const top = needTop[r * g.nx + c]!
      if (top < 0) continue
      overhangCells++
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (r + dr < 0 || r + dr >= g.ny || c + dc < 0 || c + dc >= g.nx) continue
          const at = (r + dr) * g.nx + c + dc
          if (grownNeed[at]! < top) grownNeed[at] = top
        }
      }
    }
  }
  const overhangArea = overhangCells * g.cell * g.cell
  if (detectOnly || profile.support === "none" || overhangCells === 0) return { layers: empty.layers, overhangArea, warnings: [] }

  const layers: Extrusion[][] = regions.map(() => [])
  const spacingN = Math.max(1, Math.round(w / (profile.supportDensity / 100) / g.cell))
  const minRun = 1.5 * w
  let grownKey = ""
  let grown: Uint8Array | undefined
  let lastNeeded = -1
  for (let c = 0; c < cells; c++) lastNeeded = Math.max(lastNeeded, grownNeed[c]!)
  const gap = profile.supportZGap
  for (let k = 0; k < Math.min(n, lastNeeded); k++) {
    const key = regionKey(regions[k]!)
    if (key !== grownKey || grown === undefined) {
      grown = rasterise(profile.supportXYGap > 1e-9 ? offsetRegion(regions[k]!, profile.supportXYGap) : regions[k]!, g)
      grownKey = key
    }
    const normal = new Uint8Array(cells)
    const iface = new Uint8Array(cells)
    let any = false
    for (let c = 0; c < cells; c++) {
      const top = grownNeed[c]!
      if (top - k <= gap || grown[c]) continue
      if (profile.support === "buildplate" && firstModel[c]! <= k) continue
      any = true
      if (top - k <= gap + profile.supportInterfaceLayers) iface[c] = 1
      else normal[c] = 1
    }
    if (!any) continue
    const alongX = k % 2 === 0
    const lines = alongX ? g.ny : g.nx
    const length = alongX ? g.nx : g.ny
    const out: Extrusion[] = []
    for (let line = 0; line < lines; line++) {
      const wantNormal = line % spacingN === 0
      let runStart = -1
      let runKind = 0
      const flush = (end: number): void => {
        if (runStart < 0) return
        const from = (alongX ? g.minX : g.minY) + runStart * g.cell
        const to = (alongX ? g.minX : g.minY) + end * g.cell
        if (to - from >= minRun) {
          const fixed = (alongX ? g.minY : g.minX) + (line + 0.5) * g.cell
          const a: Vec2 = alongX ? { x: from, y: fixed } : { x: fixed, y: from }
          const b: Vec2 = alongX ? { x: to, y: fixed } : { x: fixed, y: to }
          out.push({ kind: runKind === 2 ? "support-interface" : "support", points: [a, b] })
        }
        runStart = -1
      }
      for (let pos = 0; pos <= length; pos++) {
        let kind = 0
        if (pos < length) {
          const at = alongX ? line * g.nx + pos : pos * g.nx + line
          kind = iface[at] ? 2 : normal[at] && wantNormal ? 1 : 0
        }
        if (kind !== runKind) { flush(pos); if (kind !== 0) { runStart = pos } ; runKind = kind }
      }
    }
    layers[k] = out
  }
  const warnings: string[] = []
  if (profile.support === "buildplate") {
    let resting = 0
    for (let c = 0; c < cells; c++) if (needTop[c]! >= 0 && firstModel[c]! < needTop[c]!) resting++
    if (resting > 0) warnings.push(`${(resting * g.cell * g.cell).toFixed(0)} mm2 of overhang rests on the part itself and gets no support: allow supports everywhere`)
  }
  return { layers, overhangArea, warnings }
}
