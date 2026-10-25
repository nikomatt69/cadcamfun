/**
 * Evidence about a printed program, taken from the text of the program and the layers the model was cut into, not from the
 * slicer's own bookkeeping: the NC is replayed (position, extruder, layer and feature markers) and its beads are laid on a grid
 * next to the material of each layer. A wall that is missing, a first layer that does not cover the part, a bead outside the part
 * or a move off the plate shows up here whether or not the slicer meant it.
 */
import { gridFor, rasterise, type Grid } from "./support.ts"
import { offsetRegion, regionBox, type Box2, type Region } from "./geom.ts"
import type { PrintProfile } from "./profile.ts"
import type { PlannedLayer } from "./types.ts"
import { arcSweepBetween } from "../ir.ts"
import { interpretGcode, type P3 } from "../testing/gcode-interpreter.ts"

export interface PrintCheck {
  readonly id: "nc-interpretation" | "bed-fit" | "heated-start" | "layers-rise" | "wall-coverage" | "skin-coverage" | "no-spill" | "filament"
  readonly status: "passed" | "failed" | "unresolved"
  readonly detail: string
  readonly line?: number
}

interface Bead { readonly layer: number; readonly height: number; readonly kind: string; readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number; readonly z0: number; readonly z: number; readonly e: number; readonly line: number }

/** Maximum deviation of an arc's replay chords, mm. Cardinal extrema are also included. */
export const PRINT_REPLAY_SAGITTA = 0.01

// Print evidence certifies this explicit controller vocabulary, not the milling interpreter's broader dialect.
const PRINT_G = new Set([0, 1, 2, 3, 4, 17, 20, 21, 28, 90, 91, 90.1, 91.1, 92, 92.1])
const PRINT_M = new Set([0, 1, 2, 17, 18, 30, 82, 83, 84, 104, 109, 140, 190, 106, 107, 204, 205, 400, 900])

/** What the program has declared at one line: the feature and layer being printed, and whether the machine is ready to deposit. */
export interface PrintLineState { readonly kind: string; readonly layer: number; readonly height: number; readonly homed: boolean; readonly nozzleReady: number; readonly bedReady: number }

/**
 * The state of every line of a program, in columns: a program of millions of lines costs a few tens of bytes a line, not an
 * object a line.
 */
class LineStates {
  private readonly kinds: string[] = []
  private kindIds = new Map<string, number>()
  private kind: Uint16Array
  private layer: Int32Array
  private height: Float64Array
  private homed: Uint8Array
  private nozzle: Float64Array
  private bed: Float64Array
  length = 0

  constructor(capacity: number) {
    this.kind = new Uint16Array(capacity); this.layer = new Int32Array(capacity); this.height = new Float64Array(capacity)
    this.homed = new Uint8Array(capacity); this.nozzle = new Float64Array(capacity); this.bed = new Float64Array(capacity)
  }

  push(state: PrintLineState): number {
    let id = this.kindIds.get(state.kind)
    if (id === undefined) { id = this.kinds.length; this.kinds.push(state.kind); this.kindIds.set(state.kind, id) }
    const n = this.length++
    this.kind[n] = id; this.layer[n] = state.layer; this.height[n] = state.height
    this.homed[n] = state.homed ? 1 : 0; this.nozzle[n] = state.nozzleReady; this.bed[n] = state.bedReady
    return this.length
  }

  at(n: number): PrintLineState | undefined {
    if (n < 0 || n >= this.length) return undefined
    return { kind: this.kinds[this.kind[n]!]!, layer: this.layer[n]!, height: this.height[n]!, homed: this.homed[n] === 1, nozzleReady: this.nozzle[n]!, bedReady: this.bed[n]! }
  }
}

/** A motion of the replay (an arc already in chords), handed to `onMotion` as it is read. */
export interface PrintMotion { readonly from: P3; readonly to: P3; readonly feed: number; readonly e: number; readonly line: number }

export interface ReplayOptions {
  /** Called for every motion in program order; the motions are not kept. */
  readonly onMotion?: (motion: PrintMotion) => void
}

