/**
 * The multi-operation setup as the desktop builds it (spec 14, RM-02): the element toolpaths of the multi-toolpath panel, in their
 * execution order, become the operations of one `cam.program.Setup`. The sidecar's `camSetup` group plans and generates it; this
 * file only describes the job (a pure function over snapshots, like `job.ts`), it plans nothing.
 */
import { cam } from "@cadcamfun/core"
import type { ElementToolpath } from "./multiToolpath.ts"
import type { CadElement } from "./job.ts"

type Setup = cam.program.Setup
type Workpiece = cam.program.Workpiece
type Operation = cam.program.Operation
type ToolKind = cam.Tool["kind"]

const KINDS: Readonly<Record<string, ToolKind>> = { endmill: "endmill", ballnose: "ballnose", drill: "drill", vbit: "vbit", chamfer: "vbit" }

/** The tool of a toolpath: the library tool when the settings name none is a generic one per type, diameter and flute count. */
export const toolOfToolpath = (toolpath: ElementToolpath): cam.Tool => {
  const s = toolpath.toolpathSettings
  const kind = KINDS[s.toolType] ?? "endmill"
  return {
    id: `${s.toolType}-${s.toolDiameter}-${s.flutes}`,
    name: `${s.toolType} Ø${s.toolDiameter} ${s.flutes}F`,
    kind, diameter: s.toolDiameter, flutes: s.flutes,
    // Tools of the panel carry no spindle limit: the operation's own speed is the limit the user chose.
    maxRpm: Math.max(s.rpm, 24000)
  }
}

export interface SetupChoices {
  readonly name: string
  readonly post: cam.program.PostConfig
  readonly grouping: cam.program.SetupGrouping
  readonly retractBeforeToolChange: boolean
  readonly workOffset: Setup["workOffset"]
  /** The parts of the fixture; empty = the setup's one workpiece under `workOffset`. */
  readonly workpieces: ReadonlyArray<cam.program.Workpiece>
  readonly workpieceOrder: cam.program.WorkpieceOrder
}

export const DEFAULT_SETUP_CHOICES: SetupChoices = {
  name: "Setup", post: cam.program.DEFAULT_POST_CONFIG, grouping: "single", retractBeforeToolChange: true, workOffset: "G54", workpieces: [], workpieceOrder: "toolFirst"
}

const REGISTERS: ReadonlyArray<Setup["workOffset"]> = ["G54", "G55", "G56", "G57", "G58", "G59"]

/** The next workpiece of the fixture: the first register no workpiece holds, or nothing once all six are taken. */
export const nextWorkpiece = (existing: ReadonlyArray<cam.program.Workpiece>, name: (n: number) => string): cam.program.Workpiece | undefined => {
  const taken = new Set(existing.map((wp) => wp.workOffset))
  const workOffset = REGISTERS.find((r) => !taken.has(r))
  if (workOffset === undefined) return undefined
  let n = existing.length + 1
  while (existing.some((wp) => wp.id === `wp-${n}`)) n++
  return { id: `wp-${n}`, name: name(n), workOffset }
}

/** The setup of the panel's toolpaths, in execution order. A toolpath that is hidden is not machined. */
export const setupOfToolpaths = (toolpaths: ReadonlyArray<ElementToolpath>, choices: SetupChoices = DEFAULT_SETUP_CHOICES): Setup => ({
  id: "desktop-setup",
  name: choices.name,
  machineType: "mill",
  // A fixture of one part runs under that part's register.
  workOffset: choices.workpieces.length === 1 ? choices.workpieces[0]!.workOffset : choices.workOffset,
  post: choices.post,
  grouping: choices.grouping,
  retractBeforeToolChange: choices.retractBeforeToolChange,
  // One workpiece is the setup itself: the list is sent only when the fixture holds several, so a stored setup stays what it was.
  ...(choices.workpieces.length > 1 ? { workpieces: choices.workpieces, workpieceOrder: choices.workpieceOrder } : {}),
  // A probe cycle is not a cutting operation: it has its own program (`camProbing.emit`) and never joins the cutting setup.
  operations: [...toolpaths].filter((toolpath) => toolpath.probe === undefined).sort((a, b) => a.order - b.order).map((toolpath): Operation => ({
    id: toolpath.id,
    name: toolpath.elementName,
    elementIds: [toolpath.elementId],
    params: toolpath.toolpathSettings,
    tool: toolOfToolpath(toolpath),
    enabled: toolpath.visible,
    fromPreviousStock: false
  }))
})

/** The elements the setup's operations name, by id, for the generate request. An element no longer in the drawing is left out (the sidecar answers with which). */
export const elementsOfSetup = (setup: Setup, elements: ReadonlyArray<CadElement>): Record<string, CadElement> => {
  const wanted = new Set(setup.operations.flatMap((op) => op.elementIds))
  const out: Record<string, CadElement> = {}
  for (const element of elements) {
    const id = String(element["id"])
    if (wanted.has(id)) out[id] = element
  }
  return out
}

/** The file name of a generated program: the setup's program number and name, safe for a file system. */
export const programFileName = (program: { readonly name: string; readonly programNumber: number }, extension = "nc"): string =>
  `${program.programNumber}-${program.name.replace(/[^A-Za-z0-9._-]+/g, "_")}.${extension}`

/** The choices a saved setup was written with, so loading it puts the panel back as it was saved. */
export const choicesOfSetup = (setup: Setup): SetupChoices => ({
  name: setup.name, post: setup.post, grouping: setup.grouping, retractBeforeToolChange: setup.retractBeforeToolChange, workOffset: setup.workOffset,
  workpieces: setup.workpieces ?? [], workpieceOrder: setup.workpieceOrder ?? "toolFirst"
})

