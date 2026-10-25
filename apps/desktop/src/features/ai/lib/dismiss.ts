/**
 * The "click outside closes it" rule, in one place.
 *
 * The assistant had three copies of the same idea — the model menu, the run-control
 * menus and the drawing scope menu each installed their own `pointerdown`/`keydown`
 * listeners and each remembered to remove them. A menu that forgets leaks a listener
 * for the life of the window and closes itself when the user clicks somewhere else.
 *
 * This module is the one implementation: a menu tells it which element is "inside"
 * (usually a class selector on its root) and it closes when the pointer lands
 * outside, when Escape is pressed, or when the owner says so.
 */
import { createEffect, onCleanup, type Accessor } from "solid-js"

export interface DismissOptions {
  /** True while the thing is open; the listeners exist only while it is. */
  readonly open: Accessor<boolean>
  /** Selector of the element that counts as "inside" — the menu's own root. */
  readonly root: string
  /** Called when the menu should close. */
  readonly onDismiss: () => void
  /** Extra elements to treat as inside (a portal, a trigger button elsewhere). */
  readonly alsoInside?: ReadonlyArray<string>
}

/**
 * Wires the dismissal of an open menu. Returns nothing: the effect lives as long
 * as the component does, and the listeners exist only while the menu is open.
 */
export const createDismissable = (options: DismissOptions): void => {
  createEffect(() => {
    if (!options.open()) return
    const inside = (event: Event): boolean => {
      const target = event.target as Element | null
      if (target === null) return false
      if (target.closest?.(options.root) !== null) return true
      return (options.alsoInside ?? []).some((selector) => target.closest?.(selector) !== null)
    }
    const away = (event: PointerEvent): void => {
      if (!inside(event)) options.onDismiss()
    }
    const escape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") options.onDismiss()
    }
    // Capture phase: the menu closes even when something else stops the event.
    document.addEventListener("pointerdown", away, true)
    document.addEventListener("keydown", escape)
    onCleanup(() => {
      document.removeEventListener("pointerdown", away, true)
      document.removeEventListener("keydown", escape)
    })
  })
}
