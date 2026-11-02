/**
 * Parameter expressions: the arithmetic a dimension may be written in (`width / 2 + 3`, `sin(angle)`, `max(a, b) * 2`,
 * `if(width > 40, 6, 4)`), and the table of named parameters they refer to. A parameter is a number or an expression of the other
 * parameters; the table is resolved in dependency order and a cycle is an error naming the loop, not a hang.
 *
 * Grammar (usual precedence, `^` binds tighter than unary minus and is right-associative; comparisons give 1 or 0):
 *   expr    = and { "||" and }
 *   and     = compare { "&&" compare }
 *   compare = sum [ ("<" | ">" | "<=" | ">=" | "==" | "!=") sum ]
 *   sum     = term { ("+" | "-") term }
 *   term    = unary { ("*" | "/" | "%") unary }
 *   unary   = ("-" | "+" | "!") unary | power
 *   power   = atom [ "^" unary ]
 *   atom    = number | name | name "(" [ expr { "," expr } ] ")" | "(" expr ")"
 * Numbers take an optional exponent (`1e-3`) and the units `um`, `mm`, `cm`, `m`, `in`, `ft`, `thou` (all converted to millimetres) and
 * `deg`, `rad` (converted to radians); a space before the unit is allowed (`2 in`). So `2in` is 50.8 and `90deg` is pi / 2.
 * Constants: pi, e, tau. Functions: see `FUNCTIONS` (trigonometry, roots, powers, rounding, min / max / clamp / mod, and the lazy
 * `if(condition, then, else)` whose unused branch is not evaluated, so `if(w > 0, 100 / w, 0)` never divides by zero).
 */

export class ExpressionError extends Error {
  constructor(message: string, readonly position: number, readonly source: string) {
    super(`${message} (at ${position} in "${source}")`)
    this.name = "ExpressionError"
  }
}

type Token =
  | { readonly kind: "num"; readonly value: number; readonly unit?: Unit; readonly at: number }
  | { readonly kind: "name"; readonly name: string; readonly at: number }
  | { readonly kind: "op"; readonly op: string; readonly at: number }
  | { readonly kind: "end"; readonly at: number }

type Unit = "length" | "angle"
const UNITS: Readonly<Record<string, { readonly factor: number; readonly unit: Unit }>> = {
  um: { factor: 0.001, unit: "length" }, mm: { factor: 1, unit: "length" }, cm: { factor: 10, unit: "length" }, m: { factor: 1000, unit: "length" },
  in: { factor: 25.4, unit: "length" }, ft: { factor: 304.8, unit: "length" }, thou: { factor: 0.0254, unit: "length" },
  deg: { factor: Math.PI / 180, unit: "angle" }, rad: { factor: 1, unit: "angle" }
}
const UNIT_AFTER_NUMBER = /^[ \t]*(um|mm|cm|m|in|ft|thou|deg|rad)(?![A-Za-z0-9_])/

const tokenise = (source: string): Token[] => {
  const out: Token[] = []
  let i = 0
  while (i < source.length) {
    const ch = source[i]!
    if (/\s/.test(ch)) { i++; continue }
    if (/[0-9.]/.test(ch)) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(i))
      if (m === null) throw new ExpressionError("Malformed number", i, source)
      let value = Number(m[0])
      const at = i
      i += m[0].length
      const unit = UNIT_AFTER_NUMBER.exec(source.slice(i))
      if (unit !== null) {
        const u = UNITS[unit[1]!]!
        value *= u.factor
        i += unit[0].length
        out.push({ kind: "num", value, unit: u.unit, at })
      } else out.push({ kind: "num", value, at })
      continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i))!
      out.push({ kind: "name", name: m[0], at: i })
      i += m[0].length
      continue
    }
    const two = source.slice(i, i + 2)
    if (two === "<=" || two === ">=" || two === "==" || two === "!=" || two === "&&" || two === "||") { out.push({ kind: "op", op: two, at: i }); i += 2; continue }
    if ("+-*/%^(),<>!".includes(ch)) { out.push({ kind: "op", op: ch, at: i }); i++; continue }
    throw new ExpressionError(`Unexpected character '${ch}'`, i, source)
  }
  out.push({ kind: "end", at: source.length })
  return out
}

/** What a quantity measures. `any` is a bare number or a name of unknown kind: it takes the kind of what it meets. */
export type QuantityKind = "length" | "angle" | "any"

