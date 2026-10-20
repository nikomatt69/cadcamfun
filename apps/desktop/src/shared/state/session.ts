/**
 * The signed-in account, as the client sees it.
 *
 * The sidecar authenticates the shell with the per-launch bearer token and then picks the
 * acting account from an optional `x-session-token` header (the JWT returned by sign-in
 * and magic-link verification). Without it, requests act as the local profile. The token
 * lives in a `Ref` — read per request by the client middleware — and is mirrored to
 * `localStorage` so it survives a reload; a blocked storage only costs persistence.
 */
import { useDocumentStore } from "../../features/cad/store/documentStore.ts"
import { Effect, Ref } from "effect"
import { createSignal } from "solid-js"
import { HttpClientRequest } from "effect/unstable/http"

export const SESSION_HEADER = "x-session-token"
const STORAGE_KEY = "cadcamfun.session-token"

const readStored = (): string | undefined => {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? undefined
  } catch {
    return undefined
  }
}

const writeStored = (token: string | undefined): void => {
  try {
    if (token === undefined) globalThis.localStorage?.removeItem(STORAGE_KEY)
    else globalThis.localStorage?.setItem(STORAGE_KEY, token)
  } catch {
    /* private window or blocked storage: the session simply does not survive a reload */
  }
}

const sessionTokenRef = Effect.runSync(Ref.make<string | undefined>(readStored()))

const [version, setVersion] = createSignal(0)
/** Bumps whenever the acting account changes, so views that show it can re-read the session. */
export const sessionVersion = version

/** Makes `token` the acting session (or the local profile when `undefined`). */
export const setSessionToken = (token: string | undefined): void => {
  Effect.runSync(Ref.set(sessionTokenRef, token))
  writeStored(token)
  setVersion((v) => v + 1)
}

export const getSessionToken = (): string | undefined => Effect.runSync(Ref.get(sessionTokenRef))

/** Client middleware step: adds the session header when a session is active. */
export const withSessionToken = (request: HttpClientRequest.HttpClientRequest): Effect.Effect<HttpClientRequest.HttpClientRequest> =>
  Effect.map(Ref.get(sessionTokenRef), (token) => token === undefined ? request : HttpClientRequest.setHeader(request, SESSION_HEADER, token))

/** One-shot editor hand-offs that would otherwise carry the previous account's (or a deleted) item into the next load. */
const HAND_OFF_KEYS = ["toolpathToLoadInCAM", "componentToLoadInCAD", "componentToLoadInCAD_timestamp"] as const

export const clearHandOffs = (): void => {
  try { for (const key of HAND_OFF_KEYS) localStorage.removeItem(key) } catch { /* storage unavailable */ }
}

const resetUserState = (): void => {
  clearHandOffs()
  useDocumentStore.getState().clear()
}

/** Switches the app to the account behind `token` and drops every cached answer of the previous one. */
export const startSession = (cache: { invalidate(key?: string): void }, token: string): void => {
  setSessionToken(token)
  cache.invalidate()
  resetUserState()
}

/** Back to the local profile. */
export const endSession = (cache: { invalidate(key?: string): void }): void => {
  setSessionToken(undefined)
  cache.invalidate()
  resetUserState()
}
