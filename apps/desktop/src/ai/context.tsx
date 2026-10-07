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
import type { AiStatus, ModelInfo, ProviderId, ProviderInfo } from "./types.ts"
import { useApp, type AppState } from "../state/context.ts"

interface AiContextValue {
  readonly store: AiStore
  readonly app: AppState
  readonly aiStatus: Accessor<AiStatus | undefined>
  readonly models: Accessor<ReadonlyArray<ModelInfo>>
  /** The provider catalogue the settings browser reads; empty until it loads. */
  readonly providers: Accessor<ReadonlyArray<ProviderInfo>>
  readonly providersPending: Accessor<boolean>
  readonly refresh: () => void
  readonly saveCredentials: (provider: ProviderId, key: string, baseUrl?: string) => Promise<void>
  readonly removeCredentials: (provider: ProviderId) => Promise<void>
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
  const [providersResource, providersActions] = createResource(
    () => app.runtime,
    (runtime) => runtime.run(catalog.providers).catch(() => [] as ReadonlyArray<ProviderInfo>)
  )
  const refresh = (): void => {
    void statusActions.refetch()
    void modelsActions.refetch()
    // The catalogue carries the key state, so the rows only flip to "Configured" when it is re-read.
    void providersActions.refetch()
  }

  const saveCredentials = async (provider: ProviderId, key: string, baseUrl?: string): Promise<void> => {
    await app.runtime.run(catalog.setCredentials({ provider, key, ...(baseUrl ? { baseUrl } : {}) }))
    refresh()
  }
  const removeCredentials = async (provider: ProviderId): Promise<void> => {
    await app.runtime.run(catalog.clearCredentials(provider))
    refresh()
  }

  return Ctx.Provider({
    value: {
      store,
      app,
      aiStatus: () => statusResource() as AiStatus | undefined,
      models: () => (modelsResource() as ReadonlyArray<ModelInfo> | undefined) ?? [],
      providers: () => (providersResource() as ReadonlyArray<ProviderInfo> | undefined) ?? [],
      providersPending: () => providersResource.state === "pending",
      refresh,
      saveCredentials,
      removeCredentials
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