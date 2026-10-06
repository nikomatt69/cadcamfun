import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createHmac } from "node:crypto"
import { makeApp } from "./helpers.ts"

const SECRET = "whsec_test"
let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp({ stripeWebhookSecret: SECRET }) })
afterAll(async () => { await app.dispose() })
const json = (path: string, method: string, body?: unknown) => app.call(path, { method, ...(body === undefined ? {} : { json: body }) })

describe("subscriptions", () => {
  test("requires the launch token", async () => {
    expect((await app.call("/api/subscriptions", { auth: false })).status).toBe(401)
  })

  test("the first read creates the free plan", async () => {
    const r = await json("/api/subscriptions", "GET")
    expect(r.body).toEqual({ plan: "FREE", status: "active", periodEnd: null, cancelAtPeriodEnd: false })
  })

  test("subscription/info validates the user id", async () => {
    expect((await json("/api/subscription/info", "GET")).body.error).toBe("User ID is required")
    expect((await json("/api/subscription/info?userId=someone-else", "GET")).status).toBe(403)
    const me = (await json("/api/user/profile", "GET")).body.id
    const info = await json(`/api/subscription/info?userId=${me}`, "GET")
    expect(info.body).toMatchObject({ id: me, plan: "FREE", status: "active" })
  })

  test("a paid checkout needs a provider; a PRO trial starts locally once", async () => {
    expect((await json("/api/subscriptions", "POST", {})).body.message).toBe("Missing required field: priceId")
    const checkout = await json("/api/subscriptions", "POST", { priceId: "BASIC" })
    expect(checkout.status).toBe(500)
    expect(checkout.body.message).toBe("Failed to create checkout session")
    const trial = await json("/api/subscriptions", "POST", { priceId: "PRO", startTrial: true })
    expect(trial.body).toEqual({ success: true, message: "Trial started successfully", redirectUrl: "/settings/subscription" })
    const now = await json("/api/subscriptions", "GET")
    expect(now.body).toMatchObject({ plan: "PRO", status: "trialing", isOnTrial: true })
    const again = await json("/api/subscriptions", "POST", { priceId: "PRO", startTrial: true })
    expect(again.status).toBe(400)
    expect(again.body.message).toBe("You already have an active trial")
  })

  test("portal needs a return URL and a Stripe customer", async () => {
    expect((await json("/api/subscriptions/portal", "POST", {})).body.message).toBe("Return URL is required")
    expect((await json("/api/subscriptions/portal", "POST", { returnUrl: "/x" })).body.message).toBe("No subscription found or no Stripe customer ID")
  })
})

describe("better-auth-stripe", () => {
  test("subscription read, plan update, features and cancel", async () => {
    expect((await json("/api/better-auth-stripe/subscription", "GET")).body).toMatchObject({ plan: "PRO", source: "better-auth" })
    expect((await json("/api/better-auth-stripe/subscription", "PUT", { newPlan: "GOLD" })).body.error).toBe("Invalid plan")
    expect((await json("/api/better-auth-stripe/subscription", "PUT", { newPlan: "BASIC" })).body.success).toBe(true)
    expect((await json("/api/better-auth-stripe/feature-access", "POST", {})).body.error).toBe("feature or features array is required")
    expect((await json("/api/better-auth-stripe/feature-access", "POST", { feature: "nope" })).body.error).toBe("Invalid feature flag")
    expect((await json("/api/better-auth-stripe/feature-access", "POST", { feature: "ai_assistant" })).body).toMatchObject({ hasAccess: true })
    expect((await json("/api/better-auth-stripe/feature-access", "POST", { feature: "ai_vision" })).body).toMatchObject({ hasAccess: false })
    const many = await json("/api/better-auth-stripe/feature-access", "POST", { features: ["cad_basic", "bogus"] })
    expect(many.body.features).toEqual([{ feature: "cad_basic", hasAccess: true }, { feature: "bogus", hasAccess: false, error: "Invalid feature flag" }])
    expect((await json("/api/better-auth-stripe/subscription", "POST", { plan: "PRO" })).body.error).toBe("Missing required fields: plan, successUrl, cancelUrl")
    expect((await json("/api/better-auth-stripe/billing-portal", "POST", {})).body.error).toBe("returnUrl is required")
    expect((await json("/api/better-auth-stripe/sync", "POST")).body).toMatchObject({ success: true, source: "better-auth" })
    expect((await json("/api/better-auth-stripe/subscription", "DELETE")).body.success).toBe(true)
  })
})

describe("cron, health and webhook", () => {
  test("the cron route expires finished trials", async () => {
    const r = await json("/api/cron/update-expired-trials", "POST")
    expect(r.body).toMatchObject({ success: true, updatedCount: 0 })
    expect((await json("/api/cron/update-expired-trials", "GET")).status).toBe(200)
  })

  test("stripe health reports the configured secret", async () => {
    expect((await json("/api/health/stripe", "GET")).body).toMatchObject({ status: "healthy", service: "stripe" })
  })

  test("webhooks need a valid signature and update the subscription", async () => {
    const body = JSON.stringify({ type: "customer.subscription.updated", data: { object: { id: "sub_1", status: "active", metadata: { userId: (await json("/api/user/profile", "GET")).body.id } } } })
    const post = (signature?: string) => app.call("/api/webhooks/stripe", {
      method: "POST", body, headers: { "content-type": "application/octet-stream", ...(signature ? { "stripe-signature": signature } : {}) }
    })
    expect((await post()).body.message).toBe("Missing signature or webhook secret")
    const t = Math.floor(Date.now() / 1000)
    expect((await post(`t=${t},v1=deadbeef`)).body.message).toStartWith("Webhook Error:")
    const v1 = createHmac("sha256", SECRET).update(`${t}.${body}`).digest("hex")
    const ok = await post(`t=${t},v1=${v1}`)
    expect(ok.status).toBe(200)
    expect(ok.body).toEqual({ received: true })
  })
})
