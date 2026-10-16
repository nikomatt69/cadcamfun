import { afterEach, describe, expect, test } from "bun:test"
import app from "../src/index.ts"
import { EMAIL_CODE_IP_LIMIT } from "../src/constants.ts"
import { memoryD1, type MemoryD1 } from "./support/d1.ts"

type SentEmail = { to: string; subject: string; text: string }

function fakeState() {
  const values = new Map<string, string>()
  return {
    async get(key: string, type?: string) {
      const value = values.get(key) ?? null
      return type === "json" && value ? JSON.parse(value) : value
    },
    async put(key: string, value: string) {
      values.set(key, value)
    },
    async delete(key: string) {
      values.delete(key)
    },
  } as KVNamespace
}

function harness() {
  const sent: SentEmail[] = []
  const db = memoryD1()
  const env = {
    ISSUER: "https://auth.cadcam.fun",
    AUDIENCE: "cadcamfun-api",
    EMAIL_SENDER: "auth@cadcam.fun",
    STATE: fakeState(),
    DB: db,
    EMAIL: {
      async send(message: SentEmail) {
        sent.push(message)
        return { messageId: "test-message" }
      },
    },
  } as unknown as Env

  const fetch = (request: Request) => Promise.resolve(app.fetch(request, env))

  const postForm = (path: string, form: Record<string, string>) =>
    fetch(
      new Request(`https://auth.cadcam.fun${path}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": "203.0.113.7" },
        body: new URLSearchParams(form).toString(),
      }),
    )

  const postJSON = (path: string, body: Record<string, unknown>) =>
    fetch(
      new Request(`https://auth.cadcam.fun${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7" },
        body: JSON.stringify(body),
      }),
    )

  const get = (path: string) => fetch(new Request(`https://auth.cadcam.fun${path}`))

  async function startDevice() {
    const response = await fetch(
      new Request("https://auth.cadcam.fun/oauth/device/code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_id: "cadcamfun-desktop", scope: "openid profile email offline_access" }),
      }),
    )
    return (await response.json()) as { device_code: string; user_code: string }
  }

  return { env, sent, db, postForm, postJSON, get, startDevice }
}

function loginStateOf(html: string): string {
  const match = html.match(/name="login_state" value="([^"]+)"/)
  if (!match) throw new Error(`no login_state in page: ${html.slice(0, 200)}`)
  return match[1]!
}

function codeOf(email: SentEmail): string {
  return email.subject.split(" ", 1)[0]!
}

const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

function authorizePath() {
  const url = new URL("https://auth.cadcam.fun/authorize")
  url.searchParams.set("client_id", "cadcamfun-mobile")
  url.searchParams.set("redirect_uri", "cadcamfun://auth/callback")
  url.searchParams.set("response_type", "code")
  url.searchParams.set("state", "client-state")
  url.searchParams.set("code_challenge", CHALLENGE)
  url.searchParams.set("code_challenge_method", "S256")
  return url.pathname + url.search
}

async function reachEmailOffer(kit: ReturnType<typeof fixture>, kind: "device" | "authorize" = "device") {
  let loginState: string
  if (kind === "authorize") {
    loginState = loginStateOf(await kit.get(authorizePath()).then((r) => r.text()))
  } else {
    const device = await kit.startDevice()
    const page = await kit
      .postForm("/device", { user_code: device.user_code, decision: "approve" })
      .then((r) => r.text())
    loginState = loginStateOf(page)
  }
  await kit.postForm("/login/email/request", { login_state: loginState, email: "user@example.com" })
  const offered = await kit.postForm("/login/email/verify", {
    login_state: loginState,
    code: codeOf(kit.sent[0]!),
  })
  expect(offered.status).toBe(200)
  expect(await offered.text()).toContain("Save a passkey")
  return { loginState }
}

let open: MemoryD1[] = []
afterEach(() => {
  for (const db of open) db.close()
  open = []
})

function fixture() {
  const kit = harness()
  open.push(kit.db)
  return kit
}

describe("passkey authentication options", () => {
  test("returns 400 without login_state or with an expired session", async () => {
    const kit = fixture()
    const missing = await kit.postJSON("/login/passkey/authentication/options", {})
    expect(missing.status).toBe(400)

    const expired = await kit.postJSON("/login/passkey/authentication/options", { login_state: "never-issued" })
    expect(expired.status).toBe(400)
    const body = (await expired.json()) as { error_description?: string }
    expect(body.error_description).toMatch(/session expired/i)
  })

  test("returns 200 with a challenge for a valid login_state", async () => {
    const kit = fixture()
    const loginState = loginStateOf(await kit.get(authorizePath()).then((r) => r.text()))
    const response = await kit.postJSON("/login/passkey/authentication/options", { login_state: loginState })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { challenge?: unknown; rpId?: unknown }
    expect(typeof body.challenge).toBe("string")
    expect((body.challenge as string).length).toBeGreaterThan(8)
    expect(body.rpId).toBe("auth.cadcam.fun")
  })

})

