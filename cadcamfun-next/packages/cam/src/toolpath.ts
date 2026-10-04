import { Schema } from "effect"

export const Rapid = Schema.TaggedStruct("Rapid", { x: Schema.Finite, y: Schema.Finite, z: Schema.Finite })
export const Feed = Schema.TaggedStruct("Feed", {
  x: Schema.Finite,
  y: Schema.Finite,
  z: Schema.Finite,
  f: Schema.Finite,
})
/**
 * A canned drilling cycle at (x, y): rapid to `r`, feed to `z` (pecking by `peck` when > 0),
 * retract to `r`. Controllers with canned cycles get G81/G83; others get explicit moves.
 */
export const DrillCycle = Schema.TaggedStruct("DrillCycle", {
  x: Schema.Finite,
  y: Schema.Finite,
  z: Schema.Finite,
  r: Schema.Finite,
  peck: Schema.Finite,
  f: Schema.Finite,
})

/** A program block. Positions are absolute, in mm; Z=0 is the stock top. */
export const Move = Schema.Union([Rapid, Feed, DrillCycle])
export type Move = typeof Move.Type
export type Motion = typeof Rapid.Type | typeof Feed.Type
export type DrillCycle = typeof DrillCycle.Type

/**
 * Explicit moves of a drilling cycle (what the controller does for G98 G81/G83): rapid to the
 * hole at the initial height, down to R, drill, and return to the initial height.
 */
export const expandCycle = (c: DrillCycle, initialZ: number = c.r): Array<Motion> => {
  const top = Math.max(initialZ, c.r)
  const out: Array<Motion> = [
    { _tag: "Rapid", x: c.x, y: c.y, z: top },
    { _tag: "Rapid", x: c.x, y: c.y, z: c.r },
  ]
  if (c.peck > 0) {
    for (let d = c.peck; ; d += c.peck) {
      const z = Math.max(c.z, -d)
      out.push({ _tag: "Feed", x: c.x, y: c.y, z, f: c.f })
      if (z <= c.z) break
      out.push({ _tag: "Rapid", x: c.x, y: c.y, z: c.r }, { _tag: "Rapid", x: c.x, y: c.y, z: z + 0.2 })
    }
  } else out.push({ _tag: "Feed", x: c.x, y: c.y, z: c.z, f: c.f })
  out.push({ _tag: "Rapid", x: c.x, y: c.y, z: top })
  return out
}

/** Flatten cycles into plain rapids and feeds (for simulation, rendering and statistics). */
export const expand = (moves: ReadonlyArray<Move>): Array<Motion> => {
  const out: Array<Motion> = []
  let z = 0
  for (const m of moves) {
    if (m._tag === "DrillCycle") out.push(...expandCycle(m, z))
    else {
      out.push(m)
      z = m.z
    }
  }
  return out
}

export const Toolpath = Schema.Struct({
  operationId: Schema.String,
  name: Schema.String,
  toolNumber: Schema.Int,
  toolName: Schema.String,
  toolDiameter: Schema.Finite,
  rpm: Schema.Finite,
  coolant: Schema.optional(Schema.Literals(["none", "flood", "mist"])),
  moves: Schema.Array(Move),
})
export type Toolpath = typeof Toolpath.Type

/** Machine-independent CAM output; post-processors turn it into controller G-code. */
export const Program = Schema.Struct({
  name: Schema.String,
  units: Schema.Literals(["mm", "inch"]),
  safeZ: Schema.Finite,
  toolpaths: Schema.Array(Toolpath),
})
export type Program = typeof Program.Type

export interface Position {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** Small mutable builder that skips redundant moves. */
export class MoveBuilder {
  readonly moves: Array<Move> = []

  cycle(c: Omit<DrillCycle, "_tag">): this {
    this.moves.push({ _tag: "DrillCycle", ...c })
    // G98: the cycle returns to the height it started from.
    this.pos = { x: c.x, y: c.y, z: Math.max(this.pos?.z ?? c.r, c.r) }
    return this
  }
  private pos: Position | undefined

  rapid(x: number, y: number, z: number): this {
    if (this.pos && same(this.pos, { x, y, z })) return this
    this.moves.push({ _tag: "Rapid", x, y, z })
    this.pos = { x, y, z }
    return this
  }

  feed(x: number, y: number, z: number, f: number): this {
    if (this.pos && same(this.pos, { x, y, z })) return this
    this.moves.push({ _tag: "Feed", x, y, z, f })
    this.pos = { x, y, z }
    return this
  }

  get position(): Position | undefined {
    return this.pos
  }
}

const same = (a: Position, b: Position) =>
  Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.z - b.z) < 1e-6

/** Depth levels from 0 down to -depth, at most `stepDown` apart. */
export const depthLevels = (depth: number, stepDown: number): Array<number> => {
  const passes = Math.max(1, Math.ceil(depth / stepDown - 1e-9))
  return Array.from({ length: passes }, (_, i) => -Math.min(depth, (depth * (i + 1)) / passes))
}
