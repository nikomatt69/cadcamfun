import { Effect, Schema } from "effect"
import { Doc, Elements, Geometry, type CadDocument, type Element, type Vec2 } from "@cadcamfun/core"
import * as Feeds from "./feeds"
import { CamLibrary, type NotInLibrary } from "./library"
import type { Machine } from "./machine"
import type { Material } from "./material"
import { ccw, cw, offsetPolygons } from "./offset"
import type { Operation, Setup } from "./operation"
import type { Tool } from "./tool"
import { MoveBuilder, depthLevels, type Program, type Toolpath } from "./toolpath"

export class ToolpathError extends Schema.TaggedError<ToolpathError>()("ToolpathError", {
  operationId: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `Operation ${this.operationId}: ${this.reason}`
  }
}

export interface OperationContext {
  readonly doc: CadDocument
  readonly tool: Tool
  readonly material: Material
  readonly machine: Machine
  readonly safeZ: number
  readonly stock?: Setup["stock"]
}

interface Resolved {
  readonly feed: number
  readonly plunge: number
  readonly rpm: number
  readonly levels: ReadonlyArray<number>
}

const fail = (op: Operation, reason: string) => new ToolpathError({ operationId: op.id, reason })

const resolve = (ctx: OperationContext, op: Operation): Resolved => {
  const f = Feeds.compute(ctx.tool, ctx.material, ctx.machine)
  return {
    feed: op.feed ?? f.feed,
    plunge: op.plunge ?? f.plunge,
    rpm: op.rpm ?? f.rpm,
    levels: depthLevels(op.depth, op.stepDown ?? f.stepDown),
  }
}

const selectElements = Effect.fnUntraced(function* (ctx: OperationContext, op: Operation) {
  const out: Array<Element> = []
  for (const id of op.elementIds) {
    const e = Doc.findElement(ctx.doc, id)
    if (!e) return yield* fail(op, `element ${id} not found`)
    out.push(e)
  }
  return out
})