describe("passkey skip after first-factor offer", () => {
  test("skip after offer completes a device login", async () => {
    const kit = fixture()
    const { loginState } = await reachEmailOffer(kit, "device")
    const skipped = await kit.postForm("/login/passkey/skip", { login_state: loginState })
    expect(skipped.status).toBe(200)
    expect(await skipped.text()).toContain("Device connected")
  })

  test("skip after offer completes an authorize login", async () => {
    const kit = fixture()
    const { loginState } = await reachEmailOffer(kit, "authorize")
    const skipped = await kit.postForm("/login/passkey/skip", { login_state: loginState })
    expect(skipped.status).toBe(302)
    const location = new URL(skipped.headers.get("Location")!)
    expect(location.protocol).toBe("cadcamfun:")
    expect(location.searchParams.get("state")).toBe("client-state")
    expect(location.searchParams.get("code")).toBeTruthy()
  })
})

describe("passkey enrollment edge cases", () => {
  /**
   * The offer page renders *after* the account is verified, so the only thing
   * it can still cost the user is the sign-in itself. The separate `login:`
   * entry lapsing while they read the prompt used to do exactly that.
   */
  test("skip still finishes when the login intent lapsed on the offer page", async () => {
    const kit = fixture()
    const { loginState } = await reachEmailOffer(kit, "device")
    // What an expired KV entry looks like to the next request.
    await kit.env.STATE.delete(`login:${loginState}`)

    const skipped = await kit.postForm("/login/passkey/skip", { login_state: loginState })
    expect(skipped.status).toBe(200)
    expect(await skipped.text()).toContain("Device connected")
  })

  test("enrollment still opens when the login intent lapsed on the offer page", async () => {
    const kit = fixture()
    const { loginState } = await reachEmailOffer(kit, "authorize")
    await kit.env.STATE.delete(`login:${loginState}`)

    const options = await kit.postJSON("/login/passkey/registration/options", { login_state: loginState })
    expect(options.status).toBe(200)
    const body = (await options.json()) as { authenticatorSelection?: Record<string, unknown> }
    // No attachment pin: a security key or a phone over hybrid transport has to
    // be allowed, or a machine without Touch ID/Hello can never enroll at all.
    expect(body.authenticatorSelection?.authenticatorAttachment).toBeUndefined()
    expect(body.authenticatorSelection?.residentKey).toBe("required")
  })

  test("offers a device approval a confirmation that survives a reload", async () => {
    const kit = fixture()
    const connected = await kit.get("/device/connected")
    expect(connected.status).toBe(200)
    expect(await connected.text()).toContain("Device connected")
  })

  test("a second skip replays the first instead of expiring", async () => {
    const kit = fixture()
    const { loginState } = await reachEmailOffer(kit, "device")
    expect((await kit.postForm("/login/passkey/skip", { login_state: loginState })).status).toBe(200)

    const again = await kit.postForm("/login/passkey/skip", { login_state: loginState })
    expect(again.status).toBe(200)
    expect(await again.text()).toContain("Device connected")
  })

  /**
   * An error must not cancel the context: a device approval that mistypes its
   * email still has a terminal waiting on this tab.
   */
  test("keeps the device context on an email error", async () => {
    const kit = fixture()
    const device = await kit.startDevice()
    const approved = await kit.postForm("/device", { user_code: device.user_code, decision: "approve" })
    const loginState = loginStateOf(await approved.text())

    const rejected = await kit.postForm("/login/email/request", { login_state: loginState, email: "not-an-email" })
    const page = await rejected.text()
    expect(page).toContain("Enter a valid email address")
    expect(page).toContain("Your CADCAMFUN app is not connected yet")
    expect(page).toContain("One more step")
    expect(page).not.toContain("Sign in or create an account")
  })

  test("an authorize flow keeps its own copy on the same error", async () => {
    const kit = fixture()
    const loginState = loginStateOf(await kit.get(authorizePath()).then((r) => r.text()))
    const page = await kit
      .postForm("/login/email/request", { login_state: loginState, email: "not-an-email" })
      .then((r) => r.text())
    expect(page).toContain("Enter a valid email address")
    expect(page).toContain("Sign in or create an account")
    expect(page).not.toContain("Your CADCAMFUN app is not connected yet")
  })

  /**
   * The per-address budgets bound what one mailbox receives and nothing else.
   * Varying the address was unlimited, and what comes out is mail signed by the
   * issuer's own domain.
   */
  test("caps sign-in codes per network across different addresses", async () => {
    const kit = fixture()
    let sent = 0
    let limited = 0
    for (let i = 0; i < EMAIL_CODE_IP_LIMIT + 3; i++) {
      const loginState = loginStateOf(await kit.get(authorizePath()).then((r) => r.text()))
      const response = await kit.postForm("/login/email/request", {
        login_state: loginState,
        email: `person-${i}@example.com`,
      })
      if (response.status === 429) {
        limited++
        expect(await response.text()).toContain("from this network")
      } else {
        sent++
      }
    }
    expect(sent).toBe(EMAIL_CODE_IP_LIMIT)
    expect(limited).toBe(3)
    expect(kit.sent).toHaveLength(EMAIL_CODE_IP_LIMIT)
  })

  test("refuses enrollment for a login_state that never had an offer", async () => {
    const kit = fixture()
    const loginState = loginStateOf(await kit.get(authorizePath()).then((r) => r.text()))
    const options = await kit.postJSON("/login/passkey/registration/options", { login_state: loginState })
    expect(options.status).toBe(400)
    expect(((await options.json()) as { error_description?: string }).error_description).toMatch(/not available/i)
  })
})

