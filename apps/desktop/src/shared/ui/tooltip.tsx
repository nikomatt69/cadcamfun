/**
 * Tooltip — origin-aware, skip-delay on subsequent hovers.
 *
 * Design rules applied (from emil-design-eng):
 * - Never scale(0); enter from scale(0.95) with opacity.
 * - Transform-origin is set inline to the trigger centroid so the tooltip
 *   grows from its source — `--ui-popover-origin` reads it back in CSS.
 * - First hover shows after `delay`; once one tooltip is open, adjacent
 *   tooltips open instantly (skip-delay, ~600ms after last show).
 * - Reduced-motion users get a fade, no scale.
 * - Pointer:fine media query gates the visibility so touch does not leave
 *   a tooltip floating.
 *
 * Architecture: a global `TooltipLayer` mounted once at the app root
 * renders the active tooltip. Each `<Tooltip>` owns its trigger ref and
 * registers itself on hover/focus.
 *
 * Usage:
 *   <Tooltip content="Open project (⌘O)"><button>…</button></Tooltip>
 */
import { Motion, Presence } from "solid-motionone"
import { type JSX, type ParentProps, createContext, createMemo, createSignal, createUniqueId, onCleanup, useContext } from "solid-js"
import { prefersReducedMotion } from "./animated-section.tsx"

const reduced = prefersReducedMotion

export type TooltipSide = "top" | "right" | "bottom" | "left"

interface TooltipEntry {
  readonly id: string
  readonly message: string
  readonly side: TooltipSide
  readonly origin: { readonly x: number; readonly y: number }
  readonly instant: boolean
}

/** Module-scoped registry — one floating layer per app. */
const [active, setActive] = createSignal<TooltipEntry | undefined>(undefined)
let lastShownAt = 0
const SKIP_DELAY_MS = 600

const sideOffset = (side: TooltipSide): { x: number; y: number } => {
  switch (side) {
    case "top": return { x: 0, y: -8 }
    case "bottom": return { x: 0, y: 8 }
    case "left": return { x: -8, y: 0 }
    default: return { x: 8, y: 0 }
  }
}

const originVar = (side: TooltipSide): string => {
  switch (side) {
    case "top": return "50% 100%"
    case "bottom": return "50% 0%"
    case "left": return "100% 50%"
    default: return "0% 50%"
  }
}

interface TooltipProps {
  readonly content: string
  readonly side?: TooltipSide
  readonly delay?: number
  readonly children: JSX.Element
}

/** Lightweight tooltip — wraps a single inline child trigger. */
export function Tooltip(props: TooltipProps): JSX.Element {
  const id = createUniqueId()
  const side = (): TooltipSide => props.side ?? "top"
  const delay = (): number => props.delay ?? 280
  let trigger: HTMLElement | undefined
  let showTimer: ReturnType<typeof setTimeout> | undefined

  const showNow = (instant: boolean): void => {
    if (trigger === undefined) return
    const rect = trigger.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    setActive({ id, message: props.content, side: side(), origin: { x: cx, y: cy }, instant })
    lastShownAt = Date.now()
  }
  const schedule = (): void => {
    if (showTimer !== undefined) clearTimeout(showTimer)
    if (Date.now() - lastShownAt < SKIP_DELAY_MS) { showNow(true); return }
    showTimer = setTimeout(() => showNow(false), delay())
  }
  const cancel = (): void => {
    if (showTimer !== undefined) { clearTimeout(showTimer); showTimer = undefined }
    setActive((current) => (current?.id === id ? undefined : current))
  }
  const setRef = (element: HTMLElement): void => {
    trigger = element
    element.addEventListener("mouseenter", schedule)
    element.addEventListener("mouseleave", cancel)
    element.addEventListener("focusin", schedule)
    element.addEventListener("focusout", cancel)
  }
  onCleanup(() => {
    if (trigger === undefined) return
    trigger.removeEventListener("mouseenter", schedule)
    trigger.removeEventListener("mouseleave", cancel)
    trigger.removeEventListener("focusin", schedule)
    trigger.removeEventListener("focusout", cancel)
  })

  // We forward the ref to the single child. The child must be a host element
  // (button, span, div…) — this is the same constraint Radix and shadcn use.
  return (
    <span ref={setRef} class="ui-tooltip-trigger" aria-describedby={`tooltip-${id}`}>
      {props.children}
    </span>
  )
}

/** Mount once at the app root. Renders the active tooltip in a fixed layer. */
export function TooltipLayer(): JSX.Element {
  const entry = createMemo(() => active())
  return (
    <Presence exitBeforeEnter>
      {(() => {
        const current = entry()
        if (current === undefined) return null
        const off = sideOffset(current.side)
        return (
          <Motion.div
            id={`tooltip-${current.id}`}
            role="tooltip"
            class="ui-tooltip"
            data-instant={current.instant ? "" : undefined}
            style={{
              left: `${current.origin.x + off.x}px`,
              top: `${current.origin.y + off.y}px`,
              "--ui-popover-origin": originVar(current.side)
            } as JSX.CSSProperties}
            initial={reduced() ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
            animate={reduced() ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            exit={reduced() ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
            transition={{ duration: current.instant ? 0 : 0.16, easing: [0.23, 1, 0.32, 1] }}
          >
            {current.message}
          </Motion.div>
        )
      })()}
    </Presence>
  )
}

/** Optional provider — current impl is global, the provider exists for symmetry. */
export function TooltipProvider(props: ParentProps): JSX.Element {
  return <>{props.children}<TooltipLayer /></>
}

const TooltipContext = createContext<typeof active>(active)
/** Public hook for components that need imperative show/hide. */
export function useTooltip(): { readonly active: typeof active } {
  // Keep the context hook available — the module signal works without it.
  void useContext(TooltipContext)
  return { active }
}