/**
 * Insertable macro snippets for the Cycles tab (spec 69 G4). Control words come from `MacroEmitter`, the same writer
 * the posts use, so a snippet cannot drift from the NC the kernel emits. Klartext's internal `KT:` mark is stripped:
 * the editor holds what the control reads. GRBL (`none`) has no snippets.
 */
import type { Move } from "../ir.ts"
import { KLARTEXT_PREFIX, MacroEmitter, familyOf, type MacroFamily } from "../post/macro-syntax.ts"
import type { CycleController } from "./catalog.ts"
import type { CycleParameter, CycleValues } from "./templates.ts"

type ControlMove = Extract<Move, { readonly _tag: "Assign" | "If" | "EndIf" | "While" | "EndWhile" | "Message" }>

export interface MacroSnippet {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly parameters: ReadonlyArray<CycleParameter>
}

const numberParam = (name: string, label: string, defaultValue: number, description: string, min = 0): CycleParameter => ({
  name, label, type: "number", defaultValue, min, step: 1, description
})

const textParam = (name: string, label: string, defaultValue: string, description: string): CycleParameter => ({
  name, label, type: "text", defaultValue, description
})

const indexDefault = (family: MacroFamily): number => (family === "heidenhain" ? 10 : 100)

const bodyOf = (family: MacroFamily): string => (family === "siemens" || family === "heidenhain" ? "; BODY" : "(BODY)")

const finish = (line: string): string => (line.startsWith(KLARTEXT_PREFIX) ? line.slice(KLARTEXT_PREFIX.length) : line)

/** One emitter for the whole snippet: If and While remember the structure they opened. */
const emit = (family: MacroFamily, nodes: ReadonlyArray<ControlMove>, body: boolean): string => {
  const emitter = new MacroEmitter(family)
  const lines: string[] = []
  for (const node of nodes) {
    if (body && (node._tag === "EndIf" || node._tag === "EndWhile")) lines.push(bodyOf(family))
    lines.push(...emitter.node(node).map(finish))
  }
  return lines.join("\n")
}

const readNumber = (values: CycleValues, name: string): number => {
  const raw = values[name]
  const value = typeof raw === "number" ? raw : Number(raw)
  if (!Number.isFinite(value)) throw new RangeError(`${name} is not a number`)
  return value
}

const variableIndex = (family: MacroFamily, values: CycleValues): number => {
  const index = readNumber(values, "index")
  if (family === "heidenhain" && (index < 0 || index > 99)) throw new RangeError("index is reserved on the TNC (Q0-Q99 are free)")
  if (index < 0) throw new RangeError("index is below 0")
  return index
}

const assign = (family: MacroFamily, values: CycleValues): string => emit(family, [{
  _tag: "Assign", variable: { scope: "global", index: variableIndex(family, values) }, value: readNumber(values, "value")
}], false)

const branch = (family: MacroFamily, values: CycleValues, tag: "If" | "While"): string => {
  const index = variableIndex(family, values)
  const limit = readNumber(values, "limit")
  const condition = { cmp: "lt" as const, a: { var: { scope: "global" as const, index } }, b: limit }
  return tag === "If"
    ? emit(family, [{ _tag: "If", condition }, { _tag: "EndIf" }], true)
    : emit(family, [{ _tag: "While", condition }, { _tag: "EndWhile" }], true)
}

const message = (family: MacroFamily, values: CycleValues): string => {
  const text = String(values["text"] ?? "").trim()
  if (text.length === 0) throw new RangeError("text is empty")
  return emit(family, [{ _tag: "Message", text }], false)
}

const signed = (value: number): string => `${value < 0 ? "" : "+"}${value}`

const toolCall = (family: MacroFamily, values: CycleValues): string => {
  const tool = readNumber(values, "tool")
  if (tool < 1) throw new RangeError("tool is below 1")
  if (family === "heidenhain") return `TOOL CALL ${tool} Z S${readNumber(values, "speed")}`
  return `T${tool} M6`
}

const cycleCall = (values: CycleValues): string => {
  const x = readNumber(values, "x")
  const y = readNumber(values, "y")
  return `CYCL CALL\nL X${signed(x)} Y${signed(y)} R0 FMAX M99`
}

const snippetsFor = (family: MacroFamily): ReadonlyArray<MacroSnippet> => {
  const index = indexDefault(family)
  const common: MacroSnippet[] = [
    {
      id: "assign", name: "Assign a variable", description: "Write a number into a common variable.",
      parameters: [
        numberParam("index", "Variable", index, family === "heidenhain" ? "Q number, 0 to 99" : "Common variable number"),
        numberParam("value", "Value", 5, "The number the variable receives")
      ]
    },
    {
      id: "if", name: "If", description: "Run the body when the variable is less than the limit.",
      parameters: [
        numberParam("index", "Variable", index, "The variable the condition reads"),
        numberParam("limit", "Limit", 5, "The body runs while the variable is below this")
      ]
    },
    {
      id: "while", name: "While", description: "Repeat the body while the variable is less than the limit.",
      parameters: [
        numberParam("index", "Variable", index, "The variable the condition reads"),
        numberParam("limit", "Limit", 5, "Repeat while the variable is below this")
      ]
    },
    {
      id: "message", name: "Message", description: "A line the operator can read. Klartext raises FN 14.",
      parameters: [textParam("text", "Text", "Check part", "Shown to the operator")]
    },
    {
      id: "tool-call", name: "Tool call", description: "Select a tool and change to it.",
      parameters: [
        numberParam("tool", "Tool", 1, "Tool number", 1),
        ...(family === "heidenhain" ? [numberParam("speed", "Spindle speed", 1000, "Spindle speed at the tool call")] : [])
      ]
    }
  ]
  if (family === "heidenhain") {
    common.push({
      id: "cycle-call", name: "Cycle call", description: "Call the active CYCL DEF, then once more at a position.",
      parameters: [
        numberParam("x", "X", 0, "Position of the second call", -10000),
        numberParam("y", "Y", 0, "Position of the second call", -10000)
      ]
    })
  }
  return common
}

/** Snippets the controller can insert. GRBL and an unknown post return none. */
export const availableMacros = (controller: CycleController): ReadonlyArray<MacroSnippet> => {
  const family = familyOf(controller)
  return family === "none" ? [] : snippetsFor(family)
}

/** The NC of one snippet. Throws, naming the parameter, when a value is outside what that control accepts. */
export const generateMacro = (snippetId: string, values: CycleValues, controller: CycleController): string => {
  const family = familyOf(controller)
  if (family === "none") throw new RangeError("This post cannot write a variable or a macro")
  switch (snippetId) {
    case "assign": return assign(family, values)
    case "if": return branch(family, values, "If")
    case "while": return branch(family, values, "While")
    case "message": return message(family, values)
    case "tool-call": return toolCall(family, values)
    case "cycle-call":
      if (family !== "heidenhain") throw new RangeError("cycle-call is a Klartext snippet")
      return cycleCall(values)
    default: throw new RangeError(`${snippetId} is not a macro snippet`)
  }
}
