/**
 * Parameter expressions: the arithmetic a dimension may be written in (`width / 2 + 3`, `sin(angle)`, `max(a, b) * 2`), and the
 * table of named parameters they refer to. A parameter is a number or an expression of the other parameters; the table is
 * resolved in dependency order and a cycle is an error naming the loop, not a hang.
 *
 * Grammar (usual precedence, `^` binds tighter than unary minus and is right-associative):
 *   expr    = term { ("+" | "-") term }
 *   term    = unary { ("*" | "/" | "%") unary }
 *   unary   = ("-" | "+") unary | power
 *   power   = atom [ "^" unary ]
 *   atom    = number | name | name "(" [ expr { "," expr } ] ")" | "(" expr ")"
 * Numbers take an optional exponent (`1e-3`) and the units `mm`, `cm`, `m`, `in` (all converted to millimetres) and `deg`, `rad`
 * (converted to radians), so `2in` is 50.8 and `90deg` is pi / 2. Constants: pi, e, tau. Functions: sin cos tan asin acos atan
 * atan2 sqrt abs min max floor ceil round pow exp ln log10 sign hypot deg(radians to degrees) rad(degrees to radians).
 */

export class ExpressionError extends Error {
  constructor(message: string, readonly position: number, readonly source: string) {
    super(`${message} (at ${position} in "${source}")`)
    this.name = "ExpressionError"
  }
}

type Token =
  | { readonly kind: "num"; readonly value: number; readonly at: number }
  | { readonly kind: "name"; readonly name: string; readonly at: number }
  | { readonly kind: "op"; readonly op: string; readonly at: number }
  | { readonly kind: "end"; readonly at: number }

const UNITS: Readonly<Record<string, number>> = { mm: 1, cm: 10, m: 1000, in: 25.4, deg: Math.PI / 180, rad: 1 }

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
      const unit = /^(mm|cm|m|in|deg|rad)(?![A-Za-z0-9_])/.exec(source.slice(i))
      if (unit !== null) { value *= UNITS[unit[1]!]!; i += unit[1]!.length }
      out.push({ kind: "num", value, at })
      continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i))!
      out.push({ kind: "name", name: m[0], at: i })
      i += m[0].length
      continue
    }
    if ("+-*/%^(),".includes(ch)) { out.push({ kind: "op", op: ch, at: i }); i++; continue }
    throw new ExpressionError(`Unexpected character '${ch}'`, i, source)
  }
  out.push({ kind: "end", at: source.length })
  return out
}

const FUNCTIONS: Readonly<Record<string, { readonly arity: number | "variadic"; readonly run: (a: number[]) => number }>> = {
  sin: { arity: 1, run: (a) => Math.sin(a[0]!) }, cos: { arity: 1, run: (a) => Math.cos(a[0]!) }, tan: { arity: 1, run: (a) => Math.tan(a[0]!) },
  asin: { arity: 1, run: (a) => Math.asin(a[0]!) }, acos: { arity: 1, run: (a) => Math.acos(a[0]!) }, atan: { arity: 1, run: (a) => Math.atan(a[0]!) },
  atan2: { arity: 2, run: (a) => Math.atan2(a[0]!, a[1]!) }, sqrt: { arity: 1, run: (a) => Math.sqrt(a[0]!) }, abs: { arity: 1, run: (a) => Math.abs(a[0]!) },
  min: { arity: "variadic", run: (a) => Math.min(...a) }, max: { arity: "variadic", run: (a) => Math.max(...a) },
  floor: { arity: 1, run: (a) => Math.floor(a[0]!) }, ceil: { arity: 1, run: (a) => Math.ceil(a[0]!) }, round: { arity: 1, run: (a) => Math.round(a[0]!) },
  pow: { arity: 2, run: (a) => Math.pow(a[0]!, a[1]!) }, exp: { arity: 1, run: (a) => Math.exp(a[0]!) }, ln: { arity: 1, run: (a) => Math.log(a[0]!) },
  log10: { arity: 1, run: (a) => Math.log10(a[0]!) }, sign: { arity: 1, run: (a) => Math.sign(a[0]!) }, hypot: { arity: "variadic", run: (a) => Math.hypot(...a) },
  deg: { arity: 1, run: (a) => (a[0]! * 180) / Math.PI }, rad: { arity: 1, run: (a) => (a[0]! * Math.PI) / 180 }
}
const CONSTANTS: Readonly<Record<string, number>> = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI }

export type Scope = (name: string) => number | undefined

