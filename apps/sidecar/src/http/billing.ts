import {
  Api, BadRequest, BillingBadRequest, BillingFailure, BillingForbidden, BillingNotFound, CronFailure, CronUnauthorized,
  CurrentUser, InternalError, NotFound, StripeUnhealthy
} from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { HttpServerRequest } from "effect/unstable/http"
import { createHmac, timingSafeEqual } from "node:crypto"
import { AppConfigService } from "../config.ts"
import { BillingRepo, PLANS, TRIAL_DAYS, type SubscriptionRow } from "../repos/billing-repo.ts"

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)
const fail = (message: string) => (e: unknown) =>
  Effect.logError(message, e).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))
const keyed = (message: string) => (e: unknown) =>
  Effect.logError(message, e).pipe(Effect.andThen(Effect.fail(new BillingFailure({ error: message }))))
const FEATURES = [
  "ai_assistant", "ai_vision", "ai_autonomous", "ai_code_interpreter", "ai_advanced_prompts", "cad_basic", "cad_advanced",
  "cad_3d_modeling", "cad_assemblies", "cad_parametric", "cad_simulation", "cam_basic", "cam_advanced", "cam_multiaxis",
  "cam_toolpath_optimization", "export_step", "export_iges", "export_stl", "export_gcode", "export_pdf", "import_advanced",
  "real_time_collaboration", "team_management", "project_sharing", "comments_annotations", "cloud_storage", "unlimited_projects",
  "large_file_support", "marketplace_access", "custom_plugins", "third_party_integrations", "advanced_analytics", "usage_reports",
  "performance_monitoring", "priority_support", "dedicated_support", "training_resources", "api_access", "webhook_support", "custom_branding"
]
/** Same rules as the legacy `BetterAuthStripeService.hasFeatureAccess`. */
const hasFeature = (plan: string, feature: string): boolean => {
  switch (feature) {
    case "ai_assistant": return ["BASIC", "PRO", "ENTERPRISE"].includes(plan)
    case "ai_vision": case "cad_advanced": return ["PRO", "ENTERPRISE"].includes(plan)
    case "cam_multiaxis": return plan === "ENTERPRISE"
    default: return plan !== "FREE"
  }
}
const periodEnd = (s: SubscriptionRow) => s.stripeCurrentPeriodEnd ?? s.lsCurrentPeriodEnd ?? s.periodEnd

/** Verifies a Stripe `t=…,v1=…` signature header over the raw body (5 minute tolerance). */
const verifySignature = (payload: Uint8Array, header: string, secret: string): string | undefined => {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]))
  const t = parts["t"]; const v1 = parts["v1"]
  if (!t || !v1) return "Unable to extract timestamp and signatures from header"
  const expected = createHmac("sha256", secret).update(`${t}.`).update(payload).digest("hex")
  const a = Buffer.from(expected); const b = Buffer.from(v1)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return "No signatures found matching the expected signature for payload"
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return "Timestamp outside the tolerance zone"
  return undefined
}

