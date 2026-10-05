/**
 * The `SchemaForm` Solid component (spec 06-desktop-ui.md §1: "forms are generated from
 * the Effect Schemas where possible (one small `SchemaForm` component)").
 *
 * All of the logic — which fields exist, their kinds, bounds and defaults — lives in
 * `schema-form.ts`, which is DOM-free and unit-tested on its own. This file only maps
 * that description onto controls, which is why the CAM parameter forms can never drift
 * from the WP2 `Schema.Class` definitions.
 */
import { createSignal, For, Show, type JSX } from "solid-js"
import { t } from "../i18n/index.ts"
import {
  decodeForm,
  describeSchema,
  validateForm,
  type FieldDescription,
  type ValidationIssue
} from "./schema-form.ts"

export interface SchemaFormProps<S> {
  /** The `Schema.Class` (or `Struct`) describing the parameters. */
  readonly schema: S
  /** Seeds the fields; usually `defaultsOf(new ProfileParams(...), ProfileParams)`. */
  readonly values?: Readonly<Record<string, unknown>>
  /** Receives the typed value once `decodeForm` succeeds. */
  readonly onSubmit: (value: S extends { readonly Type: infer T } ? T : unknown) => void
  readonly submitLabel?: string
  /** Groups fields by their first letter so a long schema stays readable. */
  readonly columns?: number
  /** Rendered above the grid; used for operation pickers next to the form. */
  readonly header?: JSX.Element
}

/** The control for one field, chosen by its derived kind. */
const Field = (props: {
  readonly field: FieldDescription
  readonly value: unknown
  readonly invalid: boolean
  readonly onInput: (value: unknown) => void
}): JSX.Element => {
  const id = `field-${props.field.key}`
  const label = () =>
    `${props.field.label}${props.field.required ? " *" : ""}`

  return (
    <div class="flex flex-col gap-1">
      <label class="form-label" for={id}>
        {label()}
      </label>
      <Show when={props.field.kind === "boolean"} fallback={
        <Show when={props.field.kind === "enum"} fallback={
          <Show when={props.field.kind === "number" || props.field.kind === "integer"} fallback={
            <input
              id={id}
              class="form-input"
              classList={{ "form-input-error": props.invalid }}
              type="text"
              value={props.value === undefined || props.value === null ? "" : String(props.value)}
              aria-describedby={`${id}-issue`}
              onInput={(event) => props.onInput(event.currentTarget.value)}
            />
          }>
            <input
              id={id}
              class="form-input"
              classList={{ "form-input-error": props.invalid }}
              type="number"
              inputmode={props.field.kind === "integer" ? "numeric" : "decimal"}
              step="any"
              value={props.value === undefined || props.value === null ? "" : String(props.value)}
              min={props.field.minimum}
              max={props.field.maximum}
              aria-describedby={`${id}-issue`}
              onInput={(event) => props.onInput(event.currentTarget.value)}
            />
          </Show>
        }>
          <select
            id={id}
            class="form-select"
            classList={{ "form-input-error": props.invalid }}
            value={props.value === undefined ? "" : String(props.value)}
            aria-describedby={`${id}-issue`}
            onChange={(event) => props.onInput(event.currentTarget.value)}
          >
            <For each={props.field.options}>
              {(option) => <option value={option}>{option}</option>}
            </For>
          </select>
        </Show>
      }>
        <label class="flex items-center gap-2 text-sm">
          <input
            id={id}
            type="checkbox"
            checked={props.value === true}
            aria-describedby={`${id}-issue`}
            onChange={(event) => props.onInput(event.currentTarget.checked)}
          />
          <span>{props.field.description ?? props.field.label}</span>
        </label>
      </Show>
      <span id={`${id}-issue`} class="form-error" role={props.invalid ? "alert" : undefined}>
        <Show when={props.invalid}>{t("form.required")}</Show>
      </span>
    </div>
  )
}

/**
 * A form generated from a Schema. Submit runs `validateForm` first (so the user sees a
 * field-level message) and then `decodeForm`, which never throws: a schema with a
 * cross-field filter reports one issue instead of crashing the editor.
 */
export function SchemaForm<S extends { readonly Type: unknown }>(props: SchemaFormProps<S>): JSX.Element {
  const description = describeSchema(props.schema)
  const [values, setValues] = createSignal<Readonly<Record<string, unknown>>>(
    props.values ?? Object.fromEntries(description.fields.map((field) => [field.key, undefined]))
  )
  const [issues, setIssues] = createSignal<ReadonlyArray<ValidationIssue>>([])

  const invalidKeys = (): ReadonlySet<string> => new Set(issues().map((issue) => issue.key))

  const submit = (event: Event): void => {
    event.preventDefault()
    const found = validateForm(description, values())
    setIssues(found)
    if (found.length > 0) return
    const decoded = decodeForm(props.schema as never, values())
    if (decoded._tag === "Valid") {
      props.onSubmit(decoded.value as S extends { readonly Type: infer T } ? T : unknown)
      return
    }
    setIssues(decoded.issues)
  }

  const reset = (): void => {
    setValues(props.values ?? Object.fromEntries(description.fields.map((field) => [field.key, undefined])))
    setIssues([])
  }

  return (
    <form class="flex flex-col gap-4" onSubmit={submit} novalidate>
      <Show when={props.header !== undefined}>{props.header}</Show>
      <div
        class="grid gap-3"
        style={{ "grid-template-columns": `repeat(${props.columns ?? 2}, minmax(0, 1fr))` }}
      >
        <For each={description.fields}>
          {(field) => (
            <Show
              when={field.kind !== "unknown"}
              fallback={
                <div class="flex flex-col gap-1">
                  <span class="form-label">{field.label}</span>
                  <p class="text-xs text-gray-500">{t("form.unknownField")}</p>
                </div>
              }
            >
              <Field
                field={field}
                value={values()[field.key]}
                invalid={invalidKeys().has(field.key)}
                onInput={(value) => setValues((current) => ({ ...current, [field.key]: value }))}
              />
            </Show>
          )}
        </For>
      </div>
      <Show when={issues().length > 0}>
        <ul class="alert alert-danger" role="alert">
          <For each={issues()}>{(issue) => <li>{issue.message}</li>}</For>
        </ul>
      </Show>
      <div class="flex gap-2">
        <button type="submit" class="btn btn-primary">
          {props.submitLabel ?? t("form.submit")}
        </button>
        <button type="button" class="btn btn-outline" onClick={reset}>
          {t("form.reset")}
        </button>
      </div>
    </form>
  )
}
