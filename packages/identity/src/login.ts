import type { Context } from "hono"
import {
  AUTH_CODE_TTL_SECONDS,
  DEVICE_APPROVAL_LIMIT,
  DEVICE_APPROVAL_WINDOW_SECONDS,
  EMAIL_CODE_BURST_LIMIT,
  EMAIL_CODE_BURST_WINDOW_SECONDS,
  EMAIL_CODE_HOURLY_LIMIT,
  EMAIL_CODE_HOURLY_WINDOW_SECONDS,
  EMAIL_CODE_IP_LIMIT,
  EMAIL_CODE_IP_WINDOW_SECONDS,
  EMAIL_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_TTL_SECONDS,
  legacyIssuerHost,
  LOGIN_STATE_TTL_SECONDS,
} from "./constants.ts"
import { randomDigits, randomToken, secureEqual, sha256 } from "./crypto.ts"
import { countPasskeys, getDeviceByUserCode, linkAccount, setDeviceDecision } from "./database.ts"
import { HttpError, logSignInFailure, readForm, requestIP } from "./http.ts"
import { consumeRateLimit } from "./rate-limit.ts"
import type { AuthCode, EmailChallenge, LoginIntent, PasskeyOffer } from "./types.ts"
import { devicePage, emailCodePage, loginPage, passkeyOfferPage, resultPage } from "./ui.ts"

type AppContext = Context<{ Bindings: Env }>


const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Codes travel through email clients, clipboards, and OTP autofill, so what
 * arrives in the form is routinely `123 456`, `1234-5678`, a non-breaking
 * space, or a trailing newline. Everything the user can plausibly submit
 * reduces to its digits; anything else was never a code.
 */
function digitsOnly(value: string): string {
  return value.replace(/\D+/g, "")
}

/** `12345678`, `1234 5678`, `1234-5678` → `1234-5678`; anything else → "". */
export function normalizeUserCode(value: string): string {
  const digits = digitsOnly(value)
  return digits.length === 8 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : ""
}

function formatDuration(seconds: number): string {
  if (seconds >= 90) return `${Math.ceil(seconds / 60)} minutes`
  return `${Math.max(1, Math.ceil(seconds))} seconds`
}

/**
 * KV rejects a TTL under 60s, so a code with less than a minute left is stored
 * for the minimum — `expiresAt` on the challenge stays authoritative for
 * whether it is still usable.
 */
function remainingTtl(expiresAt: number, now = Date.now()): number {
  return Math.max(60, Math.ceil((expiresAt - now) / 1000))
}

function loginKey(state: string): string {
  return `login:${state}`
}

function emailKey(state: string): string {
  return `email:${state}`
}

/**
 * Short-lived pointer to the redirect a completed login already issued.
 * The hosted login pages are pure HTML with no script-src in their CSP
 * (by design), so a mistimed OTP autofill plus a manual tap on "Verify and
 * continue" can fire several near-simultaneous submits of the same form.
 * Only the first submit finds the login intent; without this cache the
 * rest would race it to "Session expired" instead of just replaying the
 * same redirect the first submit already produced.
 */
function completedKey(state: string): string {
  return `completed:${state}`
}
const COMPLETED_REPLAY_TTL_SECONDS = 60

/**
 * A device login has no redirect to replay, so its completion marker is this
 * sentinel and the replay re-renders the same "connected" page.
 */
const DEVICE_COMPLETED_MARKER = "device"

/**
 * Exported because it is also served at `GET /device/connected`, a stable URL
 * the passkey script can navigate to. It used to call `location.reload()`
 * instead, which re-issued whatever request had rendered the page — for a
 * A repeated authorization callback uses an already consumed code, so a device approval that succeeded
 * repainted itself as "Sign-in failed".
 */
export function deviceConnectedPage(c: AppContext): Response {
  return resultPage(c, "Device connected", "You can close this window and return to your CADCAMFUN app.")
}

/**
 * What the sign-in pages say when the login they interrupt is a terminal
 * waiting to be approved. Every page that can be reached mid-approval carries
 * it, errors included — losing it is how a user stops understanding that the
 * terminal still depends on this tab.
 */
const DEVICE_LEAD =
  "Your CADCAMFUN app is not connected yet — finish signing in below and keep this tab open until you see the confirmation."

function leadFor(intent: LoginIntent | null | undefined): string | undefined {
  return intent?.kind === "device" ? DEVICE_LEAD : undefined
}

