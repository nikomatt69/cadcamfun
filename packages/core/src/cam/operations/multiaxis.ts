/**
 * Simultaneous 5-axis finishing (spec 04-core-cam.md §14): the tool is held at an angle to the surface while the table
 * turns and the linear axes move together, so the cutter's flank can reach what a vertical tool would gouge.
 *
 *   parallel   Raster lines at `angle` over the part. Each sample is a contact point on the surface (ray down, see
 *              `model/mesh-queries.ts`); the tool axis there is the surface normal, optionally leaned by `lead`
 *              (towards the direction of travel) and `tilt` (sideways). Where the leaned cutter would cut the part,
 *              the lean is increased until it clears (`gouge`); a point no lean clears is skipped and counted.
 *   contour    Constant-Z contours of the part (the contour engine of `surface-field.ts`), walked with the same rule.
 *   swarf      The side of the cutter laid against a ruled wall, one ruling at a time (`swarf.ts`).
 *
 * Every sample is converted for the machine by `five-axis.ts`: the table angles that turn the tool axis to machine +Z
 * and the tip position in the frame the program is written in. A table change larger than `maxRotaryStep` degrees
 * between two samples ends the section: the tool retracts to clearance, the table turns there, and the section restarts.
 *
 * Pure: same inputs, same moves. Not covered (stated in the spec): head-tilting machines, tool-holder collision, lead-in
 * along the surface, rest machining between operations.
 */
import { Schema } from "effect"
import type { Vec2, Vec3 } from "../../cad/vec.ts"
import type { Move, Rotary, Toolpath } from "../ir.ts"
import { OperationFields, NonNegative, Positive, heightsOrdered, levelsOf, withDefault } from "../params.ts"
import type { Tool } from "../tool.ts"
import { solveOrientation, tipPosition, type FiveAxisKinematic } from "../five-axis.ts"
import { partToMachine, type RotaryAngles } from "../indexing.ts"
import { TriangleSoup, type SurfaceHit } from "../model/mesh-queries.ts"
import { contour, sampleNodes, simplify, type Rect } from "./surface-field.ts"
import { scallopSpacing } from "./surface.ts"
import { swarfSections, type SwarfCutter, type SwarfWall } from "./swarf.ts"

export const MultiaxisStrategySchema = Schema.Literals(["parallel", "contour", "swarf"])
export type MultiaxisStrategy = typeof MultiaxisStrategySchema.Type

export const ToolAxisSchema = Schema.Literals(["normal", "lead"])
export type ToolAxis = typeof ToolAxisSchema.Type

const Degrees = Schema.Finite.check(Schema.isBetween({ minimum: -85, maximum: 85 }))

export class MultiaxisParams extends Schema.Class<MultiaxisParams>("cam/MultiaxisParams")(
  Schema.Struct({
    ...OperationFields,
    strategy: withDefault(MultiaxisStrategySchema, "parallel" as const),
    /** Stepover between raster lines, percent of the tool diameter (`parallel`). */
    stepover: withDefault(Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 100 })), 30),
    /** Cusp height left between raster lines of a ball nose, mm; `0` = use `stepover`. */
    scallop: withDefault(NonNegative, 0),
    /** Direction of the raster lines, degrees from +X. */
    angle: withDefault(Schema.Finite, 0),
    /** Every raster line in the same direction (otherwise zig-zag). */
    oneWay: withDefault(Schema.Boolean, false),
    /** `normal`: the tool stands on the surface normal. `lead`: the normal leaned by `lead` and `tilt`. */
    toolAxis: withDefault(ToolAxisSchema, "normal" as const),
    /** Lean towards the direction of travel, degrees (`lead`). */
    lead: withDefault(Degrees, 10),
    /** Lean sideways, degrees (`lead`). */
    tilt: withDefault(Degrees, 0),
    /** Lean further, up to `gougeAngle`, wherever the leaned cutter would cut the part. */
    gouge: withDefault(Schema.Boolean, true),
    /** Largest extra lean tried to clear a gouge, degrees. */
    gougeAngle: withDefault(Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 85 })), 30),
    /** Distance the cutter keeps from the part, mm. */
    gougeClearance: withDefault(NonNegative, 0.02),
    /** Largest table change between two consecutive samples before the section is split, degrees. */
    maxRotaryStep: withDefault(Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 180 })), 30),
    /** Spacing of the samples along a raster line, mm. */
    sampling: withDefault(Positive, 0.5),
    /** Chord tolerance of the contours, mm (`contour`). */
    tolerance: withDefault(Positive, 0.01),
    /** Length of a flat end mill's flutes above the tip, in tool radii, for the gouge test. */
    flute: withDefault(Schema.Finite.check(Schema.isBetween({ minimum: 0.5, maximum: 6 })), 2)
  }).check(heightsOrdered)
) {}

