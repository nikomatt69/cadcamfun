/**
 * The model picker, as a quiet footer trigger: model name + tier/variant, with the menu opening upward.
 *
 * It was a pair of components inside the assistant's main file; the file was the
 * only place that knew how a model menu behaves. Here it is on its own, with the
 * one rule every menu in the assistant follows (click outside or Escape closes it)
 * coming from `lib/dismiss.ts` instead of a third copy of it.
 */
import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import ChevronDown from "lucide-solid/icons/chevron-down"
import { t } from "../../../i18n/index.ts"
import { createDismissable } from "../lib/dismiss.ts"
import { useAiStore } from "../store/context.tsx"

export function ModelPicker(): JSX.Element {
  const ai = useAiStore()
  const [open, setOpen] = createSignal(false)
  const currentLabel = (): string => {
    const m = ai.model()
    if (m === undefined) return t("ai.model.label")
    return `${m.provider}/${m.model}`
  }
  const shortModel = (): string => {
    const m = ai.model()
    if (m === undefined) return t("ai.model.label")
    return m.model
  }
  const effortLabel = (): string | undefined => {
    const m = ai.model()
    if (m?.variant) return m.variant
    if (m?.tier) return t(`ai.model.tier.${m.tier}` as never)
    return undefined
  }

  createDismissable({ open, root: ".assistant-chip-root", onDismiss: () => setOpen(false) })

  return (
    <div class="assistant-chip-root">
      <button
        type="button"
        class="assistant-chip assistant-chip-model"
        aria-label={t("ai.model.label")}
        aria-expanded={open()}
        title={[currentLabel(), effortLabel()].filter(Boolean).join(" · ")}
        onClick={() => setOpen(!open())}
      >
        <span class="assistant-chip-value">{shortModel()}</span>
        <Show when={effortLabel()}>
          {(effort) => <span class="assistant-chip-effort">{effort()}</span>}
        </Show>
        <ChevronDown size={11} aria-hidden="true" class={open() ? "rotate-180 transition" : "transition"} />
      </button>
      <Show when={open()}>
        <ModelMenu onSelect={() => setOpen(false)} />
      </Show>
    </div>
  )
}

function ModelMenu(props: { readonly onSelect: () => void }): JSX.Element {
  const ai = useAiStore()
  const [search, setSearch] = createSignal("")
  const [provider, setProvider] = createSignal("")
  const [limit, setLimit] = createSignal(50)
  const available = createMemo(() => ai.models().filter((model) => model.configured))
  const providers = createMemo(() => [...new Set(available().map((model) => model.provider))].sort())
  const filtered = createMemo(() => {
    const query = search().trim().toLowerCase()
    return available().filter((model) => (!provider() || model.provider === provider()) && (!query || `${model.provider} ${model.id}`.toLowerCase().includes(query)))
  })
  return (
    <div class="assistant-popover" onKeyDown={(event) => { if (event.key === "Escape") props.onSelect() }}>
      <div class="assistant-popover-head space-y-1.5 p-2">
        <input type="search" aria-label={t("ai.model.search")} placeholder={t("ai.model.search")} class="assistant-field" value={search()} onInput={(event) => { setSearch(event.currentTarget.value); setLimit(50) }} />
        <select aria-label={t("ai.model.provider")} class="assistant-field" value={provider()} onChange={(event) => { setProvider(event.currentTarget.value); setLimit(50) }}>
          <option value="">{t("ai.model.allProviders")}</option>
          <For each={providers()}>{(id) => <option value={id}>{id}</option>}</For>
        </select>
      </div>
      <Show
        when={filtered().length > 0}
        fallback={
          <p class="px-3 py-2 text-xs assistant-meta-text">{t("ai.model.noModels")}</p>
        }
      >
        <ul class="assistant-popover-list">
          <For each={filtered().slice(0, limit())}>
            {(model) => (
              <li>
                <button
                  type="button"
                  class="assistant-popover-item"
                  disabled={!model.configured}
                  onClick={() => {
                    ai.setModel({ provider: model.provider, model: model.id, ...(model.tier === undefined ? {} : { tier: model.tier }) })
                    props.onSelect()
                  }}
                >
                  <span class="flex-1 min-w-0">
                    <div class="truncate text-xs font-medium" title={model.id}>{model.id}</div>
                    <div class="assistant-meta-text">
                      {model.provider}
                      <Show when={model.tier !== undefined}> · {t(`ai.model.tier.${model.tier}` as never)}</Show>
                    </div>
                  </span>
                  <Show when={!model.configured}>
                    <span class="assistant-status-warn text-[10px]">{t("ai.model.unconfigured")}</span>
                  </Show>
                </button>
              </li>
            )}
          </For>
        </ul>
        <Show when={filtered().length > limit()}>
          <button type="button" class="assistant-link-btn w-full px-3 py-2" onClick={() => setLimit((value) => value + 50)}>{t("ai.model.showMore", { count: filtered().length - limit() })}</button>
        </Show>
      </Show>
    </div>
  )
}
