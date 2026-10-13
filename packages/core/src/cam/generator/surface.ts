/**
 * 3D surface machining for the generator panel (`3d_surface`): the selected solids become one part model, and the surface
 * engine (`../operations/surface.ts`) cuts it: Z-level roughing around the part, then, when the finishing pass is on, the
 * finishing strategy of the panel (waterline for `contour`, raster for `parallel`) leaving `finishingAllowance` on the part
 * for the finishing tool pass to take. The engine's moves are written in the panel's G-code style (plain G0/G1/G2/G3).
 */
import { Schema } from "effect"
import type { Move } from "../ir.ts"
import { elementMesh } from "../model/element-mesh.ts"
import { flattenElements } from "./elements.ts"
import { buildPartModel } from "../model/model.ts"
import { SurfaceParams, generateSurface, type SurfaceStrategy } from "../operations/surface.ts"
import type { Stock as MachineStock, Tool, ToolKind } from "../tool.ts"
import { f3 } from "./common.ts"
import type { CadElement, Stock, ToolpathSettings } from "./schema.ts"

/** True when the element is a solid the surface engine can machine (a mesh, or a boolean of solids). */
export const isSolidElement = (e: CadElement): boolean =>
  String(e["type"]).startsWith("boolean-") || elementMesh(e as never, 0.05) !== undefined
  // A component or a group counts when something inside it is a solid.
  || flattenElements([e]).some((child) => child !== e && isSolidElement(child))

const TOOL_KINDS: Partial<Record<string, ToolKind>> = { endmill: "endmill", ballnose: "ballnose" }

const toolOf = (s: ToolpathSettings, warnings: string[]): Tool => {
  const kind = TOOL_KINDS[s.toolType]
  if (kind === undefined) warnings.push(`A ${s.toolType} tool cannot machine a surface; the path is computed for an end mill of the same diameter.`)
  return { id: "1", name: `${s.toolType} ${s.toolDiameter}`, kind: kind ?? "endmill", diameter: s.toolDiameter, flutes: s.flutes, maxRpm: Math.max(s.rpm, 1) }
}

/** The engine's moves as the panel writes them: modal words only where they change, `F` only when it changes. */
export const movesToGcode = (moves: ReadonlyArray<Move>): string => {
  let out = ""
  let at: { x: number; y: number; z: number } | undefined
  let feed: number | undefined
  const word = (letter: string, now: number, before: number | undefined): string => (before === undefined || f3(now) !== f3(before) ? ` ${letter}${f3(now)}` : "")
  for (const move of moves) {
    switch (move._tag) {
      case "Comment": out += `; ${move.text}\n`; break
      case "Dwell": out += `G4 P${move.seconds}\n`; break
      case "Rapid": {
        const words = `${word("X", move.to.x, at?.x)}${word("Y", move.to.y, at?.y)}${word("Z", move.to.z, at?.z)}`
        if (words !== "") out += `G0${words}\n`
        at = { ...move.to }
        break
      }
      case "Linear": {
        const words = `${word("X", move.to.x, at?.x)}${word("Y", move.to.y, at?.y)}${word("Z", move.to.z, at?.z)}`
        if (words !== "") out += `G1${words}${feed === move.feed ? "" : ` F${move.feed}`}\n`
        feed = move.feed
        at = { ...move.to }
        break
      }
      case "Arc": {
        const from = at ?? move.to
        out += `${move.clockwise ? "G2" : "G3"} X${f3(move.to.x)} Y${f3(move.to.y)}${f3(move.to.z) === f3(from.z) ? "" : ` Z${f3(move.to.z)}`} I${f3(move.center.x - from.x)} J${f3(move.center.y - from.y)}${feed === move.feed ? "" : ` F${move.feed}`}\n`
        feed = move.feed
        at = { ...move.to }
        break
      }
      case "Orient": {
        const words = [["A", move.a], ["B", move.b], ["C", move.c]].flatMap(([l, v]) => (typeof v === "number" ? [` ${l}${f3(v)}`] : [])).join("")
        if (words !== "") out += `G0${words}\n`
        break
      }
      case "Cycle": break
    }
  }
  return out
}

export interface SurfaceProgram {
  readonly gcode: string
  readonly warnings: ReadonlyArray<string>
}

/**
 * G-code for the solids `placed` (already in stock coordinates: highest face at the stock top, XY from the machine origin).
 * `stock` is the raw piece in the same coordinates; without one the part's own footprint plus the tool is used.
 * Returns `undefined` when none of the elements is a solid.
 */
