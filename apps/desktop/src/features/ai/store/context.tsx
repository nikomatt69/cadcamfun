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
import { createContext, createResource, createSignal, onCleanup, useContext, type Accessor, type JSX } from "solid-js"
import { createAiStore, type AiStore } from "./store.ts"
import { makeCatalog, type AiCatalogService, type OAuthAuthorization } from "../lib/models.ts"
import type { AiStatus, ModelInfo, ProviderId, ProviderInfo } from "../lib/types.ts"
import { useApp, type AppState } from "../../../shared/state/context.ts"
import { onCacheInvalidated } from "../../../shared/state/queries.ts"

export interface AiContextValue {
  readonly store: AiStore
  readonly app: AppState
  readonly aiStatus: Accessor<AiStatus | undefined>
  readonly models: Accessor<ReadonlyArray<ModelInfo>>
  /** The provider catalogue the settings browser reads; empty until it loads. */
  readonly providers: Accessor<ReadonlyArray<ProviderInfo>>
  readonly providersPending: Accessor<boolean>
  readonly refresh: () => void
  readonly refreshCatalogue: () => Promise<void>
  readonly catalogueRefreshing: Accessor<boolean>
  readonly catalogueError: Accessor<string | undefined>
  readonly saveCredentials: (provider: ProviderId, key: string, baseUrl?: string) => Promise<void>
  readonly removeCredentials: (provider: ProviderId) => Promise<void>
  readonly authorizeOAuth: (provider: "openai" | "xai") => Promise<OAuthAuthorization>
  readonly completeOAuth: (provider: "openai" | "xai", attemptId: string, code?: string) => Promise<void>
}

/** What every consumer of `useAiStore()` actually gets: the store plus the cached catalogue. */
export type AiStoreAndContext = AiStore & AiContextValue

const Ctx = createContext<AiContextValue>()

export const AiProvider = (props: { readonly children: JSX.Element }): JSX.Element => {
  const app = useApp()
  const store = createAiStore()
  const catalog: AiCatalogService = makeCatalog(app.client)

  const [statusEnabled, enableStatus] = createSignal(false)
  const [modelsEnabled, enableModels] = createSignal(false)
  const [providersEnabled, enableProviders] = createSignal(false)
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  const [statusResource, statusActions] = createResource(
    () => statusEnabled() && app.runtime,
    (runtime) => runtime.run(catalog.status, { signal: controller.signal }).catch(() => undefined)
  )
  const [modelsResource, modelsActions] = createResource(
    () => modelsEnabled() && app.runtime,
    (runtime) => runtime.run(catalog.models, { signal: controller.signal }).catch(() => [] as ReadonlyArray<ModelInfo>)
  )
  const [providersResource, providersActions] = createResource(
    () => providersEnabled() && app.runtime,
    (runtime) => runtime.run(catalog.providers, { signal: controller.signal }).catch(() => [] as ReadonlyArray<ProviderInfo>)
  )
  const refresh = (): void => {
    if (statusEnabled()) void statusActions.refetch()
    if (modelsEnabled()) void modelsActions.refetch()
    if (providersEnabled()) void providersActions.refetch()
  }
  onCacheInvalidated(app.cache, refresh)
  const [catalogueRefreshing, setCatalogueRefreshing] = createSignal(false)
  const [catalogueError, setCatalogueError] = createSignal<string>()
  const refreshCatalogue = async (): Promise<void> => {
    if (catalogueRefreshing()) return
    setCatalogueRefreshing(true); setCatalogueError(undefined)
    try {
      await app.runtime.run(app.client.ai.refreshModels(), { signal: controller.signal })
      await Promise.all([providersActions.refetch(), modelsEnabled() ? modelsActions.refetch() : undefined])
    } catch (error) {
      if (!controller.signal.aborted) setCatalogueError(error instanceof Error ? error.message : String(error))
    } finally { if (!controller.signal.aborted) setCatalogueRefreshing(false) }
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
      aiStatus: () => { enableStatus(true); return statusResource() as AiStatus | undefined },
      models: () => { enableModels(true); return (modelsResource() as ReadonlyArray<ModelInfo> | undefined) ?? [] },
      providers: () => { enableProviders(true); return (providersResource() as ReadonlyArray<ProviderInfo> | undefined) ?? [] },
      providersPending: () => { enableProviders(true); return providersResource.state === "pending" },
      refresh,
      refreshCatalogue, catalogueRefreshing, catalogueError,
      saveCredentials,
      removeCredentials,
      authorizeOAuth: (provider) => app.runtime.run(catalog.authorizeOAuth(provider)),
      completeOAuth: async (provider, attemptId, code) => {
        await app.runtime.run(catalog.completeOAuth(provider, attemptId, code))
        refresh()
      }
    },
    get children() { return props.children }
  })
}

export const useAiStore = (): AiStoreAndContext => {
  const ctx = useContext(Ctx)
  if (ctx === undefined) throw new Error("useAiStore must be called inside <AiProvider>")
  return new Proxy(ctx, {
    get(target, prop, receiver) {
      if (prop in target) return Reflect.get(target, prop, receiver)
      const value = (target.store as unknown as Record<string | symbol, unknown>)[prop]
      if (typeof value === "function") return Reflect.get(target.store, prop, receiver)
      return value
    }
  }) as AiStoreAndContext
}
