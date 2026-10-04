/**
 * Type-level plumbing that lets a model carry the shape of the provider options it accepts.
 *
 * `ProviderOptions` is `Record<string, Record<string, unknown>>` on the wire and stays that way —
 * every provider must be able to pass knobs nikcli has never heard of. But at a call site the model
 * is known, so `providerOptions` can be checked against *that provider's* documented options rather
 * than against `unknown`. A typo like `{ anthropic: { thinkingBudget: 4000 } }` (the field is
 * `thinking`) is otherwise accepted silently and simply ignored by the provider.
 *
 * The carrier is a phantom property: it exists only in the type system, so nothing changes at
 * runtime, nothing is serialized, and a plain `ModelRef` still works everywhere it did before.
 * A provider helper opts in purely by annotating its return type — no wrapper call, because the
 * carrier is optional and a plain `ModelRef` is already assignable to the branded type.
 */
import type { ModelRef, ProviderOptions } from "./options"

declare const ProviderOptionsCarrier: unique symbol

/**
 * A `ModelRef` that also records, in the type system only, which provider options it accepts.
 *
 * Assignable to and from `ModelRef`, so this is additive: existing code that passes an untyped
 * `ModelRef` keeps compiling and simply gets the generic `ProviderOptions` fallback.
 */
export type TypedModelRef<Options extends ProviderOptions = ProviderOptions> = ModelRef & {
  readonly [ProviderOptionsCarrier]?: Options
}

/**
 * The provider options a model accepts.
 *
 * Falls back to the open `ProviderOptions` record for models that carry no type — generic provider
 * helpers, models deserialized from config, and anything constructed by hand.
 */
export type ProviderOptionsOf<M> = M extends { readonly [ProviderOptionsCarrier]?: infer Options }
  ? unknown extends Options
    ? ProviderOptions
    : Options extends ProviderOptions
      ? Options
      : ProviderOptions
  : ProviderOptions
