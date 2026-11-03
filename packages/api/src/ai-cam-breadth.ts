import { Schema } from "effect"

/** Inputs and results of the CAM breadth actions (`cam.lathe`, `cam.process`, `cam.post_test`). Lengths are millimetres, feeds mm/min. */
const positive = Schema.Finite.check(Schema.isGreaterThan(0))
const name = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(60))
const point = Schema.Struct({ diameter: positive.check(Schema.isLessThanOrEqualTo(500)), z: Schema.Finite.check(Schema.isBetween({ minimum: -2000, maximum: 0 })) })
const profile = Schema.Array(point).check(Schema.isMinLength(2), Schema.isMaxLength(200))
const strings = Schema.Array(Schema.String)

export const CamLatheTool = Schema.Struct({
  id: name,
  number: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 99 })),
  kind: Schema.Literals(["turning", "boring", "grooving", "threading", "parting"]),
  /** ISO 1832 designation, e.g. CNMG120408 (turning, boring, threading). */
  insert: Schema.optionalKey(Schema.String.check(Schema.isMinLength(8), Schema.isMaxLength(20))),
  noseRadius: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 5 }))),
  /** Holder approach angle (95 PCLNR, 93 DDJNR), degrees. */
  approach: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 45, maximum: 135 }))),
  bladeWidth: Schema.optionalKey(positive.check(Schema.isLessThanOrEqualTo(12))),
  bladeLength: Schema.optionalKey(positive.check(Schema.isLessThanOrEqualTo(60)))
})

const side = Schema.optionalKey(Schema.Literals(["external", "internal"]))
const feed = Schema.optionalKey(positive.check(Schema.isLessThanOrEqualTo(10)))
export const CamLatheOperation = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("face"), tool: name, depth: Schema.optionalKey(positive), feed }),
  Schema.Struct({
    kind: Schema.Literal("rough"), tool: name, side, depth: Schema.optionalKey(positive), feed, retract: Schema.optionalKey(positive),
    allowance: Schema.optionalKey(Schema.Struct({ x: Schema.optionalKey(Schema.Finite), z: Schema.optionalKey(Schema.Finite) }))
  }),
  Schema.Struct({ kind: Schema.Literal("finish"), tool: name, side, feed, springPasses: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 }))) }),
  Schema.Struct({
    kind: Schema.Literal("groove"), tool: name, side, z: Schema.Finite, width: positive, diameter: positive,
    peck: Schema.optionalKey(positive), feed
  }),
  Schema.Struct({
    kind: Schema.Literal("thread"), tool: name, side, standard: Schema.optionalKey(Schema.Literals(["metric", "whitworth", "trapezoidal"])),
    diameter: positive, pitch: positive.check(Schema.isLessThanOrEqualTo(24)), zStart: Schema.Finite, zEnd: Schema.Finite,
    starts: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 8 }))),
    infeed: Schema.optionalKey(Schema.Literals(["radial", "flank", "alternating"])),
    springPasses: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 }))),
    firstDepth: Schema.optionalKey(positive), minDepth: Schema.optionalKey(positive)
  }),
  Schema.Struct({ kind: Schema.Literal("part"), tool: name, z: Schema.Finite, stubDiameter: Schema.optionalKey(Schema.Finite), peck: Schema.optionalKey(positive), feed })
])

export const CamLatheInput = Schema.Struct({
  /** Bar: diameter, length, pilot `bore` of a drilled bar, and the `faceAllowance` standing beyond the finished face (default 0.5). */
  stock: Schema.Struct({
    diameter: positive.check(Schema.isLessThanOrEqualTo(500)), length: positive.check(Schema.isLessThanOrEqualTo(2000)), bore: Schema.optionalKey(positive),
    faceAllowance: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 10 })))
  }),
  contour: Schema.optionalKey(profile),
  bore: Schema.optionalKey(profile),
  tools: Schema.Array(CamLatheTool).check(Schema.isMinLength(1), Schema.isMaxLength(12)),
  operations: Schema.Array(CamLatheOperation).check(Schema.isMinLength(1), Schema.isMaxLength(24)),
  material: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(80))),
  post: Schema.optionalKey(Schema.Literals(["fanuc", "siemens"]))
})

