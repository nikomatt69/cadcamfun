/**
 * The parameter panel of the custom element editor (legacy `customElements/ParameterControls.tsx`).
 *
 * Two jobs in one list: set the value the current preview is built with, and edit the parameter
 * definition itself (type, default, range, options) behind a disclosure.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { ChevronDown, ChevronRight, Plus, SlidersHorizontal, Trash2 } from "lucide-solid"
import { NumberField } from "../property-inputs/NumberField.tsx"
import { t } from "../../../../i18n/index.ts"
import type { CustomElementDefinition, CustomElementParameter } from "../../types/customElements.ts"

export interface ParameterControlsProps {
  readonly definition: CustomElementDefinition
  readonly values: Readonly<Record<string, unknown>>
  readonly onChange: (parameterName: string, value: unknown) => void
  readonly onDefinitionChange: (updates: Partial<CustomElementDefinition>) => void
}

const FIELD = "w-full px-2 py-1 text-sm border border-[color:var(--ent-line-strong)] rounded bg-[color:var(--ent-surface)] text-[color:var(--ent-text)] focus:outline-none focus:ring-1 focus:ring-[color:var(--ent-accent)]"

/** The control for a value, chosen by the parameter's type. */
function ValueControl(props: {
  readonly name: string
  readonly parameter: CustomElementParameter
  readonly value: unknown
  readonly onChange: (value: unknown) => void
}): JSX.Element {
  const parameter = () => props.parameter
  const value = () => props.value ?? parameter().default

  switch (parameter().type) {
    case "number":
      return (
        <NumberField
          label={parameter().label ?? props.name}
          class={FIELD + " tabular-nums"}
          value={typeof value() === "number" ? value() as number : 0}
          min={parameter().min}
          max={parameter().max}
          step={parameter().step ?? 0.1}
          onChange={props.onChange}
        />
      )
    case "boolean":
      return (
        <label class="flex items-center gap-2">
          <input type="checkbox" class="rounded border-[color:var(--ent-line-strong)] text-[color:var(--ent-accent)] focus:ring-[color:var(--ent-accent)]" checked={value() === true} onChange={(event) => props.onChange(event.currentTarget.checked)} />
          <span class="text-sm text-[color:var(--ent-text)]">{parameter().label ?? props.name}</span>
        </label>
      )
    case "color":
      return (
        <div class="flex gap-2">
          <input type="color" class="w-12 h-9 border border-[color:var(--ent-line-strong)] rounded" value={String(value() ?? "#000000")} onChange={(event) => props.onChange(event.currentTarget.value)} />
          <input type="text" class={"flex-1 " + FIELD} value={String(value() ?? "#000000")} placeholder="#000000" onInput={(event) => props.onChange(event.currentTarget.value)} />
        </div>
      )
    case "select":
      return (
        <select class={FIELD} value={String(value() ?? "")} onChange={(event) => props.onChange(event.currentTarget.value)}>
          <For each={parameter().options ?? []}>{(option) => <option value={option}>{option}</option>}</For>
        </select>
      )
    default:
      return (
        <div class="text-sm text-[color:var(--ent-text-muted)]">
          {t("cad.customElements.unsupportedParameter")}: {parameter().type}
        </div>
      )
  }
}

