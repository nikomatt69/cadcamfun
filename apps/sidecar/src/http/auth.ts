import {
  Api, AuthBadRequest, AuthInternal, AuthNotFound, AuthUnauthorized, CurrentUser, PasskeyNotImplemented, TestCreateBadRequest, TestCreateFailure
} from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpServerRequest } from "effect/unstable/http"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import { SESSION_HEADER } from "./authorization.ts"
import { AppConfigService } from "../config.ts"
import { AuthRepo } from "../repos/auth-repo.ts"
import { IdentityOAuth } from "../services/identity-oauth.ts"
import { AuthTokens } from "../services/auth-tokens.ts"
import { hashPassword, signInPasswordMatches } from "../services/passwords.ts"

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const bad = (error: string, details: string) => new AuthBadRequest({ error, details })
const notFound = (error: string, details: string) => new AuthNotFound({ error, details })
const detailsOf = (e: unknown) => e instanceof Error ? e.message : "Errore interno del server"
const internal = (log: string, error: string, details?: string) => (e: unknown) =>
  Effect.logError(log, e).pipe(Effect.andThen(Effect.fail(new AuthInternal({ error, details: details ?? detailsOf(e) }))))

const iso = (d: Date | null) => (d ? d.toISOString() : null)
const fullUser = (u: { id: string; email: string | null; name: string | null; emailVerified: Date | null; createdAt: Date }) => ({
  id: u.id, email: u.email, name: u.name, emailVerified: iso(u.emailVerified), createdAt: u.createdAt.toISOString()
})
const COOKIE = "auth-token=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT"