/**
 * Re-serve whatever a completed login already produced. Every duplicate submit
 * of the same `login_state` — autofill racing a tap, a double-tap, a browser
 * retry — reaches here after the first one consumed the intent, and telling
 * those "session expired" when the sign-in actually succeeded is the single
 * most confusing failure this flow can produce.
 */
async function replayCompleted(c: AppContext, loginState: string): Promise<Response | null> {
  if (!loginState) return null
  const replay = await c.env.STATE.get(completedKey(loginState))
  if (!replay) return null
  return replay === DEVICE_COMPLETED_MARKER ? deviceConnectedPage(c) : c.redirect(replay, 302)
}

export async function createLoginState(env: Env, intent: LoginIntent): Promise<string> {
  const state = randomToken(32)
  await env.STATE.put(loginKey(state), JSON.stringify(intent), {
    expirationTtl: LOGIN_STATE_TTL_SECONDS,
  })
  return state
}

export async function loadLoginIntent(env: Env, state: string): Promise<LoginIntent | null> {
  if (!state) return null
  return env.STATE.get<LoginIntent>(loginKey(state), "json")
}

function passkeyOfferKey(state: string): string {
  return `passkey-offer:${state}`
}

export type FinalizeLoginResult = { kind: "redirect"; url: string } | { kind: "device" }

/**
 * Consume the login intent and issue the authorize redirect or device
 * approval. HTML handlers turn this into a page via `completeLogin`; JSON
 * passkey verify endpoints return the same side effects as `{ redirect }` or
 * `{ ok, device }`.
 */
export async function finalizeLogin(
  c: AppContext,
  loginState: string,
  accountID: string,
  fallbackIntent?: LoginIntent,
): Promise<FinalizeLoginResult> {
  // A replay always answers first: a duplicate submit of a sign-in that already
  // finished must re-serve its outcome, never redo it against a fallback.
  const intent = (await loadLoginIntent(c.env, loginState)) ?? undefined
  if (!intent) {
    const replay = await c.env.STATE.get(completedKey(loginState))
    if (replay === DEVICE_COMPLETED_MARKER) return { kind: "device" }
    if (replay) return { kind: "redirect", url: replay }
  }
  // Only then the copy the passkey offer carries, for the case the `login:`
  // entry lapsed while the user was deciding about the passkey.
  const resolved = intent ?? fallbackIntent
  if (!resolved) throw new HttpError(400, "Session expired")
  return finalizeWithIntent(c, loginState, accountID, resolved)
}

async function finalizeWithIntent(
  c: AppContext,
  loginState: string,
  accountID: string,
  intent: LoginIntent,
): Promise<FinalizeLoginResult> {
  await c.env.STATE.delete(loginKey(loginState))
  await c.env.STATE.delete(emailKey(loginState))
  await c.env.STATE.delete(`passkey:auth:${loginState}`)
  await c.env.STATE.delete(`passkey:reg:${loginState}`)
  await c.env.STATE.delete(passkeyOfferKey(loginState))

  if (intent.kind === "device") {
    const approved = await setDeviceDecision(c.env.DB, intent.userCode, "approved", accountID, Date.now())
    if (!approved) {
      // Losing the pending→approved race is the normal outcome of a duplicate
      // submit, not a failure: if the row already carries this account, the
      // terminal is connected and the user should be told exactly that.
      const row = await getDeviceByUserCode(c.env.DB, intent.userCode)
      if (row?.account_id === accountID && (row.status === "approved" || row.status === "consumed")) {
        return { kind: "device" }
      }
      throw new HttpError(400, "Device code expired")
    }
    await c.env.STATE.put(completedKey(loginState), DEVICE_COMPLETED_MARKER, {
      expirationTtl: COMPLETED_REPLAY_TTL_SECONDS,
    })
    return { kind: "device" }
  }

  const code = randomToken(32)
  const payload: AuthCode = {
    accountID,
    clientID: intent.clientID,
    redirectURI: intent.redirectURI,
    scope: intent.scope,
    codeChallenge: intent.codeChallenge,
  }
  await c.env.STATE.put(`authcode:${await sha256(code)}`, JSON.stringify(payload), {
    expirationTtl: AUTH_CODE_TTL_SECONDS,
  })
  const redirect = new URL(intent.redirectURI)
  redirect.searchParams.set("code", code)
  redirect.searchParams.set("state", intent.state)
  await c.env.STATE.put(completedKey(loginState), redirect.toString(), {
    expirationTtl: COMPLETED_REPLAY_TTL_SECONDS,
  })
  return { kind: "redirect", url: redirect.toString() }
}

