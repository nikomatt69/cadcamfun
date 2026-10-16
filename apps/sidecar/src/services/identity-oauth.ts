import { AuthBadRequest, AuthInternal } from "@cadcamfun/api"
import { DEFAULT_ISSUER, DESKTOP_CLIENT_ID, discover, normalizeIssuer, tokenRequest, type OAuthTokens } from "@cadcamfun/identity/client"
import { Context, Effect, Layer } from "effect"
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { AppConfigService } from "../config.ts"

interface Flow {
  close(): void
  readonly timer: ReturnType<typeof setTimeout>
  result?: { readonly status: "complete"; readonly tokens: OAuthTokens } | { readonly status: "failed"; readonly message: string }
}
export type OAuthPoll = { readonly status: "pending" } | { readonly status: "complete"; readonly tokens: OAuthTokens } | { readonly status: "failed"; readonly message: string }
const bad = () => new AuthBadRequest({ error: "Invalid sign-in", details: "The sign-in attempt expired or was cancelled" })

/** Loopback listeners are temporary, single-use, and never expose tokens to the browser. */
export function createOAuthFlows(issuerValue: string, fetcher: typeof fetch = fetch) {
  const issuer = normalizeIssuer(issuerValue)
  const flows = new Map<string, Flow>()
  const cancel = (id: string) => {
    const flow = flows.get(id)
    if (flow) { clearTimeout(flow.timer); flow.close(); flows.delete(id) }
  }
  const start = async () => {
    const metadata = await discover(issuer, fetcher)
    for (const id of flows.keys()) cancel(id)
    const id = randomBytes(32).toString("base64url")
    const state = randomBytes(32).toString("base64url")
    const verifier = randomBytes(48).toString("base64url")
    const challenge = createHash("sha256").update(verifier).digest("base64url")
    let used = false
    let closed = false
    const server = Bun.serve({
      hostname: "127.0.0.1", port: 0,
      async fetch(request) {
        const url = new URL(request.url)
        const pageHeaders = { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "content-security-policy": "default-src 'none'" }
        if (request.method !== "GET" || url.pathname !== "/callback") return new Response("Not found", { status: 404, headers: pageHeaders })
        const received = Buffer.from(url.searchParams.get("state") ?? "")
        const expected = Buffer.from(state)
        if (used || closed || received.length !== expected.length || !timingSafeEqual(received, expected)) return new Response("Invalid sign-in state", { status: 400, headers: pageHeaders })
        used = true
        const flow = flows.get(id)
        if (!flow) return new Response("Sign-in expired", { status: 400, headers: pageHeaders })
        try {
          const code = url.searchParams.get("code")
          if (!code || url.searchParams.has("error")) throw new Error("Sign-in was cancelled or denied")
          const tokens = await tokenRequest(metadata.tokenEndpoint, { grant_type: "authorization_code", client_id: DESKTOP_CLIENT_ID, redirect_uri: redirectUri, code, code_verifier: verifier }, fetcher)
          if (!closed) flow.result = { status: "complete", tokens }
          return new Response("Signed in to CADCAMFUN. You can return to the app.", { headers: pageHeaders })
        } catch {
          if (!closed) flow.result = { status: "failed", message: "CADCAMFUN sign-in failed. Please try again." }
          return new Response("CADCAMFUN sign-in failed. Return to the app and try again.", { status: 400, headers: pageHeaders })
        } finally { void server.stop() }
      },
    })
    const redirectUri = `http://127.0.0.1:${server.port}/callback`
    const flow: Flow = { close: () => { closed = true; void server.stop(true) }, timer: setTimeout(() => cancel(id), 5 * 60_000) }
    flow.timer.unref()
    flows.set(id, flow)
    const url = new URL(metadata.authorizationEndpoint)
    for (const [key, value] of Object.entries({ response_type: "code", client_id: DESKTOP_CLIENT_ID, redirect_uri: redirectUri, state, code_challenge: challenge, code_challenge_method: "S256", scope: "openid profile email offline_access" })) url.searchParams.set(key, value)
    return { id, url: url.href, issuer }
  }
  const poll = (id: string): OAuthPoll | undefined => {
    const flow = flows.get(id)
    if (!flow) return undefined
    if (!flow.result) return { status: "pending" }
    const result = flow.result
    cancel(id)
    return result
  }
  return { start, poll, cancel, close: () => { for (const id of flows.keys()) cancel(id) } }
}

export class IdentityOAuth extends Context.Service<IdentityOAuth, {
  start(): Effect.Effect<{ id: string; url: string; issuer: string }, AuthInternal>
  poll(id: string): Effect.Effect<OAuthPoll, AuthBadRequest>
  cancel(id: string): Effect.Effect<{ success: true; message: string }>
}>()("cadcamfun/IdentityOAuth") {
  static readonly layer = Layer.effect(IdentityOAuth, Effect.gen(function*() {
    const config = yield* AppConfigService
    const flows = yield* Effect.acquireRelease(
      Effect.sync(() => createOAuthFlows(config.identityIssuer ?? DEFAULT_ISSUER)),
      (flows) => Effect.sync(() => flows.close()),
    )
    return IdentityOAuth.of({
      start: () => Effect.tryPromise({ try: () => flows.start(), catch: () => new AuthInternal({ error: "Identity unavailable", details: "Could not start CADCAMFUN sign-in. Check the identity service configuration and connection." }) }),
      poll: (id) => Effect.suspend(() => { const result = flows.poll(id); return result ? Effect.succeed(result) : Effect.fail(bad()) }),
      cancel: (id) => Effect.sync(() => { flows.cancel(id); return { success: true as const, message: "Sign-in cancelled" } }),
    })
  }))
}
