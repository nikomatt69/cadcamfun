/**
 * Feedback primitives — toasts, alerts, skeleton loaders.
 *
 * Status, completion, warning, error feedback in four kinds. Spring-driven; mirror
 * easing on reversible transitions so the outbound path matches the inbound.
 */
import { Motion } from "solid-motionone"
import { type JSX, Show, For, createSignal } from "solid-js"
import { Portal } from "solid-js/web"
import Check from "lucide-solid/icons/check"
import TriangleAlert from "lucide-solid/icons/triangle-alert"
import X from "lucide-solid/icons/x"
import Info from "lucide-solid/icons/info"
import { prefersReducedMotion } from "./animated-section.tsx"

/** Reduced-motion users get the fade only — no slide-in from the edge. */
const reduced = prefersReducedMotion

export type ToastTone = "success" | "warning" | "error" | "info"

export interface ToastItem {
  readonly id: number
  readonly message: string
  readonly tone: ToastTone
}

const [items, setItems] = createSignal<ReadonlyArray<ToastItem>>([])
let nextId = 1

const dismiss = (id: number): void => {
  setItems((current) => current.filter((item) => item.id !== id))
}

export const toast = {
  show(message: string, tone: ToastTone = "info", durationMs = 4000): number {
    const id = nextId++
    setItems((current) => [...current, { id, message, tone }])
    if (durationMs > 0) {
      setTimeout(() => dismiss(id), durationMs)
    }
    return id
  },
  success(message: string, durationMs?: number): number { return this.show(message, "success", durationMs) },
  error(message: string, durationMs?: number): number { return this.show(message, "error", durationMs ?? 6000) },
  warn(message: string, durationMs?: number): number { return this.show(message, "warning", durationMs) },
  info(message: string, durationMs?: number): number { return this.show(message, "info", durationMs) },
  dismiss
}

const toneClass = (tone: ToastTone): string => {
  switch (tone) {
    case "success": return "ui-toast ui-toast-success"
    case "warning": return "ui-toast ui-toast-warning"
    case "error": return "ui-toast ui-toast-error"
    default: return "ui-toast ui-toast-info"
  }
}

const toneIcon = (tone: ToastTone): JSX.Element => {
  switch (tone) {
    case "success": return <Check size={18} aria-hidden="true" />
    case "warning": return <TriangleAlert size={18} aria-hidden="true" />
    case "error": return <X size={18} aria-hidden="true" />
    default: return <Info size={18} aria-hidden="true" />
  }
}

export function ToastViewport(): JSX.Element {
  return (
    <Portal>
      <div class="ui-toast-viewport" role="region" aria-label="Notifications" aria-live="polite">
        <For each={items()}>{(item) => (
          <Motion.div
            class={toneClass(item.tone)}
            initial={reduced() ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.95 }}
            animate={reduced() ? { opacity: 1 } : { opacity: 1, x: 0, scale: 1 }}
            exit={reduced() ? { opacity: 0 } : { opacity: 0, x: 24, scale: 0.95 }}
            transition={{ duration: 0.35, easing: [0.22, 1, 0.36, 1] }}
          >
            <span class="ui-toast-icon">{toneIcon(item.tone)}</span>
            <span class="ui-toast-message">{item.message}</span>
            <button type="button" class="ui-toast-close" aria-label="Dismiss" onClick={() => dismiss(item.id)}>
              <X size={14} aria-hidden="true" />
            </button>
          </Motion.div>
        )}</For>
      </div>
    </Portal>
  )
}

export interface AlertProps {
  readonly tone?: "success" | "warning" | "error" | "info"
  readonly title?: string
  readonly children: JSX.Element
}

/** Inline alert banner (status / completion / warning / error). */
export function Alert(props: AlertProps): JSX.Element {
  const tone = () => props.tone ?? "info"
  return (
    <div
      class={["ui-alert", `ui-alert-${tone()}`].join(" ")}
      role={tone() === "error" || tone() === "warning" ? "alert" : "status"}
    >
      <span class="ui-alert-icon">{toneIcon(tone() === "warning" ? "warning" : tone())}</span>
      <div class="ui-alert-body">
        <Show when={props.title !== undefined}>
          <h4 class="ui-alert-title">{props.title}</h4>
        </Show>
        <p class="ui-alert-text">{props.children}</p>
      </div>
    </div>
  )
}

/** Skeleton — shimmering placeholder. Reduces perceived latency on slow loads. */
export function Skeleton(props: { readonly width?: string; readonly height?: string; readonly rounded?: string }): JSX.Element {
  return (
    <span
      class="ui-skeleton"
      style={{
        width: props.width ?? "100%",
        height: props.height ?? "1em",
        "border-radius": props.rounded ?? "0.5rem"
      }}
      aria-hidden="true"
    />
  )
}