/**
 * Printability analysis: what a part will cost to print and where it will fail, read from the mesh and from its layers before a
 * single path is planned. The CAD manufacturability check (`cad/dfm.ts`) and the assistant use the same functions.
 *
 *   overhang map   every triangle's overhang angle (0 = vertical wall, 90 = flat ceiling) summed into bands; the area beyond the
 *                  support angle that is not resting on the plate, and an upper bound of the support volume it needs
 *   thin walls     features thinner than a required wall: the layer is rasterised and opened morphologically with the exact
 *                  Euclidean distance transform (what disappears under an erosion by half the wall and a dilation back is thin)
 *   bridges        overhang regions of a layer that are anchored on two opposite sides are bridges and carry a span; the others
 *                  are cantilevers (they need support or a different orientation)
 *   orientation    the six faces, the largest flat faces and a spread of directions are scored by support volume, overhang area,
 *                  height and plate contact, and ranked with the numbers that decided
 */
import type { Vec2 } from "../../cad/vec.ts"
import { regionBox, type Box2, type Region } from "./geom.ts"
import { gridFor, rasterise, type Grid } from "./support.ts"
import { sliceMesh, type SliceMesh } from "./slice.ts"

export interface PrintabilityOptions {
  /** Overhang angle from the vertical beyond which a face needs support, degrees. Default 45. */
  readonly overhangAngle?: number
  /** Thinnest wall the part may have, mm. Default two nozzle widths. */
  readonly minWall?: number
  readonly nozzle?: number
  readonly layerHeight?: number
  /** Longest unsupported span that is bridged, mm. Default 40. */
  readonly maxBridge?: number
  /** Layers examined for thin walls and bridges (evenly spread). Default 40. */
  readonly sampleLayers?: number
  /** Raster cell for the layer analyses, mm. Default a quarter of the nozzle. */
  readonly cell?: number
}

export interface OverheadBand { readonly fromDeg: number; readonly toDeg: number; readonly area: number }

export interface OverhangReport {
  /** Total surface area, mm^2. */
  readonly surfaceArea: number
  /** Area of faces beyond the angle that do not rest on the plate, mm^2. */
  readonly area: number
  readonly share: number
  readonly maxAngle: number
  readonly bands: ReadonlyArray<OverheadBand>
  /** Area of downward faces resting on the plate, mm^2. */
  readonly contactArea: number
  /** Upper bound of the support volume under the overhangs, mm^3: projected area times the height above the plate (nothing below assumed). */
  readonly supportVolumeBound: number
  readonly height: number
}

export interface ThinFinding { readonly layer: number; readonly z: number; readonly x: number; readonly y: number; readonly area: number }

export interface ThinReport {
  readonly minWall: number
  readonly layersChecked: number
  /** Largest thin area in one layer, mm^2. */
  readonly worstArea: number
  readonly worstLayer: ThinFinding | undefined
  /** Thin area summed over the checked layers times the spacing of the sample: an estimate of the thin volume, mm^3. */
  readonly volumeEstimate: number
  readonly findings: ReadonlyArray<ThinFinding>
}

export interface BridgeFinding { readonly layer: number; readonly z: number; readonly x: number; readonly y: number; readonly span: number; readonly direction: "x" | "y" | "none"; readonly kind: "bridge" | "cantilever"; readonly area: number; readonly printable: boolean }

export interface BridgeReport {
  readonly bridges: number
  readonly cantilevers: number
  readonly longestSpan: number
  /** Overhang regions that cannot print without support: spans over the limit and every cantilever. */
  readonly needSupport: number
  readonly findings: ReadonlyArray<BridgeFinding>
}

export interface Printability {
  readonly overhang: OverhangReport
  readonly thin: ThinReport
  readonly bridges: BridgeReport
  readonly verdict: ReadonlyArray<string>
}

const DEG = Math.PI / 180

// ---------------------------------------------------------------- overhang map

interface TriangleFacts { readonly area: number; readonly nx: number; readonly ny: number; readonly nz: number; readonly cx: number; readonly cy: number; readonly cz: number; readonly zMin: number }

