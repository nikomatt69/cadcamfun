/**
 * The parametric history and the inputs of the parametric actions (`cad.parametric_*`, `cad_edit.parametric_*`), declared
 * once in Effect. The feature-history engine (`@cadcamfun/core` `rebuild`) is the only modeller; this is its validated
 * boundary. The AI package derives the model-visible nikcli schema from these and decodes every call with them; the
 * sidecar and the element catalogue decode stored histories with the same schema.
 *
 * Lengths are millimetres and angles degrees. A dimension is a number or an expression over the history's parameters.
 */
import { Effect, Schema, SchemaTransformation } from "effect"
import { PRIMITIVE_ELEMENTS, expandShape, recipeNames } from "@cadcamfun/core"

/** Text the model writes, trimmed before it is checked: whitespace alone is never an id or an expression. */
const text = (max: number) =>
  Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(max)).pipe(
    Schema.decodeTo(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(max)), SchemaTransformation.trim())
  )
const withDefault = <S extends Schema.Top>(schema: S, value: S["Encoded"]) => Schema.withDecodingDefaultKey<S>(Effect.succeed(value))(schema)
const optional = Schema.optionalKey
const between = <S extends Schema.Constraint>(schema: Schema.$Array<S>, minimum: number, maximum: number) => schema.check(Schema.isMinLength(minimum), Schema.isMaxLength(maximum))
const described = <S extends Schema.Top>(schema: S, description: string) => schema.annotate({ description }) as S

/**
 * A record whose keys must match `pattern`. The rule is a check on the whole record, not a key schema: a `Record` silently
 * drops the keys its key schema refuses, which would turn a misspelt name into a no-op instead of a refusal.
 */
const namedRecord = <V extends Schema.Top>(value: V, pattern: RegExp, rule: string, maxProperties?: number) =>
  Schema.Record(Schema.String, value).check(Schema.makeFilter(
    (record) => {
      const names = Object.keys(record)
      if (maxProperties !== undefined && names.length > maxProperties) return `At most ${maxProperties} entries`
      const bad = names.filter((key) => !pattern.test(key))
      return bad.length === 0 || bad.map((key) => ({ path: [key], issue: `Invalid name "${key}": ${rule}` }))
    },
    { toJsonSchema: () => ({ propertyNames: { pattern: pattern.source }, ...(maxProperties !== undefined ? { maxProperties } : {}) }) }
  ))

const id = text(100)
const n = Schema.Finite
const positive = Schema.Finite.check(Schema.isGreaterThan(0))
export const ParametricDimension = Schema.Union([n, text(200)])
const dimension = ParametricDimension
const plane = Schema.Literals(["XY", "YZ", "ZX"])
const operation = Schema.Literals(["new", "union", "subtract", "intersect"])
const direction = Schema.Literals(["up", "down", "symmetric"])
const axis3 = Schema.Literals(["x", "y", "z"])
const pair = Schema.Tuple([dimension, dimension])
const triple = Schema.Tuple([dimension, dimension, dimension])
const intBetween = (minimum: number, maximum: number) => Schema.Int.check(Schema.isBetween({ minimum, maximum }))

// ---------------------------------------------------------------- sketches

const entity = Schema.Union([
  described(Schema.Struct({ id, kind: Schema.Literal("point"), x: n, y: n }), "Sketch point: discriminator kind, numeric x/y in mm; parameterize through constraints."),
  described(Schema.Struct({ id, kind: Schema.Literal("line"), p1: id, p2: id }), "Sketch line: kind, p1/p2 are IDs of points in this sketch, not coordinates."),
  described(Schema.Struct({ id, kind: Schema.Literal("circle"), center: id, radius: positive }), "Sketch circle: kind, center is a point ID; radius is a positive number in mm."),
  described(Schema.Struct({ id, kind: Schema.Literal("arc"), center: id, start: id, end: id }), "Sketch arc: kind, center/start/end are point IDs in this sketch."),
  described(Schema.Struct({ id, kind: Schema.Literal("ellipse"), center: id, radiusX: positive, radiusY: positive, rotation: optional(n) }), "Sketch ellipse: kind, center is a point ID; radiusX/radiusY are the semi-axes in mm, rotation tilts the x axis (radians). Size it with an ellipseSize constraint."),
  described(Schema.Struct({ id, kind: Schema.Literal("spline"), points: between(Schema.Array(id), 2, 50), closed: optional(Schema.Boolean) }), "Sketch spline: kind, a Catmull-Rom curve through the named points in order; closed:true makes a smooth closed profile.")
])
const named = { id: optional(id) }
const unaryLine = (type: "horizontal" | "vertical") => Schema.Struct({ ...named, type: Schema.Literal(type), line: id })
const two = (type: "coincident" | "horizontalPoints" | "verticalPoints" | "parallel" | "perpendicular" | "equalLength" | "equalRadius" | "concentric") =>
  Schema.Struct({ ...named, type: Schema.Literal(type), a: id, b: id })
