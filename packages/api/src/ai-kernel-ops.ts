/**
 * The kernel operations the assistant runs directly, for the CAD kernel, the CAM kernel and the post-processors.
 *
 * These are the actions that reach the pure core without a drawing, a stored program or a database: the model sends the
 * geometry, the stock, the tool or the NC text, and the kernel answers. They are the operations a shop asks for before
 * anything is stored (spec 26: one catalogue, one seam; spec 33: the exact kernel is the truth).
 *
 *   post_dialects   what every implemented post can write: canned cycles, arc formats, dwell unit, rotary axes,
 *                   tool-centre-point words, subprograms, spindle orientation, the controller each post serves
 *   post_convert    rewrite an NC program in another dialect, with the deviation the conversion introduced
 *   nc_verify       the kernel's own NC replay (tri-dexel) of a program against the part, the stock and the tools
 *   five_axis       the table poses of a 5-axis machine for a list of tool directions, with the travel and the branch
 *   motion          the simultaneous 5-axis plan of a list of points, with the collision verdict of every move
 *   clearance       the holder and shank against the table, move by move, over a replayed program
 *   print_program   what a print program deposits and how long it takes, against the part it must print
 *   print_cost      what a print job costs in material, machine time, energy and labour
 *   cycles          the canned cycles and macros a controller supports, and the NC they write
 *   turning_tool    the insert that cuts a given contour, its limits and the check of the profile against them
 *   sheet_metal     the sheet-metal design rules of a part and the weldment cut list of a frame
 *   exact_ops       the exact B-rep operations on a parametric part: booleans, blends, lofts, sweeps, heals, exports
 *
 * Lengths are millimetres, angles degrees, feeds mm/min.
 */
import { Schema } from "effect"

const optional = Schema.optionalKey
const id = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200))
const positive = Schema.Finite.check(Schema.isGreaterThan(0))
const num = Schema.Finite
const int = Schema.Int
const str = Schema.String
const strings = Schema.Array(str)
const record = Schema.Record(str, Schema.Unknown)
const vec3 = Schema.Struct({ x: num, y: num, z: num })
const vec2 = Schema.Struct({ x: num, y: num })

/** The post dialects the kernel implements (spec 54 C2: the post registry is `cam/post/index.ts`). */
export const KERNEL_POST_IDS = [
  "generic", "linuxcnc", "fanuc", "grbl", "haas", "siemens", "heidenhain", "okuma", "mazak", "mitsubishi", "brother"
] as const

/** The controls whose cycle catalogue the kernel knows (spec 69: the Cycles tab). */
export const KERNEL_CONTROLLER_IDS = [
  "fanuc", "haas", "mazak", "okuma", "siemens", "heidenhain", "linuxcnc", "generic", "grbl"
] as const

const postId = Schema.Literals(KERNEL_POST_IDS)
const controllerId = Schema.Literals(KERNEL_CONTROLLER_IDS)

// ---------------------------------------------------------------- post-processors

/** What every implemented post can write, and what it cannot. */
export const CamPostDialectsInput = Schema.Struct({
  /** The post to describe; every implemented post when absent. */
  post: optional(postId)
}).annotate({ description: "What each post dialect can write: canned cycles, arc formats, dwell unit, rotary axes, tip-control words, subprograms, spindle orientation and the controllers it serves." })

export const CamPostDialectsResult = Schema.Struct({
  ok: Schema.Literal(true),
  posts: Schema.Array(Schema.Struct({
    id: str,
    /** The control family it belongs to (a vendor post is a layer over a base dialect). */
    family: str,
    vendor: optional(Schema.Boolean),
    canned: Schema.Boolean,
    klartextCycles: optional(Schema.Boolean),
    arcModes: strings,
    dwell: Schema.Literals(["seconds", "milliseconds"]),
    rotary: Schema.Boolean,
    tcp: optional(Schema.Boolean),
    rigidTap: optional(Schema.Boolean),
    smoothing: optional(Schema.Boolean),
    subprograms: optional(Schema.Boolean),
    spindleOrient: optional(Schema.Boolean),
    tiltedPlane: optional(Schema.Boolean),
    inverseTime: optional(Schema.Boolean),
    /** The controllers whose words this post writes. */
    controllers: strings
  }))
})

