/**
 * Variables, macros and control flow in the IR (spec 69 G4). A toolpath is still a flat list of moves; these are moves that
 * move nothing, like `Comment`:
 *
 *   Assign      `variable = value`                       Fanuc `#100=[#101+5]`, Siemens `R100=R101+5`, Klartext `FN 1: Q100 = +Q101 + +5`
 *   MacroCall   a macro / user cycle with arguments      Fanuc `G65 P9010 A5 B2`, Siemens `MYCYCLE(5,2)`, Klartext `CALL PGM`, LinuxCNC `o<name> call [5] [2]`
 *   If / Else / EndIf, While / EndWhile                  the control's own structure, or labels and jumps where it has none
 *   Message     text for the operator                    `MSG`, `(MSG, ..)`, `#3000=1 (text)`, Klartext `FN 14`
 *
 * A move may carry `expr` for the words whose value is computed by the control (`X[#100+5]`); `to` stays the nominal position the
 * viewer, the verifier and the stock replay use. Numbers in `Expr` are millimetres and degrees like the rest of the IR.
 */
import { Schema } from "effect"

export type VarScope = "local" | "global" | "system"
export type VarRef = { readonly scope: VarScope; readonly index: number } | { readonly name: string }

export const BIN_OPS = ["+", "-", "*", "/", "mod", "and", "or", "xor"] as const
export type BinOp = typeof BIN_OPS[number]
export const FUNCTIONS = ["sin", "cos", "tan", "atan", "asin", "acos", "sqrt", "abs", "round", "fix", "fup", "ln", "exp", "neg", "atan2", "hypot"] as const
export type FunctionName = typeof FUNCTIONS[number]
export const COMPARISONS = ["eq", "ne", "lt", "le", "gt", "ge"] as const
export type Comparison = typeof COMPARISONS[number]

export type Expr =
  | number
  | { readonly var: VarRef }
  | { readonly op: BinOp; readonly a: Expr; readonly b: Expr }
  | { readonly fn: FunctionName; readonly a: Expr; readonly b?: Expr }

export interface Condition { readonly cmp: Comparison; readonly a: Expr; readonly b: Expr }

export const VarRefSchema: Schema.Codec<VarRef> = Schema.Union([
  Schema.Struct({ scope: Schema.Literals(["local", "global", "system"]), index: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) }),
  Schema.Struct({ name: Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/^[A-Za-z_][A-Za-z0-9_]*$/)) })
])

const isVarRef = (v: unknown): v is VarRef => {
  if (typeof v !== "object" || v === null) return false
  const r = v as Record<string, unknown>
  if (typeof r["name"] === "string") return /^[A-Za-z_][A-Za-z0-9_]*$/.test(r["name"]) && Object.keys(r).length === 1
  return (r["scope"] === "local" || r["scope"] === "global" || r["scope"] === "system") && Number.isInteger(r["index"]) && (r["index"] as number) >= 0 && Object.keys(r).length === 2
}

/** The shape of an expression, checked by hand: a recursive schema would send the API client generator into a loop. */
export const exprProblem = (v: unknown, depth = 0): string | undefined => {
  if (depth > 64) return "an expression nests deeper than 64 levels"
  if (typeof v === "number") return Number.isFinite(v) ? undefined : "a number in an expression must be finite"
  if (typeof v !== "object" || v === null || Array.isArray(v)) return "an expression is a number, a variable, an operation or a function"
  const r = v as Record<string, unknown>
  if ("var" in r) return isVarRef(r["var"]) ? undefined : "a variable is {scope, index} or {name}"
  if ("op" in r) {
    if (!(BIN_OPS as ReadonlyArray<unknown>).includes(r["op"])) return `unknown operator '${String(r["op"])}'`
    return exprProblem(r["a"], depth + 1) ?? exprProblem(r["b"], depth + 1)
  }
  if ("fn" in r) {
    if (!(FUNCTIONS as ReadonlyArray<unknown>).includes(r["fn"])) return `unknown function '${String(r["fn"])}'`
    return exprProblem(r["a"], depth + 1) ?? (r["b"] === undefined ? undefined : exprProblem(r["b"], depth + 1))
  }
  return "an expression is a number, a variable, an operation or a function"
}

/**
 * On the wire an expression is JSON: the client generators cannot take a recursive schema or a custom check. The posts check the
 * shape with `exprProblem` before they write it, and name what is wrong.
 */
export const ExprSchema: Schema.Codec<Expr> = Schema.Json as unknown as Schema.Codec<Expr>

export const ConditionSchema: Schema.Codec<Condition> = Schema.Struct({ cmp: Schema.Literals(COMPARISONS), a: ExprSchema, b: ExprSchema })

/** The words of a move whose value the control computes. */
export const WordExprSchema = Schema.Struct({
  x: Schema.optionalKey(ExprSchema), y: Schema.optionalKey(ExprSchema), z: Schema.optionalKey(ExprSchema), feed: Schema.optionalKey(ExprSchema)
})
export type WordExpr = typeof WordExprSchema.Type

