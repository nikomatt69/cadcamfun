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
interface PrintMotion { readonly from: P3; readonly to: P3; readonly feed: number; readonly e: number; readonly line: number }
interface PrintState { readonly layer: number; readonly height: number; readonly kind: string; readonly homed: boolean; readonly nozzleReady: number; readonly bedReady: number }

/** Maximum deviation of an arc's replay chords, mm. Cardinal extrema are also included. */
export const PRINT_REPLAY_SAGITTA = 0.01

// Print evidence certifies this explicit controller vocabulary, not the milling interpreter's broader dialect.
const PRINT_G = new Set([0, 1, 2, 3, 4, 17, 20, 21, 28, 90, 91, 90.1, 91.1, 92, 92.1])
const PRINT_M = new Set([0, 1, 2, 17, 18, 30, 82, 83, 84, 104, 109, 140, 190, 106, 107, 204, 205, 400, 900])

/** The extruding moves of a program with the layer and feature each belongs to. */
export const replayBeads = (gcode: string): { beads: Bead[]; motions: PrintMotion[]; states: ReadonlyArray<PrintState>; errors: ReadonlyArray<string>; filamentMm: number; maxZ: number } => {
  const beads: Bead[] = []
  const motions: PrintMotion[] = []
  const replay = interpretGcode(gcode, { track: true, lathe: false })
  const errors = [...replay.errors]
  const states: PrintState[] = []
  let kind = ""
  let layer = -1
  let height = 0.2
  const homeAxes = new Set<string>()
  let nozzleTarget = 0, nozzleReady = 0, bedTarget = 0, bedReady = 0
  let filament = 0
  let maxZ = 0
  const lines = gcode.split("\n")
  for (let n = 0; n < lines.length; n++) {
    const raw = lines[n]!.trim()
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
    motions.push({ from, to, e, feed, line })
    if (e <= 1e-9 || (from.x === to.x && from.y === to.y)) return
    const state = states[line - 1]!
    beads.push({ layer: state.layer, height: state.height, kind: state.kind, x0: from.x, y0: from.y, x1: to.x, y1: to.y, z0: from.z, z: to.z, e, line })
    filament += e
    maxZ = Math.max(maxZ, from.z, to.z)
  }
  replay.segments.forEach((segment, index) => {
    if (segment.kind === "dwell") return
    const e = replay.states![index]!.extrude
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
  })
  return { beads, motions, states, errors, filamentMm: filament, maxZ }
}

const PART = new Set(["WALL-OUTER", "WALL-INNER", "SKIN", "FILL", "BRIDGE"])

const stamp = (mask: Uint8Array, g: Grid, x0: number, y0: number, x1: number, y1: number, radius: number): void => {
  const len = Math.hypot(x1 - x0, y1 - y0)
  const steps = Math.max(1, Math.ceil(len / (g.cell * 0.5)))
  const r = Math.ceil(radius / g.cell)
  for (let s = 0; s <= steps; s++) {
    const px = x0 + ((x1 - x0) * s) / steps
    const py = y0 + ((y1 - y0) * s) / steps
    const cx = Math.floor((px - g.minX) / g.cell)
    const cy = Math.floor((py - g.minY) / g.cell)
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const ix = cx + dx, iy = cy + dy
        if (ix < 0 || iy < 0 || ix >= g.nx || iy >= g.ny) continue
        const qx = g.minX + (ix + 0.5) * g.cell - px
        const qy = g.minY + (iy + 0.5) * g.cell - py
        if (qx * qx + qy * qy <= radius * radius) mask[iy * g.nx + ix] = 1
      }
    }
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
  const replay = replayBeads(gcode)
  const { filamentMm } = replay
  checks.push({ id: "nc-interpretation", status: replay.errors.length === 0 ? "passed" : "failed", detail: replay.errors.length === 0 ? `Replayed ${replay.motions.length} motions; arc chord bound ${PRINT_REPLAY_SAGITTA} mm` : replay.errors.join("; ") })

  if (replay.beads.length === 0) return [...checks, { id: "filament", status: "failed", detail: "The program extrudes nothing" }]

  // The plate and the build height.
  const half = { x: p.bedOrigin === "center" ? p.bedWidth / 2 : 0, y: p.bedOrigin === "center" ? p.bedDepth / 2 : 0 }
  const lo = { x: -half.x, y: -half.y }
  const hi = { x: p.bedWidth - half.x, y: p.bedDepth - half.y }
  const outside = replay.motions.find((m) => [m.from, m.to].some((q) => ![q.x, q.y, q.z].every(Number.isFinite) || q.x < lo.x - 1e-6 || q.x > hi.x + 1e-6 || q.y < lo.y - 1e-6 || q.y > hi.y + 1e-6 || q.z < -1e-6 || q.z > p.buildHeight + 1e-6))
  const offPlateBead = replay.beads.find((b) => {
    const radius = p.extrusionWidth * (b.layer < 0 ? 1.3 : 1) / 2
    return [[b.x0, b.y0], [b.x1, b.y1]].some(([x, y]) => x! - radius < lo.x - 0.00051 || x! + radius > hi.x + 0.00051 || y! - radius < lo.y - 0.00051 || y! + radius > hi.y + 0.00051)
  })
  checks.push(outside === undefined && offPlateBead === undefined
    ? { id: "bed-fit", status: "passed", detail: `Every replayed move stays in the ${p.bedWidth} x ${p.bedDepth} x ${p.buildHeight} mm build envelope` }
    : { id: "bed-fit", status: "failed", detail: `Motion or deposited bead on line ${outside?.line ?? offPlateBead!.line} leaves the ${p.bedWidth} x ${p.bedDepth} x ${p.buildHeight} mm build envelope`, line: outside?.line ?? offPlateBead!.line })

  const cold = replay.beads.find((b) => { const s = replay.states[b.line - 1]!; return !s.homed || s.nozzleReady < p.nozzleTemperature - 1e-6 || (p.bedTemperature > 0 && s.bedReady < p.bedTemperature - 1e-6) })
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
  for (let i = 0; i < count; i++) {
    const region = regions[i]!
    if (region.length === 0) continue
    const layerBeads = (byLayer.get(i + input.firstModelLayer) ?? []).filter((b) => PART.has(b.kind) || b.kind === "WALL-OUTER")
    const covered = new Uint8Array(g.nx * g.ny)
    for (const b of layerBeads) stamp(covered, g, b.x0, b.y0, b.x1, b.y1, radius * 1.02)
    const inside = rasterise(region, g)
    const spiral = p.vase && i >= Math.max(p.bottomLayers, 1)
    if (p.walls > 0 && !spiral) {
      const core = rasterise(offsetRegion(region, -p.walls * p.extrusionWidth), g)
      let band = 0, hit = 0
      for (let c = 0; c < inside.length; c++) if (inside[c] && !core[c]) { band++; if (covered[c]) hit++ }
      if (band > 40) {
        const share = hit / band
        if (share < worstWall) { worstWall = share; worstWallLayer = i }
      }
    }
    if ((i === 0 || i === count - 1) && !spiral) {
      let total = 0, hit = 0
      for (let c = 0; c < inside.length; c++) if (inside[c]) { total++; if (covered[c]) hit++ }
      if (total > 40) worstSkin = Math.min(worstSkin, hit / total)
    }
    // Stray beads: points of part beads that lie further than a bead outside the layer's material.
    const grown = rasterise(offsetRegion(region, p.extrusionWidth), g)
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