export const AuthHandlers = HttpApiBuilder.group(Api, "auth", Effect.fn(function*(handlers) {
  const oauth = yield* IdentityOAuth
  const repo = yield* AuthRepo
  const tokens = yield* AuthTokens
  const config = yield* AppConfigService
  const base = config.appUrl ?? "http://localhost:3001"
  const debug = config.debugLinks === true

  /** forgot-password and send-magic-link differ only in copy, token type and lifetime. */
  const linkFlow = Effect.fn("auth.linkFlow")(function*(
    input: { readonly email?: string | undefined; readonly callbackURL?: string | undefined },
    flow: { type: string; ttl: number; callback: string; message: string }
  ) {
    const { email } = input
    if (!email) return yield* bad("Email richiesta", "Inserisci un indirizzo email valido")
    if (!EMAIL.test(email)) return yield* bad("Email non valida", "Inserisci un indirizzo email valido")
    const user = yield* repo.findByEmail(email.trim().toLowerCase())
    // Never reveal whether the address exists.
    if (!user?.email) return { success: true as const, message: flow.message }
    const jwt = tokens.sign({ userId: user.id, email: user.email, type: flow.type }, flow.ttl)
    const url = `${base}${input.callbackURL ?? flow.callback}?token=${jwt}`
    // No mail transport in the desktop app yet (legacy had the same TODO): the link is logged.
    yield* Effect.logInfo(`${flow.type} link generated for ${user.email}`)
    return { success: true as const, message: flow.message, ...(debug ? { link: url } : {}) }
  })

  return handlers
    .handle("identityStart", () => oauth.start())
    .handle("identityPoll", ({ payload }) => oauth.poll(payload.id))
    .handle("identityCancel", ({ payload }) => oauth.cancel(payload.id))
    .handle("forgotPassword", ({ payload }) =>
      linkFlow(payload, {
        type: "password-reset", ttl: 30 * 60, callback: "/auth/reset-password",
        message: "Se l'email esiste nel nostro sistema, riceverai un link per resettare la password."
      }).pipe(
        Effect.map(({ link, ...rest }) => ({ ...rest, ...(link ? { debugResetLink: link } : {}) })),
        Effect.catchTag("DatabaseError", internal("Forgot password error", "Errore durante la richiesta di reset password"))))
    .handle("sendMagicLink", ({ payload }) =>
      linkFlow(payload, {
        type: "magic-link", ttl: 15 * 60, callback: "/auth/verify-magic-link",
        message: "Se l'email esiste nel nostro sistema, riceverai un link magico a breve."
      }).pipe(
        Effect.map(({ link, ...rest }) => ({ ...rest, ...(link ? { debugMagicLink: link } : {}) })),
        Effect.catchTag("DatabaseError", internal("Send magic link error", "Errore durante l'invio del link magico"))))
    .handle("resetPassword", ({ payload }) => Effect.gen(function*() {
      const { token, newPassword, confirmPassword } = payload
      if (!token) return yield* bad("Token richiesto", "Password reset token mancante")
      if (!newPassword || !confirmPassword) return yield* bad("Password richieste", "Inserisci la nuova password e la conferma")
      if (newPassword !== confirmPassword) {
        return yield* bad("Password non corrispondenti", "La nuova password e la conferma devono essere identiche")
      }
      if (newPassword.length < 8) return yield* bad("Password troppo corta", "La password deve essere di almeno 8 caratteri")
      const claims = yield* tokens.verify(token).pipe(Effect.mapError(() =>
        bad("Token non valido o scaduto", "Il link di reset password è scaduto o non valido. Richiedi un nuovo link.")))
      if (claims.type !== "password-reset") return yield* bad("Token non valido", "Questo non è un token di reset password valido")
      const user = yield* repo.findById(claims.userId)
      if (!user) return yield* notFound("Utente non trovato", "L'account associato a questo reset token non esiste più")
      if (user.email !== claims.email) return yield* bad("Token non valido", "L'email associata al token non corrisponde")
      const hash = yield* hashPassword(newPassword)
      yield* repo.setPassword(user.id, hash)
      yield* tokens.revoke(token) // a reset link works once
      return {
        success: true as const,
        message: "Password resettata con successo! Ora puoi effettuare il login con la nuova password.",
        user: { id: user.id, email: user.email ?? "", name: user.name }
      }
    }).pipe(Effect.catchTags({
      DatabaseError: internal("Reset password error", "Errore durante il reset della password"),
      PasswordHashError: internal("Reset password error", "Errore durante il reset della password")
    })))
    .handle("sendVerificationEmail", ({ payload }) => Effect.gen(function*() {
      const { email } = payload
      if (!email) return yield* bad("Email mancante", "L'indirizzo email è richiesto")
      const user = yield* repo.findByEmail(email)
      if (!user?.email) return yield* notFound("Utente non trovato", "Nessun utente trovato con questo indirizzo email")
      if (user.emailVerified) return yield* bad("Email già verificata", "Questo indirizzo email è già stato verificato")
      const jwt = tokens.sign({ userId: user.id, email: user.email, type: "email-verification" }, 24 * 60 * 60)
      const link = `${base}${payload.callbackURL ?? "/auth/verify-email"}?token=${jwt}`
      yield* Effect.logInfo(`email verification link generated for ${user.email}`)
      return { success: true as const, message: "Verification email sent successfully", debug: { link } }
    }).pipe(Effect.catchTag("DatabaseError", internal(
      "Send verification email failed", "Errore interno del server",
      "Si è verificato un errore durante l'invio dell'email di verifica"))))
    .handle("verifyEmail", ({ payload }) => Effect.gen(function*() {
      if (!payload.token) return yield* bad("Token mancante", "Il token di verifica è richiesto")
      const claims = yield* tokens.verify(payload.token).pipe(Effect.mapError((kind) => kind === "expired"
        ? bad("Link scaduto", "Il link di verifica è scaduto. Richiedi un nuovo link.")
        : bad("Token non valido", "Il link di verifica non è valido o è stato manomesso.")))
      if (claims.type !== "email-verification") return yield* bad("Token non valido", "Il token non è per la verifica email")
      const user = yield* repo.markVerified(claims.userId)
      if (!user) return yield* notFound("Utente non trovato", "L'utente associato al token di verifica non esiste")
      return {
        success: true as const,
        message: "Email verified successfully",
        user: { id: user.id, email: user.email ?? "", name: user.name, emailVerified: (user.emailVerified ?? new Date()).toISOString() }
      }
    }).pipe(Effect.catchTag("DatabaseError", internal(
      "Email verification failed", "Errore interno del server",
      "Si è verificato un errore durante la verifica dell'email"))))
    .handle("getSession", () => Effect.gen(function*() {
      // The desktop app has one local identity, so the session is always the local profile (the legacy JWT cookie is not needed).
      const me = yield* CurrentUser
      const row = yield* repo.profile(me.id)
      if (!row) return yield* new AuthUnauthorized({ error: "No active session", details: "No active session" })
      return { session: { user: {
        id: row.id, email: row.email, name: row.name, emailVerified: iso(row.emailVerified), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
      }, expires: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString() } }
    }).pipe(Effect.catchTag("DatabaseError", internal("Get session error", "Errore durante il controllo della sessione"))))
    .handle("signinDirect", ({ payload }) => Effect.gen(function*() {
      const { email, password } = payload
      if (!email || !password) return yield* bad("Email e password sono richiesti", "Inserisci sia email che password per accedere")
      const user = yield* repo.findForSignin(email.trim())
      if (!user) return yield* notFound("Utente non trovato", "Nessun account registrato con questa email")
      if (!user.password) return yield* bad("Password non impostata", "Questo account non ha una password. Usa un metodo di login alternativo.")
      if (!(yield* signInPasswordMatches(password, user.password, user.id))) {
        return yield* new AuthUnauthorized({ error: "Credenziali non valide", details: "Email o password non corretti" })
      }
      const token = tokens.sign({ userId: user.id, email: user.email ?? "", type: "session" }, 7 * 24 * 3600)
      return HttpApiSchema.withHeaders({
        body: { success: true as const, message: "Login effettuato con successo!", user: fullUser(user), token },
        headers: { "set-cookie": [`auth-token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`] }
      })
    }).pipe(Effect.catchTag("DatabaseError", internal("Direct signin error", "Errore durante il login"))))
    .handle("signup", ({ payload }) => Effect.gen(function*() {
      const { email, password, confirmPassword, name } = payload
      if (!email || !password || !confirmPassword || !name) return yield* bad("Tutti i campi sono richiesti", "Email, nome, password e conferma password sono obbligatori")
      if (!EMAIL.test(email)) return yield* bad("Email non valida", "Inserisci un indirizzo email valido")
      if (name.trim().length < 2) return yield* bad("Nome troppo corto", "Il nome deve essere di almeno 2 caratteri")
      if (password.length < 8) return yield* bad("Password troppo corta", "La password deve essere di almeno 8 caratteri")
      if (password !== confirmPassword) return yield* bad("Le password non corrispondono", "La password e la conferma devono essere identiche")
      const passwordHash = yield* hashPassword(password)
      const user = yield* repo.createUser({ email: email.trim(), name: name.trim(), passwordHash })
      if (!user) return yield* bad("Email già in uso", "Questo indirizzo email è già registrato")
      return { success: true as const, message: "Account creato con successo! Ora puoi effettuare il login.", user: fullUser(user) }
    }).pipe(Effect.catchTags({
      DatabaseError: internal("Signup error", "Errore durante la registrazione"),
      PasswordHashError: internal("Signup error", "Errore durante la registrazione")
    })))
    .handle("testDirectCreate", ({ payload }) => Effect.gen(function*() {
      const { email, password, name } = payload
      if (!email || !password || !name) return yield* new TestCreateBadRequest({ error: "Missing required fields" })
      const passwordHash = yield* hashPassword(password)
      const user = yield* repo.createUser({ email: email.trim(), name: name.trim(), passwordHash })
      if (!user) return yield* new TestCreateFailure({ error: "Direct creation failed", message: "Unique constraint failed on the fields: (`email`)" })
      return { success: true as const, message: "User created successfully with Prisma", user: fullUser(user) }
    }).pipe(Effect.catchTags({
      DatabaseError: (e) => Effect.fail(new TestCreateFailure({ error: "Direct creation failed", message: String(e) })),
      PasswordHashError: (e) => Effect.fail(new TestCreateFailure({ error: "Direct creation failed", message: e.message }))
    })))
    .handle("verifyMagicLink", ({ payload }) => Effect.gen(function*() {
      if (!payload.token) return yield* bad("Token mancante", "Il token di verifica è richiesto")
      const claims = yield* tokens.verify(payload.token).pipe(Effect.mapError((kind) => kind === "expired"
        ? bad("Link scaduto", "Il magic link è scaduto. Richiedi un nuovo link.")
        : bad("Token non valido", "Il magic link non è valido o è stato manomesso.")))
      if (claims.type !== "magic-link") return yield* bad("Token non valido", "Il token non è un magic link valido")
      const user = yield* repo.findById(claims.userId)
      if (!user) return yield* notFound("Utente non trovato", "L'utente associato al magic link non esiste")
      yield* tokens.revoke(payload.token) // a magic link works once
      const authToken = tokens.sign({ userId: user.id, email: user.email ?? "", type: "session" }, 7 * 24 * 3600)
      return HttpApiSchema.withHeaders({
        body: { success: true as const, message: "Magic link verified successfully", user: { id: user.id, email: user.email, name: user.name }, token: authToken },
        headers: { "set-cookie": [`auth-token=${authToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 3600}`] }
      })
    }).pipe(Effect.catchTag("DatabaseError", internal("Magic link verification failed", "Errore interno del server",
      "Si è verificato un errore durante la verifica del magic link"))))
    .handle("signout", () => Effect.gen(function*() {
      // Sign-out ends the session token for real: it stops verifying, wherever a copy of it was kept.
      const request = yield* HttpServerRequest.HttpServerRequest
      const token = request.headers[SESSION_HEADER]
      if (token) yield* tokens.revoke(token)
      return HttpApiSchema.withHeaders({
        body: { success: true as const, message: "Logout effettuato con successo!" },
        headers: { "set-cookie": [COOKIE] }
      })
    }))
    .handle("registerPasskey", () => Effect.fail(new PasskeyNotImplemented({
      error: "Passkey registration not yet implemented",
      details: "Passkey authentication sarà disponibile in futuro",
      todoImplementation: {
        webauthn: "Utilizzare @simplewebauthn/server",
        challengeGeneration: "Generare challenge sicuro",
        credentialStorage: "Salvare public key nel database",
        userVerification: "Implementare user verification"
      }
    })))
}))
