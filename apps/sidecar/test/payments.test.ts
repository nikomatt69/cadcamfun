import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createHmac } from "node:crypto"
import { Redacted } from "effect"
import { makeApp } from "./helpers.ts"

const WEBHOOK_SECRET = "whsec_test"
interface Seen { readonly path: string; readonly auth: string | null; readonly form: URLSearchParams }
const seen: Seen[] = []
let reject = false
// A stand-in for api.stripe.com: records what the sidecar sends and answers with a session URL.
const stripe = Bun.serve({
  port: 0,
  async fetch(request) {
    const { pathname } = new URL(request.url)
    seen.push({ path: pathname, auth: request.headers.get("authorization"), form: new URLSearchParams(await request.text()) })
    if (reject) return Response.json({ error: { message: "bad" } }, { status: 400 })
    return Response.json({ url: `https://pay.test${pathname}` })
  }
})

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => {
  app = await makeApp({
    stripeWebhookSecret: WEBHOOK_SECRET,
    stripeSecretKey: Redacted.make("sk_test_123"),
    stripePrices: { BASIC: "price_basic", PRO: "price_pro" },
    stripeApiBase: `http://127.0.0.1:${stripe.port}`
  })
})
afterAll(async () => { await app.dispose(); await stripe.stop(true) })
const json = (path: string, method: string, body?: unknown) => app.call(path, { method, ...(body === undefined ? {} : { json: body }) })

describe("Stripe payment provider", () => {
  test("a paid plan opens a Stripe checkout session for the acting account", async () => {
    const me = (await json("/api/user/profile", "GET")).body
    const r = await json("/api/subscriptions", "POST", { priceId: "BASIC" })
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ url: "https://pay.test/v1/checkout/sessions" })
    const call = seen.at(-1)!
    expect(call.auth).toBe("Bearer sk_test_123")
    expect(call.form.get("mode")).toBe("subscription")
    expect(call.form.get("line_items[0][price]")).toBe("price_basic")
    expect(call.form.get("client_reference_id")).toBe(me.id)
    expect(call.form.get("subscription_data[metadata][plan]")).toBe("BASIC")
    const ba = await json("/api/better-auth-stripe/subscription", "POST", { plan: "PRO", successUrl: "https://x.test/ok", cancelUrl: "https://x.test/no" })
    expect(ba.body).toEqual({ url: "https://pay.test/v1/checkout/sessions", source: "better-auth" })
    expect(seen.at(-1)!.form.get("success_url")).toBe("https://x.test/ok")
  })

  test("a plan without a configured price, or a rejected call, keeps the legacy failure", async () => {
    const before = seen.length
    const noPrice = await json("/api/subscriptions", "POST", { priceId: "ENTERPRISE" })
    expect(noPrice.status).toBe(500)
    expect(noPrice.body.message).toBe("Failed to create checkout session")
    expect(seen.length).toBe(before)
    reject = true
    const rejected = await json("/api/subscriptions", "POST", { priceId: "BASIC" })
    reject = false
    expect(rejected.status).toBe(500)
    expect(rejected.body.message).toBe("Failed to create checkout session")
  })

  test("the subscription webhook records plan and customer, which unlocks the billing portal", async () => {
    expect((await json("/api/subscriptions/portal", "POST", { returnUrl: "https://x.test/back" })).status).toBe(404)
    const me = (await json("/api/user/profile", "GET")).body
    const body = JSON.stringify({ type: "customer.subscription.created", data: { object: {
      id: "sub_9", customer: "cus_9", status: "active", current_period_end: 2_000_000_000, metadata: { userId: me.id, plan: "BASIC" }
    } } })
    const t = Math.floor(Date.now() / 1000)
    const v1 = createHmac("sha256", WEBHOOK_SECRET).update(`${t}.${body}`).digest("hex")
    const hook = await app.call("/api/webhooks/stripe", { method: "POST", body, headers: { "content-type": "application/octet-stream", "stripe-signature": `t=${t},v1=${v1}` } })
    expect(hook.status).toBe(200)
    expect((await json("/api/subscriptions", "GET")).body).toMatchObject({ plan: "BASIC", status: "active" })

    const portal = await json("/api/subscriptions/portal", "POST", { returnUrl: "https://x.test/back" })
    expect(portal.body).toEqual({ url: "https://pay.test/v1/billing_portal/sessions" })
    expect(seen.at(-1)!.form.get("customer")).toBe("cus_9")
  })
})
