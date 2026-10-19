/**
 * The machine around the part (spec 32 §4.1, P5): a milling machine as links that its axes move — base, column, head with
 * the spindle, table, trunnion cradle and rotary platter, fork head — each with box / cylinder bodies, the axis travels and
 * the rotary limits. One description for the preview (what moves where), the readout (the joint values) and the checks
 * (travel and rotary limits on the playback timeline).
 *
 *   joints        the linear axes X Y Z are the tool tip in the machine's work coordinates; the table carries some of them
 *                 (it moves the other way), the head the others. A B C come from the program (`rotary.ts`).
 *   machine frame the base stands still: the table travels and turns under the head, as on the machine.
 *   part frame    the part stands still (the preview's default): every link is drawn relative to it.
 *
 * Presets are typical machines of each class sized from the table and the travels a shop entered; every number not given is
 * listed in `assumed` and drawn translucent. Not a qualified digital twin of a particular machine (spec 29 §14).
 */
import type { Vec3 } from "../../cad/vec.ts"
import type { MachineSetup } from "./machine-setup.ts"
import { headRotationOf, machinePointOf, rotationOf, type Angles, type MachineRotaryLayout, type RotarySetup } from "./rotary.ts"
import { poseAt, type Timeline } from "./timeline.ts"

export type MachinePresetId = "vmc-3" | "vmc-4a" | "trunnion-ac" | "trunnion-bc" | "head-table-bc" | "head-head-ac" | "router-gantry"

export const MACHINE_PRESETS: ReadonlyArray<{ readonly id: MachinePresetId; readonly name: string; readonly layout?: MachineRotaryLayout }> = [
  { id: "vmc-3", name: "Vertical machining centre (table X/Y, head Z)" },
  { id: "vmc-4a", name: "VMC with a 4th axis (A on X)", layout: "table-AC" },
  { id: "trunnion-ac", name: "5-axis trunnion table A/C", layout: "table-AC" },
  { id: "trunnion-bc", name: "5-axis trunnion table B/C", layout: "table-BC" },
  { id: "head-table-bc", name: "5-axis B head, C table", layout: "head-table-BC" },
  { id: "head-head-ac", name: "5-axis fork head A/C", layout: "head-head-AC" },
  { id: "router-gantry", name: "Gantry router (head X/Y/Z)" }
]

/** What a link is, and so what moves it. */
export type LinkRole = "base" | "column" | "head" | "spindle" | "table" | "cradle" | "platter" | "fork"
type Axis3 = "x" | "y" | "z"

/** A body in its link's machine-frame position at home (all joints 0). */
export type ModelShape =
  | { readonly type: "box"; readonly min: Vec3; readonly max: Vec3 }
  | { readonly type: "cylinder"; readonly axis: Axis3; readonly center: Vec3; readonly radius: number; readonly length: number }

export interface ModelBody { readonly id: string; readonly link: LinkRole; readonly shape: ModelShape }

export interface MachineModel {
  readonly preset: MachinePresetId
  readonly name: string
  readonly layout?: MachineRotaryLayout
  /** Linear axes the table carries (it moves opposite to the tool); the head carries the others. */
  readonly tableCarries: ReadonlyArray<Axis3>
  /** Of the head's axes, those the column (or the gantry) moves along with it. */
  readonly columnCarries: ReadonlyArray<Axis3>
  /** Travel of the tool tip in the work coordinates, mm. */
  readonly travel: { readonly x: readonly [number, number]; readonly y: readonly [number, number]; readonly z: readonly [number, number] }
  /** Rotary limits, degrees; a missing axis turns without end. */
  readonly rotaryLimits: Partial<Record<"a" | "b" | "c", readonly [number, number]>>
  /** Centre of the rotary motion (the table pivot of the program), work coordinates. */
  readonly pivot: Vec3
  readonly bodies: ReadonlyArray<ModelBody>
  readonly assumed: ReadonlyArray<string>
}

export interface MachineModelOptions {
  readonly preset?: MachinePresetId
  /** The machine's travels (a library machine's work volume), mm. */
  readonly travel?: { readonly x: number; readonly y: number; readonly z: number }
  /** Rotary tilt range of a 5-axis machine (`MachineForProgram.fiveAxis.tilt`), degrees. */
  readonly tilt?: readonly [number, number]
}

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z })
const box = (id: string, link: LinkRole, min: Vec3, max: Vec3): ModelBody => ({ id, link, shape: { type: "box", min, max } })
const cyl = (id: string, link: LinkRole, axis: Axis3, center: Vec3, radius: number, length: number): ModelBody => ({ id, link, shape: { type: "cylinder", axis, center, radius, length } })

