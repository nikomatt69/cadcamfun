/**
 * Button — Apple pattern: instant pointer-down feedback, no click latency.
 *
 * Press scales subtly (Motion.press) the same frame the pointer touches. Disabled
 * buttons stay in the layout but render inert.
 */
import { Motion } from "solid-motionone"
import { type JSX, type ParentProps, Show, splitProps } from "solid-js"

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success"
export type ButtonSize = "sm" | "md" | "lg"

export interface ButtonProps
  extends ParentProps<JSX.HTMLAttributes<HTMLButtonElement>> {
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
  readonly loading?: boolean
  readonly disabled?: boolean
}

const variantClass = (variant: ButtonVariant): string => {
  switch (variant) {
    case "secondary": return "ui-btn ui-btn-secondary"
    case "ghost": return "ui-btn ui-btn-ghost"
    case "danger": return "ui-btn ui-btn-danger"
    case "success": return "ui-btn ui-btn-success"
    default: return "ui-btn ui-btn-primary"
  }
}

const sizeClass = (size: ButtonSize): string => {
  switch (size) {
    case "sm": return "ui-btn-sm"
    case "lg": return "ui-btn-lg"
    default: return "ui-btn-md"
  }
}

export function Button(props: ButtonProps): JSX.Element {
  const [own, rest] = splitProps(props, ["variant", "size", "loading", "class", "children", "disabled"])
  const variant = () => own.variant ?? "primary"
  const size = () => own.size ?? "md"
  const isDisabled = () => own.disabled === true || own.loading === true
  return (
    <Motion.button
      class={[variantClass(variant()), sizeClass(size()), own.class ?? ""].filter(Boolean).join(" ")}
      press={isDisabled() ? undefined : { scale: 0.97 }}
      hover={isDisabled() ? undefined : { scale: 1.02 }}
      transition={{ duration: 0.2, easing: [0.22, 1, 0.36, 1] }}
      disabled={isDisabled()}
      {...rest}
    >
      <Show when={own.loading === true}>
        <span class="ui-btn-spinner" aria-hidden="true" />
      </Show>
      <span classList={{ "opacity-0": own.loading === true }}>{own.children}</span>
    </Motion.button>
  )
}

/** IconButton — square hit area for tool palettes and card headers. */
export function IconButton(
  props: ParentProps<JSX.HTMLAttributes<HTMLButtonElement> & { readonly active?: boolean; readonly size?: ButtonSize }>
): JSX.Element {
  const [own, rest] = splitProps(props, ["active", "class", "children", "size"])
  const size = () => own.size ?? "md"
  return (
    <Motion.button
      class={["ui-icon-btn", sizeClass(size()), own.active === true ? "ui-icon-btn-active" : "", own.class ?? ""].filter(Boolean).join(" ")}
      press={{ scale: 0.92 }}
      hover={{ scale: 1.05 }}
      transition={{ duration: 0.15, easing: [0.22, 1, 0.36, 1] }}
      {...rest}
    >
      {own.children}
    </Motion.button>
  )
}