describe("passkey offer for the configured issuer", () => {
  async function emailSignIn(kit: ReturnType<typeof fixture>) {
    const loginState = loginStateOf(await kit.get(authorizePath()).then((r) => r.text()))
    await kit.postForm("/login/email/request", { login_state: loginState, email: "user@example.com" })
    const response = await kit.postForm("/login/email/verify", {
      login_state: loginState,
      code: codeOf(kit.sent.at(-1)!),
    })
    return { loginState, response }
  }

  async function savePasskey(kit: ReturnType<typeof fixture>, credentialID: string, rpID: string | null) {
    const account = await kit.db
      .prepare("SELECT id FROM accounts WHERE email = ?")
      .bind("user@example.com")
      .first<{ id: string }>()
    await kit.db
      .prepare(
        "INSERT INTO passkeys (id, account_id, credential_id, public_key, user_handle, created_at, rp_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(`pk_${credentialID}`, account!.id, credentialID, "key", account!.id, Date.now(), rpID)
      .run()
  }

  test("offers a passkey when the saved credential belongs to another host", async () => {
    const kit = fixture()
    const first = await emailSignIn(kit)
    expect(await first.response.text()).toContain("Save a passkey")
    await kit.postForm("/login/passkey/skip", { login_state: first.loginState })

    await savePasskey(kit, "other-host-cred", "auth.other.test")
    const second = await emailSignIn(kit)
    expect(second.response.status).toBe(200)
    expect(await second.response.text()).toContain("Save a passkey")
  })

  test("completes without an offer once the account has a passkey for the current host", async () => {
    const kit = fixture()
    const first = await emailSignIn(kit)
    await kit.postForm("/login/passkey/skip", { login_state: first.loginState })

    await savePasskey(kit, "current-cred", "auth.cadcam.fun")
    const second = await emailSignIn(kit)
    expect(second.response.status).toBe(302)
    expect(second.response.headers.get("location")).toStartWith("cadcamfun://auth/callback?")
  })

  test("serves a stored offer and answers a missing one like a stale sign-in", async () => {
    const kit = fixture()
    const { loginState } = await emailSignIn(kit)
    const offered = await kit.get(`/login/passkey/offer?login_state=${encodeURIComponent(loginState)}`)
    expect(offered.status).toBe(200)
    expect(await offered.text()).toContain("Save a passkey")

    const missing = await kit.get("/login/passkey/offer?login_state=never-issued")
    expect(missing.status).toBe(400)
    expect(await missing.text()).toContain("Session expired")
  })
})

describe("passkey authentication verify", () => {
  test("returns 400 for a junk credential", async () => {
    const kit = fixture()
    const loginState = loginStateOf(await kit.get(authorizePath()).then((r) => r.text()))
    const options = await kit.postJSON("/login/passkey/authentication/options", { login_state: loginState })
    expect(options.status).toBe(200)

    const response = await kit.postJSON("/login/passkey/authentication/verify", {
      login_state: loginState,
      credential: { id: "not-a-real-credential", type: "public-key", response: {} },
    })
    expect(response.status).toBe(400)
  })
})