const distance = (type: "distance" | "distanceX" | "distanceY" | "angle") => Schema.Struct({ ...named, type: Schema.Literal(type), a: id, b: id, value: dimension })
const pointLine = (type: "pointOnLine" | "midpoint") => Schema.Struct({ ...named, type: Schema.Literal(type), point: id, line: id })
const radius = (type: "radius" | "diameter") => Schema.Struct({ ...named, type: Schema.Literal(type), circle: id, value: dimension })
const constraint = Schema.Union([
  Schema.Struct({ ...named, type: Schema.Literal("fixed"), point: id, x: optional(n), y: optional(n) }),
  unaryLine("horizontal"), unaryLine("vertical"), two("coincident"), two("horizontalPoints"), two("verticalPoints"),
  two("parallel"), two("perpendicular"), two("equalLength"), two("equalRadius"), two("concentric"),
  distance("distance"), distance("distanceX"), distance("distanceY"), distance("angle"),
  Schema.Struct({ ...named, type: Schema.Literal("length"), line: id, value: dimension }), radius("radius"), radius("diameter"),
  pointLine("pointOnLine"), pointLine("midpoint"),
  Schema.Struct({ ...named, type: Schema.Literal("pointOnCircle"), point: id, circle: id }),
  Schema.Struct({ ...named, type: Schema.Literal("symmetric"), a: id, b: id, line: id }),
  Schema.Struct({ ...named, type: Schema.Literal("tangentLineCircle"), line: id, circle: id }),
  Schema.Struct({ ...named, type: Schema.Literal("tangentCircles"), a: id, b: id, internal: optional(Schema.Boolean) }),
  Schema.Struct({ ...named, type: Schema.Literal("ellipseSize"), ellipse: id, radiusX: dimension, radiusY: dimension }),
  Schema.Struct({ ...named, type: Schema.Literal("pointOnEllipse"), point: id, ellipse: id })
])
const shape = Schema.Union([
  described(Schema.Struct({ id, kind: Schema.Literal("rectangle"), at: pair, width: dimension, height: dimension, centered: optional(Schema.Boolean) }), "at = corner, or centre when centered."),
  described(Schema.Struct({ id, kind: Schema.Literal("circle"), at: pair, diameter: dimension }), "Circle: at is its centre."),
  described(
    Schema.Struct({ id, kind: Schema.Literal("polygon"), at: pair, sides: intBetween(3, 64), radius: dimension, flats: optional(Schema.Boolean), rotation: optional(dimension) }),
    "Regular polygon: radius to the corners (to the sides when flats), rotation in degrees."
  ),
  described(Schema.Struct({ id, kind: Schema.Literal("ellipse"), at: pair, radiusX: dimension, radiusY: dimension, segments: optional(intBetween(8, 200)) }), "Ellipse drawn as straight chords (default 48)."),
  described(Schema.Struct({ id, kind: Schema.Literal("slot"), at: pair, length: dimension, width: dimension, angle: optional(dimension) }), "Slot: at = middle, length end to end (must exceed width), angle in degrees."),
  described(Schema.Struct({ id, kind: Schema.Literal("polyline"), points: between(Schema.Array(pair), 3, 200) }), "Any closed outline: points [x, y] in order; every coordinate may be an expression."),
  described(
    Schema.Struct({
      id, kind: Schema.Literal("curve"), curve: Schema.Literals(["spline", "bezier", "nurbs"]), points: between(Schema.Array(pair), 2, 100),
      closed: optional(Schema.Boolean), chord: optional(Schema.Boolean), degree: optional(intBetween(1, 8)), divisions: optional(intBetween(4, 400))
    }),
    "spline passes through the points; bezier and nurbs use control points. Open = sweep path; chord:true closes it with a straight line (extrude/revolve profile); closed:true closes smoothly."
  )
])

// ---------------------------------------------------------------- features

/** The plane of a sketch, hole or text: XY, YZ, ZX, or the id of an earlier `plane` feature. */
const planeRef = described(Schema.Union([plane, id]), "XY, YZ, ZX, or the id of an earlier plane feature (a work plane: offset, angle, three points, or on a face)")
const targets = optional(between(Schema.Array(id), 1, 40))
/** Features whose tool a pattern or a mirror may copy. */
const TOOL_SOURCES: ReadonlyArray<string> = ["extrude", "revolve", "hole", "sweep", "loft", "mirror", "primitive", "coil", "rib", "sheet", "thread", "text"]
const BODY_FEATURES: ReadonlyArray<string> = ["extrude", "revolve", "sweep", "loft", "primitive", "coil", "rib", "sheet", "thread", "text"]
const treatmentStyle = Schema.Literals(["chamfer", "fillet"])
const edgeTreatment = described(
  Schema.Struct({ style: treatmentStyle, size: dimension, ends: optional(Schema.Literals(["top", "bottom", "both"])), holes: optional(Schema.Boolean) }),
  "Break the edges round the end faces of the extrusion: chamfer (straight bevel) or fillet (quarter-round of radius size). ends defaults to both; holes also breaks the rim of the holes."
)
const cornerTreatment = described(
  Schema.Struct({ style: treatmentStyle, size: dimension }),
  "Round (fillet) or bevel (chamfer) the sharp vertical corners of the sketch profile before extruding. Size is the radius or the setback in mm."
)
const point = Schema.Struct({ near: triple, normal: optional(triple) })

