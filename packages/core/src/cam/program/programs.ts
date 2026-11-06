/**
 * Programs of a setup (spec 14 §3): each operation goes through the existing generator, its IR moves become one toolpath of a
 * single `Program`, and the program is emitted once by the post. The post already writes the tool change (`G80 M5 M9 T<n> M6
 * G43 H<n> M3 S...`) between toolpaths; nothing here concatenates text.
 */
import { analyseGcode } from "../generator/analysis.ts"
import { targetMeshesFor } from "../generator/evidence.ts"
import { stockInWork } from "../generator/dispatch.ts"
import type { Stock } from "../generator/schema.ts"
import type { Mesh } from "../../cad/solid.ts"
import { interpretGcode } from "../testing/gcode-interpreter.ts"
import { sha256 } from "../kernel/identity.ts"
import type { ReleaseLevel } from "../kernel/contracts.ts"
import type { VerifyNcResult } from "../kernel/verify-nc.ts"
import { cutterOfTool, type Cutter } from "../kernel/cutters.ts"
import { TriReplay, triCellFor } from "../kernel/tri-replay.ts"
import { boxPenetration, toolSolid } from "../kernel/tridexel.ts"
import type { AssemblyPart } from "../kernel/assembly.ts"
import { forEachSample } from "../verify/path.ts"
import { DEFAULT_GEOMETRY, decodeGenerateRequest, generateToolpath, type GenerateOutcome, type GeometryInput, type GcodeStats } from "../generator/index.ts"
import { arcExtrema, estimateTime, expandMoves, makeProgram, type Move, type Program, type Toolpath } from "../ir.ts"
import { consumeLife, emptyLifeBook, pickSister, type ToolLifeBook } from "../kernel/tool-library.ts"
import { formatOffsetRef } from "../work-offset.ts"
import { dialectOf, getPost } from "../post/index.ts"
import type { TiltedPlane } from "../post/types.ts"
import { boxInPartFrame, indexPlane } from "../indexing.ts"
import type { Tool } from "../tool.ts"
import type { Vec3 } from "../../cad/vec.ts"
import type { Operation } from "./op.ts"
import { groupsOf, planPrograms, type SetupPlan } from "./plan.ts"
import { enabledOperations, expandSetup, runsOf, validateSetup, workpieceIssues, workpiecesOf, type Setup, type SetupIssue, type Workpiece, type WorkpieceOrder } from "./setup.ts"
import { assignPockets, type ToolTableEntry } from "./tooltable.ts"

export interface GeneratedProgram {
  readonly name: string
  readonly programNumber: number
  readonly gcode: string
  readonly program: Program
  readonly stats: GcodeStats
  readonly warnings: ReadonlyArray<string>
  readonly operationIds: ReadonlyArray<string>
  readonly toolNumbers: ReadonlyArray<number>
  /** The pocket of every tool the program calls (a sister tool has its own), by tool id. */
  readonly pockets: Readonly<Record<string, number>>
  /** The tools the program calls, each once. */
  readonly tools: ReadonlyArray<Tool>
}

/** What one tool cut over the setup, against the life it was given. */
export interface ToolLifeEntry {
  readonly toolId: string
  readonly name: string
  readonly pocket: number
  /** Cutting minutes the setup spends with the tool (programmed feeds, no acceleration). */
  readonly minutes: number
  readonly lifeMinutes?: number
  /** The primary tool this one replaced once its life was spent. */
  readonly sisterOf?: string
}

export interface GeneratedSetup {
  readonly programs: ReadonlyArray<GeneratedProgram>
  readonly toolTable: ReadonlyArray<ToolTableEntry>
  /** Cutting minutes per tool, against its life, with the sister tools that took over. Empty when no tool has a life and none was swapped. */
  readonly toolLife: ReadonlyArray<ToolLifeEntry>
  readonly totals: {
    readonly programs: number
    readonly toolLoads: number
    readonly toolChanges: number
    readonly cutLength: number
    readonly rapidLength: number
    readonly estimatedSeconds: number
  }
  readonly warnings: ReadonlyArray<string>
  /** Problems found before generating; a setup with an error-level problem generates nothing for the operations it names. */
  readonly issues: ReadonlyArray<SetupIssue>
}

/** What a tool change costs the cycle, seconds: a typical automatic changer. Indicative, never calibrated to a machine. */
const TOOL_CHANGE_SECONDS = 6
const toolChangesOf = (toolpaths: ReadonlyArray<Toolpath>): number => toolpaths.reduce((n, tp, i) => (i > 0 && toolpaths[i - 1]!.toolId !== tp.toolId ? n + 1 : n), 0)

const round = (value: number): number => Math.round(value * 1000) / 1000

/**
 * The geometry of an operation from the elements the caller resolved (`elements` by id): the operation's element ids in order, as
 * the "selected" geometry of the generator. An id with no element is an error the caller must show, so it throws with the ids.
 */
export const geometryFor = (operation: Operation, elements: Readonly<Record<string, Readonly<Record<string, unknown>>>>, stock?: GeometryInput["stock"]): GeometryInput => {
  const missing = operation.elementIds.filter((id) => elements[id] === undefined)
  if (missing.length > 0) throw new RangeError(`${operation.name}: no element for ${missing.join(", ")}`)
  return { ...DEFAULT_GEOMETRY, geometryType: "selected", selectedElements: operation.elementIds.map((id) => elements[id]!), ...(stock !== undefined ? { stock } : {}) }
}

/** The generator settings of an operation: its own, with the tool's size, its pocket and the setup's register. A rest pass that continues the operation before it cut with that operation's tool. */
const settingsFor = (setup: Setup, op: Operation, ordered: ReadonlyArray<Operation>, pockets: ReadonlyMap<string, number>) => {
  const before = ordered[ordered.indexOf(op) - 1]
  return {
    ...op.params,
    toolDiameter: op.tool.diameter, flutes: op.tool.flutes, toolNumber: pockets.get(op.id)!, workOffset: setup.workOffset,
    ...(op.fromPreviousStock && op.params.useRestMachining && before !== undefined ? { restToolDiameter: before.tool.diameter } : {})
  }
}

/** The register a workpiece's toolpaths run under, as the reference interpreter names it. */
export const registerOf = (wp: Workpiece): string => (wp.workOffsetRef !== undefined ? formatOffsetRef(wp.workOffsetRef) : wp.workOffset)

