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

const INPUT = "w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-xs focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-blue-400"

/** Edits X/Y/Z of a vector (rotations, scales...). */
export function Vector3Input(props: Vector3InputProps): JSX.Element {
  const value = () => props.value ?? { x: 0, y: 0, z: 0 }
  const unit = () => (props.showUnit === false ? "" : ` ${props.unit ?? "°"}`)
  const degrees = () => props.showUnit !== false && (props.unit ?? "°") === "°"
  return (
    <div class="mb-2">
      <label class="block text-sm font-medium text-gray-700 dark:text-blue-400 mb-1">{props.label}</label>
      <div class="grid grid-cols-3 gap-2">
        <For each={["x", "y", "z"] as const}>{(axis) =>
          <div>
            <label for={props.name ? `${props.name}-${axis}` : undefined} class="block text-xs text-gray-500 dark:text-blue-400 mb-1">{axis.toUpperCase()}{unit()}</label>
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