const feature = Schema.Union([
  Schema.Struct({
    id, type: Schema.Literal("sketch"), plane: planeRef, offset: optional(dimension),
    sketch: Schema.Struct({
      entities: withDefault(Schema.Array(entity).check(Schema.isMaxLength(200)), []),
      constraints: withDefault(Schema.Array(constraint).check(Schema.isMaxLength(200)), []),
      shapes: optional(described(Schema.Array(shape).check(Schema.isMaxLength(40)), "Parametric profiles, fully constrained, measures take parameters. Prefer them to hand-built points and lines."))
    })
  }),
  Schema.Struct({ id, type: Schema.Literal("extrude"), sketch: id, depth: dimension, direction: optional(direction), operation, targets, edge: optional(edgeTreatment), corner: optional(cornerTreatment), taper: optional(dimension) }),
  Schema.Struct({ id, type: Schema.Literal("revolve"), sketch: id, axis: Schema.Union([Schema.Literals(["x", "y"]), Schema.Struct({ line: id })]), angle: optional(dimension), operation, targets }),
  Schema.Struct({
    id, type: Schema.Literal("hole"), plane: planeRef, offset: optional(dimension), at: pair, diameter: dimension, depth: dimension, targets,
    kind: optional(described(
      Schema.Literals(["simple", "counterbore", "countersink"]),
      "simple (default), counterbore (flat recess for a screw head: needs headDiameter and headDepth) or countersink (cone for a flat head: needs headDiameter; angle is the included cone angle, default 90)."
    )),
    headDiameter: optional(dimension), headDepth: optional(dimension), angle: optional(dimension)
  }),
  Schema.Struct({
    id, type: Schema.Literal("pattern"), feature: optional(id),
    bodies: optional(described(Schema.Array(id).check(Schema.isMinLength(1), Schema.isMaxLength(50)), "instead of feature: body ids copied whole, each copy a new body <id>#<k>.")),
    kind: Schema.Literals(["linear", "circular", "grid", "path"]), count: dimension, step: optional(triple), centre: optional(pair), span: optional(dimension),
    path: optional(described(id, "path only: the sketch whose open chain the copies ride, spaced by arc length and turned with its tangent.")),
    countB: optional(described(dimension, "grid only: the number of rows (count is the number along step).")),
    stepB: optional(described(triple, "grid only: the offset between two rows [dx,dy,dz]."))
  }),
  described(
    Schema.Struct({ id, type: Schema.Literal("sweep"), profile: id, path: id, operation, targets, bendRadius: optional(dimension) }),
    "Sweep the closed profile of an earlier sketch along the path of another sketch (ONE open chain of lines/arcs, or one closed loop). The centre of the profile rides the start of the path; loops inside loops are holes (a hollow tube is two circles)."
  ),
  described(
    Schema.Struct({ id, type: Schema.Literal("loft"), sections: between(Schema.Array(id), 2, 12), smooth: optional(Schema.Boolean), operation, targets }),
    "Loft a solid through the largest closed loop of two or more earlier sketches, in order. Sections are resampled to the same number of points; smooth passes a curve through them instead of straight spans."
  ),
  described(
    Schema.Struct({ id, type: Schema.Literal("shell"), feature: id, thickness: dimension, open: optional(Schema.Literals(["none", "top", "bottom", "both"])), targets }),
    "Hollow out an earlier extrude, full revolve or sweep with uniform walls of thickness mm; open leaves the end faces open (a cup, a tube). Not for tapered extrudes or Boolean results."
  ),
  described(
    Schema.Struct({
      id, type: Schema.Literal("primitive"), element: Schema.Literals(PRIMITIVE_ELEMENTS),
      params: optional(namedRecord(dimension, /^[A-Za-z_][A-Za-z0-9_]{0,39}$/, "use a letter or _ then letters, digits or _ (at most 40)")),
      options: optional(namedRecord(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(40)), /^.{1,40}$/s, "1 to 40 characters")),
      profile: optional(between(Schema.Array(pair), 2, 200)),
      path: optional(between(Schema.Array(triple), 2, 200)), positions: optional(between(Schema.Array(triple), 2, 40)), radii: optional(between(Schema.Array(dimension), 2, 40)),
      at: optional(triple), rotation: optional(triple), operation, targets
    }),
    "A 3D catalogue solid with parametric measures. element and params: cube{width,height,depth} sphere{radius} ellipsoid{radiusX,radiusY,radiusZ} cylinder cone{radius,height} prism{radius,height,sides} pyramid{baseWidth,baseDepth,height} hemisphere capsule{radius,height} torus{radius,tubeRadius} gear{moduleValue,teeth,thickness,holeDiameter} spring{radius,wireRadius,turns,height} bolt screw{length} nut washer{outerDiameter,thickness} wall{length,thickness,height} floor{width,depth,thickness} window door{width,height,thickness} column{radius,height} roof{width,depth,height} stair{width,height,depth,steps}; options: size M8, style, shape, axis, direction; profile for extrusion/revolution/sweep, path for sweep, positions+radii for loft. at = centre, rotation in degrees. operation subtract cuts with it."
  ),
  described(
    Schema.Struct({
      id, type: Schema.Literal("coil"), radius: dimension, pitch: dimension, turns: dimension, wireDiameter: dimension, section: optional(Schema.Literals(["round", "square"])),
      handedness: optional(Schema.Literals(["right", "left"])), centre: optional(pair), offset: optional(dimension), operation, targets
    }),
    "Helical wire about Z (spring): radius to the wire centre, pitch (above wireDiameter), turns; offset = start height."
  ),
  described(
    Schema.Struct({ id, type: Schema.Literal("move"), targets, translate: optional(triple), rotate: optional(Schema.Struct({ axis: axis3, angle: dimension, about: optional(triple) })), copy: optional(Schema.Boolean) }),
    "Move/Copy bodies: rotate (degrees) then translate; copy:true keeps the originals."
  ),
  described(
    Schema.Struct({ id, type: Schema.Literal("scale"), factor: Schema.Union([dimension, triple]), about: optional(triple), targets }),
    "Scale bodies about a point: one positive factor, or three for x, y, z."
  ),
  described(
    Schema.Struct({ id, type: Schema.Literal("split"), plane, offset: optional(dimension), keep: Schema.Literals(["above", "below", "both"]), targets }),
    "Split Body by a plane at offset: keep the side the normal points to, the other, or both."
  ),
  described(
    Schema.Struct({ id, type: Schema.Literal("combine"), target: id, tools: between(Schema.Array(id), 1, 40), operation: Schema.Literals(["join", "cut", "intersect"]), keepTools: optional(Schema.Boolean) }),
    "Combine bodies by id (the id of the feature that made each): join, cut or intersect; tools are consumed unless keepTools."
  ),
  described(
    Schema.Struct({
      id, type: Schema.Literal("fillet"), radius: dimension, style: optional(Schema.Literals(["fillet", "chamfer"])), targets,
      secondDistance: optional(described(dimension, "Chamfer only: the setback on the second face, mm (the callout '2 x 1'). The first setback is radius, on the more horizontal of the two faces.")),
      angle: optional(described(dimension, "Chamfer only: the angle between the chamfer face and the first face, degrees (the callout '2 x 30°'). It fixes the setback on the second face.")),
      radiusEnd: optional(described(dimension, "Fillet only: the radius at the far end of each straight edge; the radius runs linearly from radius (at the edge's lexicographically smaller end) to radiusEnd. Corners where variable edges meet are not rounded.")),
      edges: optional(described(
        Schema.Struct({
          parallel: optional(axis3), kind: optional(Schema.Literals(["convex", "concave", "both"])), minLength: optional(dimension), curved: optional(Schema.Boolean),
          within: optional(Schema.Struct({ min: triple, max: triple }))
        }),
        "Which edges: parallel to an axis, convex/concave (default convex), longer than minLength, wholly inside the box within {min,max}; curved:true also takes rims of curved surfaces (slow, off by default). No selection = every convex edge."
      ))
    }),
    "Round (fillet radius) or bevel (chamfer setback) the edges between planar faces that meet at 25 degrees or more, on the bodies built so far. A chamfer takes one setback (radius) on both faces, or two distances (radius and secondDistance), or a distance and an angle (radius and angle), never both secondDistance and angle. A fillet may run its radius linearly along straight edges with radiusEnd. Distances are positive; angle is strictly between 0 and 90 degrees. Unequal setbacks need a uniquely more horizontal first face. Read the issues: a size wider than the faces is refused."
  ),
  described(
    Schema.Struct({ id, type: Schema.Literal("rib"), sketch: id, thickness: dimension, depth: dimension, direction: optional(direction), operation: optional(operation), targets }),
    "Rib / web (Fusion Rib): every OPEN line chain of an earlier sketch (the centre line, lines and arcs) is thickened to thickness and stands depth mm from the sketch plane along its normal, united (default union) with the bodies. Draw the sketch on the face the rib stands on (offset = that face)."
  ),
  described(
    Schema.Struct({
      id, type: Schema.Literal("sheet"), sketch: id, thickness: dimension, width: dimension, bendRadius: optional(dimension), side: optional(Schema.Literals(["centre", "left", "right"])),
      flanges: optional(Schema.Array(Schema.Struct({ end: Schema.Literals(["start", "end"]), length: dimension, angle: dimension, relief: optional(Schema.Struct({ width: dimension, depth: dimension })) })).check(Schema.isMaxLength(2))).annotate({ description: "Full-width edge flanges on the exposed width edges of this sheet: end start/end, length from virtual bend corner, signed angle in degrees. Uses bendRadius and thickness of the existing sheet. Cannot share an edge with a hem. Flat development includes the new bend. Optional relief {width,depth} in mm cuts rectangular notches at both bend ends (turns up to 90 degrees), narrows the flange and updates the flat blank. Partial-width flanges and flanges on adjacent edges are not supported." }),
      hems: optional(Schema.Array(Schema.Struct({ end: Schema.Literals(["start", "end"]), length: dimension, gap: optional(dimension), fold: optional(Schema.Literals(["left", "right"])) })).check(Schema.isMaxLength(2))),
      direction: optional(direction), operation, targets
    }),
    "Sheet-metal base flange: ONE open line chain of an earlier sketch is the profile, given thickness on side (the material side looking along the line, default centre), its corners bent with the INSIDE radius bendRadius (omit for sharp), extruded width along the sketch normal. hems folds a flange back at an end (two 90 degree bends; with a bend radius gap must be at least twice the inside radius). The flat pattern length and bend count (K-factor 0.44) are reported as flatPatterns."
  ),
  described(
    Schema.Struct({
      id, type: Schema.Literal("thread"), kind: Schema.Literals(["external", "internal"]), diameter: dimension, pitch: dimension, length: dimension, at: optional(pair), offset: optional(dimension),
      handedness: optional(Schema.Literals(["right", "left"])), cut: optional(Schema.Boolean), axis: optional(axis3), operation: optional(operation), targets
    }),
    "Modelled ISO metric thread along Z at [x,y], starting at height offset. external = a threaded rod of the major diameter (default operation new; union it onto a stud); internal = the tool for a tapped hole (default operation subtract: the cavity is the tap drill plus the groove). cut:true (external only) cuts the thread into the shaft already there instead of making a rod. axis x or y runs it sideways: then at = [y,z] / [z,x] and offset = x / y. Pitch from the ISO table (M8 1.25, M10 1.5)."
  ),
  described(
    Schema.Struct({
      id, type: Schema.Literal("text"), text: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)), height: dimension, depth: dimension, strokeWidth: optional(dimension),
      plane: planeRef, offset: optional(dimension), at: optional(pair), align: optional(Schema.Literals(["left", "centre"])), spacing: optional(dimension), direction: optional(direction), operation, targets
    }),
    "Solid text (capitals, digits, punctuation of a single-stroke font). Emboss: operation union, plane at the face (offset), direction up. Engrave: operation subtract, direction down. at = lower-left corner, or the centre with align centre. height = cap height."
  ),
  described(
    Schema.Struct({ id, type: Schema.Literal("pushpull"), near: triple, normal: optional(triple), distance: dimension, body: optional(id) }),
    "Press Pull: move the planar face of a body nearest the point near along its outward normal by distance (positive grows the body, negative cuts into it). normal restricts to faces facing that way (use it to choose between the top and bottom face at the same point). A face with holes keeps them. A curved face (a boss side, a hole wall, a fillet with the faces tangent to it) is offset along its normals: a cylinder changes radius by distance; pulling a hole wall further than its radius is refused."
  ),
  described(
    Schema.Struct({ id, type: Schema.Literal("draft"), near: triple, normal: optional(triple), angle: dimension, pull: optional(triple), neutral: optional(dimension), body: optional(id) }),
    "Draft of ONE planar face of any body (Fusion Draft): the face nearest the point near is tilted by angle degrees (-45..45) about its hinge, where it meets the neutral plane (pull . p = neutral; pull defaults to [0,0,1], neutral to 0). Positive angle: above the neutral plane the wall leans inward (material removed), below it outward (added). One feature per face; faces square to the pull direction are refused. A curved face (a boss, a hole wall) is drafted too, one way only: put neutral at its base or top (a cylinder becomes a cone). Use extrude.taper when the whole extrusion is drafted."
  ),
  described(
    Schema.Struct({
      id, type: Schema.Literal("mate"), body: id, face: point, to: Schema.Struct({ body: id, near: triple, normal: optional(triple) }), offset: optional(dimension), spin: optional(dimension), slide: optional(pair),
      limits: optional(Schema.Struct({ spin: optional(pair), offset: optional(pair), slide: optional(Schema.Tuple([pair, pair])) })), interference: optional(Schema.Boolean)
    }),
    "Rigid joint (Fusion Joint): body (the id of the feature that made it) moves so that its face nearest face.near lies flush against the face nearest to.near of the other body (normals opposed, face centres together), offset mm apart, then spins degrees about the common normal (revolute joint); slide [u,v] shifts it along the target face (slider / planar joint); limits {spin, offset, slide:[[uMin,uMax],[vMin,vMax]]} turn a pose beyond them into an error; an overlap of the two bodies is reported as a warning (interference:false skips the check). Needs two bodies (an extrude etc. with operation new)."
  ),
  described(
    Schema.Struct({
      id, type: Schema.Literal("plane"),
      from: Schema.Union([
        Schema.Struct({ kind: Schema.Literal("offset"), base: planeRef, distance: dimension }),
        Schema.Struct({ kind: Schema.Literal("angle"), base: planeRef, angle: dimension, about: Schema.Literals(["u", "v"]), at: optional(dimension) }),
        Schema.Struct({ kind: Schema.Literal("points"), points: Schema.Tuple([triple, triple, triple]) }),
        Schema.Struct({ kind: Schema.Literal("face"), near: triple, normal: optional(triple), body: optional(id), offset: optional(dimension) })
      ])
    }),
    "Work plane (Fusion Construct), named by this feature's id in the plane field of a sketch, hole or text. offset: base moved distance along its normal. angle: base turned angle degrees about its u or v axis (hinge at position `at` along the other axis). points: through three points (u from the first to the second). face: ON the planar face of a body nearest near, at the face centre (u = world X projected on the face, v = normal x u: a top face reads like XY), lifted by offset; follows the face on every rebuild. Sketch on a face = a face plane + a sketch on it."
  ),
  described(
    Schema.Struct({ id, type: Schema.Literal("mirror"), feature: optional(id), bodies: optional(Schema.Array(id).check(Schema.isMinLength(1), Schema.isMaxLength(50))), join: optional(Schema.Boolean), plane, offset: optional(dimension) }),
    "Mirror the tool of an earlier extrude, revolve, hole or mirror (feature), or whole bodies (bodies: a new body; join: united with the original, half a symmetric part becomes the part) through a plane: XY reflects Z, YZ reflects X, ZX reflects Y, at offset along the plane normal."
  )
])
type Feature = typeof feature.Type