/** What the replay of one generated program needs: the tools by pocket, the finished part and, per register, the blank of that workpiece. All in the work frame the program is written in. */
export interface SetupReplay {
  readonly tools: ReadonlyArray<{ readonly number: number; readonly cutter: Cutter }>
  /** The finished solids of the operations' elements, placed as the generator placed them; empty when the elements are outlines only. */
  readonly part: ReadonlyArray<Mesh>
  readonly registers: ReadonlyArray<{
    readonly register: string; readonly workpieceId: string; readonly name: string; readonly stock: { readonly min: Vec3; readonly max: Vec3 }
    /** Where this part's datum stands in the frame of the first part's datum (its `placement`); absent when the part has none. */
    readonly datum?: Vec3
  }>
  /** The clamps, jaws and plates of the fixture, in the frame of the first part's datum (the setup's `fixtures`). */
  readonly fixtures?: ReadonlyArray<{ readonly id: string; readonly name: string; readonly min: Vec3; readonly max: Vec3 }>
  readonly notes: ReadonlyArray<string>
}

/**
 * The inputs to replay a program a setup generated against its parts: each tool as the kernel cutter it is, the part from the
 * operations' own elements (`targetMeshesFor`, in the generator's coordinates), and the blank of every register that the program uses
 * (the workpiece's own blank, else the drawing's stock as the generator placed it, else the setup's block).
 */
export const setupReplay = (setup: Setup, generated: GeneratedProgram, geometryOf: (operation: Operation) => GeometryInput, configured?: Stock): SetupReplay => {
  const ordered = enabledOperations(setup)
  const pockets = assignPockets(ordered)
  const notes: string[] = []
  const tools = generated.tools.map((t) => ({ number: generated.pockets[t.id]!, cutter: cutterOfTool(t) }))
  const part: Mesh[] = []
  const seen = new Set<string>()
  for (const op of ordered.filter((o) => generated.operationIds.includes(o.id))) {
    const key = [...op.elementIds].sort().join(",")
    if (seen.has(key)) continue
    seen.add(key)
    try {
      const meshes = targetMeshesFor(decodeGenerateRequest({ settings: settingsFor(setup, op, ordered, pockets), geometry: geometryOf(op), evidence: false }))
      if (meshes !== undefined) part.push(...meshes)
    } catch (cause) { notes.push(`${op.name}: the part could not be read (${cause instanceof Error ? cause.message : String(cause)})`) }
  }
  if (part.length === 0) notes.push("The operations' elements are outlines or features, not a finished solid: gouge and leftover cannot be judged, only rapids through material and unknown tools")
  const first = ordered.find((o) => generated.operationIds.includes(o.id)) ?? ordered[0]!
  const blockBox = (b: NonNullable<Setup["stock"]>) => ({ min: { x: b.origin.x, y: b.origin.y, z: b.origin.z - b.z }, max: { x: b.origin.x + b.x, y: b.origin.y + b.y, z: b.origin.z } })
  const shared = configured !== undefined ? stockInWork(settingsFor(setup, first, ordered, pockets) as never, configured) : setup.stock !== undefined ? blockBox(setup.stock) : undefined
  const used = new Set(generated.program.toolpaths.map((t) => (t.workOffsetRef !== undefined ? formatOffsetRef(t.workOffsetRef) : t.workOffset ?? generated.program.workOffset ?? setup.workOffset)))
  const registers: SetupReplay["registers"][number][] = []
  for (const wp of workpiecesOf(setup)) {
    const register = registerOf(wp)
    if (!used.has(register)) continue
    const stock = wp.stock !== undefined ? blockBox(wp.stock) : shared
    if (stock === undefined) { notes.push(`${wp.name} has no blank: the setup and the drawing give no stock to replay against`); continue }
    registers.push({ register, workpieceId: wp.id, name: wp.name, stock, ...(wp.placement !== undefined ? { datum: wp.placement } : {}) })
  }
  return { tools, part, registers, ...((setup.fixtures ?? []).length > 0 ? { fixtures: setup.fixtures!.map((f) => ({ id: f.id, name: f.name, min: f.min, max: f.max })) } : {}), notes }
}

/** The replay of a program a setup generated, one verdict per workpiece's register, and the release level they add up to. */
export interface SetupEvidence {
  readonly release: ReleaseLevel
  /** Hash of the NC text that was replayed: evidence about other bytes is not evidence. */
  readonly programHash: string
  readonly registers: ReadonlyArray<{
    readonly register: string
    readonly workpieceId: string
    readonly name: string
    readonly verdict: VerifyNcResult["verdict"]
    readonly complete: boolean
    readonly reasons: ReadonlyArray<string>
    readonly findings: ReadonlyArray<{ readonly kind: string; readonly message: string; readonly line?: number }>
    readonly gougeMm: number
    readonly leftMm: number
    readonly feedMoves: number
    /** The lattice cell and the declared error of every figure above, mm. */
    readonly cellMm: number
    readonly errorBoundMm: number
    /** What the program's moves under this register took out of this workpiece's own blank, and the blank, mm³. */
    readonly removedMm3: number
    readonly stockMm3: number
  }>
  /** All the parts of a program with several registers in ONE frame (the first part's datum): present from two registers on. */
  readonly fixture?: FixtureSimulation
  readonly notes: ReadonlyArray<string>
  readonly basis: string
}

/**
 * The parts of a multi-register program seen together. Every part's blank stands where its placement puts it, the clamps stand where the
 * setup puts them (the fixture's frame is the first part's datum), the program's moves are carried into that one frame through each
 * register's datum (the interpreter's `frame: "machine"` with the placements as the offset table), and the remaining stock of every part
 * is read from its own replay. `crossings` are the moves of one register that enter what it must not touch: another part's blank or a clamp.
 * They are judged on a tri-dexel of that obstacle solid (the other blanks and the clamps as one solid) with the tool as it is: the flutes,
 * the shank and the holder if described, so the tool radius counts. A contact shallower than `errorBoundMm` is below what the lattice can tell
 * from noise and is not reported; `complete` is false when a replay could not run to its end (`reasons`), and then nothing is claimed.
 */
