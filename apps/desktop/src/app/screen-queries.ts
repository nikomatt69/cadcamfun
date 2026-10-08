import { createSignal } from "solid-js"
import { Effect } from "effect"
import { ApiClient, type Client } from "../state/client.ts"
import { useQuery as stateQuery } from "../state/queries.ts"
import { invalidatePrefix } from "../state/query-cache.ts"
import type { ClientEffect, QueryOptions, QueryRuntime } from "../state/queries.ts"
import type { QueryCache } from "../state/query-cache.ts"

export const useQuery = <T,>(endpoint: string, params: Readonly<Record<string, unknown>> | undefined, read: (client: Client) => ClientEffect<T>, runtime: QueryRuntime, options?: QueryOptions) =>
  // `state/queries` binds the client through the ApiClient service itself, so the
  // read flows through unchanged (a thunk here made Effect reject the query).
  stateQuery(endpoint, params, read, runtime, options)

export const useMutation = <Args extends ReadonlyArray<unknown>, A>(write: (client: Client, ...args: Args) => ClientEffect<A>, runtime: QueryRuntime, invalidates: ReadonlyArray<string>, cache: QueryCache | undefined) => {
  const [pending, setPending] = createSignal(false)
  const [error, setError] = createSignal<unknown>()
  // The old helper drops the client argument; bind it through the service instead.
  const mutate = async (...args: Args): Promise<A> => {
    setPending(true)
    setError(undefined)
    try {
      const value = await runtime.run(Effect.flatMap(Effect.service(ApiClient), (client) => write(client, ...args)))
      if (cache) for (const prefix of invalidates) invalidatePrefix(cache, prefix)
      return value as A
    } catch (cause) { setError(cause); throw cause }
    finally { setPending(false) }
  }
  return { error, mutate, pending }
}
