import { Schema } from "effect"

/** A machine motion. Positions are absolute, in mm; Z=0 is the stock top. */
export const Move = Schema.Union([
  Schema.TaggedStruct("Rapid", { x: Schema.Finite, y: Schema.Finite, z: Schema.Finite }),
  Schema.TaggedStruct("Feed", { x: Schema.Finite, y: Schema.Finite, z: Schema.Finite, f: Schema.Finite }),
])
export type Move = typeof Move.Type

export const Toolpath = Schema.Struct({
  operationId: Schema.String,
  name: Schema.String,
  toolNumber: Schema.Int,
  toolName: Schema.String,
  toolDiameter: Schema.Finite,
  rpm: Schema.Finite,
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