interface Fn {
  readonly arity: number | "variadic" | readonly [number, number]
  readonly run: (a: number[]) => number
  /** Kind rule for the checker: what the arguments should be and what comes out. */
  readonly takes?: QuantityKind
  readonly gives?: QuantityKind | "args"
  readonly help: string
}
const f1 = (run: (x: number) => number, help: string, takes?: QuantityKind, gives?: QuantityKind | "args"): Fn => ({ arity: 1, run: (a) => run(a[0]!), help, ...(takes ? { takes } : {}), ...(gives ? { gives } : {}) })

export const FUNCTIONS: Readonly<Record<string, Fn>> = {
  sin: f1(Math.sin, "sin(angle)", "angle", "any"), cos: f1(Math.cos, "cos(angle)", "angle", "any"), tan: f1(Math.tan, "tan(angle)", "angle", "any"),
  sinh: f1(Math.sinh, "sinh(x)"), cosh: f1(Math.cosh, "cosh(x)"), tanh: f1(Math.tanh, "tanh(x)"),
  asin: f1(Math.asin, "asin(x): an angle", undefined, "angle"), acos: f1(Math.acos, "acos(x): an angle", undefined, "angle"), atan: f1(Math.atan, "atan(x): an angle", undefined, "angle"),
  atan2: { arity: 2, run: (a) => Math.atan2(a[0]!, a[1]!), gives: "angle", help: "atan2(y, x): an angle" },
  sqrt: f1(Math.sqrt, "sqrt(x)"), cbrt: f1(Math.cbrt, "cbrt(x)"), abs: f1(Math.abs, "abs(x)", undefined, "args"),
  min: { arity: "variadic", run: (a) => Math.min(...a), gives: "args", help: "min(a, b, ...)" }, max: { arity: "variadic", run: (a) => Math.max(...a), gives: "args", help: "max(a, b, ...)" },
  clamp: { arity: 3, run: (a) => Math.min(Math.max(a[0]!, a[1]!), a[2]!), gives: "args", help: "clamp(x, low, high)" },
  mod: { arity: 2, run: (a) => a[0]! - a[1]! * Math.floor(a[0]! / a[1]!), gives: "args", help: "mod(x, n): the remainder with the sign of n" },
  floor: f1(Math.floor, "floor(x)", undefined, "args"), ceil: f1(Math.ceil, "ceil(x)", undefined, "args"), round: f1(Math.round, "round(x)", undefined, "args"), trunc: f1(Math.trunc, "trunc(x)", undefined, "args"),
  pow: { arity: 2, run: (a) => Math.pow(a[0]!, a[1]!), help: "pow(x, y)" }, exp: f1(Math.exp, "exp(x)"), ln: f1(Math.log, "ln(x): natural logarithm"),
  log10: f1(Math.log10, "log10(x)"), log2: f1(Math.log2, "log2(x)"), sign: f1(Math.sign, "sign(x)"), hypot: { arity: "variadic", run: (a) => Math.hypot(...a), gives: "args", help: "hypot(a, b, ...)" },
  deg: f1((x) => (x * 180) / Math.PI, "deg(radians): the number of degrees", "angle", "any"), rad: f1((x) => (x * Math.PI) / 180, "rad(degrees): an angle", undefined, "angle"),
  if: { arity: 3, run: (a) => (a[0]! !== 0 ? a[1]! : a[2]!), gives: "args", help: "if(condition, then, else): only the chosen branch is evaluated" }
}
const CONSTANTS: Readonly<Record<string, number>> = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI }

export type Scope = (name: string) => number | undefined

type Node =
  | { readonly k: "num"; readonly v: number; readonly unit?: Unit }
  | { readonly k: "name"; readonly name: string; readonly at: number }
  | { readonly k: "un"; readonly op: string; readonly a: Node }
  | { readonly k: "bin"; readonly op: string; readonly a: Node; readonly b: Node; readonly at: number }
  | { readonly k: "call"; readonly name: string; readonly args: ReadonlyArray<Node>; readonly at: number }

