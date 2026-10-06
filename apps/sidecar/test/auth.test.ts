import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const post = (path: string, json: unknown = {}) => app.call(path, { method: "POST", json })
const tokenOf = (link: string) => new URL(link).searchParams.get("token")!

/** Registers a user straight in the DB through a toolpath-free route: the local profile is the only seeded user. */
const LOCAL = "local@cadcamfun.local"

describe("/api/auth/forgot-password + reset-password", () => {
  test("validates the e-mail with the legacy messages", async () => {
    expect((await post("/api/auth/forgot-password")).body).toMatchObject({ error: "Email richiesta" })
    const r = await post("/api/auth/forgot-password", { email: "nope" })
    expect(r.status).toBe(400)
    expect(r.body).toMatchObject({ error: "Email non valida", details: "Inserisci un indirizzo email valido" })
  })

  test("never reveals whether the e-mail exists", async () => {
    const r = await post("/api/auth/forgot-password", { email: "ghost@example.com" })
    expect(r.status).toBe(200)
    expect(r.body.message).toBe("Se l'email esiste nel nostro sistema, riceverai un link per resettare la password.")
    expect(r.body.debugResetLink).toBeUndefined()
  })

  test("a reset link changes the password once and validates its inputs", async () => {
    const forgot = await post("/api/auth/forgot-password", { email: ` ${LOCAL.toUpperCase()} `.trim() })
    expect(forgot.status).toBe(200)
    const token = tokenOf(forgot.body.debugResetLink)
    expect(forgot.body.debugResetLink.startsWith("http://localhost:3001/auth/reset-password?token=")).toBe(true)

    expect((await post("/api/auth/reset-password")).body).toMatchObject({ error: "Token richiesto" })
    expect((await post("/api/auth/reset-password", { token })).body).toMatchObject({ error: "Password richieste" })
    expect((await post("/api/auth/reset-password", { token, newPassword: "abcdefgh", confirmPassword: "abcdefgi" })).body)
      .toMatchObject({ error: "Password non corrispondenti" })
    expect((await post("/api/auth/reset-password", { token, newPassword: "short", confirmPassword: "short" })).body)
      .toMatchObject({ error: "Password troppo corta" })
    const bad = await post("/api/auth/reset-password", { token: "garbage", newPassword: "abcdefgh", confirmPassword: "abcdefgh" })
    expect(bad.status).toBe(400)
    expect(bad.body.error).toBe("Token non valido o scaduto")

    const done = await post("/api/auth/reset-password", { token, newPassword: "correct horse", confirmPassword: "correct horse" })
    expect(done.status).toBe(200)
    expect(done.body.user.email).toBe(LOCAL)
  })

  test("a token of another type is rejected", async () => {
    const magic = await post("/api/auth/send-magic-link", { email: LOCAL })
    const r = await post("/api/auth/reset-password", { token: tokenOf(magic.body.debugMagicLink), newPassword: "abcdefgh", confirmPassword: "abcdefgh" })
    expect(r.status).toBe(400)
    expect(r.body.error).toBe("Token non valido")
  })
})

describe("/api/auth/send-magic-link", () => {
  test("returns a link for a known user and the neutral message otherwise", async () => {
    const known = await post("/api/auth/send-magic-link", { email: LOCAL })
    expect(known.status).toBe(200)
    expect(known.body.debugMagicLink).toContain("/auth/verify-magic-link?token=")
    const unknown = await post("/api/auth/send-magic-link", { email: "ghost@example.com" })
    expect(unknown.body.message).toBe("Se l'email esiste nel nostro sistema, riceverai un link magico a breve.")
    expect((await post("/api/auth/send-magic-link", { email: "x" })).status).toBe(400)
  })
})

describe("/api/auth/send-verification-email + verify-email", () => {
  test("validates, 404s for an unknown user, then verifies once", async () => {
    expect((await post("/api/auth/send-verification-email")).body).toMatchObject({ error: "Email mancante" })
    const missing = await post("/api/auth/send-verification-email", { email: "ghost@example.com" })
    expect(missing.status).toBe(404)
    expect(missing.body.error).toBe("Utente non trovato")

    const sent = await post("/api/auth/send-verification-email", { email: LOCAL })
    expect(sent.status).toBe(200)
    expect(sent.body.message).toBe("Verification email sent successfully")

    expect((await post("/api/auth/verify-email")).body).toMatchObject({ error: "Token mancante" })
    expect((await post("/api/auth/verify-email", { token: "garbage" })).body).toMatchObject({ error: "Token non valido" })
    const done = await post("/api/auth/verify-email", { token: tokenOf(sent.body.debug.link) })
    expect(done.status).toBe(200)
    expect(done.body.user.email).toBe(LOCAL)
    expect(new Date(done.body.user.emailVerified).getTime()).toBeGreaterThan(0)

    const again = await post("/api/auth/send-verification-email", { email: LOCAL })
    expect(again.status).toBe(400)
    expect(again.body.error).toBe("Email già verificata")
  })

  test("a reset token cannot verify an e-mail", async () => {
    const forgot = await post("/api/auth/forgot-password", { email: LOCAL })
    const r = await post("/api/auth/verify-email", { token: tokenOf(forgot.body.debugResetLink) })
    expect(r.body).toMatchObject({ error: "Token non valido", details: "Il token non è per la verifica email" })
  })
})

