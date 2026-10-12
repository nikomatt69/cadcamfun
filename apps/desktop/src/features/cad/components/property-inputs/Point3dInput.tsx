import type { JSX } from "solid-js"
import { Vector3Input, type Vector3 } from "./Vector3Input.tsx"

interface Point3dInputProps {
  readonly label: string
  readonly value?: Vector3 | undefined
  onChange(value: Vector3): void
  readonly disabled?: boolean
  readonly step?: number
}

/** Edits the X/Y/Z of a 3D point. */
export function Point3dInput(props: Point3dInputProps): JSX.Element {
  return <Vector3Input label={props.label} value={props.value} onChange={props.onChange} disabled={props.disabled ?? false} step={props.step ?? 0.1} showUnit={false} />
}
