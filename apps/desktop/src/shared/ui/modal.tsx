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
  readonly variant?: "default" | "workspace"
  readonly open: boolean
  readonly onClose: () => void
  readonly title?: string
  readonly children: JSX.Element
  readonly size?: "sm" | "md" | "lg" | "xl"
  /** Pinned below the body: the actions stay in sight however far the body is scrolled. */
  readonly footer?: JSX.Element
  /** False hides the close button (the caller also ignores `onClose`): a dialog that must be answered, like a critical update. */
  readonly closable?: boolean
}

const sizeClass = (size: "sm" | "md" | "lg" | "xl"): string => {
  switch (size) {
    case "sm": return "ui-modal ui-modal-sm"
    case "lg": return "ui-modal ui-modal-lg"
    case "xl": return "ui-modal ui-modal-xl"
    default: return "ui-modal ui-modal-md"
  }
}

export function Modal(props: ModalProps): JSX.Element {
  const size = () => props.size ?? "md"
  let dialog: HTMLDivElement | undefined
  let previousFocus: HTMLElement | undefined

  // Capture the trigger before moving focus, then move focus into the dialog
  // (first control, dialog itself as fallback) — same pattern as the hand-rolled
  // dialogs in screens/plugins.tsx, here once for all.
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
          class={props.variant === "workspace" ? "fixed inset-0 bg-gray-600/50 dark:bg-black/60 flex items-center justify-center z-[1000] p-4" : "ui-modal-scrim"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => props.onClose()}
        >
          <Motion.div
            ref={onDialogRef}
            class={props.variant === "workspace" ? "bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full border border-gray-200 dark:border-gray-700 max-h-[calc(100dvh-2rem)] overflow-y-auto" : sizeClass(size())}
            style={props.variant === "workspace" ? { "font-family": '"CADCAM Rounded", sans-serif', "font-size": "12px", "line-height": "1.4" } : undefined}
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
              <header class={props.variant === "workspace" ? "px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center" : "ui-modal-header"}>
                <h3 class={props.variant === "workspace" ? "text-lg font-medium text-gray-900 dark:text-white" : "ui-modal-title"}>{props.title}</h3>
                <Show when={props.closable !== false}>
                  <button type="button" class={props.variant === "workspace" ? "text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 transition-colors" : "ui-modal-close"} aria-label="Close" onClick={() => props.onClose()}>
                    <X size={18} aria-hidden="true" />
                  </button>
                </Show>
              </header>
            </Show>
            <div class={props.variant === "workspace" ? "" : "ui-modal-body"}>{props.children}</div>
            <Show when={props.footer !== undefined}>
              <footer class={props.variant === "workspace" ? "px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end items-center gap-2" : "ui-modal-footer"}>
                {props.footer}
              </footer>
            </Show>
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
