import { Platform } from "react-native"
import * as SecureStore from "expo-secure-store"
import { validatePairing, type Pairing } from "./pairing"

/**
 * Centralised secure storage (nikcli: lib/storage.ts).
 *
 * - Pairing (scoped token + certificate fingerprint) lives in the iOS Keychain,
 *   never in plain storage. Web falls back to localStorage for development.
 * - The offline assistant queue and per-project session-seen markers live beside
 *   it so a process kill never loses a queued steer message.
 * - Writes that compose a delta are serialised through a promise chain so quick
 *   successive toggles cannot race (same technique as nikcli config-writer).
 */

const PAIRING_KEY = "cadcamfun.pairing.v1"
const OFFLINE_QUEUE_KEY = "cadcamfun.offline.queue.v1"
const SESSION_SEEN_KEY = "cadcamfun.session.seen.v1"

export const pairingStore = {
  load: async (): Promise<Pairing | undefined> => {
    const raw =
      Platform.OS === "web"
        ? globalThis.localStorage?.getItem(PAIRING_KEY) ?? null
        : await SecureStore.getItemAsync(PAIRING_KEY)
    if (!raw) return undefined
    try {
      return validatePairing(JSON.parse(raw))
    } catch {
      return undefined
    }
  },
  save: async (pairing: Pairing): Promise<void> => {
    const validated = validatePairing(pairing)
    if (Platform.OS === "web") {
      globalThis.localStorage?.setItem(PAIRING_KEY, JSON.stringify(validated))
      return
    }
    await SecureStore.setItemAsync(PAIRING_KEY, JSON.stringify(validated), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    })
  },
  clear: async (): Promise<void> => {
    if (Platform.OS === "web") {
      globalThis.localStorage?.removeItem(PAIRING_KEY)
      return
    }
    await SecureStore.deleteItemAsync(PAIRING_KEY)
  },
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw =
      Platform.OS === "web"
        ? globalThis.localStorage?.getItem(key) ?? null
        : await SecureStore.getItemAsync(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  const raw = JSON.stringify(value)
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(key, raw)
    return
  }
  await SecureStore.setItemAsync(key, raw)
}

export const readOfflineQueueRaw = (): Promise<unknown[]> => readJson<unknown[]>(OFFLINE_QUEUE_KEY, [])
export const writeOfflineQueueRaw = (queue: unknown[]): Promise<void> => writeJson(OFFLINE_QUEUE_KEY, queue)

export async function getSessionSeen(): Promise<Record<string, number>> {
  const parsed = await readJson<Record<string, unknown>>(SESSION_SEEN_KEY, {})
  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, number] => typeof entry[0] === "string" && typeof entry[1] === "number",
    ),
  )
}

export async function markSessionSeen(sessionId: string, at = Date.now()): Promise<Record<string, number>> {
  const current = await getSessionSeen()
  const next = { ...current, [sessionId]: at }
  await writeJson(SESSION_SEEN_KEY, next)
  return next
}

// Serialised read-modify-write helper for callers that compose deltas.
const chain: { current: Promise<unknown> } = { current: Promise.resolve() }

export function mutateStored<T>(read: () => Promise<T>, write: (value: T) => Promise<void>, merge: (current: T) => T | Promise<T>): Promise<T> {
  const next = chain.current.catch(() => undefined).then(async () => {
    const current = await read()
    const updated = await merge(current)
    await write(updated)
    return updated
  }) as Promise<T>
  chain.current = next.catch(() => undefined)
  return next
}
