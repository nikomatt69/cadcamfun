/**
 * The provider & model browser behind Settings → AI (spec 08-ai.md §3).
 *
 * nikcli hands us the whole models.dev catalogue, so this is a browser rather than a
 * four-row form: one search box that matches providers *and* model ids, a row per
 * provider, and a row that expands into its API-key form plus its model list. Saving a
 * key goes to the sidecar credential store through the typed client; the UI never keeps
 * a key after saving, and picking a model stores it for the assistant (and for the CAM
 * generator's "Ask the AI").
 */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { ChevronDown, ChevronRight, KeyRound, Search, Trash2 } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { toast } from "../../../shared/ui/toast.tsx"
import { useAiStore } from "../store/context.tsx"
import type { ProviderInfo } from "../lib/types.ts"
import type { OAuthAuthorization } from "../lib/models.ts"
import { openExternal } from "../../../app/external.ts"

const FIELD = "assistant-field"

/** Only the endpoints we (or the user) may override carry an editable base URL. */
const needsBaseUrl = (id: string): boolean => id === "gateway" || id === "openai"

/** Provider id + label + every model id and name, so one search box finds both. */
const haystack = (p: ProviderInfo): string =>
  [p.id, p.name, ...p.models.flatMap((m) => [m.id, m.name])].join(" ").toLowerCase()

