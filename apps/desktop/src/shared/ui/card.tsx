/**
 * Card surfaces provide hierarchy without moving content during navigation.
 */
import { type JSX, type ParentProps, splitProps } from "solid-js"

export type CardVariant = "default" | "heavy" | "light" | "gradient" | "holographic"

export interface CardProps extends ParentProps<JSX.HTMLAttributes<HTMLDivElement>> {
  readonly variant?: CardVariant
  readonly interactive?: boolean
  readonly delay?: number
}

const variantClass = (variant: CardVariant): string => {
  switch (variant) {
    case "heavy": return "ui-card ui-card-heavy"
    case "light": return "ui-card ui-card-light"
    case "gradient": return "ui-card ui-card-gradient"
    case "holographic": return "ui-card ui-card-holographic"
    default: return "ui-card ui-card-default"
  }
}

export function Card(props: CardProps): JSX.Element {
  const [own, rest] = splitProps(props, ["variant", "interactive", "delay", "class", "children"])
  const variant = () => own.variant ?? "default"
  return (
    <div
      class={[variantClass(variant()), own.class ?? ""].filter(Boolean).join(" ")}
      classList={{ "ui-card-interactive": own.interactive === true }}
      {...rest}
    >
      {own.children}
    </div>
  )
}

/** InteractiveCard — a card whose destination is a real link. */
export function InteractiveCard(
  props: ParentProps<JSX.HTMLAttributes<HTMLAnchorElement> & { readonly delay?: number; readonly variant?: CardVariant; readonly href?: string }>
): JSX.Element {
  const [own, rest] = splitProps(props, ["variant", "delay", "class", "children", "href"])
  const variant = () => own.variant ?? "gradient"
  return (
    <a
      href={own.href}
      class={["ui-card", variantClass(variant()), "ui-card-interactive", own.class ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      {own.children}
    </a>
  )
}