export interface FixtureSimulation {
  readonly frame: string
  readonly parts: ReadonlyArray<{
    readonly register: string
    readonly workpieceId: string
    readonly name: string
    readonly datum: Vec3
    /** The part's blank in the fixture frame. */
    readonly blank: { readonly min: Vec3; readonly max: Vec3 }
    readonly removedMm3: number
    readonly remainingMm3: number
    /** The same two figures read from the ONE body of the fixture after every register's moves (the lattice's error is `body.errorBoundMm`); absent when the body could not be built. */
    readonly bodyRemovedMm3?: number
    readonly bodyRemainingMm3?: number
    /** Where the program's moves of this register reached in the fixture frame (feed moves only), absent when it has none. */
    readonly reach?: { readonly min: Vec3; readonly max: Vec3 }
  }>
  /** The clamps the moves were judged against, in the same frame. */
  readonly clamps?: ReadonlyArray<{ readonly id: string; readonly name: string; readonly min: Vec3; readonly max: Vec3 }>
  /** `other` is the other part's register, or the clamp's id. */
  readonly crossings: ReadonlyArray<{ readonly register: string; readonly other: string; readonly line: number; readonly message: string }>
  /** How the contacts were judged: other parts' blanks on the tri-dexel of the whole fixture. */
  readonly method?: "tri-dexel"
  /** How the clamps were judged: the box against the swept tool, exact; a penetration of `clampErrorMm` or more is never missed. */
  readonly clampMethod?: "exact-box"
  readonly clampErrorMm?: number
  /** The one solid of the fixture (every blank and clamp) after the program: its lattice and total volume. */
  readonly body?: { readonly cellMm: number; readonly errorBoundMm: number; readonly volumeMm3: number }
  /** Every move near an obstacle was replayed (no budget stop, no obstacle too large to sample). */
  readonly complete?: boolean
  readonly reasons?: ReadonlyArray<string>
  /** The coarsest lattice cell used and the declared error of the contacts, mm. */
  readonly cellMm?: number
  readonly errorBoundMm?: number
}

const registerKeyOf = (table: Readonly<Record<string, unknown>>, key: string): string => (key in table ? key : "G54")

/** Work the one body of the fixture may spend per register (cell visits): a program that needs more is not claimed, never guessed. */
const FIXTURE_BUDGET = 4e7
/** The clamps are judged exactly (box against the swept tool): a path is sampled this far apart, and a penetration under the threshold is rounding of the NC's own decimals. */
const CLAMP_STEP = 0.05
const CLAMP_THRESHOLD = 0.01
/** Sampled poses the exact clamp test may spend: over it the clamp check stops and the view is incomplete. */
const CLAMP_SAMPLES = 4e6

type Box = { readonly min: Vec3; readonly max: Vec3 }
const boxesTouch = (a: Box, b: Box): boolean => a.min.x < b.max.x && b.min.x < a.max.x && a.min.y < b.max.y && b.min.y < a.max.y && a.min.z < b.max.z && b.min.z < a.max.z
const boxHas = (b: Box, p: Vec3, grow = 0): boolean => p.x >= b.min.x - grow && p.x <= b.max.x + grow && p.y >= b.min.y - grow && p.y <= b.max.y + grow && p.z >= b.min.z - grow && p.z <= b.max.z + grow
/** The parameter range [t0, t1] of the segment from `a` to `b` that lies inside `box`, or undefined (slab test). */
const clipLine = (a: Vec3, b: Vec3, box: Box): readonly [number, number] | undefined => {
  let t0 = 0, t1 = 1
  for (const axis of ["x", "y", "z"] as const) {
    const d = b[axis] - a[axis]
    if (Math.abs(d) < 1e-12) { if (a[axis] < box.min[axis] || a[axis] > box.max[axis]) return undefined; continue }
    let near = (box.min[axis] - a[axis]) / d, far = (box.max[axis] - a[axis]) / d
    if (near > far) [near, far] = [far, near]
    t0 = Math.max(t0, near); t1 = Math.min(t1, far)
    if (t0 > t1) return undefined
  }
  return [t0, t1]
}
/** `a` without the volume of `bs`, as boxes (at most six per subtracted box). */
const boxMinus = (a: Box, bs: ReadonlyArray<Box>): ReadonlyArray<Box> => {
  let pieces: Box[] = [a]
  for (const b of bs) {
    const next: Box[] = []
    for (const p of pieces) {
      if (!boxesTouch(p, b)) { next.push(p); continue }
      let rest = p
      for (const axis of ["x", "y", "z"] as const) {
        if (b.min[axis] > rest.min[axis]) next.push({ min: rest.min, max: { ...rest.max, [axis]: b.min[axis] } })
        if (b.max[axis] < rest.max[axis]) next.push({ min: { ...rest.min, [axis]: b.max[axis] }, max: rest.max })
        rest = { min: { ...rest.min, [axis]: Math.max(rest.min[axis], b.min[axis]) }, max: { ...rest.max, [axis]: Math.min(rest.max[axis], b.max[axis]) } }
      }
    }
    pieces = next
  }
  return pieces
}

/**
 * The parts of a program in one frame: see `FixtureSimulation`. `tools` (with their holders) refine the cutters the replay holds.
 *
 * ONE tri-dexel holds the whole fixture: every part's blank and every clamp in the first part's datum frame. The program's moves are
 * replayed into it in the order the machine runs them, each register carried into the frame by its datum, so the body is what the fixture
 * is after the program: every part's remaining stock from the same solid, and every collision judged on the state the body is in when the
 * move runs. A move of a register is checked against the rest of the body (its own blank is not an obstacle to its own tool, unless
 * another part's blank overlaps it): another part's blank on the lattice (the tool's radius, flutes, shank and holder counted), the
 * clamps exactly, as boxes against the swept tool, so a graze far below the lattice's cell is still a crossing.
 */
