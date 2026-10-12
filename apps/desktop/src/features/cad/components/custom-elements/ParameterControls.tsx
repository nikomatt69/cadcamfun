/**
 * The parameter panel of the custom element editor (legacy `customElements/ParameterControls.tsx`).
 *
 * Two jobs in one list: set the value the current preview is built with, and edit the parameter
 * definition itself (type, default, range, options) behind a disclosure.
 */
import { For, Show, createSignal, type JSX } from "solid-js"
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-solid"
import { t } from "../../../../i18n/index.ts"
import type { CustomElementDefinition, CustomElementParameter } from "../../types/customElements.ts"

export interface ParameterControlsProps {
  readonly definition: CustomElementDefinition
  readonly values: Readonly<Record<string, unknown>>
  readonly onChange: (parameterName: string, value: unknown) => void
  readonly onDefinitionChange: (updates: Partial<CustomElementDefinition>) => void
}

const FIELD = "w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"

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
        <input
          type="number"
          class={FIELD}
          value={typeof value() === "number" ? value() as number : 0}
          min={parameter().min}
          max={parameter().max}
          step={parameter().step ?? 0.1}
          onInput={(event) => props.onChange(Number.parseFloat(event.currentTarget.value) || 0)}
        />
      )
    case "boolean":
      return (
        <label class="flex items-center gap-2">
          <input type="checkbox" class="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500" checked={value() === true} onChange={(event) => props.onChange(event.currentTarget.checked)} />
          <span class="text-sm text-gray-700 dark:text-gray-300">{parameter().label ?? props.name}</span>
        </label>
      )
    case "color":
      return (
        <div class="flex gap-2">
          <input type="color" class="w-12 h-9 border border-gray-300 dark:border-gray-600 rounded" value={String(value() ?? "#000000")} onChange={(event) => props.onChange(event.currentTarget.value)} />
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
        <div class="text-sm text-gray-500 dark:text-gray-400">
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
    <div class="p-4 h-full overflow-y-auto bg-white dark:bg-gray-800">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white">{t("cad.customElements.parameters")}</h3>
        <button type="button" onClick={() => setAdding(!adding())} class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 flex items-center gap-1">
          <Plus class="w-4 h-4" />
          <span>{t("cad.customElements.add")}</span>
        </button>
      </div>

      <Show when={adding()}>
        <div class="mb-4 p-3 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50 dark:bg-blue-900/20">
          <div class="flex gap-2">
            <input
              type="text"
              placeholder={t("cad.customElements.parameterName")}
              class={"flex-1 " + FIELD}
              value={newName()}
              onInput={(event) => setNewName(event.currentTarget.value)}
              onKeyDown={(event) => { if (event.key === "Enter") addParameter() }}
            />
            <button type="button" onClick={addParameter} disabled={!newName().trim() || props.definition.parameters[newName()] !== undefined} class="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {t("cad.customElements.add")}
            </button>
          </div>
          <Show when={newName() !== "" && props.definition.parameters[newName()] !== undefined}>
            <div class="mt-2 text-sm text-red-600 dark:text-red-400">{t("cad.customElements.parameterExists")}</div>
          </Show>
        </div>
      </Show>

      <div class="space-y-3">
        <For each={entries()}>{([name, parameter]) => {
          const isOpen = () => expanded().has(name)
          return (
            <div class="border border-gray-200 dark:border-gray-700 rounded-lg">
              <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-t-lg">
                <div class="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => toggle(name)} class="flex items-center gap-2 text-left flex-1">
                    <Show when={isOpen()} fallback={<ChevronRight class="w-4 h-4 text-gray-400" />}><ChevronDown class="w-4 h-4 text-gray-400" /></Show>
                    <span class="font-medium text-gray-900 dark:text-white">{parameter.label ?? name}</span>
                    <span class="text-sm text-gray-500 dark:text-gray-400">({parameter.type})</span>
                  </button>
                  <button type="button" onClick={() => removeParameter(name)} class="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300" title={t("cad.customElements.removeParameter")}>
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>

                <div class="mt-2">
                  <span class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("cad.customElements.currentValue")}</span>
                  <ValueControl
                    name={name}
                    parameter={parameter}
                    value={props.values[name] !== undefined ? props.values[name] : parameter.default}
                    onChange={(value) => props.onChange(name, value)}
                  />
                </div>
              </div>

              <Show when={isOpen()}>
                <div class="p-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
                  <div>
                    <span class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("cad.customElements.label")}</span>
                    <input type="text" class={FIELD} value={parameter.label ?? ""} placeholder={name} onInput={(event) => editParameter(name, { label: event.currentTarget.value })} />
                  </div>

                  <div>
                    <span class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("cad.customElements.type")}</span>
                    <select class={FIELD} value={parameter.type} onChange={(event) => editParameter(name, { type: event.currentTarget.value as CustomElementParameter["type"] })}>
                      <option value="number">Number</option>
                      <option value="string">String</option>
                      <option value="boolean">Boolean</option>
                      <option value="color">Color</option>
                      <option value="select">Select</option>
                    </select>
                  </div>

                  <div>
                    <span class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("cad.customElements.defaultValue")}</span>
                    <input type="text" class={FIELD} value={JSON.stringify(parameter.default)} onInput={(event) => {
                      try { editParameter(name, { default: JSON.parse(event.currentTarget.value) }) } catch { /* invalid JSON, keep the current value */ }
                    }} />
                  </div>

                  <Show when={parameter.type === "number"}>
                    <div class="grid grid-cols-3 gap-2">
                      <div>
                        <span class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("cad.customElements.min")}</span>
                        <input type="number" class={FIELD} value={parameter.min ?? ""} onInput={(event) => editParameter(name, { min: event.currentTarget.value ? Number.parseFloat(event.currentTarget.value) : undefined })} />
                      </div>
                      <div>
                        <span class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("cad.customElements.max")}</span>
                        <input type="number" class={FIELD} value={parameter.max ?? ""} onInput={(event) => editParameter(name, { max: event.currentTarget.value ? Number.parseFloat(event.currentTarget.value) : undefined })} />
                      </div>
                      <div>
                        <span class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("cad.customElements.step")}</span>
                        <input type="number" class={FIELD} value={parameter.step ?? ""} onInput={(event) => editParameter(name, { step: event.currentTarget.value ? Number.parseFloat(event.currentTarget.value) : undefined })} />
                      </div>
                    </div>
                  </Show>

                  <Show when={parameter.type === "select"}>
                    <div>
                      <span class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("cad.customElements.options")}</span>
                      <textarea rows={3} class={FIELD} value={(parameter.options ?? []).join("\n")} onChange={(event) => editParameter(name, { options: event.currentTarget.value.split("\n").filter(Boolean) })} />
                    </div>
                  </Show>

                  <div>
                    <span class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t("cad.customElements.description")}</span>
                    <input type="text" class={FIELD} value={parameter.description ?? ""} onInput={(event) => editParameter(name, { description: event.currentTarget.value })} />
                  </div>

                  <div class="flex items-center gap-2">
                    <input id={`required-${name}`} type="checkbox" class="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500" checked={parameter.required === true} onChange={(event) => editParameter(name, { required: event.currentTarget.checked })} />
                    <label for={`required-${name}`} class="text-xs text-gray-600 dark:text-gray-400">{t("cad.customElements.required")}</label>
                  </div>
                </div>
              </Show>
            </div>
          )
        }}</For>
      </div>

      <Show when={entries().length === 0}>
        <div class="text-center py-8 text-gray-500 dark:text-gray-400">
          <div class="text-2xl mb-2">⚙️</div>
          <div>{t("cad.customElements.noParameters")}</div>
          <div class="text-sm">{t("cad.customElements.noParametersHint")}</div>
        </div>
      </Show>
    </div>
  )
}
