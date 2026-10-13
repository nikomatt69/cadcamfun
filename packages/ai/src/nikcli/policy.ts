/**
 * Resource policy, in nikcli's own shape (`policy/policy.ts`): an ordered list of `{ effect, action, resource }`
 * statements where every matching statement applies in order and the last match wins. With no statement
 * everything is allowed.
 *
 * The embedded host already enforces `provider.use` from `experimental.policies` (the pinned bundle carries it), so
 * the list is passed to the host verbatim. What the host cannot know are the two decisions this package makes on its
 * own, and both go through the same list so there is one place that says what is allowed:
 *
 * - `provider.use` for the direct route (`resolveModel` / `DirectModel`), which never reaches the host;
 * - `tool.use` for the CAD/CAM tools registered here, resolved into the host's deny-by-default permission map.
 *
 * Matching is nikcli's: `*` matches everything, a trailing `*` is a prefix match, anything else is exact. So
 * `{ effect: "deny", action: "tool.use", resource: "cam_*" }` takes every CAM tool away from the agent.
 */
import { Effect, Schema } from "effect"
import { readFile } from "node:fs/promises"
import { AiConfigError } from "../errors.ts"

export type PolicyEffect = "allow" | "deny"

export interface PolicyStatement {
  readonly effect: PolicyEffect
  readonly action: string
  readonly resource: string
}

export interface PolicyInput {
  readonly action: string
  readonly resource: string
}

const PolicyStatementSchema = Schema.Struct({
  effect: Schema.Literals(["allow", "deny"]),
  action: Schema.String.check(Schema.isMinLength(1)),
  resource: Schema.String.check(Schema.isMinLength(1))
})

const PolicyFileSchema = Schema.Array(PolicyStatementSchema)

const matches = (pattern: string, value: string): boolean => {
  if (pattern === "*") return true
  if (!pattern.endsWith("*")) return pattern === value
  return value.startsWith(pattern.slice(0, -1))
}

/** Last matching statement wins; no match allows. */
export const policyAllows = (statements: ReadonlyArray<PolicyStatement>, input: PolicyInput): boolean => {
  let allowed = true
  for (const statement of statements) {
    if (!matches(statement.action, input.action)) continue
    if (!matches(statement.resource, input.resource)) continue
    allowed = statement.effect === "allow"
  }
  return allowed
}

export const providerAllowed = (statements: ReadonlyArray<PolicyStatement>, providerId: string): boolean =>
  policyAllows(statements, { action: "provider.use", resource: providerId })

export const toolAllowed = (statements: ReadonlyArray<PolicyStatement>, toolId: string): boolean =>
  policyAllows(statements, { action: "tool.use", resource: toolId })

/** Keeps the entries whose key the policy lets through (nikcli `Policy.filter`, for providers). */
export const filterProviders = <T>(statements: ReadonlyArray<PolicyStatement>, providers: Readonly<Record<string, T>>): Record<string, T> =>
  Object.fromEntries(Object.entries(providers).filter(([id]) => providerAllowed(statements, id)))

/** The tool ids the policy leaves available. */
export const permittedTools = (statements: ReadonlyArray<PolicyStatement>, toolIds: ReadonlyArray<string>): ReadonlyArray<string> =>
  statements.length === 0 ? toolIds : toolIds.filter((id) => toolAllowed(statements, id))

/**
 * Decodes a policy file: a JSON array of statements. A missing file means "no policy"; a present file that does not
 * decode is a configuration error, never silently ignored, because the failure mode of ignoring it is allowing what
 * the operator meant to forbid.
 */
export const readPolicyFile = (path: string): Effect.Effect<ReadonlyArray<PolicyStatement>, AiConfigError> =>
  Effect.gen(function* () {
    const raw = yield* Effect.tryPromise({
      try: () => readFile(path, "utf8"),
      catch: (cause) => cause
    }).pipe(
      Effect.catch((cause) =>
        (cause as { code?: string } | null)?.code === "ENOENT"
          ? Effect.succeed(undefined)
          : Effect.fail(new AiConfigError({ message: `Could not read the AI policy file ${path}: ${cause instanceof Error ? cause.message : String(cause)}` }))
      )
    )
    if (raw === undefined) return []
    const json = yield* Effect.try({
      try: () => JSON.parse(raw) as unknown,
      catch: (cause) => new AiConfigError({ message: `The AI policy file ${path} is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}` })
    })
    return yield* Schema.decodeUnknownEffect(PolicyFileSchema)(json).pipe(
      Effect.mapError((cause) => new AiConfigError({ message: `The AI policy file ${path} does not match [{ effect, action, resource }]: ${cause.message}` }))
    )
  })
