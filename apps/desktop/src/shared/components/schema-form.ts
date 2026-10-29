/**
 * Schema-driven form fields (spec 06-desktop-ui.md §1).
 *
 * The CAM parameter forms must never drift from the WP2 `Schema.Class`
 * definitions, so the form is *derived* from the Schema instead of hand-written:
 * this module turns any Effect Schema into a flat field description the Solid
 * component renders, and turns the submitted values back into typed parameters.
 *
 * It is pure and DOM-free, which is what makes it unit-testable with `bun:test`.
 */
import { Exit, Schema } from "effect"
import { t } from "../../i18n/index.ts"

export type FieldKind = "number" | "integer" | "boolean" | "string" | "enum" | "unknown"

export interface FieldDescription {
  readonly key: string
  readonly label: string
  readonly kind: FieldKind
  readonly required: boolean
  readonly description: string | undefined
  /** Allowed values for `enum` fields. */
  readonly options: ReadonlyArray<string>
  /** Bounds for numeric fields, when the Schema declares them. */
  readonly minimum: number | undefined
  readonly maximum: number | undefined
  /** `Schema.isGreaterThan(n)` is an exclusive bound: `n` itself is rejected. */
  readonly exclusiveMinimum: boolean
  readonly exclusiveMaximum: boolean
}

export interface FormDescription {
  readonly fields: ReadonlyArray<FieldDescription>
}

/**
 * Effect v4 AST readers. Everything below is deliberately defensive: the form must
 * degrade to `unknown` rather than crash when a Schema uses a construct this
 * version does not expose the same way.
 */
interface CheckAnnotation {
  readonly representation?: { readonly id?: string; readonly payload?: unknown }
  readonly arbitrary?: { readonly constraint?: { readonly ordered?: { readonly minimum?: number; readonly maximum?: number; readonly exclusiveMinimum?: boolean; readonly exclusiveMaximum?: boolean } } }
}

interface Ast {
  readonly _tag?: string
  readonly literal?: unknown
  readonly types?: ReadonlyArray<Ast>
  readonly checks?: ReadonlyArray<{ readonly annotations?: CheckAnnotation }>
  readonly context?: { readonly isOptional?: boolean; readonly constructorDefault?: unknown }
  readonly annotations?: { readonly description?: string }
}

const astOf = (schema: unknown): Ast => ((schema as { readonly ast?: Ast } | undefined)?.ast ?? {})

/** Literals of an AST node: `Literal`, or a `Union` whose members are literals. */
const literalsOfAst = (ast: Ast): ReadonlyArray<string> => {
  if (ast._tag === "Literal") return ast.literal === undefined ? [] : [String(ast.literal)]
  if (ast._tag === "Union") return (ast.types ?? []).flatMap(literalsOfAst)
  return []
}

const literalsOf = (schema: unknown): ReadonlyArray<string> => literalsOfAst(astOf(schema))

const isBoolean = (schema: unknown): boolean => astOf(schema)._tag === "Boolean"

const isStringKeyword = (schema: unknown): boolean => astOf(schema)._tag === "String"

/**
 * Bounds from every filter, not just `isBetween`: a parameter declared
 * `Schema.isGreaterThan(0)` (which is how `totalDepth` and `stepdown` are
 * validated) must be caught by the form before the user submits it.
 */
const boundsIn = (
  ast: Ast
): {
  minimum?: number
  maximum?: number
  exclusiveMinimum: boolean
  exclusiveMaximum: boolean
} => {
  let minimum: number | undefined
  let maximum: number | undefined
  let exclusiveMinimum = false
  let exclusiveMaximum = false
  for (const check of ast.checks ?? []) {
    const ordered = check.annotations?.arbitrary?.constraint?.ordered
    if (ordered?.minimum !== undefined) {
      minimum = ordered.minimum
      exclusiveMinimum = ordered.exclusiveMinimum === true
    }
    if (ordered?.maximum !== undefined) {
      maximum = ordered.maximum
      exclusiveMaximum = ordered.exclusiveMaximum === true
    }
  }
  return {
    ...(minimum !== undefined ? { minimum } : {}),
    ...(maximum !== undefined ? { maximum } : {}),
    exclusiveMinimum,
    exclusiveMaximum
  }
}

/** A field is optional when it may be omitted *and* has no constructor default. */
const isOptional = (schema: unknown): boolean => {
  const context = astOf(schema).context
  return (context?.isOptional ?? false) && context?.constructorDefault === undefined
}