export interface MultiaxisResult {
  readonly toolpath: Toolpath
  readonly warnings: ReadonlyArray<string>
  readonly stats: {
    readonly lines: number
    readonly sections: number
    readonly points: number
    /** Points where the cutter had to lean further to clear the part. */
    readonly leaned: number
    /** Points no lean within `gougeAngle` clears, or the table cannot reach: left out. */
    readonly skipped: number
  }
}

// ---------------------------------------------------------------- vectors and tool axis

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s })
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z)
const unit = (a: Vec3): Vec3 => {
  const l = length(a)
  if (!(l > 1e-12)) throw new RangeError("A zero vector has no direction")
  return { x: a.x / l, y: a.y / l, z: a.z / l }
}
const RAD = Math.PI / 180

/** Rodrigues: `v` turned about the unit axis `k` by `deg`. */
const rotateAbout = (v: Vec3, k: Vec3, deg: number): Vec3 => {
  const c = Math.cos(deg * RAD)
  const s = Math.sin(deg * RAD)
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)))
}

/** A unit vector in the tangent plane of `n`, as near to `hint` as the plane allows (any tangent when `hint` is along `n`). */
const tangentNear = (n: Vec3, hint: Vec3): Vec3 => {
  const t = add(hint, scale(n, -dot(hint, n)))
  if (length(t) > 1e-9) return unit(t)
  const other: Vec3 = Math.abs(n.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
  return unit(add(other, scale(n, -dot(other, n))))
}

/**
 * The unit tool axis (from the tip up through the holder) at a contact point with normal `n`, the tool moving along
 * `travel`. `normal`: `n` itself. `lead`: `n` leaned towards the travel by `lead` degrees, then turned sideways by `tilt`.
 */
export const toolAxisAt = (n: Vec3, travel: Vec3, params: { readonly toolAxis: ToolAxis; readonly lead: number; readonly tilt: number }): Vec3 => {
  const normal = unit(n)
  if (params.toolAxis === "normal") return normal
  const forward = tangentNear(normal, travel)
  const leaned = add(scale(normal, Math.cos(params.lead * RAD)), scale(forward, Math.sin(params.lead * RAD)))
  return unit(params.tilt === 0 ? leaned : rotateAbout(leaned, normal, params.tilt))
}

/**
 * The cutter envelope in part coordinates for a contact point `p` with tool axis `axis`, split in two:
 *  - `cut`: the cutting edge. It is meant to touch the surface, so it may only not be *inside* the material;
 *  - `body`: the rest of the tool (flutes, the ball above its equator). It must also keep `clearance` from the part.
 */
export const envelopeOf = (p: Vec3, axis: Vec3, tool: Tool, flute: number): { cut: Vec3[]; body: Vec3[] } => {
  const R = tool.diameter / 2
  const cut: Vec3[] = [p]
  const body: Vec3[] = []
  const seed: Vec3 = Math.abs(axis.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
  const u = unit(cross(axis, seed))
  const v = cross(axis, u)
  const ring = (into: Vec3[], centre: Vec3, radius: number): void => {
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4
      into.push(add(centre, add(scale(u, radius * Math.cos(a)), scale(v, radius * Math.sin(a)))))
    }
  }
  if (tool.kind === "ballnose") {
    // The ball is tangent to the surface at `p`: its centre lies one radius above it along the axis.
    const c = add(p, scale(axis, R))
    for (const lat of [-45, 0, 45, 90]) ring(body, add(c, scale(axis, Math.sin(lat * RAD) * R)), Math.cos(lat * RAD) * R)
    return { cut, body }
  }
  // Flat cutter: the end face and its rim are the cutting edge; the flutes rise above them.
  ring(cut, p, R)
  for (const h of [R * 0.5, R, R * flute]) ring(body, add(p, scale(axis, h)), R)
  return { cut, body }
}


// ---------------------------------------------------------------- samples

export interface Sample {
  readonly point: Vec3
  readonly angles: RotaryAngles
  readonly tip: Vec3
  readonly leaned: boolean
}

/** Largest single-axis table change between two sets of angles, degrees. */
const rotarySwing = (a: RotaryAngles, b: RotaryAngles): number => {
  const tilt = Math.abs((a.a ?? a.b ?? 0) - (b.a ?? b.b ?? 0))
  const turn = Math.abs(wrap(a.c - b.c))
  return Math.max(tilt, turn)
}

const wrap = (deg: number): number => {
  let d = deg % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}

/**
 * The sample for a contact point: the first lean (the base, then steeper ones in both directions) whose cutter stays
 * clear of the part and whose table angles the machine can reach. `undefined` when none does.
 */
const sampleAt = (
  hit: SurfaceHit,
  travel: Vec3,
  params: MultiaxisParams,
  tool: Tool,
  soup: TriangleSoup,
  k: FiveAxisKinematic
): Sample | undefined => {
  const leans: Array<{ lead: number; tilt: number }> = [{ lead: params.toolAxis === "lead" ? params.lead : 0, tilt: params.toolAxis === "lead" ? params.tilt : 0 }]
  if (params.gouge) {
    const base = leans[0]!.lead
    for (const step of [params.gougeAngle / 3, (2 * params.gougeAngle) / 3, params.gougeAngle]) {
      for (const sign of [1, -1]) leans.push({ lead: base + sign * step, tilt: leans[0]!.tilt })
    }
  }
  for (const [index, lean] of leans.entries()) {
    const axis = toolAxisAt(hit.normal, travel, { toolAxis: "lead", lead: lean.lead, tilt: lean.tilt })
    const angles = solveOrientation(axis, k)
    if (angles === undefined) continue
    const env = envelopeOf(hit.point, axis, tool, params.flute)
    const free = env.cut.every((q) => !soup.inside(q)) && env.body.every((q) => soup.isClear(q, params.gougeClearance))
    if (!free) continue
    return { point: hit.point, angles, tip: tipPosition(hit.point, angles, k), leaned: index > 0 }
  }
  return undefined
}

// ---------------------------------------------------------------- the operation

export const generateMultiaxis = (params: MultiaxisParams, soup: TriangleSoup, tool: Tool, k: FiveAxisKinematic, walls?: ReadonlyArray<SwarfWall>, cutter?: SwarfCutter): MultiaxisResult => {
  const warnings: string[] = []
  const bounds = soup.bounds
  const topZ = bounds.max[2]
  const stats: { lines: number; sections: number; points: number; leaned: number; skipped: number; collided?: number } = { lines: 0, sections: 0, points: 0, leaned: 0, skipped: 0 }
  const sections: Sample[][] = []
  const take = (sample: Sample | undefined): Sample | undefined => {
    if (sample === undefined) stats.skipped += 1
    else stats.leaned += sample.leaned ? 1 : 0
    return sample
  }
  const done = (moves: Move[]): MultiaxisResult => ({
    toolpath: { id: params.id, name: params.name, toolId: tool.id, spindleRpm: params.spindleRpm, coolant: params.coolant, moves },
    warnings,
    stats
  })

  if (tool.kind === "drill" || tool.kind === "vbit" || tool.kind === "facemill") {
    warnings.push(`A ${tool.kind} cannot machine a 5-axis surface; use an end mill or a ball nose cutter.`)
    return done([])
  }

  if (params.strategy === "swarf") {
    if (walls === undefined || walls.length === 0) {
      warnings.push("Swarf milling needs the walls to cut: none was given")
      return done([])
    }
    const found = swarfSections(walls, params, tool, soup, k, stats, warnings, cutter)
    if (stats.collided !== undefined && stats.collided > 0) warnings.push(`Swarf: ${stats.collided} pose(s) left out because the shank or the holder would be inside the part`)
    return emit(found, params, topZ, stats, warnings, done, k, bounds)
  }

  if (params.strategy === "contour") {
    const R = tool.diameter / 2
    const step = Math.max(0.05, Math.min(params.tolerance * 25, tool.diameter / 6, 0.5))
    const margin = R + 2 * step
    const rect: Rect = { x0: bounds.min[0] - margin, y0: bounds.min[1] - margin, x1: bounds.max[0] + margin, y1: bounds.max[1] + margin }
    const height = (x: number, y: number): number => soup.down(x, y, topZ + 1)?.point.z ?? -Infinity
    const nodes = sampleNodes(height, rect, step)
    const levels = levelsOf(params, topZ)
    for (const z of levels.passZ) {
      const level = Math.max(z, levels.bottomZ)
      const loops = contour(height, level, rect, step, false, nodes).map((l) => simplify(l, params.tolerance, true)).filter((l) => l.length >= 3)
      stats.lines += loops.length
      for (const loop of loops) {
        let run: Sample[] = []
        // Revisit the first point to cut the closing leg, but never bridge an unreachable interval.
        for (const xy of [...loop, loop[0]!]) {
          const hit = soup.down(xy.x, xy.y, topZ + 1)
          const sample = take(hit === undefined ? undefined : sampleAt(hit, travelOf(loop, xy), params, tool, soup, k))
          if (sample === undefined) {
            if (run.length > 0) sections.push(run)
            run = []
          } else run.push(sample)
        }
        if (run.length > 0) sections.push(run)
      }
    }
    return emit(sections, params, topZ, stats, warnings, done, k, bounds)
  }

  // ---- parallel raster
  const R = tool.diameter / 2
  const spacing = params.scallop > 0 && tool.kind === "ballnose"
    ? scallopSpacing(R, Math.min(params.scallop, R))
    : (params.stepover / 100) * tool.diameter
  if (!(spacing > 0)) {
    warnings.push("The cusp height or the stepover gives a zero line spacing")
    return done([])
  }
  const a = (params.angle * Math.PI) / 180
  const u = { x: Math.cos(a), y: Math.sin(a) }
  const v = { x: -Math.sin(a), y: Math.cos(a) }
  const corners: Vec2[] = [
    { x: bounds.min[0], y: bounds.min[1] }, { x: bounds.max[0], y: bounds.min[1] },
    { x: bounds.min[0], y: bounds.max[1] }, { x: bounds.max[0], y: bounds.max[1] }
  ]
  const across = corners.map((p) => p.x * v.x + p.y * v.y)
  const along = corners.map((p) => p.x * u.x + p.y * u.y)
  const tLo = Math.min(...along) - R
  const tHi = Math.max(...along) + R
  const vLo = Math.min(...across)
  const vHi = Math.max(...across)
  const steps = Math.max(1, Math.ceil((tHi - tLo) / params.sampling))
  for (let offset = vLo, index = 0; offset <= vHi + 1e-9; offset += spacing, index++) {
    stats.lines += 1
    const forward = params.oneWay || index % 2 === 0
    const line: Vec2[] = []
    for (let s = 0; s <= steps; s++) {
      const t = tLo + ((tHi - tLo) * s) / steps
      line.push({ x: u.x * t + v.x * offset, y: u.y * t + v.y * offset })
    }
    if (!forward) line.reverse()
    const travel: Vec3 = forward ? { x: u.x, y: u.y, z: 0 } : { x: -u.x, y: -u.y, z: 0 }
    let run: Sample[] = []
    for (const p of line) {
      const hit = soup.down(p.x, p.y, topZ + 1)
      const sample = hit === undefined ? undefined : take(sampleAt(hit, travel, params, tool, soup, k))
      if (sample === undefined) {
        if (run.length > 0) sections.push(run)
        run = []
        continue
      }
      run.push(sample)
    }
    if (run.length > 0) sections.push(run)
  }
  return emit(sections, params, topZ, stats, warnings, done, k, bounds)
}

/** Direction of travel along a closed loop at `xy` (towards the next point). */
const travelOf = (loop: ReadonlyArray<Vec2>, xy: Vec2): Vec3 => {
  const i = loop.indexOf(xy)
  const next = loop[(i + 1) % loop.length] ?? xy
  const d = { x: next.x - xy.x, y: next.y - xy.y, z: 0 }
  return length(d) > 1e-12 ? unit(d) : { x: 1, y: 0, z: 0 }
}

/** Highest Z of the part's box once the table has turned it at `angles` (program frame only). */
const boxTopAt = (min: readonly [number, number, number], max: readonly [number, number, number], angles: RotaryAngles, k: FiveAxisKinematic): number => {
  let top = -Infinity
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
    top = Math.max(top, partToMachine({ x, y, z }, angles, k.layout, k.pivot).z)
  }
  return top
}