export const fixtureSimulation = (gcode: string, replay: SetupReplay, results: ReadonlyArray<VerifyNcResult>, tools: ReadonlyArray<Tool> = []): FixtureSimulation => {
  const zero = { x: 0, y: 0, z: 0 }
  const datumOf = (r: SetupReplay["registers"][number]): Vec3 => r.datum ?? zero
  const table: Record<string, { x: number; y: number; z: number }> = { G54: { ...zero } }
  for (const r of replay.registers) table[r.register] = { ...datumOf(r) }
  const shifted = (b: Box, d: Vec3): Box => ({ min: { x: b.min.x + d.x, y: b.min.y + d.y, z: b.min.z + d.z }, max: { x: b.max.x + d.x, y: b.max.y + d.y, z: b.max.z + d.z } })
  const blanks = replay.registers.map((r) => shifted(r.stock, datumOf(r)))
  const clamps = (replay.fixtures ?? []).map((f) => ({ id: f.id, name: f.name, min: f.min, max: f.max }))
  const run = interpretGcode(gcode, { frame: "machine", workOffsets: table, track: true })
  const cutters = new Map(replay.tools.map((t) => [t.number, { ...t.cutter, ...(tools.find((x) => x.id === t.cutter.id)?.holder !== undefined ? { holder: tools.find((x) => x.id === t.cutter.id)!.holder! } : {}) } as Cutter]))
  const reach = new Map<string, { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }>()
  const crossings: Array<{ register: string; other: string; line: number; message: string }> = []
  const reasons: string[] = []
  // The moves in the order they run, with the register and the tool they ran with.
  const seq: Array<{ readonly seg: (typeof run.segments)[number] & { readonly kind: "rapid" | "linear" | "arc" }; readonly tool: number; readonly own: number }> = []
  run.segments.forEach((seg, i) => {
    if (seg.kind === "dwell") return
    const state = run.states?.[i]
    const register = registerKeyOf(table, state?.workOffset ?? "G54")
    const own = replay.registers.findIndex((r) => r.register === register)
    if (own < 0) return
    seq.push({ seg, tool: state?.tool ?? -1, own })
    if (seg.kind === "rapid") return
    for (const p of [seg.from, seg.to]) {
      const at = reach.get(register) ?? { min: { ...p }, max: { ...p } }
      at.min.x = Math.min(at.min.x, p.x); at.min.y = Math.min(at.min.y, p.y); at.min.z = Math.min(at.min.z, p.z)
      at.max.x = Math.max(at.max.x, p.x); at.max.y = Math.max(at.max.y, p.y); at.max.z = Math.max(at.max.z, p.z)
      reach.set(register, at)
    }
  })

  // The body: every blank and every clamp, one solid.
  const everything: ReadonlyArray<Box> = [...blanks, ...clamps]
  let tri: TriReplay | undefined
  let before: ReadonlyArray<number> = []
  if (everything.length > 0 && cutters.size > 0) {
    const min = { x: Math.min(...everything.map((b) => b.min.x)), y: Math.min(...everything.map((b) => b.min.y)), z: Math.min(...everything.map((b) => b.min.z)) }
    const max = { x: Math.max(...everything.map((b) => b.max.x)), y: Math.max(...everything.map((b) => b.max.y)), z: Math.max(...everything.map((b) => b.max.z)) }
    const extent = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z }
    const smallest = Math.min(...[...cutters.values()].map((c) => c.diameter / 2))
    let cell = triCellFor(extent, Math.max(0.25, smallest / 10))
    // Sampling the solid onto the lattice costs a few evaluations per ray of every direction: a cell that would not fit is made coarser (the declared error says so).
    const evals = (c: number): number => {
      const n = [extent.x, extent.y, extent.z].map((e) => Math.max(1, Math.ceil(e / c)))
      return n[1]! * n[2]! * (n[0]! + 8) + n[0]! * n[2]! * (n[1]! + 8) + n[0]! * n[1]! * (n[2]! + 8)
    }
    while (evals(cell) > 5e7) cell *= 1.25
    tri = new TriReplay({ min, max, cell, budget: FIXTURE_BUDGET * Math.max(1, replay.registers.length), seed: (p) => everything.some((b) => boxHas(b, p)) })
    for (const reason of tri.reasonList) reasons.push(reason)
    if (tri.reasonList.length > 0) tri = undefined
    else before = blanks.map((b) => tri!.stock.volumeWithin(b.min, b.max))
  }

  // What each register's own blank is, for the lattice probe: its blank minus the other blanks that overlap it, so a cut into an overlap is still seen.
  const own = replay.registers.map((_, i) => boxMinus(blanks[i]!, blanks.filter((_, j) => j !== i)))
  const PARTS: ReadonlyArray<ReadonlyArray<AssemblyPart>> = [["cutting", "shank"], ["holder"]]
  const said = new Set<string>()
  let clampSamples = 0, clampStopped = false
  for (const { seg, tool, own: index } of seq) {
    const cutter = cutters.get(tool)
    if (cutter === undefined) continue
    const mine = replay.registers[index]!
    const arcR = seg.kind === "arc" ? Math.hypot(seg.from.x - seg.center.x, seg.from.y - seg.center.y) : 0
    // The tool's reach box over this move, per group of its parts; an arc's box is its chord's box grown by its radius.
    const reachBox = (group: ReadonlyArray<AssemblyPart>): Box | undefined => {
      const solid = toolSolid(cutter, group)
      if (solid.count === 0) return undefined
      const r = solid.maxRadius + arcR
      return {
        min: { x: Math.min(seg.from.x, seg.to.x) - r, y: Math.min(seg.from.y, seg.to.y) - r, z: Math.min(seg.from.z, seg.to.z) + solid.bottom },
        max: { x: Math.max(seg.from.x, seg.to.x) + r, y: Math.max(seg.from.y, seg.to.y) + r, z: Math.max(seg.from.z, seg.to.z) + solid.top }
      }
    }
    const rapid = seg.kind === "rapid"
    const depthOf = (overlap: number, how: string): string => `${Math.round(overlap * 100) / 100} mm into it ${how}, ${cutter.name} Ø${cutter.diameter} counted with its radius${cutter.holder !== undefined ? " and holder" : ""}`
    const tipsOf = (step: number): Vec3[] => {
      // A line goes as its two ends (the contact test subdivides it); an arc as points a few cells apart.
      const tips = [{ ...seg.from }]
      if (seg.kind === "arc") forEachSample({ from: seg.from, to: seg.to, center: seg.center, clockwise: seg.clockwise }, step, (x, y, z) => { tips.push({ x, y, z }) })
      else tips.push({ ...seg.to })
      return tips
    }
    if (tri !== undefined) {
      // Another part's blank, on the body as it stands: the lattice's noise is its declared error.
      const others = blanks.filter((_, j) => j !== index)
      const hitGroups = PARTS.filter((group) => { const box = reachBox(group); return box !== undefined && others.some((o) => boxesTouch(box, o)) })
      if (hitGroups.length > 0) {
        const tips = tipsOf(Math.max(2, 8 * tri.stock.cell))
        let found: ReturnType<typeof tri.contact>
        for (const group of hitGroups) { found = tri.contact(cutter, group, tips, undefined, tri.stock.errorBound, [...own[index]!, ...clamps]); if (found !== undefined) break }
        if (found !== undefined) {
          const j = found.at !== undefined ? replay.registers.findIndex((_, k) => k !== index && boxHas(blanks[k]!, found!.at!, 2 * tri.stock.cell)) : -1
          const other = replay.registers[j >= 0 ? j : replay.registers.findIndex((_, k) => k !== index && hitGroups.some((g) => { const b = reachBox(g); return b !== undefined && boxesTouch(b, blanks[k]!) }))]
          if (other !== undefined && !said.has(`${mine.register}>${other.register}`)) {
            said.add(`${mine.register}>${other.register}`)
            crossings.push({
              register: mine.register, other: other.register, line: seg.line,
              message: `${mine.name} (${mine.register}) ${rapid ? "rapids through" : "cuts into"} the blank of ${other.name} (${other.register}) at NC line ${seg.line}: a wrong register or a wrong placement (${depthOf(found.overlap, "on the tri-dexel")})`
            })
          }
        }
      }
    }
    // The clamps, exactly: the sampled penetration of the swept tool into the box, to within the sampling step.
    let arcPoses: Vec3[] | undefined
    for (const clamp of clamps) {
      if (clampStopped) break
      for (const group of PARTS) {
        const box = reachBox(group)
        if (box === undefined || !boxesTouch(box, clamp) || said.has(`${mine.register}>${clamp.id}`)) continue
        const solid = toolSolid(cutter, group)
        let deepest = 0
        const consider = (tip: Vec3): void => { deepest = Math.max(deepest, boxPenetration(solid, tip, clamp)) }
        // Only where the tool can reach the clamp is the move sampled: the stretch of the line inside the clamp's box grown by the tool's reach.
        const grown: Box = { min: { x: clamp.min.x - solid.maxRadius, y: clamp.min.y - solid.maxRadius, z: clamp.min.z - solid.top }, max: { x: clamp.max.x + solid.maxRadius, y: clamp.max.y + solid.maxRadius, z: clamp.max.z - solid.bottom } }
        if (seg.kind === "arc") {
          arcPoses ??= tipsOf(CLAMP_STEP)
          for (const t of arcPoses) if (boxHas(grown, t)) { clampSamples++; consider(t) }
        } else {
          const span = clipLine(seg.from, seg.to, grown)
          if (span !== undefined) {
            const length = Math.hypot(seg.to.x - seg.from.x, seg.to.y - seg.from.y, seg.to.z - seg.from.z) * (span[1] - span[0])
            const n = Math.max(1, Math.ceil(length / CLAMP_STEP))
            clampSamples += n + 1
            if (clampSamples > CLAMP_SAMPLES) { clampStopped = true; reasons.push(`the exact clamp check stopped at its budget (${CLAMP_SAMPLES.toExponential(0)} poses) at NC line ${seg.line}: the rest of the program is not checked against the clamps`); break }
            for (let k = 0; k <= n; k++) { const f = span[0] + (span[1] - span[0]) * (k / n); consider({ x: seg.from.x + (seg.to.x - seg.from.x) * f, y: seg.from.y + (seg.to.y - seg.from.y) * f, z: seg.from.z + (seg.to.z - seg.from.z) * f }) }
          }
        }
        if (clampSamples > CLAMP_SAMPLES && !clampStopped) { clampStopped = true; reasons.push(`the exact clamp check stopped at its budget (${CLAMP_SAMPLES.toExponential(0)} poses) at NC line ${seg.line}: the rest of the program is not checked against the clamps`) }
        if (deepest > CLAMP_THRESHOLD) {
          said.add(`${mine.register}>${clamp.id}`)
          crossings.push({
            register: mine.register, other: clamp.id, line: seg.line,
            message: `${mine.name} (${mine.register}) ${rapid ? "rapids through" : "reaches"} the clamp ${clamp.name} at NC line ${seg.line} (${depthOf(deepest, `by the exact box test, within ${CLAMP_STEP} mm`)})`
          })
          break
        }
      }
    }
    // The move cuts the body (feed moves only): what the parts have left is read from it at the end.
    if (tri !== undefined && !rapid) tri.cut(cutter, tipsOf(tri.stock.cell))
  }
  if (tri !== undefined) for (const reason of tri.reasonList) reasons.push(reason)
  const body = tri === undefined ? undefined : { cellMm: Math.round(tri.stock.cell * 1000) / 1000, errorBoundMm: Math.round(tri.stock.errorBound * 1000) / 1000, volumeMm3: Math.round(tri.stock.volume(2)) }
  return {
    frame: `the datum of ${replay.registers[0]?.name ?? "the first part"} (${replay.registers[0]?.register ?? "G54"})`,
    parts: replay.registers.map((r, i) => {
      const v = results[i]
      const seen = reach.get(r.register)
      const left = tri === undefined ? undefined : tri.stock.volumeWithin(blanks[i]!.min, blanks[i]!.max)
      return {
        register: r.register, workpieceId: r.workpieceId, name: r.name, datum: datumOf(r), blank: blanks[i]!,
        removedMm3: Math.round(v?.removedVolume ?? 0), remainingMm3: Math.round((v?.stockVolume ?? 0) - (v?.removedVolume ?? 0)),
        ...(left !== undefined ? { bodyRemovedMm3: Math.round(before[i]! - left), bodyRemainingMm3: Math.round(left) } : {}),
        ...(seen !== undefined ? { reach: seen } : {})
      }
    }),
    ...(clamps.length > 0 ? { clamps } : {}),
    crossings, method: "tri-dexel", complete: reasons.length === 0, reasons,
    ...(body !== undefined ? { body, cellMm: body.cellMm, errorBoundMm: body.errorBoundMm } : {}),
    ...(clamps.length > 0 ? { clampMethod: "exact-box" as const, clampErrorMm: CLAMP_STEP } : {})
  }
}