const parse = (source: string): Node => {
  const tokens = tokenise(source)
  let at = 0
  const peek = (): Token => tokens[at]!
  const take = (): Token => tokens[at++]!
  const isOp = (t: Token, op: string): boolean => t.kind === "op" && t.op === op
  const expect = (op: string): void => {
    const t = take()
    if (!isOp(t, op)) throw new ExpressionError(`Expected '${op}'`, t.at, source)
  }
  const binary = (next: () => Node, ops: ReadonlyArray<string>): Node => {
    let left = next()
    for (;;) {
      const t = peek()
      if (t.kind === "op" && ops.includes(t.op)) { take(); left = { k: "bin", op: t.op, a: left, b: next(), at: t.at } } else return left
    }
  }
  const expr = (): Node => binary(and, ["||"])
  const and = (): Node => binary(compare, ["&&"])
  const compare = (): Node => {
    const left = sum()
    const t = peek()
    if (t.kind === "op" && ["<", ">", "<=", ">=", "==", "!="].includes(t.op)) { take(); return { k: "bin", op: t.op, a: left, b: sum(), at: t.at } }
    return left
  }
  const sum = (): Node => binary(term, ["+", "-"])
  const term = (): Node => binary(unary, ["*", "/", "%"])
  const unary = (): Node => {
    const t = peek()
    if (isOp(t, "-") || isOp(t, "+") || isOp(t, "!")) { take(); return { k: "un", op: (t as { op: string }).op, a: unary() } }
    return power()
  }
  const power = (): Node => {
    const base = atom()
    const t = peek()
    if (isOp(t, "^")) { take(); return { k: "bin", op: "^", a: base, b: unary(), at: t.at } }
    return base
  }
  const atom = (): Node => {
    const t = take()
    if (t.kind === "num") return { k: "num", v: t.value, ...(t.unit ? { unit: t.unit } : {}) }
    if (isOp(t, "(")) { const v = expr(); expect(")"); return v }
    if (t.kind === "name") {
      if (isOp(peek(), "(")) {
        take()
        const fn = FUNCTIONS[t.name]
        if (fn === undefined) throw new ExpressionError(`Unknown function '${t.name}'`, t.at, source)
        const args: Node[] = []
        if (!isOp(peek(), ")")) {
          args.push(expr())
          while (isOp(peek(), ",")) { take(); args.push(expr()) }
        }
        expect(")")
        if (fn.arity === "variadic") {
          if (args.length === 0) throw new ExpressionError(`'${t.name}' needs at least one argument`, t.at, source)
        } else if (args.length !== fn.arity) throw new ExpressionError(`'${t.name}' takes ${fn.arity} argument(s), got ${args.length}`, t.at, source)
        return { k: "call", name: t.name, args, at: t.at }
      }
      return { k: "name", name: t.name, at: t.at }
    }
    throw new ExpressionError(t.kind === "end" ? "Unexpected end of expression" : `Unexpected '${t.kind === "op" ? t.op : ""}'`, t.at, source)
  }
  const tree = expr()
  const rest = peek()
  if (rest.kind !== "end") throw new ExpressionError("Unexpected input after the expression", rest.at, source)
  return tree
}

/** Evaluates `source`; names are looked up in `scope` (constants and functions are built in). */
export const evaluate = (source: string, scope: Scope = () => undefined): number => {
  const run = (n: Node): number => {
    switch (n.k) {
      case "num": return n.v
      case "name": {
        const known = scope(n.name)
        if (known !== undefined) return known
        const constant = CONSTANTS[n.name]
        if (constant !== undefined) return constant
        throw new ExpressionError(`Unknown name '${n.name}'`, n.at, source)
      }
      case "un": { const v = run(n.a); return n.op === "-" ? -v : n.op === "!" ? (v === 0 ? 1 : 0) : v }
      case "bin": {
        if (n.op === "&&") return run(n.a) !== 0 && run(n.b) !== 0 ? 1 : 0
        if (n.op === "||") return run(n.a) !== 0 || run(n.b) !== 0 ? 1 : 0
        const a = run(n.a), b = run(n.b)
        switch (n.op) {
          case "+": return a + b
          case "-": return a - b
          case "*": return a * b
          case "/": if (b === 0) throw new ExpressionError("Division by zero", n.at, source); return a / b
          case "%": if (b === 0) throw new ExpressionError("Division by zero", n.at, source); return a % b
          case "^": return Math.pow(a, b)
          case "<": return a < b ? 1 : 0
          case ">": return a > b ? 1 : 0
          case "<=": return a <= b ? 1 : 0
          case ">=": return a >= b ? 1 : 0
          case "==": return a === b ? 1 : 0
          default: return a !== b ? 1 : 0
        }
      }
      case "call": {
        if (n.name === "if") return run(n.args[0]!) !== 0 ? run(n.args[1]!) : run(n.args[2]!)
        return FUNCTIONS[n.name]!.run(n.args.map(run))
      }
    }
  }
  const value = run(parse(source))
  if (!Number.isFinite(value)) throw new ExpressionError("The result is not a finite number", 0, source)
  return value
}

