import { Show, createEffect, createMemo, createSignal, on, type JSX } from "solid-js"
import { dimensionText, parseDimensionText, type DimensionContext } from "../../lib/dimensionText.ts"
import { formatNumber } from "../../lib/numberText.ts"

export interface DimensionFieldProps {
  /** The stored dimension: a number, or a formula over the parameters. */
  readonly value: number | string | undefined
  readonly context: DimensionContext
  /** Called with the stored form (a number, a formula, or `undefined` for an emptied optional field) once the entry is valid and committed. */
  onCommit(stored: number | string | undefined): void
  /** An extra check on the stored form (a parameter definition that would close a loop); its message is shown like a parse error. */
  readonly validate?: ((stored: number | string) => string | undefined) | undefined
  readonly label: string
  readonly disabled?: boolean | undefined
  readonly class?: string | undefined
  readonly testId?: string | undefined
}

const INVALID = "border-[color:var(--ent-bad)] focus:border-[color:var(--ent-bad)]"

/**
 * A dimension of a parametric history. Plain text (never `type=number`), so `12,5`, `12.5`, `40/2+3` and `width / 2` are typed as
 * written; a formula stays a formula and shows the value it comes to; it is committed when the entry is finished (Enter, or the field is left after a change), never on a
 * half-typed entry. Escape puts the stored value back. A refused entry stays in the field with its reason and changes nothing.
 */
export function DimensionField(props: DimensionFieldProps): JSX.Element {
  const [draft, setDraft] = createSignal(dimensionText(props.value))
  const [error, setError] = createSignal<string | null>(null)
  let focused = false

  const parsed = createMemo(() => parseDimensionText(draft(), props.context))
  const problem = (): string | null => {
    const p = parsed()
    if (!p.ok) return p.error
    if (p.stored !== undefined && props.validate !== undefined) return props.validate(p.stored) ?? null
    return null
  }

  // The stored value changed from outside (undo, the assistant, another field): show it unless the person is typing here.
  createEffect(on(() => props.value, (value) => {
    if (focused) return
    setDraft(dimensionText(value))
    setError(null)
  }, { defer: true }))

  const commit = (text: string) => {
    setDraft(text)
    const p = parseDimensionText(text, props.context)
    const why = !p.ok ? p.error : p.stored !== undefined && props.validate !== undefined ? (props.validate(p.stored) ?? null) : null
    if (why !== null || !p.ok) { setError(why); return }
    setError(null)
    if (dimensionText(p.stored) === dimensionText(props.value)) { setDraft(dimensionText(p.stored)); return }
    setDraft(dimensionText(p.stored))
    props.onCommit(p.stored)
  }

  const preview = (): string | null => {
    const p = parsed()
    return p.ok && typeof p.stored === "string" && p.preview !== undefined && problem() === null ? `= ${formatNumber(p.preview)}` : null
  }

  return (
    <div class="w-full">
      <input
        type="text"
        inputmode="decimal"
        autocomplete="off"
        spellcheck={false}
        class={`${props.class ?? "panel-input font-mono"} ${error() !== null ? INVALID : ""}`}
        value={draft()}
        disabled={props.disabled ?? false}
        aria-label={props.label}
        aria-invalid={error() !== null}
        data-testid={props.testId}
        onFocus={(event) => { focused = true; event.currentTarget.select() }}
        onInput={(event) => { setDraft(event.currentTarget.value); setError(null) }}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit(event.currentTarget.value)
          else if (event.key === "Escape") { setDraft(dimensionText(props.value)); setError(null) }
        }}
        onChange={(event) => commit(event.currentTarget.value)}
        onBlur={() => { focused = false }}
      />
      <Show when={error()}>{(message) => <p class="mt-1 text-xs text-[color:var(--ent-bad)]" role="alert">{message()}</p>}</Show>
      <Show when={error() === null ? preview() : null}>{(text) => <span class="mt-1 block text-xs tabular-nums text-[color:var(--ent-text-muted)]" data-testid={props.testId === undefined ? undefined : `${props.testId}-value`}>{text()}</span>}</Show>
    </div>
  )
}