// ---------------------------------------------------------------- the history

/** Named dimensions; at most 80. */
export const ParametricParameters = namedRecord(dimension, /^[A-Za-z_][A-Za-z0-9_]{0,79}$/, "use a letter or _ then letters, digits or _ (at most 80)", 80)

/** The order rules no field-level check can see: references point backwards, ids are unique, sketches resolve. */
const historyIssues = (features: ReadonlyArray<Feature>): Array<Schema.FilterIssue> => {
  const issues: Array<Schema.FilterIssue> = []
  const seen = new Map<string, Feature>()
  const issue = (index: number, message: string) => issues.push({ path: ["features", index], issue: message })
  const hasBody = () => BODY_FEATURES.some((type) => [...seen.values()].some((e) => e.type === type))
  const named = (ref: string) => ["XY", "YZ", "ZX"].includes(ref) || seen.get(ref)?.type === "plane"
  features.forEach((f, index) => {
    if (seen.has(f.id)) issue(index, `Duplicate feature id '${f.id}'`)
    if ((f.type === "extrude" || f.type === "revolve" || f.type === "rib" || f.type === "sheet") && seen.get(f.sketch)?.type !== "sketch") issue(index, `Sketch '${f.sketch}' must precede this feature`)
    if (f.type === "pattern" && (f.kind === "linear" || f.kind === "grid") && f.step === undefined) issue(index, `${f.kind === "grid" ? "Grid" : "Linear"} patterns need step [dx,dy,dz]`)
    if (f.type === "pattern" && f.kind === "grid" && (f.countB === undefined || f.stepB === undefined)) issue(index, "Grid patterns need countB (rows) and stepB [dx,dy,dz]")
    if (f.type === "pattern" && f.kind === "path" && (f.path === undefined || seen.get(f.path)?.type !== "sketch")) issue(index, "Path patterns need `path`: an earlier sketch with an open chain")
    if ((f.type === "pattern" || f.type === "mirror") && (f.feature === undefined) === (f.bodies === undefined)) issue(index, `A ${f.type} takes either feature (copy its tool) or bodies (copy them whole), not both or neither`)
    if (f.type === "pattern" && f.feature !== undefined && !TOOL_SOURCES.includes(seen.get(f.feature)?.type ?? "")) issue(index, `Pattern source '${f.feature}' must be an earlier extrude, revolve, hole, sweep, loft, primitive, coil, rib, sheet, thread, text or mirror`)
    if (f.type === "mirror" && f.feature !== undefined && !TOOL_SOURCES.includes(seen.get(f.feature)?.type ?? "")) issue(index, `Mirror source '${f.feature}' must be an earlier extrude, revolve, hole, sweep, loft, primitive, coil, rib, sheet, thread, text or mirror`)
    if ((f.type === "pattern" || f.type === "mirror") && f.bodies !== undefined && !hasBody()) issue(index, `A ${f.type} of bodies needs an earlier feature that makes a body`)
    if (f.type === "sweep") for (const [role, ref] of [["profile", f.profile], ["path", f.path]] as const) if (seen.get(ref)?.type !== "sketch") issue(index, `Sweep ${role} '${ref}' must be an earlier sketch`)
    if (f.type === "sweep" && f.profile === f.path) issue(index, "A sweep needs two different sketches: the profile and the path")
    if (f.type === "loft") for (const ref of f.sections) if (seen.get(ref)?.type !== "sketch") issue(index, `Loft section '${ref}' must be an earlier sketch`)
    if (f.type === "shell" && !["extrude", "revolve", "sweep"].includes(seen.get(f.feature)?.type ?? "")) issue(index, `Shell source '${f.feature}' must be an earlier extrude, revolve or sweep`)
    if (f.type === "fillet" && !hasBody()) issue(index, "A fillet needs a body built before it (extrude, revolve, sweep or loft)")
    if (f.type === "fillet" && (f.style ?? "fillet") === "fillet" && (f.secondDistance !== undefined || f.angle !== undefined)) issue(index, "A fillet has one radius: secondDistance and angle belong to a chamfer")
    if (f.type === "fillet" && f.secondDistance !== undefined && f.angle !== undefined) issue(index, "A chamfer takes either two distances or a distance and an angle, not both")
    if (f.type === "fillet" && typeof f.secondDistance === "number" && !(f.secondDistance > 0)) issue(index, "The second chamfer distance must be positive")
    if (f.type === "fillet" && typeof f.angle === "number" && !(f.angle > 0 && f.angle < 90)) issue(index, "The chamfer angle must be between 0 and 90 degrees")
    if (f.type === "fillet" && f.radiusEnd !== undefined && (f.style ?? "fillet") !== "fillet") issue(index, "A variable radius (radiusEnd) belongs to a fillet, not a chamfer")
    if (f.type === "fillet" && typeof f.radiusEnd === "number" && !(f.radiusEnd > 0)) issue(index, "The end radius must be positive")
    if ((f.type === "draft" || f.type === "mate") && !hasBody()) issue(index, `A ${f.type} needs a body built before it`)
    if (f.type === "mate" && f.body === f.to.body) issue(index, "A mate needs two different bodies")
    if (f.type === "mate" && (!seen.has(f.body) || !seen.has(f.to.body))) issue(index, "Both bodies of a mate must be earlier features")
    if (f.type === "draft" && f.body !== undefined && !seen.has(f.body)) issue(index, `Body '${f.body}' must be an earlier feature`)
    if ((f.type === "sketch" || f.type === "hole" || f.type === "text") && !named(f.plane)) issue(index, `Plane '${f.plane}' must be XY, YZ, ZX or an earlier plane feature`)
    if (f.type === "plane" && (f.from.kind === "offset" || f.from.kind === "angle") && !named(f.from.base)) issue(index, `Base plane '${f.from.base}' must be XY, YZ, ZX or an earlier plane feature`)
    if (f.type === "plane" && f.from.kind === "face" && !hasBody()) issue(index, "A plane on a face needs a body built before it")
    if (f.type === "pushpull" && !hasBody()) issue(index, "A push/pull needs a body built before it")
    if (f.type === "pushpull" && f.body !== undefined && !seen.has(f.body)) issue(index, `Body '${f.body}' must be an earlier feature`)
    if (f.type === "hole" && f.kind === "counterbore" && (f.headDiameter === undefined || f.headDepth === undefined)) issue(index, "A counterbore hole needs headDiameter and headDepth")
    if (f.type === "hole" && f.kind === "countersink" && f.headDiameter === undefined) issue(index, "A countersink hole needs headDiameter")
    if ("targets" in f && f.targets?.some((t) => !seen.has(t))) issue(index, "Targets must name earlier body features")
    if (f.type === "sketch") {
      // Only the ids matter here (the measures may still be parameters), so the shapes are expanded without checking their values.
      const fromShapes = (f.sketch.shapes ?? []).flatMap((sh) => { try { return [...expandShape(sh as never, () => 1, true).entities] } catch { return [] } })
      // A curve's points are numbered by how many chords it ends up with, which depends on the parameters: any <curve id>.<name> may be named.
      const curveIds = (f.sketch.shapes ?? []).filter((sh) => sh.kind === "curve").map((sh) => `${sh.id}.`)
      const all: ReadonlyArray<{ readonly id: string; readonly kind: string }> = [...f.sketch.entities, ...fromShapes]
      if (all.length === 0) issue(index, "A sketch needs entities or shapes")
      const entities = new Map(all.map((e) => [e.id, e]))
      if (entities.size !== all.length) issue(index, "Duplicate sketch entity ids")
      const isPoint = (ref: string) => entities.get(ref)?.kind === "point"
      for (const e of f.sketch.entities) {
        const refs = e.kind === "line" ? [e.p1, e.p2] : e.kind === "circle" ? [e.center] : e.kind === "arc" ? [e.center, e.start, e.end] : e.kind === "ellipse" ? [e.center] : e.kind === "spline" ? [...e.points] : []
        if (refs.some((ref) => !isPoint(ref))) issue(index, `Entity '${e.id}' references a missing point`)
      }
      for (const c of f.sketch.constraints) for (const key of ["point", "line", "circle", "a", "b", "ellipse"] as const) {
        const ref = (c as Record<string, unknown>)[key]
        if (typeof ref !== "string") continue
        if (curveIds.some((prefix) => ref.startsWith(prefix))) continue
        const found = entities.get(ref)
        if (found === undefined || (key === "point" && found.kind !== "point") || (key === "line" && found.kind !== "line") || (key === "circle" && found.kind !== "circle" && found.kind !== "arc") || (key === "ellipse" && found.kind !== "ellipse")) issue(index, `Constraint references invalid ${key} '${ref}'`)
      }
    }
    seen.set(f.id, f)
  })
  return issues
}

