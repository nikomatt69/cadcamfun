import { describe, expect, test } from "bun:test"
import app from "../src/index.ts"
import { isAllowedRedirect } from "../src/constants.ts"
import { randomDigits, secureEqual, sha256 } from "../src/crypto.ts"

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

function fakeDb() {
  return {
    prepare(sql: string) {
      let values: unknown[] = []
      return {
        bind(...input: unknown[]) {
          values = input
          return this
        },
        async run() {
          // Issuing a device code first clears the expired rows whose
          // `user_code` would otherwise stay reserved forever.
          if (sql.includes("DELETE FROM device_codes")) {
            expect(values).toHaveLength(1)
            return { success: true, meta: { changes: 0 } }
          }
          if (!sql.includes("INSERT OR IGNORE INTO device_codes")) throw new Error(`Unexpected SQL: ${sql}`)
          expect(values).toHaveLength(9)
          return { success: true, meta: { changes: 1 } }
        },
      }
    },
  } as D1Database
}

function env(overrides: Partial<Env> = {}): Env {
  const send = async (_message: EmailMessage | Parameters<SendEmail["send"]>[0]) => ({ messageId: "test-message" })
  return {
    ISSUER: "https://auth.cadcam.fun",
    AUDIENCE: "cadcamfun-api",
    EMAIL_SENDER: "auth@cadcam.fun",
    STATE: fakeState(),
    DB: fakeDb(),
    EMAIL: { send },
    ...overrides,
  } as Env
}

