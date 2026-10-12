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
  z.object({ id, kind: z.literal("point"), x: n, y: n }).describe("Sketch point: discriminator kind, numeric x/y in mm; parameterize through constraints."),
  z.object({ id, kind: z.literal("line"), p1: id, p2: id }).describe("Sketch line: kind, p1/p2 are IDs of points in this sketch, not coordinates."),
  z.object({ id, kind: z.literal("circle"), center: id, radius: n.positive() }).describe("Sketch circle: kind, center is a point ID; radius is a positive number in mm."),
  z.object({ id, kind: z.literal("arc"), center: id, start: id, end: id }).describe("Sketch arc: kind, center/start/end are point IDs in this sketch.")
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
/** Features whose tool a pattern or a mirror may copy. */
const TOOL_SOURCES: ReadonlyArray<string> = ["extrude", "revolve", "hole", "sweep", "loft", "mirror"]
const BODY_FEATURES: ReadonlyArray<string> = ["extrude", "revolve", "sweep", "loft"]
const treatmentStyle = z.enum(["chamfer", "fillet"])
const edgeTreatment = z.object({ style: treatmentStyle, size: dimensionSchema, ends: z.enum(["top", "bottom", "both"]).optional(), holes: z.boolean().optional() })
  .describe("Break the edges round the end faces of the extrusion: chamfer (straight bevel) or fillet (quarter-round of radius size). ends defaults to both; holes also breaks the rim of the holes.")
const cornerTreatment = z.object({ style: treatmentStyle, size: dimensionSchema })
  .describe("Round (fillet) or bevel (chamfer) the sharp vertical corners of the sketch profile before extruding. Size is the radius or the setback in mm.")
const feature = z.discriminatedUnion("type", [
  z.object({ id, type: z.literal("sketch"), plane, offset: dimensionSchema.optional(), sketch: z.object({ entities: z.array(entity).min(1).max(200), constraints: z.array(constraint).max(200) }) }),
  z.object({ id, type: z.literal("extrude"), sketch: id, depth: dimensionSchema, direction: z.enum(["up", "down", "symmetric"]).optional(), operation, targets, edge: edgeTreatment.optional(), corner: cornerTreatment.optional(), taper: dimensionSchema.optional() }),
  z.object({ id, type: z.literal("revolve"), sketch: id, axis: z.union([z.enum(["x", "y"]), z.object({ line: id })]), angle: dimensionSchema.optional(), operation, targets }),
  z.object({
    id, type: z.literal("hole"), plane, offset: dimensionSchema.optional(), at: pair, diameter: dimensionSchema, depth: dimensionSchema, targets,
    kind: z.enum(["simple", "counterbore", "countersink"]).optional().describe("simple (default), counterbore (flat recess for a screw head: needs headDiameter and headDepth) or countersink (cone for a flat head: needs headDiameter; angle is the included cone angle, default 90)."),
    headDiameter: dimensionSchema.optional(), headDepth: dimensionSchema.optional(), angle: dimensionSchema.optional()
  }),
  z.object({
    id, type: z.literal("pattern"), feature: id, kind: z.enum(["linear", "circular", "grid"]), count: dimensionSchema, step: triple.optional(), centre: pair.optional(), span: dimensionSchema.optional(),
    countB: dimensionSchema.optional().describe("grid only: the number of rows (count is the number along step)."), stepB: triple.optional().describe("grid only: the offset between two rows [dx,dy,dz].")
  }),
  z.object({ id, type: z.literal("sweep"), profile: id, path: id, operation, targets, bendRadius: dimensionSchema.optional() })
    .describe("Sweep the closed profile of an earlier sketch along the path of another sketch (ONE open chain of lines/arcs, or one closed loop). The centre of the profile rides the start of the path; loops inside loops are holes (a hollow tube is two circles)."),
  z.object({ id, type: z.literal("loft"), sections: z.array(id).min(2).max(12), smooth: z.boolean().optional(), operation, targets })
    .describe("Loft a solid through the largest closed loop of two or more earlier sketches, in order. Sections are resampled to the same number of points; smooth passes a curve through them instead of straight spans."),
  z.object({ id, type: z.literal("shell"), feature: id, thickness: dimensionSchema, open: z.enum(["none", "top", "bottom", "both"]).optional(), targets })
    .describe("Hollow out an earlier extrude, full revolve or sweep with uniform walls of thickness mm; open leaves the end faces open (a cup, a tube). Not for tapered extrudes or Boolean results."),
  z.object({
    id, type: z.literal("fillet"), radius: dimensionSchema, style: z.enum(["fillet", "chamfer"]).optional(), targets,
    edges: z.object({
      parallel: z.enum(["x", "y", "z"]).optional(), kind: z.enum(["convex", "concave", "both"]).optional(), minLength: dimensionSchema.optional(), curved: z.boolean().optional(),
      within: z.object({ min: triple, max: triple }).optional()
    }).optional().describe("Which edges: parallel to an axis, convex/concave (default convex), longer than minLength, wholly inside the box within {min,max}; curved:true also takes rims of curved surfaces (slow, off by default). No selection = every convex edge.")
  }).describe("Round (fillet radius) or bevel (chamfer setback) the edges between planar faces that meet at 25 degrees or more, on the bodies built so far. Read the issues: a size wider than the faces is refused."),
  z.object({ id, type: z.literal("mirror"), feature: id, plane, offset: dimensionSchema.optional() }).describe("Mirror the tool of an earlier extrude, revolve, hole or mirror through a plane: XY reflects Z, YZ reflects X, ZX reflects Y, at offset along the plane normal.")
])