/** Where each name an expression refers to first appears (not constants, not function names); works on text that does not parse. */
export const referencesIn = (source: string, known?: (name: string) => boolean): ReadonlyArray<{ readonly name: string; readonly at: number }> => {
  const tokens = tokenise(source)
  const seen = new Set<string>()
  const out: Array<{ name: string; at: number }> = []
  tokens.forEach((t, i) => {
    if (t.kind !== "name") return
    const next = tokens[i + 1]
    if (next?.kind === "op" && next.op === "(") return
    // A parameter may be named like a constant (`e`): then the parameter wins, as in `evaluate`.
    if (t.name in CONSTANTS && known?.(t.name) !== true) return
    if (!seen.has(t.name)) { seen.add(t.name); out.push({ name: t.name, at: t.at }) }
  })
  return out
}

/** The names an expression refers to (not constants, not function names). */
export const namesIn = (source: string, known?: (name: string) => boolean): ReadonlyArray<string> => referencesIn(source, known).map((r) => r.name)

export interface KindReport {
  readonly kind: QuantityKind
  /** Mixed units found in the expression: adding a length to an angle, a length given to `sin`, ... Warnings, never errors. */
  readonly problems: ReadonlyArray<string>
}

/**
 * Dimensional check of an expression: lengths (mm) and angles (rad) are told apart, a bare number takes the kind of what it
 * meets (`width + 3` is a length). `kindOfName` gives the kind of a parameter. It reports what is mixed up; it never refuses.
 */
export const inferKind = (source: string, kindOfName: (name: string) => QuantityKind = () => "any"): KindReport => {
  const problems: string[] = []
  const meet = (a: QuantityKind, b: QuantityKind, what: string): QuantityKind => {
    if (a === "any") return b
    if (b === "any" || a === b) return a
    problems.push(`${what} mixes ${a} with ${b}`)
    return a
  }
  const kindOf = (n: Node): QuantityKind => {
    switch (n.k) {
      case "num": return n.unit ?? "any"
      case "name": return CONSTANTS[n.name] !== undefined ? "any" : kindOfName(n.name)
      case "un": return n.op === "!" ? "any" : kindOf(n.a)
      case "bin": {
        const a = kindOf(n.a), b = kindOf(n.b)
        if (n.op === "+" || n.op === "-") return meet(a, b, `'${n.op}'`)
        if (n.op === "<" || n.op === ">" || n.op === "<=" || n.op === ">=" || n.op === "==" || n.op === "!=") { meet(a, b, `'${n.op}'`); return "any" }
        if (n.op === "*") return a === "any" ? b : b === "any" ? a : "any"
        if (n.op === "/") return b === "any" ? a : a === b ? "any" : "any"
        if (n.op === "%") return a
        return n.op === "^" ? (a === "any" ? "any" : "any") : "any"
      }
      case "call": {
        const fn = FUNCTIONS[n.name]!
        const args = n.args.map(kindOf)
        if (n.name === "if") return meet(args[1]!, args[2]!, "'if'")
        if (fn.takes !== undefined) {
          for (const a of args) if (a !== "any" && a !== fn.takes) problems.push(`${n.name}() takes an ${fn.takes}, not a ${a}`)
        }
        if (fn.gives === "args") return args.reduce<QuantityKind>((acc, a) => meet(acc, a, `${n.name}()`), "any")
        return fn.gives ?? "any"
      }
    }
  }
  const kind = kindOf(parse(source))
  return { kind, problems }
}

export type ParameterTable = Readonly<Record<string, number | string>>

export interface ResolvedParameters {
  readonly values: Readonly<Record<string, number>>
  /** Parameters that could not be evaluated, with the reason (the others are still resolved). */
  readonly errors: Readonly<Record<string, string>>
}

/** The parameters each parameter's formula refers to (names that are not in the table are included, so they can be reported). */
export const parameterDependencies = (table: ParameterTable): ReadonlyMap<string, ReadonlyArray<string>> => {
  const known = (n: string) => Object.hasOwn(table, n)
  const out = new Map<string, ReadonlyArray<string>>()
  for (const [name, def] of Object.entries(table)) {
    let deps: ReadonlyArray<string> = []
    if (typeof def === "string") { try { deps = namesIn(def, known) } catch { deps = [] } }
    out.set(name, deps)
  }
  return out
}

