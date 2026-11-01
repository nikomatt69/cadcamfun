/**
 * The lathe planner (spec 52 T2-T5): facing, outside and inside roughing and finishing with nose-radius compensation, grooving,
 * threading and parting, as explicit tool-reference-point paths in diameter X and axial Z, plus the description of the canned cycle
 * (`G71 G70 G75 G76`) each path is equal to. The explicit path is what the verifier and the posts without a cycle use; the cycle
 * description is what a Fanuc-family post writes. `plan.test.ts` shows the two are the same toolpath (the NC replay of the cycle
 * against the explicit path, move for move).
 *
 * The tool reference point is the centre of the nose circle (every offset register of a turning tool is then the radius to its
 * centre); the path is the contour offset by the nose radius (`geometry.ts offsetContour`). A grooving or parting blade is
 * referenced on its +z corner.
 */
import { findMaterial } from "../kernel/materials.ts"
import { offsetContour, radiusAt, revolvedVolume, turningEnvelope, type FreeSide, type RZ } from "./geometry.ts"
import { checkContour, parseInsert, toolLimits, type TurningTool } from "./insert.ts"

export interface LathePoint {
  readonly diameter: number
  readonly z: number
}

/** One move of the tool reference point: X is a diameter. `feed` is mm/rev; a `thread` move is a lead of `pitch` mm/rev. */
export interface LatheMove {
  readonly kind: "rapid" | "feed" | "thread"
  readonly x: number
  readonly z: number
  readonly feed?: number
  readonly pitch?: number
}

export type CycleSpec =
  | {
      readonly cycle: "g71"
      readonly start: { readonly x: number; readonly z: number }
      readonly depth: number
      readonly retract: number
      /** Diametral and axial allowance left for the finish (`U`, `W`). */
      readonly allowance: { readonly x: number; readonly z: number }
      /** The finishing profile (centre path) from the first point after the start; the cycle's `P`..`Q` blocks. */
      readonly profile: ReadonlyArray<{ readonly x: number; readonly z: number }>
      readonly feed: number
    }
  | { readonly cycle: "g70"; readonly start: { readonly x: number; readonly z: number }; readonly profile: ReadonlyArray<{ readonly x: number; readonly z: number }>; readonly feed: number }
  | {
      readonly cycle: "g75"
      readonly start: { readonly x: number; readonly z: number }
      readonly end: { readonly x: number; readonly z: number }
      /** Peck depth in X (diametral... a radial peck, as the cycle reads it) and the step across, mm. */
      readonly peckX: number
      readonly stepZ: number
      readonly retract: number
      readonly feed: number
    }
  | {
      readonly cycle: "g76"
      readonly start: { readonly x: number; readonly z: number }
      readonly root: { readonly x: number; readonly z: number }
      /** Thread height (radial), first and minimum cut, finish allowance, finish passes. */
      readonly height: number
      readonly firstDepth: number
      readonly minDepth: number
      readonly finishAllowance: number
      readonly finishPasses: number
      readonly pitch: number
    }

export interface LatheOperation {
  readonly id: string
  readonly name: string
  readonly kind: "face" | "rough" | "finish" | "groove" | "thread" | "part"
  readonly tool: TurningTool
  readonly moves: ReadonlyArray<LatheMove>
  readonly cycle?: CycleSpec
  /** Constant surface speed, m/min, or the constant spindle speed of a thread (`rpm`). */
  readonly css?: number
  readonly rpm?: number
  /** Spindle speed ceiling, rpm. */
  readonly rpmLimit: number
  readonly feed: number
  /** Where the tool waits before the operation, diameter X. */
  readonly start: { readonly x: number; readonly z: number }
  /** What the operation leaves for the next one, radial mm (rough: allowance). */
  readonly allowance?: { readonly x: number; readonly z: number }
  readonly notes: ReadonlyArray<string>
}