export async function completeLogin(
  c: AppContext,
  loginState: string,
  accountID: string,
  fallbackIntent?: LoginIntent,
): Promise<Response> {
  try {
    const result = await finalizeLogin(c, loginState, accountID, fallbackIntent)
    return result.kind === "device" ? deviceConnectedPage(c) : c.redirect(result.url, 302)
  } catch (error) {
    if (error instanceof HttpError && error.status === 400) {
      if (error.message === "Device code expired") {
        // The user authenticated successfully and *then* lost the race with the
        // device code's lifetime. That is the failure most worth counting: it
        // is invisible to them (they did everything right) and it is the one a
        // longer window actually fixes.
        logSignInFailure(c, "complete-login", "device-code-expired")
        return resultPage(c, "Device code expired", "Return to the terminal and start sign-in again.", 400)
      }
      logSignInFailure(c, "complete-login", "session-expired")
      return resultPage(c, "Session expired", "Start the sign-in flow again.", 400)
    }
    throw error
  }
}

/**
 * Whether the account holds a passkey this issuer's own host can use. One
 * saved under the legacy host does not count: it only works where the browser
 * supports Related Origin Requests, so its owner still gets the offer.
 */
export async function hasCurrentPasskey(env: Env, accountID: string): Promise<boolean> {
  const rpID = new URL(env.ISSUER).hostname
  return (await countPasskeys(env.DB, accountID, rpID, !legacyIssuerHost(env.ISSUER))) > 0
}

/** Park the finished first factor on the offer until the user saves or skips. */
export async function storePasskeyOffer(
  env: Env,
  loginState: string,
  accountID: string,
): Promise<LoginIntent | undefined> {
  const intent = (await loadLoginIntent(env, loginState)) ?? undefined
  const offer: PasskeyOffer = { accountID, ...(intent ? { intent } : {}) }
  await env.STATE.put(passkeyOfferKey(loginState), JSON.stringify(offer), {
    expirationTtl: LOGIN_STATE_TTL_SECONDS,
  })
  return intent
}

/**
 * First-time accounts get a chance to save a platform passkey before the
 * login intent is consumed. Accounts that already have one complete as usual.
 */
async function completeOrOfferPasskey(c: AppContext, loginState: string, accountID: string): Promise<Response> {
  if (await hasCurrentPasskey(c.env, accountID)) return completeLogin(c, loginState, accountID)
  return renderPasskeyOffer(c, loginState, await storePasskeyOffer(c.env, loginState, accountID))
}

/**
 * `GET /login/passkey/offer` — where a sign-in with a legacy-host passkey lands
 * so it can save one for the current host. Without an offer this is a replay or
 * a stale page, which `completeLogin` already answers.
 */
export async function passkeyOfferRoute(c: AppContext): Promise<Response> {
  const loginState = c.req.query("login_state") ?? ""
  const offer = await c.env.STATE.get<PasskeyOffer>(passkeyOfferKey(loginState), "json")
  if (!offer) return completeLogin(c, loginState, "")
  return renderPasskeyOffer(c, loginState, offer.intent)
}

function renderPasskeyOffer(c: AppContext, loginState: string, intent: LoginIntent | undefined): Response {
  // This page is the last thing standing between a device sign-in and the
  // approval, and it looks entirely optional — "Save a passkey", with a "Not
  // now" beside it. Abandoning it is a reasonable thing to do and it silently
  // strands the terminal, so a device flow gets told what "Not now" is for.
  return passkeyOfferPage(
    c,
    loginState,
    undefined,
    200,
    intent?.kind === "device"
      ? "Use Face ID, Touch ID, Windows Hello, or a password manager passkey next time. Either button connects your CADCAMFUN app — choose one to finish."
      : undefined,
  )
}

