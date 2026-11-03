import { For, type JSX } from "solid-js"
import { NumberField } from "./NumberField.tsx"

export interface Vector3 { x: number; y: number; z: number }

interface Vector3InputProps {
  readonly label: string
  readonly value?: Vector3 | undefined
  onChange(value: Vector3): void
  /** Per-axis error (null when valid), keyed by axis. */
  onError?: ((axis: "x" | "y" | "z", error: string | null) => void) | undefined
  readonly name?: string | undefined
  readonly disabled?: boolean
  readonly step?: number
  readonly unit?: string
  /** Show the unit after each axis (rotation vectors); point inputs leave it off. */
  readonly showUnit?: boolean
}

const INPUT = "w-full h-7 px-2 border border-[color:var(--ent-line-strong)] rounded-md text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-[color:var(--ent-accent)] focus:border-[color:var(--ent-accent)] bg-[color:var(--ent-surface)] text-[color:var(--ent-text)]"

/** Edits X/Y/Z of a vector (rotations, scales...). */
export function Vector3Input(props: Vector3InputProps): JSX.Element {
  const value = () => props.value ?? { x: 0, y: 0, z: 0 }
  const unit = () => (props.showUnit === false ? "" : ` ${props.unit ?? "°"}`)
  const degrees = () => props.showUnit !== false && (props.unit ?? "°") === "°"
  return (
    <div class="mb-2">
      <label class="block text-xs font-medium text-[color:var(--ent-text)] mb-1">{props.label}</label>
      <div class="grid grid-cols-3 gap-2">
        <For each={["x", "y", "z"] as const}>{(axis) =>
          <div>
            <label for={props.name ? `${props.name}-${axis}` : undefined} class="block text-[11px] text-[color:var(--ent-text-muted)] mb-1">{axis.toUpperCase()}{unit()}</label>
            <NumberField
              id={props.name ? `${props.name}-${axis}` : undefined}
              name={props.name ? `${props.name}.${axis}` : undefined}
              label={`${props.label} ${axis.toUpperCase()}`}
              value={value()?.[axis] ?? 0}
              onChange={(next) => props.onChange({ ...value(), [axis]: next })}
              onError={(error) => props.onError?.(axis, error)}
              degrees={degrees()}
              disabled={props.disabled ?? false}
              step={props.step ?? 1}
              class={INPUT}
            />
          </div>}
        </For>
      </div>
    </div>
  )
}