export const ParametricHistory = described(
  Schema.Struct({ parameters: ParametricParameters, features: between(Schema.Array(feature), 1, 80) }),
  "JSON object, never a JSON-encoded string. Features and constraints use type; sketch entities use kind. Sketch features must precede extrude/revolve/sweep/loft references; shell needs an earlier extrude; fillet acts on the bodies built so far."
).check(Schema.makeFilter((history) => historyIssues(history.features)))
export type ParametricHistory = typeof ParametricHistory.Type

// ---------------------------------------------------------------- the parametric actions

const elementId = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100))
const name = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100))
const length = Schema.Finite.check(Schema.isGreaterThan(0))
const placement = { x: optional(Schema.Finite), y: optional(Schema.Finite), z: optional(Schema.Finite), layer: optional(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100))) }
const recipe = Schema.Literals(recipeNames() as unknown as readonly [string, ...Array<string>])
const recipeParams = optional(namedRecord(Schema.Unknown, /^.{1,80}$/s, "1 to 80 characters"))
const principal = Schema.Literals(["front", "top", "right"])
const sheetText = Schema.String.check(Schema.isMaxLength(120))

/** Allowed deviation from a nominal: `plus` above, `minus` below (mm, or mm³ for a volume). */
const deviation = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))
const ToleranceBand = Schema.Struct({ plus: deviation, minus: deviation })
const Measure = Schema.Struct({ nominal: length, tolerance: ToleranceBand })