export const CamLatheResult = Schema.Struct({
  ok: Schema.Literal(true),
  post: Schema.String,
  operations: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String, kind: Schema.String, tool: Schema.String, moves: Schema.Int, notes: strings })),
  warnings: strings,
  analytic: Schema.Struct({ stockVolume: Schema.Finite, partVolume: Schema.Finite, removedVolume: Schema.Finite }),
  cycles: strings,
  explicit: Schema.Array(Schema.Struct({ operation: Schema.String, reason: Schema.String })),
  lines: Schema.Int,
  preview: Schema.String,
  verification: Schema.optionalKey(Schema.Unknown),
  release: Schema.Literal("preview")
})

export const CamProcessInput = Schema.Struct({
  gcode: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
  operationId: Schema.optionalKey(Schema.NonEmptyString),
  tool: Schema.Struct({
    diameter: positive.check(Schema.isLessThanOrEqualTo(250)), flutes: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 16 })),
    kind: Schema.optionalKey(Schema.Literals(["flat", "ball", "bull"])), cornerRadius: Schema.optionalKey(positive),
    fluteLength: Schema.optionalKey(positive), stickout: Schema.optionalKey(positive), shankDiameter: Schema.optionalKey(positive)
  }),
  material: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
  machine: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(60))),
  /** The stock block the program cuts, mm; the top is `maxZ` (program Z0 is usually the stock top). */
  stock: Schema.Struct({ minX: Schema.Finite, maxX: Schema.Finite, minY: Schema.Finite, maxY: Schema.Finite, minZ: Schema.Finite, maxZ: Schema.Finite }),
  rpm: Schema.optionalKey(positive.check(Schema.isLessThanOrEqualTo(60000))),
  /** `engagement`: measure and judge the program as written. `chip` / `power`: also write the largest feeds inside every limit. */
  mode: Schema.Literals(["engagement", "chip", "power"]),
  /** Post that writes the optimised program (default generic). */
  post: Schema.optionalKey(Schema.Literals(["generic", "linuxcnc", "fanuc", "haas", "siemens", "heidenhain", "okuma", "mazak", "mitsubishi", "brother"]))
})

export const CamProcessResult = Schema.Struct({
  ok: Schema.Literal(true),
  mode: Schema.String,
  uncalibrated: Schema.Literal(true),
  basis: Schema.String,
  bound: Schema.Struct({ aeMm: Schema.Finite, cellMm: Schema.Finite }),
  claim: Schema.Struct({ before: Schema.String, after: Schema.optionalKey(Schema.String), worstRatioBefore: Schema.Finite, worstRatioAfter: Schema.optionalKey(Schema.Finite) }),
  toolpaths: Schema.Array(Schema.Unknown),
  report: Schema.optionalKey(Schema.Unknown),
  program: Schema.optionalKey(Schema.Struct({ lines: Schema.Int, programHash: Schema.String, preview: Schema.String }))
})

export const CamPostTestInput = Schema.Struct({
  post: Schema.Literals(["generic", "linuxcnc", "fanuc", "haas", "siemens", "heidenhain", "okuma", "mazak", "mitsubishi", "brother", "grbl", "all"]),
  /** NC text of a program to post (read back into the IR with `programOfNc`, then written by each post and replayed). Absent: the standard sample program. */
  gcode: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
  /** Expected output for a line diff. */
  expected: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1)))
})

export const CamPostTestResult = Schema.Struct({
  ok: Schema.Literal(true),
  results: Schema.Array(Schema.Struct({
    post: Schema.String, verdict: Schema.Literals(["passed", "failed", "refused"]), reason: Schema.optionalKey(Schema.String),
    checks: Schema.Array(Schema.Struct({ id: Schema.String, status: Schema.String, detail: Schema.String })),
    unsupported: strings, diff: Schema.Array(Schema.Struct({ line: Schema.Int, expected: Schema.String, actual: Schema.String })),
    lines: Schema.Int, preview: Schema.String
  })),
  basis: Schema.String
})

