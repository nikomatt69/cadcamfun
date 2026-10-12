/**
 * Hero — full-bleed marketing/landing block with translucent gradient background,
 * floating orbs, and large display typography (optical sizing + negative tracking).
 *
 * Apple pattern: tight leading on display, system font, vibrancy on the foreground
 * card. Reduced-motion users get a static version (orbs frozen, no scale loop).
 */
import { Motion } from "solid-motionone"
import { type JSX, type ParentProps } from "solid-js"
import { FloatingOrbs, prefersReducedMotion } from "./animated-section.tsx"

/** Reduced-motion users get the fade only — no y-slides on the hero copy. */
const reduced = prefersReducedMotion

export interface HeroProps extends ParentProps {
  readonly eyebrow?: string
  readonly title: string
  readonly subtitle?: string
  readonly tone?: "blue" | "purple" | "gradient"
}

const toneClass = (tone: "blue" | "purple" | "gradient"): string => {
  switch (tone) {
    case "blue": return "ui-hero ui-hero-blue"
    case "purple": return "ui-hero ui-hero-purple"
    default: return "ui-hero ui-hero-gradient"
  }
}

export function Hero(props: HeroProps): JSX.Element {
  const tone = () => props.tone ?? "gradient"
  return (
    <header class={toneClass(tone())}>
      <FloatingOrbs count={4} />
      <div class="ui-hero-content">
        {props.eyebrow !== undefined ? (
          <Motion.span
            class="ui-hero-eyebrow"
            initial={reduced() ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={reduced() ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            {props.eyebrow}
          </Motion.span>
        ) : null}
        <Motion.h1
          class="ui-hero-title"
          initial={reduced() ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={reduced() ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={{ duration: 0.5, easing: [0.22, 1, 0.36, 1], delay: 0.1 }}
        >
          {props.title}
        </Motion.h1>
        {props.subtitle !== undefined ? (
          <Motion.p
            class="ui-hero-subtitle"
            initial={reduced() ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={reduced() ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={{ duration: 0.5, easing: [0.22, 1, 0.36, 1], delay: 0.18 }}
          >
            {props.subtitle}
          </Motion.p>
        ) : null}
        {props.children !== undefined ? (
          <Motion.div
            class="ui-hero-actions"
            initial={reduced() ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={reduced() ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={{ duration: 0.5, easing: [0.22, 1, 0.36, 1], delay: 0.26 }}
          >
            {props.children}
          </Motion.div>
        ) : null}
      </div>
    </header>
  )
}