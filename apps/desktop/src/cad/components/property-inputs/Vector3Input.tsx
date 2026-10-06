import { For, type JSX } from "solid-js"

export interface Vector3 { x: number; y: number; z: number }

interface Vector3InputProps {
  readonly label: string
  readonly value?: Vector3 | undefined
  onChange(value: Vector3): void
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
  const change = (axis: "x" | "y" | "z", text: string) => props.onChange({ ...value(), [axis]: text === "" ? 0 : parseFloat(text) })
  return (
    <div class="mb-2">
      <label class="block text-sm font-medium text-gray-700 dark:text-blue-400 mb-1">{props.label}</label>
      <div class="grid grid-cols-3 gap-2">
        <For each={["x", "y", "z"] as const}>{(axis) =>
          <div>
            <label class="block text-xs text-gray-500 dark:text-blue-400 mb-1">{axis.toUpperCase()}{unit()}</label>
            <input type="number" value={value()?.[axis] ?? 0} onInput={(event) => change(axis, event.currentTarget.value)} disabled={props.disabled ?? false} class={INPUT} step={props.step ?? 1} />
          </div>}
        </For>
      </div>
    </div>
  )
}