export const AssignSchema = Schema.TaggedStruct("Assign", { variable: VarRefSchema, value: ExprSchema })
/** `name` is the macro's program number or name; `args` are its argument letters (`A`, `B`, ...) with their values. */
export const MacroCallSchema = Schema.TaggedStruct("MacroCall", {
  name: Schema.String.check(Schema.isMinLength(1)),
  args: Schema.Record(Schema.String.check(Schema.isPattern(/^[A-Za-z]$/)), ExprSchema)
})
export const IfSchema = Schema.TaggedStruct("If", { condition: ConditionSchema })
export const ElseSchema = Schema.TaggedStruct("Else", {})
export const EndIfSchema = Schema.TaggedStruct("EndIf", {})
export const WhileSchema = Schema.TaggedStruct("While", { condition: ConditionSchema })
export const EndWhileSchema = Schema.TaggedStruct("EndWhile", {})
/** A jump target: Fanuc `N100`, Siemens `LOOP:`, Klartext `LBL 5`, LinuxCNC `o100 sub`-less label is not used (structured flow instead). */
export const LabelSchema = Schema.TaggedStruct("Label", { name: Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/^[A-Za-z0-9_]+$/)) })
/**
 * A jump to a label, taken when `condition` holds (always without one): Fanuc `GOTO 100` / `IF [..] GOTO 100`, Siemens `GOTOF` /
 * `GOTOB` (forward / backward; `auto` lets the post decide from the label's place), Klartext `FN 9 .. GOTO LBL 5`, Okuma `IF [..] N100`.
 */
export const GotoSchema = Schema.TaggedStruct("Goto", {
  label: Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/^[A-Za-z0-9_]+$/)),
  direction: Schema.optionalKey(Schema.Literals(["auto", "forward", "backward"])),
  condition: Schema.optionalKey(ConditionSchema)
})

export const MessageSchema = Schema.TaggedStruct("Message", { text: Schema.String })

export type AssignMove = typeof AssignSchema.Type
export type MacroCallMove = typeof MacroCallSchema.Type
export type IfMove = typeof IfSchema.Type
export type WhileMove = typeof WhileSchema.Type
export type MessageMove = typeof MessageSchema.Type
export type LabelMove = typeof LabelSchema.Type
export type GotoMove = typeof GotoSchema.Type

// ---------------------------------------------------------------- builders

export const num = (value: number): Expr => value
export const global = (index: number): Expr => ({ var: { scope: "global", index } })
export const local = (index: number): Expr => ({ var: { scope: "local", index } })
export const named = (name: string): Expr => ({ var: { name } })
export const binary = (op: BinOp, a: Expr, b: Expr): Expr => ({ op, a, b })
export const call = (fn: FunctionName, a: Expr, b?: Expr): Expr => (b === undefined ? { fn, a } : { fn, a, b })
export const when = (cmp: Comparison, a: Expr, b: Expr): Condition => ({ cmp, a, b })

export const NEGATED: Readonly<Record<Comparison, Comparison>> = { eq: "ne", ne: "eq", lt: "ge", ge: "lt", gt: "le", le: "gt" }

// ---------------------------------------------------------------- evaluation

export const varKey = (v: VarRef): string => ("name" in v ? `n:${v.name}` : `${v.scope}:${v.index}`)

/** The value of an expression with `lookup` for the variables; an unset variable reads 0 like a control's cleared common variable. */
export const evalExpr = (e: Expr, lookup: (v: VarRef) => number): number => {
  if (typeof e === "number") return e
  if ("var" in e) return lookup(e.var)
  if ("op" in e) {
    const a = evalExpr(e.a, lookup), b = evalExpr(e.b, lookup)
    switch (e.op) {
      case "+": return a + b
      case "-": return a - b
      case "*": return a * b
      case "/": return b === 0 ? NaN : a / b
      case "mod": return b === 0 ? NaN : a - b * Math.trunc(a / b)
      case "and": return a !== 0 && b !== 0 ? 1 : 0
      case "or": return a !== 0 || b !== 0 ? 1 : 0
      case "xor": return (a !== 0) !== (b !== 0) ? 1 : 0
    }
  }
  const a = evalExpr(e.a, lookup)
  const D = Math.PI / 180
  switch (e.fn) {
    case "sin": return Math.sin(a * D)
    case "cos": return Math.cos(a * D)
    case "tan": return Math.tan(a * D)
    case "atan": return Math.atan(a) / D
    case "asin": return Math.asin(a) / D
    case "acos": return Math.acos(a) / D
    case "sqrt": return a < 0 ? NaN : Math.sqrt(a)
    case "abs": return Math.abs(a)
    case "round": return Math.round(a)
    case "fix": return Math.floor(a)
    case "fup": return Math.ceil(a)
    case "ln": return a <= 0 ? NaN : Math.log(a)
    case "exp": return Math.exp(a)
    case "neg": return -a
    case "atan2": return Math.atan2(a, e.b === undefined ? 1 : evalExpr(e.b, lookup)) / D
    case "hypot": return Math.hypot(a, e.b === undefined ? 0 : evalExpr(e.b, lookup))
  }
}

export const evalCondition = (c: Condition, lookup: (v: VarRef) => number): boolean => {
  const a = evalExpr(c.a, lookup), b = evalExpr(c.b, lookup)
  const eps = 1e-9
  switch (c.cmp) {
    case "eq": return Math.abs(a - b) <= eps
    case "ne": return Math.abs(a - b) > eps
    case "lt": return a < b - eps
    case "le": return a <= b + eps
    case "gt": return a > b + eps
    case "ge": return a >= b - eps
  }
}