/**
 * The release of a replayed setup program. Any gouge, rapid through material or travel violation blocks it. It is a verified program
 * only when every register was replayed completely against a finished solid part and every tool has its holder described; anything
 * less is a preview, with the reason named. Legacy programs carry no machine claims beyond this replay.
 */
export const setupEvidence = (gcode: string, replay: SetupReplay, results: ReadonlyArray<VerifyNcResult>, tools: ReadonlyArray<Tool>): SetupEvidence => {
  const notes = [...replay.notes]
  const registers = replay.registers.map((r, i) => {
    const v = results[i]!
    return {
      register: r.register, workpieceId: r.workpieceId, name: r.name, verdict: v.verdict, complete: v.complete, reasons: v.reasons.slice(0, 6),
      findings: v.findings.slice(0, 8).map((f) => ({ kind: f.kind, message: f.message, ...(f.line !== undefined ? { line: f.line } : {}) })),
      gougeMm: Math.round(v.gouge.depth * 1000) / 1000, leftMm: Math.round(v.left.depth * 1000) / 1000, feedMoves: v.feedMoves, removedMm3: Math.round(v.removedVolume), stockMm3: Math.round(v.stockVolume), cellMm: Math.round(v.cell * 1000) / 1000, errorBoundMm: Math.round(v.errorBound * 1000) / 1000
    }
  })
  const bare = tools.filter((t) => t.holder === undefined).map((t) => t.name)
  if (bare.length > 0) notes.push(`No holder is described for ${bare.join(", ")}: shank and holder clearance is not claimed`)
  // Several parts: one more look, all of them in one frame. A cut of one part's register inside another part's blank blocks the release.
  let fixture: FixtureSimulation | undefined
  const unplaced = replay.registers.slice(1).filter((r) => r.datum === undefined).map((r) => r.name)
  const clamped = (replay.fixtures ?? []).length > 0
  if (replay.registers.length > 1 && unplaced.length > 0) notes.push(`${unplaced.join(", ")} ha${unplaced.length > 1 ? "ve" : "s"} no placement: the parts are not seen together in one frame`)
  else if (replay.registers.length > 1 || (clamped && replay.registers.length === 1)) {
    try { fixture = fixtureSimulation(gcode, replay, results, tools) } catch (cause) { notes.push(`The parts could not be seen together: ${cause instanceof Error ? cause.message : String(cause)}`) }
  }
  const crossed = fixture !== undefined && fixture.crossings.length > 0
  for (const c of fixture?.crossings ?? []) notes.push(c.message)
  // A fixture view that could not run to its end claims nothing: the release stays at preview and the reason is named.
  const unseen = fixture !== undefined && fixture.complete === false
  for (const reason of fixture?.reasons ?? []) notes.push(`The fixture could not be fully checked: ${reason}`)
  const faults = crossed || registers.some((r) => r.verdict === "faults")
  const clean = registers.length > 0 && registers.every((r) => r.verdict === "clean") && replay.part.length > 0 && bare.length === 0 && !unseen
  if (registers.length === 0) notes.push("No register of the program could be replayed")
  return {
    release: faults ? "blocked" : clean ? "verified-program" : "preview", programHash: sha256(gcode), registers, ...(fixture !== undefined ? { fixture } : {}), notes,
    basis: "The emitted text is replayed by the reference interpreter on a tri-dexel blank per workpiece register against the finished part and the tools as described. A pass is not controller acceptance or a machine qualification."
  }
}