/** Calls `visit` for every triangle with its area, unit normal, centroid and lowest z. Zero-area triangles are skipped. */
const eachTriangle = (mesh: SliceMesh, visit: (t: TriangleFacts) => void): void => {
  const p = mesh.positions
  for (let k = 0; k + 2 < mesh.indices.length; k += 3) {
    const a = mesh.indices[k]! * 3, b = mesh.indices[k + 1]! * 3, c = mesh.indices[k + 2]! * 3
    const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!
    const vx = p[c]! - p[a]!, vy = p[c + 1]! - p[a + 1]!, vz = p[c + 2]! - p[a + 2]!
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    if (len < 1e-14) continue
    visit({
      area: len / 2, nx: nx / len, ny: ny / len, nz: nz / len,
      cx: (p[a]! + p[b]! + p[c]!) / 3, cy: (p[a + 1]! + p[b + 1]! + p[c + 1]!) / 3, cz: (p[a + 2]! + p[b + 2]!+ p[c + 2]!) / 3,
      zMin: Math.min(p[a + 2]!, p[b + 2]!, p[c + 2]!)
    })
  }
}

const orientedVolume = (mesh: SliceMesh): number => {
  const p = mesh.positions
  let v = 0
  for (let k = 0; k + 2 < mesh.indices.length; k += 3) {
    const a = mesh.indices[k]! * 3, b = mesh.indices[k + 1]! * 3, c = mesh.indices[k + 2]! * 3
    v += (p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) - p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) + p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) / 6
  }
  return v
}

/**
 * The overhang map of closed meshes in the build direction +Z (an inside-out mesh is read as the solid it encloses). A face rests
 * on the plate when it faces down and lies within a layer of the lowest point of the part.
 */
export const overhangMap = (meshes: ReadonlyArray<SliceMesh>, options: PrintabilityOptions = {}): OverhangReport => {
  const angle = options.overhangAngle ?? 45
  const layer = options.layerHeight ?? 0.2
  let zMin = Infinity, zMax = -Infinity
  for (const m of meshes) for (let i = 2; i < m.positions.length; i += 3) { const z = m.positions[i]!; if (z < zMin) zMin = z; if (z > zMax) zMax = z }
  const bands = Array.from({ length: 6 }, (_, i) => ({ fromDeg: i * 15, toDeg: (i + 1) * 15, area: 0 }))
  let surface = 0, over = 0, contact = 0, support = 0, maxAngle = 0
  for (const mesh of meshes) {
    const flip = orientedVolume(mesh) < 0 ? -1 : 1
    eachTriangle(mesh, (t) => {
      surface += t.area
      const nz = t.nz * flip
      if (nz >= 0) return
      const theta = Math.asin(Math.min(1, -nz)) / DEG
      if (t.zMin - zMin <= layer * 0.5 && theta > 80) { contact += t.area; return }
      bands[Math.min(5, Math.floor(theta / 15))]!.area += t.area
      if (theta > angle) {
        over += t.area
        support += t.area * -nz * Math.max(0, t.cz - zMin)
        if (theta > maxAngle) maxAngle = theta
      }
    })
  }
  return { surfaceArea: surface, area: over, share: surface > 0 ? over / surface : 0, maxAngle, bands, contactArea: contact, supportVolumeBound: support, height: Math.max(0, zMax - zMin) }
}

// ---------------------------------------------------------------- raster tools

const INF = 1e20