/** The preset a set-up calls for: its rotary layout, else a VMC. */
export const presetFor = (setup: MachineSetup): MachinePresetId => {
  if (setup.kind !== "mill" || setup.rotary === undefined) return "vmc-3"
  switch (setup.rotary.layout) {
    case "table-BC": return "trunnion-bc"
    case "head-table-BC": return "head-table-bc"
    case "head-head-AC": return "head-head-ac"
    case "table-AC": return setup.axes === 4 ? "vmc-4a" : "trunnion-ac"
  }
}

/**
 * The machine model of a milling set-up. The table is the set-up's (kernel machine or assumed); its top is under the stock's
 * workholding; travels and rotary limits come from `options` or are typical of the class (and listed as assumed).
 */
export const machineModelOf = (setup: MachineSetup, options: MachineModelOptions = {}): MachineModel | undefined => {
  if (setup.kind !== "mill") return undefined
  const preset = options.preset ?? presetFor(setup)
  const info = MACHINE_PRESETS.find((p) => p.id === preset)!
  const assumed: string[] = []
  const s = setup.stock
  const cx = (s.min.x + s.max.x) / 2, cy = (s.min.y + s.max.y) / 2
  // The table top: under the workholding (the bodies of `machine-bodies.ts` stand on it).
  const hold = setup.workholding.kind === "vise" ? setup.workholding.parallels + 60 : setup.workholding.kind === "clamps" ? 0 : 0
  const tableTop = s.min.z - hold
  const L = setup.table.length, W = setup.table.width
  const travel = options.travel ?? (assumed.push("travel"), { x: Math.max(L * 0.8, 300), y: Math.max(W, 250), z: Math.max(400, (s.max.z - tableTop) + 300) })
  const tilt = options.tilt ?? (info.layout !== undefined ? (assumed.push("rotary limits"), [-120, 120] as const) : undefined)
  const rotaryLimits: MachineModel["rotaryLimits"] = info.layout === "table-AC" || info.layout === "head-head-AC" ? (tilt ? { a: tilt } : {}) : info.layout !== undefined && tilt ? { b: tilt } : {}
  const tableCarries: ReadonlyArray<Axis3> = preset === "vmc-3" || preset === "vmc-4a" ? ["x", "y"] : preset === "trunnion-ac" || preset === "trunnion-bc" ? ["y"] : []
  const columnCarries: ReadonlyArray<Axis3> = preset === "router-gantry" ? ["y"] : preset === "vmc-3" || preset === "vmc-4a" ? [] : ["x"]
  const pivot = setup.rotary?.pivot ?? v(cx, cy, tableTop)
  const bodies: ModelBody[] = []
  // The column stands behind the table (+Y); the head reaches over the work zero from it.
  const back = cy + W / 2 + 120
  const headTop = tableTop + travel.z + 250
  const base = { min: v(cx - L / 2 - 100, cy - W / 2 - 150, tableTop - 450), max: v(cx + L / 2 + 100, back + 350, tableTop - 120) }
  if (preset === "router-gantry") {
    bodies.push(box("bed", "base", v(cx - travel.x / 2 - 150, cy - travel.y / 2 - 150, tableTop - 200), v(cx + travel.x / 2 + 150, cy + travel.y / 2 + 150, tableTop)))
    bodies.push(box("gantry-left", "column", v(cx - travel.x / 2 - 140, -40, tableTop), v(cx - travel.x / 2 - 60, 40, headTop)))
    bodies.push(box("gantry-right", "column", v(cx + travel.x / 2 + 60, -40, tableTop), v(cx + travel.x / 2 + 140, 40, headTop)))
    bodies.push(box("gantry-beam", "column", v(cx - travel.x / 2 - 140, -60, headTop - 120), v(cx + travel.x / 2 + 140, 60, headTop)))
  } else {
    bodies.push(box("base", "base", base.min, base.max))
    bodies.push(box("column", "column", v(-180, back, tableTop - 120), v(180, back + 320, headTop)))
  }
  // The head: a ram from the column to the spindle, the spindle housing round the tool axis. Home is the work zero.
  if (preset === "head-head-ac") {
    bodies.push(box("ram", "head", v(-90, -90, 260), v(90, back, 420)))
    bodies.push(cyl("fork", "fork", "z", v(0, 0, 220), 95, 80))
    bodies.push(box("fork-arm-left", "fork", v(-115, -45, 60), v(-85, 45, 180)))
    bodies.push(box("fork-arm-right", "fork", v(85, -45, 60), v(115, 45, 180)))
    bodies.push(cyl("spindle", "spindle", "z", v(0, 0, 75), 65, 150))
  } else if (preset === "head-table-bc") {
    bodies.push(box("ram", "head", v(-110, -110, 300), v(110, back, 460)))
    bodies.push(cyl("b-axis", "fork", "y", v(0, 0, 250), 110, 200))
    bodies.push(cyl("spindle", "spindle", "z", v(0, 0, 100), 70, 200))
  } else {
    bodies.push(box("ram", "head", v(-110, -110, 260), v(110, preset === "router-gantry" ? 60 : back, 420)))
    bodies.push(cyl("spindle", "spindle", "z", v(0, 0, 110), 75, 220))
  }
  // The table, and the rotary parts that carry the part.
  if (preset === "trunnion-ac" || preset === "vmc-4a") {
    const r = Math.min(W, L) * 0.35
    const pz = pivot.z
    bodies.push(box("table", "table", v(cx - L / 2, cy - W / 2, tableTop - 120), v(cx + L / 2, cy + W / 2, tableTop - 60)))
    if (preset === "trunnion-ac") {
      bodies.push(box("trunnion-left", "table", v(cx - r - 110, cy - 80, tableTop - 60), v(cx - r - 40, cy + 80, pz + 40)))
      bodies.push(box("trunnion-right", "table", v(cx + r + 40, cy - 80, tableTop - 60), v(cx + r + 110, cy + 80, pz + 40)))
      bodies.push(box("cradle", "cradle", v(cx - r - 40, cy - r, pz - 70), v(cx + r + 40, cy + r, pz - 30)))
    } else {
      bodies.push(cyl("a-head", "table", "x", v(cx - L / 2 + 60, cy, pz), r * 0.8, 120))
      bodies.push(cyl("a-tail", "table", "x", v(cx + L / 2 - 40, cy, pz), r * 0.3, 60))
    }
    bodies.push(cyl("platter", "platter", "z", v(cx, cy, pz - 15), r, 30))
  } else if (preset === "trunnion-bc") {
    const r = Math.min(W, L) * 0.35
    const pz = pivot.z
    bodies.push(box("table", "table", v(cx - L / 2, cy - W / 2, tableTop - 120), v(cx + L / 2, cy + W / 2, tableTop - 60)))
    bodies.push(box("trunnion-back", "table", v(cx - 80, cy + r + 40, tableTop - 60), v(cx + 80, cy + r + 110, pz + 40)))
    bodies.push(box("cradle", "cradle", v(cx - r, cy - r - 40, pz - 70), v(cx + r, cy + r + 40, pz - 30)))
    bodies.push(cyl("platter", "platter", "z", v(cx, cy, pz - 15), r, 30))
  } else if (preset === "head-table-bc") {
    const r = Math.min(W, L) * 0.4
    bodies.push(box("table", "table", v(cx - L / 2, cy - W / 2, tableTop - 140), v(cx + L / 2, cy + W / 2, tableTop - 60)))
    bodies.push(cyl("platter", "platter", "z", v(pivot.x, pivot.y, tableTop - 30), r, 60))
  } else if (preset !== "router-gantry") {
    bodies.push(box("table", "table", v(cx - L / 2, cy - W / 2, tableTop - 60), v(cx + L / 2, cy + W / 2, tableTop)))
  }
  return {
    preset, name: info.name, ...(info.layout !== undefined ? { layout: info.layout } : {}), tableCarries, columnCarries,
    travel: { x: [cx - travel.x / 2, cx + travel.x / 2], y: [cy - travel.y / 2, cy + travel.y / 2], z: [tableTop, tableTop + travel.z] },
    rotaryLimits, pivot, bodies, assumed
  }
}