/**
 * Toolpaths that reach the workholding: every move (arcs by their box, cycles expanded) of every run, moved to the fixture's frame by
 * the workpiece's placement, against each clamp box grown by the tool's radius sideways and by its stick-out upwards from the tip.
 * Reported once per operation, workpiece and clamp; an advisory, since the boxes are as exact as the operator made them.
 */
const fixtureReach = (setup: Setup, operations: ReadonlyArray<Operation>, toolpathOf: (op: Operation) => Toolpath | undefined): ReadonlyArray<string> => {
  const fixtures = setup.fixtures ?? []
  if (fixtures.length === 0) return []
  const out: string[] = []
  for (const { operation: op, workpiece } of runsOf(setup, operations)) {
    const made = toolpathOf(op)
    if (made === undefined) continue
    const at = workpiece.placement ?? { x: 0, y: 0, z: 0 }
    const r = op.tool.diameter / 2, up = op.tool.stickout ?? Math.max(10, 4 * op.tool.diameter + 10)
    const points: Array<{ readonly a: Vec3; readonly b: Vec3 }> = []
    let from = { x: 0, y: 0, z: 0 }
    for (const move of expandMoves(made.moves, from)) {
      const to = (move as { readonly to?: Vec3 }).to
      if (to === undefined) continue
      if (move._tag === "Arc") {
        const box = [from, to, ...arcExtrema(move, from)]
        const lo = { x: Math.min(...box.map((p) => p.x)), y: Math.min(...box.map((p) => p.y)), z: Math.min(...box.map((p) => p.z)) }
        const hi = { x: Math.max(...box.map((p) => p.x)), y: Math.max(...box.map((p) => p.y)), z: Math.max(...box.map((p) => p.z)) }
        points.push({ a: lo, b: hi })
      } else points.push({ a: from, b: to })
      from = to
    }
    for (const fx of fixtures) {
      const lo = { x: fx.min.x - r, y: fx.min.y - r, z: fx.min.z - up }, hi = { x: fx.max.x + r, y: fx.max.y + r, z: fx.max.z }
      const hit = points.some(({ a, b }) => {
        // Slab test of the segment (or the box of an arc) against the grown clamp box, in the fixture's frame.
        let t0 = 0, t1 = 1
        for (const axis of ["x", "y", "z"] as const) {
          const p = a[axis] + at[axis], d = b[axis] - a[axis]
          if (Math.abs(d) < 1e-12) { if (p < lo[axis] || p > hi[axis]) return false; continue }
          let u = (lo[axis] - p) / d, v = (hi[axis] - p) / d
          if (u > v) [u, v] = [v, u]
          t0 = Math.max(t0, u); t1 = Math.min(t1, v)
          if (t0 > t1) return false
        }
        return true
      })
      if (hit) out.push(`${op.name}${setup.workpieces !== undefined && setup.workpieces.length > 1 ? ` on ${workpiece.name}` : ""}: the tool reaches ${fx.name} (${op.tool.name} Ø${op.tool.diameter}, ${up} mm out of the holder)`)
    }
  }
  return out
}

/**
 * Why the setup's tilted-plane parts cannot be written, or undefined: a part indexed `plane` needs a post whose control has the swivel words
 * (`G68.2` + `G53.1`, `CYCLE800`, `PLANE SPATIAL`), and a Siemens post needs the machine's swivel data record. Refused, never written as another frame.
 */
export const planeRefusal = (setup: Setup): string | undefined => {
  const parts = workpiecesOf(setup).filter((wp) => wp.index !== undefined && wp.indexAs === "plane")
  if (parts.length === 0) return undefined
  const dialect = dialectOf(setup.post.postId)
  // The Klartext writer adds its own PLANE SPATIAL words to the dialect it writes with (the ISO dialect of a Heidenhain definition has none).
  if (dialect?.tiltedPlane === undefined && setup.post.postId !== "heidenhain") return `${parts.map((p) => p.name).join(", ")} ${parts.length > 1 ? "are" : "is"} indexed as a tilted plane, and the ${setup.post.postId} post has no tilted-plane words (G68.2, CYCLE800, PLANE SPATIAL): use a post that has them (fanuc, haas, okuma, siemens, heidenhain) or index the part as a table turn`
  if (dialect?.id === "siemens" && setup.post.swivel === undefined) return "A tilted plane on a Siemens post is CYCLE800: set the post's swivel.dataRecord (the machine's swivel data record)"
  return undefined
}