function ProviderRow(props: {
  readonly provider: ProviderInfo
  readonly open: boolean
  readonly onToggle: () => void
}): JSX.Element {
  const ai = useAiStore()
  const [key, setKey] = createSignal("")
  const [baseUrl, setBaseUrl] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [authorization, setAuthorization] = createSignal<OAuthAuthorization>()
  const [code, setCode] = createSignal("")
  const oauthProvider = (): "openai" | "xai" | undefined => {
    const id = props.provider.id
    return ai.aiStatus()?.host === "nikcli" && props.provider.auth.includes("oauth") && (id === "openai" || id === "xai") ? id : undefined
  }
  const [modelSearch, setModelSearch] = createSignal("")
  const [modelLimit, setModelLimit] = createSignal(50)
  const matchingModels = createMemo(() => props.provider.models.filter((model) => `${model.id} ${model.name}`.toLowerCase().includes(modelSearch().trim().toLowerCase())))
  /** The catalogue is the source of truth; the status call backs it up while it loads. */
  const configured = (): boolean =>
    props.provider.configured || ai.aiStatus()?.providers[props.provider.id] === "configured"

  const run = async (action: () => Promise<void>, success: string): Promise<void> => {
    setBusy(true)
    try {
      await action()
      toast.success(success)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t("ai.providers.failed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li class="assistant-provider-row" classList={{ "is-open": props.open, "is-configured": configured() }} data-testid={`ai-provider-${props.provider.id}`}>
      <button
        type="button"
        class="assistant-provider-summary"
        aria-expanded={props.open}
        onClick={props.onToggle}
      >
        <KeyRound size={12} aria-hidden="true" class="assistant-meta-text" />
        <span class="assistant-provider-name">{props.provider.name}</span>
        <span class="assistant-meta-text">
          {t("ai.catalogue.modelCount", { count: props.provider.models.length })}
        </span>
        <span class="assistant-pill" data-status={configured() ? "completed" : "idle"}>
          {configured() ? t("ai.status.configured") : t("ai.status.missing")}
        </span>
        {props.open ? <ChevronDown size={12} aria-hidden="true" class="assistant-meta-text" /> : <ChevronRight size={12} aria-hidden="true" class="assistant-meta-text" />}
      </button>
      <Show when={props.open}>
        <div class="assistant-provider-detail" data-testid="ai-provider-detail">
          <Show when={props.provider.id === "opencode" || props.provider.id === "opencode-go"}>
            <section class="space-y-1.5" data-testid="ai-provider-opencode-connect">
              <p class="assistant-meta-text">{props.provider.id === "opencode-go" ? t("ai.providers.openCodeGoHint") : t("ai.providers.openCodeZenHint")}</p>
              <button type="button" class="assistant-btn assistant-btn-secondary" onClick={() => openExternal("https://opencode.ai/auth")}>{t("ai.providers.openCodeAccount")}</button>
            </section>
          </Show>
          <Show when={oauthProvider()}>{(provider) => (
            <section class="space-y-1.5" data-testid="ai-provider-oauth">
              <p class="assistant-meta-text">{t("ai.providers.subscriptionHint")}</p>
              <Show when={!authorization()}>
                <button type="button" class="assistant-btn assistant-btn-primary" disabled={busy()} onClick={() => {
                  setBusy(true)
                  void ai.authorizeOAuth(provider()).then((result) => {
                    setAuthorization(result)
                    openExternal(result.url)
                  }).catch((cause: unknown) => toast.error(cause instanceof Error ? cause.message : t("ai.providers.failed"))).finally(() => setBusy(false))
                }}>{provider() === "openai" ? t("ai.providers.connectChatGPT") : t("ai.providers.connectSuperGrok")}</button>
              </Show>
              <Show when={authorization()}>{(attempt) => (
                <div class="space-y-1.5" aria-live="polite">
                  <p class="assistant-meta-text">{attempt().instructions}</p>
                  <button type="button" class="assistant-link-btn" onClick={() => openExternal(attempt().url)}>{t("ai.providers.openBrowser")}</button>
                  <Show when={attempt().method !== "auto"}>
                    <input class={FIELD} autocomplete="off" aria-label={t("ai.providers.authorizationCode")} placeholder={t("ai.providers.authorizationCode")} value={code()} onInput={(event) => setCode(event.currentTarget.value)} />
                  </Show>
                  <button type="button" class="assistant-btn assistant-btn-primary" disabled={busy() || (attempt().method === "code" && !code().trim())} onClick={() => {
                    void run(async () => {
                      try { await ai.completeOAuth(provider(), attempt().attemptId, code().trim() || undefined) }
                      finally { setAuthorization(undefined); setCode("") }
                    }, t("ai.providers.connected"))
                  }}>{busy() ? t("ai.providers.connecting") : t("ai.providers.finishSignIn")}</button>
                </div>
              )}</Show>
            </section>
          )}</Show>
          <form
            class="space-y-1.5"
            onSubmit={(event) => {
              event.preventDefault()
              const value = key().trim()
              if (value.length === 0) return
              void run(async () => {
                await ai.saveCredentials(props.provider.id, value, baseUrl().trim() || undefined)
                setKey("")
              }, t("ai.providers.saved"))
            }}
          >
            <input
              type="password"
              autocomplete="off"
              class={FIELD}
              data-testid="ai-provider-key"
              placeholder={t("ai.providers.keyPlaceholder")}
              value={key()}
              onInput={(event) => setKey(event.currentTarget.value)}
            />
            <Show when={needsBaseUrl(props.provider.id)}>
              <input
                type="url"
                class={FIELD}
                placeholder={t("ai.providers.baseUrl")}
                value={baseUrl()}
                onInput={(event) => setBaseUrl(event.currentTarget.value)}
              />
            </Show>
            <div class="flex gap-1.5 pt-0.5">
              <button
                type="submit"
                disabled={busy() || !!authorization() || key().trim().length === 0}
                class="assistant-btn assistant-btn-primary"
              >
                {t("ai.providers.save")}
              </button>
              <Show when={configured()}>
                <button
                  type="button"
                  disabled={busy() || !!authorization()}
                  class="assistant-btn assistant-btn-secondary is-danger"
                  onClick={() => void run(() => ai.removeCredentials(props.provider.id), t("ai.providers.removed"))}
                >
                  <Trash2 size={12} aria-hidden="true" />
                  {t("ai.providers.remove")}
                </button>
              </Show>
            </div>
          </form>
          <Show
            when={props.provider.models.length > 0}
            fallback={<p class="assistant-meta-text">{t("ai.catalogue.noProviderModels")}</p>}
          >
            <div class="space-y-1.5 pt-1">
              <div class="assistant-section-label">{t("ai.catalogue.modelsLabel")}</div>
              <input type="search" class={FIELD} aria-label="Search provider models" placeholder="Search provider models" value={modelSearch()} onInput={(event) => { setModelSearch(event.currentTarget.value); setModelLimit(50) }} />
              <ul class="assistant-model-list">
                <For each={matchingModels().slice(0, modelLimit())}>
                  {(model) => (
                    <li>
                      <button
                        type="button"
                        data-testid="ai-model-option"
                        disabled={!configured()}
                        class="assistant-model-option"
                        onClick={() => ai.setModel({ provider: props.provider.id, model: model.id })}
                      >
                        <span class="flex-1 min-w-0">
                          <span class="font-mono">{model.id}</span>
                          <span class="block assistant-meta-text">{model.name}</span>
                        </span>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
              <Show when={matchingModels().length > modelLimit()}><button type="button" class="assistant-link-btn" onClick={() => setModelLimit((value) => value + 50)}>{t("ai.model.showMore", { count: matchingModels().length - modelLimit() })}</button></Show>
            </div>
          </Show>
        </div>
      </Show>
    </li>
  )
}

export function ProviderSettings(): JSX.Element {
  const ai = useAiStore()
  const [search, setSearch] = createSignal("")
  const [openId, setOpenId] = createSignal<string | undefined>(undefined)

  const index = createMemo(() => ai.providers().map((provider) => ({ provider, text: haystack(provider) })))
  const filtered = createMemo(() => {
    const q = search().trim().toLowerCase()
    const matching = index().filter((entry) => !q || entry.text.includes(q)).map((entry) => entry.provider)
    const status = ai.aiStatus()?.providers
    const connected = (provider: ProviderInfo) => provider.configured || status?.[provider.id] === "configured"
    return [...matching].sort((a, b) => Number(connected(b)) - Number(connected(a)) || a.name.localeCompare(b.name))
  })
  const totalModels = (): number => ai.providers().reduce((sum, p) => sum + p.models.length, 0)

  return (
    <div class="space-y-2" data-testid="ai-provider-settings">
      <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">{t("ai.providers.title")}</h4>
      <Show when={ai.providers().length > 0}>
        <div class="text-xs text-gray-500" data-testid="ai-catalogue-counts">
          {t("ai.catalogue.providerCount", { count: ai.providers().length })} ·{" "}
          {t("ai.catalogue.modelCount", { count: totalModels() })}
        </div>
      </Show>
      <div class="relative">
        <input
          type="search"
          class={FIELD}
          data-testid="ai-provider-search"
          placeholder={t("ai.catalogue.search")}
          value={search()}
          onInput={(event) => setSearch(event.currentTarget.value)}
        />
      </div>
      <Show when={ai.model()}>
        {(model) => (
          <div class="flex items-center gap-1 text-xs" data-testid="ai-current-model">
            <span class="text-gray-400">{t("ai.model.current")}:</span>
            <span class="font-mono text-gray-700 dark:text-gray-300">
              {model().provider}/{model().model}
            </span>
          </div>
        )}
      </Show>
      <Show
        when={filtered().length > 0}
        fallback={
          <p class="text-xs text-gray-400" data-testid="ai-provider-empty">
            {ai.providers().length === 0
              ? ai.providersPending()
                ? t("ai.catalogue.loading")
                : t("ai.catalogue.unavailable")
              : t("ai.catalogue.noMatches")}
          </p>
        }
      >
        <ul class="space-y-2">
          <For each={filtered()}>
            {(provider) => (
              <ProviderRow
                provider={provider}
                open={openId() === provider.id}
                onToggle={() => setOpenId(openId() === provider.id ? undefined : provider.id)}
              />
            )}
          </For>
        </ul>
      </Show>
    </div>
  )
}
