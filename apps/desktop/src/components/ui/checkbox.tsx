/**
 * Checkbox — Apple-style square checkbox with smooth check draw animation.
 *
 * - Native input under the hood for a11y / form integration; visuals come
 *   from a styled span sibling.
 * - Checkmark uses `stroke-dashoffset` animation; only animate transform/opacity
 *   (Emil). We use a tiny scale + opacity on the check for the "press" feel.
 * - Indeterminate is rendered with a horizontal bar (Apple pattern).
 * - Reduced motion: static check, no animation.
 */
import { type JSX, Show, createUniqueId } from "solid-js"

export type CheckboxState = boolean | "indeterminate"

export interface CheckboxProps {
  readonly checked: CheckboxState
  readonly onChange: (next: boolean) => void
  readonly label?: string
  readonly disabled?: boolean
  readonly required?: boolean
  readonly id?: string
}

export function Checkbox(props: CheckboxProps): JSX.Element {
  const inputId = (): string => props.id ?? createUniqueId()
  const checked = (): boolean | "indeterminate" => props.checked
  const isChecked = (): boolean => checked() === true
  const onClick = (): void => {
    if (props.disabled === true) return
    props.onChange(!isChecked())
  }
  return (
    <label class="ui-checkbox" classList={{ "ui-checkbox-disabled": props.disabled === true, "ui-checkbox-checked": isChecked() }}>
      <input
        id={inputId()}
        type="checkbox"
        class="ui-checkbox-input"
        checked={isChecked()}
        disabled={props.disabled === true}
        required={props.required === true}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
      />
      <span class="ui-checkbox-box" aria-hidden="true">
        <Show when={isChecked()}>
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3,8 7,12 13,4" />
          </svg>
        </Show>
        <Show when={checked() === "indeterminate"}>
          <svg viewBox="0 0 16 16" width="12" height="2.5" fill="currentColor">
            <rect x="3" y="7" width="10" height="2" rx="1" />
          </svg>
        </Show>
      </span>
      <Show when={props.label !== undefined}>
        <span class="ui-checkbox-label" onClick={onClick}>{props.label}</span>
      </Show>
    </label>
  )
}

export interface CheckboxGroupProps {
  readonly legend: string
  readonly children: JSX.Element
  readonly orientation?: "horizontal" | "vertical"
}
export function CheckboxGroup(props: CheckboxGroupProps): JSX.Element {
  return (
    <fieldset class={["ui-checkbox-group", `ui-checkbox-group-${props.orientation ?? "vertical"}`].join(" ")}>
      <legend class="ui-checkbox-group-legend">{props.legend}</legend>
      {props.children}
    </fieldset>
  )
}