/** Evaluates `source`; names are looked up in `scope` (constants and functions are built in). */
export const evaluate = (source: string, scope: Scope = () => undefined): number => {
  const tokens = tokenise(source)
  let at = 0
  const peek = (): Token => tokens[at]!
  const take = (): Token => tokens[at++]!
  const isOp = (t: Token, op: string): boolean => t.kind === "op" && t.op === op
  const expect = (op: string): void => {
    const t = take()
    if (!isOp(t, op)) throw new ExpressionError(`Expected '${op}'`, t.at, source)
  }
  const expr = (): number => {
    let v = term()
    for (;;) {
      const t = peek()
      if (isOp(t, "+")) { take(); v += term() } else if (isOp(t, "-")) { take(); v -= term() } else return v
    }
  }
  const term = (): number => {
    let v = unary()
    for (;;) {
      const t = peek()
      if (isOp(t, "*")) { take(); v *= unary() }
      else if (isOp(t, "/")) {
        take()
        const d = unary()
        if (d === 0) throw new ExpressionError("Division by zero", t.at, source)
        v /= d
      } else if (isOp(t, "%")) { take(); v %= unary() } else return v
    }
  }
  const unary = (): number => {
    const t = peek()
    if (isOp(t, "-")) { take(); return -unary() }
    if (isOp(t, "+")) { take(); return unary() }
    return power()
  }
  const power = (): number => {
    const base = atom()
    if (isOp(peek(), "^")) { take(); return Math.pow(base, unary()) }
    return base
  }
  const atom = (): number => {
    const t = take()
    if (t.kind === "num") return t.value
    if (isOp(t, "(")) { const v = expr(); expect(")"); return v }
    if (t.kind === "name") {
      if (isOp(peek(), "(")) {
        take()
        const fn = FUNCTIONS[t.name]
        if (fn === undefined) throw new ExpressionError(`Unknown function '${t.name}'`, t.at, source)
        const args: number[] = []
        if (!isOp(peek(), ")")) {
          args.push(expr())
          while (isOp(peek(), ",")) { take(); args.push(expr()) }
        }
        expect(")")
        if (fn.arity !== "variadic" && args.length !== fn.arity) throw new ExpressionError(`'${t.name}' takes ${fn.arity} argument(s), got ${args.length}`, t.at, source)
        if (fn.arity === "variadic" && args.length === 0) throw new ExpressionError(`'${t.name}' needs at least one argument`, t.at, source)
        return fn.run(args)
      }
      const known = scope(t.name)
      if (known !== undefined) return known
      const constant = CONSTANTS[t.name]
      if (constant !== undefined) return constant
      throw new ExpressionError(`Unknown name '${t.name}'`, t.at, source)
    }
    throw new ExpressionError(t.kind === "end" ? "Unexpected end of expression" : `Unexpected '${t.kind === "op" ? t.op : ""}'`, t.at, source)
  }
  const value = expr()
  const rest = peek()
  if (rest.kind !== "end") throw new ExpressionError("Unexpected input after the expression", rest.at, source)
  if (!Number.isFinite(value)) throw new ExpressionError("The result is not a finite number", 0, source)
  return value
}

/** The names an expression refers to (not constants, not function names). */
export const namesIn = (source: string): ReadonlyArray<string> => {
  const tokens = tokenise(source)
  const names = new Set<string>()
  tokens.forEach((t, i) => {
    if (t.kind !== "name") return
    const next = tokens[i + 1]
    if (next?.kind === "op" && next.op === "(") return
    if (!(t.name in CONSTANTS)) names.add(t.name)
  })
  return [...names]
}

export type ParameterTable = Readonly<Record<string, number | string>>

export interface ResolvedParameters {
  readonly values: Readonly<Record<string, number>>
  /** Parameters that could not be evaluated, with the reason (the others are still resolved). */
  readonly errors: Readonly<Record<string, string>>
}

/**
 * Resolves a table of parameters in dependency order. A parameter that depends on a failed or cyclic one fails too, with the
 * name of the culprit; the rest still resolve.
 */
export const resolveParameters = (table: ParameterTable): ResolvedParameters => {
  const values: Record<string, number> = {}
  const errors: Record<string, string> = {}
  const state = new Map<string, "visiting" | "done">()
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
        for (const dep of namesIn(def)) {
          if (!(dep in table)) throw new ExpressionError(`Unknown name '${dep}'`, 0, def)
          visit(dep, [...trail, name])
          if (errors[dep] !== undefined) throw new Error(`depends on '${dep}', which failed: ${errors[dep]}`)
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

/** Evaluates a dimension against resolved parameter values. */
export const dimensionValue = (dimension: Dimension, values: Readonly<Record<string, number>>): number =>
  typeof dimension === "number" ? dimension : evaluate(dimension, (n) => values[n])
