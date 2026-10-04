import type { Machine } from "./machine"
import { expand, type Move, type Program } from "./toolpath"

export interface Stats {
  readonly moves: number
  readonly cutDistance: number
  readonly rapidDistance: number
  /** Estimated machining time in seconds (ignores acceleration and tool changes). */
  readonly estimatedSeconds: number
  readonly bounds?: {
    readonly min: { x: number; y: number; z: number }
    readonly max: { x: number; y: number; z: number }
  }
}

/** Distance and time statistics for a list of moves, starting at the origin. */
export const analyzeMoves = (moves: ReadonlyArray<Move>, rapidFeed: number, start = { x: 0, y: 0, z: 0 }): Stats => {
  let cut = 0
  let rapid = 0
  let seconds = 0
  let p = start
  const min = { x: Infinity, y: Infinity, z: Infinity }
  const max = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const m of expand(moves)) {
    const d = Math.hypot(m.x - p.x, m.y - p.y, m.z - p.z)
    if (m._tag === "Rapid") {
      rapid += d
      seconds += (d / rapidFeed) * 60
    } else {
      cut += d
      if (m.f > 0) seconds += (d / m.f) * 60
    }
    for (const k of ["x", "y", "z"] as const) {
      min[k] = Math.min(min[k], m[k])
      max[k] = Math.max(max[k], m[k])
    }
    p = m
  }
  return {
    moves: expand(moves).length,
    cutDistance: cut,
    rapidDistance: rapid,
    estimatedSeconds: seconds,
    bounds: moves.length > 0 ? { min, max } : undefined,
  }
}

export const analyzeProgram = (program: Program, machine: Pick<Machine, "rapidFeed">): Stats =>
  analyzeMoves(
    program.toolpaths.flatMap((t) => t.moves),
    machine.rapidFeed,
  )

/** Moves that would leave the machine's work envelope (machine zero at XY min, Z at stock top). */
export const outOfBounds = (moves: ReadonlyArray<Move>, machine: Pick<Machine, "workArea">): ReadonlyArray<Move> =>
  expand(moves).filter(
    (m) => m.x < 0 || m.y < 0 || m.x > machine.workArea.x || m.y > machine.workArea.y || -m.z > machine.workArea.z,
  )
