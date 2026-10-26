/**
 * Numeric text fields of the resource forms. The phone keyboard types decimal commas ("7,85"); a value that is
 * not a number must be refused with a reason, never silently replaced by a default that then gets saved.
 */

export type NumberCheck =
  | { readonly ok: true; readonly value: number | null }
  | { readonly ok: false; readonly error: string }

export interface NumberRules {
  /** An empty field is allowed and reads as `null`. */
  readonly optional?: boolean
  readonly integer?: boolean
  /** Values must be greater than zero instead of zero or more. */
  readonly positive?: boolean
}

export const checkNumber = (text: string, label: string, rules: NumberRules = {}): NumberCheck => {
  const trimmed = text.trim()
  if (trimmed === "") return rules.optional ? { ok: true, value: null } : { ok: false, error: `Enter ${label.toLowerCase()}.` }
  const normalized = trimmed.replace(",", ".")
  if (!/^\d+(?:\.\d*)?$|^\.\d+$/.test(normalized)) return { ok: false, error: `${label} must be a number, such as 7.85.` }
  const value = Number(normalized)
  if (!Number.isFinite(value)) return { ok: false, error: `${label} must be a finite number.` }
  if (rules.integer && !Number.isInteger(value)) return { ok: false, error: `${label} must be a whole number.` }
  if (rules.positive && value <= 0) return { ok: false, error: `${label} must be greater than zero.` }
  return { ok: true, value }
}

/** The error to show under a field, or `undefined` when it is fine (or still untouched and empty). */
export const numberError = (text: string, label: string, rules: NumberRules = {}): string | undefined => {
  const check = checkNumber(text, label, rules)
  return check.ok ? undefined : check.error
}
