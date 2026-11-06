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
import { toolSolid } from "../kernel/tridexel.ts"
import type { AssemblyPart } from "../kernel/assembly.ts"
import { forEachSample } from "../verify/path.ts"
import { DEFAULT_GEOMETRY, decodeGenerateRequest, generateToolpath, type GenerateOutcome, type GeometryInput, type GcodeStats } from "../generator/index.ts"
import { arcExtrema, estimateTime, expandMoves, makeProgram, type Move, type Program, type Toolpath } from "../ir.ts"
import { consumeLife, emptyLifeBook, pickSister, type ToolLifeBook } from "../kernel/tool-library.ts"
import { formatOffsetRef } from "../work-offset.ts"
import { getPost } from "../post/index.ts"
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
    /** Where the program's moves of this register reached in the fixture frame (feed moves only), absent when it has none. */
    readonly reach?: { readonly min: Vec3; readonly max: Vec3 }
  }>
  /** The clamps the moves were judged against, in the same frame. */
  readonly clamps?: ReadonlyArray<{ readonly id: string; readonly name: string; readonly min: Vec3; readonly max: Vec3 }>
  /** `other` is the other part's register, or the clamp's id. */
  readonly crossings: ReadonlyArray<{ readonly register: string; readonly other: string; readonly line: number; readonly message: string }>
  /** How the contacts were judged. */
  readonly method?: "tri-dexel"
  /** Every move near an obstacle was replayed (no budget stop, no obstacle too large to sample). */
  readonly complete?: boolean
  readonly reasons?: ReadonlyArray<string>
  /** The coarsest lattice cell used and the declared error of the contacts, mm. */
  readonly cellMm?: number
  readonly errorBoundMm?: number
}

const registerKeyOf = (table: Readonly<Record<string, unknown>>, key: string): string => (key in table ? key : "G54")

/** Work the contact replay of one register may spend (cell visits): a program that needs more is not claimed, never guessed. */
const FIXTURE_BUDGET = 4e7

type Box = { readonly min: Vec3; readonly max: Vec3 }
const boxesTouch = (a: Box, b: Box): boolean => a.min.x < b.max.x && b.min.x < a.max.x && a.min.y < b.max.y && b.min.y < a.max.y && a.min.z < b.max.z && b.min.z < a.max.z
const boxHas = (b: Box, p: Vec3, grow = 0): boolean => p.x >= b.min.x - grow && p.x <= b.max.x + grow && p.y >= b.min.y - grow && p.y <= b.max.y + grow && p.z >= b.min.z - grow && p.z <= b.max.z + grow

