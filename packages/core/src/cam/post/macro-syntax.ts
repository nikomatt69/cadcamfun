/**
 * Variables, macros and control flow in the words of each control family (spec 69 G4). The shared writer asks a `MacroEmitter`
 * for the blocks of every `Assign`, `MacroCall`, `If`, `While`, `Label`, `Goto` and `Message` of the IR and for the value of a
 * word whose number the control computes (`X[#100+5]`). Expression constants are written as they are, in the program's output
 * units: a variable holds what the control holds.
 *
 *   fanuc       Fanuc, Haas, Mazak EIA, the generic ISO post   `#100=[#101+5]`, `IF [#1 LT 5] GOTO 1001`, `WHILE [..] DO1` / `END1`, `G65 P9010 A1 B2`
 *   okuma       Okuma OSP                                       `VC100=VC101+5`, `IF [VC1 LT 5] N1001`, `CALL O9010 A1 B2`
 *   siemens     Siemens 840D sl                                 `R100=R101+5`, `IF R1<5` / `ELSE` / `ENDIF`, `WHILE R1<5` / `ENDWHILE`, `GOTOF` / `GOTOB`, `MYCYCLE(1,2)`
 *   heidenhain  Klartext (TNC 640, iTNC 530)                    `Q100 = Q101 + 5`, `FN 9: IF +Q1 EQU +Q2 GOTO LBL 900`, `CALL PGM`, `FN 14: ERROR`
 *   linuxcnc    LinuxCNC RS274NGC                               `#100=[#101+5]`, `o100 if [..]` / `else` / `endif`, `o101 while [..]` / `endwhile`, `o<name> call [..]`
 *   none        GRBL: no variables, no macros                   every node is refused with the reason
 *
 * The syntax follows the vendors' programming manuals as the author reads them; no output was run on a controller (spec 54 §4).
 * A name is not a number: a named variable takes the next free number of the family's range, in order of first use, and the writer
 * says so in a comment where it is first assigned.
 */
import { NEGATED, exprProblem, type Comparison, type Condition, type Expr, type VarRef } from "../macro.ts"
import type { Move } from "../ir.ts"

export type MacroFamily = "fanuc" | "okuma" | "siemens" | "heidenhain" | "linuxcnc" | "none"

/** The lines of a Klartext block the shared writer hands to the Klartext translator untouched. */
export const KLARTEXT_PREFIX = "KT:"

/** Where a family keeps its variables that a name is given to, and its scratch variables. */
const NAMED_BASE: Readonly<Record<Exclude<MacroFamily, "none" | "linuxcnc">, number>> = { fanuc: 100, okuma: 100, siemens: 100, heidenhain: 80 }
/** Klartext scratch parameters for a computed word value: the control only takes a parameter after the axis letter. */
const KLARTEXT_TEMPS = [99, 98, 97, 96] as const
/** The first label number the writer hands out (Fanuc `N`, Klartext `LBL`), clear of the label subprograms (1..) and line numbers. */
const FIRST_LABEL = 900

type ControlMove = Extract<Move, { readonly _tag: "Assign" | "MacroCall" | "If" | "Else" | "EndIf" | "While" | "EndWhile" | "Label" | "Goto" | "Message" }>

type Open =
  | { readonly kind: "if"; readonly endLabel: string; readonly elseLabel: string; hasElse: boolean; readonly number: number }
  | { readonly kind: "while"; readonly top: string; readonly end: string; readonly depth: number; readonly number: number }

const fmtNumber = (n: number): string => {
  if (!Number.isFinite(n)) throw new RangeError(`An expression holds ${n}, which no control reads`)
  return String(Number(n.toFixed(6)))
}

const refuse = (family: MacroFamily, what: string): never => {
  throw new RangeError(`${family === "none" ? "This post" : `The ${family} post`} cannot write ${what}`)
}

export class MacroEmitter {
  private readonly names = new Map<string, number>()
  private readonly labels = new Map<string, string>()
  private readonly stack: Open[] = []
  private nextLabel = FIRST_LABEL
  private nextStructure = 100
  private whileDepth = 0
  private temp = 0

