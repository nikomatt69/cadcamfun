/**
 * Stock-removal verification of a lathe program (spec 52 T3, spec 53 M4): the NC text is read back by the reference interpreter
 * (`testing/gcode-interpreter.ts`, which expands `G71 G70 G75 G76` itself), and every feed move is swept through a raster of the
 * revolved stock region (`LatheRaster`): a nose circle for a turning tool, a rounded rectangle for a grooving or parting blade.
 * The raster after the last move is compared with the finished part: material of the part that was cut (a gouge), material outside
 * the part that was left, rapids that run into material (a collision), and the removed volume against the closed form.
 *
 * Honest limits: the insert body behind the nose is not swept (a flank touching the part is the limit-angle check of `insert.ts`,
 * reported as a warning of the plan); a thread is not an axisymmetric removal, so its moves are checked for lead and depth and are
 * not stamped; the bound of every volume is the raster cell (`2 π r · cell²` per boundary cell).
 */
import { interpretGcode } from "../testing/gcode-interpreter.ts"
import { LatheRaster, radiusAt, type ToolShape } from "./geometry.ts"
import { noseRadiusOf, type LathePlan } from "./plan.ts"
import { insertSilhouette, parseInsert, type TurningTool } from "./insert.ts"

export interface LatheVerification {
  readonly ok: boolean
  /** Interpreter errors and words it could not replay. */
  readonly errors: ReadonlyArray<string>
  readonly cell: number
  /** Volumes over the part's length (z from the finished face to the end of the part), mm³. */
  readonly stockVolume: number
  readonly partVolume: number
  readonly removedVolume: number
  readonly expectedRemoved: number
  /** Part material the program cut (should be 0 within the cell bound). */
  readonly gougeVolume: number
  /** Stock outside the part the program left (the nose-radius residue in concave corners, unreached pockets). */
  readonly leftVolume: number
  /** Feed-move cells that cut material in total (a program that cuts nothing is wrong). */
  readonly cuts: number
  /** Rapid moves that ran into material, and the NC lines they are on. */
  readonly rapidCollisions: number
  readonly collisionLines: ReadonlyArray<number>
  /** Threads found in the replay: pitch (mm/rev) read from the feed and the spindle speed, and passes. */
  readonly threads: ReadonlyArray<{ readonly lead: number; readonly passes: number; readonly radiusMin: number; readonly radiusMax: number }>
  /** Bound of a volume comparison, mm³ (boundary cells of the part surface). */
  readonly volumeBound: number
}

const shapeOf = (tool: TurningTool): ToolShape => {
  if (tool.kind === "grooving" || tool.kind === "parting") return { kind: "blade", width: tool.bladeWidth ?? 3, height: tool.bladeLength ?? 8, corner: 0.1 }
  if (tool.insert !== undefined && (tool.kind === "turning" || tool.kind === "boring")) {
    const d = parseInsert(tool.insert)
    const nose = noseRadiusOf(tool)
    if (d.angle >= 180) return { kind: "circle", radius: d.inscribedCircle / 2 }
    // The insert body: nose arc and both edges over 0.8 of the inscribed circle (at most 8 mm). A boring tool is the mirror image (its body is on the axis side); a thread tool is swept as its nose circle.
    const body = insertSilhouette(d.angle, tool.approach ?? 95, nose, Math.min(d.inscribedCircle * 0.8, 8))
    return { kind: "polygon", points: tool.kind === "boring" ? body.map((p) => ({ z: p.z, r: -p.r })) : body }
  }
  return { kind: "circle", radius: Math.max(noseRadiusOf(tool), 0.05) }
}

export interface VerifyOptions {
  /** Raster cell, mm. Default 0.05. */
  readonly cell?: number
  /** Dwell of the program coordinates: `"diameter"` (default) or `"radius"`. */
  readonly xMode?: "diameter" | "radius"
}

