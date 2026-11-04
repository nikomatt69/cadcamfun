/**
 * Job lists (spec 60 P5): a batch of parts programmed one after another by an injected runner, so the logic is independent of the
 * sidecar's job queue (which supplies the runner: deadline, worker semaphore, cache).
 *
 *  - one item failing never stops the others (`status: "failed"` with the message);
 *  - items with the same `key` run once (single-flight inside the list); the others report `cache-hit` with the same value;
 *  - an item that already has an accepted program is `skipped` and never overwritten;
 *  - progress is reported per item through `onProgress`.
 */
export interface JobListItem<I> {
  readonly id: string
  /** Canonical digest of the input (part, template, machine, material, stock): equal keys give equal results. */
  readonly key: string
  readonly input: I
  /** The part already has an accepted program: never overwrite it. */
  readonly hasAcceptedProgram?: boolean
}

export type JobItemOutcome<O> =
  | { readonly id: string; readonly status: "ok"; readonly value: O }
  | { readonly id: string; readonly status: "cache-hit"; readonly value: O; readonly sameAs: string }
  | { readonly id: string; readonly status: "failed"; readonly message: string }
  | { readonly id: string; readonly status: "skipped"; readonly reason: string }

export interface JobListProgress { readonly done: number; readonly total: number; readonly last: string }

export const runJobList = async <I, O>(
  items: ReadonlyArray<JobListItem<I>>,
  run: (input: I, item: JobListItem<I>) => Promise<O> | O,
  onProgress?: (p: JobListProgress) => void
): Promise<ReadonlyArray<JobItemOutcome<O>>> => {
  const flights = new Map<string, { readonly owner: string; readonly promise: Promise<{ ok: true; value: O } | { ok: false; message: string }> }>()
  let done = 0
  const outcomes = await Promise.all(items.map(async (item): Promise<JobItemOutcome<O>> => {
    const finish = <T extends JobItemOutcome<O>>(o: T): T => { done++; onProgress?.({ done, total: items.length, last: item.id }); return o }
    if (item.hasAcceptedProgram === true) return finish({ id: item.id, status: "skipped", reason: "the part already has an accepted program; it is never overwritten by a batch" })
    const flight = flights.get(item.key)
    const owner = flight === undefined
    const entry = flight ?? {
      owner: item.id,
      promise: (async () => {
        try { return { ok: true as const, value: await run(item.input, item) } } catch (e) { return { ok: false as const, message: e instanceof Error ? e.message : String(e) } }
      })()
    }
    if (owner) flights.set(item.key, entry)
    const r = await entry.promise
    if (!r.ok) return finish({ id: item.id, status: "failed", message: r.message })
    return finish(owner ? { id: item.id, status: "ok", value: r.value } : { id: item.id, status: "cache-hit", value: r.value, sameAs: entry.owner })
  }))
  return outcomes
}