/** Rewrite an NC program in another dialect; the deviation is what the rewrite introduced. */
export const CamPostConvertInput = Schema.Struct({
  /** The program to rewrite. */
  gcode: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2_000_000)),
  /** The dialect the program is written in (default `generic`). */
  source: optional(postId),
  /** The dialect to write it in. */
  target: postId,
  /** The name of the written program. */
  name: optional(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120))),
  /** Keep the comments of the source. Default true. */
  comments: optional(Schema.Boolean),
  /** Rapid traverse for the time estimate, mm/min. Default 10 000. */
  rapidFeed: optional(positive)
}).annotate({ description: "Rewrite an NC program in another post dialect; the answer carries the deviation the rewrite introduced and every error that stopped it." })

export const CamPostConvertResult = Schema.Struct({
  ok: Schema.Boolean,
  /** The rewritten program (empty when the conversion failed). */
  code: str,
  /** The largest distance between the source's and the target's feed paths, mm. */
  deviation: optional(num),
  /** The deviation the target's format allows, mm. */
  allowed: optional(num),
  errors: strings,
  notes: strings,
  /** The written program, its first lines. */
  preview: str,
  lines: int
})

// ---------------------------------------------------------------- NC verification

/** A cutter the replay uses, in the kernel's own terms (spec 29: the tool the program selects). */
export const KernelCutterInput = Schema.Struct({
  /** The tool number the program selects (T1, T2, ...). */
  number: int.check(Schema.isBetween({ minimum: 1, maximum: 999 })),
  kind: Schema.Literals(["flat", "ball", "bull", "chamfer", "spot", "drill", "facemill", "threadmill", "engraver", "tap", "reamer"]),
  diameter: positive.check(Schema.isLessThanOrEqualTo(250)),
  flutes: int.check(Schema.isBetween({ minimum: 1, maximum: 24 })),
  material: optional(Schema.Literals(["hss", "hss-co", "carbide", "pcd"])),
  coating: optional(Schema.Literals(["none", "tin", "ticn", "altin", "alcrn", "zrn", "dlc", "diamond"])),
  cornerRadius: optional(positive),
  angle: optional(num),
  pitch: optional(positive),
  fluteLength: positive,
  shankDiameter: positive,
  stickout: positive,
  /** The holder above the shank. */
  holder: optional(Schema.Struct({ diameter: positive, length: positive }))
})

/** The stock box the replay measures against. */
export const KernelStockBoxInput = Schema.Struct({
  min: vec3,
  max: vec3
})

/**
 * The kernel's own NC replay: the program is read back by the interpreter and replayed against the part and the stock
 * on the tri-dexel, independently of the IR that produced it (spec 29 §4, spec 68 P0-5).
 */