  constructor(readonly family: MacroFamily) {}

  /** The number a named variable was given (read by tests and by the setup comment). */
  numberOf(name: string): number | undefined {
    return this.names.get(name)
  }

  private nameNumber(name: string): { readonly index: number; readonly fresh: boolean } {
    const have = this.names.get(name)
    if (have !== undefined) return { index: have, fresh: false }
    const base = NAMED_BASE[this.family as keyof typeof NAMED_BASE]
    if (base === undefined) return refuse(this.family, `the named variable '${name}'`)
    const index = this.family === "heidenhain" ? base - this.names.size : base + this.names.size
    this.names.set(name, index)
    return { index, fresh: true }
  }

  // ------------------------------------------------------------ variables and expressions

  variable(v: VarRef): string {
    if (this.family === "none") return refuse("none", "a variable")
    if ("name" in v) {
      if (this.family === "linuxcnc") return `#<${v.name}>`
      return this.variable({ scope: "global", index: this.nameNumber(v.name).index })
    }
    switch (this.family) {
      case "fanuc":
      case "linuxcnc": return `#${v.index}`
      case "okuma": return `${v.scope === "local" ? "VL" : v.scope === "system" ? "VS" : "VC"}${v.index}`
      case "siemens": return `R${v.index}`
      case "heidenhain":
        // Q0-Q99 are the programmer's; Q100-Q199 are reserved by the control (tool data, system results) and may only be read.
        if (v.scope === "global" && v.index > 99) throw new RangeError(`Q${v.index} is reserved by the TNC (Q0-Q99 are free to use): use a system variable to read it`)
        return `${v.scope === "local" ? "QL" : v.scope === "system" ? "Q" : "Q"}${v.index}`
    }
  }

  /** `a` + `b` and the like with the control's own brackets; `top` is true where the value stands alone (right of `=`). */
  expression(e: Expr, top = true): string {
    if (typeof e === "number") return fmtNumber(e)
    if ("var" in e) return this.variable(e.var)
    const wrap = (s: string): string => (top ? s : this.family === "fanuc" || this.family === "linuxcnc" || this.family === "okuma" ? `[${s}]` : `(${s})`)
    if ("op" in e) {
      const a = this.expression(e.a, false), b = this.expression(e.b, false)
      const bracket = this.family === "fanuc" || this.family === "linuxcnc" || this.family === "okuma"
      // Fanuc, LinuxCNC and Okuma bracket a whole right-hand side that is not a single value: `#1=[#2+5]`.
      const word = (op: string): string => (bracket && top ? `[${a}${op}${b}]` : wrap(`${a}${op}${b}`))
      switch (e.op) {
        case "+": case "-": case "*": case "/": return word(e.op)
        case "mod": return this.family === "heidenhain" ? wrap(`${a} % ${b}`) : this.family === "siemens" ? wrap(`${a} MOD ${b}`) : word(this.family === "linuxcnc" ? " mod " : " MOD ")
        case "and": case "or": case "xor":
          if (this.family === "heidenhain") return refuse("heidenhain", `the logical '${e.op}' in a formula (use FN 9-12 conditions)`)
          return word(this.family === "linuxcnc" ? ` ${e.op} ` : ` ${e.op.toUpperCase()} `)
      }
    }
    return this.func(e.fn, e.a, e.b, top)
  }

