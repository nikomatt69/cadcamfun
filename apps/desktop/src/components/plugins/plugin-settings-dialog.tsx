/**
 * `PluginSettingsDialog` — `.reference/src/components/plugins/PluginSettingsDialog.tsx`.
 *
 * The dialog the legacy detail page opens from "Configure": one input per
 * `manifest.configuration.properties` entry, initialised with the schema defaults merged
 * under the plugin's stored config, saved through `PUT /api/plugins/:id/config`
 * (`plugins.updateConfig`).
 *
 * The legacy `Dialog` primitive is replaced by a fixed overlay with the same
 * `role="dialog"` contract the plugin list's dialogs already use.
 */
import { For, Show, createEffect, createSignal, onCleanup, type JSX } from "solid-js"
import { AlertCircle, Info, Loader, Save, X } from "lucide-solid"
import { t } from "../../i18n/index.ts"
import { useApp } from "../../state/context.ts"
import { Effect } from "effect"

export interface ConfigProperty {
  readonly type: string
  readonly default?: unknown
  readonly description?: string
  readonly minimum?: number
  readonly maximum?: number
}

export interface ConfigSchema {
  readonly properties?: Readonly<Record<string, ConfigProperty>>
}

export interface PluginSettingsDialogProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly pluginId: string
  readonly pluginName?: string
  readonly initialSettings?: Readonly<Record<string, unknown>> | null
  readonly configSchema?: ConfigSchema | null
}

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"