export const verifyLathe = (plan: LathePlan, nc: string, options: VerifyOptions = {}): LatheVerification => {
  const cell = options.cell ?? 0.05
  const R = plan.stock.diameter / 2
  const pilot = (plan.stock.bore ?? 0) / 2
  const partLength = Math.max(-(plan.contour[plan.contour.length - 1]?.z ?? 0), -(plan.bore[plan.bore.length - 1]?.z ?? 0))
  const zTop = plan.faceAllowance
  const zEnd = -partLength
  const raster = new LatheRaster(zEnd - 1, zTop, R, cell)
  raster.fill(() => pilot, () => R)
  // The part: inside the outer contour (or the whole bar where there is none), outside the bore.
  const outer = (z: number): number => (plan.contour.length >= 2 ? (z > 0 ? 0 : radiusAt(plan.contour, z)) : z > 0 ? 0 : R)
  const inner = (z: number): number => (plan.bore.length >= 2 ? (z > 0 ? R + 1 : radiusAt(plan.bore, z)) : pilot)
  const part = new LatheRaster(zEnd - 1, zTop, R, cell)
  part.fill((z) => (z < zEnd ? R + 1 : inner(z)), (z) => (z < zEnd ? -1 : outer(z)))
  const stockInPart = raster.volume((z) => z >= zEnd)
  const partVolume = part.volume((z) => z >= zEnd)

  const result = interpretGcode(nc, { track: true, lathe: true })
  const errors = [...result.errors]
  const byStation = new Map<number, TurningTool>()
  for (const op of plan.operations) byStation.set(op.tool.number, op.tool)
  const toolFor = (t: number | undefined): TurningTool | undefined => (t === undefined ? undefined : byStation.get(t >= 100 ? Math.floor(t / 100) : t))
  const radiusOf = (x: number): number => (options.xMode === "radius" ? x : Math.abs(x) / 2)

  let cuts = 0
  let rapidCollisions = 0
  const collisionLines: number[] = []
  const threadPasses: Array<{ lead: number; rMin: number; rMax: number }> = []
  result.segments.forEach((seg, i) => {
    // The first move comes from wherever the control stood before the program: not a tool path.
    if (seg.kind === "dwell" || i === 0) return
    const state = result.states?.[i]
    const tool = toolFor(state?.tool)
    if (tool === undefined) return
    const a = { z: seg.from.z, r: radiusOf(seg.from.x) }
    const b = { z: seg.to.z, r: radiusOf(seg.to.x) }
    if (tool.kind === "threading") {
      if (seg.kind !== "rapid" && state !== undefined && state.rpm > 0 && seg.feed > 0) threadPasses.push({ lead: seg.feed / state.rpm, rMin: Math.min(a.r, b.r), rMax: Math.max(a.r, b.r) })
      return
    }
    const shape = shapeOf(tool)
    if (seg.kind === "rapid") {
      // A rapid may graze the surface by a cell or two of quantisation; more than 8 material cells under the tool is a collision.
      if (raster.sweep(shape, a, b, false) > 8) { rapidCollisions++; collisionLines.push(seg.line) }
      return
    }
    cuts += raster.sweep(shape, a, b, true)
  })

  // The sweep above reads a program in diameter; the thread passes are summarised by lead.
  const grouped = new Map<string, { lead: number; passes: number; rMin: number; rMax: number }>()
  for (const t of threadPasses) {
    const key = t.lead.toFixed(4)
    const g = grouped.get(key)
    if (g === undefined) grouped.set(key, { lead: t.lead, passes: 1, rMin: t.rMin, rMax: t.rMax })
    else { g.passes++; g.rMin = Math.min(g.rMin, t.rMin); g.rMax = Math.max(g.rMax, t.rMax) }
  }

  const left = raster.volume((z, r) => z >= zEnd && part.data[Math.floor((z - part.zMin) / cell) * part.nr + Math.floor(r / cell)] === 0)
  const remaining = raster.volume((z) => z >= zEnd)
  const gouge = part.volume((z, r) => z >= zEnd && raster.data[Math.floor((z - raster.zMin) / cell) * raster.nr + Math.floor(r / cell)] === 0)
  const removed = stockInPart - remaining
  const expectedRemoved = stockInPart - partVolume
  // Boundary cells of the part surface: surface area x cell, revolved.
  const surfaceOf = (c: ReadonlyArray<{ z: number; r: number }>): number => c.reduce((sum, p, i) => (i === 0 ? 0 : sum + 2 * Math.PI * ((p.r + c[i - 1]!.r) / 2) * Math.hypot(p.z - c[i - 1]!.z, p.r - c[i - 1]!.r)), 0)
  const surface = surfaceOf(plan.contour) + surfaceOf(plan.bore)
  const volumeBound = Math.max(surface * cell, 2 * Math.PI * R * cell * cell * 4)
  return {
    ok: errors.length === 0 && rapidCollisions === 0,
    errors, cell, stockVolume: stockInPart, partVolume, removedVolume: removed, expectedRemoved, gougeVolume: gouge, leftVolume: left, cuts, rapidCollisions, collisionLines,
    threads: [...grouped.values()].map((g) => ({ lead: g.lead, passes: g.passes, radiusMin: g.rMin, radiusMax: g.rMax })), volumeBound
  }
}