export const CamNcVerifyInput = Schema.Struct({
  /** The program to replay. */
  gcode: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2_000_000)),
  /** The stock the program cuts, in the program's coordinates. */
  stock: KernelStockBoxInput,
  /** The cutter of every tool the program selects. */
  tools: Schema.Array(KernelCutterInput).check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  /**
   * The part the program cuts, as closed meshes in the program's coordinates (`positions` and `indices`).
   * Without it the replay reports the removal and the travel only, and says so.
   */
  part: optional(Schema.Array(Schema.Struct({
    positions: Schema.Array(num).check(Schema.isMinLength(9)),
    indices: Schema.Array(int.check(Schema.isBetween({ minimum: 0, maximum: 2_000_000 })))
  })).check(Schema.isMaxLength(20))),
  /** The job tolerance, mm. Default 0.01. */
  tolerance: optional(num.check(Schema.isGreaterThanOrEqualTo(0))),
  /** The finish stock the program may leave on purpose, mm. Default 0.05. */
  allowance: optional(num.check(Schema.isGreaterThanOrEqualTo(0))),
  /** The lattice cell of the replay, mm. Default 0.1. */
  cell: optional(positive),
  /** The machine's travel limits; a move outside them is a finding. */
  travel: optional(Schema.Struct({ minX: num, maxX: num, minY: num, maxY: num, minZ: num, maxZ: num })),
  /** Where the tool stands before the first block, in the program's coordinates. */
  start: optional(vec3),
  /** The unit of `G4 P`. Default seconds. */
  dwell: optional(Schema.Literals(["seconds", "milliseconds"])),
  /** The program is written for an Okuma control (its `G84` expansion differs). */
  okuma: optional(Schema.Boolean),
  /** The cell visits the replay may spend. Default 2e9. */
  budget: optional(int.check(Schema.isBetween({ minimum: 1, maximum: 100_000_000_000 })))
}).annotate({ description: "The kernel's own NC replay: the program is read back and replayed against the part, the stock and the tools on the tri-dexel, independently of the IR that produced it." })

export const CamNcVerifyResult = Schema.Struct({
  ok: Schema.Boolean,
  /** Every move was placed and replayed and the part is closed: the figures are a verdict. */
  complete: Schema.Boolean,
  /** Why the replay is not complete. */
  reasons: strings,
  findings: Schema.Array(Schema.Struct({
    kind: Schema.Literals(["gouge", "rapid-in-stock", "travel", "unknown-tool", "unplaced", "interpreter"]),
    message: str,
    line: optional(int),
    point: optional(vec3),
    /** The gouge depth along the part normal, mm. */
    depth: optional(num)
  })),
  /** The material cut away and the material left, with the declared error of both figures, mm. */
  gouge: Schema.Struct({ lower: num, upper: num, error: num }),
  left: Schema.Struct({ lower: num, upper: num, error: num }),
  /** The declared error of every figure, mm. */
  errorBound: num,
  /** The deviation the figures are read against, mm. */
  threshold: num,
  /** The motions the interpreter produced, and how many of them cut. */
  moves: int,
  feedMoves: int,
  /** The lattice cell the replay used, mm. */
  cell: num
})

// ---------------------------------------------------------------- five-axis and motion

/** A tool direction in part coordinates: the outward surface normal the tool comes down on. */
export const CamFiveAxisInput = Schema.Struct({
  /** The machine whose table kinematics are used (a preset of the catalogue). */
  machine: optional(id),
  /** The directions the tool must point along, in part coordinates. */
  directions: Schema.Array(vec3).check(Schema.isMinLength(1), Schema.isMaxLength(200)),
  /** The C angle the table stands at before the first direction, for the unwrapped branch. */
  previousC: optional(num),
  /** The layout, when the machine does not name one. */
  layout: optional(Schema.Literals(["table-AC", "table-BC"])),
  /** The tilt range of the table, degrees. */
  tilt: optional(Schema.Array(num).check(Schema.isMinLength(2)).check(Schema.isMaxLength(2))),
  /** The rotation range of the table, degrees. */
  rotation: optional(Schema.Array(num).check(Schema.isMinLength(2)).check(Schema.isMaxLength(2))),
  /** The centre of rotation of the table (MRZP), in machine coordinates, mm. */
  pivot: optional(vec3)
}).annotate({ description: "The table poses of a 5-axis machine for a list of tool directions: the angles, the branch, the residual and the travel." })

