/**
 * Card — Apple-style translucent surface; material weight encodes hierarchy.
 *
 * - "default" — medium-weight translucent content card (backdrop blur + 60% fill).
 * - "heavy"   — darker/less translucent — structural regions (sidebars, dialogs).
 * - "light"   — lighter blur — chips and pills.
 * - "gradient" / "holographic" — soft gradient washes for hero/marketing regions.
 *
 * Critically damped spring entry (no overshoot) — graceful settle, interrupts cleanly
 * when navigating between routes. Pressed cards scale subtly on pointer-down for
 * instant feedback.
 */
import { Motion } from "solid-motionone"
import { type JSX, type ParentProps, splitProps } from "solid-js"
import { prefersReducedMotion } from "./animated-section.tsx"

/** Reduced-motion users get the fade only; hover lift/press scale are dropped. */
const reduced = prefersReducedMotion

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
  const interactive = () => own.interactive === true
  return (
    <Motion.div
      class={[variantClass(variant()), own.class ?? ""].filter(Boolean).join(" ")}
      initial={reduced() ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
      animate={reduced() ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, easing: [0.22, 1, 0.36, 1], delay: own.delay ?? 0 }}
      hover={interactive() && !reduced() ? { y: -4, scale: 1.015 } : undefined}
      press={interactive() && !reduced() ? { scale: 0.98 } : undefined}
      {...rest}
    >
      {own.children}
    </Motion.div>
  )
}

/** InteractiveCard — link/anchor with hover lift + press-down press feedback. */
export function InteractiveCard(
  props: ParentProps<JSX.HTMLAttributes<HTMLAnchorElement> & { readonly delay?: number; readonly variant?: CardVariant; readonly href?: string }>
): JSX.Element {
  const [own, rest] = splitProps(props, ["variant", "delay", "class", "children", "href"])
  const variant = () => own.variant ?? "gradient"
  return (
    <Motion.a
      href={own.href ?? "#"}
      class={["ui-card", variantClass(variant()), "ui-card-interactive", own.class ?? ""].filter(Boolean).join(" ")}
      initial={reduced() ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
      animate={reduced() ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, easing: [0.22, 1, 0.36, 1], delay: own.delay ?? 0 }}
      hover={reduced() ? undefined : { y: -6, scale: 1.02 }}
      press={reduced() ? undefined : { scale: 0.97 }}
      {...rest}
    >
      {own.children}
    </Motion.a>
  )
}