/**
 * Sections to moves. Each section is split where the table would swing more than `maxRotaryStep`, and every section
 * starts and ends at clearance height, above the highest point the part or any tip reaches in the program's frame.
 */
const emit = (
  sections: ReadonlyArray<ReadonlyArray<Sample>>,
  params: MultiaxisParams,
  topZ: number,
  stats: { sections: number; points: number },
  warnings: string[],
  done: (moves: Move[]) => MultiaxisResult,
  k: FiveAxisKinematic,
  bounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] }
): MultiaxisResult => {
  const moves: Move[] = []
  if (sections.length === 0) {
    warnings.push("No point of the part can be reached by this tool at any allowed tool axis: nothing to cut")
    return done(moves)
  }
  const parts: Sample[][] = []
  for (const run of sections) {
    let current: Sample[] = []
    for (const s of run) {
      const prev = current[current.length - 1]
      if (prev !== undefined && rotarySwing(prev.angles, s.angles) > params.maxRotaryStep) {
        parts.push(current)
        current = []
      }
      current.push(s)
    }
    if (current.length > 0) parts.push(current)
  }
  let top = topZ
  for (const part of parts) {
    for (const s of part) {
      top = Math.max(top, s.tip.z)
      if (k.tcp === "program") top = Math.max(top, boxTopAt(bounds.min, bounds.max, s.angles, k))
    }
  }
  const clearZ = top + params.clearanceHeight
  const rotaryOf = (angles: RotaryAngles): Rotary => ({
    ...(angles.a !== undefined ? { a: angles.a } : {}),
    ...(angles.b !== undefined ? { b: angles.b } : {}),
    c: angles.c
  })
  parts.forEach((part, index) => {
    stats.sections += 1
    stats.points += part.length
    moves.push({ _tag: "Comment", text: `5-axis section ${index + 1}: ${part.length} point(s)` })
    const first = part[0]!
    const last = part[part.length - 1]!
    moves.push({ _tag: "Rapid", to: { x: first.tip.x, y: first.tip.y, z: clearZ }, rotary: rotaryOf(first.angles) })
    moves.push({ _tag: "Linear", to: first.tip, feed: params.plungeFeed, rotary: rotaryOf(first.angles) })
    for (const s of part.slice(1)) moves.push({ _tag: "Linear", to: s.tip, feed: params.feed, rotary: rotaryOf(s.angles) })
    moves.push({ _tag: "Rapid", to: { x: last.tip.x, y: last.tip.y, z: clearZ }, rotary: rotaryOf(last.angles) })
  })
  return done(moves)
}
