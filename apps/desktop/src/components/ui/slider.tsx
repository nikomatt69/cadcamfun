/**
 * Slider — single-thumb range with custom track rendering.
 *
 * Design notes:
 * - Native `<input type="range">` underneath (a11y, keyboard, form value
 *   integration). Visuals come from `::track` / `::thumb` pseudo-elements.
 * - Filled track uses a CSS variable `--ui-slider-fill` so it tracks the
 *   live value without re-rendering.
 * - Reduced motion: thumb is static (no hover scale).
 * - Optional inline value chip (Apple pattern — value next to the control
 *   instead of inside it, so the thumb doesn't get clipped).
 */
import { type JSX, Show, createUniqueId, createSignal } from "solid-js"

export interface SliderProps {
  readonly value: number
  readonly min?: number
  readonly max?: number
  readonly step?: number
  readonly disabled?: boolean
  readonly label?: string
  readonly showValue?: boolean
  readonly formatValue?: (value: number) => string
  readonly onInput: (value: number) => void
}

const defaultFormat = (value: number): string => value.toFixed(0)

export function Slider(props: SliderProps): JSX.Element {
  const id = createUniqueId()
  const min = (): number => props.min ?? 0
  const max = (): number => props.max ?? 100
  const step = (): number => props.step ?? 1
  const fmt = (): (value: number) => string => props.formatValue ?? defaultFormat
  const fill = (): string => `${((props.value - min()) / (max() - min())) * 100}%`
  return (
    <div class="ui-slider" classList={{ "ui-slider-disabled": props.disabled === true }}>
      <Show when={props.label !== undefined}>
        <label class="ui-slider-label" for={id}>
          <span>{props.label}</span>
          <Show when={props.showValue === true}>
            <span class="ui-slider-value">{fmt()(props.value)}</span>
          </Show>
        </label>
      </Show>
      <div class="ui-slider-row">
        <input
          id={id}
          type="range"
          class="ui-slider-input"
          min={min()}
          max={max()}
          step={step()}
          value={props.value}
          disabled={props.disabled === true}
          onInput={(event) => props.onInput(Number(event.currentTarget.value))}
          style={{ "--ui-slider-fill": fill() } as JSX.CSSProperties}
        />
      </div>
    </div>
  )
}

/** Spinner — small, inline numeric stepper used alongside sliders for precise input. */
export interface NumberStepperProps {
  readonly value: number
  readonly min?: number
  readonly max?: number
  readonly step?: number
  readonly disabled?: boolean
  readonly label?: string
  readonly formatValue?: (value: number) => string
  readonly onChange: (value: number) => void
}
export function NumberStepper(props: NumberStepperProps): JSX.Element {
  const min = (): number => props.min ?? -Infinity
  const max = (): number => props.max ?? Infinity
  const step = (): number => props.step ?? 1
  const [draft, setDraft] = createSignal<string>(String(props.value))
  const commit = (): void => {
    const parsed = Number(draft())
    if (Number.isNaN(parsed)) { setDraft(String(props.value)); return }
    const clamped = Math.min(max(), Math.max(min(), parsed))
    if (clamped !== props.value) props.onChange(clamped)
    setDraft(String(clamped))
  }
  const fmt = (): (value: number) => string => props.formatValue ?? ((value: number) => String(value))
  return (
    <div class="ui-stepper" classList={{ "ui-stepper-disabled": props.disabled === true }}>
      <Show when={props.label !== undefined}>
        <label class="ui-stepper-label">{props.label}</label>
      </Show>
      <div class="ui-stepper-row">
        <button type="button" class="ui-stepper-btn" aria-label="Decrease" disabled={props.disabled === true} onClick={() => props.onChange(Math.max(min(), props.value - step()))}>−</button>
        <input
          class="ui-stepper-input"
          type="text"
          inputMode="decimal"
          value={draft()}
          disabled={props.disabled === true}
          onInput={(event) => setDraft(event.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit() } }}
        />
        <button type="button" class="ui-stepper-btn" aria-label="Increase" disabled={props.disabled === true} onClick={() => props.onChange(Math.min(max(), props.value + step()))}>+</button>
      </div>
      <span class="ui-stepper-hint" aria-hidden="true">{fmt()(props.value)}</span>
    </div>
  )
}