const label = (key: string): string => {
  const spaced = key.replace(/([A-Z])/g, " $1")
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function PluginSettingsDialog(props: PluginSettingsDialogProps): JSX.Element {
  const app = useApp()
  const [settings, setSettings] = createSignal<Record<string, unknown>>({})
  const [loading, setLoading] = createSignal(true)
  const [saving, setSaving] = createSignal(false)
  const [error, setError] = createSignal<string>()
  const [saved, setSaved] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  onCleanup(() => {
    if (timer !== undefined) clearTimeout(timer)
  })

  const properties = (): Readonly<Record<string, ConfigProperty>> => props.configSchema?.properties ?? {}
  const hasSettings = (): boolean => Object.keys(properties()).length > 0

  createEffect(() => {
    if (!props.open) {
      setLoading(true)
      setSaved(false)
      setError(undefined)
      return
    }
    setLoading(true)
    setError(undefined)
    setSaved(false)
    try {
      const defaults: Record<string, unknown> = {}
      for (const [key, schema] of Object.entries(properties())) {
        if (schema.default !== undefined) defaults[key] = schema.default
      }
      setSettings({ ...defaults, ...(props.initialSettings ?? {}) })
      setLoading(false)
    } catch {
      setError(t("plugins.settings.prepareFailed"))
      setLoading(false)
    }
  })

  const change = (key: string, value: unknown): void => {
    setSettings((previous) => ({ ...previous, [key]: value }))
    setSaved(false)
    setError(undefined)
  }

  const save = async (): Promise<void> => {
    if (!props.pluginId || saving()) return
    setSaving(true)
    setError(undefined)
    setSaved(false)
    try {
      await app.runtime.run(Effect.asVoid(app.client.plugins.updateConfig({
        params: { id: props.pluginId },
        payload: { ...settings() }
      })))
      setSaved(true)
      timer = setTimeout(() => props.onClose(), 1000)
    } catch (cause) {
      setError(typeof cause === "string" ? cause : cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  const renderInput = (key: string, schema: ConfigProperty): JSX.Element => {
    const value = () => settings()[key]
    if (schema.type === "boolean") {
      return (
        <div class="flex items-center">
          <input
            id={`setting-${key}`}
            type="checkbox"
            checked={value() === true}
            onChange={(event) => change(key, event.currentTarget.checked)}
            class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-700"
          />
        </div>
      )
    }
    if (schema.type === "number") {
      return (
        <input
          id={`setting-${key}`}
          type="number"
          value={value() === undefined || value() === null ? "" : String(value())}
          min={schema.minimum}
          max={schema.maximum}
          onInput={(event) => {
            const raw = event.currentTarget.value
            change(key, raw === "" ? undefined : Number.parseFloat(raw))
          }}
          class={inputClass}
        />
      )
    }
    if (schema.type === "array" || schema.type === "object") {
      return (
        <textarea
          id={`setting-${key}`}
          rows={4}
          class={`${inputClass} font-mono text-sm`}
          value={value() === undefined ? "" : JSON.stringify(value(), null, 2)}
          onInput={(event) => {
            const raw = event.currentTarget.value.trim()
            if (raw === "") { change(key, undefined); return }
            try {
              const parsed: unknown = JSON.parse(raw)
              const valid = schema.type === "array" ? Array.isArray(parsed) : typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
              if (valid) change(key, parsed)
            } catch {
              // Legacy ignores JSON errors while typing, keeping the last valid value.
            }
          }}
        />
      )
    }
    return (
      <input
        id={`setting-${key}`}
        type="text"
        value={value() === undefined || value() === null ? "" : String(value())}
        onInput={(event) => change(key, event.currentTarget.value)}
        class={inputClass}
      />
    )
  }

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-[1060] flex items-center justify-center bg-black/50 p-4"
        onClick={(event) => { if (event.target === event.currentTarget && !saving()) props.onClose() }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("plugins.settings.title", { name: props.pluginName ?? props.pluginId })}
          class="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800"
        >
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
              {t("plugins.settings.title", { name: props.pluginName ?? props.pluginId })}
            </h2>
            <button type="button" aria-label={t("common.close")} disabled={saving()} onClick={props.onClose}>
              <X size={20} />
            </button>
          </div>

          <Show
            when={!loading()}
            fallback={
              <div class="flex items-center justify-center py-12">
                <Loader class="mr-2 animate-spin text-blue-500" />
                <span class="text-gray-600 dark:text-gray-300">{t("plugins.settings.loading")}</span>
              </div>
            }
          >
            <Show
              when={error() === undefined || saving()}
              fallback={
                <div class="rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                  <div class="flex items-start">
                    <AlertCircle class="mr-2 mt-0.5 flex-shrink-0 text-red-500" />
                    <div>
                      <h3 class="mb-1 font-medium text-red-600 dark:text-red-400">{t("plugins.settings.errorTitle")}</h3>
                      <p class="text-sm text-gray-600 dark:text-gray-300">{error()}</p>
                    </div>
                  </div>
                </div>
              }
            >
              <Show
                when={hasSettings()}
                fallback={
                  <div class="p-6 text-center">
                    <Info class="mx-auto mb-3 text-gray-400 dark:text-gray-500" size={32} />
                    <h3 class="mb-2 text-lg font-medium text-gray-700 dark:text-gray-300">{t("plugins.settings.noSettings")}</h3>
                    <p class="text-gray-500 dark:text-gray-400">{t("plugins.settings.noSettingsBody")}</p>
                  </div>
                }
              >
                <div class="space-y-6">
                  <For each={Object.entries(properties())}>
                    {([key, schema]) => (
                      <div class="mb-4">
                        <label class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300" for={`setting-${key}`}>
                          {label(key)}
                        </label>
                        {renderInput(key, schema)}
                        <Show when={schema.description !== undefined}>
                          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{schema.description}</p>
                        </Show>
                      </div>
                    )}
                  </For>

                  <Show when={error() !== undefined && saving()}>
                    <div class="flex items-start rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800/30 dark:bg-red-900/20">
                      <AlertCircle class="mr-2 mt-0.5 flex-shrink-0 text-red-500" size={16} />
                      <span class="text-sm text-red-600 dark:text-red-400">{t("plugins.settings.saveFailed", { error: error() ?? "" })}</span>
                    </div>
                  </Show>
                  <Show when={saved()}>
                    <div class="flex items-start rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-800/30 dark:bg-green-900/20">
                      <Save class="mr-2 mt-0.5 flex-shrink-0 text-green-500" size={16} />
                      <span class="text-sm text-green-600 dark:text-green-400">{t("plugins.settings.saved")}</span>
                    </div>
                  </Show>
                </div>
              </Show>
            </Show>

            <Show when={hasSettings()}>
              <div class="mt-8 flex justify-end space-x-3 border-t border-gray-200 pt-5 dark:border-gray-700">
                <button
                  type="button"
                  class="rounded-md px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
                  disabled={saving()}
                  onClick={props.onClose}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  class="flex min-w-[90px] items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
                  disabled={saving() || saved()}
                  onClick={() => void save()}
                >
                  <Show
                    when={!saving()}
                    fallback={
                      <>
                        <Loader class="mr-2 animate-spin" size={16} />
                        {t("plugins.settings.saving")}
                      </>
                    }
                  >
                    <Show
                      when={!saved()}
                      fallback={
                        <>
                          <Save class="mr-2" size={16} />
                          {t("plugins.settings.savedShort")}
                        </>
                      }
                    >
                      {t("plugins.settings.save")}
                    </Show>
                  </Show>
                </button>
              </div>
            </Show>
          </Show>
        </div>
      </div>
    </Show>
  )
}
