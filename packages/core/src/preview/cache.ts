/**
 * A least-recently-used cache bounded by entry count *and* by total weight (bytes for an encoded payload).
 *
 * Previews are pure functions of a stored document and its revision, so the key carries the revision and an edited
 * drawing simply misses; nothing is ever invalidated by hand. The weight bound is what matters: one dense part can be
 * megabytes, and a phone browsing a large project must not grow the desktop's memory without limit.
 */
export interface PreviewCacheOptions {
  readonly maxEntries: number
  readonly maxWeight: number
}

export class PreviewCache<V> {
  private readonly entries = new Map<string, { readonly value: V; readonly weight: number }>()
  private total = 0

  constructor(private readonly options: PreviewCacheOptions, private readonly weigh: (value: V) => number) {}

  get size(): number { return this.entries.size }
  get weight(): number { return this.total }

  get(key: string): V | undefined {
    const hit = this.entries.get(key)
    if (!hit) return undefined
    // Map order is insertion order: re-inserting marks the entry most recently used.
    this.entries.delete(key)
    this.entries.set(key, hit)
    return hit.value
  }

  set(key: string, value: V): void {
    const weight = this.weigh(value)
    const previous = this.entries.get(key)
    if (previous) {
      this.entries.delete(key)
      this.total -= previous.weight
    }
    // Larger than the whole budget: serve it, never keep it (it would evict everything else for one entry).
    if (weight > this.options.maxWeight) return
    this.entries.set(key, { value, weight })
    this.total += weight
    while (this.entries.size > this.options.maxEntries || this.total > this.options.maxWeight) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.total -= this.entries.get(oldest.value)!.weight
      this.entries.delete(oldest.value)
    }
  }

  /** The cached value for `key`, or `make()` stored under it. */
  getOrSet(key: string, make: () => V): V {
    const hit = this.get(key)
    if (hit !== undefined) return hit
    const value = make()
    this.set(key, value)
    return value
  }
}
