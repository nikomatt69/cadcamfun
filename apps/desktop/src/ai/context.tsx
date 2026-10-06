/**
 * The AI store context (spec 06-desktop-ui.md §1 + spec 08-ai.md §3).
 *
 * The store is created lazily, on first read, inside an `AiProvider` mounted
 * at the shell root. The provider also owns the cached `AiStatus` and
 * model catalogue (loaded through the typed sidecar client), so the UI can
 * render them without the store knowing anything about the HTTP layer.
 *
 * Consumers follow Solid's reactivity rule: every value is a getter that is
 * called inside JSX, never destructured.
 */
import { createContext, createResource, useContext, type Accessor, type JSX } from "solid-js"
import { createAiStore, type AiStore } from "./store.ts"
import { makeCatalog, type AiCatalogService } from "./models.ts"
import type { AiStatus, ModelInfo } from "./types.ts"
import { useApp, type AppState } from "../state/context.ts"

interface AiContextValue {
  readonly store: AiStore
  readonly app: AppState
  readonly aiStatus: Accessor<AiStatus | undefined>
  readonly models: Accessor<ReadonlyArray<ModelInfo>>
  readonly refresh: () => void
}

const Ctx = createContext<AiContextValue>()

export const AiProvider = (props: { readonly children: JSX.Element }): JSX.Element => {
  const app = useApp()
  const store = createAiStore()
  const catalog: AiCatalogService = makeCatalog(app.client)

  const [statusResource, statusActions] = createResource(
    () => app.runtime,
    (runtime) => runtime.run(catalog.status).catch(() => undefined)
  )
  const [modelsResource, modelsActions] = createResource(
    () => app.runtime,
    (runtime) => runtime.run(catalog.models).catch(() => [] as ReadonlyArray<ModelInfo>)
  )
  const refresh = (): void => {
    void statusActions.refetch()
    void modelsActions.refetch()
  }

  return Ctx.Provider({
    value: {
      store,
      app,
      aiStatus: () => statusResource() as AiStatus | undefined,
      models: () => (modelsResource() as ReadonlyArray<ModelInfo> | undefined) ?? [],
      refresh
    },
    get children() { return props.children }
  })
}

export const useAiStore = (): AiStore & AiContextValue => {
  const ctx = useContext(Ctx)
  if (ctx === undefined) throw new Error("useAiStore must be called inside <AiProvider>")
  return new Proxy(ctx, {
    get(target, prop, receiver) {
      if (prop in target) return Reflect.get(target, prop, receiver)
      const value = (target.store as unknown as Record<string | symbol, unknown>)[prop]
      if (typeof value === "function") return Reflect.get(target.store, prop, receiver)
      return value
    }
  }) as AiStore & AiContextValue
}