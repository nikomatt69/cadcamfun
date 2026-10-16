import { Show, createEffect, createSignal, on, onCleanup, type JSX } from "solid-js"
import { formatNumber, parseNumberText, stepNumber, type NumberRules } from "../../lib/numberText.ts"

export interface NumberFieldProps extends NumberRules {
  readonly value: unknown
  /** Called with every valid value while typing; an unfinished or invalid entry keeps the last valid one. */
  onChange(value: number): void
  /** The field's current error (null when valid), so the form can refuse to apply a half-typed dimension. */
  onError?: ((error: string | null) => void) | undefined
  readonly id?: string | undefined
  readonly name?: string | undefined
  readonly label?: string | undefined
  readonly step?: number | undefined
  readonly disabled?: boolean | undefined
  readonly class?: string | undefined
  /** Show the error message only after the field is left (true while editing a form field by field). */
  readonly showError?: boolean | undefined
}

const INVALID = "border-red-500 focus:border-red-500 focus:ring-red-500 dark:border-red-500"

/**
 * A dimension input: plain text so `12,5`, `12.5`, `0,125` and `40/2+3` are all typed as written (a number input drops
 * the comma and rewrites `1.` to `1` while typing). ArrowUp/ArrowDown step by `step` (Shift: x10), Enter commits.
 */
export function NumberField(props: NumberFieldProps): JSX.Element {
  const [draft, setDraft] = createSignal(formatNumber(props.value))
  const [error, setError] = createSignal<string | null>(null)
  const [left, setLeft] = createSignal(false)
  let focused = false

  const rules = (): NumberRules => ({ min: props.min, max: props.max, integer: props.integer, degrees: props.degrees })
  const report = (next: string | null) => {
    if (next === error()) return
    setError(next)
    props.onError?.(next)
  }

  // The stored value changed from outside (Cancel, another panel, the assistant): show it unless the person is typing here.
  // Other fields of the same form re-run this; only a real change of this value counts.
  createEffect(on(() => props.value, (value, previous) => {
    if (focused || value === previous) return
    setDraft(formatNumber(value))
    report(null)
    setLeft(false)
  }, { defer: true }))
  onCleanup(() => { if (error() !== null) props.onError?.(null) })

  const accept = (text: string) => {
    setDraft(text)
    const parsed = parseNumberText(text, rules())
    if (parsed.ok) { report(null); props.onChange(parsed.value) }
    else report(parsed.error)
  }

  const step = (direction: 1 | -1, large: boolean) => {
    const parsed = parseNumberText(draft(), { degrees: props.degrees })
    const base = parsed.ok ? parsed.value : typeof props.value === "number" ? props.value : 0
    const next = stepNumber(base, (props.step ?? 1) * (large ? 10 : 1), direction, rules())
    accept(formatNumber(next))
  }

  const keyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault()
      step(event.key === "ArrowUp" ? 1 : -1, event.shiftKey)
    } else if (event.key === "Enter") {
      // Commit the canonical form before the form submits.
      const parsed = parseNumberText(draft(), rules())
      if (parsed.ok) setDraft(formatNumber(parsed.value))
      else { setLeft(true); event.preventDefault() }
    }
  }

  const blur = () => {
    focused = false
    setLeft(true)
    const parsed = parseNumberText(draft(), rules())
    if (parsed.ok) setDraft(formatNumber(parsed.value))
  }

  const visibleError = () => (error() !== null && (left() || props.showError === true) ? error() : null)

  return (
    <div class="w-full">
      <input
        type="text"
        inputmode="decimal"
        autocomplete="off"
        spellcheck={false}
        id={props.id}
        name={props.name}
        aria-label={props.label}
        aria-invalid={visibleError() !== null}
        title={visibleError() ?? undefined}
        value={draft()}
        disabled={props.disabled ?? false}
        onFocus={(event) => { focused = true; event.currentTarget.select() }}
        onInput={(event) => accept(event.currentTarget.value)}
        onKeyDown={keyDown}
        onBlur={blur}
        class={`${props.class ?? ""} ${visibleError() !== null ? INVALID : ""}`}
      />
      <Show when={visibleError()}>{(message) => <p class="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">{message()}</p>}</Show>
    </div>
  )
}
