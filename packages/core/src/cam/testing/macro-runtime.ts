/**
 * The macro executor of the reference interpreter (spec 69 G4): what a control does with variables, expressions, jumps, loops and
 * macro calls before it moves an axis. `expandMacros` runs a program's statements and returns the straight-line program the
 * machine would cut, with every computed word replaced by its value, so `interpretGcode` replays a macro program like any other.
 *
 *   Fanuc / Haas / Mazak   `#100=[#101+5]`, `X[#100+5]`, `IF [..] GOTO n`, `IF [..] THEN #1=2`, `WHILE [..] DOn` / `ENDn`, `G65 P9010 A1`, `M98 P.. L..`
 *   Okuma                  `VC100=..`, `X=VC100+5`, `IF [..] N100`, `GOTO N100`, `CALL O9010 A1`
 *   Siemens                `R100=..`, `DEF REAL name`, `name=..`, `X=R100+5`, `IF` / `ELSE` / `ENDIF`, `WHILE` / `ENDWHILE`, `FOR` / `ENDFOR`,
 *                          `LABEL:` with `GOTO` / `GOTOF` / `GOTOB` / `GOTOC`, `PROC name(REAL a)` … `RET`, `MSG("..")`
 *   Heidenhain Klartext    `Q1 = ..`, `FN 0-13`, `FN 9-12 .. GOTO LBL n`, `LBL n`, `CALL LBL n REP k`, `X+Q1`, cycle parameters `Q200=+Q1`
 *   LinuxCNC               `#100=[..]`, `#<name>=..`, `oNNN sub` / `call` / `if` / `elseif` / `else` / `endif` / `while` / `endwhile` / `do` / `break` / `continue`
 *
 * Not modelled (reported, never guessed): the control's position and modal variables (`#5001`, `#4001`, `#5041`, Q108...), tool
 * tables, `G66` modal macros, external programs (`CALL PGM`, `EXTCALL`) and string parameters. A program that loops past
 * {@link MAX_STEPS} statements is stopped: no real macro is meant to run that long in a replay.
 */
import { evalExpr, type Expr, type VarRef } from "../macro.ts"

export const MAX_STEPS = 200_000
const MAX_CALL_DEPTH = 12

export type Family = "fanuc" | "okuma" | "siemens" | "heidenhain" | "linuxcnc"

export interface Expanded {
  readonly text: string
  /** For each output line, the 1-based line of the source it came from. */
  readonly lines: ReadonlyArray<number>
  readonly errors: ReadonlyArray<string>
  readonly family: Family
}

// ---------------------------------------------------------------- detection

/** True when the text uses a variable, a jump or a macro in any control's words; plain programs are left to the interpreter as they are. */
export const hasMacroSyntax = (text: string): boolean => {
  const code = text.replace(/\([^)\n]*\)/g, " ").replace(/;[^\n]*/g, " ")
  return /#\s*[<\d\[]|\bVC\d|\bR\d+\s*=|\bDEF\s+(REAL|INT|BOOL)\b|\bIF\b|\bWHILE\b|\bENDIF\b|\bGOTO[FBC]?\b|^\s*(?:N\d+\s+)?[A-Z_][A-Z0-9_]*\s*:\s*$|\bFN\s*\d+\s*:|\bQ[LR]?\d+\s*=|\bCALL\s+LBL\b|^\s*\d*\s*LBL\s+\d+|\bG65\b|^\s*o\s*(?:<[^>]+>|\d+)\s+(?:sub|endsub|call|if|elseif|else|endif|while|endwhile|do|repeat|return|break|continue)\b/im.test(code)
}