export type OpSpec =
  | { readonly kind: "face"; readonly tool: string; readonly depth?: number; readonly feed?: number }
  | { readonly kind: "rough"; readonly tool: string; readonly side?: "external" | "internal"; readonly depth?: number; readonly allowance?: { readonly x?: number; readonly z?: number }; readonly feed?: number; readonly retract?: number }
  | { readonly kind: "finish"; readonly tool: string; readonly side?: "external" | "internal"; readonly feed?: number; readonly springPasses?: number }
  | { readonly kind: "groove"; readonly tool: string; readonly side?: "external" | "internal"; readonly z: number; readonly width: number; readonly diameter: number; readonly peck?: number; readonly feed?: number }
  | {
      readonly kind: "thread"; readonly tool: string; readonly side?: "external" | "internal"; readonly standard?: "metric" | "whitworth" | "trapezoidal"
      readonly diameter: number; readonly pitch: number; readonly zStart: number; readonly zEnd: number; readonly starts?: number
      readonly infeed?: "radial" | "flank" | "alternating"; readonly springPasses?: number; readonly firstDepth?: number; readonly minDepth?: number
    }
  | { readonly kind: "part"; readonly tool: string; readonly z: number; readonly stubDiameter?: number; readonly peck?: number; readonly feed?: number }

export interface LatheJob {
  readonly stock: { readonly diameter: number; readonly length: number; /** Pilot bore already in the bar, diameter. */ readonly bore?: number }
  /** Bar standing out beyond the finished face (z = 0), removed by facing. Default 0.5. */
  readonly faceAllowance?: number
  /** Finished outside profile, face to chuck. */
  readonly contour?: ReadonlyArray<LathePoint>
  /** Finished inside profile, face to chuck (needs `stock.bore`). */
  readonly bore?: ReadonlyArray<LathePoint>
  readonly tools: ReadonlyArray<TurningTool>
  readonly operations: ReadonlyArray<OpSpec>
  readonly material?: string
  readonly machine?: { readonly maxRpm: number; readonly maxFeed?: number }
}

export interface LathePlan {
  readonly operations: ReadonlyArray<LatheOperation>
  readonly issues: ReadonlyArray<string>
  readonly warnings: ReadonlyArray<string>
  readonly stock: LatheJob["stock"]
  readonly faceAllowance: number
  readonly contour: ReadonlyArray<RZ>
  readonly bore: ReadonlyArray<RZ>
  /** Closed-form volumes, mm³: the bar (less its pilot bore) and the finished part over its length. */
  readonly analytic: { readonly stockVolume: number; readonly partVolume: number; readonly removedVolume: number }
}

const EPS = 1e-9
const r3 = (v: number): number => Math.round(v * 1000) / 1000

// ------------------------------------------------------------------------------------------------- thread data

/** Thread depth (radial) from the pitch for the standards the planner knows, mm. External unless `internal`. */
export const threadHeight = (standard: "metric" | "whitworth" | "trapezoidal", pitch: number, internal: boolean): number => {
  switch (standard) {
    // ISO 262 / ISO 68-1: external h3 = 0.6134 P (rounded root), internal H1 = 0.5413 P.
    case "metric": return (internal ? 0.5413 : 0.6134) * pitch
    // ISO 228 / BS 84: h = 0.640327 P, both.
    case "whitworth": return 0.640327 * pitch
    // DIN 103 Tr: h3 = 0.5 P + ac, ac = 0.25 (P 1.5-5), 0.5 (6-12), 1 (14-44); internal H4 = 0.5 P + ac.
    case "trapezoidal": return 0.5 * pitch + (pitch <= 5 ? 0.25 : pitch <= 12 ? 0.5 : 1)
  }
}
/** Included flank angle of the profile, degrees. */
export const threadFlankAngle = (standard: "metric" | "whitworth" | "trapezoidal"): number => (standard === "metric" ? 60 : standard === "whitworth" ? 55 : 30)

