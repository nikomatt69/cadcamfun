/**
 * Badge, Chip, Tag — small inline visual elements used in lists and headers.
 * Vibrancy (translucent surfaces) keeps labels legible over changing backgrounds.
 */
import { type JSX, type ParentProps } from "solid-js"

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "gradient"

export interface BadgeProps extends ParentProps<JSX.HTMLAttributes<HTMLSpanElement>> {
  readonly tone?: BadgeTone
}

export function Badge(props: BadgeProps): JSX.Element {
  const tone = () => props.tone ?? "neutral"
  return (
    <span class={["ui-badge", `ui-badge-${tone()}`].join(" ")}>
      {props.children}
    </span>
  )
}

/** IconChip — circular translucent container around an icon (used in metric cards). */
export interface IconChipProps {
  readonly tone?: "blue" | "purple" | "green" | "orange" | "yellow" | "red" | "cyan"
  readonly children: JSX.Element
}

export function IconChip(props: IconChipProps): JSX.Element {
  const tone = () => props.tone ?? "blue"
  return (
    <span class={["ui-icon-chip", `ui-icon-chip-${tone()}`].join(" ")}>
      {props.children}
    </span>
  )
}

/** ProgressBar — translucent track, gradient fill, determinate or indeterminate. */
export interface ProgressBarProps {
  readonly value: number
  readonly max?: number
  readonly tone?: "blue" | "green" | "orange" | "red"
}

export function ProgressBar(props: ProgressBarProps): JSX.Element {
  const max = () => props.max ?? 100
  const pct = () => Math.max(0, Math.min(100, (props.value / max()) * 100))
  const tone = () => props.tone ?? "blue"
  return (
    <div class={["ui-progress", `ui-progress-${tone()}`].join(" ")} role="progressbar" aria-valuenow={props.value} aria-valuemax={max()}>
      <div class="ui-progress-fill" style={{ width: `${pct()}%` }} />
    </div>
  )
}

/** Divider with optional label. */
export function Divider(props: { readonly label?: string }): JSX.Element {
  return (
    <div class="ui-divider" role="separator">
      {props.label !== undefined ? <span class="ui-divider-label">{props.label}</span> : null}
    </div>
  )
}