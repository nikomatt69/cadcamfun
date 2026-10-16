/**
 * Static checks of a program against its set-up (spec 31 §6): the tool into the vise, clamps, parallels or table on a mill;
 * into the chuck jaws or the tailstock on a lathe; off the bed or above the build volume on a printer. They read the same
 * timeline and bodies the preview draws, so a red segment on screen and a finding for the assistant are the same fact.
 * Fast and conservative; never a replacement for the verification.
 */
import type { Vec3 } from "../../cad/vec.ts"
import { displayPoint } from "./frames.ts"
import { latheStockEnds, machineBodies, type Body } from "./machine-bodies.ts"
import type { MachineSetup } from "./machine-setup.ts"
import { pointOn, type Timeline } from "./timeline.ts"

export interface SetupFinding {
  readonly code: string
  readonly severity: "error" | "warning"
  readonly message: string
  /** Timeline move of the first occurrence. */
  readonly move: number
  readonly line?: number
  readonly bodyId?: string
  /** The tool, in program coordinates, where it was found. */
  readonly at: Vec3
  /** Moves with the same finding. */
  readonly count: number
  /** The body is an assumption of the preview (not configured): the finding is a warning to confirm the set-up. */
  readonly assumed: boolean
}

export interface ToolEnvelope {
  readonly radius: number
  /** Tip to holder face, mm: the length that can reach down past the stock. */
  readonly length: number
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000)

const ROLE_CODE: Partial<Record<Body["role"], string>> = { jaw: "MILL_INTO_VISE", "vise-base": "MILL_INTO_VISE", clamp: "MILL_INTO_CLAMP", parallel: "MILL_INTO_PARALLEL", table: "MILL_INTO_TABLE" }