export const surfaceProgram = (placed: ReadonlyArray<CadElement>, s: ToolpathSettings, stock: Stock | undefined, shift: { dx: number; dy: number }): SurfaceProgram | undefined => {
  const warnings: string[] = []
  // Roughing leaves stock to leave anyway, so its model can be coarse; a finishing pass follows the surface and needs a fine one.
  // A coarse grid only ever errs on the safe side (a path is never lower than the part), by at most slope x half a cell.
  const modelFor = (strategy: SurfaceStrategy) => {
    const cell = strategy === "roughing" || strategy === "rest"
      ? Math.min(0.5, Math.max(0.1, s.toolDiameter / 30))
      : Math.min(0.3, Math.max(0.05, s.tolerance * 5, s.toolDiameter / 60))
    return buildPartModel(placed as never, { cell, tolerance: Math.max(0.005, s.tolerance / 2), maxCells: 800_000 })
  }
  const models = new Map<SurfaceStrategy, NonNullable<ReturnType<typeof modelFor>>>()
  const partFor = (strategy: SurfaceStrategy) => {
    const key: SurfaceStrategy = strategy === "roughing" || strategy === "rest" ? "roughing" : "parallel"
    const hit = models.get(key)
    if (hit !== undefined) return hit
    const built = modelFor(key)!
    for (const w of built.warnings) warnings.push(w)
    models.set(key, built)
    return built
  }
  // Rest machining continues the tool before it. On a roughing that is the `rest` strategy; on a finishing strategy it restricts the
  // path to where the previous (larger) tool did not reach as low: pencil machining when that tool was a ball.
  const rest = s.useRestMachining && s.surfaceStrategy === "roughing"
  const restFinish = s.useRestMachining && (s.surfaceStrategy === "parallel" || s.surfaceStrategy === "waterline")
  const strategy: SurfaceStrategy = rest ? "rest" : s.surfaceStrategy
  const previousKind = s.toolType === "ballnose" ? "ballnose" : "endmill"
  const first = modelFor(strategy)
  if (first === undefined) return undefined
  const part = first
  models.set(strategy === "roughing" || strategy === "rest" ? "roughing" : "parallel", first)
  warnings.push(...part.warnings)
  if (part.skipped.length > 0) warnings.push(`Not machined as a surface (not solids): ${part.skipped.join(", ")}`)

  const tool = toolOf(s, warnings)
  const topZ = stock?.topZ ?? part.bounds.max[2]
  const reach = tool.diameter / 2 + 1
  const raw: MachineStock = stock !== undefined
    ? { x: stock.width, y: stock.height, z: stock.depth, origin: { x: stock.x + shift.dx - stock.width / 2, y: stock.y + shift.dy - stock.height / 2, z: topZ }, material: s.material }
    : {
        x: part.bounds.max[0] - part.bounds.min[0] + 2 * reach, y: part.bounds.max[1] - part.bounds.min[1] + 2 * reach, z: s.depth,
        origin: { x: part.bounds.min[0] - reach, y: part.bounds.min[1] - reach, z: topZ }, material: s.material
      }
  const heights = { clearanceHeight: topZ + 10, safeHeight: topZ + 5, retractHeight: topZ + 2 }
  const common = {
    ...heights, totalDepth: s.depth, stepdown: s.stepdown, feed: s.feedrate, plungeFeed: s.plungerate, spindleRpm: s.rpm,
    coolant: s.coolant ? "flood" : "off", stepover: s.stepover, climb: s.direction === "climb", tolerance: Math.max(s.tolerance, 0.001)
  }
  const run = (name: string, strategy: SurfaceStrategy, extra: Record<string, unknown>) => {
    const params = Schema.decodeUnknownSync(SurfaceParams)({ ...common, id: name, name, strategy, ...extra })
    const result = generateSurface(params, partFor(strategy), tool, raw)
    warnings.push(...result.warnings)
    return result
  }

  let gcode = `; 3D surface: ${placed.length} element(s) as one part model, ${strategy}${s.finishingPass ? " + finishing" : ""}\n`
  const finishes = s.finishingPass && s.surfaceStrategy === "roughing"
  const allowance = finishes ? s.finishingAllowance : 0
  if (rest) gcode += `; Rest machining: only what a ${f3(s.restToolDiameter)} mm tool left behind\n`
  if (s.surfaceClearing === "adaptive" && (strategy === "roughing" || strategy === "rest")) gcode += `; Adaptive clearing: radial depth of cut held at ${f3(s.adaptiveEngagement)} % of the tool diameter\n`
  if (restFinish) gcode += `; Rest finishing: only where a ${f3(s.restToolDiameter)} mm tool did not reach as low\n`
  const primary = run(finishes ? (rest ? "Rest roughing" : "Roughing") : strategy, strategy, {
    allowance, scallop: s.scallop, angle: s.rasterAngle, oneWay: s.rasterOneWay,
    clearing: s.surfaceClearing, engagement: s.adaptiveEngagement,
    ...(rest ? { restFrom: { diameter: s.restToolDiameter, kind: "endmill", allowance } } : {}),
    ...(restFinish ? { restFrom: { diameter: s.restToolDiameter, kind: previousKind, allowance: 0 } } : {})
  })
  gcode += movesToGcode(primary.toolpath.moves)
  if (finishes) {
    if (s.finishingStrategy === "spiral" || s.finishingStrategy === "radial") {
      warnings.push(`The ${s.finishingStrategy} finishing strategy is not available for surfaces; a parallel raster is used.`)
    }
    const waterline = s.finishingStrategy === "contour"
    const finish = run("Finishing", waterline ? "waterline" : "parallel", { allowance: 0, scallop: s.scallop, angle: s.rasterAngle, oneWay: s.rasterOneWay })
    gcode += `\n; Finishing pass (${waterline ? "waterline" : "parallel"}), ${f3(s.finishingAllowance)} mm left by the roughing\n`
    gcode += movesToGcode(finish.toolpath.moves)
  }
  return { gcode, warnings: [...new Set(warnings)] }
}