/**
 * One dimensional acceptance check (AI-11 Step 10): a quantity measured on the rebuilt part through a named reference and
 * compared with its limits. `hole` names the history's hole feature; `hole_count` counts recognised holes, not genus.
 */
export const AcceptanceCheck = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("extent"), name, axis: Schema.Literals(["x", "y", "z"]), nominal: length, tolerance: ToleranceBand, body: optional(name) }),
  Schema.Struct({ kind: Schema.Literal("hole"), name, feature: name, diameter: Measure, depth: optional(Measure), through: optional(Schema.Boolean) }),
  Schema.Struct({ kind: Schema.Literal("hole_count"), name, nominal: intBetween(0, 500) }),
  Schema.Struct({ kind: Schema.Literal("volume"), name, nominal: length, tolerance: ToleranceBand })
])

export const ParametricTestCase = Schema.Struct({
  name, parameters: ParametricParameters,
  expectedBodies: optional(intBetween(1, 40)),
  minVolumeMm3: optional(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))),
  maxVolumeMm3: optional(length),
  /** Dimensional acceptance: the case passes only when every check measures within its limits. */
  checks: optional(between(Schema.Array(AcceptanceCheck), 1, 24))
})

export const ParametricDrawingOptions = Schema.Struct({
  size: optional(Schema.Literals(["A4", "A3", "A2"])), projection: optional(Schema.Literals(["first", "third"])),
  title: optional(sheetText), drawingNumber: optional(sheetText), material: optional(sheetText),
  colour: optional(sheetText), finish: optional(sheetText), standard: optional(sheetText), revision: optional(sheetText),
  sheet: optional(sheetText), date: optional(sheetText), author: optional(sheetText),
  notes: optional(Schema.Array(sheetText).check(Schema.isMaxLength(8))), views: optional(between(Schema.Array(principal), 1, 3)), iso: optional(Schema.Boolean),
  scale: optional(Schema.Finite.check(Schema.isBetween({ minimum: 0.02, maximum: 50 }))),
  section: optional(Schema.Struct({ axis: axis3, at: Schema.Finite, from: optional(Schema.Literals(["+", "-"])), letter: optional(Schema.String.check(Schema.isMaxLength(2))), parent: optional(principal) })),
  detail: optional(Schema.Struct({
    view: optional(principal), centre: Schema.Struct({ x: Schema.Finite, y: Schema.Finite, z: Schema.Finite }),
    radius: length.check(Schema.isLessThanOrEqualTo(10000)), factor: length.check(Schema.isLessThanOrEqualTo(20)), letter: optional(Schema.String.check(Schema.isMaxLength(2)))
  })),
  flatness: optional(Schema.Struct({ value: length, view: optional(principal) })),
  /** ISO 1101 feature control frames, datum feature symbols and BOM balloons, placed on world points of the model. */
  gdt: optional(Schema.Array(Schema.Struct({
    spec: Schema.Struct({
      kind: Schema.Literals(["straightness", "flatness", "circularity", "cylindricity", "profile-line", "profile-surface", "parallelism", "perpendicularity", "angularity", "position", "concentricity", "symmetry", "runout", "total-runout"]),
      value: length, diameter: optional(Schema.Boolean), modifier: optional(Schema.Literals(["M", "L"])),
      datums: optional(Schema.Array(Schema.String.check(Schema.isPattern(/^[A-Z]$/))).check(Schema.isMaxLength(3)))
    }),
    at: Schema.Struct({ x: Schema.Finite, y: Schema.Finite, z: Schema.Finite }), view: optional(principal),
    offset: optional(Schema.Struct({ x: Schema.Finite, y: Schema.Finite }))
  })).check(Schema.isMaxLength(40))),
  datums: optional(Schema.Array(Schema.Struct({
    letter: Schema.String.check(Schema.isPattern(/^[A-Z]$/)), at: Schema.Struct({ x: Schema.Finite, y: Schema.Finite, z: Schema.Finite }),
    view: optional(principal), side: optional(Schema.Literals(["up", "down", "left", "right"]))
  })).check(Schema.isMaxLength(10))),
  balloons: optional(Schema.Array(Schema.Struct({
    text: Schema.String.check(Schema.isMaxLength(6)), at: Schema.Struct({ x: Schema.Finite, y: Schema.Finite, z: Schema.Finite }), view: optional(principal),
    offset: optional(Schema.Struct({ x: Schema.Finite, y: Schema.Finite }))
  })).check(Schema.isMaxLength(60)))
})

