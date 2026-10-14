/**
 * The interface of the action catalogue: one action declares its identity, its effect, its validated input and its
 * execution, exactly once, for every face the product has (the embedded nikcli host today, the HttpApi bridge in
 * RM-11). `tools/*.ts` are adapters over these entries: they group actions into the tools the model sees and turn
 * them into host tool specs. Nothing else may declare a model-visible capability.
 *
 * The effect is declared, never inferred from a name: `read` actions cannot change anything, `write` actions change
 * domain data, `destructive` actions remove or replace it and are the only ones a tool needs native `ask` for.
 * Permissions are keyed by tool id, so a tool never mixes kinds (see `tools/action.ts`).
 */
import { Effect, Schema } from "effect"
import { z } from "zod"
import { ACTION_CONTRACTS, ActionDenied, ActionInvalidInput, ActionInterrupted, type ActionContract } from "@cadcamfun/api"
import type { ActionContribution, ToolContext } from "../tools/define.ts"
import { nikcliWireSchema } from "../tools/wire-schema.ts"
import { schemaProblems } from "../tool-validation.ts"
import { classifyOutcome, failure, outcomeWire, type ActionOutcome } from "./outcome.ts"

/** What an action does to domain data. Derived from the implementation, never from the tool's name. */
export type ActionKind = "read" | "write" | "destructive"

/** An unexpected failure inside an action's own code; the three shared failures above come from admission and validation. */
export class ActionFailed extends Schema.TaggedError<ActionFailed>()("ActionFailed", {
  actionId: Schema.String,
  message: Schema.String
}) {}

export type ActionFailure = ActionDenied | ActionInvalidInput | ActionInterrupted | ActionFailed

/** Every action's parameters are an object schema: the tool's `action` discriminator is added to it. */
export type ActionParameters = z.ZodObject<Record<string, z.ZodType>>

/** Everything an action may run: the sidecar's handlers plus the implementations it contributes. */
export type ActionContext = ToolContext

export type { ActionContribution } from "../tools/define.ts"

export interface ActionSpec<S extends ActionParameters = ActionParameters> {
  /** Stable `tool.action`, e.g. `cad_edit.add`. */
  readonly id: string
  readonly kind: ActionKind
  readonly parameters: S
  /** What the action touches and the result it must answer with (`ACTION_CONTRACTS` in `@cadcamfun/api`). */
  readonly contract: ActionContract
  /** The contract's effects and success result, read directly. */
  readonly effects: ActionContract["effects"]
  readonly result: ActionContract["result"]
  readonly run: (input: z.infer<S>, context: ActionContext) => Effect.Effect<unknown, ActionFailure>
  /** The per-verb tool id this action replaced; the parity test maps every retired id here. */
  readonly replaces?: string
  /** Set when the implementation is contributed by the application: the key it is contributed under. */
  readonly contributed?: string
}

const message = (cause: unknown): string =>
  cause instanceof Error ? cause.message : typeof cause === "string" ? cause : "Action failed."

export interface ActionConfig<S extends ActionParameters> {
  readonly id: string
  readonly kind: ActionKind
  readonly parameters: S
  readonly replaces?: string
  /**
   * The implementation. It returns a JSON-safe value (or a `ToolMediaResult`), a Promise of one, or an Effect that fails with
   * a typed `ActionFailure`. `ok: false` is a result, not a throw.
   */
  readonly run: (input: z.infer<S>, context: ActionContext) => Promise<unknown> | unknown
}

/**
 * Declares one action. The implementation's Promise is crossed exactly once, here, so every caller sees an Effect:
 * a foreign exception becomes a tagged failure instead of escaping into the host's tool bridge.
 */
/** An action outside the catalogue (an extension, a test probe) declares nothing: no effects known, no result checked. */
const UNDECLARED: ActionContract = { effects: [] }

/** The catalogue's contract of `id`; `harness-inventory.test.ts` asserts every catalogue action has one. */
const contractOf = (id: string): ActionContract => ACTION_CONTRACTS[id] ?? UNDECLARED

export const defineAction = <S extends ActionParameters>(config: ActionConfig<S>): ActionSpec<S> => ({
  id: config.id,
  kind: config.kind,
  parameters: config.parameters,
  contract: contractOf(config.id),
  effects: contractOf(config.id).effects,
  result: contractOf(config.id).result,
  ...(config.replaces !== undefined ? { replaces: config.replaces } : {}),
  run: Effect.fn(`actions.${config.id}`)(function*(input: z.infer<S>, context: ActionContext) {
    // Constructing an Effect must not start a Promise handler: cancellation and admission happen before execution.
    if (context.signal?.aborted) return yield* Effect.fail(new ActionInterrupted({ actionId: config.id, message: "Tool execution cancelled." }))
    const outcome = yield* Effect.try({
      try: () => config.run(input, context),
      catch: (cause) => new ActionFailed({ actionId: config.id, message: message(cause) })
    })
    if (Effect.isEffect(outcome)) return yield* outcome as Effect.Effect<unknown, ActionFailure>
    return yield* Effect.tryPromise({
      try: () => Promise.resolve(outcome),
      catch: (cause) => new ActionFailed({ actionId: config.id, message: message(cause) })
    })
  })
})

/**
 * The seam's decoder for an Effect-owned input. The host validates the derived schema first; this decode applies what the
 * JSON schema cannot say (trimming, defaults, a flag sent as text) and names each field it refuses, so the model can fix
 * the call instead of guessing.
 */