export const parameterSchema = z.record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,79}$/), dimensionSchema).refine((p) => Object.keys(p).length <= 80, "At most 80 parameters")
export const historySchema = z.object({ parameters: parameterSchema, features: z.array(feature).min(1).max(80) }).describe("JSON object, never a JSON-encoded string. Features and constraints use type; sketch entities use kind. Sketch features must precede extrude/revolve/sweep/loft references; shell needs an earlier extrude; fillet acts on the bodies built so far.").superRefine((history, ctx) => {
  const seen = new Map<string, z.infer<typeof feature>>()
  const issue = (index: number, message: string) => ctx.addIssue({ code: "custom", path: ["features", index], message })
  history.features.forEach((f, index) => {
    if (seen.has(f.id)) issue(index, `Duplicate feature id '${f.id}'`)
    if ((f.type === "extrude" || f.type === "revolve") && seen.get(f.sketch)?.type !== "sketch") issue(index, `Sketch '${f.sketch}' must precede this feature`)
    if (f.type === "pattern" && (f.kind === "linear" || f.kind === "grid") && f.step === undefined) issue(index, `${f.kind === "grid" ? "Grid" : "Linear"} patterns need step [dx,dy,dz]`)
    if (f.type === "pattern" && f.kind === "grid" && (f.countB === undefined || f.stepB === undefined)) issue(index, "Grid patterns need countB (rows) and stepB [dx,dy,dz]")
    if (f.type === "pattern" && !TOOL_SOURCES.includes(seen.get(f.feature)?.type ?? "")) issue(index, `Pattern source '${f.feature}' must be an earlier extrude, revolve, hole, sweep, loft or mirror`)
    if (f.type === "mirror" && !TOOL_SOURCES.includes(seen.get(f.feature)?.type ?? "")) issue(index, `Mirror source '${f.feature}' must be an earlier extrude, revolve, hole, sweep, loft or mirror`)
    if (f.type === "sweep") for (const [role, ref] of [["profile", f.profile], ["path", f.path]] as const) if (seen.get(ref)?.type !== "sketch") issue(index, `Sweep ${role} '${ref}' must be an earlier sketch`)
    if (f.type === "sweep" && f.profile === f.path) issue(index, "A sweep needs two different sketches: the profile and the path")
    if (f.type === "loft") for (const ref of f.sections) if (seen.get(ref)?.type !== "sketch") issue(index, `Loft section '${ref}' must be an earlier sketch`)
    if (f.type === "shell" && !["extrude", "revolve", "sweep"].includes(seen.get(f.feature)?.type ?? "")) issue(index, `Shell source '${f.feature}' must be an earlier extrude, revolve or sweep`)
    if (f.type === "fillet" && !BODY_FEATURES.some((type) => [...seen.values()].some((e) => e.type === type))) issue(index, "A fillet needs a body built before it (extrude, revolve, sweep or loft)")
    if (f.type === "hole" && f.kind === "counterbore" && (f.headDiameter === undefined || f.headDepth === undefined)) issue(index, "A counterbore hole needs headDiameter and headDepth")
    if (f.type === "hole" && f.kind === "countersink" && f.headDiameter === undefined) issue(index, "A countersink hole needs headDiameter")
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