export interface RestoredToolpaths {
  readonly toolpaths: ReadonlyArray<ElementToolpath>
  /** Element ids an operation names that the drawing no longer has: the operation is kept (hidden) and reported, not dropped. */
  readonly missingElementIds: ReadonlyArray<string>
  /** Operations the panel cannot show as one toolpath per element (none, or several elements): reported, not guessed. */
  readonly skippedOperationIds: ReadonlyArray<string>
}

/**
 * The panel's toolpaths of a saved setup (the inverse of `setupOfToolpaths`): one per operation, in the setup's order, with no G-code
 * (a loaded setup is regenerated: text generated for another revision of the drawing is not trusted). A disabled operation, or one
 * whose element is gone, is a hidden toolpath.
 */
export const toolpathsOfSetup = (setup: Setup, elements: ReadonlyArray<CadElement>, colors: ReadonlyArray<string>): RestoredToolpaths => {
  const byId = new Map(elements.map((element) => [String(element["id"]), element]))
  const toolpaths: ElementToolpath[] = []
  const missing: string[] = []
  const skipped: string[] = []
  for (const op of setup.operations) {
    const elementId = op.elementIds.length === 1 ? op.elementIds[0]! : undefined
    if (elementId === undefined) { skipped.push(op.id); continue }
    const element = byId.get(elementId)
    if (element === undefined) missing.push(elementId)
    toolpaths.push({
      id: op.id, elementId, elementType: String(element?.["type"] ?? ""), elementName: op.name,
      toolpathSettings: op.params, gcode: "", color: colors[toolpaths.length % Math.max(1, colors.length)] ?? "#888888",
      visible: op.enabled && element !== undefined, toolpathPoints: [], selected: false, order: toolpaths.length, estimatedTime: 0, distance: 0
    })
  }
  return { toolpaths, missingElementIds: missing, skippedOperationIds: skipped }
}

// ---------------------------------------------------------------- several workpieces, as the viewport shows them

/*
 * Display only: the NC of a multi-part program carries the same moves under another work offset register for each part, and
 * the viewport has no registers. `Workpiece.placement` (where a part's datum lies from the first part's) moves the IR's moves
 * for drawing and never reaches the program text.
 */
type Move = cam.Move
type Vec3 = { readonly x: number; readonly y: number; readonly z: number }
export interface StockBox { readonly origin: Vec3; readonly size: Vec3 }

const ZERO: Vec3 = { x: 0, y: 0, z: 0 }
const add = (p: Vec3, d: Vec3): Vec3 => ({ x: p.x + d.x, y: p.y + d.y, z: p.z + d.z })
const isZero = (d: Vec3): boolean => d.x === 0 && d.y === 0 && d.z === 0

/** The move moved by `d`. Moves in machine coordinates (G53) and moves with no position stay as they are. */
export const translateMove = (move: Move, d: Vec3): Move => {
  switch (move._tag) {
    case "Rapid":
      return move.machine === true ? move : { ...move, to: add(move.to, d) }
    case "Linear":
    case "Probe":
      return { ...move, to: add(move.to, d) }
    case "Arc":
      return { ...move, to: add(move.to, d), center: { x: move.center.x + d.x, y: move.center.y + d.y } }
    case "Spline":
      return { ...move, to: add(move.to, d), controls: move.controls.map((c) => ({ x: c.x + d.x, y: c.y + d.y })) }
    case "Cycle":
      return { ...move, to: add(move.to, d), retractHeight: move.retractHeight + d.z }
    default:
      return move
  }
}

/** Where a part's datum lies from the first part's: the placements are both measured from the fixture, so the difference. */
export const shiftOf = (workpiece: Workpiece, first: Workpiece | undefined): Vec3 => {
  const own = workpiece.placement ?? ZERO, base = first?.placement ?? ZERO
  return { x: own.x - base.x, y: own.y - base.y, z: own.z - base.z }
}

/**
 * The program as the viewport draws it: each toolpath moved to the place of the workpiece whose register it runs under. A program
 * with one workpiece (or none placed) is returned as it is.
 */
export const placedProgram = (program: cam.Program, workpieces: ReadonlyArray<Workpiece>): cam.Program => {
  if (workpieces.length < 2) return program
  const shifts = new Map(workpieces.map((wp) => [wp.workOffset, shiftOf(wp, workpieces[0])]))
  if ([...shifts.values()].every(isZero)) return program
  return {
    ...program,
    toolpaths: program.toolpaths.map((tp) => {
      const shift = shifts.get(tp.workOffset ?? program.workOffset)
      return shift === undefined || isZero(shift) ? tp : { ...tp, moves: tp.moves.map((move) => translateMove(move, shift)) }
    })
  }
}

/** The stock box of every part but the first (that one is the viewport's own stock box), moved to its place. */
export const extraStocks = (stock: StockBox | undefined, workpieces: ReadonlyArray<Workpiece>): ReadonlyArray<StockBox> => {
  if (stock === undefined || workpieces.length < 2) return []
  return workpieces.slice(1).map((wp) => ({ origin: add(stock.origin, shiftOf(wp, workpieces[0])), size: stock.size }))
}

/** The work offsets a program runs under, in order of first use. */
export const offsetsOf = (program: cam.Program): ReadonlyArray<string> => {
  const seen: string[] = []
  for (const tp of program.toolpaths) { const o = tp.workOffset ?? program.workOffset; if (!seen.includes(o)) seen.push(o) }
  return seen
}
