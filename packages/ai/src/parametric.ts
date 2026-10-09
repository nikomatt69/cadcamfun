/** Validated boundary for the existing feature-history engine; no second modeller. */
import { z } from "zod"
import { rebuild, meshVolume, type History } from "@cadcamfun/core"

const id = z.string().trim().min(1).max(100)
const n = z.number().finite()
export const dimensionSchema = z.union([n, z.string().trim().min(1).max(200)])
const plane = z.enum(["XY", "YZ", "ZX"])
const operation = z.enum(["new", "union", "subtract", "intersect"])
const pair = z.tuple([dimensionSchema, dimensionSchema])
const triple = z.tuple([dimensionSchema, dimensionSchema, dimensionSchema])
const entity = z.discriminatedUnion("kind", [
  z.object({ id, kind: z.literal("point"), x: n, y: n }),
  z.object({ id, kind: z.literal("line"), p1: id, p2: id }),
  z.object({ id, kind: z.literal("circle"), center: id, radius: n.positive() }),
  z.object({ id, kind: z.literal("arc"), center: id, start: id, end: id })
])
const named = { id: id.optional() }
const unaryLine = (type: "horizontal" | "vertical") => z.object({ ...named, type: z.literal(type), line: id })
const two = (type: "coincident" | "horizontalPoints" | "verticalPoints" | "parallel" | "perpendicular" | "equalLength" | "equalRadius" | "concentric") => z.object({ ...named, type: z.literal(type), a: id, b: id })
const distance = (type: "distance" | "distanceX" | "distanceY" | "angle") => z.object({ ...named, type: z.literal(type), a: id, b: id, value: dimensionSchema })
const pointLine = (type: "pointOnLine" | "midpoint") => z.object({ ...named, type: z.literal(type), point: id, line: id })
const radius = (type: "radius" | "diameter") => z.object({ ...named, type: z.literal(type), circle: id, value: dimensionSchema })
const constraint = z.discriminatedUnion("type", [
  z.object({ ...named, type: z.literal("fixed"), point: id, x: n.optional(), y: n.optional() }),
  unaryLine("horizontal"), unaryLine("vertical"), two("coincident"), two("horizontalPoints"), two("verticalPoints"),
  two("parallel"), two("perpendicular"), two("equalLength"), two("equalRadius"), two("concentric"),
  distance("distance"), distance("distanceX"), distance("distanceY"), distance("angle"),
  z.object({ ...named, type: z.literal("length"), line: id, value: dimensionSchema }), radius("radius"), radius("diameter"),
  pointLine("pointOnLine"), pointLine("midpoint"),
  z.object({ ...named, type: z.literal("pointOnCircle"), point: id, circle: id }),
  z.object({ ...named, type: z.literal("symmetric"), a: id, b: id, line: id }),
  z.object({ ...named, type: z.literal("tangentLineCircle"), line: id, circle: id }),
  z.object({ ...named, type: z.literal("tangentCircles"), a: id, b: id, internal: z.boolean().optional() })
])
const targets = z.array(id).min(1).max(40).optional()
const feature = z.discriminatedUnion("type", [
  z.object({ id, type: z.literal("sketch"), plane, offset: dimensionSchema.optional(), sketch: z.object({ entities: z.array(entity).min(1).max(200), constraints: z.array(constraint).max(200) }) }),
  z.object({ id, type: z.literal("extrude"), sketch: id, depth: dimensionSchema, direction: z.enum(["up", "down", "symmetric"]).optional(), operation, targets }),
  z.object({ id, type: z.literal("revolve"), sketch: id, axis: z.union([z.enum(["x", "y"]), z.object({ line: id })]), angle: dimensionSchema.optional(), operation, targets }),
  z.object({ id, type: z.literal("hole"), plane, offset: dimensionSchema.optional(), at: pair, diameter: dimensionSchema, depth: dimensionSchema, targets }),
  z.object({ id, type: z.literal("pattern"), feature: id, kind: z.enum(["linear", "circular"]), count: dimensionSchema, step: triple.optional(), centre: pair.optional(), span: dimensionSchema.optional() })
])