  private func(fn: string, a: Expr, b: Expr | undefined, top: boolean): string {
    const A = this.expression(a, false), B = b === undefined ? undefined : this.expression(b, false)
    const bracket = this.family === "fanuc" || this.family === "linuxcnc" || this.family === "okuma"
    const call = (name: string, ...args: string[]): string => (bracket ? `${name}[${args.join(",")}]` : `${name}(${args.join(",")})`)
    const upper = (name: string): string => (this.family === "linuxcnc" ? name.toLowerCase() : name.toUpperCase())
    if (bracket) {
      switch (fn) {
        case "sin": case "cos": case "tan": case "asin": case "acos": case "sqrt": case "abs": case "round": case "fix": case "fup": case "ln": case "exp":
          return call(upper(fn), this.expression(a, true))
        case "atan": return `${upper("atan")}[${this.expression(a, true)}]/[1]`
        case "atan2": return `${upper("atan")}[${this.expression(a, true)}]/[${B === undefined ? "1" : this.expression(b!, true)}]`
        case "neg": return `[0-${A}]`
        case "hypot": return call(upper("sqrt"), `${A}*${A}+${B ?? "0"}*${B ?? "0"}`)
      }
    }
    if (this.family === "siemens") {
      switch (fn) {
        case "sin": case "cos": case "tan": case "asin": case "acos": case "sqrt": case "abs": case "round": case "ln": case "exp": return call(fn.toUpperCase(), this.expression(a, true))
        case "atan": return call("ATAN2", this.expression(a, true), "1")
        case "atan2": return call("ATAN2", this.expression(a, true), B === undefined ? "1" : this.expression(b!, true))
        case "neg": return `(0-${A})`
        case "hypot": return call("SQRT", `${A}*${A}+${B ?? "0"}*${B ?? "0"}`)
        default: return refuse("siemens", `'${fn}' (the control has TRUNC, which cuts toward zero, not a floor or ceiling)`)
      }
    }
    if (this.family === "heidenhain") {
      switch (fn) {
        case "sin": case "cos": case "tan": case "asin": case "acos": case "sqrt": case "abs": case "ln": case "exp": return call(fn.toUpperCase(), this.expression(a, true))
        case "atan": return call("ATAN", this.expression(a, true))
        case "atan2": return call("ATAN", `${this.expression(a, true)}/${B === undefined ? "1" : this.expression(b!, true)}`)
        case "neg": return call("NEG", this.expression(a, true))
        case "hypot": return call("SQRT", `${A}*${A}+${B ?? "0"}*${B ?? "0"}`)
        case "fix": return call("INT", this.expression(a, true))
        default: return refuse("heidenhain", `'${fn}' in a formula`)
      }
    }
    void top
    return refuse(this.family, `the function '${fn}'`)
  }

  condition(c: Condition): string {
    const a = this.expression(c.a, false), b = this.expression(c.b, false)
    switch (this.family) {
      case "fanuc": case "okuma": return `[${a} ${c.cmp.toUpperCase()} ${b}]`
      case "linuxcnc": return `[${a} ${c.cmp} ${b}]`
      case "siemens": return `${a}${{ eq: "==", ne: "<>", lt: "<", le: "<=", gt: ">", ge: ">=" }[c.cmp]}${b}`
      case "heidenhain": return `${a} ${c.cmp.toUpperCase()} ${b}`
      case "none": return refuse("none", "a condition")
    }
  }

  // ------------------------------------------------------------ words with a computed value

  /**
   * The text after an axis or feed letter for a value the control computes, and the blocks to write before the block that holds it.
   * Klartext takes only a parameter after the letter (`X+Q99`), so a formula goes to a scratch parameter first.
   */
  word(letter: string, e: Expr): { readonly pre: ReadonlyArray<string>; readonly text: string } {
    this.check(e)
    switch (this.family) {
      case "none": return refuse("none", `the computed word ${letter}`)
      case "fanuc": case "linuxcnc": case "okuma": {
        if (this.family === "okuma") return { pre: [], text: `=${this.expression(e)}` }
        if (typeof e === "number" || "var" in e) return { pre: [], text: this.expression(e) }
        const text = this.expression(e, true)
        return { pre: [], text: text.startsWith("[") ? text : `[${text}]` }
      }
      case "siemens": return { pre: [], text: `=${this.expression(e)}` }
      case "heidenhain": {
        if (typeof e !== "number" && "var" in e) return { pre: [], text: this.variable(e.var) }
        const q = KLARTEXT_TEMPS[this.temp++ % KLARTEXT_TEMPS.length]!
        return { pre: [`${KLARTEXT_PREFIX}Q${q} = ${this.expression(e)}`], text: `Q${q}` }
      }
    }
  }

