import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import { BadRequest, Forbidden, InternalError, MethodNotAllowed, NotFound } from "../errors.ts"

const opt = Schema.optional
const nullable = Schema.NullOr(Schema.String)
/** `{ error }` bodies used by the subscription/info and better-auth-stripe routes. */
export class BillingBadRequest extends Schema.TaggedError<BillingBadRequest>()("BillingBadRequest", { error: Schema.String }, { httpApiStatus: 400 }) {}
export class BillingForbidden extends Schema.TaggedError<BillingForbidden>()("BillingForbidden", { error: Schema.String }, { httpApiStatus: 403 }) {}
export class BillingNotFound extends Schema.TaggedError<BillingNotFound>()("BillingNotFound", { error: Schema.String }, { httpApiStatus: 404 }) {}
export class BillingFailure extends Schema.TaggedError<BillingFailure>()("BillingFailure", { error: Schema.String }, { httpApiStatus: 500 }) {}
export class CronUnauthorized extends Schema.TaggedError<CronUnauthorized>()("CronUnauthorized", { error: Schema.String }, { httpApiStatus: 401 }) {}
export class CronFailure extends Schema.TaggedError<CronFailure>()("CronFailure", {
  success: Schema.Literal(false), error: Schema.String, timestamp: Schema.String
}, { httpApiStatus: 500 }) {}
export class StripeUnhealthy extends Schema.TaggedError<StripeUnhealthy>()("StripeUnhealthy", {
  status: Schema.Literal("unhealthy"), message: Schema.String, timestamp: Schema.String, service: Schema.Literal("stripe")
}, { httpApiStatus: 503 }) {}

export const SubscriptionInfo = Schema.Struct({
  id: Schema.String, plan: Schema.String, status: Schema.String, currentPeriodEnd: nullable,
  cancelAtPeriodEnd: Schema.NullOr(Schema.Boolean), stripeCustomerId: nullable, stripeSubscriptionId: nullable
})
export const CurrentSubscription = Schema.Struct({
  plan: Schema.String, status: Schema.String, periodEnd: Schema.NullOr(Schema.String), cancelAtPeriodEnd: Schema.Boolean,
  isOnTrial: opt(Schema.Boolean), trialEnd: opt(Schema.String)
})
export const SubscribeBody = Schema.Struct({ priceId: opt(Schema.String), startTrial: opt(Schema.Boolean) })
export const SubscribeReply = Schema.Struct({
  url: opt(Schema.String), success: opt(Schema.Boolean), message: opt(Schema.String), redirectUrl: opt(Schema.String)
})
export const PortalBody = Schema.Struct({ returnUrl: opt(Schema.String) })
export const UrlReply = Schema.Struct({ url: Schema.String })
export const BetterAuthSubscription = Schema.Struct({
  id: opt(Schema.String), plan: Schema.String, status: Schema.String, currentPeriodEnd: Schema.NullOr(Schema.String),
  cancelAtPeriodEnd: Schema.Boolean, stripeCustomerId: opt(nullable), stripeSubscriptionId: opt(nullable), source: Schema.Literal("better-auth")
})
export const BetterAuthCheckoutBody = Schema.Struct({
  plan: opt(Schema.String), successUrl: opt(Schema.String), cancelUrl: opt(Schema.String), trialDays: opt(Schema.Number)
})
export const BetterAuthUpdateBody = Schema.Struct({ newPlan: opt(Schema.String) })
export const BetterAuthSuccess = Schema.Struct({ success: Schema.Literal(true), message: Schema.String, source: Schema.Literal("better-auth") })
export const FeatureAccessBody = Schema.Struct({ feature: opt(Schema.String), features: opt(Schema.Unknown) })
export const FeatureAccessReply = Schema.Struct({
  feature: opt(Schema.String), hasAccess: opt(Schema.Boolean), source: Schema.Literal("better-auth"),
  features: opt(Schema.Array(Schema.Struct({ feature: Schema.String, hasAccess: Schema.Boolean, error: opt(Schema.String) })))
})
export const SyncReply = Schema.Struct({
  success: Schema.Literal(true), message: Schema.String, subscription: Schema.NullOr(BetterAuthSubscription), source: Schema.Literal("better-auth")
})
export const CronReply = Schema.Struct({
  success: Schema.Literal(true), updatedCount: Schema.Number, message: Schema.String, timestamp: Schema.String
})
export const StripeHealth = Schema.Struct({
  status: Schema.Literal("healthy"), message: Schema.String, timestamp: Schema.String, service: Schema.Literal("stripe")
})
export const WebhookBody = Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array())
export const WebhookReply = Schema.Struct({ received: Schema.Literal(true) })
const message = Schema.Struct({ message: Schema.String })

export class BillingGroup extends HttpApiGroup.make("billing")
  .add(
    HttpApiEndpoint.get("info", "/api/subscription/info", { query: { userId: opt(Schema.String) }, success: SubscriptionInfo, error: [BillingBadRequest, BillingForbidden, BillingNotFound, BillingFailure] }),
    HttpApiEndpoint.get("current", "/api/subscriptions", { success: CurrentSubscription, error: InternalError }),
    HttpApiEndpoint.post("subscribe", "/api/subscriptions", { payload: SubscribeBody, success: SubscribeReply, error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.post("portal", "/api/subscriptions/portal", { payload: PortalBody, success: UrlReply, error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.get("baGet", "/api/better-auth-stripe/subscription", { success: BetterAuthSubscription, error: BillingFailure }),
    HttpApiEndpoint.post("baCheckout", "/api/better-auth-stripe/subscription", { payload: BetterAuthCheckoutBody, success: Schema.Struct({ url: Schema.String, source: Schema.Literal("better-auth") }), error: [BillingBadRequest, BillingFailure] }),
    HttpApiEndpoint.put("baUpdate", "/api/better-auth-stripe/subscription", { payload: BetterAuthUpdateBody, success: BetterAuthSuccess, error: [BillingBadRequest, BillingFailure] }),
    HttpApiEndpoint.delete("baCancel", "/api/better-auth-stripe/subscription", { success: BetterAuthSuccess, error: BillingFailure }),
    HttpApiEndpoint.post("baPortal", "/api/better-auth-stripe/billing-portal", { payload: PortalBody, success: Schema.Struct({ url: Schema.String, source: Schema.Literal("better-auth") }), error: [BillingBadRequest, BillingFailure] }),
    HttpApiEndpoint.post("baFeature", "/api/better-auth-stripe/feature-access", { payload: FeatureAccessBody, success: FeatureAccessReply, error: [BillingBadRequest, BillingFailure] }),
    HttpApiEndpoint.post("baSync", "/api/better-auth-stripe/sync", { success: SyncReply, error: BillingFailure }),
    HttpApiEndpoint.get("cronGet", "/api/cron/update-expired-trials", { query: { secret: opt(Schema.String) }, success: CronReply, error: [CronUnauthorized, CronFailure] }),
    HttpApiEndpoint.post("cronPost", "/api/cron/update-expired-trials", { query: { secret: opt(Schema.String) }, success: CronReply, error: [CronUnauthorized, CronFailure] }),
    HttpApiEndpoint.get("stripeHealth", "/api/health/stripe", { success: StripeHealth, error: StripeUnhealthy }),
    HttpApiEndpoint.post("stripeWebhook", "/api/webhooks/stripe", { payload: WebhookBody, success: WebhookReply, error: BadRequest })
  )
{}
