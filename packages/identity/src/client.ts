/** Native OAuth client shared by desktop and mobile. No worker or Effect imports. */
export const DEFAULT_ISSUER = "https://auth.cadcam.fun"
export const IDENTITY_AUDIENCE = "cadcamfun-api"
export const DESKTOP_CLIENT_ID = "cadcamfun-desktop"
export const MOBILE_CLIENT_ID = "cadcamfun-mobile"
export const MOBILE_REDIRECT_URI = "cadcamfun://auth/callback"

export interface OAuthTokens {
  readonly access: string
  readonly refresh: string
  readonly expiresAt: number
}
export interface OAuthSession { readonly issuer: string; readonly tokens: OAuthTokens }
export interface OAuthDiscovery {
  readonly authorizationEndpoint: string
  readonly tokenEndpoint: string
  readonly revocationEndpoint: string
}
export interface SessionStorage {
  load(): Promise<OAuthSession | null>
  save(session: OAuthSession): Promise<void>
  clear(): Promise<void>
}
export class OAuthError extends Error {
  constructor(readonly code: string, message: string) { super(message) }
}
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid identity response")
  return value as Record<string, unknown>
}
export function normalizeIssuer(value = DEFAULT_ISSUER): string {
  const url = new URL(value)
  const local = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]"
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error("Identity issuer must use HTTPS")
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Identity issuer must be an origin")
  return url.origin
}
export function parseTokens(value: unknown, now = Date.now()): OAuthTokens {
  const v = record(value)
  if (typeof v.access_token !== "string" || !v.access_token || typeof v.refresh_token !== "string" || !v.refresh_token ||
      typeof v.expires_in !== "number" || !Number.isFinite(v.expires_in) || v.expires_in <= 0 || v.token_type !== "Bearer") {
    throw new Error("Invalid OAuth token response")
  }
  return { access: v.access_token, refresh: v.refresh_token, expiresAt: now + v.expires_in * 1000 }
}
export function parseSession(value: unknown): OAuthSession {
  const v = record(value), tokens = record(v.tokens)
  if (typeof v.issuer !== "string" || typeof tokens.access !== "string" || !tokens.access || typeof tokens.refresh !== "string" || !tokens.refresh || typeof tokens.expiresAt !== "number" || !Number.isFinite(tokens.expiresAt)) throw new Error("Invalid saved identity session")
  return { issuer: normalizeIssuer(v.issuer), tokens: { access: tokens.access, refresh: tokens.refresh, expiresAt: tokens.expiresAt } }
}
export async function discover(issuer: string, fetcher: typeof fetch = fetch): Promise<OAuthDiscovery> {
  const origin = normalizeIssuer(issuer)
  const response = await fetcher(`${origin}/.well-known/oauth-authorization-server`, { signal: AbortSignal.timeout(15_000), redirect: "error" })
  if (!response.ok) throw new OAuthError("discovery_failed", `Identity discovery failed (${response.status})`)
  const v = record(await response.json())
  if (v.issuer !== origin) throw new Error("Identity discovery returned a different issuer")
  const endpoint = (key: string) => {
    const raw = v[key]
    if (typeof raw !== "string") throw new Error(`Missing identity ${key}`)
    const url = new URL(raw)
    if (url.origin !== origin || url.username || url.password || url.hash) throw new Error("Identity endpoint has an unexpected origin")
    return url.href
  }
  return { authorizationEndpoint: endpoint("authorization_endpoint"), tokenEndpoint: endpoint("token_endpoint"), revocationEndpoint: endpoint("revocation_endpoint") }
}
export async function tokenRequest(endpoint: string, params: Record<string, string>, fetcher: typeof fetch = fetch): Promise<OAuthTokens> {
  const response = await fetcher(endpoint, { method: "POST", body: new URLSearchParams(params), signal: AbortSignal.timeout(15_000), redirect: "error" })
  const value: unknown = await response.json()
  if (!response.ok) {
    const v = record(value)
    throw new OAuthError(typeof v.error === "string" ? v.error : "token_failed", typeof v.error_description === "string" ? v.error_description : "Identity token request failed")
  }
  return parseTokens(value)
}
/** Generation guards stop a late refresh from restoring a session after logout. */
export function createSessionManager(storage: SessionStorage, clientId: string, fetcher: typeof fetch = fetch) {
  let generation = 0
  let refreshing: Promise<OAuthSession> | undefined
  let writes: Promise<unknown> = Promise.resolve()
  const write = (work: () => Promise<void>) => {
    const next = writes.catch(() => undefined).then(work)
    writes = next
    return next
  }
  const save = async (session: OAuthSession) => {
    ++generation
    await write(() => storage.save(parseSession(session)))
  }
  const clear = async () => { ++generation; await write(() => storage.clear()) }
  const get = async (): Promise<OAuthSession | null> => {
    await writes
    const session = await storage.load()
    if (!session || session.tokens.expiresAt > Date.now() + 60_000) return session
    const version = generation
    if (!refreshing) refreshing = (async () => {
      try {
        const metadata = await discover(session.issuer, fetcher)
        const tokens = await tokenRequest(metadata.tokenEndpoint, { grant_type: "refresh_token", client_id: clientId, refresh_token: session.tokens.refresh }, fetcher)
        if (version !== generation) throw new OAuthError("session_changed", "Account changed during refresh")
        const next = { issuer: session.issuer, tokens }
        await write(async () => { if (version === generation) await storage.save(next) })
        if (version !== generation) throw new OAuthError("session_changed", "Account changed during refresh")
        return next
      } catch (error) {
        if (error instanceof OAuthError && error.code === "invalid_grant" && version === generation) await clear()
        throw error
      } finally { refreshing = undefined }
    })()
    return refreshing
  }
  const logout = async () => {
    await writes
    const session = await storage.load()
    await clear()
    if (!session) return
    const metadata = await discover(session.issuer, fetcher)
    const response = await fetcher(metadata.revocationEndpoint, { method: "POST", body: new URLSearchParams({ client_id: clientId, token: session.tokens.refresh, token_type_hint: "refresh_token" }), signal: AbortSignal.timeout(15_000), redirect: "error" })
    if (!response.ok) throw new OAuthError("revoke_failed", "Local session removed; identity revocation failed")
  }
  return { get, save, clear, logout }
}
