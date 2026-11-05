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
  /** Pockets the tool magazine holds; 0 = not stated. */
  readonly magazineSize: number
}

export const DEFAULT_SETUP_CHOICES: SetupChoices = {
  name: "Setup", post: cam.program.DEFAULT_POST_CONFIG, grouping: "single", retractBeforeToolChange: true, workOffset: "G54", workpieces: [], workpieceOrder: "toolFirst", magazineSize: 0
}

const REGISTERS: ReadonlyArray<Setup["workOffset"]> = ["G54", "G55", "G56", "G57", "G58", "G59"]
/** The most parts one fixture holds: six on G54-G59, the rest on G54.1 P1 to P42 (extended registers). */
export const MAX_WORKPIECES = 48

/** A register a part can run under: G54-G59, then the extended `G54.1 Pn`. The base `workOffset` of an extended register is G54 (the schema asks for one); the ref decides. */
export interface RegisterChoice { readonly key: string; readonly workOffset: Setup["workOffset"]; readonly ref?: Workpiece["workOffsetRef"] }
export const REGISTER_CHOICES: ReadonlyArray<RegisterChoice> = [
  ...REGISTERS.map((workOffset): RegisterChoice => ({ key: workOffset, workOffset })),
  ...Array.from({ length: MAX_WORKPIECES - REGISTERS.length }, (_, i): RegisterChoice => ({ key: `G54.1 P${i + 1}`, workOffset: "G54", ref: { kind: "extended", p: i + 1 } }))
]

/** The register of a part or a toolpath as one key: its extended ref when it has one, else G54-G59. */
export const registerKey = (x: { readonly workOffset: Setup["workOffset"]; readonly workOffsetRef?: Workpiece["workOffsetRef"] | undefined }): string =>
  x.workOffsetRef !== undefined ? cam.probing.formatOffsetRef(x.workOffsetRef) : x.workOffset

/** The part with its register changed to the choice `key`. */
export const withRegister = (wp: Workpiece, key: string): Workpiece => {
  const choice = REGISTER_CHOICES.find((c) => c.key === key)
  if (choice === undefined) return wp
  const { workOffsetRef: _old, ...rest } = wp
  return { ...rest, workOffset: choice.workOffset, ...(choice.ref !== undefined ? { workOffsetRef: choice.ref } : {}) }
}

/** The next workpiece of the fixture: the first register no workpiece holds, or nothing once the fixture is full. */
export const nextWorkpiece = (existing: ReadonlyArray<cam.program.Workpiece>, name: (n: number) => string): cam.program.Workpiece | undefined => {
  const taken = new Set(existing.map(registerKey))
  const choice = REGISTER_CHOICES.find((c) => !taken.has(c.key))
  if (choice === undefined || existing.length >= MAX_WORKPIECES) return undefined
  let n = existing.length + 1
  while (existing.some((wp) => wp.id === `wp-${n}`)) n++
  return withRegister({ id: `wp-${n}`, name: name(n), workOffset: "G54" }, choice.key)
}

