import { evaluate, namesIn, type ExpressionError } from "@cadcamfun/core"
import { formatNumber, normaliseNumberText } from "./numberText.ts"

/**
 * Typed dimensions of a parametric history. Unlike `numberText.ts` (a field that holds a number), a dimension of a history may stay
 * an expression over the parameters (`width / 2 + 3`): it is stored as written, so a later change of `width` moves it. Decimal
 * commas, `°`, units and expressions are read exactly as the number fields read them; a text without parameter names is stored as
 * the number it evaluates to.
 */

export interface DimensionContext {
  /** Resolved parameter values (the scope an expression is checked against). */
  readonly values: Readonly<Record<string, number>>
  /** Parameters that failed (a name that refers to one of them says so). */
  readonly failed?: Readonly<Record<string, string>> | undefined
  /** The field is in degrees: `°` / `deg` is a plain suffix, not a conversion to radians. */
  readonly degrees?: boolean | undefined
  /** An empty text is allowed and means "no value". */
  readonly optional?: boolean | undefined
}

export type DimensionParse =
  | { readonly ok: true; readonly stored: number | string | undefined; readonly preview: number | undefined }
  | { readonly ok: false; readonly error: string }

const messageOf = (error: unknown, source: string, failed: DimensionContext["failed"]): string => {
  if (error instanceof Error && failed !== undefined) {
    try {
      const culprit = namesIn(source).find((n) => failed[n] !== undefined)
      if (culprit !== undefined) return `Parameter '${culprit}' failed: ${failed[culprit]}`
    } catch { /* fall through to the evaluator's own text */ }
  }
  const e = error as ExpressionError
  return typeof e?.message === "string" ? e.message.replace(/ \(at \d+ in ".*"\)$/, "") : String(error)
}

/** Reads what was typed into a dimension: a number, an expression that evaluates against the parameters, or an error to show. */
export const parseDimensionText = (text: string, context: DimensionContext): DimensionParse => {
  const source = normaliseNumberText(text, context.degrees ?? false)
  if (source === "") return context.optional === true ? { ok: true, stored: undefined, preview: undefined } : { ok: false, error: "Enter a value" }
  let names: ReadonlyArray<string>
  try { names = namesIn(source) } catch (error) { return { ok: false, error: messageOf(error, source, context.failed) } }
  let value: number
  try {
    value = evaluate(source, (n) => context.values[n])
  } catch (error) {
    return { ok: false, error: messageOf(error, source, context.failed) }
  }
  value = Number(value.toPrecision(12))
  // A formula is kept as written (spaces tidied) so the parameters keep driving it; anything else is the number it comes to.
  return { ok: true, stored: names.length > 0 ? source : value, preview: value }
}

/** How a stored dimension is shown in its field: a number without float noise, a formula as written. */
export const dimensionText = (value: number | string | undefined): string => (value === undefined ? "" : formatNumber(value))