/** Squared Euclidean distance (in cells) from every cell to the nearest cell where `mask` is 0 (Felzenszwalb-Huttenlocher, exact). */
export const distanceSquared = (mask: Uint8Array, nx: number, ny: number): Float64Array => {
  const d = new Float64Array(nx * ny)
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? INF : 0
  const n = Math.max(nx, ny)
  const f = new Float64Array(n), out = new Float64Array(n), z = new Float64Array(n + 2), v = new Int32Array(n + 1)
  const pass = (length: number): void => {
    let k = 0
    v[0] = 0; z[0] = -Infinity; z[1] = Infinity
    for (let q = 1; q < length; q++) {
      let s = ((f[q]! + q * q) - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!)
      while (s <= z[k]!) {
        k--
        s = ((f[q]! + q * q) - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!)
      }
      k++
      v[k] = q; z[k] = s; z[k + 1] = Infinity
    }
    k = 0
    for (let q = 0; q < length; q++) {
      while (z[k + 1]! < q) k++
      const p = v[k]!
      out[q] = (q - p) * (q - p) + f[p]!
    }
  }
  for (let x = 0; x < nx; x++) {
    for (let y = 0; y < ny; y++) f[y] = d[y * nx + x]!
    pass(ny)
    for (let y = 0; y < ny; y++) d[y * nx + x] = out[y]!
  }
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) f[x] = d[y * nx + x]!
    pass(nx)
    for (let x = 0; x < nx; x++) d[y * nx + x] = out[x]!
  }
  return d
}

/**
 * Cells of `mask` that belong to features thinner than `2 * radius` cells: the mask minus its morphological opening by a disc, with
 * the corner rounding of the opening forgiven (a cell within `radius * sqrt 2` of the part's thick core is not a thin feature, so a
 * rectangle has none and a fin is reported from about 0.4 wall widths beyond the block it stands on). The disc is the exact
 * Euclidean one: a wall of width `w` survives when `w >= 2 * radius` and is reported when it is thinner.
 */
export const thinCells = (mask: Uint8Array, nx: number, ny: number, radius: number): Uint8Array => {
  // Pad the mask with background so the border of the grid counts as outside.
  const px = nx + 2, py = ny + 2
  const padded = new Uint8Array(px * py)
  for (let y = 0; y < ny; y++) padded.set(mask.subarray(y * nx, y * nx + nx), (y + 1) * px + 1)
  const toBackground = distanceSquared(padded, px, py)
  const core = new Uint8Array(px * py)
  const r2 = radius * radius
  // A cell centre is half a cell inside the boundary of the first background cell it sees.
  const core2 = (radius + 0.5) * (radius + 0.5)
  for (let i = 0; i < core.length; i++) core[i] = toBackground[i]! >= core2 ? 1 : 0
  // Distance from the cores: cells within the radius of a core cell are in the opening.
  const notCore = new Uint8Array(px * py)
  for (let i = 0; i < core.length; i++) notCore[i] = core[i] ? 0 : 1
  const fromCore = distanceSquared(notCore, px, py)
  const thin = new Uint8Array(nx * ny)
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const i = (y + 1) * px + x + 1
    // The opening rounds every convex corner of a fat part; those few cells (within r * sqrt 2 of a core cell) are not thin features.
    if (padded[i] && fromCore[i]! > 2 * r2 + 1e-6) thin[y * nx + x] = 1
  }
  return thin
}

const centroidOf = (cells: ReadonlyArray<number>, g: Grid): Vec2 => {
  let sx = 0, sy = 0
  for (const c of cells) { sx += g.minX + ((c % g.nx) + 0.5) * g.cell; sy += g.minY + (Math.floor(c / g.nx) + 0.5) * g.cell }
  return { x: sx / cells.length, y: sy / cells.length }
}

const components = (mask: Uint8Array, g: Grid): number[][] => {
  const seen = new Uint8Array(mask.length)
  const out: number[][] = []
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue
    const cells = [s]
    seen[s] = 1
    for (let head = 0; head < cells.length; head++) {
      const c = cells[head]!
      const x = c % g.nx, y = (c - x) / g.nx
      if (x > 0 && mask[c - 1] && !seen[c - 1]) { seen[c - 1] = 1; cells.push(c - 1) }
      if (x < g.nx - 1 && mask[c + 1] && !seen[c + 1]) { seen[c + 1] = 1; cells.push(c + 1) }
      if (y > 0 && mask[c - g.nx] && !seen[c - g.nx]) { seen[c - g.nx] = 1; cells.push(c - g.nx) }
      if (y < g.ny - 1 && mask[c + g.nx] && !seen[c + g.nx]) { seen[c + g.nx] = 1; cells.push(c + g.nx) }
    }
    out.push(cells)
  }
  return out
}