export const parameterSchema = z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,79}$/), dimensionSchema).refine((p) => Object.keys(p).length <= 80, "At most 80 parameters")
export const historySchema = z.object({ parameters: parameterSchema, features: z.array(feature).min(1).max(80) }).superRefine((history, ctx) => {
  const seen = new Map<string, z.infer<typeof feature>>()
  const issue = (index: number, message: string) => ctx.addIssue({ code: "custom", path: ["features", index], message })
  history.features.forEach((f, index) => {
    if (seen.has(f.id)) issue(index, `Duplicate feature id '${f.id}'`)
    if ((f.type === "extrude" || f.type === "revolve") && seen.get(f.sketch)?.type !== "sketch") issue(index, `Sketch '${f.sketch}' must precede this feature`)
    if (f.type === "pattern" && f.kind === "linear" && f.step === undefined) issue(index, "Linear patterns need step [dx,dy,dz]")
    if (f.type === "pattern" && !["extrude", "revolve", "hole"].includes(seen.get(f.feature)?.type ?? "")) issue(index, `Pattern source '${f.feature}' must be an earlier extrude, revolve or hole`)
    if ("targets" in f && f.targets?.some((t) => !seen.has(t))) issue(index, "Targets must name earlier body features")
    if (f.type === "sketch") {
      const entities = new Map(f.sketch.entities.map((e) => [e.id, e]))
      if (entities.size !== f.sketch.entities.length) issue(index, "Duplicate sketch entity ids")
      const point = (ref: string) => entities.get(ref)?.kind === "point"
      for (const e of f.sketch.entities) {
        const refs = e.kind === "line" ? [e.p1, e.p2] : e.kind === "circle" ? [e.center] : e.kind === "arc" ? [e.center, e.start, e.end] : []
        if (refs.some((ref) => !point(ref))) issue(index, `Entity '${e.id}' references a missing point`)
      }
      for (const c of f.sketch.constraints) for (const key of ["point", "line", "circle", "a", "b"] as const) {
        const ref = (c as Record<string, unknown>)[key]
        if (typeof ref !== "string") continue
        const found = entities.get(ref)
        if (found === undefined || (key === "point" && found.kind !== "point") || (key === "line" && found.kind !== "line") || (key === "circle" && found.kind !== "circle" && found.kind !== "arc")) issue(index, `Constraint references invalid ${key} '${ref}'`)
      }
    }
    seen.set(f.id, f)
  })
})

/** JSON-safe metrics; meshes stay in the engine/Three.js renderer. */
export const parametricReport = (history: History) => {
  const result = rebuild(history)
  let volume = 0
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const body of result.bodies) {
    volume += Math.abs(meshVolume(body.mesh))
    const p = body.mesh.positions
    for (let i = 0; i < p.length; i += 3) for (const [axis, offset] of [["x", 0], ["y", 1], ["z", 2]] as const) {
      min[axis] = Math.min(min[axis], p[i + offset]!); max[axis] = Math.max(max[axis], p[i + offset]!)
    }
  }
  const finite = Number.isFinite(volume) && (result.bodies.length === 0 || Object.values({ ...min, maxX: max.x, maxY: max.y, maxZ: max.z }).every(Number.isFinite))
  return {
    ok: finite && result.bodies.length > 0 && volume > 0 && !result.issues.some((i) => i.severity === "error"),
    parameters: result.parameters, bodyCount: result.bodies.length, volumeMm3: finite ? volume : null,
    bounds: result.bodies.length > 0 && finite ? { min, max } : null,
    issues: result.issues.slice(0, 40), omittedIssues: Math.max(0, result.issues.length - 40),
    sketches: Object.entries(result.sketches).map(([id, s]) => ({ id, status: s.solve.status, degreesOfFreedom: s.solve.dof, residual: s.solve.residual }))
  }
}
