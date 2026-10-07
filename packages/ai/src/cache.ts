/**
 * In-memory TTL cache for stateless AI responses (legacy `aiCache.ts` ported).
 *
 * Why this exists: `DirectModel.generateText` and `generateObject` are pure
 * with respect to the project (no tools, no memory) and called many times with
 * the same payload (machining-parameter hints, post summaries). A bounded
 * LRU/TTL avoids burning API tokens, and the bound keeps the cache from
 * growing during long-running debugging sessions.
 *
 * The chat stream goes through the embedded nikcli host and has its own session
 * state — do not cache it here. `cam_analyze_gcode` is deterministic and
 * handled by the same cache for the same reason.
 *
 * Notes on the port:
 * - The legacy cache stored an opaque blob and used `localStorage`; we keep
 *   the in-memory part, drop the persistence (this package runs in the sidecar
 *   process, not a renderer), and bind the cache as an Effect `Service` so
 *   callers get it through `yield*` instead of a module singleton.
 * - Key derivation is stable: the same payload yields the same key.
 * - Eviction is O(1): a doubly-linked list would be overkill for `maxSize ≤ 100`.
 */
import { Context, Effect, Layer } from "effect"
import { createHash } from "node:crypto"

export interface AiCacheOptions {
  /** Time-to-live in milliseconds. Default: 30 minutes. */
  readonly ttl?: number
  /** Maximum number of entries before the oldest is dropped. Default: 100. */
  readonly maxSize?: number
}

interface CacheEntry<T> {
  readonly value: T
  /** Used by the LRU eviction (`maxSize`). */
  readonly touchedAt: number
  /** Absolute epoch ms; an entry past this is returned as a miss. */
  readonly expiresAt: number
}

export class AiCache extends Context.Service<
  AiCache,
  {
    /** Stable cache key for a JSON-serialisable payload. */
    keyFor(payload: unknown): string
    /** Returns the value when present and unexpired. */
    get<T>(key: string): Effect.Effect<T | undefined>
    set<T>(key: string, value: T, ttlMs?: number): Effect.Effect<void>
    has(key: string): Effect.Effect<boolean>
    delete(key: string): Effect.Effect<boolean>
    /** Returns the number of live (non-expired) entries. */
    size: Effect.Effect<number>
    /** Drops every entry; safe to call from a finalizer. */
    clear: Effect.Effect<void>
  }
>()("cadcamfun/AiCache") {
  static layer = (options: AiCacheOptions = {}): Layer.Layer<AiCache> =>
    Layer.sync(AiCache, () => {
      const ttl = options.ttl ?? 30 * 60_000
      const maxSize = options.maxSize ?? 100
      const entries = new Map<string, CacheEntry<unknown>>()

      const isLive = (entry: CacheEntry<unknown>, now: number): boolean =>
        entry.expiresAt > now

      /** Re-insert so `Map` iteration order (oldest-first) is the LRU order. */
      const touch = <T>(key: string, entry: CacheEntry<T>): void => {
        entries.delete(key)
        entries.set(key, entry as CacheEntry<unknown>)
      }

      /** Drop the oldest live entry (the first key in insertion order). */
      const evictOldest = (): void => {
        for (const key of entries.keys()) {
          entries.delete(key)
          return
        }
      }

      return AiCache.of({
        keyFor: (payload) => keyOf(payload),
        get: <T>(key: string) =>
          Effect.sync(() => {
            const entry = entries.get(key) as CacheEntry<T> | undefined
            if (entry === undefined) return undefined
            const now = Date.now()
            if (!isLive(entry, now)) {
              entries.delete(key)
              return undefined
            }
            touch(key, { ...entry, touchedAt: now })
            return entry.value
          }),
        set: <T>(key: string, value: T, ttlMs?: number) =>
          Effect.sync(() => {
            const now = Date.now()
            const existing = entries.get(key)
            const merged: CacheEntry<T> = {
              value,
              touchedAt: existing?.touchedAt ?? now,
              expiresAt: now + (ttlMs ?? ttl)
            }
            entries.set(key, merged as CacheEntry<unknown>)
            if (entries.size > maxSize) evictOldest()
          }),
        has: (key) =>
          Effect.sync(() => {
            const entry = entries.get(key)
            if (entry === undefined) return false
            if (!isLive(entry, Date.now())) {
              entries.delete(key)
              return false
            }
            return true
          }),
        delete: (key) => Effect.sync(() => entries.delete(key)),
        size: Effect.sync(() => {
          const now = Date.now()
          let live = 0
          for (const [key, entry] of entries) {
            if (isLive(entry, now)) live++
            else entries.delete(key)
          }
          return live
        }),
        clear: Effect.sync(() => entries.clear())
      })
    })
}

/**
 * Stable, URL-safe cache key.
 * Stable across runs because the hash is over the JSON form; not stable across
 * key ordering changes, so callers must serialise deterministically (object
 * keys are sorted below to mitigate that).
 */
export const keyOf = (payload: unknown): string =>
  `ai-${createHash("sha256").update(stableStringify(payload)).digest("hex").slice(0, 32)}`

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  const body = keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")
  return `{${body}}`
}

/**
 * Cached wrapper around an Effect that returns `A`. On a hit, returns the
 * stored value without running the effect; on a miss, runs the effect, stores
 * its success, and forwards failures untouched.
 *
 * Designed for one-shot AI calls (`generateText`, `generateObject`,
 * `analyzeGcode`). Failures are not cached because AI providers are
 * inconsistent across runs. Requires `AiCache` in the context.
 */
export const cached = <A, E, R>(
  payload: unknown,
  ttlMs: number | undefined,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R | AiCache> =>
  Effect.gen(function* () {
    const cache = yield* AiCache
    const key = cache.keyFor(payload)
    const hit = yield* cache.get<A>(key)
    if (hit !== undefined) return hit
    const value = yield* effect
    yield* cache.set(key, value, ttlMs)
    return value
  })