// -- poses ------------------------------------------------------------------------------------------------------------------

/** A rigid transform, row-major 4x4 (the last row 0 0 0 1). */
export type Mat4 = readonly number[]
export const IDENTITY4: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const translate = (t: Vec3): Mat4 => [1, 0, 0, t.x, 0, 1, 0, t.y, 0, 0, 1, t.z, 0, 0, 0, 1]
const rotateAbout = (m: readonly number[], p: Vec3): Mat4 => {
  // x -> M (x - p) + p
  const q = { x: m[0]! * p.x + m[1]! * p.y + m[2]! * p.z, y: m[3]! * p.x + m[4]! * p.y + m[5]! * p.z, z: m[6]! * p.x + m[7]! * p.y + m[8]! * p.z }
  return [m[0]!, m[1]!, m[2]!, p.x - q.x, m[3]!, m[4]!, m[5]!, p.y - q.y, m[6]!, m[7]!, m[8]!, p.z - q.z, 0, 0, 0, 1]
}
export const mul4 = (a: Mat4, b: Mat4): Mat4 => {
  const o: number[] = []
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) o.push(a[r * 4]! * b[c]! + a[r * 4 + 1]! * b[4 + c]! + a[r * 4 + 2]! * b[8 + c]! + a[r * 4 + 3]! * b[12 + c]!)
  return o
}
/** The inverse of a rigid transform. */
export const invert4 = (m: Mat4): Mat4 => {
  const t = { x: m[3]!, y: m[7]!, z: m[11]! }
  const r = [m[0]!, m[4]!, m[8]!, m[1]!, m[5]!, m[9]!, m[2]!, m[6]!, m[10]!]
  return [r[0]!, r[1]!, r[2]!, -(r[0]! * t.x + r[1]! * t.y + r[2]! * t.z), r[3]!, r[4]!, r[5]!, -(r[3]! * t.x + r[4]! * t.y + r[5]! * t.z), r[6]!, r[7]!, r[8]!, -(r[6]! * t.x + r[7]! * t.y + r[8]! * t.z), 0, 0, 0, 1]
}
export const apply4 = (m: Mat4, p: Vec3): Vec3 => ({ x: m[0]! * p.x + m[1]! * p.y + m[2]! * p.z + m[3]!, y: m[4]! * p.x + m[5]! * p.y + m[6]! * p.z + m[7]!, z: m[8]! * p.x + m[9]! * p.y + m[10]! * p.z + m[11]! })

