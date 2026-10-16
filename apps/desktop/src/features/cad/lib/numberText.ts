import { evaluate } from "@cadcamfun/core"

/**
 * Typed dimensions in the property panel. A dimension is text until it is committed: the person may write a decimal comma
 * (`12,5`) or point (`12.5`), any number of decimals, or a small expression (`40/2 + 2,5`, `2in`, `sqrt(2)*10`) evaluated by the
 * kernel's parameter grammar. Function arguments are separated by `;` or by a comma followed by a space (`max(1,5; 2)`,
 * `max(1, 2)`), since a comma between digits is a decimal comma.
 */

export interface NumberRules {
  readonly min?: number | undefined
  readonly max?: number | undefined
  /** Whole numbers only (segments, sides, teeth...). */
  readonly integer?: boolean | undefined
  /** The field is in degrees: `°` and `deg` are a plain suffix, not a conversion to radians. */
  readonly degrees?: boolean | undefined
}

export type NumberParse = { readonly ok: true; readonly value: number } | { readonly ok: false; readonly error: string }

/** Rewrites what people type into the kernel's expression syntax. */
export const normaliseNumberText = (text: string, degrees = false): string => {
  let source = text.trim().replace(/−/g, "-")
  source = source.replace(/(\d),(?=\d)/g, "$1.").replace(/(^|[^\w).])[,](?=\d)/g, "$1.").replace(/;/g, ",")
  source = degrees ? source.replace(/\s*(?:°|deg\b)/g, "") : source.replace(/°/g, "deg")
  return source
}

/** Parses and checks a typed dimension; the error is the message the field shows. */
export const parseNumberText = (text: string, rules: NumberRules = {}): NumberParse => {
  const source = normaliseNumberText(text, rules.degrees ?? false)
  if (source === "") return { ok: false, error: "Enter a value" }
  let value: number
  try {
    value = evaluate(source)
  } catch {
    return { ok: false, error: `"${text.trim()}" is not a number` }
  }
  if (!Number.isFinite(value)) return { ok: false, error: "The result is not a finite number" }
  // Floating noise from the expression (0.1 + 0.2) is not a dimension anyone typed.
  value = Number(value.toPrecision(12))
  if (rules.integer === true && !Number.isInteger(value)) return { ok: false, error: "Must be a whole number" }
  if (rules.min !== undefined && value < rules.min) return { ok: false, error: `Minimum ${formatNumber(rules.min)}` }
  if (rules.max !== undefined && value > rules.max) return { ok: false, error: `Maximum ${formatNumber(rules.max)}` }
  return { ok: true, value }
}

/** How a stored dimension is shown: exact, without float noise or trailing zeros. */
export const formatNumber = (value: unknown): string => {
  if (typeof value === "string") return value
  if (typeof value !== "number" || !Number.isFinite(value)) return ""
  return String(Number(value.toPrecision(12)))
}

/** One arrow-key step from `value`, kept on the step's decimals and inside the limits. */
export const stepNumber = (value: number, step: number, direction: 1 | -1, rules: NumberRules = {}): number => {
  const decimals = Math.max((String(step).split(".")[1] ?? "").length, 0)
  let next = Number((value + direction * step).toFixed(Math.min(decimals + 6, 12)))
  if (rules.integer === true) next = Math.round(next)
  if (rules.min !== undefined) next = Math.max(rules.min, next)
  if (rules.max !== undefined) next = Math.min(rules.max, next)
  return Number(next.toPrecision(12))
}