/** The setup of the panel's toolpaths, in execution order. A toolpath that is hidden is not machined. */
export const setupOfToolpaths = (toolpaths: ReadonlyArray<ElementToolpath>, choices: SetupChoices = DEFAULT_SETUP_CHOICES): Setup => ({
  id: "desktop-setup",
  name: choices.name,
  machineType: "mill",
  // A fixture of one part runs under that part's register.
  workOffset: choices.workpieces.length === 1 ? choices.workpieces[0]!.workOffset : choices.workOffset,
  ...(choices.magazineSize > 0 ? { magazineSize: choices.magazineSize } : {}),
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
    fromPreviousStock: false,
    // Only on a fixture of several parts, and only when the toolpath is limited to some of them.
    ...(toolpath.dependsOn !== undefined && toolpath.dependsOn.length > 0 ? { dependsOn: toolpath.dependsOn } : {}),
    ...(choices.workpieces.length > 1 && toolpath.workpieceIds !== undefined ? { workpieceIds: toolpath.workpieceIds.filter((id) => choices.workpieces.some((wp) => wp.id === id)) } : {})
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
  workpieces: setup.workpieces ?? [], workpieceOrder: setup.workpieceOrder ?? "toolFirst", magazineSize: setup.magazineSize ?? 0
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
      visible: op.enabled && element !== undefined, toolpathPoints: [], selected: false, order: toolpaths.length, estimatedTime: 0, distance: 0,
      ...(op.workpieceIds !== undefined ? { workpieceIds: op.workpieceIds } : {}),
      ...(op.dependsOn !== undefined ? { dependsOn: op.dependsOn } : {})
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

/** Degrees a part's rotary index turns it by, about X (A), Y (B) and Z (C). */
export interface Turn { readonly a: number; readonly b: number; readonly c: number }
const isNoTurn = (t: Turn): boolean => t.a === 0 && t.b === 0 && t.c === 0
const RAD = Math.PI / 180

/** A point turned about the part's datum: A about X, then B about Y, then C about Z (rounded so a quarter turn stays exact). */
export const turnPoint = (p: Vec3, t: Turn): Vec3 => {
  const round = (n: number): number => Math.round(n * 1e9) / 1e9
  let { x, y, z } = p
  if (t.a !== 0) { const c = Math.cos(t.a * RAD), s = Math.sin(t.a * RAD); [y, z] = [y * c - z * s, y * s + z * c] }
  if (t.b !== 0) { const c = Math.cos(t.b * RAD), s = Math.sin(t.b * RAD); [x, z] = [x * c + z * s, -x * s + z * c] }
  if (t.c !== 0) { const c = Math.cos(t.c * RAD), s = Math.sin(t.c * RAD); [x, y] = [x * c - y * s, x * s + y * c] }
  return { x: round(x), y: round(y), z: round(z) }
}

/**
 * The index of a part from the first part's: the viewport's own stock box and frame are the first part's, so every other part is
 * drawn turned by the difference (the table turns each face to its angles before its toolpaths).
 */
export const turnOf = (workpiece: Workpiece, first: Workpiece | undefined): Turn => ({
  a: (workpiece.index?.a ?? 0) - (first?.index?.a ?? 0), b: (workpiece.index?.b ?? 0) - (first?.index?.b ?? 0), c: (workpiece.index?.c ?? 0) - (first?.index?.c ?? 0)
})

/**
 * A move turned about the datum. A turn about Z alone keeps the XY plane, so arcs and splines stay what they are; a tilt takes them
 * out of it, and the viewport draws their end points joined by straight lines (the NC keeps the arc).
 */
export const turnMove = (move: Move, t: Turn): Move => {
  if (isNoTurn(t)) return move
  const flat = t.a === 0 && t.b === 0
  switch (move._tag) {
    case "Rapid":
      return move.machine === true ? move : { ...move, to: turnPoint(move.to, t) }
    case "Linear":
      return { ...move, to: turnPoint(move.to, t) }
    case "Probe":
      return { ...move, to: turnPoint(move.to, t), direction: turnPoint(move.direction, t) }
    case "Arc": {
      if (!flat) return { _tag: "Linear", to: turnPoint(move.to, t), feed: move.feed }
      const center = turnPoint({ ...move.center, z: 0 }, t)
      return { ...move, to: turnPoint(move.to, t), center: { x: center.x, y: center.y } }
    }
    case "Spline": {
      if (!flat) return { _tag: "Linear", to: turnPoint(move.to, t), feed: move.feed }
      return { ...move, to: turnPoint(move.to, t), controls: move.controls.map((c) => { const q = turnPoint({ ...c, z: 0 }, t); return { x: q.x, y: q.y } }) }
    }
    case "Cycle":
      return flat ? { ...move, to: turnPoint(move.to, t) } : { _tag: "Linear", to: turnPoint(move.to, t), feed: move.feed }
    default:
      return move
  }
}

/**
 * The program as the viewport draws it: each toolpath turned to its part's index and moved to the place of the workpiece whose
 * register it runs under. A program with one workpiece (or none placed or indexed) is returned as it is.
 */
export const placedProgram = (program: cam.Program, workpieces: ReadonlyArray<Workpiece>): cam.Program => {
  if (workpieces.length < 2) return program
  const places = new Map(workpieces.map((wp) => [registerKey(wp), { shift: shiftOf(wp, workpieces[0]), turn: turnOf(wp, workpieces[0]) }] as const))
  if ([...places.values()].every((p) => isZero(p.shift) && isNoTurn(p.turn))) return program
  return {
    ...program,
    toolpaths: program.toolpaths.map((tp) => {
      const place = places.get(registerOf(tp, program))
      if (place === undefined || (isZero(place.shift) && isNoTurn(place.turn))) return tp
      return { ...tp, moves: tp.moves.map((move) => translateMove(turnMove(move, place.turn), place.shift)) }
    })
  }
}

/** The register a toolpath runs under: its own, else the program's. */
const registerOf = (tp: cam.Toolpath, program: cam.Program): string =>
  tp.workOffsetRef !== undefined || tp.workOffset !== undefined ? registerKey({ workOffset: tp.workOffset ?? program.workOffset, workOffsetRef: tp.workOffsetRef }) : registerKey(program)

/**
 * The stock box of every part but the first (that one is the viewport's own stock box), moved to its place. A part with a blank of its
 * own gets that blank (its corner is relative to the part's datum, its top face at `origin.z`); the others get the viewport's stock.
 */
export const extraStocks = (stock: StockBox | undefined, workpieces: ReadonlyArray<Workpiece>): ReadonlyArray<StockBox> => {
  if (stock === undefined || workpieces.length < 2) return []
  return workpieces.slice(1).map((wp) => {
    const shift = shiftOf(wp, workpieces[0]), turn = turnOf(wp, workpieces[0])
    const own: StockBox = wp.stock === undefined ? stock
      : { origin: { x: wp.stock.origin.x, y: wp.stock.origin.y, z: wp.stock.origin.z - wp.stock.z }, size: { x: wp.stock.x, y: wp.stock.y, z: wp.stock.z } }
    return { origin: add(turnedBox(own, turn).origin, shift), size: turnedBox(own, turn).size }
  })
}

/** The box that holds a stock box after its part turned: exact for quarter turns, the enclosing box for any other angle. */
const turnedBox = (box: StockBox, turn: Turn): StockBox => {
  if (isNoTurn(turn)) return box
  const { origin: o, size: s } = box
  const corners = [0, 1].flatMap((i) => [0, 1].flatMap((j) => [0, 1].map((k) => turnPoint({ x: o.x + i * s.x, y: o.y + j * s.y, z: o.z + k * s.z }, turn))))
  const min = { x: Math.min(...corners.map((c) => c.x)), y: Math.min(...corners.map((c) => c.y)), z: Math.min(...corners.map((c) => c.z)) }
  const max = { x: Math.max(...corners.map((c) => c.x)), y: Math.max(...corners.map((c) => c.y)), z: Math.max(...corners.map((c) => c.z)) }
  return { origin: min, size: { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z } }
}

/** The work offsets a program runs under, in order of first use. */
export const offsetsOf = (program: cam.Program): ReadonlyArray<string> => {
  const seen: string[] = []
  for (const tp of program.toolpaths) { const o = registerOf(tp, program); if (!seen.includes(o)) seen.push(o) }
  return seen
}

/**
 * The workpieces a toolpath runs on after one of them is switched: all of them is "unrestricted" (no list), and the last one cannot be
 * switched off (an operation on no part cannot be generated).
 */
export const toggleToolpathWorkpiece = (fixture: ReadonlyArray<Workpiece>, current: ReadonlyArray<string> | undefined, id: string): ReadonlyArray<string> | undefined => {
  const on = new Set(current ?? fixture.map((wp) => wp.id))
  if (on.has(id)) on.delete(id)
  else on.add(id)
  if (on.size === 0) return current
  const next = fixture.filter((wp) => on.has(wp.id)).map((wp) => wp.id)
  return next.length === fixture.length ? undefined : next
}

/** The operations a toolpath waits for after one of them is switched; none left is "no dependency" (the key is left out). */
export const toggleDependency = (current: ReadonlyArray<string> | undefined, id: string): ReadonlyArray<string> | undefined => {
  const next = (current ?? []).includes(id) ? (current ?? []).filter((other) => other !== id) : [...(current ?? []), id]
  return next.length === 0 ? undefined : next
}

/** A toolpath's list after a workpiece left the fixture: what is left of it, or unrestricted when nothing is left or one part remains. */
export const withoutWorkpiece = (current: ReadonlyArray<string> | undefined, removed: string, remaining: number): ReadonlyArray<string> | undefined => {
  if (current === undefined || remaining <= 1) return undefined
  const next = current.filter((id) => id !== removed)
  return next.length === 0 ? undefined : next
}

/**
 * The fixture of a selection of parts (imported or drawn): one workpiece per part, on the next free registers G54 to G59, the first
 * part where the datum is and each of the others placed by how far its box lies from the first's. Parts beyond the six registers
 * are left out and counted by the caller from the lengths.
 */
export const workpiecesFromElements = (elements: ReadonlyArray<Record<string, unknown>>, name: (n: number) => string): ReadonlyArray<Workpiece> => {
  const boxes = elements.slice(0, MAX_WORKPIECES).map((element) => cam.generator.elementBounds(element as never))
  const origin = boxes[0]?.min
  return boxes.map((box, index): Workpiece => {
    const element = elements[index]!
    const label = typeof element["name"] === "string" && element["name"] !== "" ? element["name"] : name(index + 1)
    const base = withRegister({ id: `wp-${index + 1}`, name: label, workOffset: "G54" }, REGISTER_CHOICES[index]!.key)
    if (index === 0 || origin === undefined || !Object.values(box.min).every(Number.isFinite)) return base
    return { ...base, placement: { x: box.min.x - origin.x, y: box.min.y - origin.y, z: box.min.z - origin.z } }
  })
}