export const PARAMETRIC_ACTION_INPUTS = {
  "cad.drawing": Schema.Struct({ elementId: optional(elementId), history: optional(ParametricHistory), options: optional(ParametricDrawingOptions) }),
  "cad.parametric_validate": Schema.Struct({ history: ParametricHistory }),
  "cad.parametric_inspect": Schema.Struct({ elementId }),
  "cad.parametric_test": Schema.Struct({ elementId, cases: between(Schema.Array(ParametricTestCase), 1, 12) }),
  "cad.parametric_dfm": Schema.Struct({
    elementId: optional(elementId), history: optional(ParametricHistory), process: optional(Schema.Literals(["mill", "turn", "print"])),
    toolDiameter: optional(length), material: optional(Schema.Literals(["metal", "cast", "plastic"])), minWall: optional(length),
    envelope: optional(Schema.Struct({ x: length, y: length, z: length }))
  }),
  "cad.parametric_exact": Schema.Struct({
    elementId: optional(elementId), history: optional(ParametricHistory),
    /** Also return the STEP AP214 file of the exact bodies. */
    includeStep: optional(Schema.Boolean),
    /** Product name in the STEP file. */
    name: optional(name)
  }),
  "cad.parametric_fastener": Schema.Struct({
    size: optional(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(20))), fit: optional(Schema.Literals(["fine", "medium", "coarse"])), shaftDiameter: optional(length)
  }),
  /** Reading a recipe never creates it: `create` lives only on the write action. */
  "cad.parametric_recipe": Schema.Struct({ recipe, params: recipeParams }),
  /** Reading the conversion builds the history; nothing is created. */
  "cad.parametric_from_element": Schema.Struct({ elementId, depth: optional(length) }),
  "cad_edit.parametric_create": Schema.Struct({ history: ParametricHistory, name, ...placement }),
  "cad_edit.parametric_update": Schema.Struct({ elementId, parameters: ParametricParameters, expectedRevision: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)) }),
  "cad_edit.parametric_recipe_create": Schema.Struct({ recipe, params: recipeParams, name: optional(name), ...placement }),
  "cad_edit.parametric_convert": Schema.Struct({ elementId, depth: optional(length), name: optional(name) })
} as const
