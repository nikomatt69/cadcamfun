import { Exit, Schema, SchemaIssue } from "effect"
import type { z } from "zod"

const standard = SchemaIssue.makeFormatterStandardSchemaV1()

/** `path: message` for each problem an Effect schema found, the way the host lists zod problems. */
export const schemaProblems = (error: Schema.SchemaError): ReadonlyArray<string> =>
  standard(error.issue).issues.map((issue) => `${(issue.path ?? []).map((key) => typeof key === "object" && key !== null && "key" in key ? String(key.key) : String(key)).join(".") || "root"}: ${issue.message}`)

/** A decoder that never throws: the decoded value, or every problem with its path. */
export const schemaDecoder = <A>(schema: Schema.Codec<A, unknown>) => {
  const decode = Schema.decodeUnknownExit(schema)
  return (value: unknown): { readonly success: true; readonly data: A } | { readonly success: false; readonly problems: ReadonlyArray<string> } => {
    const exit = decode(value, { errors: "all" })
    if (Exit.isSuccess(exit)) return { success: true, data: exit.value }
    const error = exit.cause.reasons.find((reason) => reason._tag === "Fail")
    return { success: false, problems: error !== undefined && Schema.isSchemaError(error.error) ? schemaProblems(error.error) : [`root: ${String(exit.cause)}`] }
  }
}

/** One problem, wherever it came from: a path, a message, and what the check expected when it was a type. */
interface Problem {
  readonly path: ReadonlyArray<PropertyKey>
  readonly message: string
  readonly expected?: string
}

/** Keys that select the variant of a union: a mismatch there means "wrong variant", not "wrong field". */
const DISCRIMINATORS = new Set<PropertyKey>(["type", "kind", "action", "style", "curve"])

/**
 * The problems of one zod error, with each union flattened to the variant the value meant. Schemas derived from Effect
 * reach zod as plain unions (`anyOf`), whose own message is only "Invalid input": the variant whose discriminator
 * matched (else the one with the fewest problems) is the one the model has to fix.
 */
const zodProblems = (issues: ReadonlyArray<z.core.$ZodIssue>, prefix: ReadonlyArray<PropertyKey> = []): Array<Problem> =>
  issues.flatMap((issue): Array<Problem> => {
    const path = [...prefix, ...issue.path]
    if (issue.code === "invalid_union" && issue.errors.length > 0) {
      const wrongVariant = (branch: ReadonlyArray<z.core.$ZodIssue>) =>
        branch.some((i) => i.code === "invalid_value" && i.path.length === 1 && DISCRIMINATORS.has(i.path[0]!))
      const ranked = [...issue.errors].sort((a, b) => Number(wrongVariant(a)) - Number(wrongVariant(b)) || a.length - b.length)
      const best = ranked[0]!
      // Every variant was refused on its discriminator: the discriminator itself is wrong.
      if (wrongVariant(best)) {
        const allowed = issue.errors.flatMap((branch) => branch.flatMap((i) => i.code === "invalid_value" && i.path.length === 1 ? i.values.map(String) : []))
        const key = best.find((i) => i.code === "invalid_value" && i.path.length === 1)!.path[0]!
        return [{ path: [...path, key], message: `Invalid option: expected one of ${[...new Set(allowed)].map((v) => JSON.stringify(v)).join("|")}` }]
      }
      return zodProblems(best, path)
    }
    return [{ path, message: issue.message, ...(issue.code === "invalid_type" ? { expected: String(issue.expected) } : {}) }]
  })

/** The problems an Effect schema found; a wrong type reads "Expected object", "Expected array", ... */
const effectProblems = (problems: ReadonlyArray<string>): Array<Problem> =>
  problems.map((problem) => {
    const split = problem.indexOf(": ")
    const where = split < 0 ? "root" : problem.slice(0, split)
    const message = split < 0 ? problem : problem.slice(split + 2)
    const expected = /^Expected (?:an? )?(object|array|string|number|boolean)\b/.exec(message)?.[1]
    return { path: where === "root" ? [] : where.split("."), message, ...(expected !== undefined ? { expected } : {}) }
  })

const failureOf = (tool: string, problems: ReadonlyArray<Problem>) => {
  const listed = problems.slice(0, 12).map((problem) => `${problem.path.map(String).join(".") || "root"}: ${problem.message}`)
  const hints = new Set<string>()
  for (const problem of problems) {
    const path = problem.path.map(String)
    if (tool === "cad_edit" && path.includes("changes")) {
      hints.add('Use action:"modify", changes:[{"id":"existing-id","changes":{"color":"#808080"}}]. Each array item has id and a nested changes object; rotation is {"x":0,"y":0,"z":90} in degrees.')
    }
    if (tool === "cad_edit" && path.includes("actions")) {
      hints.add('Use action:"editor", actions:[{"action":"layer_color","layer":"existing-layer","color":"#808080"}]. Each entry is an object with its own action; color alone is not an editor action.')
    }
    if (path.at(-1) === "cases" && problem.expected === "array") {
      hints.add('Send cases as a JSON array of 1..12 objects, e.g. [{"name":"wider","parameters":{"width":80}}], never as a JSON-encoded string.')
    }
    // A history sent as text is parsed by the lenient layer; an empty or partial one then lacks its parameters or features.
    const historyPart = path.at(-1) === "history" || (path.at(-2) === "history" && (path.at(-1) === "parameters" || path.at(-1) === "features"))
    const missing = problem.expected !== undefined || /^Missing key/.test(problem.message)
    if (path.includes("history") && missing && (problem.expected === "object" || historyPart)) {
      hints.add('Send history as a JSON object {"parameters":{},"features":[...]}, never as a string containing JSON.')
    }
    if (path.includes("entities") && path.at(-1) === "kind") {
      hints.add('Sketch entities use kind: "point", "line", "circle" or "arc"; features and constraints use type. Lines reference point IDs through p1/p2; circles reference a point ID through center. See cad action parametric_validate for a complete validate example.')
    }
  }
  hints.add(`Correct the named fields and retry ${tool}; do not repeat unchanged arguments or switch tools to bypass validation.`)
  return {
    ok: false as const, _tag: "InvalidToolArguments" as const, error: `Invalid arguments for ${tool}.`,
    problems: listed, omittedProblems: Math.max(0, problems.length - listed.length),
    recovery: [...hints].join(" "), mutationApplied: false as const
  }
}

type ToolValidationFailure = ReturnType<typeof failureOf>

const formatFailure = (failure: ToolValidationFailure): string =>
  `${failure.error}\n${failure.problems.map((problem) => `- ${problem}`).join("\n")}\n${failure.omittedProblems > 0 ? `${failure.omittedProblems} additional validation problems omitted.\n` : ""}${failure.recovery}\nNo mutation was applied by this call.`

/** Shared by the host's pre-execution guard and the direct tool bridge. */
export const toolValidationFailure = (tool: string, error: z.ZodError): ToolValidationFailure => failureOf(tool, zodProblems(error.issues))

export const formatToolValidationError = (tool: string, error: z.ZodError): string => formatFailure(toolValidationFailure(tool, error))

/** The same report for the problems an Effect decode found (`schemaDecoder`). */
export const formatToolProblems = (tool: string, problems: ReadonlyArray<string>): string => formatFailure(failureOf(tool, effectProblems(problems)))
