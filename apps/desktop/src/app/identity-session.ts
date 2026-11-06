/**
 * The CADCAMFUN account on this computer.
 *
 * Sign-in runs through the sidecar's loopback OAuth flow. The access token, refresh token
 * and issuer live in the OS keychain (memory only in a plain browser). The cloud screen is
 * the only place that shows the access token, and only after the owner asks to see it.
 */
import { DESKTOP_CLIENT_ID, createSessionManager, parseSession, type OAuthSession, type SessionStorage } from "@cadcamfun/identity/client"

const KEY = "identity.desktop"
let memory: string | undefined

const bridge = async () => {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return undefined
  return (await import("@tauri-apps/api/core")).invoke
}

const storage: SessionStorage = {
  async load() {
    const invoke = await bridge()
    const raw = invoke ? await invoke<string | null>("secret_get", { key: KEY }) : memory
    if (!raw) return null
    try { return parseSession(JSON.parse(raw)) } catch { return null }
  },
  async save(session) {
    const raw = JSON.stringify(session)
    const invoke = await bridge()
    if (!invoke) { memory = raw; return }
    await invoke("secret_set", { key: KEY, value: raw })
  },
  async clear() {
    const invoke = await bridge()
    if (!invoke) { memory = undefined; return }
    await invoke("secret_delete", { key: KEY })
  },
}

const manager = createSessionManager(storage, DESKTOP_CLIENT_ID)

/** Email claim for the label. Authorization still happens on the server. */
export const emailOfAccessToken = (access: string): string | undefined => {
  try {
    const part = access.split(".")[1] ?? ""
    const json: unknown = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")))
    if (typeof json !== "object" || json === null || !("email" in json)) return undefined
    return typeof json.email === "string" && json.email.length > 0 ? json.email : undefined
  } catch {
    return undefined
  }
}

export interface IdentityAccount {
  readonly access: string
  readonly email?: string
}

/** The current account, refreshing the access token when it is near expiry. */
export const readIdentity = async (): Promise<IdentityAccount | undefined> => {
  try {
    const session = await manager.get()
    if (!session) return undefined
    const email = emailOfAccessToken(session.tokens.access)
    return email ? { access: session.tokens.access, email } : { access: session.tokens.access }
  } catch {
    return undefined
  }
}

/** Access token attached to cloud calls, or undefined when this computer is signed out. */
export const identityAccessToken = async (): Promise<string | undefined> => (await readIdentity())?.access

export const saveIdentitySession = (session: OAuthSession): Promise<void> => manager.save(session)

/** Drops the local session, then revokes the refresh token. A failed revoke still leaves this computer signed out. */
export const clearIdentity = (): Promise<void> => manager.logout()