export interface Joints { readonly x: number; readonly y: number; readonly z: number; readonly a?: number; readonly b?: number; readonly c?: number }

export interface MachinePose {
  readonly joints: Joints
  /** Where each link is drawn, display coordinates (the frame asked for). */
  readonly links: Readonly<Record<LinkRole, Mat4>>
  /** The transform of everything on the table (part, stock, path, workholding): the identity in the part frame. */
  readonly part: Mat4
  /** The tool tip and the tool axis, display coordinates. */
  readonly tip: Vec3
  readonly axis: Vec3
}

/**
 * The machine at a program point and its angles. `point` is in the program's coordinates (`rotary.coordinates` says which);
 * `gauge` is the tool's length from the tip to the spindle nose: the spindle housing sits there along the tool axis.
 */
export const machinePose = (model: MachineModel, point: Vec3, angles: Angles, rotary: RotarySetup | undefined, gauge: number, frame: "part" | "machine" = "part"): MachinePose => {
  const r = rotary ?? { layout: model.layout ?? "table-AC", pivot: model.pivot, coordinates: "part" as const, assumed: true, reasons: [] }
  const rotaryUsed = rotary !== undefined
  const table = rotaryUsed ? rotationOf(angles, r) : [1, 0, 0, 0, 1, 0, 0, 0, 1]
  const head = rotaryUsed ? headRotationOf(angles, r) : [1, 0, 0, 0, 1, 0, 0, 0, 1]
  // The tool tip in the machine (the table already turned): the linear joints.
  const m = rotaryUsed ? machinePointOf(point, angles, r) : point
  const carried = { x: model.tableCarries.includes("x") ? m.x : 0, y: model.tableCarries.includes("y") ? m.y : 0, z: model.tableCarries.includes("z") ? m.z : 0 }
  const tip = { x: m.x - carried.x, y: m.y - carried.y, z: m.z - carried.z }
  const moveTable = translate({ x: -carried.x, y: -carried.y, z: -carried.z })
  const turn = rotateAbout(table, r.pivot)
  const part = mul4(moveTable, turn)
  // The cradle tilts only (A or B); the platter tilts and turns.
  const tiltOnly = !rotaryUsed ? IDENTITY4 : r.layout === "table-AC" ? rotateAbout(rotationOf({ a: angles.a ?? 0, c: 0 }, r), r.pivot) : r.layout === "table-BC" ? rotateAbout(rotationOf({ b: angles.b ?? 0, c: 0 }, r), r.pivot) : IDENTITY4
  const headAt = mul4(translate(tip), rotateAbout(head, { x: 0, y: 0, z: 0 }))
  const forkOnly = rotaryUsed && r.layout === "head-head-AC" ? mul4(translate(tip), rotateAbout(headRotationOf({ c: angles.c ?? 0 }, r), { x: 0, y: 0, z: 0 })) : headAt
  // The spindle housing stands `gauge` up the tool axis: it is modelled at home with its nose at Z = 0 shifted by the gauge.
  const lift = translate({ x: 0, y: 0, z: gauge })
  const machineLinks: Record<LinkRole, Mat4> = {
    base: IDENTITY4,
    column: translate({ x: model.columnCarries.includes("x") ? tip.x : 0, y: model.columnCarries.includes("y") ? tip.y : 0, z: 0 }),
    head: mul4(translate({ x: 0, y: 0, z: gauge }), translate(tip)),
    fork: mul4(forkOnly, lift),
    spindle: mul4(headAt, lift),
    table: moveTable,
    cradle: mul4(moveTable, tiltOnly),
    platter: part
  }
  // On a head machine the ram follows the head's position, not its turning.
  machineLinks.head = mul4(translate(tip), lift)
  const axis = (() => { const a = { x: head[2]!, y: head[5]!, z: head[8]! }; return a })()
  if (frame === "machine") return { joints: jointsOf(m, angles), links: machineLinks, part, tip, axis }
  const back = invert4(part)
  const links = Object.fromEntries(Object.entries(machineLinks).map(([k, t]) => [k, mul4(back, t)])) as Record<LinkRole, Mat4>
  return { joints: jointsOf(m, angles), links, part: IDENTITY4, tip: apply4(back, tip), axis: apply4([back[0]!, back[1]!, back[2]!, 0, back[4]!, back[5]!, back[6]!, 0, back[8]!, back[9]!, back[10]!, 0, 0, 0, 0, 1], axis) }
}