export const generateSetup = (given: Setup, geometryOf: (operation: Operation) => GeometryInput): GeneratedSetup => {
  // Template uses become operations first; an already expanded setup comes back unchanged.
  const setup = expandSetup(given).setup
  const plan: SetupPlan = planPrograms(setup)
  // The template issues come from the setup as given: the expanded one no longer has templates to complain about.
  const issues = validateSetup(given)
  const warnings: string[] = [...plan.warnings]
  const blocked = new Set(issues.flatMap((i) => (i.operationId !== undefined ? [i.operationId] : [])))
  const post = getPost(setup.post.postId)
  if (post === undefined) return { programs: [], toolTable: plan.toolTable, toolLife: [], totals: { programs: 0, toolLoads: 0, toolChanges: 0, cutLength: 0, rapidLength: 0, estimatedSeconds: 0 }, warnings: [`The post ${setup.post.postId} is not implemented`], issues }
  // Two workpieces on one register, or an operation on a workpiece that is not there, would cut the wrong part: nothing is generated.
  if (workpieceIssues(setup).length > 0) return { programs: [], toolTable: plan.toolTable, toolLife: [], totals: { programs: 0, toolLoads: 0, toolChanges: 0, cutLength: 0, rapidLength: 0, estimatedSeconds: 0 }, warnings: [...warnings, "The fixture is inconsistent: no program was generated"], issues }
  const refusal = planeRefusal(setup)
  if (refusal !== undefined) return { programs: [], toolTable: plan.toolTable, toolLife: [], totals: { programs: 0, toolLoads: 0, toolChanges: 0, cutLength: 0, rapidLength: 0, estimatedSeconds: 0 }, warnings: [...warnings, refusal], issues: [...issues, { message: refusal }] }
  const ordered = setup.operations.filter((op) => op.enabled)
  const pockets = assignPockets(ordered)
  const settingsOf = (op: Operation) => settingsFor(setup, op, ordered, pockets)
  const programs: GeneratedProgram[] = []
  // A sister tool has a pocket of its own, after the highest one the operations hold.
  const sisterPocket = new Map<string, number>()
  { let next = Math.max(0, ...pockets.values()) + 1; for (const sister of setup.sisters ?? []) if (ordered.some((op) => op.tool.id === sister.toolId)) sisterPocket.set(sister.toolId, next++) }
  // Cutting minutes every tool has spent so far over the programs, in order; the tool each program really called, for the report.
  let lifeBook: ToolLifeBook = emptyLifeBook
  const called = new Map<string, { readonly tool: Tool; readonly pocket: number; readonly sisterOf?: string }>()
  groupsOf(setup).forEach((group, index) => {
    const planned = plan.programs[index]!
    const programWarnings: string[] = []
    // An operation is generated once: its moves are the same on every workpiece, only the work offset differs.
    const outcomes = new Map<string, Toolpath | undefined>()
    const toolpathOf = (op: Operation): Toolpath | undefined => {
      if (outcomes.has(op.id)) return outcomes.get(op.id)
      outcomes.set(op.id, undefined)
      if (blocked.has(op.id)) { programWarnings.push(`${op.name} is skipped: ${issues.filter((i) => i.operationId === op.id).map((i) => i.message).join("; ")}`); return undefined }
      const settings = settingsOf(op)
      // One operation that cannot be generated (an element that is gone, settings the generator refuses, a fault inside it) fails alone:
      // the operations that work still make their toolpaths, and the failure is reported by name.
      const outcome = ((): GenerateOutcome | { readonly error: string; readonly response?: undefined } => {
        try {
          return generateToolpath(decodeGenerateRequest({ settings, geometry: geometryOf(op), evidence: false, ...(setup.post.stamp !== undefined ? { stamp: setup.post.stamp } : {}) }))
        } catch (cause) {
          return { error: cause instanceof Error ? cause.message : String(cause) }
        }
      })()
      if (outcome.error !== undefined || outcome.response === undefined) { programWarnings.push(`${op.name} produced nothing: ${outcome.error ?? "no result"}`); return undefined }
      programWarnings.push(...outcome.response.warnings.map((w) => `${op.name}: ${w}`))
      const moves: Move[] = outcome.response.program.toolpaths.flatMap((t) => t.moves)
      const made: Toolpath = { id: op.id, name: op.name, toolId: op.tool.id, spindleRpm: Math.min(op.params.rpm, op.tool.maxRpm), coolant: op.params.coolant ? "flood" : "off", moves, operation: { id: op.id, name: op.name } }
      outcomes.set(op.id, made)
      return made
    }
    // The program of one order of the runs. The comparison below builds the other order from the same cached toolpaths.
    const build = (order: WorkpieceOrder) => {
      const toolpaths: Toolpath[] = []
      const used: Operation[] = []
      let book = lifeBook
      const swapped = new Map<string, Tool>()
      const spent = new Set<string>()
      const callsLocal = new Map<string, { readonly tool: Tool; readonly pocket: number; readonly sisterOf?: string }>()
      const buildWarnings: string[] = []
      // Parts indexed as a tilted plane: the toolpath stays in the plane's coordinates and the post writes the control's own word.
      const planes: Record<string, TiltedPlane> = {}
      for (const { operation: op, workpiece, multi } of runsOf({ ...setup, workpieceOrder: order }, group.operations)) {
        const made = toolpathOf(op)
        if (made === undefined) continue
        if (!used.includes(op)) used.push(op)
        // Tool life: a run goes to the tool in use unless its remaining life cannot cover it; then the next member of the sister group takes over.
        let tool = swapped.get(op.tool.id) ?? op.tool
        const minutes = estimateTime(made, 1e12) / 60
        const sister = setup.sisters?.find((s) => s.toolId === op.tool.id)
        if (tool.lifeMinutes !== undefined || sister !== undefined) {
          const members = sister === undefined ? [tool] : [op.tool, sister.tool]
          const life = (id: string): number => members.find((m) => m.id === id)?.lifeMinutes ?? Infinity
          const choice = pickSister({ id: op.tool.id, members: members.map((m) => m.id) }, book, life, minutes)
          if (choice.toolId === undefined) {
            if (!spent.has(tool.id)) { spent.add(tool.id); buildWarnings.push(`${tool.name} has no life left for ${op.name}: ${choice.reason}. Replace or regrind it, or give it a sister tool`) }
          } else if (choice.toolId !== tool.id) {
            tool = members.find((m) => m.id === choice.toolId)!
            swapped.set(op.tool.id, tool)
            buildWarnings.push(`${op.tool.name} is spent after ${(book.usedMinutes[op.tool.id] ?? 0).toFixed(1)} min: ${tool.name} (T${sisterPocket.get(op.tool.id)}) takes over from ${op.name}`)
            if (Math.abs(tool.diameter - op.tool.diameter) > 1e-9) buildWarnings.push(`${tool.name} is Ø${tool.diameter}, ${op.tool.name} is Ø${op.tool.diameter}: ${op.name} was made for the primary tool`)
          }
        }
        book = consumeLife(book, tool.id, minutes)
        const pocket = tool === op.tool || tool.id === op.tool.id ? pockets.get(op.id)! : sisterPocket.get(op.tool.id)!
        callsLocal.set(tool.id, { tool, pocket, ...(tool.id !== op.tool.id ? { sisterOf: op.tool.id } : {}) })
        const asTool: Toolpath = tool.id === op.tool.id ? made : { ...made, toolId: tool.id, spindleRpm: Math.min(op.params.rpm, tool.maxRpm) }
        // A part on an indexed face: the table turns to its angles first, then the same moves run under that face's register.
        const asPlane = workpiece.index !== undefined && workpiece.indexAs === "plane"
        const indexed = workpiece.index === undefined || asPlane ? asTool : { ...asTool, moves: [{ _tag: "Orient" as const, ...workpiece.index }, ...asTool.moves] }
        if (asPlane) planes[multi ? `${op.id}@${workpiece.id}` : op.id] = indexPlane(workpiece.index!)
        toolpaths.push(multi
          ? { ...indexed, id: `${op.id}@${workpiece.id}`, name: `${op.name} - ${workpiece.name}`, workOffset: workpiece.workOffset, ...(workpiece.workOffsetRef !== undefined ? { workOffsetRef: workpiece.workOffsetRef } : {}), operation: { id: `${op.id}@${workpiece.id}`, name: `${op.name} - ${workpiece.name}` } }
          : indexed)
      }
      const fixture = workpiecesOf(setup)
      const program = makeProgram(planned.name, toolpaths, {
        workOffset: toolpaths[0]?.workOffset ?? setup.workOffset,
        ...(toolpaths[0]?.workOffsetRef !== undefined ? { workOffsetRef: toolpaths[0].workOffsetRef } : {}),
        metadata: {
          programNumber: String(planned.programNumber), ...(setup.stock !== undefined ? { material: setup.stock.material } : {}),
          ...(fixture.length > 1 ? { workpieces: fixture.map((wp) => `${wp.name}=${wp.workOffset}`).join(", ") } : {})
        }
      })
      const toolNumbers: Record<string, number> = {}
      for (const [id, c] of callsLocal) toolNumbers[id] = c.pocket
      const gcode = post.emit(program, {
        decimals: setup.post.decimals, useCannedCycles: setup.post.useCannedCycles, arcMode: setup.post.arcMode, header: setup.post.header, tolerance: setup.post.tolerance,
        toolNumbers, retractBeforeToolChange: setup.retractBeforeToolChange,
        ...(setup.post.lineNumbers !== undefined ? { lineNumbers: setup.post.lineNumbers } : {}),
        ...(setup.post.stamp !== undefined ? { stamp: setup.post.stamp } : {}),
        ...(Object.keys(planes).length > 0 ? { workPlanes: planes, ...(setup.post.swivel !== undefined ? { swivel: setup.post.swivel } : {}) } : {})
      })
      const stats = analyseGcode(gcode, planned.name).stats
      return { toolpaths, used, program, gcode, stats, book, calls: callsLocal, toolNumbers, notes: buildWarnings, seconds: stats.estimatedSeconds + toolChangesOf(toolpaths) * TOOL_CHANGE_SECONDS }
    }
    const order: WorkpieceOrder = setup.workpieceOrder ?? "toolFirst"
    const { used, program, gcode, stats, seconds, book, calls, toolNumbers, notes } = build(order)
    lifeBook = book
    for (const [id, c] of calls) if (!called.has(id)) called.set(id, c)
    programWarnings.push(...notes)
    if (workpiecesOf(setup).length > 1 && used.length > 0) {
      const otherOrder: WorkpieceOrder = order === "toolFirst" ? "partFirst" : "toolFirst"
      const other = build(otherOrder)
      if (Math.abs(other.seconds - seconds) >= 1) {
        const faster = other.seconds < seconds ? otherOrder : order
        programWarnings.push(`${faster === "toolFirst" ? "Tool first" : "Part first"} runs about ${Math.round(Math.abs(other.seconds - seconds))} s faster than ${faster === "toolFirst" ? "part first" : "tool first"} (${TOOL_CHANGE_SECONDS} s per tool change, indicative, uncalibrated)`)
      }
    }
    programWarnings.push(...fixtureReach(setup, group.operations, toolpathOf))
    programs.push({
      name: planned.name, programNumber: planned.programNumber, gcode, program, stats,
      warnings: programWarnings, operationIds: used.map((op) => op.id), toolNumbers: [...new Set([...planned.toolNumbers, ...[...calls.values()].map((c) => c.pocket)])],
      pockets: toolNumbers, tools: [...calls.values()].map((c) => c.tool)
    })
    warnings.push(...programWarnings)
  })
  const life: ToolLifeEntry[] = [...called.entries()].map(([toolId, c]) => ({
    toolId, name: c.tool.name, pocket: c.pocket, minutes: Math.round((lifeBook.usedMinutes[toolId] ?? 0) * 100) / 100,
    ...(c.tool.lifeMinutes !== undefined ? { lifeMinutes: c.tool.lifeMinutes } : {}), ...(c.sisterOf !== undefined ? { sisterOf: c.sisterOf } : {})
  })).sort((a, b) => a.pocket - b.pocket)
  const sisterEntries: ToolTableEntry[] = life.filter((l) => l.sisterOf !== undefined).map((l) => ({ pocket: l.pocket, tool: called.get(l.toolId)!.tool, operationIds: [] }))
  return {
    programs, toolTable: [...plan.toolTable, ...sisterEntries].sort((a, b) => a.pocket - b.pocket), toolLife: life.some((l) => l.lifeMinutes !== undefined || l.sisterOf !== undefined) ? life : [], issues, warnings,
    totals: {
      programs: programs.length, toolLoads: plan.toolLoads, toolChanges: plan.toolChanges,
      cutLength: round(programs.reduce((s, p) => s + p.stats.cutLength, 0)), rapidLength: round(programs.reduce((s, p) => s + p.stats.rapidLength, 0)),
      estimatedSeconds: Math.round(programs.reduce((s, p) => s + p.stats.estimatedSeconds, 0))
    }
  }
}