export const CamFiveAxisResult = Schema.Struct({
  ok: Schema.Boolean,
  /** The layout the poses were planned for. */
  layout: optional(Schema.Literals(["table-AC", "table-BC"])),
  /** One entry per direction: the angles that reach it. */
  candidates: Schema.Array(Schema.Struct({
    direction: vec3,
    /** The angles of the table (A or B, and C). */
    angles: Schema.Struct({ a: optional(num), b: optional(num), c: num }),
    /** The tilt, degrees. */
    tilt: num,
    /** The C of the candidate, unwrapped, degrees. */
    c: num,
    /** |R·d - z|: 0 when the table puts the direction exactly on machine +Z. */
    residual: num,
    /** 1 at zero tilt (the C of the table is undetermined there), 0 when the tilt is far from zero. */
    singularity: num,
    /** Which of the two solutions of the layout this is. */
    branch: int
  })),
  /** The rotary travel of the planned path, degrees. */
  travel: optional(num),
  /** Why the directions cannot be reached. */
  error: optional(str)
})

/** The simultaneous 5-axis plan of a list of points, with the collision verdict of every move. */
export const CamMotionInput = Schema.Struct({
  /** The machine whose table kinematics are used. */
  machine: optional(id),
  /** The points the tool visits, in part coordinates. */
  locations: Schema.Array(Schema.Struct({
    /** The tip point, in part coordinates. */
    point: vec3,
    /** The tool axis (into the part), in part coordinates. */
    direction: vec3
  })).check(Schema.isMinLength(1), Schema.isMaxLength(500)),
  /** The cutter in the spindle. */
  cutter: KernelCutterInput,
  /** The part box, in part coordinates. */
  part: Schema.Struct({
    /** The centre of the part box, mm. */
    centre: vec3,
    /** The half extents of the box, mm. */
    half: vec3
  }),
  /** The spindle nose in machine coordinates, mm. */
  nose: optional(vec3),
  /** The controller's interpolation tolerance of the tip, mm. */
  tolerance: optional(positive.check(Schema.isLessThanOrEqualTo(1))),
  /** The clearance the moves must keep, mm. */
  margin: optional(positive.check(Schema.isLessThanOrEqualTo(100))),
  /** The table pose before the first point. */
  start: optional(Schema.Struct({ a: optional(num), b: optional(num), c: optional(num) })),
  layout: optional(Schema.Literals(["table-AC", "table-BC"])),
  tilt: optional(Schema.Array(num).check(Schema.isMinLength(2)).check(Schema.isMaxLength(2))),
  rotation: optional(Schema.Array(num).check(Schema.isMinLength(2)).check(Schema.isMaxLength(2))),
  pivot: optional(vec3)
}).annotate({ description: "The simultaneous 5-axis plan of a list of points: the table poses, the blocks per move, the tip deviation and the collision verdict." })

export const CamMotionResult = Schema.Struct({
  ok: Schema.Boolean,
  /** The table poses: the start pose, then one per point. */
  poses: Schema.Array(Schema.Struct({ a: optional(num), b: optional(num), c: num })),
  /** The rotary travel of the planned path, degrees. */
  travel: num,
  /** One entry per move. */
  segments: Schema.Array(Schema.Struct({
    from: int,
    to: int,
    /** The equal joint blocks the controller runs the move in. */
    blocks: int,
    /** The tip interpolation error at the ends of the move, mm. */
    deviation: num,
    verdict: Schema.Literals(["clear", "collision", "unresolved"]),
    /** The smallest certified clearance over the move's blocks, mm. */
    clearance: num
  })),
  /** The overall verdict: a collision anywhere wins over unresolved, and both over clear. */
  verdict: Schema.Literals(["clear", "collision", "unresolved"]),
  error: optional(str)
})

// ---------------------------------------------------------------- clearance