export async function requestEmailCode(c: AppContext): Promise<Response> {
  const form = await readForm(c.req.raw)
  const loginState = form.get("login_state") ?? ""
  const email = (form.get("email") ?? "").trim().toLowerCase()
  const intent = await loadLoginIntent(c.env, loginState)
  if (!intent) {
    const replay = await replayCompleted(c, loginState)
    return replay ?? resultPage(c, "Session expired", "Start the sign-in flow again.", 400)
  }
  const lead = leadFor(intent)
  if (!EMAIL_PATTERN.test(email) || email.length > 254)
    return loginPage(c, loginState, "Enter a valid email address.", 200, lead)

  // Two budgets bound what one address can be made to receive; the third bounds
  // what one network can make the issuer send in total, across addresses.
  const [burst, sustained, perIP] = await Promise.all([
    consumeRateLimit(c.env.STATE, "email", email, EMAIL_CODE_BURST_LIMIT, EMAIL_CODE_BURST_WINDOW_SECONDS),
    consumeRateLimit(c.env.STATE, "email-hour", email, EMAIL_CODE_HOURLY_LIMIT, EMAIL_CODE_HOURLY_WINDOW_SECONDS),
    consumeRateLimit(c.env.STATE, "email-ip", requestIP(c.req.raw), EMAIL_CODE_IP_LIMIT, EMAIL_CODE_IP_WINDOW_SECONDS),
  ])
  const addressLimited = !burst.allowed ? burst : !sustained.allowed ? sustained : null
  const limited = addressLimited ?? (perIP.allowed ? null : perIP)
  if (limited) {
    c.header("Retry-After", String(limited.retryAfter))
    logSignInFailure(c, "email-request", addressLimited ? "address-rate-limited" : "network-rate-limited", {
      retryAfter: limited.retryAfter,
    })
    // An already-delivered code stays usable while the sender is throttled, so
    // keep the user on the page where they can still enter it.
    const pending = await c.env.STATE.get<EmailChallenge>(emailKey(loginState), "json")
    const wait = formatDuration(limited.retryAfter)
    // Whose budget ran out changes what the user can do about it: waiting helps
    // for their own address, while a shared network says nothing about the code
    // they may already be holding.
    const reason = addressLimited
      ? "Too many codes were sent to this address."
      : "Too many sign-in codes were requested from this network."
    return pending
      ? emailCodePage(
          c,
          loginState,
          email,
          `${reason} Enter the code you already received, or request another in ${wait}.`,
          429,
        )
      : loginPage(c, loginState, `${reason} Try again in ${wait}.`, 429, lead)
  }

  const code = randomDigits(6)
  const nonce = randomToken(16)
  const challenge: EmailChallenge = {
    email,
    nonce,
    codeHash: await sha256(`${nonce}:${code}`),
    attempts: 0,
    expiresAt: Date.now() + EMAIL_CODE_TTL_SECONDS * 1000,
  }
  try {
    await c.env.EMAIL.send({
      to: email,
      from: { email: c.env.EMAIL_SENDER, name: "CADCAMFUN" },
      subject: `${code} is your CADCAMFUN sign-in code`,
      text: `Your CADCAMFUN sign-in code is ${code}. It expires in 10 minutes. If you did not request this code, ignore this email.`,
      html: `<p>Your CADCAMFUN sign-in code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:0.2em">${code}</p><p>It expires in 10 minutes. If you did not request this code, ignore this email.</p>`,
    })
  } catch (error) {
    // A rejected send used to surface as a bare 500 from the worker, which
    // reads to the user as "sign-in is broken" rather than "try again or use
    // another sign-in method". Log the domain (never the address) so delivery problems with a
    // specific provider are diagnosable from `wrangler tail`.
    console.error(
      JSON.stringify({
        message: "email code send failed",
        domain: email.slice(email.lastIndexOf("@") + 1),
        error: error instanceof Error ? error.message : String(error),
      }),
    )
    return loginPage(
      c,
      loginState,
      "We could not send the code right now. Try again in a moment.",
      502,
      lead,
    )
  }
  // Persist only after the mail is accepted: a challenge nobody can satisfy
  // would just burn the address's send budget on the retry.
  await c.env.STATE.put(emailKey(loginState), JSON.stringify(challenge), {
    expirationTtl: EMAIL_CODE_TTL_SECONDS,
  })
  return emailCodePage(c, loginState, email)
}