const vec3Input = Schema.Struct({ x: Schema.Finite, y: Schema.Finite, z: Schema.Finite })
const verifyNcMesh = Schema.Struct({
  positions: Schema.Array(Schema.Finite).check(Schema.isMinLength(9), Schema.isMaxLength(600_000)),
  indices: Schema.Array(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))).check(Schema.isMinLength(3), Schema.isMaxLength(600_000))
})

/**
 * `cam.verify_nc` (spec 72 step 0.6): NC the kernel did not write, replayed against the part and the stock on the tri-dexel model.
 * The program is the text (`gcode`) or a saved operation; the part is inline (CAD elements or closed meshes, drawing coordinates);
 * `origin` is the work zero in drawing coordinates, so the program, the stock and the part end up in one frame. Nothing is stored.
 */
export const CamVerifyNcActionInput = Schema.Struct({
  gcode: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
  operationId: Schema.optionalKey(Schema.NonEmptyString),
  part: Schema.Struct({
    elements: Schema.optionalKey(Schema.Array(Schema.Record(Schema.String, Schema.Unknown)).check(Schema.isMinLength(1), Schema.isMaxLength(500))),
    meshes: Schema.optionalKey(Schema.Array(verifyNcMesh).check(Schema.isMinLength(1), Schema.isMaxLength(50)))
  }).check(Schema.makeFilter((part) => (part.elements === undefined) !== (part.meshes === undefined), { message: "Send exactly one of elements or meshes" })),
  /** Work zero in drawing coordinates (default 0, 0, 0). */
  origin: Schema.optionalKey(vec3Input),
  /** The stock block in the work frame, mm. */
  stock: Schema.Struct({ minX: Schema.Finite, maxX: Schema.Finite, minY: Schema.Finite, maxY: Schema.Finite, minZ: Schema.Finite, maxZ: Schema.Finite }),
  /** The cutter in the spindle for each tool number the program selects (T1 .. Tn). */
  tools: Schema.Array(Schema.Struct({
    number: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 999 })),
    diameter: positive.check(Schema.isLessThanOrEqualTo(250)), flutes: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 16 })),
    kind: Schema.optionalKey(Schema.Literals(["flat", "ball", "bull", "drill", "chamfer", "spot"])), cornerRadius: Schema.optionalKey(positive), angle: Schema.optionalKey(positive),
    fluteLength: Schema.optionalKey(positive), stickout: Schema.optionalKey(positive), shankDiameter: Schema.optionalKey(positive),
    holderDiameter: Schema.optionalKey(positive), holderLength: Schema.optionalKey(positive)
  })).check(Schema.isMinLength(1), Schema.isMaxLength(40)),
  /** A machine preset id: its travel and rotary table are checked (see cam materials). */
  machine: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(60))),
  tolerance: Schema.optionalKey(positive.check(Schema.isLessThanOrEqualTo(5))),
  allowance: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 5 }))),
  cell: Schema.optionalKey(positive.check(Schema.isBetween({ minimum: 0.02, maximum: 5 })))
})
export type CamVerifyNcActionInput = typeof CamVerifyNcActionInput.Type

const deviation = Schema.Struct({ depthMm: Schema.Finite, volumeMm3: Schema.Finite, rays: Schema.Finite, at: Schema.optionalKey(vec3Input) })

export const CamVerifyNcActionResult = Schema.Struct({
  ok: Schema.Literal(true),
  verdict: Schema.Literals(["clean", "faults", "incomplete"]),
  complete: Schema.Boolean,
  reasons: strings,
  findings: Schema.Array(Schema.Struct({ kind: Schema.String, message: Schema.String, line: Schema.optionalKey(Schema.Int), point: Schema.optionalKey(vec3Input), depthMm: Schema.optionalKey(Schema.Finite) })),
  gouge: deviation,
  left: deviation,
  errorBoundMm: Schema.Finite,
  thresholdMm: Schema.Finite,
  cellMm: Schema.Finite,
  moves: Schema.Int,
  feedMoves: Schema.Int,
  warnings: strings,
  basis: Schema.String
})
