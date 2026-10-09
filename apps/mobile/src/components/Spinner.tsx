/**
 * Apple HIG progressive indicator — a single spinning arc.
 *
 * Three rules (Apple §13 + Emil perceived-performance):
 *  - On accent: dark stroke on light background, light stroke on dark background
 *  - Rotation is the only animated property → lives on the compositor
 *  - 720ms = faster than the browser default, which makes the load feel shorter
 */
import type { JSX } from "solid-js"

export interface SpinnerProps {
  /** Visual size — `lg` for standalone, default for inline. */
  readonly size?: "sm" | "lg"
  /** When true the strokes invert for a light button surface. */
  readonly onAccent?: boolean
  readonly class?: string
}

export const Spinner = (props: SpinnerProps): JSX.Element => (
  <span
    class={`spinner${props.size === "lg" ? " lg" : ""}${props.onAccent ? " spinner-on-accent" : ""}${props.class ? ` ${props.class}` : ""}`}
    role="progressbar"
    aria-label="Loading"
  />
)