  // ------------------------------------------------------------ control nodes

  private labelOf(name: string): string {
    const have = this.labels.get(name)
    if (have !== undefined) return have
    const text = this.family === "siemens" ? (/^[A-Za-z]/.test(name) ? name : `L${name}`) : String(this.nextLabel++)
    this.labels.set(name, text)
    return text
  }

  private fresh(): string {
    return this.family === "siemens" ? `_L${this.nextStructure++}` : String(this.nextLabel++)
  }

  private jump(label: string, cond: Condition | undefined, direction: "auto" | "forward" | "backward" = "auto"): string[] {
    switch (this.family) {
      case "fanuc": return [cond === undefined ? `GOTO ${label}` : `IF ${this.condition(cond)} GOTO ${label}`]
      case "okuma": return [cond === undefined ? `GOTO N${label}` : `IF ${this.condition(cond)} N${label}`]
      case "siemens": {
        const word = direction === "backward" ? "GOTOB" : direction === "forward" ? "GOTOF" : "GOTO"
        return [cond === undefined ? `${word} ${label}` : `IF ${this.condition(cond)} ${word} ${label}`]
      }
      case "heidenhain": return this.klartextJump(label, cond)
      case "linuxcnc": return refuse("linuxcnc", "a jump to a label (RS274NGC has none; use If / While)")
      case "none": return refuse("none", "a jump")
    }
  }

  /** Klartext has `FN 9` (equal), `FN 10` (not equal), `FN 11` (greater), `FN 12` (less) and no unconditional jump: `+0 EQU +0`. */
  private klartextJump(label: string, cond: Condition | undefined): string[] {
    const fn = (n: number, op: string, a: string, b: string): string => `${KLARTEXT_PREFIX}FN ${n}: IF ${a} ${op} ${b} GOTO LBL ${label}`
    if (cond === undefined) return [fn(9, "EQU", "+0", "+0")]
    const a = this.signed(cond.a), b = this.signed(cond.b)
    const pre: string[] = []
    const sa = a.pre.length > 0 ? (pre.push(...a.pre), a.text) : a.text
    const sb = b.pre.length > 0 ? (pre.push(...b.pre), b.text) : b.text
    const lines: Record<Comparison, string[]> = {
      eq: [fn(9, "EQU", sa, sb)], ne: [fn(10, "NE", sa, sb)], gt: [fn(11, "GT", sa, sb)], lt: [fn(12, "LT", sa, sb)],
      ge: [fn(11, "GT", sa, sb), fn(9, "EQU", sa, sb)], le: [fn(12, "LT", sa, sb), fn(9, "EQU", sa, sb)]
    }
    return [...pre, ...lines[cond.cmp]]
  }

  private signed(e: Expr): { readonly pre: ReadonlyArray<string>; readonly text: string } {
    if (typeof e === "number") return { pre: [], text: `${e < 0 ? "-" : "+"}${fmtNumber(Math.abs(e))}` }
    const w = this.word("X", e)
    return { pre: w.pre, text: `+${w.text}` }
  }

  private labelLine(label: string): string {
    switch (this.family) {
      case "fanuc": case "okuma": return `N${label}`
      case "siemens": return `${label}:`
      case "heidenhain": return `${KLARTEXT_PREFIX}LBL ${label}`
      case "linuxcnc": return refuse("linuxcnc", "a label")
      case "none": return refuse("none", "a label")
    }
  }

  private check(e: unknown): void {
    const problem = exprProblem(e)
    if (problem !== undefined) throw new RangeError(`Bad expression: ${problem}`)
  }