/** The parts of a program in one frame: see `FixtureSimulation`. `tools` (with their holders) refine the cutters the replay holds. */
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
  let cellMm = 0, errorBoundMm = 0
  // The moves of every register, in the fixture frame, with the tool they ran with.
  const moves = replay.registers.map(() => [] as Array<{ readonly seg: (typeof run.segments)[number] & { readonly kind: "rapid" | "linear" | "arc" }; readonly tool: number }>)
  run.segments.forEach((seg, i) => {
    if (seg.kind === "dwell") return
    const state = run.states?.[i]
    const register = registerKeyOf(table, state?.workOffset ?? "G54")
    const own = replay.registers.findIndex((r) => r.register === register)
    if (own < 0) return
    moves[own]!.push({ seg, tool: state?.tool ?? -1 })
    if (seg.kind === "rapid") return
    for (const p of [seg.from, seg.to]) {
      const at = reach.get(register) ?? { min: { ...p }, max: { ...p } }
      at.min.x = Math.min(at.min.x, p.x); at.min.y = Math.min(at.min.y, p.y); at.min.z = Math.min(at.min.z, p.z)
      at.max.x = Math.max(at.max.x, p.x); at.max.y = Math.max(at.max.y, p.y); at.max.z = Math.max(at.max.z, p.z)
      reach.set(register, at)
    }
  })
  // What a register's own moves must not touch: the other parts' blanks and the clamps, as one solid.
  replay.registers.forEach((own, index) => {
    const obstacles: Array<{ readonly id: string; readonly label: string; readonly box: Box; readonly kind: "blank" | "clamp" }> = [
      ...replay.registers.flatMap((other, j) => (j === index ? [] : [{ id: other.register, label: `the blank of ${other.name} (${other.register})`, box: blanks[j]!, kind: "blank" as const }])),
      ...clamps.map((c) => ({ id: c.id, label: c.name, box: c as Box, kind: "clamp" as const }))
    ]
    if (obstacles.length === 0) return
    // Only the moves whose tool comes near an obstacle are replayed on the lattice, and per part of the tool (flutes and shank, holder):
    // the holder is wide but high, so it is only probed where the move is high enough to bring it near an obstacle.
    const PARTS: ReadonlyArray<ReadonlyArray<AssemblyPart>> = [["cutting", "shank"], ["holder"]]
    const near = moves[index]!.flatMap((m) => {
      const cutter = cutters.get(m.tool)
      if (cutter === undefined) return []
      // An arc's box is its chord's box grown by its radius.
      const arcR = m.seg.kind === "arc" ? Math.hypot(m.seg.from.x - m.seg.center.x, m.seg.from.y - m.seg.center.y) : 0
      const parts = PARTS.filter((group) => {
        const solid = toolSolid(cutter, group)
        if (solid.count === 0) return false
        const r = solid.maxRadius + arcR
        const box = {
          min: { x: Math.min(m.seg.from.x, m.seg.to.x) - r, y: Math.min(m.seg.from.y, m.seg.to.y) - r, z: Math.min(m.seg.from.z, m.seg.to.z) + solid.bottom },
          max: { x: Math.max(m.seg.from.x, m.seg.to.x) + r, y: Math.max(m.seg.from.y, m.seg.to.y) + r, z: Math.max(m.seg.from.z, m.seg.to.z) + solid.top }
        }
        return obstacles.some((o) => boxesTouch(box, o.box))
      })
      if (parts.length === 0) return []
      const r = Math.max(...parts.map((g) => toolSolid(cutter, g).maxRadius)) + arcR
      const box = {
        min: { x: Math.min(m.seg.from.x, m.seg.to.x) - r, y: Math.min(m.seg.from.y, m.seg.to.y) - r, z: Math.min(m.seg.from.z, m.seg.to.z) },
        max: { x: Math.max(m.seg.from.x, m.seg.to.x) + r, y: Math.max(m.seg.from.y, m.seg.to.y) + r, z: Math.max(m.seg.from.z, m.seg.to.z) + Math.max(...parts.map((g) => toolSolid(cutter, g).top)) }
      }
      const hit = obstacles.filter((o) => boxesTouch(box, o.box))
      return hit.length === 0 ? [] : [{ m, cutter, box, hit, parts }]
    })
    if (near.length === 0) return
    const used = [...new Set(near.flatMap((n) => n.hit))]
    const lo = { x: Math.min(...used.map((o) => o.box.min.x)), y: Math.min(...used.map((o) => o.box.min.y)), z: Math.min(...used.map((o) => o.box.min.z)) }
    const hi = { x: Math.max(...used.map((o) => o.box.max.x)), y: Math.max(...used.map((o) => o.box.max.y)), z: Math.max(...used.map((o) => o.box.max.z)) }
    // Clip to where the moves can reach, so a long fixture is not sampled where no tool goes.
    const reachLo = { x: Math.min(...near.map((n) => n.box.min.x)), y: Math.min(...near.map((n) => n.box.min.y)) }
    const reachHi = { x: Math.max(...near.map((n) => n.box.max.x)), y: Math.max(...near.map((n) => n.box.max.y)) }
    const min = { x: Math.max(lo.x, reachLo.x), y: Math.max(lo.y, reachLo.y), z: lo.z }
    const max = { x: Math.min(hi.x, reachHi.x), y: Math.min(hi.y, reachHi.y), z: hi.z }
    if (!(max.x > min.x && max.y > min.y && max.z > min.z)) return
    const smallest = Math.min(...near.map((n) => n.cutter.diameter / 2))
    const cell = triCellFor({ x: max.x - min.x, y: max.y - min.y, z: max.z - min.z }, Math.max(0.25, smallest / 10))
    const tri = new TriReplay({ min, max, cell, budget: FIXTURE_BUDGET, seed: (p) => obstacles.some((o) => boxHas(o.box, p)) })
    const said = new Set<string>()
    for (const { m, cutter, hit, parts } of near) {
      // A line goes as its two ends (the contact test subdivides it); an arc as points a few cells apart.
      const tips = [{ ...m.seg.from }]
      if (m.seg.kind === "arc") forEachSample({ from: m.seg.from, to: m.seg.to, center: m.seg.center, clockwise: m.seg.clockwise }, Math.max(2, 8 * tri.stock.cell), (x, y, z) => { tips.push({ x, y, z }) })
      else tips.push({ ...m.seg.to })
      let found: ReturnType<typeof tri.contact>
      for (const group of parts) { found = tri.contact(cutter, group, tips, undefined, tri.stock.errorBound); if (found !== undefined) break }
      if (found === undefined) continue
      const what = (found.at !== undefined ? hit.find((o) => boxHas(o.box, found.at!, 2 * tri.stock.cell)) : undefined) ?? hit[0]!
      const key = `${own.register}>${what.id}`
      if (said.has(key)) continue
      said.add(key)
      const rapid = m.seg.kind === "rapid"
      const depth = `${Math.round(found.overlap * 100) / 100} mm into it on the tri-dexel, ${cutter.name} Ø${cutter.diameter} counted with its radius${cutter.holder !== undefined ? " and holder" : ""}`
      crossings.push({
        register: own.register, other: what.id, line: m.seg.line,
        message: what.kind === "blank"
          ? `${own.name} (${own.register}) ${rapid ? "rapids through" : "cuts into"} ${what.label} at NC line ${m.seg.line}: a wrong register or a wrong placement (${depth})`
          : `${own.name} (${own.register}) ${rapid ? "rapids through" : "reaches"} the clamp ${what.label} at NC line ${m.seg.line} (${depth})`
      })
    }
    cellMm = Math.max(cellMm, tri.stock.cell); errorBoundMm = Math.max(errorBoundMm, tri.stock.errorBound)
    for (const reason of tri.reasonList) reasons.push(`${own.name} (${own.register}): ${reason}`)
  })
  return {
    frame: `the datum of ${replay.registers[0]?.name ?? "the first part"} (${replay.registers[0]?.register ?? "G54"})`,
    parts: replay.registers.map((r, i) => {
      const v = results[i]
      const seen = reach.get(r.register)
      return {
        register: r.register, workpieceId: r.workpieceId, name: r.name, datum: datumOf(r), blank: blanks[i]!,
        removedMm3: Math.round(v?.removedVolume ?? 0), remainingMm3: Math.round((v?.stockVolume ?? 0) - (v?.removedVolume ?? 0)),
        ...(seen !== undefined ? { reach: seen } : {})
      }
    }),
    ...(clamps.length > 0 ? { clamps } : {}),
    crossings, method: "tri-dexel", complete: reasons.length === 0, reasons,
    ...(cellMm > 0 ? { cellMm: Math.round(cellMm * 1000) / 1000, errorBoundMm: Math.round(errorBoundMm * 1000) / 1000 } : {})
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
        const indexed = workpiece.index === undefined ? asTool : { ...asTool, moves: [{ _tag: "Orient" as const, ...workpiece.index }, ...asTool.moves] }
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
        ...(setup.post.stamp !== undefined ? { stamp: setup.post.stamp } : {})
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
