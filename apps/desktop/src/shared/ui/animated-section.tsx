/**
 * AnimatedSection — Apple-style spring entry for page sections.
 *
 * Critically damped spring by default (no overshoot) — graceful settle, not bounce.
 * Reduced-motion users get a short opacity fade so they still get feedback without
 * motion. Interruptible: Motion reads the live presentation value, so navigating away
 * stops it mid-animation without jumping to the target.
 */
import { Motion, Presence } from "solid-motionone"
import { type JSX, type ParentProps, children as resolveChildren, createMemo, splitProps } from "solid-js"

export interface AnimatedSectionProps extends ParentProps<JSX.HTMLAttributes<HTMLDivElement>> {
  readonly delay?: number
  readonly y?: number
  readonly appear?: boolean
}

/** The user's reduced-motion preference, shared with the other Motion consumers
 *  (Modal, Sheet, Card, ToastViewport) so JS-driven entrances honour it too —
 *  the global CSS rule only neutralises CSS animations. */
export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true

const reduced = prefersReducedMotion

export function AnimatedSection(props: AnimatedSectionProps): JSX.Element {
  const [own, rest] = splitProps(props, ["delay", "y", "appear", "class", "children"])
  const yOffset = () => own.y ?? 16
  const delay = () => own.delay ?? 0
  return (
    <Motion.div
      class={own.class ?? ""}
      initial={own.appear === false ? false : reduced() ? { opacity: 0 } : { opacity: 0, y: yOffset() }}
      animate={reduced() ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.45, easing: [0.22, 1, 0.36, 1], delay: delay() }}
      {...rest}
    >
      {own.children}
    </Motion.div>
  )
}

/** StaggerGroup — animates children in sequence with spring settle. */
export function StaggerGroup(
  props: ParentProps<JSX.HTMLAttributes<HTMLDivElement> & { readonly delayStep?: number }>
): JSX.Element {
  const [own, rest] = splitProps(props, ["class", "children", "delayStep"])
  const step = () => own.delayStep ?? 0.06
  const resolved = resolveChildren(() => props.children)
  const items = createMemo(() => {
    const v = resolved()
    return Array.isArray(v) ? v : [v]
  })
  return (
    <div class={own.class ?? ""} {...rest}>
      {items().map((child, i) => (
        <Motion.div
          initial={reduced() ? { opacity: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, easing: [0.22, 1, 0.36, 1], delay: i * step() }}
        >
          {child}
        </Motion.div>
      ))}
    </div>
  )
}

/** FloatingOrbs — decorative animated background blobs for hero sections. */
export function FloatingOrbs(props: { readonly count?: number }): JSX.Element {
  const count = () => props.count ?? 5
  return (
    <div class="ui-floating-orbs" aria-hidden="true">
      {Array.from({ length: count() }, (_, i) => {
        const size = 80 + ((i * 37) % 220)
        const left = (i * 53) % 100
        const top = (i * 71) % 100
        const hue = (i * 47) % 360
        return (
          <Motion.span
            class="ui-floating-orb"
            style={{
              width: `${size}px`,
              height: `${size}px`,
              left: `${left}%`,
              top: `${top}%`,
              background: `radial-gradient(circle at 30% 30%, hsla(${hue}, 90%, 70%, 0.55), hsla(${hue + 60}, 85%, 60%, 0.15) 70%, transparent)`
            }}
            // Frozen at rest under reduced motion — the CSS `animation: none`
            // rule cannot stop a JS-driven Motion loop, so it is stopped here.
            animate={reduced() ? { x: 0, y: 0, scale: 1 } : {
              x: [0, 12 - (i % 5) * 4, 0, -8 + (i % 3) * 3, 0],
              y: [0, -10 + (i % 4) * 3, 0, 6 - (i % 3) * 2, 0],
              scale: [1, 1.05 - (i % 5) * 0.01, 1]
            }}
            transition={{ duration: 12 + (i % 4) * 3, repeat: Infinity, easing: "ease-in-out", delay: i * 0.7 }}
          />
        )
      })}
    </div>
  )
}

/** Re-export Presence for routes that need it. */
export { Presence }