/** The holder and the shank against the table, move by move. */
export const CamClearanceInput = Schema.Struct({
  /** The program to check. */
  gcode: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2_000_000)),
  /** The cutter of every tool the program selects. */
  tools: Schema.Array(KernelCutterInput).check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  /** The table the spindle must clear. */
  table: Schema.Struct({
    cx: num,
    cy: num,
    top: num,
    length: positive,
    width: positive
  }),
  /** The clearance the moves must keep, mm. Default 0. */
  margin: optional(positive.check(Schema.isLessThanOrEqualTo(100))),
  /** The layout and pivot of the rotary table, when the program turns it. */
  rotary: optional(Schema.Struct({
    layout: Schema.Literals(["table-AC", "table-BC"]),
    pivot: vec3
  }))
}).annotate({ description: "The holder and shank of every move against the table: the smallest certified clearance and the first overlap." })

export const CamClearanceResult = Schema.Struct({
  ok: Schema.Boolean,
  /** Linear and arc moves checked. */
  checked: int,
  /** Moves with the table turned that were not checked (no rotary scene given). */
  rotaryMoves: int,
  /** Moves that could not be proven clear within the subdivision depth. */
  unresolved: int,
  /** The smallest certified clearance over the clear moves, mm. */
  minClearance: optional(num),
  /** The first overlap, in NC order. */
  first: optional(Schema.Struct({ line: int, point: vec3, clearance: num })),
  error: optional(str)
})

// ---------------------------------------------------------------- printing

/** What a print program deposits, and what it must match. */
export const CamPrintProgramInput = Schema.Struct({
  /** The print program to analyse. */
  gcode: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4_000_000)),
  /** The build volume the program must stay in, mm. */
  bed: optional(Schema.Struct({ width: positive, depth: positive, height: positive, origin: optional(Schema.Literals(["corner", "center"])) })),
  /** The nozzle diameter, mm. Default 0.4. */
  nozzle: optional(positive),
  /** The filament diameter, mm. Default 1.75. */
  filamentDiameter: optional(positive),
  /** The acceleration of the planner, mm/s2. Default 1500. */
  acceleration: optional(positive),
  /** The junction jerk of the planner, mm/s. Default 10. */
  jerk: optional(positive),
  /** The volume of the solid the program prints, mm3. */
  partVolume: optional(positive),
  /** The lower bound of the model deposit (walls and skin), mm3. */
  shellVolume: optional(positive),
  /** The volume allowed beyond the part for supports, adhesion and priming, mm3. */
  extraVolume: optional(positive),
  /** The extrusion multiplier of the profile, 1 = nominal. */
  flow: optional(positive),
  /** The relative slack on the volume bounds. Default 0.08. */
  tolerance: optional(num.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
  /** The time the slicer claims, seconds, to be compared with the planner. */
  claimedTimeSeconds: optional(positive),
  /** The agreement required between the claim and the planner. Default 0.25. */
  timeTolerance: optional(num.check(Schema.isBetween({ minimum: 0, maximum: 1 })))
}).annotate({ description: "What a print program deposits and how long it takes, against the part it must print." })

export const CamPrintProgramResult = Schema.Struct({
  ok: Schema.Boolean,
  /** The volume deposited, mm3, and what the program had to print. */
  volume: num,
  /** The time the program takes, seconds. */
  timeSeconds: num,
  /** The length of filament, mm. */
  filamentMm: num,
  /** The layers the program prints, and their height, mm. */
  layers: int,
  /** The height of the layers, mm. */
  layerHeight: num,
  /** The bed the program uses, mm. */
  bounds: optional(Schema.Struct({ min: vec3, max: vec3 })),
  /** The checks the program passed or failed. */
  checks: Schema.Array(Schema.Struct({ id: str, status: Schema.Literals(["passed", "failed", "unresolved"]), detail: str })),
  /** The issues the analyser found, by severity. */
  issues: Schema.Array(Schema.Struct({ severity: str, code: str, line: int, message: str })),
  /** The tools the program uses. */
  tools: Schema.Array(Schema.Struct({ tool: int, filamentMm: num, volume: num })),
  /** The time the slicer claimed, seconds, when it was given. */
  claimedTimeSeconds: optional(num),
  error: optional(str)
})