describe("identity contracts", () => {
  test("publishes OAuth and cadcamfun discovery", async () => {
    const oauth = await app.fetch(
      new Request("https://auth.cadcam.fun/.well-known/oauth-authorization-server"),
      env(),
    )
    expect(oauth.status).toBe(200)
    const metadata = (await oauth.json()) as {
      issuer: string
      code_challenge_methods_supported: string[]
    }
    expect(metadata.issuer).toBe("https://auth.cadcam.fun")
    expect(metadata.code_challenge_methods_supported).toEqual(["S256"])

    const cadcamfun = await app.fetch(new Request("https://auth.cadcam.fun/.well-known/cadcamfun"), env())
    const discovery = (await cadcamfun.json()) as {
      auth: { command: string[]; env: string }
    }
    expect(discovery.auth.command[0]).toBe("curl")
    expect(discovery.auth.env).toBe("CADCAMFUN_ACCOUNT_URL")
  })

  test("requires PKCE S256 and registered redirects", async () => {
    const invalid = await app.fetch(
      new Request(
        "https://auth.cadcam.fun/authorize?response_type=code&client_id=cadcamfun-desktop&redirect_uri=https%3A%2F%2Fattacker.test%2Fcallback&state=s&code_challenge=x&code_challenge_method=plain",
      ),
      env(),
    )
    expect(invalid.status).toBe(400)

    const verifier = "a".repeat(43)
    const validUrl = new URL("https://auth.cadcam.fun/authorize")
    validUrl.search = new URLSearchParams({
      response_type: "code",
      client_id: "cadcamfun-desktop",
      redirect_uri: "http://127.0.0.1:4321/callback",
      state: "opaque-state",
      code_challenge: verifier,
      code_challenge_method: "S256",
    }).toString()
    const valid = await app.fetch(new Request(validUrl), env())
    expect(valid.status).toBe(200)
    const login = await valid.text()
    expect(login).toContain("Email me a code")
    expect(login).toContain("Continue with passkey")
    expect(login).toContain("your account will be created automatically after verification")
  })

  test("returns the shipped CLI device-code response shape", async () => {
    const response = await app.fetch(
      new Request("https://auth.cadcam.fun/oauth/device/code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_id: "cadcamfun-desktop",
          scope: "openid profile email offline_access",
        }),
      }),
      env(),
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(typeof body.device_code).toBe("string")
    expect(body.user_code).toMatch(/^\d{4}-\d{4}$/)
    expect(body.verification_url).toBe("https://auth.cadcam.fun/device")
    // The name RFC 8628 defines, alongside the one cadcamfun's own clients read.
    expect(body.verification_uri).toBe("https://auth.cadcam.fun/device")
    expect(body.interval).toBe(5)
    // Allow time to receive the email and optionally enroll a passkey.
    expect(body.expires_in).toBe(1200)
  })

  // The metadata document advertises this route as `device_authorization_endpoint`,
  // and RFC 8628 specifies that request as form-encoded. Reading JSON only
  // answered a conformant client with a bare 415.
  test("accepts a form-encoded device authorization request", async () => {
    const response = await app.fetch(
      new Request("https://auth.cadcam.fun/oauth/device/code", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: "cadcamfun-desktop" }),
      }),
      env(),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body.user_code).toMatch(/^\d{4}-\d{4}$/)
    expect(body.verification_uri).toBe("https://auth.cadcam.fun/device")
  })

  test("still rejects an unknown client on a form-encoded request", async () => {
    const response = await app.fetch(
      new Request("https://auth.cadcam.fun/oauth/device/code", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: "not-a-cadcamfun-client" }),
      }),
      env(),
    )

    expect(response.status).toBe(400)
  })

  test("redraws the user code when the generated one is already taken", async () => {
    // `device_codes.user_code` is UNIQUE and rows outlive their expiry, so a
    // freshly drawn eight-digit code can collide with one issued long ago. The
    // plain INSERT turned that into a 500 and "Failed to start device code
    // flow" in the terminal; the redraw is what keeps it a non-event.
    const attempted: string[] = []
    const db = {
      prepare(sql: string) {
        let values: unknown[] = []
        return {
          bind(...input: unknown[]) {
            values = input
            return this
          },
          async run() {
            if (sql.includes("DELETE FROM device_codes")) return { success: true, meta: { changes: 0 } }
            attempted.push(values[1] as string)
            // Refuse the first draw exactly as a UNIQUE conflict would.
            return { success: true, meta: { changes: attempted.length === 1 ? 0 : 1 } }
          },
        }
      },
    } as unknown as D1Database

    const response = await app.fetch(
      new Request("https://auth.cadcam.fun/oauth/device/code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_id: "cadcamfun-desktop" }),
      }),
      env({ DB: db }),
    )

    expect(response.status).toBe(200)
    expect(attempted).toHaveLength(2)
    expect(attempted[0]).not.toBe(attempted[1])
    const body = (await response.json()) as Record<string, unknown>
    expect(body.user_code).toBe(attempted[1])
  })

  test("reports a device code it could not allocate instead of failing opaquely", async () => {
    const db = {
      prepare(sql: string) {
        return {
          bind() {
            return this
          },
          async run() {
            if (sql.includes("DELETE FROM device_codes")) return { success: true, meta: { changes: 0 } }
            return { success: true, meta: { changes: 0 } }
          },
        }
      },
    } as unknown as D1Database

    const response = await app.fetch(
      new Request("https://auth.cadcam.fun/oauth/device/code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_id: "cadcamfun-desktop" }),
      }),
      env({ DB: db }),
    )

    expect(response.status).toBe(503)
    expect((await response.json()) as Record<string, unknown>).toMatchObject({ error: "temporarily_unavailable" })
  })

  /**
   * A user who has just clicked "Approve device" is not finished, and the page
   * they land on has to say so — closing it there is what leaves a terminal
   * polling a code nobody will approve.
   */
  test("tells a device approval that the terminal is not connected yet", async () => {
    const db = {
      prepare() {
        return {
          bind() {
            return this
          },
          async first() {
            return {
              device_code_hash: "hash",
              user_code: "1234-5678",
              client_id: "cadcamfun-desktop",
              scope: "openid",
              status: "pending",
              account_id: null,
              expires_at: Date.now() + 60_000,
              last_poll_at: null,
              created_at: Date.now(),
            }
          },
          async run() {
            return { success: true, meta: { changes: 1 } }
          },
        }
      },
    } as unknown as D1Database

    const response = await app.fetch(
      new Request("https://auth.cadcam.fun/device", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ user_code: "1234-5678", decision: "approve" }).toString(),
      }),
      env({ DB: db }),
    )

    expect(response.status).toBe(200)
    const page = await response.text()
    expect(page).toContain("Your CADCAMFUN app is not connected yet")
    expect(page).toContain("Email me a code")
    expect(page).not.toContain("Continue with GitHub")
    // The generic headline would read as an unrelated detour here.
    expect(page).not.toContain("Sign in or create an account")
  })
})

describe("identity security helpers", () => {
  test("uses registered exact redirects with safe loopback development", () => {
    expect(isAllowedRedirect("cadcamfun-desktop", "http://127.0.0.1:4321/callback")).toBe(true)
    expect(isAllowedRedirect("cadcamfun-mobile", "https://attacker.test/user/callback")).toBe(false)
    expect(isAllowedRedirect("cadcamfun-mobile", "cadcamfun://auth/callback")).toBe(true)
  })

  test("generates unbiased decimal codes and compares fixed hashes", async () => {
    expect(randomDigits(64)).toMatch(/^\d{64}$/)
    const hash = await sha256("value")
    expect(await secureEqual(hash, hash)).toBe(true)
    expect(await secureEqual(await sha256("other"), hash)).toBe(false)
  })
})

