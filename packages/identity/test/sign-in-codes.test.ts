import { afterEach, describe, expect, test } from "bun:test"
import app from "../src/index.ts"
import { normalizeUserCode } from "../src/login.ts"
import { memoryD1, type MemoryD1 } from "./support/d1.ts"

/**
 * End-to-end coverage for the two codes a user actually types: the 8-digit
 * device code that connects a terminal, and the 6-digit code emailed to them.
 * Every case here is a shape a real user hands us — pasted with a space,
 * submitted twice by an autofill race, mistyped once before getting it right.
 */

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

  const post = (path: string, form: Record<string, string>, ip = "203.0.113.7") =>
    fetch(
      new Request(`https://auth.cadcam.fun${path}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": ip },
        body: new URLSearchParams(form).toString(),
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
    return (await response.json()) as { device_code: string; user_code: string; verification_uri_complete: string }
  }

  const pollDevice = async (deviceCode: string) => {
    const response = await fetch(
      new Request("https://auth.cadcam.fun/oauth/device/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_id: "cadcamfun-desktop", device_code: deviceCode }),
      }),
    )
    return (await response.json()) as { status: string }
  }

  return { env, sent, db, post, get, startDevice, pollDevice }
}

function loginStateOf(html: string): string {
  const match = html.match(/name="login_state" value="([^"]+)"/)
  if (!match) throw new Error(`no login_state in page: ${html.slice(0, 200)}`)
  return match[1]!
}

async function completeEmailSignIn(kit: ReturnType<typeof fixture>, loginState: string, code: string) {
  const offered = await kit.post("/login/email/verify", { login_state: loginState, code })
  expect(offered.status).toBe(200)
  expect(await offered.text()).toContain("Save a passkey")
  return kit.post("/login/passkey/skip", { login_state: loginState })
}

/** The emailed code lives in the subject line: "123456 is your CADCAMFUN sign-in code". */
function codeOf(email: SentEmail): string {
  return email.subject.split(" ", 1)[0]!
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

describe("device code entry", () => {
  test("accepts the code however the user pastes it", async () => {
    for (const typed of ["12345678", "1234-5678", "1234 5678", " 1234–5678 "]) {
      const kit = fixture()
      const { user_code } = await kit.startDevice()
      const digits = user_code.replace("-", "")
      let position = 0
      const shaped = typed.replace(/\d/g, () => digits[position++]!)
      const response = await kit.post("/device", { user_code: shaped, decision: "approve" })
      expect(response.status).toBe(200)
      // Reached the identity picker, which is the step after the code matched.
      expect(await response.text()).toContain("Email me a code")
    }
  })

  test("keeps the typed digits and a retry form when the code does not match", async () => {
    const kit = fixture()
    const response = await kit.post("/device", { user_code: "0000-0001", decision: "approve" })
    expect(response.status).toBe(400)
    const body = await response.text()
    expect(body).toContain("does not match a waiting terminal")
    // The old dead-end page had no form at all: the only way out was the terminal.
    expect(body).toContain('name="user_code"')
    expect(body).toContain('value="0000-0001"')
  })

  test("tells a returning browser the device is already connected", async () => {
    const kit = fixture()
    const { user_code } = await kit.startDevice()
    const page = await kit.post("/device", { user_code, decision: "approve" }).then((r) => r.text())
    const loginState = loginStateOf(page)
    await kit.post("/login/email/request", { login_state: loginState, email: "user@example.com" })
    await completeEmailSignIn(kit, loginState, codeOf(kit.sent[0]!))

    const again = await kit.post("/device", { user_code, decision: "approve" })
    expect(again.status).toBe(200)
    expect(await again.text()).toContain("Device already connected")
  })

  test("prefills the device page from a shared verification link", async () => {
    const kit = fixture()
    const { user_code } = await kit.startDevice()
    const page = await kit.get(`/device?user_code=${user_code.replace("-", "")}`).then((r) => r.text())
    expect(page).toContain(`value="${user_code}"`)
  })

  test("rate-limits brute-forced approvals per IP without losing the form", async () => {
    const kit = fixture()
    let last = await kit.post("/device", { user_code: "0000-0001", decision: "approve" })
    for (let attempt = 0; attempt < 14; attempt++) {
      last = await kit.post("/device", { user_code: "0000-0001", decision: "approve" })
    }
    expect(last.status).toBe(429)
    expect(last.headers.get("Retry-After")).not.toBeNull()
    expect(await last.text()).toContain("Too many attempts")
  })
})

describe("emailed verification code", () => {
  async function reachCodePage(kit: ReturnType<typeof fixture>, email = "user@example.com") {
    const device = await kit.startDevice()
    const page = await kit.post("/device", { user_code: device.user_code, decision: "approve" }).then((r) => r.text())
    const loginState = loginStateOf(page)
    const codePage = await kit.post("/login/email/request", { login_state: loginState, email }).then((r) => r.text())
    return { device, loginState, codePage }
  }

  test("verifies a code pasted with separators and completes the device login", async () => {
    const kit = fixture()
    const { device, loginState } = await reachCodePage(kit)
    const code = codeOf(kit.sent[0]!)

    const response = await completeEmailSignIn(kit, loginState, `${code.slice(0, 3)} ${code.slice(3)}\n`)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain("Device connected")

    // The terminal that started the flow now gets its tokens.
    expect(await kit.pollDevice(device.device_code)).toMatchObject({ status: "success" })
  })

  test("offers a resend without retyping the address", async () => {
    const kit = fixture()
    const { codePage } = await reachCodePage(kit)
    expect(codePage).toContain('action="/login/email/request"')
    expect(codePage).toContain('value="user@example.com"')
    expect(codePage).toContain("Send a new code")
  })

  test("does not spend an attempt on an empty or half-typed code", async () => {
    const kit = fixture()
    const { loginState } = await reachCodePage(kit)
    const code = codeOf(kit.sent[0]!)

    for (let attempt = 0; attempt < 8; attempt++) {
      const partial = await kit.post("/login/email/verify", { login_state: loginState, code: "12" })
      expect(partial.status).toBe(400)
      expect(await partial.text()).toContain("Enter the six digits")
    }

    const response = await completeEmailSignIn(kit, loginState, code)
    expect(await response.text()).toContain("Device connected")
  })

  test("counts down the real attempts and then offers a fresh code", async () => {
    const kit = fixture()
    const { loginState } = await reachCodePage(kit)
    const wrong = codeOf(kit.sent[0]!) === "000000" ? "111111" : "000000"

    const first = await kit.post("/login/email/verify", { login_state: loginState, code: wrong })
    expect(await first.text()).toContain("4 tries left")

    // Five wrong codes are allowed; the sixth burns the challenge.
    for (let attempt = 0; attempt < 4; attempt++) {
      await kit.post("/login/email/verify", { login_state: loginState, code: wrong })
    }
    const exhausted = await kit.post("/login/email/verify", { login_state: loginState, code: wrong })
    expect(exhausted.status).toBe(429)
    const body = await exhausted.text()
    expect(body).toContain("Too many wrong codes")
    // Still on a page that can send another code, not a terminal-only dead end.
    expect(body).toContain('action="/login/email/request"')
  })

  test("replays the success page when the same code is submitted twice", async () => {
    const kit = fixture()
    const { loginState } = await reachCodePage(kit)
    const code = codeOf(kit.sent[0]!)

    const first = await completeEmailSignIn(kit, loginState, code)
    expect(await first.text()).toContain("Device connected")

    // An OTP autofill plus a manual tap sends this twice; the second used to
    // report "Code expired" over an already-successful sign-in.
    const second = await kit.post("/login/email/verify", { login_state: loginState, code })
    expect(second.status).toBe(200)
    expect(await second.text()).toContain("Device connected")
  })

  test("keeps an unused code usable while the sender is throttled", async () => {
    const kit = fixture()
    const { loginState } = await reachCodePage(kit)
    for (let attempt = 0; attempt < 3; attempt++) {
      await kit.post("/login/email/request", { login_state: loginState, email: "user@example.com" })
    }
    const throttled = await kit.post("/login/email/request", {
      login_state: loginState,
      email: "user@example.com",
    })
    expect(throttled.status).toBe(429)
    const body = await throttled.text()
    expect(body).toContain("Enter the code you already received")
    expect(body).toContain('name="code"')

    const code = codeOf(kit.sent.at(-1)!)
    const verified = await completeEmailSignIn(kit, loginState, code)
    expect(await verified.text()).toContain("Device connected")
  })

  test("stays on the login page when the mail cannot be sent", async () => {
    const kit = fixture()
    const device = await kit.startDevice()
    const page = await kit.post("/device", { user_code: device.user_code, decision: "approve" }).then((r) => r.text())
    const loginState = loginStateOf(page)
    ;(kit.env as unknown as { EMAIL: { send: () => Promise<never> } }).EMAIL = {
      send: () => Promise.reject(new Error("mailbox unavailable")),
    }

    const response = await kit.post("/login/email/request", {
      login_state: loginState,
      email: "user@example.com",
    })
    expect(response.status).toBe(502)
    const body = await response.text()
    expect(body).toContain("could not send the code")
    expect(body).toContain("Email me a code")
  })
})

describe("PKCE clients (mobile, desktop, web, console)", () => {
  // These clients never touch the device flow — they open /authorize in a
  // browser and land on the very same email-code page the CLI's browser step
  // uses, so every fix to that page has to keep their redirect intact.
  const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

  function authorizeUrl(clientID: string, redirectURI: string) {
    const url = new URL("https://auth.cadcam.fun/authorize")
    url.searchParams.set("client_id", clientID)
    url.searchParams.set("redirect_uri", redirectURI)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("state", "client-state")
    url.searchParams.set("code_challenge", CHALLENGE)
    url.searchParams.set("code_challenge_method", "S256")
    return url.toString().replace("https://auth.cadcam.fun", "")
  }

  test.each([
    ["cadcamfun-mobile", "cadcamfun://auth/callback"],
    ["cadcamfun-desktop", "http://127.0.0.1:4321/callback"],
  ])("%s completes with a code pasted the way a mail client hands it over", async (clientID, redirectURI) => {
    const kit = fixture()
    const page = await kit.get(authorizeUrl(clientID, redirectURI)).then((r) => r.text())
    const loginState = loginStateOf(page)
    await kit.post("/login/email/request", { login_state: loginState, email: "user@example.com" })
    const code = codeOf(kit.sent[0]!)

    const response = await completeEmailSignIn(kit, loginState, `${code.slice(0, 3)} ${code.slice(3)}`)
    expect(response.status).toBe(302)
    const location = new URL(response.headers.get("Location")!)
    expect(`${location.protocol}//${location.host}${location.pathname}`).toContain(redirectURI.split("?")[0])
    expect(location.searchParams.get("state")).toBe("client-state")
    expect(location.searchParams.get("code")).toBeTruthy()
  })

  test("replays the same redirect when the browser submits the code twice", async () => {
    const kit = fixture()
    const page = await kit.get(authorizeUrl("cadcamfun-mobile", "cadcamfun://auth/callback")).then((r) => r.text())
    const loginState = loginStateOf(page)
    await kit.post("/login/email/request", { login_state: loginState, email: "user@example.com" })
    const code = codeOf(kit.sent[0]!)

    const first = await completeEmailSignIn(kit, loginState, code)
    const second = await kit.post("/login/email/verify", { login_state: loginState, code })
    expect(second.status).toBe(302)
    expect(second.headers.get("Location")).toBe(first.headers.get("Location"))
  })
})

describe("normalizeUserCode", () => {
  test("reduces every plausible paste to the canonical form", () => {
    expect(normalizeUserCode("12345678")).toBe("1234-5678")
    expect(normalizeUserCode(" 1234-5678\n")).toBe("1234-5678")
    expect(normalizeUserCode("1234 5678")).toBe("1234-5678")
    expect(normalizeUserCode("1234–5678")).toBe("1234-5678")
  })

  test("rejects anything that is not eight digits", () => {
    expect(normalizeUserCode("1234567")).toBe("")
    expect(normalizeUserCode("123456789")).toBe("")
    expect(normalizeUserCode("abcdefgh")).toBe("")
    expect(normalizeUserCode("")).toBe("")
  })
})