/** Radial cut depths of a thread: `first sqrt(n)` (constant chip area) while below the height less the finish allowance, then the full height `finish` times. */
export const threadDepths = (height: number, firstDepth: number, minDepth: number, finishAllowance: number, finishPasses: number): number[] => {
  const rough = Math.max(0, height - finishAllowance)
  const out: number[] = []
  let previous = 0
  for (let n = 1; n < 1000 && firstDepth > EPS; n++) {
    let d = firstDepth * Math.sqrt(n)
    if (d - previous < minDepth) d = previous + minDepth
    if (d >= rough - EPS) break
    out.push(d)
    previous = d
  }
  if (rough > EPS && rough > previous + EPS) out.push(rough)
  for (let m = 0; m < Math.max(1, Math.round(finishPasses)); m++) out.push(height)
  return out
}

// ------------------------------------------------------------------------------------------------- roughing

interface RoughInput {
  readonly profile: ReadonlyArray<RZ>
  readonly start: RZ
  readonly depth: number
  readonly retract: number
  readonly allowance: RZ
  /** -1: levels fall from the start (outside), +1: they rise (inside). */
  readonly dir: 1 | -1
}

/** The explicit path of a stock-removal cycle (the G71 geometry): level passes at every `depth` from the start, each to where its level meets the shifted profile, then the profile itself. */
export const roughPath = (input: RoughInput): RZ[] => {
  const { start: A, dir } = input
  if (input.profile.length < 2 || input.depth <= EPS) return []
  // The allowance is material left on the part: outside the path stays above the contour, inside it stays below it.
  const body = input.profile.map((p) => ({ z: p.z + input.allowance.z, r: p.r - dir * input.allowance.r }))
  const levels = body.map((p) => p.r)
  const limit = dir < 0 ? Math.min(...levels) : Math.max(...levels)
  const end = body[body.length - 1]!
  const t = Math.sign(end.z - A.z) || -1
  // The first crossing of a level along the shifted profile (the profile is read from its second point: the first is the X-only approach).
  const crossing = (lv: number): number | undefined => {
    for (let i = 0; i + 1 < body.length; i++) {
      const a = body[i]!, b = body[i + 1]!
      if ((lv - a.r) * (lv - b.r) > EPS || (Math.abs(b.r - a.r) < EPS && Math.abs(lv - a.r) > EPS)) continue
      const u = Math.abs(b.r - a.r) < EPS ? 0 : (lv - a.r) / (b.r - a.r)
      return a.z + (b.z - a.z) * u
    }
    return undefined
  }
  const out: RZ[] = []
  for (let k = 1; k < 10_000; k++) {
    const lv = A.r + dir * k * input.depth
    if (dir * (lv - limit) >= -EPS) break
    const hit = crossing(lv) ?? end.z
    if (t * (hit - A.z) <= EPS) continue
    // A level beyond the profile at the entry (a bore that widens deeper) would cut the part: that section is not reachable by this cycle.
    if (dir * (body[0]!.r - lv) < -EPS) continue
    out.push({ z: A.z, r: lv }, { z: hit, r: lv }, { z: hit - t * input.retract, r: lv - dir * input.retract }, { z: A.z, r: lv - dir * input.retract })
  }
  out.push(...body)
  out.push({ z: end.z, r: A.r })
  return out
}

// ------------------------------------------------------------------------------------------------- the planner

const toolOf = (job: LatheJob, id: string, issues: string[]): TurningTool | undefined => {
  const t = job.tools.find((x) => x.id === id)
  if (t === undefined) issues.push(`the operation names tool '${id}' which the job does not define`)
  return t
}

const toRZ = (points: ReadonlyArray<LathePoint>): RZ[] => points.map((p) => ({ z: p.z, r: p.diameter / 2 }))
const diam = (p: RZ): { x: number; z: number } => ({ x: r3(2 * p.r), z: r3(p.z) })

/** Nose radius of a tool, mm (0 for a blade, a thread tool and a tool without an insert). */
export const noseRadiusOf = (tool: TurningTool): number => {
  if (tool.noseRadius !== undefined) return tool.noseRadius
  if (tool.insert !== undefined) return parseInsert(tool.insert).noseRadius
  return 0
}