/** What a print job costs. */
export const CamPrintCostInput = Schema.Struct({
  /** The filament used, grams. */
  grams: positive,
  /** The machine time, hours. */
  hours: positive,
  /** The price of a kilogram of filament. */
  filamentPerKg: positive,
  /** The machine's own cost, per hour. */
  machinePerHour: optional(positive),
  /** The machine's power, kW. */
  powerKw: optional(positive),
  /** The price of a kWh. */
  energyPerKwh: optional(positive),
  /** The share of printed material that fails or is purged, 0..1. Default 0.05. */
  waste: optional(num.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
  /** The labour of one part, in the same currency. */
  labour: optional(positive)
}).annotate({ description: "What a print job costs: the material, the machine time, the energy and the labour." })

export const CamPrintCostResult = Schema.Struct({
  ok: Schema.Literal(true),
  material: num,
  machine: num,
  energy: num,
  labour: num,
  total: num
})

// ---------------------------------------------------------------- cycles and macros

/** The canned cycles and macros a controller supports, and the NC they write. */
export const CamCyclesInput = Schema.Struct({
  /** The controller to ask about. */
  controller: controllerId,
  /** The cycle or macro to write the NC for. */
  cycle: optional(id),
  /** The values of the cycle's parameters. */
  values: optional(record)
}).annotate({ description: "The canned cycles and macros a controller supports, and the NC one of them writes." })

export const CamCyclesResult = Schema.Struct({
  ok: Schema.Boolean,
  controller: str,
  /** Whether the control has fixed cycles and variables at all. */
  support: Schema.Struct({ cycles: Schema.Boolean, macros: Schema.Boolean, note: optional(str) }),
  /** The cycles the controller can insert. */
  cycles: Schema.Array(Schema.Struct({
    id: str,
    name: str,
    description: str,
    family: str,
    /** The parameters the cycle takes. */
    parameters: Schema.Array(Schema.Struct({
      name: str,
      label: str,
      type: Schema.Literals(["number", "select", "checkbox", "text"]),
      defaultValue: Schema.Unknown,
      min: optional(num),
      max: optional(num),
      unit: optional(str),
      description: optional(str)
    }))
  })),
  /** The variable and macro snippets the controller can write. */
  macros: Schema.Array(Schema.Struct({ id: str, name: str, description: str })),
  /** The NC the requested cycle or macro writes. */
  code: optional(str),
  error: optional(str)
})

// ---------------------------------------------------------------- turning inserts

/** The insert that cuts a contour, and the check of the profile against its limits. */
export const CamTurningToolInput = Schema.Struct({
  /** The insert's ISO designation (CNMG120408). */
  designation: optional(Schema.String.check(Schema.isMinLength(3), Schema.isMaxLength(20))),
  /** The contour the tool must cut, as (radius, z) points in the lathe's coordinates. */
  contour: optional(Schema.Array(Schema.Struct({ r: positive, z: num })).check(Schema.isMinLength(2), Schema.isMaxLength(500))),
  /** The approach angle of the insert, degrees (the nose angle). */
  angle: optional(num.check(Schema.isBetween({ minimum: 0, maximum: 180 }))),
  /** The flank angle of the insert, degrees. */
  kappa: optional(num.check(Schema.isBetween({ minimum: 0, maximum: 180 })))
}).annotate({ description: "The turning insert library, the limits of an insert, and the check of a profile against them." })

export const CamTurningToolResult = Schema.Struct({
  ok: Schema.Boolean,
  /** The inserts the library holds. */
  library: strings,
  /** The insert the designation names. */
  insert: optional(Schema.Struct({
    designation: str,
    name: str,
    /** The nose angle, degrees. */
    angle: num,
    /** The flank angle, degrees. */
    kappa: num,
    /** The nose radius, mm. */
    noseRadius: num,
    /** The thickness of the insert, mm. */
    thickness: num
  })),
  /** The limits of the insert (what it can and cannot cut). */
  limits: optional(Schema.Struct({
    /** The cutting edge, degrees. */
    edge: num,
    /** The strength of the edge, degrees. */
    strength: num,
    /** The smallest diameter the insert can turn, mm. */
    minDiameter: num
  })),
  /** The check of the contour against the limits. */
  check: optional(Schema.Struct({
    ok: Schema.Boolean,
    /** The parts of the contour that break a limit. */
    violations: Schema.Array(Schema.Struct({ kind: str, detail: str })),
    /** The depth the insert can reach, mm. */
    maxDepth: num
  })),
  error: optional(str)
})

// ---------------------------------------------------------------- sheet metal and weldments

/** The sheet-metal rules of a part, and the cut list of a weldment. */
export const CadSheetMetalInput = Schema.Struct({
  /** The part to check (the rules of a flat pattern). */
  part: optional(Schema.Struct({
    /** The sheet thickness, mm. */
    thickness: positive,
    /** The inside bend radius, mm. */
    bendRadius: num.check(Schema.isGreaterThanOrEqualTo(0)),
    /** The flanges of the part. */
    flanges: optional(Schema.Array(Schema.Struct({ id: id, length: positive })).check(Schema.isMaxLength(100))),
    /** The holes of the part. */
    holes: optional(Schema.Array(Schema.Struct({
      id: id,
      diameter: positive,
      /** The distance of the hole's edge to the bend line, mm. */
      distanceToBend: optional(positive),
      /** The distance of the hole's edge to the part's edge, mm. */
      distanceToEdge: optional(positive)
    })).check(Schema.isMaxLength(200))),
    /** The bend reliefs of the part. */
    reliefs: optional(Schema.Array(Schema.Struct({ id: id, depth: positive, width: positive })).check(Schema.isMaxLength(100)))
  })),
  /** The members of the weldment, for its cut list. */
  members: optional(Schema.Array(Schema.Struct({
    id: id,
    /** The section of the member. */
    profile: Schema.Union([
      Schema.Struct({ kind: Schema.Literal("rectTube"), width: positive, height: positive, wall: positive, outerRadius: optional(positive) }),
      Schema.Struct({ kind: Schema.Literal("roundTube"), diameter: positive, wall: positive }),
      Schema.Struct({ kind: Schema.Literal("flatBar"), width: positive, thickness: positive }),
      Schema.Struct({ kind: Schema.Literal("angle"), legA: positive, legB: positive, thickness: positive }),
      Schema.Struct({ kind: Schema.Literal("channel"), height: positive, flange: positive, web: positive, flangeThickness: positive }),
      Schema.Struct({ kind: Schema.Literal("iBeam"), height: positive, flange: positive, web: positive, flangeThickness: positive })
    ]),
    /** The stock length to the long point of the ends, mm. */
    length: positive,
    /** The end cut, degrees from square. */
    miterStart: optional(num.check(Schema.isBetween({ minimum: -90, maximum: 90 }))),
    /** The end cut, degrees from square. */
    miterEnd: optional(num.check(Schema.isBetween({ minimum: -90, maximum: 90 })))
  })).check(Schema.isMaxLength(500))),
  /** The density of the material, g/cm3, for the masses of the cut list. */
  density: optional(positive)
}).annotate({ description: "The sheet-metal design rules of a flat pattern, and the cut list of a weldment." })

export const CadSheetMetalResult = Schema.Struct({
  ok: Schema.Boolean,
  /** The rules the part breaks. */
  findings: Schema.Array(Schema.Struct({
    rule: str,
    severity: str,
    feature: str,
    measured: num,
    required: num,
    message: str
  })),
  /** How many features were checked. */
  checked: int,
  /** The cut list of the weldment. */
  cutList: optional(Schema.Struct({
    rows: Schema.Array(Schema.Struct({
      item: int,
      profile: str,
      length: num,
      miterStart: num,
      miterEnd: num,
      quantity: int,
      members: strings,
      volume: num,
      mass: optional(num)
    })),
    totalLength: num,
    totalVolume: num,
    totalMass: optional(num)
  })),
  error: optional(str)
})

// ---------------------------------------------------------------- exact B-rep operations

/** The exact B-rep operations on a parametric part (spec 33: the exact kernel is the truth). */
export const CadExactOpsInput = Schema.Struct({
  /** The parametric history the operations run on. */
  history: Schema.Unknown,
  /** The operation to run. */
  op: Schema.Literals(["boolean", "blend", "loft", "sweep", "heal", "export", "naming"]),
  /** The bodies the operation works on, by their index in the rebuild (the boolean takes two). */
  bodies: optional(Schema.Array(int.check(Schema.isBetween({ minimum: 0, maximum: 64 }))).check(Schema.isMaxLength(4))),
  /** The boolean to apply (the `boolean` operation). */
  booleanOp: optional(Schema.Literals(["union", "difference", "intersection"])),
  /** The fillet or chamfer size, mm (the `blend` operation). */
  size: optional(positive.check(Schema.isLessThanOrEqualTo(1000))),
  /** The blend style (the `blend` operation). */
  style: optional(Schema.Literals(["fillet", "chamfer"])),
  /** The export format (the `export` operation). */
  format: optional(Schema.Literals(["stl", "obj", "gltf", "3mf"])),
  /** The unit of the exported mesh (the `export` operation). */
  unit: optional(Schema.Literals(["micron", "millimeter", "centimeter", "meter", "inch", "foot"])),
  /** The tolerance of the healed body, mm (the `heal` operation). */
  tolerance: optional(positive.check(Schema.isLessThanOrEqualTo(10))),
  /** The budget of the rebuild, ms. Default 60000. */
  budgetMs: optional(int.check(Schema.isBetween({ minimum: 100, maximum: 600_000 })))
}).annotate({ description: "The exact B-rep operations on a parametric part: booleans, blends, lofts, sweeps, heals and mesh exports, with the volumes and the validity of the result." })

export const CadExactOpsResult = Schema.Struct({
  ok: Schema.Boolean,
  /** The bodies the operation produced. */
  bodies: Schema.Array(Schema.Struct({
    id: str,
    /** The volume of the body, mm3. */
    volume: num,
    /** The surface area of the body, mm2. */
    area: optional(num),
    /** The faces of the body. */
    faces: int,
    /** The body is a valid closed solid. */
    valid: Schema.Boolean,
    /** Why the body is not valid, when it is not. */
    reason: optional(str)
  })),
  /** The exported mesh, base64 (the `export` operation). */
  data: optional(str),
  /** The exported mesh's format and size. */
  format: optional(str),
  bytes: optional(int),
  /** The naming health of the rebuilt bodies (the `naming` operation). */
  naming: optional(Schema.Array(Schema.Struct({
    body: str,
    /** The faces without a name. */
    unnamed: int,
    /** The names that are ordinal (a face that kept its index instead of its name). */
    ordinal: int,
    /** The names that repeat. */
    duplicate: int
  }))),
  warnings: strings,
  error: optional(str)
})

/** Every input schema of the kernel operations, by action name. */
export const KERNEL_ACTION_INPUTS = {
  "cam.post_dialects": CamPostDialectsInput,
  "cam.post_convert": CamPostConvertInput,
  "cam.nc_verify": CamNcVerifyInput,
  "cam.five_axis": CamFiveAxisInput,
  "cam.motion": CamMotionInput,
  "cam.clearance": CamClearanceInput,
  "cam.print_program": CamPrintProgramInput,
  "cam.print_cost": CamPrintCostInput,
  "cam.cycles": CamCyclesInput,
  "cam.turning_tool": CamTurningToolInput,
  "cad.sheet_metal": CadSheetMetalInput,
  "cad.exact_ops": CadExactOpsInput
} as const
