/**
 * The stock a verified program leaves, as a closed triangle mesh (a solid that can be exported as STL, OBJ or 3MF).
 *
 * The verifier keeps the remaining stock as a height field (`VerifyResponse["preview"]`: one top height per cell). The mesh
 * puts a node on every cell corner at the mean of the cells that meet there, the top surface on those nodes, a flat bottom at
 * `floor` and a skirt along the four sides, so it is watertight by construction (every edge is shared by exactly two
 * triangles) and wound outward. A height field cannot hold an undercut or a part cut free of the stock: cells whose top is at
 * the floor have no thickness and are counted in `thinCells`, never hidden.
 */
import type { VerifyResponse } from "./schema.ts"

type Preview = VerifyResponse["preview"]

export interface StockMesh {
  readonly positions: Float64Array
  readonly indices: Uint32Array
  /** Cells with no material left above the floor (a through cut or an empty cell): zero thickness in the mesh. */
  readonly thinCells: number
  /** Cell size of the field the mesh was built from, mm: features smaller than this are not in the mesh. */
  readonly cellX: number
  readonly cellY: number
}

export interface StockMeshOptions {
  /** Z of the flat bottom, mm (the bottom of the stock). Must not exceed the lowest top height. */
  readonly floor: number
}

export const stockMeshFromPreview = (preview: Preview, options: StockMeshOptions): StockMesh => {
  const { nx, ny, cellX, cellY, minX, minY, heights } = preview
  if (!(nx >= 1 && ny >= 1) || heights.length !== nx * ny) throw new RangeError(`The height field has ${heights.length} heights for ${nx} x ${ny} cells`)
  if (!(cellX > 0 && cellY > 0)) throw new RangeError("The height field cells must have a positive size")
  const { floor } = options
  if (!Number.isFinite(floor)) throw new RangeError("The mesh floor must be a finite height")
  const top = (i: number, j: number): number => Math.max(floor, heights[j * nx + i]!)

  const w = nx + 1
  const nodes = w * (ny + 1)
  const positions = new Float64Array(nodes * 2 * 3)
  let thinCells = 0
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (top(i, j) - floor < 1e-9) thinCells++
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      let sum = 0, count = 0
      for (let dj = -1; dj <= 0; dj++) for (let di = -1; di <= 0; di++) {
        const ci = i + di, cj = j + dj
        if (ci < 0 || cj < 0 || ci >= nx || cj >= ny) continue
        sum += top(ci, cj)
        count++
      }
      const n = j * w + i
      const x = minX + i * cellX, y = minY + j * cellY
      positions.set([x, y, sum / count], n * 3)
      positions.set([x, y, floor], (nodes + n) * 3)
    }
  }

  const t = (i: number, j: number): number => j * w + i
  const b = (i: number, j: number): number => nodes + j * w + i
  const tris: number[] = []
  const push = (a: number, c: number, d: number): void => { tris.push(a, c, d) }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      push(t(i, j), t(i + 1, j), t(i + 1, j + 1)); push(t(i, j), t(i + 1, j + 1), t(i, j + 1))
      push(b(i, j), b(i + 1, j + 1), b(i + 1, j)); push(b(i, j), b(i, j + 1), b(i + 1, j + 1))
    }
  }
  for (let i = 0; i < nx; i++) {
    // South (-Y) and north (+Y) skirts.
    push(t(i, 0), b(i, 0), b(i + 1, 0)); push(t(i, 0), b(i + 1, 0), t(i + 1, 0))
    push(t(i, ny), t(i + 1, ny), b(i + 1, ny)); push(t(i, ny), b(i + 1, ny), b(i, ny))
  }
  for (let j = 0; j < ny; j++) {
    // West (-X) and east (+X) skirts.
    push(t(0, j), t(0, j + 1), b(0, j + 1)); push(t(0, j), b(0, j + 1), b(0, j))
    push(t(nx, j), b(nx, j), b(nx, j + 1)); push(t(nx, j), b(nx, j + 1), t(nx, j + 1))
  }
  return { positions, indices: Uint32Array.from(tris), thinCells, cellX, cellY }
}
