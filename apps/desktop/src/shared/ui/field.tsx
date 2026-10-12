/**
 * Field primitives — text input, select, textarea, switch, with Apple-style
 * press feedback and validation-in-place messages.
 *
 * Validates inline (not on submit). Error tone matches Apple's four kinds:
 * status (info), completion (success), warning, error.
 */
import { type JSX, Show, createUniqueId, splitProps } from "solid-js"

export interface FieldProps {
  readonly label: string
  readonly hint?: string
  readonly error?: string
  readonly required?: boolean
  readonly children: (ids: { readonly id: string; readonly describedBy?: string }) => JSX.Element
}

export function Field(props: FieldProps): JSX.Element {
  const id = createUniqueId()
  const describedBy = () => {
    const list: Array<string> = []
    if (props.hint !== undefined) list.push(`${id}-hint`)
    if (props.error !== undefined) list.push(`${id}-error`)
    return list.length > 0 ? list.join(" ") : undefined
  }
  return (
    <label class="ui-field" for={id}>
      <span class="ui-field-label">
        {props.label}
        <Show when={props.required === true}><span class="ui-field-required" aria-hidden="true">*</span></Show>
      </span>
      {props.children({ id, describedBy: describedBy() })}
      <Show when={props.hint !== undefined}>
        <span id={`${id}-hint`} class="ui-field-hint">{props.hint}</span>
      </Show>
      <Show when={props.error !== undefined}>
        <span id={`${id}-error`} class="ui-field-error" role="alert">{props.error}</span>
      </Show>
    </label>
  )
}

export interface TextInputProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
  readonly invalid?: boolean
}

export function TextInput(props: TextInputProps): JSX.Element {
  const [own, rest] = splitProps(props, ["invalid", "class"])
  return (
    <input
      class={["ui-input", own.invalid === true ? "ui-input-invalid" : "", own.class ?? ""].filter(Boolean).join(" ")}
      {...rest}
    />
  )
}

export interface SelectProps extends JSX.SelectHTMLAttributes<HTMLSelectElement> {
  readonly invalid?: boolean
}

export function Select(props: SelectProps): JSX.Element {
  const [own, rest] = splitProps(props, ["invalid", "class", "children"])
  return (
    <select
      class={["ui-select", own.invalid === true ? "ui-select-invalid" : "", own.class ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      {own.children}
    </select>
  )
}

export interface TextareaProps extends JSX.TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly invalid?: boolean
}

export function Textarea(props: TextareaProps): JSX.Element {
  const [own, rest] = splitProps(props, ["invalid", "class"])
  return (
    <textarea
      class={["ui-textarea", own.invalid === true ? "ui-textarea-invalid" : "", own.class ?? ""].filter(Boolean).join(" ")}
      {...rest}
    />
  )
}

export interface SwitchProps {
  readonly checked: boolean
  readonly onChange: (next: boolean) => void
  readonly label?: string
  readonly disabled?: boolean
}

export function Switch(props: SwitchProps): JSX.Element {
  return (
    <button
      type="button"
      class="ui-switch"
      classList={{ "ui-switch-on": props.checked, "ui-switch-disabled": props.disabled === true }}
      role="switch"
      aria-checked={props.checked}
      disabled={props.disabled === true}
      onClick={() => !props.disabled && props.onChange(!props.checked)}
    >
      <span class="ui-switch-thumb" />
      <Show when={props.label !== undefined}>
        <span class="ui-switch-label">{props.label}</span>
      </Show>
    </button>
  )
}