/** One field per parameter of a cycle template or macro snippet; numeric parameters use the shared NumberField. */
import { For, Show, type JSX } from "solid-js"
import { CheckRow, Field, INPUT } from "../../../../shared/components/panel/ui.tsx"
import { NumberField } from "../../../cad/components/property-inputs/NumberField.tsx"
import type { CycleParameter, CycleValues } from "./cycleApi.ts"

export function ParameterForm(props: {
  readonly parameters: ReadonlyArray<CycleParameter>
  readonly values: CycleValues
  /** Prefix of the element ids (`cycle` gives `cycle-depth`). */
  readonly idPrefix: string
  readonly onChange: (name: string, value: unknown) => void
}): JSX.Element {
  const id = (name: string): string => `${props.idPrefix}-${name}`
  return (
    <For each={props.parameters}>{(param) => (
      <Show when={param.type !== "checkbox"} fallback={
        <CheckRow id={id(param.name)} checked={Boolean(props.values[param.name])} onChange={(value) => props.onChange(param.name, value)}>{param.label}</CheckRow>
      }>
        <Field label={param.label} unit={param.unit} hint={param.description} for={id(param.name)}>
          <Show when={param.type === "number"} fallback={
            <select id={id(param.name)} class={INPUT} value={String(props.values[param.name] ?? "")} onChange={(event) => props.onChange(param.name, event.currentTarget.value)}>
              <For each={param.options}>{(option) => <option value={option.value}>{option.label}</option>}</For>
            </select>
          }>
            <NumberField id={id(param.name)} class={INPUT} value={Number(props.values[param.name] ?? 0)} min={param.min} max={param.max} step={param.step}
              onChange={(value) => props.onChange(param.name, value)} />
          </Show>
        </Field>
      </Show>
    )}</For>
  )
}
