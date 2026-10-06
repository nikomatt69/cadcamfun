/**
 * Modal — Apple pattern: dims to focus, separate scrim. Spring-driven.
 * Enter and exit along the same axis (slide up = slide down) for spatial consistency.
 */
import { Motion } from "solid-motionone"
import { type JSX, Show, createEffect, onCleanup } from "solid-js"
import { Portal } from "solid-js/web"
import X from "lucide-solid/icons/x"

export interface ModalProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly title?: string
  readonly children: JSX.Element
  readonly size?: "sm" | "md" | "lg"
}

const sizeClass = (size: "sm" | "md" | "lg"): string => {
  switch (size) {
    case "sm": return "ui-modal ui-modal-sm"
    case "lg": return "ui-modal ui-modal-lg"
    default: return "ui-modal ui-modal-md"
  }
}

export function Modal(props: ModalProps): JSX.Element {
  const size = () => props.size ?? "md"
  createEffect(() => {
    if (!props.open) return
    const handler = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault()
        props.onClose()
      }
    }
    window.addEventListener("keydown", handler)
    onCleanup(() => window.removeEventListener("keydown", handler))
  })
  return (
    <Show when={props.open}>
      <Portal>
        <Motion.div
          class="ui-modal-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => props.onClose()}
        >
          <Motion.div
            class={sizeClass(size())}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.35, easing: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label={props.title}
            onClick={(event) => event.stopPropagation()}
          >
            <Show when={props.title !== undefined}>
              <header class="ui-modal-header">
                <h3 class="ui-modal-title">{props.title}</h3>
                <button type="button" class="ui-modal-close" aria-label="Close" onClick={() => props.onClose()}>
                  <X size={18} aria-hidden="true" />
                </button>
              </header>
            </Show>
            <div class="ui-modal-body">{props.children}</div>
          </Motion.div>
        </Motion.div>
      </Portal>
    </Show>
  )
}

/** Sheet — side panel that slides along its edge. Translucent, no scrim, doesn't break flow. */
export interface SheetProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly side?: "right" | "left" | "bottom"
  readonly title?: string
  readonly children: JSX.Element
}

const slideFrom = (side: "right" | "left" | "bottom"): { x: number; y: number } => {
  switch (side) {
    case "right": return { x: 32, y: 0 }
    case "left": return { x: -32, y: 0 }
    case "bottom": return { x: 0, y: 32 }
  }
}

export function Sheet(props: SheetProps): JSX.Element {
  const side = () => props.side ?? "right"
  return (
    <Show when={props.open}>
      <Portal>
        <Motion.aside
          class={["ui-sheet", `ui-sheet-${side()}`].join(" ")}
          initial={{ opacity: 0, ...slideFrom(side()) }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, ...slideFrom(side()) }}
          transition={{ duration: 0.32, easing: [0.22, 1, 0.36, 1] }}
          role="dialog"
          aria-modal="true"
          aria-label={props.title}
        >
          <Show when={props.title !== undefined}>
            <header class="ui-sheet-header">
              <h3 class="ui-sheet-title">{props.title}</h3>
              <button type="button" class="ui-sheet-close" aria-label="Close" onClick={() => props.onClose()}>
                <X size={18} aria-hidden="true" />
              </button>
            </header>
          </Show>
          <div class="ui-sheet-body">{props.children}</div>
        </Motion.aside>
      </Portal>
    </Show>
  )
}