const humanise = (key: string): string => {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ")
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * `Schema.optional(X)` is a `Union` of `X` and `Undefined`; the form wants to
 * describe `X`, with `required: false`.
 */
const unwrapOptional = (ast: Ast): Ast => {
  if (ast._tag !== "Union") return ast
  const members = ast.types ?? []
  if (!members.some((member) => member._tag === "Undefined")) return ast
  const value = members.find((member) => member._tag !== "Undefined")
  return value ?? ast
}

const kindOfAst = (ast: Ast, options: ReadonlyArray<string>): FieldKind =>
  ast._tag === "Boolean"
    ? "boolean"
    : options.length > 0
    ? "enum"
    : ast._tag === "String"
    ? "string"
    : ast._tag === "Number"
    ? "number"
    : ast._tag === "Int"
    ? "integer"
    : "unknown"

const describeOne = (key: string, schema: unknown): FieldDescription => {
  const outer = astOf(schema)
  const ast = unwrapOptional(outer)
  const options = literalsOfAst(ast)
  const { minimum, maximum, exclusiveMinimum, exclusiveMaximum } = boundsIn(ast)
  return {
    key,
    label: humanise(key),
    kind: kindOfAst(ast, options),
    // A field with a constructor default never has to be filled in by the user.
    required: !isOptional(schema) && outer.context?.constructorDefault === undefined,
    description: outer.annotations?.description,
    options,
    minimum,
    maximum,
    exclusiveMinimum,
    exclusiveMaximum
  }
}

/**
 * Describes a flat Schema. Nested structs are reported as `unknown` rather than
 * silently ignored: a form that drops half the parameters is worse than one that
 * says it cannot render them.
 */
export const describeSchema = (schema: unknown): FormDescription => {
  const fields = (schema as { fields?: Record<string, unknown> } | undefined)?.fields
  if (fields === undefined) return { fields: [] }
  return {
    fields: Object.entries(fields)
      .map(([key, value]) => describeOne(key, value))
      .sort((a, b) => a.key.localeCompare(b.key))
  }
}

export interface ValidationIssue {
  readonly key: string
  readonly message: string
}

/** Validates a raw form value map against the description, before decoding. */
export const validateForm = (
  description: FormDescription,
  values: Readonly<Record<string, unknown>>
): ReadonlyArray<ValidationIssue> => {
  const issues: Array<ValidationIssue> = []
  for (const field of description.fields) {
    const value = values[field.key]
    if (value === undefined || value === null || value === "") {
      if (field.required) issues.push({ key: field.key, message: `${field.label} is required` })
      continue
    }
    if (field.kind === "number" || field.kind === "integer") {
      const n = typeof value === "number" ? value : Number(value)
      if (!Number.isFinite(n)) {
        issues.push({ key: field.key, message: `${field.label} must be a number` })
        continue
      }
      if (field.kind === "integer" && !Number.isInteger(n)) {
        issues.push({ key: field.key, message: `${field.label} must be a whole number` })
      }
      if (field.minimum !== undefined) {
        const tooSmall = field.exclusiveMinimum ? n <= field.minimum : n < field.minimum
        if (tooSmall) {
          issues.push({
            key: field.key,
            message: `${field.label} must be ${field.exclusiveMinimum ? "greater than" : "at least"} ${field.minimum}`
          })
        }
      }
      if (field.maximum !== undefined) {
        const tooBig = field.exclusiveMaximum ? n >= field.maximum : n > field.maximum
        if (tooBig) {
          issues.push({
            key: field.key,
            message: `${field.label} must be ${field.exclusiveMaximum ? "less than" : "at most"} ${field.maximum}`
          })
        }
      }
      continue
    }
    if (field.kind === "enum" && !field.options.includes(String(value))) {
      issues.push({ key: field.key, message: `${field.label} must be one of ${field.options.join(", ")}` })
    }
  }
  return issues
}

/**
 * Turns a form value map into typed parameters by running the Schema.
 *
 * Both failure modes come back as issues: the cheap `validateForm` pass (missing
 * required fields, out-of-range numbers) and the Schema itself. The decode runs
 * through `decodeUnknownExit`, never `decodeUnknownSync`, because a form must not
 * be able to crash the editor with a thrown Schema error.
 */
export const decodeForm = <S extends Schema.Constraint>(
  schema: S,
  values: Readonly<Record<string, unknown>>
): { _tag: "Valid"; value: S["Type"] } | { _tag: "Invalid"; issues: ReadonlyArray<ValidationIssue> } => {
  const description = describeSchema(schema)
  const issues = [...validateForm(description, values)]
  if (issues.length > 0) return { _tag: "Invalid", issues }
  const normalised = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== "").map(([key, value]) => {
    const field = description.fields.find((item) => item.key === key)
    return [key, field?.kind === "number" || field?.kind === "integer" ? Number(value) : value]
  }))
  const exit = Schema.decodeUnknownExit(schema as unknown as Schema.Codec<S["Type"]>)(normalised)
  if (Exit.isSuccess(exit)) return { _tag: "Valid", value: exit.value }
  // A cross-field filter (or anything the field pass cannot express) fails here;
  // the form shows one generic issue instead of crashing.
  return { _tag: "Invalid", issues: [{ key: "", message: t("schema.invalid") }] }
}

/**
 * Form values seeded from an already-constructed parameter object, so the form
 * starts with exactly the defaults the Schema declares.
 *
 * The caller must supply a valid instance: this reads, it never constructs, so it
 * cannot throw on a partially filled form.
 */
export const defaultsOf = (instance: object, schema: unknown): Record<string, unknown> => {
  const values = instance as Record<string, unknown>
  return Object.fromEntries(
    describeSchema(schema).fields.map((field) => [field.key, values[field.key]])
  )
}
