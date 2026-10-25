/**
 * An LRU cache bounded by the number of entries and by the bytes they hold (`sizeOf`): toolpaths differ in size by orders of
 * magnitude, so a count alone would let a few huge programs fill the memory. Recency is the Map's insertion order: a read
 * deletes and re-inserts. An entry larger than the whole byte budget is not stored.
 */
export interface BoundedCacheOptions<K, V> {
  readonly maxEntries: number
  readonly maxBytes: number
  readonly sizeOf: (value: V) => number
  /** Called for an entry that leaves the cache by eviction, replacement or `clear` (not for `delete`). */
  readonly onEvict?: (key: K, value: V) => void
}

export class BoundedCache<K, V> {
  private readonly entries = new Map<K, { readonly value: V; readonly bytes: number }>()
  private held = 0
  hits = 0
  misses = 0

  constructor(private readonly options: BoundedCacheOptions<K, V>) {}

  get size(): number { return this.entries.size }
  get bytes(): number { return this.held }

  get(key: K): V | undefined {
    const entry = this.entries.get(key)
    if (entry === undefined) { this.misses++; return undefined }
    this.hits++
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  has(key: K): boolean { return this.entries.has(key) }

  /** Stores the value; returns false when it alone is larger than the byte budget (nothing is evicted for it). */
  set(key: K, value: V): boolean {
    const bytes = Math.max(0, this.options.sizeOf(value))
    if (bytes > this.options.maxBytes) return false
    const old = this.entries.get(key)
    if (old !== undefined) { this.entries.delete(key); this.held -= old.bytes; this.options.onEvict?.(key, old.value) }
    this.entries.set(key, { value, bytes })
    this.held += bytes
    while (this.entries.size > this.options.maxEntries || this.held > this.options.maxBytes) {
      const oldest = this.entries.keys().next()
      if (oldest.done === true) break
      this.evict(oldest.value)
    }
    return true
  }

  delete(key: K): boolean {
    const entry = this.entries.get(key)
    if (entry === undefined) return false
    this.entries.delete(key)
    this.held -= entry.bytes
    return true
  }

  clear(): void {
    for (const key of [...this.entries.keys()]) this.evict(key)
  }

  private evict(key: K): void {
    const entry = this.entries.get(key)!
    this.entries.delete(key)
    this.held -= entry.bytes
    this.options.onEvict?.(key, entry.value)
  }
}