/**
 * The circular definitions of a table: every strongly connected group of parameters that depend on each other (a self-reference
 * is a group of one), each written as the loop `a -> b -> c -> a`. Tarjan's algorithm, so every cycle is found once and the
 * answer does not depend on the order the parameters were written in.
 */
export const parameterCycles = (table: ParameterTable): ReadonlyArray<ReadonlyArray<string>> => {
  const deps = parameterDependencies(table)
  const index = new Map<string, number>(), low = new Map<string, number>(), onStack = new Set<string>()
  const stack: string[] = []
  const found: string[][] = []
  let counter = 0
  const visit = (v: string): void => {
    index.set(v, counter); low.set(v, counter); counter++
    stack.push(v); onStack.add(v)
    for (const w of deps.get(v) ?? []) {
      if (!deps.has(w)) continue
      if (!index.has(w)) { visit(w); low.set(v, Math.min(low.get(v)!, low.get(w)!)) } else if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!))
    }
    if (low.get(v) === index.get(v)) {
      const group: string[] = []
      let w: string
      do { w = stack.pop()!; onStack.delete(w); group.push(w) } while (w !== v)
      if (group.length > 1 || (deps.get(v) ?? []).includes(v)) found.push(group)
    }
  }
  for (const name of deps.keys()) if (!index.has(name)) visit(name)
  // Write each group as an actual loop through its first name in table order (depth-first inside the group).
  const order = [...deps.keys()]
  return found.map((group) => {
    const members = new Set(group)
    const start = order.find((n) => members.has(n))!
    const walk = (at: string, trail: string[]): string[] | undefined => {
      for (const next of deps.get(at) ?? []) {
        if (!members.has(next)) continue
        if (next === start) return [...trail, start]
        if (trail.includes(next)) continue
        const done = walk(next, [...trail, next])
        if (done !== undefined) return done
      }
      return undefined
    }
    return walk(start, [start]) ?? [start, start]
  })
}

/**
 * Resolves a table of parameters in dependency order. A parameter that depends on a failed or cyclic one fails too, with the
 * name of the culprit; the rest still resolve.
 */
export const resolveParameters = (table: ParameterTable): ResolvedParameters => {
  const values: Record<string, number> = {}
  const errors: Record<string, string> = {}
  const state = new Map<string, "visiting" | "done">()
  const known = (n: string) => Object.hasOwn(table, n)
  const visit = (name: string, trail: ReadonlyArray<string>): void => {
    if (state.get(name) === "done") return
    if (state.get(name) === "visiting") {
      const loop = [...trail.slice(trail.indexOf(name)), name].join(" -> ")
      errors[name] = `circular definition: ${loop}`
      state.set(name, "done")
      return
    }
    state.set(name, "visiting")
    const def = table[name]!
    if (typeof def === "number") {
      if (Number.isFinite(def)) values[name] = def
      else errors[name] = "not a finite number"
    } else {
      try {
        for (const dep of referencesIn(def, known)) {
          if (!known(dep.name)) throw new ExpressionError(`Unknown parameter '${dep.name}'`, dep.at, def)
          visit(dep.name, [...trail, name])
          if (errors[dep.name] !== undefined) throw new Error(`depends on '${dep.name}', which failed: ${errors[dep.name]}`)
        }
        values[name] = evaluate(def, (n) => values[n])
      } catch (error) {
        if (errors[name] === undefined) errors[name] = error instanceof Error ? error.message : String(error)
      }
    }
    state.set(name, "done")
  }
  for (const name of Object.keys(table)) visit(name, [])
  return { values, errors }
}

/** A dimension: a number, or an expression over parameters. */
export type Dimension = number | string

/**
 * Evaluates a dimension against resolved parameter values. `failed` (the `errors` of `resolveParameters`) makes a name that
 * refers to a parameter that failed say so, instead of "unknown name".
 */
export const dimensionValue = (dimension: Dimension, values: Readonly<Record<string, number>>, failed?: Readonly<Record<string, string>>): number => {
  if (typeof dimension === "number") return dimension
  try {
    return evaluate(dimension, (n) => values[n])
  } catch (error) {
    if (failed !== undefined && error instanceof ExpressionError) {
      const culprit = referencesIn(dimension).find((r) => failed[r.name] !== undefined)
      if (culprit !== undefined) throw new ExpressionError(`Parameter '${culprit.name}' failed: ${failed[culprit.name]}`, culprit.at, dimension)
    }
    throw error
  }
}