describe("Content Security Policy", () => {
  // The login / email / device / result pages must lock down anything that can
  // exfiltrate data (img-src, font-src, frame-src, …) while still letting
  // browser extensions and userscripts run their own scripts on the page.
  // Without `script-src 'unsafe-inline'`, password managers and the cadcamfun TUI
  // webview hit "Refused to execute a script" console errors. The issuer
  // origin is also permitted in `script-src` so Cloudflare's
  // "challenge-platform" managed challenge / Turnstile can load. The matching
  // `connect-src 'self'` lets the challenge round-trip its solved token back
  // to the issuer origin via `fetch` — without it, Cloudflare's challenge
  // POSTs hit "Refused to connect".
  // WebAuthn reports "you dismissed the prompt" and "this device holds no
  // passkey for us" as the same NotAllowedError, on purpose, so a site cannot
  // probe which credentials exist. Returning early on it left a phone whose
  // passkey lives in another vendor's keychain — an iCloud passkey opened on
  // Android — with a button that did nothing and said nothing.
  test("the sign-in page answers a NotAllowedError instead of swallowing it", async () => {
    const authUrl =
      "https://auth.cadcam.fun/authorize?response_type=code" +
      "&client_id=cadcamfun-desktop" +
      "&redirect_uri=http%3A%2F%2F127.0.0.1%3A4321%2Fcallback" +
      "&state=opaque&code_challenge=" +
      "a".repeat(43) +
      "&code_challenge_method=S256"
    const html = await (await app.fetch(new Request(authUrl), env())).text()

    // The old shape: NotAllowedError shared AbortError's bare `return`.
    expect(html).not.toMatch(/NotAllowedError"\s*\|\|\s*name === "AbortError"\) return/)
    expect(html).toMatch(/name === "NotAllowedError"/)
    // Whatever it says must name the two ways forward the page still offers.
    const branch = html.slice(html.indexOf('name === "NotAllowedError"'))
    expect(branch.slice(0, 700)).toMatch(/email code/)
    // ...and must not be dressed as a failure: `.notice` alone renders red.
    expect(html).toMatch(/notice hint/)
    expect(html).toMatch(/\.notice\.hint\{/)
  })

  test("HTML pages carry a strict CSP that allows inline scripts, the issuer origin, and self-fetch", async () => {
    const authUrl =
      "https://auth.cadcam.fun/authorize?response_type=code" +
      "&client_id=cadcamfun-desktop" +
      "&redirect_uri=http%3A%2F%2F127.0.0.1%3A4321%2Fcallback" +
      "&state=opaque&code_challenge=" +
      "a".repeat(43) +
      "&code_challenge_method=S256"
    const response = await app.fetch(new Request(authUrl), env())
    expect(response.status).toBe(200)
    const csp = response.headers.get("Content-Security-Policy") ?? ""
    expect(csp).toMatch(/default-src 'none'/)
    expect(csp).toMatch(/script-src 'unsafe-inline' https:\/\/auth\.cadcam\.fun/)
    expect(csp).toMatch(/style-src 'nonce-/)
    expect(csp).toMatch(/connect-src 'self'/)
    expect(csp).toMatch(/form-action 'self'/)
    expect(csp).toMatch(/base-uri 'none'/)
    expect(csp).toMatch(/frame-ancestors 'none'/)
    // No directive should grant a *third-party* network endpoint for fetch.
    expect(csp).not.toMatch(/connect-src[^;]*https?:\/\//)
  })

  test("error pages carry the same CSP as the login page", async () => {
    const response = await app.fetch(new Request("https://auth.cadcam.fun/login/passkey/offer?login_state=missing"), env())
    expect(response.status).toBe(400)
    const csp = response.headers.get("Content-Security-Policy") ?? ""
    expect(csp).toContain("https://auth.cadcam.fun")
    expect(csp).toContain("connect-src 'self'")
    expect(csp).toContain("default-src 'none'")
  })

  test("Staging uses its own origin in the CSP allowlist", async () => {
    const response = await app.fetch(
      new Request(
        "https://dev.auth.cadcam.fun/authorize?response_type=code" +
          "&client_id=cadcamfun-desktop" +
          "&redirect_uri=http%3A%2F%2F127.0.0.1%3A4321%2Fcallback" +
          "&state=opaque&code_challenge=" +
          "a".repeat(43) +
          "&code_challenge_method=S256",
      ),
      env({ ISSUER: "https://dev.auth.cadcam.fun" }),
    )
    expect(response.status).toBe(200)
    const csp = response.headers.get("Content-Security-Policy") ?? ""
    expect(csp).toMatch(/script-src 'unsafe-inline' https:\/\/dev\.auth\.cadcam\.fun/)
    expect(csp).toMatch(/connect-src 'self'/)
  })
})