// ---------------------------------------------------------------- thin walls and bridges from the layers

const sampleIndices = (count: number, wanted: number): number[] => {
  if (count <= wanted) return Array.from({ length: count }, (_, i) => i)
  return Array.from({ length: wanted }, (_, i) => Math.round((i * (count - 1)) / (wanted - 1)))
}

const boxOf = (regions: ReadonlyArray<Region>, pad: number): Box2 | undefined => {
  const boxes = regions.map(regionBox).filter((b): b is Box2 => b !== undefined)
  if (boxes.length === 0) return undefined
  return { minX: Math.min(...boxes.map((b) => b.minX)) - pad, minY: Math.min(...boxes.map((b) => b.minY)) - pad, maxX: Math.max(...boxes.map((b) => b.maxX)) + pad, maxY: Math.max(...boxes.map((b) => b.maxY)) + pad }
}

/** Thin features of sliced layers. `zs[i]` is the height of layer `i`. */
export const thinWalls = (regions: ReadonlyArray<Region>, zs: ReadonlyArray<number>, options: PrintabilityOptions = {}): ThinReport => {
  const nozzle = options.nozzle ?? 0.4
  const minWall = options.minWall ?? 2 * nozzle
  const box = boxOf(regions, minWall)
  if (box === undefined) return { minWall, layersChecked: 0, worstArea: 0, worstLayer: undefined, volumeEstimate: 0, findings: [] }
  const g = gridFor(box, options.cell ?? nozzle / 4)
  const radius = minWall / 2 / g.cell
  const picks = sampleIndices(regions.length, options.sampleLayers ?? 40)
  const spacing = regions.length > 1 ? (zs[zs.length - 1]! - zs[0]!) / (regions.length - 1) : 0.2
  const findings: ThinFinding[] = []
  let worst: ThinFinding | undefined
  let volume = 0
  for (const i of picks) {
    const region = regions[i]!
    if (region.length === 0) continue
    const thin = thinCells(rasterise(region, g), g.nx, g.ny, radius)
    let area = 0
    for (let c = 0; c < thin.length; c++) if (thin[c]) area += g.cell * g.cell
    if (area < minWall * minWall * 0.05) continue
    volume += area * spacing * (regions.length / picks.length)
    const parts = components(thin, g).filter((c) => c.length * g.cell * g.cell >= minWall * minWall * 0.05)
    for (const cells of parts) {
      const at = centroidOf(cells, g)
      const f: ThinFinding = { layer: i, z: zs[i]!, x: at.x, y: at.y, area: cells.length * g.cell * g.cell }
      if (findings.length < 24) findings.push(f)
      if (worst === undefined || f.area > worst.area) worst = f
    }
  }
  return { minWall, layersChecked: picks.length, worstArea: worst?.area ?? 0, worstLayer: worst, volumeEstimate: volume, findings }
}

