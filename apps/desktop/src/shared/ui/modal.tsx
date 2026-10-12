/**
 * Modal — dims to focus and separates the active task from the workspace.
 * Enter and exit along the same axis (slide up = slide down) for spatial consistency.
 *
 * A concise response keeps the task in focus. Mirroring the entry axis on exit avoids the
 * "appears from one place, vanishes to another" disconnect.
 */
import { Motion } from "solid-motionone"
import { type JSX, Show, createEffect, onCleanup } from "solid-js"
import { Portal } from "solid-js/web"
import X from "lucide-solid/icons/x"
import { prefersReducedMotion } from "./animated-section.tsx"

/** Reduced-motion users get the fade only — no slide/scale on either axis. */
const reduced = prefersReducedMotion

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
  let dialog: HTMLDivElement | undefined
  let previousFocus: HTMLElement | undefined

  // Capture the trigger before moving focus, then move focus into the dialog
  // (first control, dialog itself as fallback) — same pattern as the hand-rolled
  // dialogs in screens/plugins.tsx and screens/cad.tsx, here once for all.
  const onDialogRef = (element: HTMLDivElement): void => {
    dialog = element
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    queueMicrotask(() => {
      const target = dialog?.querySelector<HTMLButtonElement>("button") ?? dialog
      target?.focus()
    })
  }

  createEffect(() => {
    if (!props.open) return
    const handler = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault()
        props.onClose()
        return
      }
      if (event.key === "Tab" && dialog !== undefined) {
        const controls = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
          )
        ).filter((element) => !element.hidden)
        const first = controls[0]
        const last = controls.at(-1)
        if (first === undefined || last === undefined) {
          event.preventDefault()
          dialog.focus()
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener("keydown", handler)
    onCleanup(() => {
      window.removeEventListener("keydown", handler)
      // Return focus to the control that opened the modal.
      const restore = previousFocus
      previousFocus = undefined
      if (restore !== undefined && restore.isConnected) restore.focus()
    })
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
            ref={onDialogRef}
            class={sizeClass(size())}
            // Entry: scale 0.96 + y 24, never scale(0) (Emil). Exit mirrors
            // entry so the modal returns where it came from.
            initial={reduced() ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
            animate={reduced() ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduced() ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.24, easing: [0.23, 1, 0.32, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label={props.title ?? "Dialog"}
            tabIndex={-1}
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

/** Sheet — side panel that slides along its edge. Translucent, no scrim, doesn't break flow.
 *  Slide direction matches the side (right/left/bottom); entry distance is 8%
 *  of the panel size, not 32px (Emil: percentages adapt to content). */
export interface SheetProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly side?: "right" | "left" | "bottom"
  readonly title?: string
  readonly children: JSX.Element
}

const slideFrom = (side: "right" | "left" | "bottom"): { x: string; y: string } => {
  switch (side) {
    case "right": return { x: "8%", y: "0" }
    case "left": return { x: "-8%", y: "0" }
    case "bottom": return { x: "0", y: "8%" }
  }
}

export function Sheet(props: SheetProps): JSX.Element {
  const side = () => props.side ?? "right"
  let panel: HTMLElement | undefined
  let previousFocus: HTMLElement | undefined

  // Same dismissal/focus contract as Modal: Escape closes, focus enters the
  // panel and returns to the trigger on close (Tab wraps inside the panel).
  const onPanelRef = (element: HTMLElement): void => {
    panel = element
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    queueMicrotask(() => {
      const target = panel?.querySelector<HTMLButtonElement>("button") ?? panel
      target?.focus()
    })
  }

  createEffect(() => {
    if (!props.open) return
    const handler = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault()
        props.onClose()
        return
      }
      if (event.key === "Tab" && panel !== undefined) {
        const controls = Array.from(
          panel.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
          )
        ).filter((element) => !element.hidden)
        const first = controls[0]
        const last = controls.at(-1)
        if (first === undefined || last === undefined) {
          event.preventDefault()
          panel.focus()
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener("keydown", handler)
    onCleanup(() => {
      window.removeEventListener("keydown", handler)
      const restore = previousFocus
      previousFocus = undefined
      if (restore !== undefined && restore.isConnected) restore.focus()
    })
  })
  return (
    <Show when={props.open}>
      <Portal>
        <Motion.aside
          ref={onPanelRef}
          class={["ui-sheet", `ui-sheet-${side()}`].join(" ")}
          initial={reduced() ? { opacity: 0 } : { opacity: 0, ...slideFrom(side()) }}
          animate={reduced() ? { opacity: 1 } : { opacity: 1, x: "0", y: "0" }}
          exit={reduced() ? { opacity: 0 } : { opacity: 0, ...slideFrom(side()) }}
          // Drawer curve (iOS-like) from the reference: slower open, faster close.
          transition={{ duration: 0.32, easing: [0.32, 0.72, 0, 1] }}
          role="dialog"
          aria-modal="true"
          aria-label={props.title ?? "Panel"}
          tabIndex={-1}
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
