import { Platform } from "react-native"
import * as SecureStore from "expo-secure-store"
import * as WebBrowser from "expo-web-browser"
import * as AuthSession from "expo-auth-session"
import {
  DEFAULT_ISSUER, MOBILE_CLIENT_ID, MOBILE_REDIRECT_URI, OAuthError, createSessionManager, discover, normalizeIssuer,
  parseSession, tokenRequest, type OAuthSession, type SessionStorage,
} from "@cadcamfun/identity/client"

WebBrowser.maybeCompleteAuthSession()

/**
 * The CADCAMFUN account on this phone (`cadcamfun login`): OAuth authorization code + PKCE against the identity issuer,
 * tokens in the Keychain only. The access JWT travels to the paired desktop as `x-identity-token`, which resolves the same
 * local User the account has on the Mac, so the phone lists that account's projects.
 */
const SESSION_KEY = "cadcamfun.identity.v1"

const storage: SessionStorage = {
  async load() {
    const raw = Platform.OS === "web" ? globalThis.localStorage?.getItem(SESSION_KEY) ?? null : await SecureStore.getItemAsync(SESSION_KEY)
    if (!raw) return null
    try { return parseSession(JSON.parse(raw)) } catch { return null }
  },
  async save(session) {
    const raw = JSON.stringify(session)
    if (Platform.OS === "web") globalThis.localStorage?.setItem(SESSION_KEY, raw)
    else await SecureStore.setItemAsync(SESSION_KEY, raw, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY })
  },
  async clear() {
    if (Platform.OS === "web") globalThis.localStorage?.removeItem(SESSION_KEY)
    else await SecureStore.deleteItemAsync(SESSION_KEY)
  },
}

const manager = createSessionManager(storage, MOBILE_CLIENT_ID)

export interface AccountInfo { readonly issuer: string; readonly email?: string; readonly name?: string; readonly subject?: string }

/** Display claims from the (already issuer-verified on use) access token; never trusted for authorization. */
export const accountFromSession = (session: OAuthSession): AccountInfo => {
  try {
    const payload = session.tokens.access.split(".")[1] ?? ""
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>
    return {
      issuer: session.issuer,
      ...(typeof json.email === "string" ? { email: json.email } : {}),
      ...(typeof json.name === "string" ? { name: json.name } : {}),
      ...(typeof json.sub === "string" ? { subject: json.sub } : {}),
    }
  } catch {
    return { issuer: session.issuer }
  }
}

let current: AccountInfo | null = null
let revision = 0
const listeners = new Set<() => void>()
const publish = (next: AccountInfo | null) => {
  current = next
  revision += 1
  for (const listener of listeners) listener()
}

export const accountStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
  account: () => current,
  revision: () => revision,
}

/** Loads the saved account at launch; a dead refresh token simply leaves the phone signed out. */
export const restoreAccount = async (): Promise<AccountInfo | null> => {
  try {
    const session = await manager.get()
    publish(session ? accountFromSession(session) : null)
  } catch {
    publish(null)
  }
  return current
}

/** A fresh access JWT for the desktop, or undefined when signed out or the refresh failed (the phone then acts as the local profile). */
export const identityToken = async (): Promise<string | undefined> => {
  try {
    return (await manager.get())?.tokens.access
  } catch {
    return undefined
  }
}

export class LoginCancelled extends Error { constructor() { super("Sign-in cancelled") } }

export const signIn = async (issuerInput: string = DEFAULT_ISSUER): Promise<AccountInfo> => {
  const issuer = normalizeIssuer(issuerInput)
  const metadata = await discover(issuer)
  const request = new AuthSession.AuthRequest({
    clientId: MOBILE_CLIENT_ID,
    redirectUri: MOBILE_REDIRECT_URI,
    scopes: ["openid", "profile", "email", "offline_access"],
    usePKCE: true,
    responseType: AuthSession.ResponseType.Code,
  })
  const result = await request.promptAsync({ authorizationEndpoint: metadata.authorizationEndpoint })
  if (result.type === "cancel" || result.type === "dismiss") throw new LoginCancelled()
  if (result.type !== "success") throw new OAuthError("login_failed", result.type === "error" ? result.error?.message ?? "Sign-in failed" : "Sign-in failed")
  const code = result.params.code
  if (!code || !request.codeVerifier) throw new OAuthError("login_failed", "The sign-in response had no code")
  const tokens = await tokenRequest(metadata.tokenEndpoint, {
    grant_type: "authorization_code", client_id: MOBILE_CLIENT_ID, code, redirect_uri: MOBILE_REDIRECT_URI, code_verifier: request.codeVerifier,
  })
  const session: OAuthSession = { issuer, tokens }
  await manager.save(session)
  const info = accountFromSession(session)
  publish(info)
  return info
}

export const signOut = async (): Promise<void> => {
  try {
    await manager.logout()
  } finally {
    publish(null)
  }
}
