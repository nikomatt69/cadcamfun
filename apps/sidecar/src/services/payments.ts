import { Context, Data, Effect, Layer, Redacted, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { AppConfigService } from "../config.ts"

/** Why a payment call did not produce a URL. `unconfigured` is the default for an installation without Stripe. */
export class PaymentError extends Data.TaggedError("PaymentError")<{
  readonly reason: "unconfigured" | "noPrice" | "rejected"
  readonly message: string
}> {}

export interface CheckoutInput {
  readonly userId: string
  readonly email: string | null
  readonly plan: string
  readonly successUrl: string
  readonly cancelUrl: string
}

/**
 * The payment provider behind billing (spec 00 §6: cloud services sit behind an Effect
 * service with a local default). Without `STRIPE_SECRET_KEY` every call fails with
 * `unconfigured` and billing keeps the legacy "could not create the session" answers; with
 * it, checkout and portal sessions are created through Stripe's REST API.
 */
export class PaymentProvider extends Context.Service<PaymentProvider, {
  readonly configured: boolean
  checkout(input: CheckoutInput): Effect.Effect<{ readonly url: string }, PaymentError>
  portal(input: { readonly customerId: string; readonly returnUrl: string }): Effect.Effect<{ readonly url: string }, PaymentError>
}>()("cadcamfun/PaymentProvider") {
  static readonly layer = Layer.effect(PaymentProvider, Effect.gen(function*() {
    const config = yield* AppConfigService
    const secret = config.stripeSecretKey
    if (secret === undefined) {
      const unconfigured = Effect.fail(new PaymentError({ reason: "unconfigured", message: "No payment provider is configured" }))
      return PaymentProvider.of({ configured: false, checkout: () => unconfigured, portal: () => unconfigured })
    }
    const http = (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest((request) => request.pipe(
        HttpClientRequest.prependUrl(config.stripeApiBase ?? "https://api.stripe.com"),
        HttpClientRequest.bearerToken(Redacted.value(secret)),
        HttpClientRequest.acceptJson
      )),
      HttpClient.filterStatusOk
    )
    const UrlReply = Schema.Struct({ url: Schema.String })
    const create = (path: string, form: Record<string, string>) => HttpClientRequest.post(path).pipe(
      HttpClientRequest.bodyUrlParams(form),
      http.execute,
      Effect.flatMap(HttpClientResponse.schemaBodyJson(UrlReply)),
      Effect.mapError((cause) => new PaymentError({ reason: "rejected", message: `Stripe request failed: ${String(cause)}` }))
    )
    return PaymentProvider.of({
      configured: true,
      checkout: Effect.fn("PaymentProvider.checkout")(function*(input) {
        const price = config.stripePrices?.[input.plan]
        if (!price) return yield* new PaymentError({ reason: "noPrice", message: `No Stripe price configured for ${input.plan}` })
        return yield* create("/v1/checkout/sessions", {
          mode: "subscription",
          "line_items[0][price]": price,
          "line_items[0][quantity]": "1",
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          client_reference_id: input.userId,
          "metadata[userId]": input.userId,
          "metadata[plan]": input.plan,
          // The webhook reads these off the subscription object.
          "subscription_data[metadata][userId]": input.userId,
          "subscription_data[metadata][plan]": input.plan,
          ...(input.email ? { customer_email: input.email } : {})
        })
      }),
      portal: Effect.fn("PaymentProvider.portal")(function*(input) {
        return yield* create("/v1/billing_portal/sessions", { customer: input.customerId, return_url: input.returnUrl })
      })
    })
  })).pipe(Layer.provide(FetchHttpClient.layer))
}