/** Rotate a closed ring so it starts at the vertex nearest to `p`. */
const startNearest = (ring: ReadonlyArray<Vec2>, p: Vec2 | undefined): Array<Vec2> => {
  if (!p || ring.length === 0) return [...ring]
  let best = 0
  let bestD = Infinity
  ring.forEach((q, i) => {
    const d = Geometry.distance(p, q)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return [...ring.slice(best), ...ring.slice(0, best)]
}

/** Cut a closed ring at every depth level, staying down between levels. */
const cutRing = (b: MoveBuilder, ring: ReadonlyArray<Vec2>, r: Resolved, safeZ: number) => {
  const start = ring[0]!
  b.rapid(start.x, start.y, safeZ)
  for (const z of r.levels) {
    b.feed(start.x, start.y, z, r.plunge)
    for (const p of ring.slice(1)) b.feed(p.x, p.y, z, r.feed)
    b.feed(start.x, start.y, z, r.feed)
  }
  b.rapid(start.x, start.y, safeZ)
}

/** Cut an open path, reversing direction on each level to avoid retracts. */
const cutOpen = (b: MoveBuilder, path: ReadonlyArray<Vec2>, r: Resolved, safeZ: number) => {
  let pts = [...path]
  b.rapid(pts[0]!.x, pts[0]!.y, safeZ)
  for (const z of r.levels) {
    b.feed(pts[0]!.x, pts[0]!.y, z, r.plunge)
    for (const p of pts.slice(1)) b.feed(p.x, p.y, z, r.feed)
    pts = pts.reverse()
  }
  const end = b.position!
  b.rapid(end.x, end.y, safeZ)
}

const profile = Effect.fnUntraced(function* (
  ctx: OperationContext,
  op: Extract<Operation, { _tag: "Profile" }>,
  r: Resolved,
) {
  const elements = yield* selectElements(ctx, op)
  const b = new MoveBuilder()
  const radius = ctx.tool.diameter / 2
  for (const element of elements) {
    for (const path of Elements.toPaths(element)) {
      if (!path.closed) {
        if (path.points.length < 2) continue
        cutOpen(b, path.points, r, ctx.safeZ)
        continue
      }
      const delta = op.side === "outside" ? radius : op.side === "inside" ? -radius : 0
      const rings = delta === 0 ? [[...path.points]] : offsetPolygons([path.points], delta)
      if (rings.length === 0) return yield* fail(op, `tool Ø${ctx.tool.diameter} does not fit inside ${element._tag}`)
      // Spindle CW: climb = clockwise around outside walls, counter-clockwise inside.
      const clockwise = (op.side === "inside") !== (op.direction === "climb")
      for (const ring of rings) cutRing(b, startNearest(clockwise ? cw(ring) : ccw(ring), b.position), r, ctx.safeZ)
    }
  }
  return b.moves
})

const pocket = Effect.fnUntraced(function* (
  ctx: OperationContext,
  op: Extract<Operation, { _tag: "Pocket" }>,
  r: Resolved,
) {
  const elements = yield* selectElements(ctx, op)
  const closed = elements.flatMap((e) => Elements.toPaths(e)).filter((p) => p.closed)
  if (closed.length === 0) return yield* fail(op, "pocketing needs closed shapes")
  const b = new MoveBuilder()
  const radius = ctx.tool.diameter / 2
  const step = ctx.tool.diameter * op.stepOver
  for (const path of closed) {
    // Concentric rings from the wall inwards, then cut from the centre outwards.
    const rings: Array<Array<Vec2>> = []
    for (let offset = radius; ; offset += step) {
      const next = offsetPolygons([path.points], -offset)
      if (next.length === 0) break
      rings.push(...next)
      if (rings.length > 10_000) return yield* fail(op, "too many pocket passes")
    }
    if (rings.length === 0) return yield* fail(op, `tool Ø${ctx.tool.diameter} is too large for this pocket`)
    rings.reverse()
    const ordered = (ring: Array<Vec2>) => (op.direction === "climb" ? ccw(ring) : cw(ring))
    for (const z of r.levels) {
      let first = true
      for (const ring of rings) {
        const loop = startNearest(ordered(ring), b.position)
        const start = loop[0]!
        const here = b.position
        // Step over at depth when close enough; otherwise retract and re-enter.
        if (first || !here || Geometry.distance(here, start) > ctx.tool.diameter) {
          b.rapid(here?.x ?? start.x, here?.y ?? start.y, ctx.safeZ)
          b.rapid(start.x, start.y, ctx.safeZ)
          b.feed(start.x, start.y, z, r.plunge)
        } else {
          b.feed(start.x, start.y, z, r.feed)
        }
        for (const p of loop.slice(1)) b.feed(p.x, p.y, z, r.feed)
        b.feed(start.x, start.y, z, r.feed)
        first = false
      }
      const end = b.position!
      b.rapid(end.x, end.y, ctx.safeZ)
    }
  }
  return b.moves
})

const drillPoints = (elements: ReadonlyArray<Element>): Array<Vec2> =>
  elements.flatMap((e): Array<Vec2> => {
    switch (e._tag) {
      case "Point":
        return [e.position]
      case "Circle":
      case "Arc":
        return [e.center]
      case "Cylinder":
        return [{ x: e.base.x, y: e.base.y }]
      default:
        return []
    }
  })

const drill = Effect.fnUntraced(function* (
  ctx: OperationContext,
  op: Extract<Operation, { _tag: "Drill" }>,
  r: Resolved,
) {
  const elements = yield* selectElements(ctx, op)
  const remaining = drillPoints(elements)
  if (remaining.length === 0) return yield* fail(op, "drilling needs points or circles")
  const b = new MoveBuilder()
  const retract = Math.min(1, ctx.safeZ)
  let here: Vec2 = { x: 0, y: 0 }
  while (remaining.length > 0) {
    // Nearest-neighbour ordering keeps rapids short.
    let idx = 0
    remaining.forEach((p, i) => {
      if (Geometry.distance(here, p) < Geometry.distance(here, remaining[idx]!)) idx = i
    })
    const p = remaining.splice(idx, 1)[0]!
    b.rapid(p.x, p.y, ctx.safeZ).rapid(p.x, p.y, retract)
    if (op.peck > 0) {
      for (let d = op.peck; ; d += op.peck) {
        const z = -Math.min(op.depth, d)
        b.feed(p.x, p.y, z, r.plunge)
        if (-z >= op.depth) break
        b.rapid(p.x, p.y, retract).rapid(p.x, p.y, z + 0.2)
      }
    } else {
      b.feed(p.x, p.y, -op.depth, r.plunge)
    }
    b.rapid(p.x, p.y, ctx.safeZ)
    here = p
  }
  return b.moves
})

const engrave = Effect.fnUntraced(function* (
  ctx: OperationContext,
  op: Extract<Operation, { _tag: "Engrave" }>,
  r: Resolved,
) {
  const elements = yield* selectElements(ctx, op)
  const b = new MoveBuilder()
  for (const path of elements.flatMap((e) => Elements.toPaths(e))) {
    if (path.points.length < 2) continue
    if (path.closed) cutRing(b, startNearest(path.points, b.position), r, ctx.safeZ)
    else cutOpen(b, path.points, r, ctx.safeZ)
  }
  return b.moves
})

const facing = Effect.fnUntraced(function* (
  ctx: OperationContext,
  op: Extract<Operation, { _tag: "Facing" }>,
  r: Resolved,
) {
  const elements = yield* selectElements(ctx, op)
  const area =
    elements.length > 0
      ? Doc.bounds(ctx.doc, elements)
      : ctx.stock && {
          min: ctx.stock.origin,
          max: { x: ctx.stock.origin.x + ctx.stock.size.x, y: ctx.stock.origin.y + ctx.stock.size.y },
        }
  if (!area) return yield* fail(op, "facing needs elements or a stock definition")
  const radius = ctx.tool.diameter / 2
  const step = ctx.tool.diameter * op.stepOver
  const x0 = area.min.x - radius
  const x1 = area.max.x + radius
  const rows: Array<number> = []
  for (let y = area.min.y; y < area.max.y + 1e-9; y += step) rows.push(y)
  if (rows[rows.length - 1]! < area.max.y - 1e-9) rows.push(area.max.y)
  const b = new MoveBuilder()
  for (const z of r.levels) {
    b.rapid(x0, rows[0]!, ctx.safeZ).feed(x0, rows[0]!, z, r.plunge)
    rows.forEach((y, i) => {
      const [from, to] = i % 2 === 0 ? [x0, x1] : [x1, x0]
      b.feed(from, y, z, r.feed).feed(to, y, z, r.feed)
    })
    const end = b.position!
    b.rapid(end.x, end.y, ctx.safeZ)
  }
  return b.moves
})

/** Generate the toolpath for one operation. */
export const generateOperation = Effect.fn("cam.generateOperation")(function* (ctx: OperationContext, op: Operation) {
  if (op.depth > ctx.tool.fluteLength) {
    return yield* fail(op, `depth ${op.depth} mm exceeds flute length ${ctx.tool.fluteLength} mm of ${ctx.tool.name}`)
  }
  if (op._tag === "Drill" && ctx.tool.kind !== "drill" && ctx.tool.kind !== "flat-endmill") {
    return yield* fail(op, `${ctx.tool.kind} cannot drill`)
  }
  const r = resolve(ctx, op)
  const moves =
    op._tag === "Profile"
      ? yield* profile(ctx, op, r)
      : op._tag === "Pocket"
        ? yield* pocket(ctx, op, r)
        : op._tag === "Drill"
          ? yield* drill(ctx, op, r)
          : op._tag === "Engrave"
            ? yield* engrave(ctx, op, r)
            : yield* facing(ctx, op, r)
  const toolpath: Toolpath = {
    operationId: op.id,
    name: op.name ?? `${op._tag} ${op.id}`,
    toolNumber: ctx.tool.number,
    toolName: ctx.tool.name,
    toolDiameter: ctx.tool.diameter,
    rpm: r.rpm,
    moves,
  }
  return toolpath
})

/** Generate a full machine-independent program for a document's CAM setup. */
export const generateProgram = Effect.fn("cam.generateProgram")(function* (
  doc: CadDocument,
  setup: Setup,
): Effect.fn.Return<Program, ToolpathError | NotInLibrary, CamLibrary> {
  const library = yield* CamLibrary
  const machine = yield* library.machine(setup.machineId)
  const material = yield* library.material(setup.materialId)
  const toolpaths: Array<Toolpath> = []
  for (const op of setup.operations) {
    const tool = yield* library.tool(op.toolId)
    toolpaths.push(
      yield* generateOperation({ doc, tool, material, machine, safeZ: setup.safeZ, stock: setup.stock }, op),
    )
  }
  return { name: doc.name, units: doc.units, safeZ: setup.safeZ, toolpaths }
})