export default function ParameterControls(props: ParameterControlsProps): JSX.Element {
  const [expanded, setExpanded] = createSignal<ReadonlySet<string>>(new Set<string>())
  const [newName, setNewName] = createSignal("")
  const [adding, setAdding] = createSignal(false)

  const entries = (): ReadonlyArray<readonly [string, CustomElementParameter]> => Object.entries(props.definition.parameters)

  const toggle = (name: string): void => {
    const next = new Set(expanded())
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setExpanded(next)
  }

  const editParameter = (name: string, updates: Partial<CustomElementParameter>): void => {
    const existing = props.definition.parameters[name]
    if (!existing) return
    props.onDefinitionChange({ parameters: { ...props.definition.parameters, [name]: { ...existing, ...updates } } })
  }

  const addParameter = (): void => {
    const name = newName().trim()
    if (!name || props.definition.parameters[name] !== undefined) return
    props.onDefinitionChange({
      parameters: {
        ...props.definition.parameters,
        [name]: { type: "number", default: 1, description: `Parameter ${name}`, label: name },
      },
    })
    setNewName("")
    setAdding(false)
  }

  const removeParameter = (name: string): void => {
    const { [name]: _removed, ...remaining } = props.definition.parameters
    props.onDefinitionChange({ parameters: remaining })
    const next = new Set(expanded())
    next.delete(name)
    setExpanded(next)
  }

  return (
    <div class="p-4 h-full overflow-y-auto bg-[color:var(--ent-surface)]">
      <div class="flex items-center justify-between gap-3 mb-4">
        <h3 class="text-base font-medium text-[color:var(--ent-text)]">{t("cad.customElements.parameters")}</h3>
        <button type="button" onClick={() => setAdding(!adding())} class="px-3 py-1 bg-[color:var(--ent-action)] text-[color:var(--ent-action-text)] rounded text-sm hover:bg-[color:var(--ent-action-hover)] flex items-center gap-1">
          <Plus class="w-4 h-4" />
          <span>{t("cad.customElements.add")}</span>
        </button>
      </div>

      <Show when={adding()}>
        <div class="mb-4 p-3 border border-[color:var(--ent-accent)] rounded-lg bg-[color:var(--ent-accent-soft)]">
          <div class="flex gap-2">
            <input
              type="text"
              placeholder={t("cad.customElements.parameterName")}
              class={"flex-1 " + FIELD}
              value={newName()}
              onInput={(event) => setNewName(event.currentTarget.value)}
              onKeyDown={(event) => { if (event.key === "Enter") addParameter() }}
            />
            <button type="button" onClick={addParameter} disabled={!newName().trim() || props.definition.parameters[newName()] !== undefined} class="px-3 py-2 bg-[color:var(--ent-action)] text-[color:var(--ent-action-text)] rounded hover:bg-[color:var(--ent-action-hover)] disabled:opacity-50 disabled:cursor-not-allowed">
              {t("cad.customElements.add")}
            </button>
          </div>
          <Show when={newName() !== "" && props.definition.parameters[newName()] !== undefined}>
            <div class="mt-2 text-sm text-[color:var(--ent-bad)]">{t("cad.customElements.parameterExists")}</div>
          </Show>
        </div>
      </Show>

      <div class="space-y-3">
        <For each={entries()}>{([name, parameter]) => {
          const isOpen = () => expanded().has(name)
          return (
            <div class="border border-[color:var(--ent-line)] rounded-lg">
              <div class="p-3 bg-[color:var(--ent-surface-subtle)] rounded-t-lg">
                <div class="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => toggle(name)} class="flex items-center gap-2 text-left flex-1">
                    <Show when={isOpen()} fallback={<ChevronRight class="w-4 h-4 text-[color:var(--ent-text-faint)]" />}><ChevronDown class="w-4 h-4 text-[color:var(--ent-text-faint)]" /></Show>
                    <span class="font-medium text-[color:var(--ent-text)]">{parameter.label ?? name}</span>
                    <span class="text-sm text-[color:var(--ent-text-muted)]">({parameter.type})</span>
                  </button>
                  <button type="button" onClick={() => removeParameter(name)} class="p-1 rounded text-[color:var(--ent-bad)] hover:bg-[color:var(--ent-bad-soft)]" title={t("cad.customElements.removeParameter")}>
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>

                <div class="mt-2">
                  <span class="block text-xs font-medium text-[color:var(--ent-text-muted)] mb-1">{t("cad.customElements.currentValue")}</span>
                  <ValueControl
                    name={name}
                    parameter={parameter}
                    value={props.values[name] !== undefined ? props.values[name] : parameter.default}
                    onChange={(value) => props.onChange(name, value)}
                  />
                </div>
              </div>

              <Show when={isOpen()}>
                <div class="p-3 border-t border-[color:var(--ent-line)] space-y-3">
                  <div>
                    <span class="block text-xs font-medium text-[color:var(--ent-text-muted)] mb-1">{t("cad.customElements.label")}</span>
                    <input type="text" class={FIELD} value={parameter.label ?? ""} placeholder={name} onInput={(event) => editParameter(name, { label: event.currentTarget.value })} />
                  </div>

                  <div>
                    <span class="block text-xs font-medium text-[color:var(--ent-text-muted)] mb-1">{t("cad.customElements.type")}</span>
                    <select class={FIELD} value={parameter.type} onChange={(event) => editParameter(name, { type: event.currentTarget.value as CustomElementParameter["type"] })}>
                      <option value="number">{t("cad.input.number")}</option>
                      <option value="string">{t("cad.input.string")}</option>
                      <option value="boolean">{t("keys.group.boolean")}</option>
                      <option value="color">{t("library.color")}</option>
                      <option value="select">{t("cad.select")}</option>
                    </select>
                  </div>

                  <div>
                    <span class="block text-xs font-medium text-[color:var(--ent-text-muted)] mb-1">{t("cad.customElements.defaultValue")}</span>
                    <input type="text" class={FIELD} value={JSON.stringify(parameter.default)} onInput={(event) => {
                      try { editParameter(name, { default: JSON.parse(event.currentTarget.value) }) } catch { /* invalid JSON, keep the current value */ }
                    }} />
                  </div>

                  <Show when={parameter.type === "number"}>
                    <div class="grid grid-cols-3 gap-2">
                      <div>
                        <span class="block text-xs font-medium text-[color:var(--ent-text-muted)] mb-1">{t("cad.customElements.min")}</span>
                        <NumberField optional deferred label={t("cad.customElements.min")} class={FIELD} value={parameter.min} onChange={(next) => editParameter(name, { min: next })} onClear={() => editParameter(name, { min: undefined })} />
                      </div>
                      <div>
                        <span class="block text-xs font-medium text-[color:var(--ent-text-muted)] mb-1">{t("cad.customElements.max")}</span>
                        <NumberField optional deferred label={t("cad.customElements.max")} class={FIELD} value={parameter.max} onChange={(next) => editParameter(name, { max: next })} onClear={() => editParameter(name, { max: undefined })} />
                      </div>
                      <div>
                        <span class="block text-xs font-medium text-[color:var(--ent-text-muted)] mb-1">{t("cad.customElements.step")}</span>
                        <NumberField optional deferred label={t("cad.customElements.step")} class={FIELD} value={parameter.step} onChange={(next) => editParameter(name, { step: next })} onClear={() => editParameter(name, { step: undefined })} />
                      </div>
                    </div>
                  </Show>

                  <Show when={parameter.type === "select"}>
                    <div>
                      <span class="block text-xs font-medium text-[color:var(--ent-text-muted)] mb-1">{t("cad.customElements.options")}</span>
                      <textarea rows={3} class={FIELD} value={(parameter.options ?? []).join("\n")} onChange={(event) => editParameter(name, { options: event.currentTarget.value.split("\n").filter(Boolean) })} />
                    </div>
                  </Show>

                  <div>
                    <span class="block text-xs font-medium text-[color:var(--ent-text-muted)] mb-1">{t("cad.customElements.description")}</span>
                    <input type="text" class={FIELD} value={parameter.description ?? ""} onInput={(event) => editParameter(name, { description: event.currentTarget.value })} />
                  </div>

                  <div class="flex items-center gap-2">
                    <input id={`required-${name}`} type="checkbox" class="rounded border-[color:var(--ent-line-strong)] text-[color:var(--ent-accent)] focus:ring-[color:var(--ent-accent)]" checked={parameter.required === true} onChange={(event) => editParameter(name, { required: event.currentTarget.checked })} />
                    <label for={`required-${name}`} class="text-xs text-[color:var(--ent-text-muted)]">{t("cad.customElements.required")}</label>
                  </div>
                </div>
              </Show>
            </div>
          )
        }}</For>
      </div>

      <Show when={entries().length === 0}>
        <div class="text-center py-8 text-[color:var(--ent-text-muted)]">
          <SlidersHorizontal size={24} class="mx-auto mb-2" aria-hidden="true" />
          <div>{t("cad.customElements.noParameters")}</div>
          <div class="text-sm">{t("cad.customElements.noParametersHint")}</div>
        </div>
      </Show>
    </div>
  )
}
