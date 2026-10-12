/**
 * A zustand-shaped store on Solid signals.
 *
 * The legacy app keeps its editor state in zustand stores (`useCADStore`, `useElementsStore`,
 * ...). Porting every store action 1:1 keeps behaviour identical, so the stores keep the
 * same `create((set, get) => ({ ...state, ...actions }))` definition. The difference is how a
 * component reads them:
 *
 *  - `useStore()` returns a reactive view: `store.viewMode` inside a tracking scope (JSX,
 *    `createEffect`, `createMemo`) subscribes to that key only. Never destructure it in a
 *    component body: that reads once and loses reactivity.
 *  - `useStore(selector)` returns an accessor, `const elements = useStore(s => s.elements)`
 *    and then `elements()` (the equivalent of the React hook's return value).
 *  - `useStore.getState()` / `setState()` / `subscribe()` behave as in zustand and are the
 *    way for non-component code (other stores, handlers) to reach the state.
 *
 * `set` has zustand's semantics: a partial object (or a function returning one) is shallowly
 * merged, replacing each given key by reference; `set(state, true)` replaces everything.
 */
import { batch, createMemo, createSignal, untrack, type Accessor, type Setter } from "solid-js"

type Listener<T> = (state: T, previous: T) => void
export type SetState<T> = (partial: Partial<T> | T | ((state: T) => Partial<T> | T), replace?: boolean) => void
export type GetState<T> = () => T

export interface StoreApi<T> {
  getState: GetState<T>
  setState: SetState<T>
  /** `subscribe(listener)` or, like `subscribeWithSelector`, `subscribe(selector, listener, { equalityFn })`. */
  subscribe: {
    (listener: Listener<T>): () => void
    <U>(selector: (state: T) => U, listener: (selected: U, previous: U) => void, options?: { equalityFn?: (a: U, b: U) => boolean; fireImmediately?: boolean }): () => void
  }
}

export interface UseStore<T> extends StoreApi<T> {
  (): T
  <U>(selector: (state: T) => U): Accessor<U>
}

type Initializer<T> = (set: SetState<T>, get: GetState<T>, api: StoreApi<T>) => T

/** Zustand's `subscribeWithSelector` middleware: the store already supports selector subscriptions. */
export const subscribeWithSelector = <T>(init: Initializer<T>): Initializer<T> => init
/** Zustand's `devtools`/`persist`-style middlewares are not needed here; this keeps ported stores compiling. */
export const devtools = subscribeWithSelector

export function create<T extends object>(): (init: Initializer<T>) => UseStore<T>
export function create<T extends object>(init: Initializer<T>): UseStore<T>
export function create<T extends object>(init?: Initializer<T>): UseStore<T> | ((init: Initializer<T>) => UseStore<T>) {
  if (init === undefined) return (next: Initializer<T>) => create<T>(next)
  return createStore(init)
}

function createStore<T extends object>(init: Initializer<T>): UseStore<T> {
  const signals = new Map<PropertyKey, [Accessor<unknown>, Setter<unknown>]>()
  const raw = {} as Record<PropertyKey, unknown>
  const listeners = new Set<Listener<T>>()

  const signalOf = (key: PropertyKey) => {
    let entry = signals.get(key)
    if (!entry) {
      const [read, write] = createSignal<unknown>(raw[key], { equals: false })
      entry = [read, write as Setter<unknown>]
      signals.set(key, entry)
    }
    return entry
  }

  // Reads inside a tracking scope subscribe to the key; `getState` snapshots without tracking.
  const view = new Proxy({} as T, {
    get: (_target, key) => {
      signalOf(key)[0]()
      return raw[key]
    },
    has: (_target, key) => key in raw,
    ownKeys: () => Reflect.ownKeys(raw),
    getOwnPropertyDescriptor: (_target, key) => key in raw ? { enumerable: true, configurable: true, value: raw[key] } : undefined
  })

  const snapshot = (): T => ({ ...raw }) as T
  const getState: GetState<T> = () => untrack(snapshot)

  const setState: SetState<T> = (partial, replace = false) => {
    const previous = snapshot()
    const next = typeof partial === "function" ? (partial as (state: T) => Partial<T> | T)(previous) : partial
    if (next === previous) return
    batch(() => {
      if (replace) for (const key of Object.keys(raw)) if (!(key in (next as object))) { delete raw[key]; signals.get(key)?.[1](undefined) }
      for (const [key, value] of Object.entries(next as object)) {
        if (Object.is(raw[key], value)) continue
        raw[key] = value
        signalOf(key)[1](value)
      }
    })
    for (const listener of [...listeners]) listener(snapshot(), previous)
  }

  const subscribe = ((first: unknown, second?: unknown, options?: { equalityFn?: (a: unknown, b: unknown) => boolean; fireImmediately?: boolean }) => {
    if (typeof second !== "function") {
      const listener = first as Listener<T>
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    }
    const selector = first as (state: T) => unknown
    const equal = options?.equalityFn ?? Object.is
    const handler: Listener<T> = (state, previous) => {
      const next = selector(state); const before = selector(previous)
      if (!equal(next, before)) (second as (a: unknown, b: unknown) => void)(next, before)
    }
    listeners.add(handler)
    if (options?.fireImmediately) (second as (a: unknown, b: unknown) => void)(selector(snapshot()), selector(snapshot()))
    return () => { listeners.delete(handler) }
  }) as StoreApi<T>["subscribe"]
  const api: StoreApi<T> = { getState, setState, subscribe }
  Object.assign(raw, init(setState, getState, api))

  const useStore = ((selector?: (state: T) => unknown) =>
    selector === undefined ? view : createMemo(() => selector(view))) as UseStore<T>
  return Object.assign(useStore, api)
}