export async function verifyEmailCode(c: AppContext): Promise<Response> {
  const form = await readForm(c.req.raw)
  const loginState = form.get("login_state") ?? ""
  const code = digitsOnly(form.get("code") ?? "")
  const challenge = await c.env.STATE.get<EmailChallenge>(emailKey(loginState), "json")
  const intent = await loadLoginIntent(c.env, loginState)
  if (!challenge || !intent) {
    // A prior submit for this same login_state may have already verified the
    // code and consumed both KV entries — replay its outcome instead of
    // telling a merely-late duplicate request its code is expired.
    const replay = await replayCompleted(c, loginState)
    if (replay) return replay
    return resultPage(c, "Code expired", "Request a new sign-in code.", 400)
  }
  const lead = leadFor(intent)

  const expiresAt = challenge.expiresAt ?? Date.now() + EMAIL_CODE_TTL_SECONDS * 1000
  if (expiresAt <= Date.now()) {
    await c.env.STATE.delete(emailKey(loginState))
    return loginPage(c, loginState, "That code expired. Request a new one.", 200, lead)
  }

  // Empty or short submissions are typos and half-finished autofills, not
  // guesses. Spending one of the five real attempts on them is how a user with
  // a perfectly good code ends up locked out of it.
  if (code.length !== 6) {
    return emailCodePage(c, loginState, challenge.email, "Enter the six digits from the email.", 400)
  }

  challenge.attempts += 1
  if (challenge.attempts > EMAIL_CODE_MAX_ATTEMPTS) {
    await c.env.STATE.delete(emailKey(loginState))
    // The login intent is still alive, so offer a new code here rather than
    // sending the user back to the terminal to restart the whole flow.
    return loginPage(c, loginState, "Too many wrong codes. Request a new one.", 429, lead)
  }
  await c.env.STATE.put(emailKey(loginState), JSON.stringify({ ...challenge, expiresAt }), {
    expirationTtl: remainingTtl(expiresAt),
  })
  const providedHash = await sha256(`${challenge.nonce}:${code}`)
  if (!(await secureEqual(providedHash, challenge.codeHash))) {
    const left = EMAIL_CODE_MAX_ATTEMPTS - challenge.attempts
    return emailCodePage(
      c,
      loginState,
      challenge.email,
      left > 0
        ? `That code is not valid. ${left} ${left === 1 ? "try" : "tries"} left, or send a new code.`
        : "That code is not valid. Send a new code to continue.",
      400,
    )
  }

  const account = await linkAccount(c.env.DB, "email", challenge.email, challenge.email)
  return completeOrOfferPasskey(c, loginState, account.id)
}

export async function beginDeviceApproval(c: AppContext): Promise<Response> {
  const form = await readForm(c.req.raw)
  const submitted = form.get("user_code") ?? ""
  const decision = form.get("decision")
  if (decision !== "approve" && decision !== "deny") throw new HttpError(400, "invalid decision")

  const formatted = normalizeUserCode(submitted)
  // Keep whatever digits the user typed in the field so a mistyped code is a
  // one-character correction instead of a retype from the terminal.
  if (!formatted) {
    return devicePage(c, digitsOnly(submitted).slice(0, 8), "Enter the eight digits shown in your CADCAMFUN app.", 400)
  }

  const rate = await consumeRateLimit(
    c.env.STATE,
    "device-approve",
    requestIP(c.req.raw),
    DEVICE_APPROVAL_LIMIT,
    DEVICE_APPROVAL_WINDOW_SECONDS,
  )
  if (!rate.allowed) {
    c.header("Retry-After", String(rate.retryAfter))
    return devicePage(c, formatted, `Too many attempts. Try again in ${formatDuration(rate.retryAfter)}.`, 429)
  }

  const row = await getDeviceByUserCode(c.env.DB, formatted)
  // Every branch below used to collapse into one "Invalid device code" dead
  // end with no form to retry on — including the case where the code had
  // already been approved by this very browser.
  if (!row) {
    return devicePage(c, formatted, "That code does not match a waiting terminal. Check it and try again.", 400)
  }
  if (row.status === "approved" || row.status === "consumed") {
    return resultPage(c, "Device already connected", "This code was already approved. Return to your CADCAMFUN app.")
  }
  if (row.status === "denied") {
    return resultPage(c, "Device denied", "This code was already denied. Start sign-in again in your CADCAMFUN app.", 400)
  }
  if (row.expires_at <= Date.now()) {
    return devicePage(c, "", "That code expired. Start sign-in again in your CADCAMFUN app to get a new one.", 400)
  }

  if (decision === "deny") {
    await setDeviceDecision(c.env.DB, formatted, "denied", null, Date.now())
    return resultPage(c, "Device denied", "The terminal was not authorized.")
  }
  const loginState = await createLoginState(c.env, {
    kind: "device",
    userCode: formatted,
  })
  return loginPage(c, loginState, undefined, 200, DEVICE_LEAD)
}