  /** The blocks of one control node. A line that starts with `KT:` is a finished Klartext block. */
  node(move: ControlMove): string[] {
    if (move._tag === "Assign") this.check(move.value)
    if (move._tag === "MacroCall") for (const a of Object.values(move.args)) this.check(a)
    if (move._tag === "If" || move._tag === "While" || (move._tag === "Goto" && move.condition !== undefined)) {
      const c = move._tag === "Goto" ? move.condition! : move.condition
      this.check(c.a)
      this.check(c.b)
    }
    if (this.family === "none") return refuse("none", `${move._tag === "Assign" ? "a variable" : move._tag === "MacroCall" ? "a macro call" : move._tag === "Message" ? "an operator message" : "control flow"} (the controller has none)`)
    switch (move._tag) {
      case "Assign": return this.assign(move.variable, move.value)
      case "MacroCall": return this.callBlock(move.name, move.args)
      case "Message": return [this.messageBlock(move.text)]
      case "Label": return [this.labelLine(this.labelOf(move.name))]
      case "Goto": return this.jump(this.labelOf(move.label), move.condition, move.direction)
      case "If": return this.ifStart(move.condition)
      case "Else": return this.elseBlock()
      case "EndIf": return this.endIf()
      case "While": return this.whileStart(move.condition)
      case "EndWhile": return this.endWhile()
    }
  }

  private assign(v: VarRef, e: Expr): string[] {
    const out: string[] = []
    if ("name" in v && this.family !== "linuxcnc" && this.nameNumber(v.name).fresh) {
      const text = `${v.name} = ${this.variable(v)}`
      out.push(this.family === "heidenhain" ? `${KLARTEXT_PREFIX};VARIABLE ${text}` : this.family === "siemens" ? `;VARIABLE ${text}` : `(VARIABLE ${text.toUpperCase()})`)
    }
    const target = this.variable(v)
    switch (this.family) {
      case "fanuc": case "linuxcnc": out.push(`${target}=${this.expression(e)}`); break
      case "okuma": case "siemens": out.push(`${target}=${this.expression(e)}`); break
      case "heidenhain": out.push(`${KLARTEXT_PREFIX}${target} = ${this.expression(e)}`); break
    }
    return out
  }

  /**
   * A macro call. The arguments are the macro's letters: Fanuc `G65 P9010 A1 B2` (A..Z are #1..#26 inside), Okuma `CALL O9010`,
   * Siemens `NAME(a,b)` in letter order, LinuxCNC `o<name> call [a] [b]`. Klartext passes values in parameters: the letter
   * A..Z is assigned to Q1..Q26 before `CALL PGM`.
   */
  private callBlock(name: string, args: Readonly<Record<string, Expr>>): string[] {
    const keys = Object.keys(args).sort()
    const arg = (k: string): string => `${k.toUpperCase()}${this.argValue(args[k]!)}`
    switch (this.family) {
      case "fanuc": return [`G65 P${name.replace(/^O/i, "")} ${keys.map(arg).join(" ")}`.trim()]
      case "okuma": return [`CALL O${name.replace(/^O/i, "")} ${keys.map(arg).join(" ")}`.trim()]
      case "siemens": return [`${name}(${keys.map((k) => this.expression(args[k]!)).join(",")})`]
      case "heidenhain": return [...keys.map((k) => `${KLARTEXT_PREFIX}Q${k.toUpperCase().charCodeAt(0) - 64} = ${this.expression(args[k]!)}`), `${KLARTEXT_PREFIX}CALL PGM ${name}`]
      case "linuxcnc": return [`o<${name}> call ${keys.map((k) => `[${this.expression(args[k]!)}]`).join(" ")}`.trim()]
      case "none": return refuse("none", "a macro call")
    }
  }

  private argValue(e: Expr): string {
    return typeof e === "number" ? fmtNumber(e) : this.word("X", e).text
  }

