/**
 * Slicing a closed triangle mesh into layers: every triangle that crosses a layer's plane contributes one segment, the
 * segments are chained into rings and the rings are nested into islands. The result is the material of each layer.
 *
 * The plane of a layer is its middle (a layer of 0.2 mm printed at Z0.2 holds the material between Z0 and Z0.2, and the
 * material at Z0.1 stands for it), nudged by a micro offset so that a vertex exactly on a plane never splits a segment.
 */
import type { Vec2 } from "../../cad/vec.ts"
import { islandsOf, ringArea, simplifyRing, type Region, type Ring } from "./geom.ts"
import { weldPoints } from "../../cad/mesh-clean.ts"
import { describeTopology, meshTopology } from "../../cad/mesh-topology.ts"

export interface SliceMesh {
  readonly positions: ArrayLike<number>
  readonly indices: ArrayLike<number>
}

/** Vertex coincidence used only for source-topology diagnostics, mm; the print geometry is never rewritten. */
export const PRINT_VERTEX_TOLERANCE = 1e-7

/** Validate before Uint32/Float64 conversion: conversion can conceal fractional indices and missing coordinates. */
export const printMeshIssue = (mesh: SliceMesh): string | undefined => {
  const p = mesh.positions, idx = mesh.indices
  if (p === undefined || !Number.isSafeInteger(p.length) || p.length < 9 || p.length % 3 !== 0) return "Mesh positions must contain complete XYZ triples for at least three vertices"
  if (idx === undefined || !Number.isSafeInteger(idx.length) || idx.length < 3 || idx.length % 3 !== 0) return "Mesh indices must contain complete triangles"
  const vertices = p.length / 3
  if (vertices >= 0x4000000) return "Mesh exceeds the 67,108,863 vertices supported by topology indexing"
  for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) return `Mesh coordinate ${i} must be finite`
  for (let i = 0; i < idx.length; i++) {
    const value = idx[i]
    if (!Number.isInteger(value) || value! < 0 || value! >= vertices) return `Mesh index ${i} must be an integer in [0, ${vertices - 1}]`
  }
  return undefined
}

/** Structural and closed-manifold source gate. Does not repair openings or certify absence of self-intersections. */
export const printSolidIssue = (mesh: SliceMesh): string | undefined => {
  const malformed = printMeshIssue(mesh)
  if (malformed !== undefined) return malformed
  // Subtract an actual source vertex so large drawing offsets cannot cancel the volume calculation.
  const p = mesh.positions
  const local = Float64Array.from(p, (value, i) => value - p[i % 3]!)
  if (!local.every(Number.isFinite)) return "Mesh extent is not finite"
  const welded = weldPoints(local, PRINT_VERTEX_TOLERANCE)
  const topology = meshTopology({ positions: welded.positions, indices: Uint32Array.from(mesh.indices, (i) => welded.map[i]!) })
  if (!topology.closed) return `Mesh is not a closed orientable manifold: ${describeTopology(topology)} (vertex coincidence ${PRINT_VERTEX_TOLERANCE} mm; no holes repaired)`
  if (!Number.isFinite(topology.volume) || topology.volume === 0) return "Mesh must enclose a finite non-zero volume"
  return undefined
}

export interface SliceOptions {
  /** Chord tolerance used to drop redundant vertices of every ring, mm. */
  readonly simplify?: number
  /** Gaps up to this size between loose ends are closed (meshes with cracks), mm. */
  readonly closeGap?: number
}

export interface SlicedLayers {
  readonly regions: ReadonlyArray<Region>
  /** Rings that could not be closed and were dropped, over all layers. */
  readonly openRings: number
}

const NUDGE = 1.37e-6
const KEY = 1e-4

/** Signed volume of the mesh: negative when the triangles face inwards. */
export const meshVolume = (mesh: SliceMesh): number => {
  const p = mesh.positions
  let v = 0
  for (let k = 0; k + 2 < mesh.indices.length; k += 3) {
    const a = mesh.indices[k]! * 3, b = mesh.indices[k + 1]! * 3, c = mesh.indices[k + 2]! * 3
    v += (p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) - p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) + p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) / 6
  }
  return v
}

interface Seg { readonly a: Vec2; readonly b: Vec2 }

const keyOf = (p: Vec2): string => `${Math.round(p.x / KEY)},${Math.round(p.y / KEY)}`