describe("/api/auth/signout and passkey-register", () => {
  test("signout clears the auth cookie", async () => {
    const r = await post("/api/auth/signout")
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ success: true, message: "Logout effettuato con successo!" })
    expect(r.headers.get("set-cookie")).toContain("auth-token=;")
  })

  test("passkey registration is not implemented", async () => {
    const r = await post("/api/auth/passkey-register")
    expect(r.status).toBe(501)
    expect(r.body.error).toBe("Passkey registration not yet implemented")
  })

  test("every route requires the launch token", async () => {
    expect((await app.call("/api/auth/signout", { method: "POST", auth: false })).status).toBe(401)
  })
})

describe("signup, signin-direct, get-session, magic link verification", () => {
  test("signup validates with the legacy messages and creates an account once", async () => {
    expect((await post("/api/auth/signup")).body).toMatchObject({ error: "Tutti i campi sono richiesti" })
    const ok = { email: "ada@example.com", name: "Ada", password: "longpassword", confirmPassword: "longpassword" }
    expect((await post("/api/auth/signup", { ...ok, email: "nope" })).body).toMatchObject({ error: "Email non valida" })
    expect((await post("/api/auth/signup", { ...ok, name: "A" })).body).toMatchObject({ error: "Nome troppo corto" })
    expect((await post("/api/auth/signup", { ...ok, password: "short", confirmPassword: "short" })).body).toMatchObject({ error: "Password troppo corta" })
    expect((await post("/api/auth/signup", { ...ok, confirmPassword: "different1" })).body).toMatchObject({ error: "Le password non corrispondono" })
    const created = await post("/api/auth/signup", ok)
    expect(created.status).toBe(201)
    expect(created.body.user).toMatchObject({ email: "ada@example.com", name: "Ada", emailVerified: null })
    const dup = await post("/api/auth/signup", ok)
    expect(dup.status).toBe(400)
    expect(dup.body.error).toBe("Email già in uso")
  })

  test("signin-direct checks credentials and sets the session cookie", async () => {
    expect((await post("/api/auth/signin-direct")).body).toMatchObject({ error: "Email e password sono richiesti" })
    expect((await post("/api/auth/signin-direct", { email: "ghost@example.com", password: "x" })).status).toBe(404)
    const wrong = await post("/api/auth/signin-direct", { email: "ada@example.com", password: "wrongpass1" })
    expect(wrong.status).toBe(401)
    expect(wrong.body.error).toBe("Credenziali non valide")
    const ok = await post("/api/auth/signin-direct", { email: "ada@example.com", password: "longpassword" })
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ success: true, message: "Login effettuato con successo!", user: { email: "ada@example.com" } })
    expect(ok.headers.get("set-cookie")).toContain(`auth-token=${ok.body.token}`)
  })

  test("get-session answers with the local profile", async () => {
    const r = await app.call("/api/auth/get-session")
    expect(r.status).toBe(200)
    expect(r.body.session.user.email).toBe("local@cadcamfun.local")
  })

  test("test-direct-create validates and conflicts", async () => {
    expect((await post("/api/auth/test-direct-create", { email: "x@y.co" })).body.error).toBe("Missing required fields")
    const ok = await post("/api/auth/test-direct-create", { email: "t@y.co", password: "pw", name: "T" })
    expect(ok.status).toBe(201)
    expect((await post("/api/auth/test-direct-create", { email: "t@y.co", password: "pw", name: "T" })).status).toBe(500)
  })

  test("a magic link signs in once verified", async () => {
    const link = await post("/api/auth/send-magic-link", { email: "local@cadcamfun.local" })
    const token = new URL(link.body.debugMagicLink).searchParams.get("token")!
    expect((await post("/api/auth/verify-magic-link")).body).toMatchObject({ error: "Token mancante" })
    expect((await post("/api/auth/verify-magic-link", { token: "garbage" })).body).toMatchObject({ error: "Token non valido" })
    const ok = await post("/api/auth/verify-magic-link", { token })
    expect(ok.status).toBe(200)
    expect(ok.body.message).toBe("Magic link verified successfully")
    expect(ok.headers.get("set-cookie")).toContain("auth-token=")
  })
})
