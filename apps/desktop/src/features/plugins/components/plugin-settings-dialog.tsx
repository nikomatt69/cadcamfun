/**
 * `PluginSettingsDialog` — `.reference/src/components/plugins/PluginSettingsDialog.tsx`.
 *
 * The dialog the legacy detail page opens from "Configure": one input per
 * `manifest.configuration.properties` entry, initialised with the schema defaults merged
 * under the plugin's stored config, saved through `PUT /api/plugins/:id/config`
 * (`plugins.updateConfig`).
 *
 * The shared modal supplies consistent focus, dismissal and reduced-motion behavior.
 */
import { For, Show, createEffect, createSignal, onCleanup, type JSX } from "solid-js"
import { AlertCircle, Info, Loader, Save } from "lucide-solid"
import { t } from "../../../i18n/index.ts"
import { useApp } from "../../../shared/state/context.ts"
import { Effect } from "effect"
import { Modal } from "../../../shared/ui/modal.tsx"
import { NumberField } from "../../cad/components/property-inputs/NumberField.tsx"

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
  "w-full rounded-md border border-[color:var(--ent-line-strong)] bg-[color:var(--ent-surface)] px-3 py-2 text-[color:var(--ent-text)] focus:border-[color:var(--ent-accent)] focus:ring-[color:var(--ent-accent)]"

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
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
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
        <NumberField
          id={`setting-${key}`}
          optional
          value={value() === undefined || value() === null ? "" : value()}
          min={schema.minimum}
          max={schema.maximum}
          onChange={(next) => change(key, next)}
          onClear={() => change(key, undefined)}
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
    <Modal open={props.open} title={t("plugins.settings.title", { name: props.pluginName ?? props.pluginId })} size="lg" closable={!saving()} onClose={() => { if (!saving()) props.onClose() }}>
          <Show
            when={!loading()}
            fallback={
              <div class="flex items-center justify-center py-12">
                <Loader class="mr-2 motion-safe:animate-spin text-[color:var(--ent-accent)]" size={14} aria-hidden="true" />
                <span class="text-[color:var(--ent-text-muted)]">{t("plugins.settings.loading")}</span>
              </div>
            }
          >
            <Show when={error() !== undefined}>
                <div role="alert" class="mb-4 rounded-md bg-[color:var(--ent-bad-soft)] p-3">
                  <div class="flex items-start">
                    <AlertCircle class="mr-2 mt-0.5 flex-shrink-0 text-[color:var(--ent-bad)]" size={14} aria-hidden="true" />
                    <div>
                      <h3 class="mb-1 font-medium text-[color:var(--ent-bad)]">{t("plugins.settings.errorTitle")}</h3>
                      <p class="text-sm text-[color:var(--ent-text-muted)]">{error()}</p>
                    </div>
                  </div>
                </div>
            </Show>
              <Show
                when={hasSettings()}
                fallback={
                  <div class="p-6 text-center">
                    <Info class="mx-auto mb-3 text-[color:var(--ent-text-faint)]" size={24} aria-hidden="true" />
                    <h3 class="mb-2 text-sm font-medium text-[color:var(--ent-text)]">{t("plugins.settings.noSettings")}</h3>
                    <p class="text-[color:var(--ent-text-muted)]">{t("plugins.settings.noSettingsBody")}</p>
                  </div>
                }
              >
                <div class="space-y-4">
                  <For each={Object.entries(properties())}>
                    {([key, schema]) => (
                      <div>
                        <label class="mb-1 block text-sm font-medium text-[color:var(--ent-text)]" for={`setting-${key}`}>
                          {label(key)}
                        </label>
                        {renderInput(key, schema)}
                        <Show when={schema.description !== undefined}>
                          <p class="mt-1 text-xs text-[color:var(--ent-text-muted)]">{schema.description}</p>
                        </Show>
                      </div>
                    )}
                  </For>

                  <Show when={saved()}>
                    <div role="status" class="flex items-start rounded-md bg-[color:var(--ent-ok-soft)] p-3">
                      <Save class="mr-2 mt-0.5 flex-shrink-0 text-[color:var(--ent-ok)]" size={14} aria-hidden="true" />
                      <span class="text-sm text-[color:var(--ent-ok)]">{t("plugins.settings.saved")}</span>
                    </div>
                  </Show>
                </div>
              </Show>

            <Show when={hasSettings()}>
              <div class="mt-6 flex justify-end gap-2 border-t border-[color:var(--ent-line)] pt-4">
                <button
                  type="button"
                  class="rounded-md px-4 py-2 text-sm font-medium text-[color:var(--ent-text-muted)] transition-colors hover:bg-[color:var(--ent-surface-subtle)] disabled:opacity-50"
                  disabled={saving()}
                  onClick={props.onClose}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  class="flex min-w-[90px] items-center justify-center rounded-md bg-[color:var(--ent-action)] px-4 py-2 text-sm font-medium text-[color:var(--ent-action-text)] transition-colors hover:bg-[color:var(--ent-action-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={saving() || saved()}
                  onClick={() => void save()}
                >
                  <Show
                    when={!saving()}
                    fallback={
                      <>
                        <Loader class="mr-2 motion-safe:animate-spin" size={14} aria-hidden="true" />
                        {t("plugins.settings.saving")}
                      </>
                    }
                  >
                    <Show
                      when={!saved()}
                      fallback={
                        <>
                          <Save class="mr-2" size={14} aria-hidden="true" />
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
    </Modal>
  )
}