/** Overhang regions of the sampled layers, classified as bridges (anchored on two opposite sides) or cantilevers. */
export const bridgeSpans = (regions: ReadonlyArray<Region>, zs: ReadonlyArray<number>, options: PrintabilityOptions = {}): BridgeReport => {
  const nozzle = options.nozzle ?? 0.4
  const maxBridge = options.maxBridge ?? 40
  const reach = Math.tan((options.overhangAngle ?? 45) * DEG) * (options.layerHeight ?? 0.2)
  const box = boxOf(regions, 2)
  if (box === undefined || regions.length < 2) return { bridges: 0, cantilevers: 0, longestSpan: 0, needSupport: 0, findings: [] }
  const g = gridFor(box, options.cell ?? nozzle / 2)
  const picks = sampleIndices(regions.length - 1, options.sampleLayers ?? 40).map((i) => i + 1)
  const findings: BridgeFinding[] = []
  let bridges = 0, cantilevers = 0, longest = 0, need = 0
  const reachCells = Math.max(0, Math.round(reach / g.cell))
  for (const i of picks) {
    const now = rasterise(regions[i]!, g)
    const below = rasterise(regions[i - 1]!, g)
    // Material that the layer below, allowed to lean out by what the angle permits, does not carry.
    const carried = new Uint8Array(below)
    if (reachCells > 0) {
      const d = distanceSquared(new Uint8Array(below.map((v) => (v ? 0 : 1))), g.nx, g.ny)
      for (let c = 0; c < carried.length; c++) if (!carried[c] && d[c]! <= reachCells * reachCells) carried[c] = 1
    }
    const over = new Uint8Array(now.length)
    let any = false
    for (let c = 0; c < over.length; c++) if (now[c] && !carried[c]) { over[c] = 1; any = true }
    if (!any) continue
    for (const cells of components(over, g)) {
      const area = cells.length * g.cell * g.cell
      if (area < nozzle * nozzle * 4) continue
      const set = new Set(cells)
      // Runs along X and along Y; a run is anchored when the cells at both ends belong to the carried layer.
      const spanOf = (axis: "x" | "y"): number | undefined => {
        let widest = 0
        for (const c of cells) {
          const x = c % g.nx, y = (c - x) / g.nx
          const bx = axis === "x" ? x - 1 : x, by = axis === "x" ? y : y - 1
          if (bx >= 0 && by >= 0 && set.has(by * g.nx + bx)) continue // not the start of a run
          let ex = x, ey = y, length = 0
          while (ex < g.nx && ey < g.ny && set.has(ey * g.nx + ex)) { length++; if (axis === "x") ex++; else ey++ }
          const before = bx >= 0 && by >= 0 ? by * g.nx + bx : -1
          const after = ex < g.nx && ey < g.ny ? ey * g.nx + ex : -1
          if (before < 0 || after < 0 || carried[before] !== 1 || carried[after] !== 1) return undefined
          widest = Math.max(widest, length * g.cell)
        }
        return widest
      }
      const sx = spanOf("x"), sy = spanOf("y")
      const at = centroidOf(cells, g)
      if (sx === undefined && sy === undefined) {
        // Distance a cantilever reaches from its anchor: its longest run in the shorter direction.
        cantilevers++
        need++
        if (findings.length < 24) findings.push({ layer: i, z: zs[i]!, x: at.x, y: at.y, span: Math.sqrt(area), direction: "none", kind: "cantilever", area, printable: false })
        continue
      }
      const useX = sy === undefined || (sx !== undefined && sx <= sy)
      const span = useX ? sx! : sy!
      bridges++
      longest = Math.max(longest, span)
      const printable = span <= maxBridge
      if (!printable) need++
      if (findings.length < 24) findings.push({ layer: i, z: zs[i]!, x: at.x, y: at.y, span, direction: useX ? "x" : "y", kind: "bridge", area, printable })
    }
  }
  return { bridges, cantilevers, longestSpan: longest, needSupport: need, findings }
}

/** The three analyses of one part, in the build direction +Z, with the sentences that follow from them. */
export const analysePrintability = (meshes: ReadonlyArray<SliceMesh>, options: PrintabilityOptions = {}): Printability => {
  const overhang = overhangMap(meshes, options)
  let zMin = Infinity
  for (const m of meshes) for (let i = 2; i < m.positions.length; i += 3) zMin = Math.min(zMin, m.positions[i]!)
  // Every layer is cut (cutting is linear in the triangles); a part that would take more than 4000 layers is cut at a coarser pitch.
  const layer = Math.max(options.layerHeight ?? 0.2, overhang.height / 4000)
  const count = Math.max(1, Math.floor(overhang.height / layer))
  const planes = Array.from({ length: count }, (_, i) => zMin + (i + 0.5) * layer)
  const sliced = meshes.map((m) => sliceMesh(m, planes, { simplify: 0.01 }))
  const regions = planes.map((_, k) => sliced.flatMap((s) => s.regions[k] ?? []))
  const thin = thinWalls(regions, planes, options)
  const bridges = bridgeSpans(regions, planes, { ...options, layerHeight: layer })
  const verdict: string[] = []
  if (overhang.area > 0) verdict.push(`${overhang.area.toFixed(0)} mm2 (${(overhang.share * 100).toFixed(0)} % of the surface) overhangs more than ${options.overhangAngle ?? 45} degrees (worst ${overhang.maxAngle.toFixed(0)}); the support volume is at most ${overhang.supportVolumeBound.toFixed(0)} mm3`)
  if (thin.worstArea > 0) verdict.push(`features thinner than ${thin.minWall} mm: up to ${thin.worstArea.toFixed(1)} mm2 in one layer, first at z ${thin.worstLayer!.z.toFixed(2)} mm near (${thin.worstLayer!.x.toFixed(1)}, ${thin.worstLayer!.y.toFixed(1)})`)
  if (bridges.needSupport > 0) verdict.push(`${bridges.needSupport} overhanging region(s) cannot be bridged (${bridges.cantilevers} cantilever(s), longest bridge ${bridges.longestSpan.toFixed(1)} mm against ${options.maxBridge ?? 40} mm)`)
  return { overhang, thin, bridges, verdict }
}

