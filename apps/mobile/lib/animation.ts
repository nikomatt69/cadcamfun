import { useEffect, useRef, useState } from "react"
import { AccessibilityInfo } from "react-native"
import {
  Easing,
  ReduceMotion,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
  type WithSpringConfig,
} from "react-native-reanimated"

/**
 * Motion tokens, expressed the way they are designed: response + damping ratio.
 * Damping 1.0 = critically damped, no overshoot — the default for anything the finger did not
 * fling. Overshoot only where the user's own momentum started the motion (Apple §4).
 */

export type SpringDescriptor = {
  /** Seconds for the value to reach the target. Not a duration — a spring has no fixed end. */
  duration: number
  dampingRatio: number
  velocity?: number
}

/** Default settle — lists, chips, repositioning. Critically damped. */
export const SPRING: SpringDescriptor = { duration: 350, dampingRatio: 1 }

/** Momentum-driven landings — a flick earns its bounce. */
export const SPRING_MOMENTUM: SpringDescriptor = { duration: 400, dampingRatio: 0.8 }

/** Sheets and drawers settling in after a drag. */
export const SHEET_SPRING: SpringDescriptor = { duration: 300, dampingRatio: 0.8 }

/** Press feedback — fast and dead-flat so it catches up with the finger. */
export const PRESS_SPRING: SpringDescriptor = { duration: 160, dampingRatio: 1 }

/** Reanimated 4 takes Apple's two designer parameters directly. */
export const spring = (d: SpringDescriptor): WithSpringConfig => ({
  duration: d.duration,
  dampingRatio: d.dampingRatio,
  ...(d.velocity !== undefined ? { velocity: d.velocity } : {}),
})

/** Strong ease-out for UI; Reanimated's built-ins are as weak as CSS's. */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)
/** On-screen movement: natural acceleration/deceleration. */
export const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1)
/** The iOS sheet curve. */
export const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1)

/**
 * Progressive resistance past a boundary — real things slow before they stop.
 * A hard stop reads as frozen; this reads as "responsive, but there is nothing more here".
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot))
}

/**
 * Where a flick would coast to, using UIScrollView's exponential decay.
 * Snap decisions read from this projection, not the raw release point, so a small fast flick
 * still throws the surface all the way (Apple §6 — momentum projection).
 */
export function projectMomentum(velocityPxPerSecond: number, decelerationRate = 0.998): number {
  return ((velocityPxPerSecond / 1000) * decelerationRate) / (1 - decelerationRate)
}

/** Respects Settings → Accessibility → Reduce Motion (and the analogous Android setting). */
export function usePrefersReducedMotion(): boolean {
  return useReducedMotion() === true
}

/** Respects Settings → Accessibility → Reduce Transparency: replace glass with solid surfaces. */
export function usePrefersReducedTransparency(): boolean {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    void AccessibilityInfo.isReduceTransparencyEnabled().then(setReduce)
    const sub = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setReduce)
    return () => sub.remove()
  }, [])
  return reduce
}

/** `withSpring` that collapses to an instant, overshoot-free settle under Reduce Motion. */
export function withReduce(target: number, config: SpringDescriptor, reduceMotion: boolean) {
  return withSpring(target, {
    ...spring(config),
    ...(reduceMotion ? { reduceMotion: ReduceMotion.System } : {}),
  })
}

/**
 * Press feedback: scale 0.97 in ~160ms on press-in, spring back on release (Apple §1 + Emil:
 * feedback on the press, not the release; 0.95–0.98 reads as physical).
 */
export function usePressScale() {
  const scale = useSharedValue(1)
  const reduced = usePrefersReducedMotion()

  const onPressIn = () => {
    if (reduced) return
    scale.set(withSpring(0.97, spring(PRESS_SPRING)))
  }
  const onPressOut = () => {
    if (reduced) return
    scale.set(withSpring(1, spring(PRESS_SPRING)))
  }

  return { style: { transform: [{ scale }] }, onPressIn, onPressOut }
}

/** A value created once for the component's lifetime — shared values must not be created per render. */
export function useStable<T>(create: () => T): T {
  const ref = useRef<T | null>(null)
  if (ref.current === null) ref.current = create()
  return ref.current
}

export type { SharedValue }