export const planLathe = (job: LatheJob): LathePlan => {
  const issues: string[] = []
  const warnings: string[] = []
  const faceAllowance = job.faceAllowance ?? 0.5
  const R = job.stock.diameter / 2
  const contour = job.contour !== undefined ? toRZ(job.contour) : []
  const bore = job.bore !== undefined ? toRZ(job.bore) : []
  if (!(job.stock.diameter > 0) || !(job.stock.length > 0)) issues.push("the stock needs a positive diameter and length")
  for (const [name, c] of [["contour", contour], ["bore", bore]] as const) {
    c.forEach((p, i) => {
      if (!Number.isFinite(p.z) || !Number.isFinite(p.r) || p.r < 0) issues.push(`${name} point ${i} is not finite or has a negative diameter`)
      if (i > 0 && p.z > c[i - 1]!.z + EPS) issues.push(`${name} z increases at point ${i}: a profile runs from the face to the chuck`)
      if (name === "contour" && p.r > R + EPS) issues.push(`contour point ${i} (Ø${2 * p.r}) is larger than the Ø${2 * R} bar`)
    })
    if (c.length > 0 && Math.abs(c[0]!.z) > EPS) issues.push(`the ${name} must start at the finished face (z = 0)`)
  }
  if (bore.length > 0 && job.stock.bore === undefined) issues.push("an inside profile needs the pilot bore of the bar (stock.bore)")
  const partLength = Math.max(-(contour[contour.length - 1]?.z ?? 0), -(bore[bore.length - 1]?.z ?? 0))
  if (partLength + faceAllowance > job.stock.length + EPS) issues.push(`the part is ${partLength} mm long plus ${faceAllowance} mm facing but the bar is ${job.stock.length} mm`)
  const material = findMaterial(job.material ?? "steel-c45")
  if (material === undefined) issues.push(`unknown material '${job.material}'`)
  const maxRpm = job.machine?.maxRpm ?? 4000
  const operations: LatheOperation[] = []
  if (issues.length > 0) return emptyPlan(job, faceAllowance, contour, bore, issues, warnings)

  const vcRough = material!.vcCarbide.rough * 0.9
  const vcFinish = material!.vcCarbide.finish * 0.9
  const zSafe = faceAllowance + 1
  let counter = 0
  const id = (kind: string): string => `${kind}-${++counter}`

  for (const spec of job.operations) {
    const tool = toolOf(job, spec.tool, issues)
    if (tool === undefined) continue
    let nose = 0
    try { nose = noseRadiusOf(tool) } catch (error) { issues.push(`tool '${tool.id}': ${(error as Error).message}`); continue }
    const notesFor: string[] = []
    switch (spec.kind) {
      case "face": {
        // The insert reaches about a nose radius above the plane it generates: a facing pass is no deeper than that.
        const depth = spec.depth ?? Math.max(0.2, Math.min(1, nose))
        const feed = spec.feed ?? 0.2
        const moves: LatheMove[] = []
        const xOut = 2 * R + 2
        // Passes along z from the bar end to the finished face, each cut from outside to the axis (tool centre at the nose radius above the face).
        let z = faceAllowance
        while (z > EPS) {
          const next = Math.max(0, z - depth)
          const zc = next + nose // the nose circle touches the face plane z = next from the tool side
          moves.push({ kind: "rapid", x: r3(xOut), z: r3(z) }, { kind: "rapid", x: r3(xOut), z: r3(zc) }, { kind: "feed", x: 0, z: r3(zc), feed })
          moves.push({ kind: "feed", x: r3(xOut), z: r3(zc + 0.5), feed })
          z = next
        }
        moves.push({ kind: "rapid", x: r3(xOut), z: r3(zSafe + nose) })
        operations.push({ id: id("face"), name: "Face", kind: "face", tool, moves, css: vcRough, rpmLimit: maxRpm, feed, start: { x: r3(xOut), z: r3(zSafe + nose) }, notes: [`facing ${faceAllowance} mm in passes of ${depth} mm`] })
        break
      }
      case "rough":
      case "finish": {
        const internal = spec.side === "internal"
        const source = internal ? bore : contour
        if (source.length < 2) { issues.push(`${spec.kind} ${internal ? "inside" : "outside"} needs a ${internal ? "bore" : "contour"} profile`); break }
        const free: FreeSide = internal ? "below" : "above"
        const limits = tool.insert !== undefined ? toolLimits(parseInsert(tool.insert).angle, tool.approach ?? 95) : undefined
        // What the tool can reach from this side: a pocket it cannot enter is bridged (a grooving tool cuts it).
        // An outside profile ends by rising to the bar (the shoulder the parting tool leaves a kerf behind): the retreat faces it.
        const lastSrc = source[source.length - 1]!
        // An inside profile ends on the bottom of the bore, down to the pilot hole of the bar.
        const pilotR = (job.stock.bore ?? 0) / 2
        const closed: RZ[] = !internal && lastSrc.r < R - EPS ? [...source, { z: lastSrc.z, r: R }] : internal && lastSrc.r > pilotR + EPS ? [...source, { z: lastSrc.z, r: pilotR }] : [...source]
        const envelope = limits !== undefined ? turningEnvelope(closed, limits.maxDescend, free) : { profile: closed, bridged: [] }
        for (const b of envelope.bridged) notesFor.push(`the pocket z ${r3(b.z0)} to ${r3(b.z1)} is bridged at Ø${r3(2 * b.r)}: ${tool.id} cannot enter it (a grooving tool cuts it)`)
        if (limits !== undefined) {
          const check = checkContour(envelope.profile, limits)
          for (const v of check.violations) warnings.push(`contour segment ${v.segment}: the ${v.kind === "descend" ? "falling" : "rising"} slope ${r3(v.slope)} deg exceeds the ${r3(v.limit)} deg ${tool.id} can generate: it will be left with material`)
        }
        const centre = offsetContour(envelope.profile, nose, free)
        // The profile as the cycle reads it: the approach (X only at the start z), then the centre path.
        const first = centre[0]!
        const approach: RZ = { z: zSafe, r: first.r }
        if (spec.kind === "rough") {
          const depth = spec.depth ?? 2
          const retract = spec.retract ?? 0.5
          const allowance = { r: (spec.allowance?.x ?? 0.4) / 2, z: spec.allowance?.z ?? 0.2 }
          const feed = spec.feed ?? 0.25
          const start: RZ = internal ? { z: zSafe, r: (job.stock.bore ?? 0) / 2 } : { z: zSafe, r: R }
          const profile = [approach, ...centre]
          // A stock-removal cycle of type I needs a profile whose radius only grows towards the chuck (outside) or only shrinks (inside).
          const monotone = centre.every((p, i) => i === 0 || (internal ? p.r <= centre[i - 1]!.r + 1e-6 : p.r >= centre[i - 1]!.r - 1e-6))
          if (!monotone) notesFor.push("the profile falls back (a taper or a bore that widens): written as explicit passes, the stock-removal cycle would not match it")
          const path = roughPath({ profile, start, depth, retract, allowance: { z: allowance.z, r: allowance.r }, dir: internal ? 1 : -1 })
          const moves: LatheMove[] = [{ kind: "rapid", x: r3(2 * start.r), z: r3(start.z) }]
          // The cycle's passes: a level pass is rapid in, feed along, feed out at 45 degrees, rapid back (groups of four points), then the profile.
          const groups = Math.floor((path.length - centre.length - 2) / 4)
          for (let g = 0; g < groups; g++) {
            const p = path.slice(g * 4, g * 4 + 4)
            moves.push({ kind: "rapid", x: r3(2 * p[0]!.r), z: r3(p[0]!.z) }, { kind: "feed", x: r3(2 * p[1]!.r), z: r3(p[1]!.z), feed })
            moves.push({ kind: "feed", x: r3(2 * p[2]!.r), z: r3(p[2]!.z), feed }, { kind: "rapid", x: r3(2 * p[3]!.r), z: r3(p[3]!.z) })
          }
          const tail = path.slice(groups * 4)
          moves.push({ kind: "rapid", x: r3(2 * tail[0]!.r), z: r3(tail[0]!.z) })
          for (const p of tail.slice(1, -1)) moves.push({ kind: "feed", x: r3(2 * p.r), z: r3(p.z), feed })
          moves.push({ kind: "rapid", x: r3(2 * tail[tail.length - 1]!.r), z: r3(tail[tail.length - 1]!.z) }, { kind: "rapid", x: r3(2 * start.r), z: r3(start.z) })
          operations.push({
            id: id("rough"), name: internal ? "Rough bore" : "Rough turn", kind: "rough", tool, moves, css: vcRough, rpmLimit: maxRpm, feed, start: diam(start),
            allowance: { x: r3(2 * allowance.r), z: allowance.z },
            ...(monotone ? { cycle: { cycle: "g71" as const, start: diam(start), depth, retract, allowance: { x: r3(internal ? -2 * allowance.r : 2 * allowance.r), z: allowance.z }, profile: [approach, ...centre].map(diam), feed } } : {}),
            notes: [...notesFor, `${depth} mm per pass, allowance ${r3(2 * allowance.r)} x ${allowance.z}, nose centre path R${nose}`]
          })
        } else {
          const feed = spec.feed ?? 0.1
          const start: RZ = internal ? { z: zSafe, r: (job.stock.bore ?? 0) / 2 } : { z: zSafe, r: R }
          const profile = [approach, ...centre]
          const moves: LatheMove[] = [{ kind: "rapid", x: r3(2 * start.r), z: r3(start.z) }, { kind: "rapid", x: r3(2 * approach.r), z: r3(approach.z) }]
          const passes = 1 + Math.max(0, spec.springPasses ?? 0)
          for (let p = 0; p < passes; p++) {
            if (p > 0) moves.push({ kind: "rapid", x: r3(2 * approach.r), z: r3(approach.z) })
            for (const q of centre) moves.push({ kind: "feed", x: r3(2 * q.r), z: r3(q.z), feed })
          }
          const last = centre[centre.length - 1]!
          // Leave the part radially, then back to the start.
          moves.push({ kind: "rapid", x: r3(2 * start.r), z: r3(last.z) }, { kind: "rapid", x: r3(2 * start.r), z: r3(start.z) })
          operations.push({
            id: id("finish"), name: internal ? "Finish bore" : "Finish turn", kind: "finish", tool, moves, css: vcFinish, rpmLimit: maxRpm, feed, start: diam(start),
            cycle: { cycle: "g70", start: diam(start), profile: profile.map(diam), feed },
            notes: [...notesFor, `nose centre path R${nose}${passes > 1 ? `, ${passes - 1} spring pass(es)` : ""}`]
          })
        }
        break
      }
      case "groove": {
        const internal = spec.side === "internal"
        const w = tool.bladeWidth ?? 0
        if (!(w > 0)) { issues.push(`groove tool '${tool.id}' needs bladeWidth`); break }
        if (spec.width + EPS < w) { issues.push(`the groove is ${spec.width} mm wide but the blade is ${w} mm`); break }
        const feed = spec.feed ?? 0.08
        const surface = internal ? Math.min(radiusAt(bore, spec.z + 0.5), radiusAt(bore, spec.z - spec.width - 0.5)) : Math.max(radiusAt(contour, spec.z + 0.5), radiusAt(contour, spec.z - spec.width - 0.5))
        const bottom = spec.diameter / 2
        const dir = internal ? 1 : -1
        if (!internal && bottom >= surface - EPS) { issues.push(`groove diameter ${spec.diameter} is not below the surface Ø${r3(2 * surface)}`); break }
        const peck = spec.peck ?? 1.5
        const zRef0 = spec.z // +z wall: the blade's +z corner touches it
        const zRefEnd = spec.z - spec.width + w
        const step = Math.min(0.9 * w, Math.max(w / 2, 0.5))
        const columns: number[] = [zRef0]
        for (let c = zRef0 - step; c > zRefEnd + EPS; c -= step) columns.push(c)
        if (spec.width > w + EPS) columns.push(zRefEnd)
        const moves: LatheMove[] = [{ kind: "rapid", x: r3(2 * (surface + (internal ? -1 : 1))), z: r3(zSafe) }]
        for (const zc of columns) {
          moves.push({ kind: "rapid", x: r3(2 * (surface + (internal ? -1 : 1))), z: r3(zc) })
          let r = surface
          while (dir * (bottom - r) > EPS) {
            r = dir * (bottom - r) > peck ? r + dir * peck : bottom
            moves.push({ kind: "feed", x: r3(2 * r), z: r3(zc), feed })
            if (dir * (bottom - r) > EPS) moves.push({ kind: "rapid", x: r3(2 * (r - dir * 0.3)), z: r3(zc) }, { kind: "feed", x: r3(2 * r), z: r3(zc), feed })
          }
          moves.push({ kind: "rapid", x: r3(2 * (surface + (internal ? -1 : 1))), z: r3(zc) })
        }
        moves.push({ kind: "rapid", x: r3(2 * (surface + (internal ? -1 : 1))), z: r3(zSafe) })
        const startX = r3(2 * (surface + (internal ? -1 : 1)))
        operations.push({
          id: id("groove"), name: "Groove", kind: "groove", tool, moves, css: vcFinish * 0.7, rpmLimit: maxRpm, feed, start: { x: startX, z: r3(zSafe) },
          cycle: { cycle: "g75", start: { x: startX, z: r3(zRef0) }, end: { x: r3(spec.diameter), z: r3(zRefEnd) }, peckX: peck, stepZ: step, retract: 0.3, feed },
          notes: [`blade ${w} mm, ${columns.length} plunge(s), peck ${peck} mm`]
        })
        break
      }
      case "thread": {
        const internal = spec.side === "internal"
        const standard = spec.standard ?? "metric"
        const pitch = spec.pitch
        if (!(pitch > 0)) { issues.push("a thread needs a positive pitch"); break }
        const h = threadHeight(standard, pitch, internal)
        const starts = Math.max(1, Math.round(spec.starts ?? 1))
        const infeed = spec.infeed ?? "radial"
        const rpmThread = Math.max(50, Math.min(maxRpm, Math.floor((1000 * vcFinish * 0.5) / (Math.PI * spec.diameter)), Math.floor(((job.machine?.maxFeed ?? 8000) * 0.9) / (pitch * starts))))
        const rMajor = spec.diameter / 2
        // External: the tool tip at r = major - depth; internal: the tip starts at the minor radius and goes out to the major.
        const rRoot = internal ? rMajor : rMajor - h
        const depths = threadDepths(h, spec.firstDepth ?? Math.min(h / 3, 0.35), spec.minDepth ?? 0.05, 0.05, Math.max(1, Math.round(spec.springPasses ?? 1)))
        const clear = 1.5
        const rStart = internal ? rRoot - h - clear : rMajor + clear
        const moves: LatheMove[] = [{ kind: "rapid", x: r3(2 * rStart), z: r3(spec.zStart) }]
        const tan = Math.tan(((threadFlankAngle(standard) / 2) * Math.PI) / 180)
        const zIn = spec.zStart
        const zOut = spec.zEnd
        depths.forEach((d, n) => {
          const r = internal ? rRoot - h + d : rRoot + (h - d)
          for (let s = 0; s < starts; s++) {
            // Flank infeed moves each pass along the leading flank; alternating flanks swap sides.
            const shift = infeed === "radial" ? 0 : (infeed === "flank" ? -1 : n % 2 === 0 ? -1 : 1) * d * tan
            const zs = zIn - (s * pitch) / starts + shift
            moves.push({ kind: "rapid", x: r3(2 * rStart), z: r3(zs) }, { kind: "rapid", x: r3(2 * r), z: r3(zs) }, { kind: "thread", x: r3(2 * r), z: r3(zOut + shift), feed: pitch * starts, pitch: pitch * starts })
            moves.push({ kind: "rapid", x: r3(2 * rStart), z: r3(zOut + shift) }, { kind: "rapid", x: r3(2 * rStart), z: r3(zIn) })
          }
        })
        const radial = infeed === "radial" && starts === 1
        operations.push({
          id: id("thread"), name: `Thread ${standard} Ø${spec.diameter} x ${pitch}`, kind: "thread", tool, moves, rpm: rpmThread, rpmLimit: maxRpm, feed: pitch * starts, start: { x: r3(2 * rStart), z: r3(zIn) },
          ...(radial ? { cycle: { cycle: "g76" as const, start: { x: r3(2 * rStart), z: r3(zIn) }, root: { x: r3(2 * (internal ? rRoot : rRoot)), z: r3(zOut) }, height: h, firstDepth: spec.firstDepth ?? Math.min(h / 3, 0.35), minDepth: spec.minDepth ?? 0.05, finishAllowance: 0.05, finishPasses: Math.max(1, Math.round(spec.springPasses ?? 1)), pitch } } : {}),
          notes: [`${standard} thread, height ${r3(h)} mm, ${depths.length} pass(es) x ${starts} start(s), ${infeed} infeed, ${rpmThread} rpm`]
        })
        break
      }
      case "part": {
        const w = tool.bladeWidth ?? 0
        if (!(w > 0)) { issues.push(`parting tool '${tool.id}' needs bladeWidth`); break }
        const feed = spec.feed ?? 0.06
        const stub = (spec.stubDiameter ?? 0) / 2
        const peck = spec.peck ?? 3
        const zRef = spec.z // the +z corner of the blade stands on the finished end of the part
        const moves: LatheMove[] = [{ kind: "rapid", x: r3(2 * R + 2), z: r3(zSafe) }, { kind: "rapid", x: r3(2 * R + 2), z: r3(zRef) }]
        let r = R
        while (r - stub > EPS) {
          r = Math.max(stub, r - peck)
          // Near the axis the cut speed falls to zero: the feed halves below a quarter of the radius.
          moves.push({ kind: "feed", x: r3(2 * r), z: r3(zRef), feed: r < R / 4 ? feed / 2 : feed })
          if (r - stub > EPS) moves.push({ kind: "rapid", x: r3(2 * (r + 0.5)), z: r3(zRef) }, { kind: "feed", x: r3(2 * r), z: r3(zRef), feed: r < R / 4 ? feed / 2 : feed })
        }
        moves.push({ kind: "rapid", x: r3(2 * R + 2), z: r3(zRef) }, { kind: "rapid", x: r3(2 * R + 2), z: r3(zSafe) })
        operations.push({ id: id("part"), name: "Part off", kind: "part", tool, moves, css: vcFinish * 0.6, rpmLimit: maxRpm, feed, start: { x: r3(2 * R + 2), z: r3(zSafe) }, notes: [`blade ${w} mm, ${stub > 0 ? `stub Ø${r3(2 * stub)} left` : "cut through"}`] })
        break
      }
    }
  }
  const contourVolume = contour.length >= 2 ? revolvedVolume(contour) : 0
  const boreVolume = bore.length >= 2 ? revolvedVolume(bore) : 0
  const length = partLength
  const stockVolume = Math.PI * R * R * length - (job.stock.bore !== undefined ? Math.PI * (job.stock.bore / 2) ** 2 * length : 0)
  const partVolume = (contour.length >= 2 ? contourVolume : Math.PI * R * R * length) - (bore.length >= 2 ? boreVolume : job.stock.bore !== undefined ? Math.PI * (job.stock.bore / 2) ** 2 * length : 0)
  return {
    operations, issues, warnings, stock: job.stock, faceAllowance, contour, bore,
    analytic: { stockVolume, partVolume, removedVolume: stockVolume - partVolume }
  }
}

const emptyPlan = (job: LatheJob, faceAllowance: number, contour: RZ[], bore: RZ[], issues: string[], warnings: string[]): LathePlan => ({
  operations: [], issues, warnings, stock: job.stock, faceAllowance, contour, bore, analytic: { stockVolume: 0, partVolume: 0, removedVolume: 0 }
})