// ---------------------------------------------------------------- orientation

export interface OrientationCandidate {
  /** Unit direction of the part that goes down onto the plate. */
  readonly down: readonly [number, number, number]
  readonly label: string
  readonly overhangArea: number
  readonly contactArea: number
  readonly supportVolumeBound: number
  readonly height: number
  readonly score: number
}

export interface OrientationRanking {
  readonly ranked: ReadonlyArray<OrientationCandidate>
  readonly designed: OrientationCandidate
  readonly best: OrientationCandidate
  /** The best one only when it beats the designed orientation by `margin` (a fraction of the designed score). */
  readonly chosen: OrientationCandidate
  readonly volume: number
}

export interface OrientationOptions extends PrintabilityOptions {
  /** Directions tried beyond the faces: points of a spiral on the sphere. Default 32. */
  readonly spread?: number
  /** The largest flat face directions tried. Default 12. */
  readonly flatFaces?: number
  readonly margin?: number
}

/** Rotation (row-major 3x3) that turns the unit vector `down` into -Z, as a proper rotation. */
export const rotationDown = (down: readonly [number, number, number]): readonly [number, number, number, number, number, number, number, number, number] => {
  const [dx, dy, dz] = down
  // Rodrigues from d to t = (0, 0, -1): v = d x t, c = d . t.
  const vx = -dy, vy = dx, vz = 0
  const c = -dz
  if (c < -1 + 1e-12) return [1, 0, 0, 0, -1, 0, 0, 0, -1]
  const k = 1 / (1 + c)
  return [
    1 + k * (-vz * vz - vy * vy) + 0, -vz + k * (vx * vy), vy + k * (vx * vz),
    vz + k * (vx * vy), 1 + k * (-vz * vz - vx * vx), -vx + k * (vy * vz),
    -vy + k * (vx * vz), vx + k * (vy * vz), 1 + k * (-vy * vy - vx * vx)
  ]
}

/**
 * Ranks the directions a part can stand on. The height above the plate, the overhang and the contact of a direction depend only on
 * that direction (z' = -d . v for every point), so each candidate costs one pass over the triangles and the part is rotated once,
 * for the winner. The score is dimensionless:
 *   support volume bound / part volume  +  0.5 * overhang area / surface  +  0.3 * height / longest side  -  0.3 * contact / largest face
 */