  private messageBlock(text: string): string {
    const clean = text.replace(/[()";\r\n]/g, " ").replace(/\s+/g, " ").trim().toUpperCase()
    switch (this.family) {
      case "fanuc": return `(MSG, ${clean})`
      case "okuma": return `(${clean})`
      case "siemens": return `MSG("${clean}")`
      case "heidenhain": return `${KLARTEXT_PREFIX}FN 14: ERROR = 1000`
      case "linuxcnc": return `(MSG, ${clean})`
      case "none": return refuse("none", "a message")
    }
  }

  // ------------------------------------------------------------ structured flow

  private ifStart(c: Condition): string[] {
    const open: Open = { kind: "if", endLabel: this.fresh(), elseLabel: this.fresh(), hasElse: false, number: this.nextStructure++ }
    this.stack.push(open)
    switch (this.family) {
      case "siemens": return [`IF ${this.condition(c)}`]
      case "linuxcnc": return [`o${open.number} if ${this.condition(c)}`]
      // Jump over the body when the condition does not hold.
      case "fanuc": case "okuma": return this.jump(open.elseLabel, { cmp: NEGATED[c.cmp], a: c.a, b: c.b })
      case "heidenhain": return this.klartextEnter(open.elseLabel, c)
      case "none": return refuse("none", "an If")
    }
  }

  /** Klartext: jump into the body when the condition holds, otherwise to `otherwise`. */
  private klartextEnter(otherwise: string, c: Condition): string[] {
    const body = this.fresh()
    return [...this.klartextJump(body, c), ...this.klartextJump(otherwise, undefined), this.labelLine(body)]
  }

  private elseBlock(): string[] {
    const open = this.stack[this.stack.length - 1]
    if (open === undefined || open.kind !== "if" || open.hasElse) throw new RangeError("Else without a matching If")
    open.hasElse = true
    switch (this.family) {
      case "siemens": return ["ELSE"]
      case "linuxcnc": return [`o${open.number} else`]
      default: return [...this.jump(open.endLabel, undefined, "forward"), this.labelLine(open.elseLabel)]
    }
  }

  private endIf(): string[] {
    const open = this.stack.pop()
    if (open === undefined || open.kind !== "if") throw new RangeError("EndIf without a matching If")
    switch (this.family) {
      case "siemens": return ["ENDIF"]
      case "linuxcnc": return [`o${open.number} endif`]
      default: return open.hasElse ? [this.labelLine(open.endLabel)] : [this.labelLine(open.elseLabel)]
    }
  }

  private whileStart(c: Condition): string[] {
    const depth = ++this.whileDepth
    const open: Open = { kind: "while", top: this.fresh(), end: this.fresh(), depth, number: this.nextStructure++ }
    this.stack.push(open)
    switch (this.family) {
      case "fanuc":
        if (depth > 3) throw new RangeError("Fanuc nests WHILE three deep")
        return [`WHILE ${this.condition(c)} DO${depth}`]
      case "siemens": return [`WHILE ${this.condition(c)}`]
      case "linuxcnc": return [`o${open.number} while ${this.condition(c)}`]
      case "okuma": return [this.labelLine(open.top), ...this.jump(open.end, { cmp: NEGATED[c.cmp], a: c.a, b: c.b })]
      case "heidenhain": return [this.labelLine(open.top), ...this.klartextEnter(open.end, c)]
      case "none": return refuse("none", "a While")
    }
  }

  private endWhile(): string[] {
    const open = this.stack.pop()
    if (open === undefined || open.kind !== "while") throw new RangeError("EndWhile without a matching While")
    this.whileDepth--
    switch (this.family) {
      case "fanuc": return [`END${open.depth}`]
      case "siemens": return ["ENDWHILE"]
      case "linuxcnc": return [`o${open.number} endwhile`]
      case "okuma": return [...this.jump(open.top, undefined), this.labelLine(open.end)]
      case "heidenhain": return [...this.klartextJump(open.top, undefined), this.labelLine(open.end)]
      case "none": return refuse("none", "an EndWhile")
    }
  }

  /** The structures still open at the end of the program: a post refuses to write a program that leaves one. */
  get open(): number {
    return this.stack.length
  }
}

export const familyOf = (id: string): MacroFamily => {
  switch (id) {
    case "fanuc": case "haas": case "mazak": case "generic": return "fanuc"
    case "okuma": return "okuma"
    case "siemens": return "siemens"
    case "heidenhain": return "heidenhain"
    case "linuxcnc": return "linuxcnc"
    default: return "none"
  }
}

