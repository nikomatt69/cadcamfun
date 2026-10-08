/**
 * The query helpers bind the screen's `(client) => Effect` through the `ApiClient`
 * service, so `runtime.run` always receives a concrete effect. Passing the raw
 * function made Effect reject with "Not a valid effect" and the Projects screen
 * failed to load while the rest of the suite stayed green (nothing else ran
 * through this helper).
 */
import { describe, expect, test } from "bun:test"
import { fakeRuntime } from "../src/state/client.ts"
import { createQueryCache } from "../src/state/query-cache.ts"
import { useMutation, useQuery } from "../src/app/screen-queries.ts"

/** Polls until `done` resolves or the deadline passes; the reads settle over the in-memory transport. */
const until = async (done: () => boolean, ms = 1_000): Promise<boolean> => {
  const start = Date.now()
  while (!done() && Date.now() - start < ms) await new Promise((resolve) => { setTimeout(resolve, 10) })
  return done()
}

describe("the query helpers bind the client through the service", () => {
  test("a read resolves to data instead of rejecting with Not a valid effect", async () => {
    const { runtime } = fakeRuntime()
    const cache = createQueryCache()
    const query = useQuery<ReadonlyArray<{ readonly id: string }>>(
      "projects",
      undefined,
      (client) => client.projects.list(),
      { run: runtime.run, cache },
      { cache }
    )
    const settled = await until(() => query.state()._tag !== "loading")
    expect(settled).toBe(true)
    expect(query.state()._tag).toBe("success")
    expect(Array.isArray(query.data())).toBe(true)
    expect(query.error()).toBeUndefined()
  })

  test("a mutation binds the client, returns the value and clears pending", async () => {
    const { runtime } = fakeRuntime()
    const cache = createQueryCache()
    const mutation = useMutation(
      (client, name: string) => client.projects.create({ payload: { name, description: null } }),
      { run: runtime.run, cache },
      ["projects"],
      cache
    )
    const created = await mutation.mutate("Query helper regression")
    expect(created).toBeDefined()
    expect(mutation.pending()).toBe(false)
    expect(mutation.error()).toBeUndefined()
  })
})
