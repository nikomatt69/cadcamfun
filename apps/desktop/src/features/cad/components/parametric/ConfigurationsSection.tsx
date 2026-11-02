import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import {
  activateConfiguration, addConfiguration, compareConfigurations, designTable, removeConfiguration, renameConfiguration, resolveParameters, setConfigurationSuppressed, setConfigurationValue,
  type ConfigurationMeasure, type History
} from "@cadcamfun/core"
import { ChevronDown, ChevronRight, Pencil, X } from "lucide-solid"
import { t } from "../../../../i18n/index.ts"
import { DimensionField } from "../property-inputs/DimensionField.tsx"
import { formatNumber } from "../../lib/numberText.ts"
import type { SectionProps } from "./ParametersSection.tsx"

const SMALL = "panel-btn"

/**
 * Configurations: named variants of the part (a design table). Each column is a configuration, each row a parameter or a feature that
 * can be suppressed; the shown configuration owns the live values, so an edit made while it is shown belongs to it. Activating one
 * writes its values and suppressed set into the history, and "Compare" builds every variant and reports its volume. Core's
 * `history-config.ts`.
 */
export function ConfigurationsSection(props: SectionProps & { fail(message: string): void }): JSX.Element {
  const table = createMemo(() => designTable(props.history))
  const context = createMemo(() => { const r = resolveParameters(props.history.parameters); return { values: r.values, failed: r.errors } })
  const [name, setName] = createSignal("")
  const [measures, setMeasures] = createSignal<ReadonlyArray<ConfigurationMeasure> | undefined>(undefined)
  const [open, setOpen] = createSignal(false)

  const run = (make: (h: History) => { readonly history: History; readonly refusal?: string }): boolean => {
    const result = make(props.history)
    if (result.refusal !== undefined) { props.fail(result.refusal); return false }
    setMeasures(undefined)
    return props.edit(() => result.history)
  }
  const add = () => {
    if (name().trim() === "") { props.fail(t("cad.parametric.configs.needsName")); return }
    if (run((h) => addConfiguration(h, name()))) setName("")
  }
  const compare = () => setMeasures(compareConfigurations(props.history))
  const varying = () => table().parameters.filter((p) => p.varies)
  const suppressing = () => table().features.filter((f) => f.varies)

  return (
    <div data-testid="configurations-section">
      <button type="button" class="mb-2 flex w-full items-center gap-2 text-left text-xs font-semibold text-[color:var(--ent-text-muted)]" aria-expanded={open()} onClick={() => setOpen(!open())}>
        <Show when={open()} fallback={<ChevronRight size={12} aria-hidden="true" />}><ChevronDown size={12} aria-hidden="true" /></Show>{t("cad.parametric.configs")} ({table().configurations.length})
      </button>
      <Show when={open()}>
        <p class="mb-1 text-xs text-[color:var(--ent-text-muted)]">{t("cad.parametric.configs.hint")}</p>
        <ul class="space-y-1">
          <For each={table().configurations}>{(config) =>
            <li class="flex items-center justify-between gap-2 rounded-md border border-[color:var(--ent-line)] p-2 text-xs" data-testid={`configuration-${config.id}`}>
              <span class={config.active ? "font-semibold" : ""}>{config.name}<Show when={config.active}><span class="ml-1 text-xs text-[color:var(--ent-ok)]">{t("cad.parametric.configs.shown")}</span></Show></span>
              <span class="flex gap-1">
                <button type="button" class={SMALL} disabled={props.locked || config.active} aria-label={`${t("cad.parametric.configs.show")} ${config.name}`} onClick={() => run((h) => activateConfiguration(h, config.id))}>{t("cad.parametric.configs.show")}</button>
                <button type="button" class={SMALL} disabled={props.locked} aria-label={`${t("projects.rename")} ${config.name}`}
                  onClick={() => { const next = window.prompt(t("cad.parametric.renamePrompt", { name: config.name }), config.name); if (next && next !== config.name) run((h) => renameConfiguration(h, config.id, next)) }}><Pencil size={12} aria-hidden="true" /></button>
                <button type="button" class={SMALL} disabled={props.locked} aria-label={`${t("cad.customElements.delete")} ${config.name}`} onClick={() => run((h) => removeConfiguration(h, config.id))}><X size={12} aria-hidden="true" /></button>
              </span>
            </li>}
          </For>
        </ul>
        <div class="mt-2 flex gap-2">
          <input class="panel-input" placeholder={t("cad.parametric.configs.name")} aria-label={t("cad.parametric.configs.name")} value={name()} disabled={props.locked}
            onInput={(event) => setName(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") add() }} />
          <button type="button" class={SMALL} disabled={props.locked} onClick={add}>{t("cad.parametric.configs.add")}</button>
        </div>

        <Show when={table().configurations.length > 1}>
          <div class="mt-2 overflow-x-auto" data-testid="design-table" role="table">
            <div class="grid items-start gap-x-1 gap-y-1 text-xs" style={{ "grid-template-columns": `minmax(5rem, auto) repeat(${table().configurations.length}, minmax(4.5rem, 1fr))` }}>
              <span class="font-medium" role="columnheader">{t("cad.customElements.parameters")}</span>
              <For each={table().configurations}>{(c) => <span class="font-medium" role="columnheader">{c.name}</span>}</For>
              <For each={table().parameters}>{(p) => <>
                <span class={`font-mono ${p.varies ? "" : "text-[color:var(--ent-text-muted)]"}`} role="rowheader">{p.name}</span>
                <For each={table().configurations}>{(c) =>
                  <DimensionField value={p.values[c.id]} context={context()} disabled={props.locked} label={`${c.name} ${p.name}`}
                    onCommit={(stored) => { if (stored !== undefined) run((h) => setConfigurationValue(h, c.id, p.name, stored)) }} />}
                </For>
              </>}</For>
              <For each={suppressing()}>{(f) => <>
                <span role="rowheader">{f.id} <span class="text-[color:var(--ent-text-muted)]">{t("cad.parametric.configs.suppressed")}</span></span>
                <For each={table().configurations}>{(c) =>
                  <input type="checkbox" checked={f.suppressed[c.id] === true} disabled={props.locked} aria-label={`${c.name} ${f.id} ${t("cad.parametric.configs.suppressed")}`}
                    onChange={(event) => run((h) => setConfigurationSuppressed(h, c.id, [f.id], event.currentTarget.checked))} />}
                </For>
              </>}</For>
            </div>
            <p class="mt-1 text-xs text-[color:var(--ent-text-muted)]">{t("cad.parametric.configs.varying", { count: varying().length + suppressing().length })}</p>
          </div>
          <button type="button" class={`${SMALL} mt-1`} onClick={compare}>{t("cad.parametric.configs.compare")}</button>
          <Show when={measures()}>{(rows) =>
            <ul class="mt-1 space-y-0.5 text-xs" data-testid="configuration-measures">
              <For each={rows()}>{(m) =>
                <li class={m.errors > 0 ? "text-[color:var(--ent-bad)]" : ""}>
                  {m.name}: {m.refusal ?? `${t("cad.parametric.configs.volume", { volume: formatNumber(Number((m.volume / 1000).toPrecision(6))) })}${m.errors > 0 ? ` · ${t("cad.parametric.configs.errors", { count: m.errors })}` : ""}`}
                </li>}
              </For>
            </ul>}
          </Show>
        </Show>
      </Show>
    </div>
  )
}
