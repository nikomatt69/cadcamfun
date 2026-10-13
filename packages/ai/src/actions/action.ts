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
import { ActionDenied, ActionInvalidInput, ActionInterrupted } from "@cadcamfun/api"
import type { ActionContribution, ToolContext } from "../tools/define.ts"

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
export const defineAction = <S extends ActionParameters>(config: ActionConfig<S>): ActionSpec<S> => ({
  id: config.id,
  kind: config.kind,
  parameters: config.parameters,
  ...(config.replaces !== undefined ? { replaces: config.replaces } : {}),
  run: (input, context) => {
    // An action may answer with an Effect (a typed refusal or an interruptible write) or with a plain value/Promise.
    let outcome: unknown
    try {
      outcome = config.run(input, context)
    } catch (cause) {
      return Effect.fail(new ActionFailed({ actionId: config.id, message: message(cause) }))
    }
    if (Effect.isEffect(outcome)) return outcome as Effect.Effect<unknown, ActionFailure>
    return Effect.tryPromise({
      try: () => Promise.resolve(outcome),
      catch: (cause) => new ActionFailed({ actionId: config.id, message: message(cause) })
    })
  }
})

/**
 * An action whose implementation the application contributes (libraries, version control, delegation). The
 * catalogue still owns the identity, the effect and the validation; a host that has not contributed one refuses
 * the call instead of guessing.
 */
export const contributedAction = <S extends ActionParameters>(config: Omit<ActionConfig<S>, "run"> & { readonly contribution: string }): ActionSpec<S> => ({
  ...defineAction({
    id: config.id,
    kind: config.kind,
    parameters: config.parameters,
    ...(config.replaces !== undefined ? { replaces: config.replaces } : {}),
    run: (input, context) => {
      const contribution = context.contributions?.[config.contribution]
      if (contribution === undefined) {
        return { ok: false, _tag: "ActionUnavailable", actionId: config.id, error: `${config.id} is not available in this host.` }
      }
      // The action's schema is the seam's decoder. The host already validates before it calls, but a contribution
      // reached directly (a test, or the next adapter) must not get raw arguments: a flag sent as `"true"` would
      // otherwise read as false and quietly change what the action does.
      const parsed = (config.parameters as z.ZodType).safeParse(input)
      if (!parsed.success) return { ok: false, _tag: "ActionInvalidInput", actionId: config.id, error: "The arguments do not match the action's schema." }
      return (contribution as (value: unknown, ctx: ToolContext) => Promise<unknown>)(parsed.data, context)
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