/**
 * The extruding moves of a program with the layer and feature each belongs to. The program is replayed as a stream: the beads
 * are kept (the evidence reads them), the motions and the interpreter's segments are not.
 */
export const replayBeads = (gcode: string, options: ReplayOptions = {}): { beads: Bead[]; motionCount: number; states: { at: (line: number) => PrintLineState | undefined }; errors: ReadonlyArray<string>; filamentMm: number; maxZ: number } => {
  const beads: Bead[] = []
  const errors: string[] = []
  let newlines = 0
  for (let at = gcode.indexOf("\n"); at >= 0; at = gcode.indexOf("\n", at + 1)) newlines++
  const states = new LineStates(newlines + 1)
  let kind = ""
  let layer = -1
  let height = 0.2
  const homeAxes = new Set<string>()
  let nozzleTarget = 0, nozzleReady = 0, bedTarget = 0, bedReady = 0
  let filament = 0
  let maxZ = 0
  let motionCount = 0
  // The lines first: the layer and feature markers and the heater waits are state of the text, independent of the motions.
  let start = 0
  for (let n = 0; start <= gcode.length; n++) {
    let end = gcode.indexOf("\n", start)
    if (end < 0) end = gcode.length
    const raw = gcode.slice(start, end).trim()
    start = end + 1
    if (raw.startsWith(";TYPE:")) kind = raw.slice(6).trim()
    if (raw.startsWith(";LAYER:")) layer = Number(raw.slice(7))
    if (raw.startsWith(";HEIGHT:")) height = Number(raw.slice(8))
    const code = raw.replace(/\([^)]*\)/g, " ").replace(/;.*$/, "").trim().toUpperCase()
    const words = [...code.matchAll(/([A-Z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g)].map((m) => ({ letter: m[1]!, value: Number(m[2]) }))
    const has = (letter: string, value: number) => words.some((w) => w.letter === letter && w.value === value)
    const get = (letter: string) => words.find((w) => w.letter === letter)?.value
    for (const w of words) {
      if ((w.letter === "G" && !PRINT_G.has(w.value)) || (w.letter === "M" && !PRINT_M.has(w.value))) errors.push(`line ${n + 1}: ${w.letter}${w.value} is outside the verified print dialect`)
    }
    const macro = /^(?:N\d+\s*)?([A-Z_]{2,}[A-Z0-9_]*)\b/.exec(code)?.[1]
    if (macro !== undefined && macro !== "SET_PRESSURE_ADVANCE") errors.push(`line ${n + 1}: opaque printer macro ${macro} cannot be replayed`)
    const unmatched = code.replace(/[A-Z]\s*[-+]?(?:\d+\.?\d*|\.\d+)/g, "")
    const residue = has("G", 28) ? unmatched.replace(/[XYZ]/g, "") : unmatched
    if (macro === undefined && (residue.trim() !== "" || words.some((w) => !Number.isFinite(w.value) || !"GMNXYZEFSPRIJK".includes(w.letter)))) {
      errors.push(`line ${n + 1}: malformed or unsupported print block`)
    }
    if (macro === "SET_PRESSURE_ADVANCE" && !/^(?:N\d+\s*)?SET_PRESSURE_ADVANCE\s+ADVANCE=\d*\.?\d+\s*$/.test(code)) errors.push(`line ${n + 1}: unsupported pressure-advance parameters`)
    if (has("G", 28)) {
      const axes = ["X", "Y", "Z"].filter((a) => code.includes(a))
      for (const axis of axes.length > 0 ? axes : ["X", "Y", "Z"]) homeAxes.add(axis)
    }
    if (has("M", 18) || has("M", 84)) homeAxes.clear()
    if (has("M", 104) || has("M", 109)) {
      const target = get("S") ?? get("R") ?? nozzleTarget
      if (target !== nozzleTarget || target <= 0) nozzleReady = 0
      nozzleTarget = target
      if (has("M", 109)) nozzleReady = target
    }
    if (has("M", 140) || has("M", 190)) {
      const target = get("S") ?? get("R") ?? bedTarget
      if (target !== bedTarget || target <= 0) bedReady = 0
      bedTarget = target
      if (has("M", 190)) bedReady = target
    }
    states.push({ kind, layer, height, homed: homeAxes.size === 3, nozzleReady, bedReady })
  }
  const add = (from: P3, to: P3, e: number, feed: number, line: number): void => {
    motionCount++
    options.onMotion?.({ from, to, e, feed, line })
    if (e <= 1e-9 || (from.x === to.x && from.y === to.y)) return
    const state = states.at(line - 1)!
    beads.push({ layer: state.layer, height: state.height, kind: state.kind, x0: from.x, y0: from.y, x1: to.x, y1: to.y, z0: from.z, z: to.z, e, line })
    filament += e
    maxZ = Math.max(maxZ, from.z, to.z)
  }
  const replay = interpretGcode(gcode, {
    track: true, lathe: false, discard: true,
    onSegment: (segment, state) => {
      if (segment.kind === "dwell") return
      const e = state!.extrude
      if (segment.kind !== "arc") { add(segment.from, segment.to, e, segment.feed, segment.line); return }
      const sweep = arcSweepBetween(segment.from, segment.to, segment.center, segment.clockwise)
      const radius = segment.radiusStart
      const count = Math.max(1, Math.ceil(sweep / (2 * Math.acos(Math.max(-1, 1 - PRINT_REPLAY_SAGITTA / radius)))))
      if (!Number.isFinite(count) || count > 100_000) { errors.push(`line ${segment.line}: arc exceeds the bounded print replay budget`); return }
      const a0 = Math.atan2(segment.from.y - segment.center.y, segment.from.x - segment.center.x)
      const direction = segment.clockwise ? -1 : 1
      const stops = Array.from({ length: count }, (_, i) => (i + 1) / count)
      for (let quadrant = 0; quadrant < 4; quadrant++) {
        const angle = quadrant * Math.PI / 2
        const delta = ((direction * (angle - a0)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)
        if (delta > 1e-12 && delta < sweep) stops.push(delta / sweep)
      }
      stops.sort((a, b) => a - b)
      let from = segment.from, previous = 0
      for (const t of stops) {
        if (t - previous < 1e-12) continue
        const angle = a0 + direction * sweep * t
        const to = t === 1 ? segment.to : { x: segment.center.x + radius * Math.cos(angle), y: segment.center.y + radius * Math.sin(angle), z: segment.from.z + (segment.to.z - segment.from.z) * t }
        add(from, to, e * (t - previous), segment.feed, segment.line)
        from = to; previous = t
      }
    }
  })
  errors.unshift(...replay.errors)
  return { beads, motionCount, states, errors, filamentMm: filament, maxZ }
}

/** Whether two regions are the same outlines, point for point. */
const sameRegion = (a: Region, b: Region): boolean => {
  if (a === b) return true
  if (a.length !== b.length) return false
  const sameRing = (p: ReadonlyArray<{ readonly x: number; readonly y: number }>, q: ReadonlyArray<{ readonly x: number; readonly y: number }>): boolean => {
    if (p.length !== q.length) return false
    for (let k = 0; k < p.length; k++) if (p[k]!.x !== q[k]!.x || p[k]!.y !== q[k]!.y) return false
    return true
  }
  for (let k = 0; k < a.length; k++) {
    const u = a[k]!, v = b[k]!
    if (!sameRing(u.outer, v.outer) || u.holes.length !== v.holes.length) return false
    for (let h = 0; h < u.holes.length; h++) if (!sameRing(u.holes[h]!, v.holes[h]!)) return false
  }
  return true
}

const PART = new Set(["WALL-OUTER", "WALL-INNER", "SKIN", "FILL", "BRIDGE"])


/**
 * Marks the cells whose centre lies within `radius` of the segment (a capsule). Row by row: a capsule is convex, so each row
 * of cell centres meets it in one interval, found from the two end discs and the strip between them. The work is the area the
 * bead covers, not the length times a sampling density, so a bead of any length costs the same per mm.
 */
export const stamp = (mask: Uint8Array, g: Grid, x0: number, y0: number, x1: number, y1: number, radius: number): void => {
  const dx = x1 - x0, dy = y1 - y0
  const len2 = dx * dx + dy * dy
  const len = Math.sqrt(len2)
  const r2 = radius * radius
  const rowLo = Math.max(0, Math.ceil((Math.min(y0, y1) - radius - g.minY) / g.cell - 0.5))
  const rowHi = Math.min(g.ny - 1, Math.floor((Math.max(y0, y1) + radius - g.minY) / g.cell - 0.5))
  // Along the segment, 0 <= t*len2 = x*dx + (y*dy - x0*dx - y0*dy) <= len2; across it, |x*(-dy) + (x0*dy + (y - y0)*dx)| <= radius*len.
  for (let iy = rowLo; iy <= rowHi; iy++) {
    const y = g.minY + (iy + 0.5) * g.cell
    let lo = Infinity, hi = -Infinity
    const e0 = r2 - (y - y0) * (y - y0)
    if (e0 >= 0) { const w = Math.sqrt(e0); lo = x0 - w; hi = x0 + w }
    const e1 = r2 - (y - y1) * (y - y1)
    if (e1 >= 0) { const w = Math.sqrt(e1); if (x1 - w < lo) lo = x1 - w; if (x1 + w > hi) hi = x1 + w }
    if (len2 > 0) {
      let a = -Infinity, b = Infinity, ok = true
      const along = (y - y0) * dy - x0 * dx
      if (Math.abs(dx) < 1e-12) ok = along >= 0 && along <= len2
      else { const u = (0 - along) / dx, v = (len2 - along) / dx; a = u < v ? u : v; b = u < v ? v : u }
      const across = x0 * dy + (y - y0) * dx, reach = radius * len
      if (ok) {
        if (Math.abs(dy) < 1e-12) ok = across >= -reach && across <= reach
        else { const u = (across - reach) / dy, v = (across + reach) / dy; const lo2 = u < v ? u : v, hi2 = u < v ? v : u; if (lo2 > a) a = lo2; if (hi2 < b) b = hi2 }
      }
      if (ok && a <= b) { if (a < lo) lo = a; if (b > hi) hi = b }
    }
    if (lo > hi) continue
    const c0 = Math.max(0, Math.ceil((lo - g.minX) / g.cell - 0.5))
    const c1 = Math.min(g.nx - 1, Math.floor((hi - g.minX) / g.cell - 0.5))
    if (c1 >= c0) mask.fill(1, iy * g.nx + c0, iy * g.nx + c1 + 1)
  }
}

export interface PrintEvidenceInput {
  readonly gcode: string
  /** The material of each model layer, bottom first, as cut from the part (bed coordinates). */
  readonly regions: ReadonlyArray<Region>
  readonly profile: PrintProfile
  /** Layers printed before the model (the raft). */
  readonly firstModelLayer: number
  /** Authoritative layer geometry; NC markers are annotations only. Includes raft layers. */
  readonly layers: ReadonlyArray<Pick<PlannedLayer, "index" | "z" | "height">>
}

const pct = (v: number): string => `${(v * 100).toFixed(1)} %`

/** Checks of a printer program: the plate, the start, the walls, the first and last layers, stray beads, the filament. */
export const verifyPrint = (input: PrintEvidenceInput): PrintCheck[] => {
  const { gcode, regions, profile: p } = input
  const checks: PrintCheck[] = []
  // The plate and the build height: every motion is tested as the replay reads it, and only the first one outside is kept.
  const half = { x: p.bedOrigin === "center" ? p.bedWidth / 2 : 0, y: p.bedOrigin === "center" ? p.bedDepth / 2 : 0 }
  const lo = { x: -half.x, y: -half.y }
  const hi = { x: p.bedWidth - half.x, y: p.bedDepth - half.y }
  const found: { motion?: PrintMotion } = {}
  const replay = replayBeads(gcode, {
    onMotion: (m) => {
      if (found.motion === undefined && [m.from, m.to].some((q) => ![q.x, q.y, q.z].every(Number.isFinite) || q.x < lo.x - 1e-6 || q.x > hi.x + 1e-6 || q.y < lo.y - 1e-6 || q.y > hi.y + 1e-6 || q.z < -1e-6 || q.z > p.buildHeight + 1e-6)) found.motion = m
    }
  })
  const { filamentMm } = replay
  const outside = found.motion
  checks.push({ id: "nc-interpretation", status: replay.errors.length === 0 ? "passed" : "failed", detail: replay.errors.length === 0 ? `Replayed ${replay.motionCount} motions; arc chord bound ${PRINT_REPLAY_SAGITTA} mm` : replay.errors.join("; ") })

  if (replay.beads.length === 0) return [...checks, { id: "filament", status: "failed", detail: "The program extrudes nothing" }]

  const offPlateBead = replay.beads.find((b) => {
    const radius = p.extrusionWidth * (b.layer < 0 ? 1.3 : 1) / 2
    return [[b.x0, b.y0], [b.x1, b.y1]].some(([x, y]) => x! - radius < lo.x - 0.00051 || x! + radius > hi.x + 0.00051 || y! - radius < lo.y - 0.00051 || y! + radius > hi.y + 0.00051)
  })
  checks.push(outside === undefined && offPlateBead === undefined
    ? { id: "bed-fit", status: "passed", detail: `Every replayed move stays in the ${p.bedWidth} x ${p.bedDepth} x ${p.buildHeight} mm build envelope` }
    : { id: "bed-fit", status: "failed", detail: `Motion or deposited bead on line ${outside?.line ?? offPlateBead!.line} leaves the ${p.bedWidth} x ${p.bedDepth} x ${p.buildHeight} mm build envelope`, line: outside?.line ?? offPlateBead!.line })

  const cold = replay.beads.find((b) => { const s = replay.states.at(b.line - 1)!; return !s.homed || s.nozzleReady < p.nozzleTemperature - 1e-6 || (p.bedTemperature > 0 && s.bedReady < p.bedTemperature - 1e-6) })
  checks.push(cold
    ? { id: "heated-start", status: "failed", detail: "Deposition requires homed XYZ axes and explicit nozzle/required-bed temperature waits; heater setpoints and opaque macros do not prove readiness", line: cold.line }
    : { id: "heated-start", status: "passed", detail: "XYZ homing and nozzle/required-bed temperature waits precede every deposited bead" })

  // Match real Z to the independently supplied layer slabs. Neither LAYER nor HEIGHT can relocate material.
  const layers = input.layers ?? []
  const validLayers = layers.length > 0 && layers.every((l, i) => Number.isFinite(l.z) && Number.isFinite(l.height) && l.height > 0 && (i === 0 || l.z > layers[i - 1]!.z))
  const beads: Bead[] = []
  let wrongLayer: Bead | undefined
  let previousZ = -Infinity
  for (const b of replay.beads) {
    if (b.layer < 0) { beads.push(b); continue }
    const midZ = (b.z0 + b.z) / 2
    let low = 0, high = layers.length
    while (low < high) { const mid = (low + high) >>> 1; if (layers[mid]!.z < midZ - 0.00051) low = mid + 1; else high = mid }
    const expected = layers[low]
    const spiral = p.vase && expected !== undefined && expected.index - input.firstModelLayer >= Math.max(p.bottomLayers, 1)
    const fits = expected !== undefined && (spiral
      ? Math.min(b.z0, b.z) >= expected.z - expected.height - 0.00051 && Math.max(b.z0, b.z) <= expected.z + 0.00051
      : Math.abs(b.z - expected.z) <= 0.00051 && Math.abs(b.z0 - expected.z) <= 0.00051)
    if (!fits || b.z < previousZ - 0.00051 || b.z < b.z0 - 0.00051) wrongLayer ??= b
    previousZ = Math.max(previousZ, b.z)
    if (fits) beads.push({ ...b, layer: expected!.index, height: expected!.height })
  }
  checks.push(!validLayers
    ? { id: "layers-rise", status: "unresolved", detail: "Authoritative layer tops and thicknesses are missing or invalid" }
    : wrongLayer !== undefined ? { id: "layers-rise", status: "failed", detail: "A deposited bead is below previous material or does not lie in its actual layer slab", line: wrongLayer.line }
    : { id: "layers-rise", status: "passed", detail: "Every model bead matches an authoritative layer slab; deposition never descends" })

  // Beads against the material of the layers.
  const boxes = regions.map(regionBox).filter((b): b is Box2 => b !== undefined)
  if (boxes.length === 0) return [...checks, ...(["wall-coverage", "skin-coverage", "no-spill", "filament"] as const).map((id) => ({ id, status: "unresolved" as const, detail: "No model-layer geometry was supplied for deposition verification" }))]
  const box: Box2 = { minX: Math.min(...boxes.map((b) => b.minX)) - 2, minY: Math.min(...boxes.map((b) => b.minY)) - 2, maxX: Math.max(...boxes.map((b) => b.maxX)) + 2, maxY: Math.max(...boxes.map((b) => b.maxY)) + 2 }
  const g = gridFor(box, 0.25)
  const radius = p.extrusionWidth / 2
  const byLayer = new Map<number, Bead[]>()
  for (const b of beads) { const list = byLayer.get(b.layer); if (list) list.push(b); else byLayer.set(b.layer, [b]) }
  // Every layer contributes evidence: one missing wall cannot hide between sampling planes.
  const count = regions.length
  let worstWall = 1
  let worstWallLayer = 0
  let worstSkin = 1
  let spillLength = 0
  let partLength = 0
  // One buffer for every layer, cleared over the rows a layer touched; a prism repeats its region, so its three rasters are kept
  // from layer to layer while the region is the same. Counting runs over the region's own window of the grid, not the whole plate.
  const covered = new Uint8Array(g.nx * g.ny)
  let cached: { readonly region: Region; readonly inside: Uint8Array; readonly core: Uint8Array | undefined; readonly grown: Uint8Array } | undefined
  for (let i = 0; i < count; i++) {
    const region = regions[i]!
    if (region.length === 0) continue
    const layerBeads = (byLayer.get(i + input.firstModelLayer) ?? []).filter((b) => PART.has(b.kind) || b.kind === "WALL-OUTER")
    let rowLo = g.ny, rowHi = -1
    for (const b of layerBeads) {
      stamp(covered, g, b.x0, b.y0, b.x1, b.y1, radius * 1.02)
      rowLo = Math.min(rowLo, Math.floor((Math.min(b.y0, b.y1) - radius * 1.02 - g.minY) / g.cell))
      rowHi = Math.max(rowHi, Math.ceil((Math.max(b.y0, b.y1) + radius * 1.02 - g.minY) / g.cell))
    }
    const spiral = p.vase && i >= Math.max(p.bottomLayers, 1)
    const wantsCore = p.walls > 0 && !spiral
    if (cached === undefined || !sameRegion(cached.region, region) || (wantsCore && cached.core === undefined)) {
      cached = {
        region, inside: rasterise(region, g),
        core: wantsCore ? rasterise(offsetRegion(region, -p.walls * p.extrusionWidth), g) : undefined,
        grown: rasterise(offsetRegion(region, p.extrusionWidth), g)
      }
    }
    const { inside, core, grown } = cached
    const rb = regionBox(region)!
    const w = {
      y0: Math.max(0, Math.floor((rb.minY - g.minY) / g.cell) - 1), y1: Math.min(g.ny - 1, Math.ceil((rb.maxY - g.minY) / g.cell) + 1),
      x0: Math.max(0, Math.floor((rb.minX - g.minX) / g.cell) - 1), x1: Math.min(g.nx - 1, Math.ceil((rb.maxX - g.minX) / g.cell) + 1)
    }
    if (core !== undefined) {
      let band = 0, hit = 0
      for (let y = w.y0; y <= w.y1; y++) for (let c = y * g.nx + w.x0, end = y * g.nx + w.x1; c <= end; c++) if (inside[c] && !core[c]) { band++; if (covered[c]) hit++ }
      if (band > 40) {
        const share = hit / band
        if (share < worstWall) { worstWall = share; worstWallLayer = i }
      }
    }
    if ((i === 0 || i === count - 1) && !spiral) {
      let total = 0, hit = 0
      for (let y = w.y0; y <= w.y1; y++) for (let c = y * g.nx + w.x0, end = y * g.nx + w.x1; c <= end; c++) if (inside[c]) { total++; if (covered[c]) hit++ }
      if (total > 40) worstSkin = Math.min(worstSkin, hit / total)
    }
    // Stray beads: points of part beads that lie further than a bead outside the layer's material.
    for (const b of layerBeads) {
      const len = Math.hypot(b.x1 - b.x0, b.y1 - b.y0)
      const samples = Math.max(1, Math.ceil(len / 0.5))
      for (let s = 0; s < samples; s++) {
        const px = b.x0 + ((b.x1 - b.x0) * (s + 0.5)) / samples
        const py = b.y0 + ((b.y1 - b.y0) * (s + 0.5)) / samples
        const ix = Math.floor((px - g.minX) / g.cell), iy = Math.floor((py - g.minY) / g.cell)
        partLength += len / samples
        if (ix < 0 || iy < 0 || ix >= g.nx || iy >= g.ny || !grown[iy * g.nx + ix]) spillLength += len / samples
      }
    }
    if (rowHi >= 0) covered.fill(0, Math.max(0, rowLo) * g.nx, Math.min(g.ny, rowHi + 1) * g.nx)
  }
  const wallsWanted = p.walls > 0 && !p.vase
  checks.push(!wallsWanted
    ? { id: "wall-coverage", status: "passed", detail: p.vase ? "Vase mode: the single spiral wall is checked as spill only" : "The profile asks for no walls" }
    : worstWall >= 0.93
      ? { id: "wall-coverage", status: "passed", detail: `At least ${pct(worstWall)} of the wall band is covered in all ${count} layers (raster cell ${g.cell.toFixed(3)} mm)` }
      : { id: "wall-coverage", status: "failed", detail: `Only ${pct(worstWall)} of the wall band is covered in layer ${worstWallLayer + 1}: walls are missing` })
  checks.push(worstSkin >= 0.93
    ? { id: "skin-coverage", status: "passed", detail: `First and last layers are ${pct(worstSkin)} covered by beads` }
    : { id: "skin-coverage", status: "failed", detail: `The first or last layer is only ${pct(worstSkin)} covered: the part has holes in its skin` })
  const spill = partLength > 0 ? spillLength / partLength : 0
  checks.push(spill <= 0.01
    ? { id: "no-spill", status: "passed", detail: `${pct(spill)} of the part beads lie outside the material of their layer` }
    : { id: "no-spill", status: "failed", detail: `${pct(spill)} of the part beads lie outside the material of their layer` })

  // The filament the program pushes, against the cross-section of the beads it lays (bridges and the raft have their own).
  const filamentArea = Math.PI * (p.filamentDiameter / 2) ** 2
  let nominal = 0
  let pushed = 0
  for (const b of beads) {
    // Startup priming is wider than a model bead and has no model-layer thickness.
    if (b.layer < 0 || b.kind === "BRIDGE" || b.kind === "RAFT") continue
    nominal += Math.hypot(b.x1 - b.x0, b.y1 - b.y0) * p.extrusionWidth * b.height
    pushed += b.e * filamentArea
  }
  const ratio = nominal > 0 ? pushed / nominal / p.flow : 1
  checks.push(ratio > 0.95 && ratio < 1.05
    ? { id: "filament", status: "passed", detail: `${filamentMm.toFixed(1)} mm of filament: ${ratio.toFixed(3)} of the volume of the beads laid` }
    : { id: "filament", status: "failed", detail: `The extruder pushes ${ratio.toFixed(3)} of the volume of the beads laid (expected 1): over- or under-extrusion` })
  return checks
}
