/**
 * Provider + model picker for the nikcli-backed assistant: set or remove an API key per provider and choose
 * the model the assistant (and the CAM generator's "Ask the AI") runs on. Keys go to the sidecar credential
 * store through the typed client; the UI never keeps a key after saving.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { KeyRound, Trash2 } from "lucide-solid"
import { t } from "../i18n/index.ts"
import { toast } from "../components/ui/toast.tsx"
import { useAiStore } from "./context.tsx"
import type { ProviderId } from "./types.ts"

const PROVIDERS: ReadonlyArray<ProviderId> = ["anthropic", "openai", "minimax", "gateway"]

const FIELD = "w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"

function ProviderRow(props: { readonly provider: ProviderId }): JSX.Element {
  const ai = useAiStore()
  const [key, setKey] = createSignal("")
  const [baseUrl, setBaseUrl] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const configured = (): boolean => ai.aiStatus()?.providers[props.provider] === "configured"

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
    <li class="rounded-md border border-gray-200 dark:border-gray-700 p-2" data-testid={`ai-provider-${props.provider}`}>
      <div class="mb-1 flex items-center gap-2 text-xs font-medium">
        <KeyRound size={12} aria-hidden="true" />
        <span class="flex-1">{t(`ai.model.provider.${props.provider}` as never)}</span>
        <span class={configured() ? "text-green-600" : "text-gray-400"}>
          {configured() ? t("ai.status.configured") : t("ai.status.missing")}
        </span>
      </div>
      <form
        class="space-y-1"
        onSubmit={(event) => {
          event.preventDefault()
          const value = key().trim()
          if (value.length === 0) return
          void run(async () => {
            await ai.saveCredentials(props.provider, value, baseUrl().trim() || undefined)
            setKey("")
          }, t("ai.providers.saved"))
        }}
      >
        <input type="password" autocomplete="off" class={FIELD} placeholder={t("ai.providers.keyPlaceholder")} value={key()} onInput={(event) => setKey(event.currentTarget.value)} />
        <Show when={props.provider === "gateway" || props.provider === "openai"}>
          <input type="url" class={FIELD} placeholder={t("ai.providers.baseUrl")} value={baseUrl()} onInput={(event) => setBaseUrl(event.currentTarget.value)} />
        </Show>
        <div class="flex gap-1">
          <button type="submit" disabled={busy() || key().trim().length === 0} class="rounded bg-blue-600 px-2 py-1 text-xs text-white disabled:opacity-40">{t("ai.providers.save")}</button>
          <Show when={configured()}>
            <button type="button" disabled={busy()} class="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => void run(() => ai.removeCredentials(props.provider), t("ai.providers.removed"))}>
              <Trash2 size={12} aria-hidden="true" />{t("ai.providers.remove")}
            </button>
          </Show>
        </div>
      </form>
    </li>
  )
}

export function ModelSelect(): JSX.Element {
  const ai = useAiStore()
  const value = (): string => {
    const m = ai.model()
    return m ? `${m.provider}/${m.model}` : ""
  }
  return (
    <select
      class={FIELD}
      aria-label={t("ai.model.label")}
      data-testid="ai-model-select"
      value={value()}
      onChange={(event) => {
        const picked = ai.models().find((m) => `${m.provider}/${m.id}` === event.currentTarget.value)
        if (picked) ai.setModel({ provider: picked.provider, model: picked.id, tier: picked.tier })
      }}
    >
      <option value="">{t("ai.model.select")}</option>
      <For each={ai.models()}>
        {(m) => (
          <option value={`${m.provider}/${m.id}`} disabled={!m.configured}>
            {m.id} · {t(`ai.model.provider.${m.provider}` as never)}{m.configured ? "" : ` (${t("ai.model.unconfigured")})`}
          </option>
        )}
      </For>
    </select>
  )
}

export function ProviderSettings(): JSX.Element {
  return (
    <div class="space-y-2" data-testid="ai-provider-settings">
      <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">{t("ai.providers.title")}</h4>
      <ModelSelect />
      <ul class="space-y-2"><For each={PROVIDERS}>{(provider) => <ProviderRow provider={provider} />}</For></ul>
    </div>
  )
}