export const BillingHandlers = HttpApiBuilder.group(Api, "billing", Effect.fn(function*(handlers) {
  const repo = yield* BillingRepo
  const config = yield* AppConfigService

  const current = Effect.fn("billing.current")(function*(userId: string) {
    const sub = yield* repo.ensureFree(userId)
    if (sub.status === "trialing" && sub.trialEndsAt) {
      if (sub.trialEndsAt.getTime() <= Date.now()) {
        yield* repo.expireTrial(userId)
        return { plan: "FREE", status: "active", periodEnd: null, cancelAtPeriodEnd: false }
      }
      return { plan: sub.plan, status: "trialing", periodEnd: iso(sub.trialEndsAt), cancelAtPeriodEnd: false, isOnTrial: true, trialEnd: iso(sub.trialEndsAt)! }
    }
    return { plan: sub.plan || "FREE", status: sub.status || "active", periodEnd: iso(periodEnd(sub)), cancelAtPeriodEnd: sub.cancelAtPeriodEnd ?? false }
  })
  const infoOf = (userId: string) => repo.find(userId).pipe(Effect.map((sub) => sub && ({
    id: sub.id, plan: sub.plan, status: sub.status, currentPeriodEnd: iso(sub.stripeCurrentPeriodEnd),
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd, stripeCustomerId: sub.stripeCustomerId, stripeSubscriptionId: sub.stripeSubscriptionId
  })))
  const cron = (query: { secret?: string | undefined }) => Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const bearer = request.headers["authorization"]?.replace("Bearer ", "")
    // The desktop app calls this with the launch token (already checked); an external caller needs CRON_SECRET.
    if (config.cronSecret && config.cronSecret !== (query.secret ?? bearer)) return yield* new CronUnauthorized({ error: "Unauthorized" })
    const updatedCount = yield* repo.updateExpiredTrials()
    return { success: true as const, updatedCount, message: `Successfully updated ${updatedCount} expired trials`, timestamp: new Date().toISOString() }
  }).pipe(Effect.catchIf((e): e is Exclude<typeof e, CronUnauthorized> => !(e instanceof CronUnauthorized),
    (e) => Effect.fail(new CronFailure({ success: false, error: e instanceof Error ? e.message : "Unknown error", timestamp: new Date().toISOString() }))))

  return handlers
    .handle("info", ({ query }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      if (!query.userId) return yield* new BillingBadRequest({ error: "User ID is required" })
      if (user.id !== query.userId) return yield* new BillingForbidden({ error: "Forbidden" })
      const info = yield* infoOf(user.id)
      if (!info) return yield* new BillingNotFound({ error: "Subscription not found" })
      return info
    }).pipe(Effect.catchTag("DatabaseError", (e) => Effect.logError("Error fetching subscription info", e).pipe(
      Effect.andThen(Effect.fail(new BillingFailure({ error: "Internal Server Error" })))))))
    .handle("current", () => Effect.gen(function*() { return yield* current((yield* CurrentUser).id) })
      .pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch subscription"))))
    .handle("subscribe", ({ payload }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      if (!payload.priceId) return yield* new BadRequest({ message: "Missing required field: priceId" })
      if (payload.startTrial && payload.priceId === "PRO") {
        const existing = yield* repo.find(user.id)
        if (existing && existing.status !== "expired" && existing.plan !== "FREE") {
          return yield* new BadRequest({ message: existing.status === "trialing" ? "You already have an active trial" : "You already have an active subscription" })
        }
        if (!user.email) return yield* new NotFound({ message: "User not found or missing email" })
        yield* repo.startTrial(user.id, "PRO", TRIAL_DAYS)
        return { success: true, message: "Trial started successfully", redirectUrl: "/settings/subscription" }
      }
      // No payment provider is configured in the desktop app: a paid checkout cannot be created.
      return yield* new InternalError({ message: "Failed to create checkout session" })
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to start trial"))))
    .handle("portal", ({ payload }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      if (!payload.returnUrl) return yield* new BadRequest({ message: "Return URL is required" })
      const sub = yield* repo.find(user.id)
      if (!sub || !sub.stripeCustomerId) return yield* new NotFound({ message: "No subscription found or no Stripe customer ID" })
      return yield* new InternalError({ message: "Failed to create billing portal session" })
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to create billing portal session"))))
    .handle("baGet", () => Effect.gen(function*() {
      const info = yield* infoOf((yield* CurrentUser).id)
      if (!info) return { plan: "FREE", status: "inactive", currentPeriodEnd: null, cancelAtPeriodEnd: false, source: "better-auth" as const }
      return { ...info, plan: PLANS.includes(info.plan as never) ? info.plan : "FREE", cancelAtPeriodEnd: info.cancelAtPeriodEnd ?? false, source: "better-auth" as const }
    }).pipe(Effect.catchTag("DatabaseError", keyed("Internal server error"))))
    .handle("baCheckout", ({ payload }) => Effect.gen(function*() {
      if (!payload.plan || !payload.successUrl || !payload.cancelUrl) return yield* new BillingBadRequest({ error: "Missing required fields: plan, successUrl, cancelUrl" })
      if (!PLANS.includes(payload.plan as never)) return yield* new BillingBadRequest({ error: "Invalid plan" })
      return yield* new BillingFailure({ error: "Failed to create checkout session" })
    }))
    .handle("baUpdate", ({ payload }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      if (!payload.newPlan || !PLANS.includes(payload.newPlan as never)) return yield* new BillingBadRequest({ error: "Invalid plan" })
      yield* repo.setPlan(user.id, payload.newPlan, "active")
      return { success: true as const, message: "Subscription updated successfully", source: "better-auth" as const }
    }).pipe(Effect.catchTag("DatabaseError", keyed("Failed to update subscription"))))
    .handle("baCancel", () => Effect.gen(function*() {
      if (!(yield* repo.cancel((yield* CurrentUser).id))) return yield* new BillingFailure({ error: "Failed to cancel subscription" })
      return { success: true as const, message: "Subscription cancelled successfully", source: "better-auth" as const }
    }).pipe(Effect.catchTag("DatabaseError", keyed("Failed to cancel subscription"))))
    .handle("baPortal", ({ payload }) => Effect.gen(function*() {
      if (!payload.returnUrl) return yield* new BillingBadRequest({ error: "returnUrl is required" })
      return yield* new BillingFailure({ error: "Failed to create billing portal session" })
    }))
    .handle("baFeature", ({ payload }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      if (!payload.feature && !payload.features) return yield* new BillingBadRequest({ error: "feature or features array is required" })
      const plan = (yield* repo.find(user.id))?.plan
      const access = (feature: string) => plan !== undefined && hasFeature(plan, feature)
      if (payload.feature) {
        if (!FEATURES.includes(payload.feature)) return yield* new BillingBadRequest({ error: "Invalid feature flag" })
        return { feature: payload.feature, hasAccess: access(payload.feature), source: "better-auth" as const }
      }
      if (Array.isArray(payload.features)) {
        return {
          features: (payload.features as string[]).map((f) => FEATURES.includes(f) ? { feature: f, hasAccess: access(f) } : { feature: f, hasAccess: false, error: "Invalid feature flag" }),
          source: "better-auth" as const
        }
      }
      return yield* new BillingBadRequest({ error: "Invalid request format" })
    }).pipe(Effect.catchTag("DatabaseError", keyed("Internal server error"))))
    .handle("baSync", () => Effect.gen(function*() {
      const info = yield* infoOf((yield* CurrentUser).id)
      return {
        success: true as const, message: "Subscription data synchronized successfully", source: "better-auth" as const,
        subscription: info ? { ...info, cancelAtPeriodEnd: info.cancelAtPeriodEnd ?? false, source: "better-auth" as const } : null
      }
    }).pipe(Effect.catchTag("DatabaseError", keyed("Failed to sync subscription data"))))
    .handle("cronGet", ({ query }) => cron(query))
    .handle("cronPost", ({ query }) => cron(query))
    .handle("stripeHealth", () => config.stripeWebhookSecret !== undefined
      ? Effect.succeed({ status: "healthy" as const, message: "Stripe is configured", timestamp: new Date().toISOString(), service: "stripe" as const })
      : Effect.fail(new StripeUnhealthy({ status: "unhealthy", message: "Stripe is not configured on this installation", timestamp: new Date().toISOString(), service: "stripe" })))
    .handle("stripeWebhook", ({ payload }) => Effect.gen(function*() {
      const request = yield* HttpServerRequest.HttpServerRequest
      const signature = request.headers["stripe-signature"]
      if (!signature || !config.stripeWebhookSecret) return yield* new BadRequest({ message: "Missing signature or webhook secret" })
      const problem = verifySignature(payload, signature, config.stripeWebhookSecret)
      if (problem) return yield* new BadRequest({ message: `Webhook Error: ${problem}` })
      const event = JSON.parse(new TextDecoder().decode(payload)) as { type?: string; data?: { object?: Record<string, unknown> } }
      const object = event.data?.object ?? {}
      if (event.type?.startsWith("customer.subscription.")) {
        const metadata = (object["metadata"] ?? {}) as Record<string, string>
        const deleted = event.type === "customer.subscription.deleted"
        const end = typeof object["current_period_end"] === "number" ? new Date((object["current_period_end"] as number) * 1000) : undefined
        yield* repo.updateFromStripe(
          { ...(typeof object["id"] === "string" ? { subscriptionId: object["id"] } : {}), ...(metadata["userId"] ? { userId: metadata["userId"] } : {}) },
          deleted
            ? { plan: "FREE", status: "active", stripeSubscriptionId: null }
            : { status: String(object["status"] ?? "active"), cancelAtPeriodEnd: object["cancel_at_period_end"] === true, ...(end ? { stripeCurrentPeriodEnd: end } : {}) }
        ).pipe(Effect.ignore)
      }
      yield* Effect.logInfo(`stripe webhook ${event.type ?? "unknown"} processed`)
      return { received: true as const }
    }).pipe(Effect.catchIf((e): e is Exclude<typeof e, BadRequest> => !(e instanceof BadRequest),
      (e) => Effect.logError("Webhook error", e).pipe(Effect.andThen(Effect.fail(new BadRequest({ message: "Webhook handler failed" })))))))
}))