export const checkSetup = (setup: MachineSetup, timeline: Timeline, tool: ToolEnvelope = { radius: 3, length: 50 }, hits?: Set<number>): ReadonlyArray<SetupFinding> => {
  const found = new Map<string, { -readonly [K in keyof SetupFinding]: SetupFinding[K] }>()
  const report = (key: string, f: Omit<SetupFinding, "count">) => {
    if (f.code !== "PRINTER_FIRST_LAYER_HIGH") hits?.add(f.move)
    const known = found.get(key)
    if (known) known.count++
    else found.set(key, { ...f, count: 1 })
  }
  // The first move starts from where the machine happened to be, which the program does not say: only its end is checked.
  const firstMove = timeline.moves.findIndex((m) => m.kind !== "dwell")
  const samples = (index: number, step: number, visit: (p: Vec3) => boolean) => {
    const move = timeline.moves[index]!
    if (index === firstMove) { visit(move.to); return }
    const length = Math.hypot(move.to.x - move.from.x, move.to.y - move.from.y, move.to.z - move.from.z) + (move.center ? Math.PI * Math.hypot(move.from.x - move.center.x, move.from.y - move.center.y) : 0)
    const n = Math.min(4000, Math.max(1, Math.ceil(length / step)))
    for (let k = 0; k <= n; k++) if (visit(pointOn(move, k / n))) return
  }
  if (setup.kind === "mill") {
    const obstacles = machineBodies(setup).filter((b) => b.obstacle && b.shape.type === "box")
    const r = Math.max(0.01, tool.radius)
    timeline.moves.forEach((move, i) => {
      if (move.kind === "dwell") return
      for (const body of obstacles) {
        if (body.shape.type !== "box") continue
        const { min, max } = body.shape
        samples(i, Math.max(0.25, r / 2), (p) => {
          // The tool is a vertical cylinder from its tip up `length`; it overlaps the box when both the plan and the height do.
          const dx = Math.max(min.x - p.x, 0, p.x - max.x), dy = Math.max(min.y - p.y, 0, p.y - max.y)
          if (Math.hypot(dx, dy) >= r - 1e-6 || p.z >= max.z - 1e-6 || p.z + tool.length <= min.z) return false
          const code = ROLE_CODE[body.role] ?? "MILL_INTO_FIXTURE"
          report(`${code}/${body.id}`, {
            code, severity: body.assumed ? "warning" : "error", bodyId: body.id, move: i, at: p, assumed: body.assumed,
            ...(move.state.line !== undefined ? { line: move.state.line } : {}),
            message: `${move.kind === "rapid" ? "A rapid" : "The tool"} ${body.role === "table" ? "goes below the table top" : `runs into the ${body.role.replace("-", " ")} "${body.id}"`} at X${fmt(p.x)} Y${fmt(p.y)} Z${fmt(p.z)}${body.assumed ? " (the workholding is assumed: set the real one to confirm)" : ""}`
          })
          return true
        })
      }
    })
  } else if (setup.kind === "lathe") {
    const { back, free } = latheStockEnds(setup)
    const stockR = setup.stock.diameter / 2
    const w = setup.workholding
    const jawFront = back + w.gripLength
    const jawOuter = w.kind === "collet" ? stockR + 8 : stockR + w.jawHeight
    const assumed = setup.assumed.includes("workholding")
    timeline.moves.forEach((move, i) => {
      if (move.kind === "dwell") return
      samples(i, 0.5, (p) => {
        const d = displayPoint(setup, p, move.state.xMode)
        const radius = Math.abs(d.z)
        const into = (d.x < jawFront && d.x > back - 90 && radius < jawOuter) || (d.x <= back && radius < w.chuckDiameter / 2)
        if (into) {
          report("LATHE_INTO_CHUCK", {
            code: "LATHE_INTO_CHUCK", severity: assumed ? "warning" : "error", bodyId: "chuck", move: i, at: p, assumed,
            ...(move.state.line !== undefined ? { line: move.state.line } : {}),
            message: `The tool reaches Z${fmt(p.z)} at X${fmt(p.x)}: inside the ${w.kind === "collet" ? "collet" : "chuck jaws"} (they grip the bar up to Z${fmt(jawFront)})${assumed ? "; the grip length is assumed, set the real one" : ""}`
          })
          return true
        }
        if (w.tailstock && d.x > free && radius < 18) {
          report("LATHE_INTO_TAILSTOCK", { code: "LATHE_INTO_TAILSTOCK", severity: "error", bodyId: "tailstock", move: i, at: p, assumed, ...(move.state.line !== undefined ? { line: move.state.line } : {}), message: `The tool reaches the tailstock centre at Z${fmt(p.z)}` })
          return true
        }
        return false
      })
    })
  } else {
    const { width, depth, origin } = setup.bed
    const x0 = origin === "corner" ? 0 : -width / 2, y0 = origin === "corner" ? 0 : -depth / 2
    let first = true
    timeline.moves.forEach((move, i) => {
      if (move.kind !== "feed" || move.state.extrude <= 1e-9) return
      const line = move.state.line !== undefined ? { line: move.state.line } : {}
      if (first) {
        first = false
        const z = Math.max(move.from.z, move.to.z)
        if (z > 2 * setup.layerHeight + 1e-9) report("PRINTER_FIRST_LAYER_HIGH", { code: "PRINTER_FIRST_LAYER_HIGH", severity: "warning", move: i, at: move.to, assumed: false, ...line, message: `The first extrusion is at Z${fmt(z)}, more than two layers (${fmt(2 * setup.layerHeight)} mm) above the bed: it will not stick` })
      }
      const off = [move.from, move.to].find((p) => p.x < x0 - 1e-6 || p.x > x0 + width + 1e-6 || p.y < y0 - 1e-6 || p.y > y0 + depth + 1e-6)
      if (off !== undefined) report("PRINTER_OFF_BED", { code: "PRINTER_OFF_BED", severity: "error", move: i, at: off, assumed: false, ...line, message: `Extruding at X${fmt(off.x)} Y${fmt(off.y)}, outside the ${width} x ${depth} mm bed (origin ${origin})` })
      const high = [move.from, move.to].find((p) => p.z > setup.buildHeight + 1e-6)
      if (high !== undefined) report("PRINTER_ABOVE_VOLUME", { code: "PRINTER_ABOVE_VOLUME", severity: "error", move: i, at: high, assumed: false, ...line, message: `Extruding at Z${fmt(high.z)}, above the ${setup.buildHeight} mm build height` })
    })
  }
  return [...found.values()]
}

/** Timeline moves that run into a body (every finding but the first-layer height), for the red segments of the preview. */
export const collidingMoves = (setup: MachineSetup, timeline: Timeline, tool?: ToolEnvelope): ReadonlySet<number> => {
  const hits = new Set<number>()
  checkSetup(setup, timeline, tool, hits)
  return hits
}