const familyOfText = (text: string): Family => {
  if (/\bBEGIN PGM\b/i.test(text)) return "heidenhain"
  if (/^\s*o\s*[<\d][^\s]*\s+(sub|call|if|while|endsub|endif|endwhile|do|repeat|return|else|elseif|break|continue)\b/im.test(text) || /#<\w+>/.test(text)) return "linuxcnc"
  if (/\bVC\d|\bVL\d|\bCALL\s+O\d/i.test(text)) return "okuma"
  if (/\bENDIF\b|\bENDWHILE\b|\bENDFOR\b|\bGOTO[FBC]\b|\bR\d+\s*=|\bDEF\s+(REAL|INT|BOOL)\b|\bPROC\b|\bMSG\s*\(/i.test(text) && !/#\s*\d/.test(text)) return "siemens"
  return "fanuc"
}

// ---------------------------------------------------------------- numbers

const trim = (n: number): string => {
  const t = Number(n.toFixed(5))
  return String(Object.is(t, -0) ? 0 : t)
}

// ---------------------------------------------------------------- expression parser

interface Scope {
  /** Variable store: `#12`, `R12`, `Q12`, `VC12`, or a lower-cased name. */
  readonly vars: Map<string, number>
  readonly local: Map<string, number>
}

class Failure extends Error {}

const FUNCTIONS: Readonly<Record<string, (a: number, b?: number) => number>> = {
  SIN: (a) => Math.sin((a * Math.PI) / 180), COS: (a) => Math.cos((a * Math.PI) / 180), TAN: (a) => Math.tan((a * Math.PI) / 180),
  ASIN: (a) => (Math.asin(a) * 180) / Math.PI, ACOS: (a) => (Math.acos(a) * 180) / Math.PI,
  ATAN: (a, b) => (b === undefined ? Math.atan(a) : Math.atan2(a, b)) * (180 / Math.PI), ATAN2: (a, b) => (Math.atan2(a, b ?? 1) * 180) / Math.PI,
  SQRT: (a) => { if (a < 0) throw new Failure("square root of a negative number"); return Math.sqrt(a) }, ABS: Math.abs,
  ROUND: (a) => Math.round(a), FIX: Math.floor, FUP: Math.ceil, INT: Math.trunc, TRUNC: Math.trunc, LN: (a) => { if (a <= 0) throw new Failure("logarithm of a non-positive number"); return Math.log(a) },
  EXP: Math.exp, NEG: (a) => -a, SGN: (a) => Math.sign(a), BIN: (a) => a, BCD: (a) => a, FRAC: (a) => a - Math.trunc(a), LOG: (a) => Math.log10(a)
}

class Parser {
  i = 0
  constructor(readonly s: string, readonly read: (name: string) => number, readonly family: Family) {}

  private ws(): void { while (this.i < this.s.length && /\s/.test(this.s[this.i]!)) this.i++ }
  private peek(re: RegExp): RegExpExecArray | null { this.ws(); re.lastIndex = this.i; return re.exec(this.s) }
  private eat(re: RegExp): string | undefined {
    const m = this.peek(re)
    if (m === null || m.index !== this.i) return undefined
    this.i += m[0].length
    return m[0]
  }

  parse(): number {
    const v = this.or()
    return v
  }

  private or(): number {
    let a = this.and()
    for (;;) {
      if (this.eat(/\bOR\b/iy) !== undefined) { const b = this.and(); a = a !== 0 || b !== 0 ? 1 : 0 }
      else if (this.eat(/\bXOR\b/iy) !== undefined) { const b = this.and(); a = (a !== 0) !== (b !== 0) ? 1 : 0 }
      else return a
    }
  }

  private and(): number {
    let a = this.comparison()
    while (this.eat(/\bAND\b/iy) !== undefined) { const b = this.comparison(); a = a !== 0 && b !== 0 ? 1 : 0 }
    return a
  }

  private comparison(): number {
    const a = this.sum()
    const op = this.eat(/==|<>|<=|>=|<|>|\b(?:EQ|NE|GE|LE|GT|LT)\b/iy)
    if (op === undefined) return a
    const b = this.sum()
    const eps = 1e-9
    switch (op.toUpperCase()) {
      case "==": case "EQ": return Math.abs(a - b) <= eps ? 1 : 0
      case "<>": case "NE": return Math.abs(a - b) > eps ? 1 : 0
      case "<": case "LT": return a < b - eps ? 1 : 0
      case ">": case "GT": return a > b + eps ? 1 : 0
      case "<=": case "LE": return a <= b + eps ? 1 : 0
      default: return a >= b - eps ? 1 : 0
    }
  }

  private sum(): number {
    let a = this.product()
    for (;;) {
      if (this.eat(/\+/y) !== undefined) a += this.product()
      else if (this.eat(/-/y) !== undefined) a -= this.product()
      else return a
    }
  }

  private product(): number {
    let a = this.power()
    for (;;) {
      if (this.eat(/\*(?!\*)/y) !== undefined) a *= this.power()
      else if (this.eat(/\//y) !== undefined) { const b = this.power(); if (b === 0) throw new Failure("division by zero"); a /= b }
      else if (this.eat(/\bMOD\b|%/iy) !== undefined) { const b = this.power(); if (b === 0) throw new Failure("modulo by zero"); a = a - b * Math.trunc(a / b) }
      else return a
    }
  }

  private power(): number {
    const a = this.unary()
    if (this.eat(/\*\*|\^/y) !== undefined) return Math.pow(a, this.power())
    return a
  }

  private unary(): number {
    if (this.eat(/-/y) !== undefined) return -this.unary()
    if (this.eat(/\+/y) !== undefined) return this.unary()
    if (this.eat(/\bNOT\b/iy) !== undefined) return this.unary() === 0 ? 1 : 0
    return this.primary()
  }

  private group(): number | undefined {
    const open = this.eat(/[\[(]/y)
    if (open === undefined) return undefined
    const v = this.or()
    // Siemens / Klartext functions take a comma list: only the first value is wanted here (see `args`).
    const close = this.eat(/[\])]/y)
    if (close === undefined) throw new Failure(`missing a closing bracket in '${this.s}'`)
    return v
  }

  /** `(a,b)` or `[a]` after a function name. */
  private args(): number[] {
    const open = this.eat(/[\[(]/y)
    if (open === undefined) throw new Failure("a function needs its argument in brackets")
    const out = [this.or()]
    while (this.eat(/,/y) !== undefined) out.push(this.or())
    if (this.eat(/[\])]/y) === undefined) throw new Failure(`missing a closing bracket in '${this.s}'`)
    return out
  }

  private primary(): number {
    const grouped = this.group()
    if (grouped !== undefined) return grouped
    const n = this.eat(/(?:\d+\.?\d*|\.\d+)(?:E[+-]?\d+)?/iy)
    if (n !== undefined) return Number(n)
    // Variables: #12, #<name>, #[expr] (indirect), R12, Q12, QL3, VC1.
    if (this.eat(/#/y) !== undefined) {
      const named = this.eat(/<[^>]+>/y)
      if (named !== undefined) return this.read(`#<${named.slice(1, -1).toLowerCase()}>`)
      if (this.eat(/\[/y) !== undefined) { const idx = this.or(); if (this.eat(/\]/y) === undefined) throw new Failure("missing ] in an indirect variable"); return this.read(`#${Math.round(idx)}`) }
      const d = this.eat(/\d+/y)
      if (d === undefined) throw new Failure(`a variable needs a number after # in '${this.s}'`)
      return this.read(`#${Number(d)}`)
    }
    const id = this.eat(/[A-Za-z_][A-Za-z0-9_]*/y)
    if (id !== undefined) {
      const up = id.toUpperCase()
      const call = FUNCTIONS[up]
      if (call !== undefined && /[\[(]/.test(this.s[this.i] ?? this.peekChar())) {
        const a = this.args()
        // Fanuc / LinuxCNC `ATAN[y]/[x]` is the two-argument arc tangent.
        if (up === "ATAN" && a.length === 1 && /^\s*\/\s*\[/.test(this.s.slice(this.i))) {
          this.eat(/\//y)
          const b = this.group()!
          return call(a[0]!, b)
        }
        return call(a[0]!, a[1])
      }
      if (/^(?:R|Q[LR]?|VC|VL|VS)\d+$/.test(up)) return this.read(up)
      return this.read(up.toLowerCase())
    }
    throw new Failure(`cannot read '${this.s.slice(this.i)}' as a value`)
  }

  private peekChar(): string { this.ws(); return this.s[this.i] ?? "" }
}

/** The value of `text` as an expression. Throws `Failure` with the reason. */
const evaluate = (text: string, read: (name: string) => number, family: Family): number => {
  const p = new Parser(text, read, family)
  const v = p.parse()
  p.i = p.i
  return v
}

// ---------------------------------------------------------------- executor

interface Frame {
  /** Line to continue at after the call. */
  readonly returnTo: number
  readonly local: Map<string, number>
  /** `M98 P.. L`, `CALL LBL .. REP`: runs left, and the first line of the body. */
  repeat?: { left: number; start: number }
}

/** Comments: `( )` and `;` on the ISO controls, `;` only where parentheses hold expressions (Siemens, Klartext). */
const stripComments = (raw: string, family: Family): string =>
  (family === "siemens" || family === "heidenhain" ? raw : raw.replace(/\([^)\n]*\)/g, " ")).replace(/;[^\n]*/g, "").trim()
const FUNCTION_WORDS = "SIN|COS|TAN|ASIN|ACOS|ATAN|SQRT|ABS|ROUND|FIX|FUP|LN|EXP|BIN|BCD"
const LETTER_VARS: Readonly<Record<string, number>> = { A: 1, B: 2, C: 3, I: 4, J: 5, K: 6, D: 7, E: 8, F: 9, H: 11, M: 13, Q: 17, R: 18, S: 19, T: 20, U: 21, V: 22, W: 23, X: 24, Y: 25, Z: 26 }

export const expandMacros = (source: string): Expanded => {
  const family = familyOfText(source)
  const strip = (line: string): string => stripComments(line, family)
  const raw = source.split(/\r?\n/)
  const errors: string[] = []
  const out: string[] = []
  const map: number[] = []
  const vars = new Map<string, number>()
  const stack: Frame[] = []
  let local = new Map<string, number>()
  let steps = 0
  let pc = 0
  let stopped = false
  const warned = new Set<string>()
  const fail = (line: number, message: string): void => { errors.push(`line ${line}: ${message}`) }
  const emit = (text: string, line: number): void => { if (text.trim() !== "") { out.push(text); map.push(line) } }

  const isLocalName = (name: string): boolean => (family === "fanuc" || family === "linuxcnc") && stack.length > 0 && /^#\d+$/.test(name) && Number(name.slice(1)) >= 1 && Number(name.slice(1)) <= 33
  const read = (line: number) => (name: string): number => {
    if (isLocalName(name)) return local.get(name) ?? 0
    if (/^#(?:4\d\d\d|5[0-9]\d\d)$/.test(name) || (family === "heidenhain" && /^Q1\d\d$/.test(name)) || /^#<_/.test(name)) {
      if (!vars.has(name) && !warned.has(name)) { warned.add(name); fail(line, `${name} is a control variable (position, modal state or tool data) that the replay does not model; it reads 0`) }
    }
    if (family === "siemens" && !/^R\d+$/.test(name) && !vars.has(name) && !local.has(name) && !warned.has(name)) { warned.add(name); fail(line, `'${name}' is not a declared variable`) }
    return local.get(name) ?? vars.get(name) ?? 0
  }
  const write = (name: string, value: number): void => {
    if (isLocalName(name) || (family === "heidenhain" && /^QL\d+$/.test(name) && stack.length > 0)) local.set(name, value)
    else vars.set(name, value)
  }
  const val = (text: string, line: number): number => {
    try { return evaluate(text, read(line), family) } catch (error) {
      if (error instanceof Failure) { fail(line, error.message); return 0 }
      throw error
    }
  }
  const targetName = (text: string, line: number): string | undefined => {
    const t = text.trim()
    let m = /^#\s*<([^>]+)>$/.exec(t)
    if (m) return `#<${m[1]!.toLowerCase()}>`
    m = /^#\s*(\d+)$/.exec(t)
    if (m) return `#${Number(m[1])}`
    m = /^#\s*\[(.+)\]$/.exec(t)
    if (m) return `#${Math.round(val(m[1]!, line))}`
    if (/^(?:R|Q[LR]?|VC|VL|VS)\d+$/i.test(t)) return t.toUpperCase()
    if ((family === "siemens" ? /^[A-Za-z_][A-Za-z0-9_]*$/ : /^[A-Za-z_][A-Za-z0-9_]{1,}$/).test(t)) return t.toLowerCase()
    return undefined
  }

  // ---- program structure
  const isO = (code: string): number | undefined => { const m = /^O\s*0*(\d+)\b/i.exec(code); return m ? Number(m[1]) : undefined }
  const programs = new Map<number, number>()
  const oStarts: Array<{ index: number; number: number }> = []
  raw.forEach((l, i) => { const n = isO(strip(l)); if (n !== undefined) oStarts.push({ index: i, number: n }) })
  const mainEnd = (family === "fanuc" || family === "okuma") && oStarts.length > 1 ? oStarts[1]!.index : raw.length
  oStarts.slice(1).forEach((p) => programs.set(p.number, p.index + 1))
  const bare = (i: number): string => strip(raw[i]!).replace(/^\d+\s+(?=\S)/, family === "heidenhain" ? "" : "$&").replace(/^N\d+\s+(?=\S)/i, "")
  const labelLine = (name: string): number | undefined => {
    const n = name.replace(/"/g, "")
    for (let i = 0; i < raw.length; i++) {
      const c = strip(raw[i]!)
      if (family === "fanuc" || family === "okuma") { if (new RegExp(`^N0*${n}(?:\\s|$)`, "i").test(c)) return i }
      else if (family === "siemens") { if (new RegExp(`^(?:N\\d+\\s+)?${n}\\s*:`, "i").test(c)) return i }
      else if (family === "heidenhain") { if (new RegExp(`^(?:\\d+\\s+)?LBL\\s+"?${n}"?\\s*$`, "i").test(c)) return i }
    }
    return undefined
  }
  const siemensProcs = new Map<string, { index: number; params: string[] }>()
  raw.forEach((l, i) => {
    const m = /^\s*PROC\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/i.exec(l)
    if (m) siemensProcs.set(m[1]!.toLowerCase(), { index: i, params: m[2]!.split(",").map((p) => p.trim().split(/\s+/).pop()!.toLowerCase()).filter((p) => p !== "") })
  })
  const oWord = (i: number): { id: string; kind: string; rest: string } | undefined => {
    const m = /^o\s*(<[^>]+>|\d+)\s+([a-z]+)\b\s*(.*)$/i.exec(strip(raw[i]!))
    return m ? { id: m[1]!.toLowerCase(), kind: m[2]!.toLowerCase(), rest: m[3] ?? "" } : undefined
  }
  const oSubs = new Map<string, number>()
  raw.forEach((_l, i) => { const o = oWord(i); if (o?.kind === "sub") oSubs.set(o.id, i) })
  /** The next line after `from` that closes one of `kinds` for the same o-number. */
  const oNext = (from: number, id: string, kinds: string[]): number | undefined => {
    for (let i = from + 1; i < raw.length; i++) { const o = oWord(i); if (o && o.id === id && kinds.includes(o.kind)) return i }
    return undefined
  }
  const oPrev = (from: number, id: string, kind: string): number | undefined => {
    for (let i = from - 1; i >= 0; i--) { const o = oWord(i); if (o && o.id === id && o.kind === kind) return i }
    return undefined
  }
  /** Lines of a Fanuc `WHILE .. DOn` and its `ENDn`. */
  const matchEnd = (from: number, n: number): number | undefined => { for (let i = from + 1; i < raw.length; i++) if (new RegExp(`^END\\s*${n}$`, "i").test(strip(raw[i]!))) return i; return undefined }
  const matchWhile = (from: number, n: number): number | undefined => { for (let i = from - 1; i >= 0; i--) if (new RegExp(`^WHILE\\b.*DO\\s*${n}$`, "i").test(strip(raw[i]!))) return i; return undefined }
  /** Siemens: the closing line of a structure opened at `from`, nesting counted, or a middle line (`ELSE`) at depth 1. */
  const matchSiemens = (from: number, open: RegExp, close: RegExp, mid?: RegExp): number | undefined => {
    let depth = 0
    for (let i = from; i < raw.length; i++) {
      const c = strip(raw[i]!)
      if (open.test(c)) depth++
      else if (close.test(c)) { depth--; if (depth === 0) return i }
      else if (mid !== undefined && depth === 1 && mid.test(c)) return i
    }
    return undefined
  }
  const splitArgs = (text: string): string[] => {
    const parts: string[] = []
    let depth = 0, cur = ""
    for (const ch of text) {
      if (ch === "(" || ch === "[") depth++
      if (ch === ")" || ch === "]") depth--
      if (ch === "," && depth === 0) { parts.push(cur); cur = ""; continue }
      cur += ch
    }
    if (cur.trim() !== "") parts.push(cur)
    return parts
  }

  // ---- computed words
  const substitute = (code: string, line: number): string => {
    if (family === "heidenhain") {
      return code.replace(/([A-Z]+)\s*([+-]?)\s*(Q[LR]?\d+)/g, (_all, letters: string, sign: string, q: string) => {
        const v = read(line)(q.toUpperCase()) * (sign === "-" ? -1 : 1)
        return `${letters}${v < 0 ? "-" : "+"}${trim(Math.abs(v))}`
      })
    }
    const startsValue = new RegExp(`^(#|\\[|(?:${FUNCTION_WORDS})\\s*\\[)`, "i")
    let result = ""
    let i = 0
    while (i < code.length) {
      const ch = code[i]!
      const atWord = /[A-Za-z]/.test(ch) && (i === 0 || /\s/.test(code[i - 1]!))
      if (atWord) {
        let j = i + 1
        let sign = 1
        const assign = code[j] === "="
        if (assign) j++
        else if (code[j] === "-" || code[j] === "+") { sign = code[j] === "-" ? -1 : 1; j++ }
        const rest = code.slice(j)
        if ((assign && /^\S/.test(rest)) || (!assign && startsValue.test(rest))) {
          let k = j, depth = 0
          for (; k < code.length; k++) {
            const c = code[k]!
            if (c === "[" || c === "(") depth++
            else if (c === "]" || c === ")") depth--
            else if (/\s/.test(c) && depth === 0) break
            else if (depth === 0 && k > j && !assign && /[A-Za-z]/.test(c) && /[\d\]]/.test(code[k - 1]!) && !new RegExp(`^(?:${FUNCTION_WORDS})`, "i").test(code.slice(k))) break
          }
          result += `${ch}${trim(val(code.slice(j, k), line) * sign)}`
          i = k
          continue
        }
      }
      result += ch
      i++
    }
    return result
  }
  const wordArgs = (text: string, line: number): Array<[string, number]> => {
    const res: Array<[string, number]> = []
    const re = /(?:^|\s)([A-Z])\s*(=?\S+)/gi
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      const letter = m[1]!.toUpperCase()
      const idx = LETTER_VARS[letter]
      if (idx === undefined) continue
      res.push([`#${idx}`, val(m[2]!.replace(/^=/, ""), line)])
    }
    return res
  }

  // ---- calls
  const enter = (to: number, returnTo: number, locals: Map<string, number>, line: number, repeat?: { left: number; start: number }): void => {
    if (stack.length >= MAX_CALL_DEPTH) { fail(line, `calls nest deeper than ${MAX_CALL_DEPTH}`); stopped = true; return }
    stack.push({ returnTo, local, ...(repeat !== undefined ? { repeat } : {}) })
    local = locals
    pc = to
  }
  /** `M99`, `RET`, `LBL 0`, `endsub`: runs the body again if it has repeats left, otherwise returns. */
  const leave = (): void => {
    const f = stack[stack.length - 1]
    if (f === undefined) { pc++; return }
    if (f.repeat !== undefined && f.repeat.left > 0) { f.repeat.left--; pc = f.repeat.start; return }
    stack.pop()
    local = f.local
    pc = f.returnTo
  }

  let cycleContinues = false
  /** Runs the statement at `pc`; every branch sets `pc`. */
  const step = (): void => {
    const line = pc + 1
    const rawLine = raw[pc]!
    let code = strip(rawLine)
    if (code === "" || code.startsWith("%")) { if (code === "" && rawLine.trim() !== "") emit(rawLine, line); pc++; return }
    if (family === "heidenhain") code = code.replace(/^\d+\s+(?=\S)/, "")
    code = code.replace(/^N\d+\s+(?=\S)/i, "")
    const upper = code.toUpperCase()

    if (family === "fanuc" || family === "okuma") {
      const sub = /^M98\s+(?:P0*(\d+)(?:\s+L(\d+))?|L(\d+)\s+P0*(\d+))/i.exec(code)
      if (sub !== null) {
        const n = Number(sub[1] ?? sub[4]), times = Number(sub[2] ?? sub[3] ?? 1)
        const at = programs.get(n)
        if (at === undefined) { fail(line, `M98 P${n}: no such program in the text`); pc++; return }
        if (times > 0) enter(at, pc + 1, new Map(), line, { left: times - 1, start: at })
        else pc++
        return
      }
      const call = /^(?:G65\s+P\s*|CALL\s+O\s*)0*(\d+)\b(.*)$/i.exec(code)
      if (call !== null) {
        const at = programs.get(Number(call[1]))
        if (at === undefined) { fail(line, `macro O${call[1]}: no such program in the text`); pc++; return }
        enter(at, pc + 1, new Map(wordArgs(call[2]!, line)), line)
        return
      }
      const go = /^GOTO\s+N?0*(\d+)$/i.exec(code)
      if (go !== null) { const t = labelLine(go[1]!); if (t === undefined) { fail(line, `GOTO ${go[1]}: no block with that number`); stopped = true } else pc = t; return }
      const ifg = /^IF\s*(\[.*\])\s*(?:GOTO\s+N?|N)0*(\d+)$/i.exec(code)
      if (ifg !== null) {
        if (val(ifg[1]!, line) !== 0) { const t = labelLine(ifg[2]!); if (t === undefined) { fail(line, `IF .. GOTO ${ifg[2]}: no block with that number`); stopped = true } else pc = t }
        else pc++
        return
      }
      const ift = /^IF\s*(\[.*?\])\s*THEN\s+(.+)$/i.exec(code)
      if (ift !== null) {
        if (val(ift[1]!, line) !== 0) { const a = /^(.+?)\s*=\s*(.+)$/.exec(ift[2]!); const n = a ? targetName(a[1]!, line) : undefined; if (a && n) write(n, val(a[2]!, line)) }
        pc++
        return
      }
      const wh = /^WHILE\s*(\[.*\])\s*DO\s*(\d+)$/i.exec(code)
      if (wh !== null) {
        if (val(wh[1]!, line) !== 0) pc++
        else { const e = matchEnd(pc, Number(wh[2])); if (e === undefined) { fail(line, `WHILE .. DO${wh[2]} has no END${wh[2]}`); stopped = true } else pc = e + 1 }
        return
      }
      const en = /^END\s*(\d+)$/i.exec(code)
      if (en !== null) { const w = matchWhile(pc, Number(en[1])); if (w === undefined) { fail(line, `END${en[1]} has no WHILE .. DO${en[1]}`); stopped = true } else pc = w; return }
      if (/^M99\b/i.test(code)) { leave(); return }
      if (/^(M30|M2)\b/i.test(code) && stack.length === 0) { emit(rawLine, line); stopped = true; return }
      if (/^#(3000|3006)\s*=/.test(code)) { fail(line, `${code.slice(0, 5)} raises an alarm or stops with a message: the program stops`); stopped = true; return }
      const as = /^((?:#\s*(?:<[^>]+>|\d+|\[[^\]]+\])|VC\d+|VL\d+|VS\d+))\s*=\s*(.+)$/i.exec(code)
      if (as !== null) { const n = targetName(as[1]!, line); if (n === undefined) fail(line, `cannot assign to '${as[1]}'`); else write(n, val(as[2]!, line)); pc++; return }
      if (/^G6[67]\b/.test(code)) { fail(line, `${code.slice(0, 3)}: modal macro calls are not replayed`); pc++; return }
      if (/^(DPRNT|POPEN|PCLOS|BPRNT)\b/i.test(code)) { pc++; return }
      emit(substitute(code, line), line)
      pc++
      return
    }

    if (family === "siemens") {
      const decl = /^DEF\s+(?:REAL|INT|BOOL|CHAR)\s+(.+)$/i.exec(code)
      if (decl !== null) { for (const part of decl[1]!.split(",")) { const [n, v] = part.split("="); vars.set(n!.trim().toLowerCase(), v === undefined ? 0 : val(v, line)) } pc++; return }
      if (/^[A-Za-z_][A-Za-z0-9_]*\s*:$/.test(code)) { pc++; return }
      const gt = /^(?:IF\s+(.+?)\s+)?(GOTO[FBC]?)\s+([A-Za-z_][A-Za-z0-9_]*)$/i.exec(code)
      if (gt !== null) {
        if (gt[1] === undefined || val(gt[1], line) !== 0) { const t = labelLine(gt[3]!); if (t === undefined) { fail(line, `${gt[2]} ${gt[3]}: no such label`); stopped = true } else pc = t }
        else pc++
        return
      }
      const ifs = /^IF\s+(.+)$/i.exec(code)
      if (ifs !== null) {
        if (val(ifs[1]!, line) !== 0) { pc++; return }
        const t = matchSiemens(pc, /^IF\b(?!.*\bGOTO[FBC]?\b)/i, /^ENDIF\b/i, /^ELSE\b/i)
        if (t === undefined) { fail(line, "IF without ENDIF"); stopped = true } else pc = /^ELSE\b/i.test(strip(raw[t]!)) ? t + 1 : t + 1
        return
      }
      if (/^ELSE\b/i.test(code)) { const e = matchSiemens(pc - 0, /^IF\b(?!.*\bGOTO[FBC]?\b)|^ELSE\b/i, /^ENDIF\b/i); const close = (() => { let d = 1; for (let i = pc + 1; i < raw.length; i++) { const c = strip(raw[i]!); if (/^IF\b(?!.*\bGOTO[FBC]?\b)/i.test(c)) d++; else if (/^ENDIF\b/i.test(c)) { d--; if (d === 0) return i } } return undefined })(); void e; if (close === undefined) { fail(line, "ELSE without ENDIF"); stopped = true } else pc = close + 1; return }
      if (/^ENDIF\b/i.test(code)) { pc++; return }
      const ws = /^WHILE\s+(.+)$/i.exec(code)
      if (ws !== null) {
        if (val(ws[1]!, line) !== 0) pc++
        else { const e = matchSiemens(pc, /^WHILE\b/i, /^ENDWHILE\b/i); if (e === undefined) { fail(line, "WHILE without ENDWHILE"); stopped = true } else pc = e + 1 }
        return
      }
      if (/^ENDWHILE\b/i.test(code)) {
        let d = 0, found: number | undefined
        for (let i = pc; i >= 0; i--) { const c = strip(raw[i]!); if (/^ENDWHILE\b/i.test(c)) d++; else if (/^WHILE\b/i.test(c)) { d--; if (d === 0) { found = i; break } } }
        if (found === undefined) { fail(line, "ENDWHILE without WHILE"); stopped = true } else pc = found
        return
      }
      const fr = /^FOR\s+(\S+?)\s*=\s*(.+?)\s+TO\s+(.+)$/i.exec(code)
      if (fr !== null) {
        const name = targetName(fr[1]!, line)!
        const key = `for@${pc}`
        if (!vars.has(key)) write(name, val(fr[2]!, line))
        if (read(line)(name) <= val(fr[3]!, line)) { vars.set(key, 1); pc++ }
        else { vars.delete(key); const e = matchSiemens(pc, /^FOR\b/i, /^ENDFOR\b/i); if (e === undefined) { fail(line, "FOR without ENDFOR"); stopped = true } else pc = e + 1 }
        return
      }
      if (/^ENDFOR\b/i.test(code)) {
        let d = 0, found: number | undefined
        for (let i = pc; i >= 0; i--) { const c = strip(raw[i]!); if (/^ENDFOR\b/i.test(c)) d++; else if (/^FOR\b/i.test(c)) { d--; if (d === 0) { found = i; break } } }
        if (found === undefined) { fail(line, "ENDFOR without FOR"); stopped = true } else { const f = /^FOR\s+(\S+?)\s*=/i.exec(strip(raw[found]!))!; const name = targetName(f[1]!, line)!; write(name, read(line)(name) + 1); pc = found }
        return
      }
      if (/^PROC\b/i.test(code)) { pc = raw.length; return }
      const cs = /^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/.exec(code)
      if (cs !== null && siemensProcs.has(cs[1]!.toLowerCase())) {
        const p = siemensProcs.get(cs[1]!.toLowerCase())!
        const values = splitArgs(cs[2]!).map((a) => val(a, line))
        for (const [k, name] of p.params.entries()) vars.set(name, values[k] ?? 0)
        enter(p.index + 1, pc + 1, new Map(), line)
        return
      }
      if (/^(M17|RET)\b/i.test(code)) { leave(); return }
      if (/^(M30|M2)\b/i.test(code) && stack.length === 0) { emit(rawLine, line); stopped = true; return }
      if (/^SETAL\b/i.test(code)) { fail(line, "SETAL raises an alarm: the program stops"); stopped = true; return }
      if (/^(MSG|STOPRE)\b/i.test(code)) { pc++; return }
      const as = /^((?:R\d+)|(?:[A-Za-z_][A-Za-z0-9_]{1,}))\s*=\s*(.+)$/.exec(code)
      if (as !== null && (/^R\d+$/i.test(as[1]!) || vars.has(as[1]!.toLowerCase()))) { write(targetName(as[1]!, line)!, val(as[2]!, line)); pc++; return }
      emit(substitute(code, line), line)
      pc++
      return
    }

    if (family === "heidenhain") {
      const continues = /~\s*$/.test(strip(rawLine).replace(/^\d+\s+/, ""))
      const wasContinued = cycleContinues
      cycleContinues = continues
      if (/^(BEGIN|END) PGM\b/.test(upper)) { emit(rawLine, line); pc++; return }
      // Cycle parameters (`Q200=2` under `CYCL DEF 200 ~`) belong to the cycle: kept, with their values.
      if (wasContinued || continues) { emit(substitute(rawLine.replace(/^\d+\s+/, ""), line), line); pc++; return }
      const fn = /^FN\s*(\d+)\s*:\s*(.*)$/.exec(upper)
      if (fn !== null) {
        const n = Number(fn[1]), rest = fn[2]!
        const q = (t: string): string => t.replace(/^\+/, "")
        if (n >= 9 && n <= 12) {
          const j = /^IF\s+(\S+)\s+(EQU|NE|GT|LT)\s+(\S+)\s+GOTO\s+LBL\s+(\S+)$/.exec(rest)
          if (j === null) { fail(line, `FN ${n}: cannot read '${rest}'`); stopped = true; return }
          const a = val(q(j[1]!), line), b = val(q(j[3]!), line)
          const hit = j[2] === "EQU" ? Math.abs(a - b) < 1e-9 : j[2] === "NE" ? Math.abs(a - b) >= 1e-9 : j[2] === "GT" ? a > b + 1e-9 : a < b - 1e-9
          if (hit) { const t = labelLine(j[4]!); if (t === undefined) { fail(line, `no LBL ${j[4]}`); stopped = true } else pc = t }
          else pc++
          return
        }
        if (n === 14) { fail(line, "FN 14 raises an error message: the program stops"); stopped = true; return }
        if ([15, 16, 18, 19, 20, 25, 26, 27, 28, 29, 37].includes(n)) { pc++; return }
        const a = /^(Q[LR]?\d+)\s*=\s*(.*)$/.exec(rest)
        if (a === null) { fail(line, `FN ${n}: cannot read '${rest}'`); pc++; return }
        const norm = (x: string): string => x.replace(/\+\s*(?=[Q\d.])/g, "+").replace(/\s+/g, " ").trim()
        const x = norm(a[2]!)
        // FN 1-4 write the operator between two values (`+Q1 + +5`, `+Q1 X +2` for a product); FN 5-8 and 13 name the function.
        const sides = (op: RegExp): [string, string] => { const [l, r] = x.split(op); return [q(l ?? "0"), q(r ?? "0")] }
        const forms: Record<number, (() => string) | undefined> = {
          0: () => q(x), 1: () => { const [l, r] = sides(/\s\+\s/); return `(${l})+(${r})` }, 2: () => { const [l, r] = sides(/\s-\s/); return `(${l})-(${r})` },
          3: () => { const [l, r] = sides(/\sX\s|\s\*\s/); return `(${l})*(${r})` }, 4: () => { const [l, r] = sides(/\s\/\s/); return `(${l})/(${r})` },
          5: () => `SQRT(${q(x.replace(/^SQRT\s*/, ""))})`, 6: () => `SIN(${q(x.replace(/^SIN\s*/, ""))})`, 7: () => `COS(${q(x.replace(/^COS\s*/, ""))})`,
          8: () => { const [p, r] = sides(/\s+LEN\s+/); return `SQRT((${p})*(${p})+(${r})*(${r}))` },
          13: () => { const [p, r] = sides(/\s+ANG\s+/); return `ATAN2(${p},${r})` }
        }
        const f = forms[n]
        if (f === undefined) { fail(line, `FN ${n} is not replayed`); pc++; return }
        write(a[1]!, val(f(), line))
        pc++
        return
      }
      const fm = /^(Q[LR]?\d+)\s*=\s*(.+)$/.exec(upper)
      if (fm !== null) { write(fm[1]!, val(fm[2]!, line)); pc++; return }
      const lbl = /^LBL\s+(\S+)$/.exec(upper)
      if (lbl !== null) { if (lbl[1] === "0") leave(); else pc++; return }
      const cl = /^CALL LBL\s+(\S+?)(?:\s+REP\s*(\d+)(?:\/\d+)?)?$/.exec(upper)
      if (cl !== null) {
        const t = labelLine(cl[1]!)
        if (t === undefined) { fail(line, `CALL LBL ${cl[1]}: no such label`); pc++; return }
        enter(t + 1, pc + 1, new Map(), line, { left: cl[2] !== undefined ? Number(cl[2]) : 0, start: t + 1 })
        return
      }
      if (/^CALL PGM\b/.test(upper)) { fail(line, `${code}: external programs are not replayed`); pc++; return }
      if (/\bM(30|2)\b/.test(upper) && stack.length === 0) { emit(substitute(rawLine.replace(/^\d+\s+/, ""), line), line); stopped = true; return }
      emit(substitute(rawLine.replace(/^\d+\s+/, ""), line), line)
      pc++
      return
    }

    // LinuxCNC
    const ow = oWord(pc)
    if (ow !== undefined) {
      const { id, kind, rest } = ow
      switch (kind) {
        case "sub": { const e = oNext(pc, id, ["endsub"]); pc = (e ?? raw.length) + 1; return }
        case "endsub": case "return": leave(); return
        case "call": {
          const at = oSubs.get(id)
          if (at === undefined) { fail(line, `o${id} call: no such subroutine`); pc++; return }
          const values = [...rest.matchAll(/\[((?:[^\[\]]|\[[^\]]*\])*)\]/g)].map((m) => val(m[1]!, line))
          enter(at + 1, pc + 1, new Map(values.map((v, k) => [`#${k + 1}`, v] as const)), line)
          return
        }
        case "if": case "elseif": {
          // Arriving by fall-through from a branch that ran: skip to the end of the chain.
          if (kind === "elseif" && !arrivedByJump) { const e = oNext(pc, id, ["endif"]); pc = (e ?? raw.length) + 1; return }
          arrivedByJump = false
          if (val(rest, line) !== 0) { pc++; return }
          const next = oNext(pc, id, ["elseif", "else", "endif"])
          if (next === undefined) { fail(line, `o${id} if has no endif`); stopped = true; return }
          const nk = oWord(next)!.kind
          if (nk === "elseif") { arrivedByJump = true; pc = next } else pc = next + 1
          return
        }
        case "else": { const e = oNext(pc, id, ["endif"]); pc = (e ?? raw.length) + 1; return }
        case "endif": pc++; return
        case "while": {
          if (val(rest, line) !== 0) pc++
          else { const e = oNext(pc, id, ["endwhile"]); pc = (e ?? raw.length) + 1 }
          return
        }
        case "endwhile": { const w = oPrev(pc, id, "while"); pc = w ?? pc + 1; return }
        case "break": { const e = oNext(pc, id, ["endwhile"]); pc = (e ?? raw.length) + 1; return }
        case "continue": { const e = oNext(pc, id, ["endwhile"]); pc = e ?? pc + 1; return }
        default: fail(line, `o${id} ${kind} is not replayed`); pc++; return
      }
    }
    const al = /^(#\s*(?:<[^>]+>|\d+|\[[^\]]+\]))\s*=\s*(.+)$/.exec(code)
    if (al !== null) { const n = targetName(al[1]!, line); if (n === undefined) fail(line, `cannot assign to '${al[1]}'`); else write(n, val(al[2]!, line)); pc++; return }
    if (/^(M30|M2)\b/i.test(code) && stack.length === 0) { emit(rawLine, line); stopped = true; return }
    emit(substitute(code, line), line)
    pc++
  }
  let arrivedByJump = false

  while (!stopped && pc < (stack.length > 0 ? raw.length : mainEnd)) {
    if (++steps > MAX_STEPS) { fail(pc + 1, `the program ran more than ${MAX_STEPS} statements: stopped (a loop that does not end?)`); break }
    step()
  }
  return { text: out.join("\n"), lines: map, errors, family }
}

export type { Expr, VarRef }
export { evalExpr }