/** Chains oriented segments into rings; loose ends within `gap` of each other are joined. */
const chainRings = (segs: ReadonlyArray<Seg>, gap: number): { rings: Vec2[][]; open: number } => {
  const byStart = new Map<string, number[]>()
  segs.forEach((s, i) => {
    const k = keyOf(s.a)
    const list = byStart.get(k)
    if (list === undefined) byStart.set(k, [i]); else list.push(i)
  })
  const used = new Uint8Array(segs.length)
  const rings: Vec2[][] = []
  const chains: Vec2[][] = []
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue
    used[i] = 1
    const pts: Vec2[] = [segs[i]!.a, segs[i]!.b]
    const startKey = keyOf(segs[i]!.a)
    for (;;) {
      const last = pts[pts.length - 1]!
      const k = keyOf(last)
      if (k === startKey && pts.length > 2) { pts.pop(); rings.push(pts); break }
      const next = (byStart.get(k) ?? []).find((j) => !used[j])
      if (next === undefined) { chains.push(pts); break }
      used[next] = 1
      pts.push(segs[next]!.b)
    }
  }
  // Join the loose chains end to start when they are close enough (a crack in the mesh).
  let open = 0
  const pool = chains.slice()
  while (pool.length > 0) {
    let chain = pool.pop()!
    for (;;) {
      const tail = chain[chain.length - 1]!
      const head = chain[0]!
      if (Math.hypot(tail.x - head.x, tail.y - head.y) <= gap && chain.length >= 3) { rings.push(chain); chain = []; break }
      let best = -1
      let bestD = gap
      for (let j = 0; j < pool.length; j++) {
        const h = pool[j]![0]!
        const d = Math.hypot(tail.x - h.x, tail.y - h.y)
        if (d <= bestD) { bestD = d; best = j }
      }
      if (best < 0) break
      chain = chain.concat(pool.splice(best, 1)[0]!)
    }
    if (chain.length > 0) open++
  }
  return { rings, open }
}

/**
 * The material of each layer. `zs[i]` is the height of the plane of layer `i` (its middle); the mesh has to be a closed
 * surface, outward facing (an inside-out mesh is turned around). Rings run counter-clockwise for outer boundaries.
 */
export const sliceMesh = (mesh: SliceMesh, zs: ReadonlyArray<number>, options: SliceOptions = {}): SlicedLayers => {
  const malformed = printMeshIssue(mesh)
  if (malformed !== undefined) throw new RangeError(malformed)
  const simplify = options.simplify ?? 0.005
  const gap = options.closeGap ?? 0.05
  const flip = meshVolume(mesh) < 0
  const p = mesh.positions
  const layers = zs.length
  const buckets: Seg[][] = Array.from({ length: layers }, () => [])
  if (layers === 0) return { regions: [], openRings: 0 }
  const planes = zs.map((z) => z + NUDGE)
  /** First index whose plane is not below `value`. */
  const lowerBound = (value: number): number => {
    let lo = 0, hi = layers
    while (lo < hi) { const mid = (lo + hi) >> 1; if (planes[mid]! < value) lo = mid + 1; else hi = mid }
    return lo
  }
  for (let k = 0; k + 2 < mesh.indices.length; k += 3) {
    const ia = mesh.indices[k]! * 3, ib = mesh.indices[flip ? k + 2 : k + 1]! * 3, ic = mesh.indices[flip ? k + 1 : k + 2]! * 3
    const za = p[ia + 2]!, zb = p[ib + 2]!, zc = p[ic + 2]!
    const lo = Math.min(za, zb, zc)
    const hi = Math.max(za, zb, zc)
    if (hi - lo < 1e-12) continue
    // Outward normal in XY (the triangle's winding), used to orient the segment so the material lies on its left.
    const ux = p[ib]! - p[ia]!, uy = p[ib + 1]! - p[ia + 1]!, uz = p[ib + 2]! - za
    const vx = p[ic]! - p[ia]!, vy = p[ic + 1]! - p[ia + 1]!, vz = p[ic + 2]! - za
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    if (Math.abs(nx) + Math.abs(ny) < 1e-18) continue
    const first = lowerBound(lo)
    const last = lowerBound(hi) - 1
    for (let layer = first; layer <= last; layer++) {
      const z = planes[layer]!
      if (z < lo || z >= hi) continue
      const pts: Vec2[] = []
      const edge = (i: number, j: number): void => {
        const zi = p[i + 2]!, zj = p[j + 2]!
        if ((zi < z) === (zj < z)) return
        const t = (z - zi) / (zj - zi)
        pts.push({ x: p[i]! + (p[j]! - p[i]!) * t, y: p[i + 1]! + (p[j + 1]! - p[i + 1]!) * t })
      }
      edge(ia, ib)
      edge(ib, ic)
      edge(ic, ia)
      if (pts.length !== 2) continue
      const [q, r] = pts as [Vec2, Vec2]
      // Direction with the material on its left: rotate the outward normal by +90 degrees.
      const forward = (r.x - q.x) * -ny + (r.y - q.y) * nx > 0
      buckets[layer]!.push(forward ? { a: q, b: r } : { a: r, b: q })
    }
  }
  let openRings = 0
  const regions = buckets.map((segs) => {
    if (segs.length === 0) return []
    const { rings, open } = chainRings(segs, gap)
    openRings += open
    const cleaned: Ring[] = rings
      .map((ring) => simplifyRing(ring, simplify))
      .filter((ring) => ring.length >= 3 && Math.abs(ringArea(ring)) > 1e-6)
    return islandsOf(cleaned)
  })
  return { regions, openRings }
}