export const rankOrientations = (meshes: ReadonlyArray<SliceMesh>, options: OrientationOptions = {}): OrientationRanking => {
  const angle = options.overhangAngle ?? 45
  const layer = options.layerHeight ?? 0.2
  const tris: TriangleFacts[] = []
  let volume = 0
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (const mesh of meshes) {
    const flip = orientedVolume(mesh) < 0 ? -1 : 1
    volume += Math.abs(orientedVolume(mesh))
    for (let i = 0; i < mesh.positions.length; i++) { const a = i % 3; const v = mesh.positions[i]!; if (v < lo[a]!) lo[a] = v; if (v > hi[a]!) hi[a] = v }
    eachTriangle(mesh, (t) => tris.push(flip < 0 ? { ...t, nx: -t.nx, ny: -t.ny, nz: -t.nz } : t))
  }
  if (tris.length === 0) throw new RangeError("There is no surface to orient")
  const surface = tris.reduce((s, t) => s + t.area, 0)
  const longest = Math.max(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!, 1e-9)
  // Candidate directions: the axes, the biggest flat faces (their inward normals stand on the plate), a spiral of directions.
  const dirs = new Map<string, { d: [number, number, number]; label: string; weight: number }>()
  const key = (d: readonly number[]): string => d.map((v) => Math.round(v * 1000)).join(",")
  const add = (d: [number, number, number], label: string, weight = 0): void => {
    const len = Math.hypot(...d)
    const u: [number, number, number] = [d[0] / len, d[1] / len, d[2] / len]
    const k = key(u)
    const had = dirs.get(k)
    if (had) had.weight += weight; else dirs.set(k, { d: u, label, weight })
  }
  // The down direction is the outward normal of the face that rests on the plate: as designed that is -Z.
  add([0, 0, -1], "as designed")
  add([0, 0, 1], "top face down")
  add([1, 0, 0], "+X face down"); add([-1, 0, 0], "-X face down"); add([0, 1, 0], "+Y face down"); add([0, -1, 0], "-Y face down")
  // Down direction of a face resting on the plate is its outward normal.
  const flat = new Map<string, { d: [number, number, number]; area: number }>()
  for (const t of tris) {
    const k = key([t.nx, t.ny, t.nz])
    const e = flat.get(k)
    if (e) e.area += t.area; else flat.set(k, { d: [t.nx, t.ny, t.nz], area: t.area })
  }
  const faces = [...flat.values()].sort((a, b) => b.area - a.area).slice(0, options.flatFaces ?? 12).filter((f) => f.area > surface * 0.005)
  const largestFace = faces[0]?.area ?? 0
  faces.forEach((f, i) => add(f.d, `flat face ${i + 1} down`, f.area))
  const n = options.spread ?? 32
  for (let i = 0; i < n; i++) {
    const z = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - z * z), phi = i * Math.PI * (3 - Math.sqrt(5))
    add([r * Math.cos(phi), r * Math.sin(phi), z], `direction ${i + 1}`)
  }
  const sinOver = Math.sin(angle * DEG)
  const candidates: OrientationCandidate[] = []
  for (const { d, label } of dirs.values()) {
    // Heights above the lowest point along -d.
    let zMin = Infinity, zMax = -Infinity
    for (const mesh of meshes) {
      const p = mesh.positions
      for (let i = 0; i < p.length; i += 3) {
        const z = -(d[0] * p[i]! + d[1] * p[i + 1]! + d[2] * p[i + 2]!)
        if (z < zMin) zMin = z
        if (z > zMax) zMax = z
      }
    }
    let over = 0, contact = 0, support = 0
    for (const t of tris) {
      const nz = -(d[0] * t.nx + d[1] * t.ny + d[2] * t.nz)
      if (-nz <= sinOver) continue // facing up or within the angle
      const zc = -(d[0] * t.cx + d[1] * t.cy + d[2] * t.cz)
      // A face whose centroid is within a layer of the plate and that faces straight down rests on it.
      if (zc - zMin <= layer && -nz > 0.995) { contact += t.area; continue }
      over += t.area
      support += t.area * -nz * Math.max(0, zc - zMin)
    }
    const height = zMax - zMin
    const score = (volume > 0 ? support / volume : 0) + 0.5 * (over / surface) + 0.3 * (height / longest) - 0.3 * (largestFace > 0 ? Math.min(1, contact / largestFace) : 0)
    candidates.push({ down: d, label, overhangArea: over, contactArea: contact, supportVolumeBound: support, height, score })
  }
  const ranked = candidates.slice().sort((a, b) => a.score - b.score)
  const designed = candidates.find((c) => c.label === "as designed")!
  const best = ranked[0]!
  const margin = options.margin ?? 0.1
  const chosen = best.score < designed.score - Math.max(0.02, Math.abs(designed.score) * margin) ? best : designed
  return { ranked, designed, best, chosen, volume }
}