const wireDecoder = <A>(actionId: string, schema: Schema.Codec<A, unknown>) => {
  const decode = Schema.decodeUnknownEffect(schema)
  // Strict like the derived schema the host validates with: a misspelt optional field is refused, never silently dropped.
  return (input: unknown): Effect.Effect<A, ActionInvalidInput> => decode(input, { errors: "all", onExcessProperty: "error" }).pipe(
    Effect.mapError((error) => new ActionInvalidInput({
      actionId,
      message: `The arguments do not match the action's schema. ${schemaProblems(error).slice(0, 12).join("; ")}`
    }))
  )
}

/** Effect owns a wire action's input; nikcli only gets its derived, model-visible representation. */
export const defineWireAction = <A>(config: {
  readonly id: string
  readonly kind: ActionKind
  readonly parameters: Schema.Codec<A, unknown>
  readonly replaces?: string
  readonly run: (input: A, context: ActionContext) => Promise<unknown> | unknown
}): ActionSpec => {
  const decode = wireDecoder(config.id, config.parameters)
  return defineAction({
    ...config,
    parameters: nikcliWireSchema(config.parameters),
    run: (input, context) => decode(input).pipe(
      Effect.flatMap((decoded) => Effect.try({
        try: () => config.run(decoded, context),
        catch: (cause) => new ActionFailed({ actionId: config.id, message: message(cause) })
      })),
      Effect.flatMap((outcome) => Effect.isEffect(outcome)
        ? outcome as Effect.Effect<unknown, ActionFailure>
        : Effect.tryPromise({ try: () => Promise.resolve(outcome), catch: (cause) => new ActionFailed({ actionId: config.id, message: message(cause) }) }))
    )
  })
}

/** A typed failure as an outcome. A write that failed inside its own code may have committed part of its work. */
const failureOutcome = (action: ActionSpec, error: ActionFailure): ActionOutcome => {
  const result = actionFailureResult(error)
  switch (error._tag) {
    case "ActionInterrupted": return { kind: "cancelled", value: result, validated: true }
    case "ActionFailed": return action.kind === "read"
      ? { kind: "refused", value: result, validated: true }
      : { kind: "uncertain", value: failure(action.id, "ActionUncertain", `${error.message} The action failed while running and may have changed the document: inspect before retrying.`), validated: true }
    default: return { kind: "refused", value: result, validated: true }
  }
}

/**
 * The shared Promise seam for the host and direct catalogue callers: runs the action and classifies what it answered
 * (`outcome.ts`). Interruption has the same wire result on both; an abort that lands while a write runs is `uncertain`.
 */
export const executeActionOutcome = async (action: ActionSpec, input: unknown, context: ActionContext): Promise<ActionOutcome> => {
  let started = false
  try {
    return await Effect.runPromise(
      Effect.sync(() => { started = !context.signal?.aborted }).pipe(
        Effect.andThen(action.run(input as never, context)),
        Effect.map((raw) => classifyOutcome(action, raw)),
        Effect.catch((error: ActionFailure) => Effect.succeed(failureOutcome(action, error)))
      ),
      { signal: context.signal }
    )
  } catch (cause) {
    if (context.signal?.aborted) {
      return started && action.kind !== "read"
        ? { kind: "uncertain", value: failure(action.id, "ActionUncertain", "Tool execution was cancelled while the action ran; it may have changed the document: inspect before retrying."), validated: true }
        : failureOutcome(action, new ActionInterrupted({ actionId: action.id, message: "Tool execution cancelled." }))
    }
    throw cause
  }
}

/** The wire answer of `executeActionOutcome`: what the host adapter returns to the model. */
export const executeAction = async (action: ActionSpec, input: unknown, context: ActionContext): Promise<unknown> =>
  outcomeWire(await executeActionOutcome(action, input, context))

/**
 * An action whose implementation the application contributes (libraries, version control, delegation). The
 * catalogue still owns the identity, the effect and the validation; a host that has not contributed one refuses
 * the call instead of guessing.
 */
export const contributedAction = <A>(config: {
  readonly id: string
  readonly kind: ActionKind
  readonly parameters: Schema.Codec<A, unknown>
  readonly replaces?: string
  readonly contribution: string
}): ActionSpec => ({
  ...defineWireAction({
    id: config.id,
    kind: config.kind,
    parameters: config.parameters,
    ...(config.replaces !== undefined ? { replaces: config.replaces } : {}),
    // The action's schema is the seam's decoder: a contribution reached directly (a test, or the next adapter) gets the
    // decoded value too, so a flag sent as `"true"` never reads as false and quietly changes what the action does.
    run: (input, context) => {
      const contribution = context.contributions?.[config.contribution]
      if (contribution === undefined) {
        return { ok: false, _tag: "ActionUnavailable", actionId: config.id, error: `${config.id} is not available in this host.` }
      }
      return (contribution as (value: unknown, ctx: ToolContext) => Promise<unknown>)(input, context)
    }
  }),
  contributed: config.contribution
})

/** The JSON answer for a refusal or an interruption; never a thrown error the model has to read as a crash. */
export const actionFailureResult = (error: ActionFailure): { ok: false; _tag: string; actionId: string; error: string } => ({
  ok: false,
  _tag: error._tag,
  actionId: error.actionId,
  error: error.message
})