const jointsOf = (m: Vec3, angles: Angles): Joints => ({ x: m.x, y: m.y, z: m.z, ...(angles.a !== undefined ? { a: angles.a } : {}), ...(angles.b !== undefined ? { b: angles.b } : {}), ...(angles.c !== undefined ? { c: angles.c } : {}) })

// -- limits -----------------------------------------------------------------------------------------------------------------

export interface LimitFinding {
  readonly code: "TRAVEL_X" | "TRAVEL_Y" | "TRAVEL_Z" | "ROTARY_A" | "ROTARY_B" | "ROTARY_C"
  readonly severity: "error" | "warning"
  /** First move (index into the timeline) where the axis leaves its range, its source line, and how many moves do. */
  readonly move: number
  readonly line?: number
  readonly count: number
  readonly value: number
  readonly range: readonly [number, number]
  readonly assumed: boolean
  readonly message: string
}

/**
 * Axis travels and rotary limits along the timeline: every move's end is a pose the machine must reach. The spindle nose
 * must stay under the top of the Z travel, so Z is checked with the tool's `gauge`. Assumed limits give warnings, entered
 * ones errors.
 */
export const checkLimits = (model: MachineModel, timeline: Timeline, rotary: RotarySetup | undefined, gaugeOf: (path: number) => number): ReadonlyArray<LimitFinding> => {
  const found = new Map<LimitFinding["code"], LimitFinding>()
  const assumedTravel = model.assumed.includes("travel"), assumedRotary = model.assumed.includes("rotary limits")
  timeline.moves.forEach((move, i) => {
    const pose = poseAt(timeline, move.start + move.duration)
    const m = rotary !== undefined ? machinePointOf(pose.point, pose.angles, rotary) : pose.point
    const check = (code: LimitFinding["code"], value: number, range: readonly [number, number] | undefined, assumed: boolean, what: string) => {
      if (range === undefined || (value >= range[0] - 1e-6 && value <= range[1] + 1e-6)) return
      const was = found.get(code)
      if (was !== undefined) { found.set(code, { ...was, count: was.count + 1 }); return }
      found.set(code, {
        code, severity: assumed ? "warning" : "error", move: i, ...(move.state.line !== undefined ? { line: move.state.line } : {}), count: 1, value, range, assumed,
        message: `${what} ${Math.round(value * 100) / 100} is outside ${Math.round(range[0] * 100) / 100}..${Math.round(range[1] * 100) / 100}${assumed ? " (assumed travel)" : ""}`
      })
    }
    check("TRAVEL_X", m.x, model.travel.x, assumedTravel, "X")
    check("TRAVEL_Y", m.y, model.travel.y, assumedTravel, "Y")
    check("TRAVEL_Z", m.z + gaugeOf(move.path), [model.travel.z[0], model.travel.z[1]], assumedTravel, "The spindle nose Z")
    check("ROTARY_A", pose.angles.a ?? 0, model.rotaryLimits.a, assumedRotary, "A")
    check("ROTARY_B", pose.angles.b ?? 0, model.rotaryLimits.b, assumedRotary, "B")
    check("ROTARY_C", pose.angles.c ?? 0, model.rotaryLimits.c, assumedRotary, "C")
  })
  return [...found.values()]
}
