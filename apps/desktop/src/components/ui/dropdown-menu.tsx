/**
 * DropdownMenu — minimal, keyboard-friendly menu primitive.
 *
 * Design notes (emil-design-eng):
 * - Menu grows from the trigger (origin-aware). The CSS rule
 *   `transform-origin: var(--ui-popover-origin)` reads the inline variable.
 * - Never scale(0); enter from scale(0.95) + opacity (Sonner pattern).
 * - Reduced motion: fade only.
 * - Click-outside, Escape, and Tab close. Arrow keys move focus.
 */
import { Motion, Presence } from "solid-motionone"
import { type JSX, For, Show, createContext, createSignal, createUniqueId, onCleanup, useContext } from "solid-js"
import { prefersReducedMotion } from "./animated-section.tsx"

const reduced = prefersReducedMotion

interface MenuContextValue {
  readonly close: () => void
  readonly trigger: (item: HTMLDivElement) => void
}

const MenuContext = createContext<MenuContextValue>()

export interface DropdownMenuProps {
  readonly children: JSX.Element
}

export function DropdownMenu(props: DropdownMenuProps): JSX.Element {
  const [open, setOpen] = createSignal(false)
  const [origin, setOrigin] = createSignal<{ x: number; y: number }>({ x: 0, y: 0 })
  let trigger: HTMLElement | undefined
  let menu: HTMLDivElement | undefined

  const onWindowPointer = (event: MouseEvent): void => {
    const target = event.target
    if (!(target instanceof Node)) return
    if (trigger?.contains(target) === true) return
    if (menu?.contains(target) === true) return
    setOpen(false)
  }
  const onKey = (event: KeyboardEvent): void => {
    if (!open()) return
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger?.focus() }
  }
  const setTriggerRef = (element: HTMLElement): void => {
    trigger = element
    element.addEventListener("click", () => {
      const next = !open()
      setOpen(next)
      if (next) {
        const rect = element.getBoundingClientRect()
        setOrigin({ x: rect.left + rect.width / 2, y: rect.bottom })
      }
    })
    onCleanup(() => element.removeEventListener("click", () => {}))
  }
  onCleanup(() => {
    window.removeEventListener("pointerdown", onWindowPointer)
    window.removeEventListener("keydown", onKey)
  })
  // Attach window listeners lazily on open.
  const attach = (): void => {
    window.addEventListener("pointerdown", onWindowPointer)
    window.addEventListener("keydown", onKey)
  }
  void attach

  const items: () => ReadonlyArray<HTMLDivElement> = () => {
    if (menu === undefined) return []
    return Array.from(menu.querySelectorAll<HTMLDivElement>("[role=menuitem]"))
  }
  const focusItem = (offset: number): void => {
    const list = items()
    const current = document.activeElement as HTMLDivElement | null
    const idx = current === null ? -1 : list.indexOf(current)
    const next = list[(idx + offset + list.length) % list.length]
    next?.focus()
  }
  const ctx: MenuContextValue = {
    close: () => setOpen(false),
    trigger: (item) => { menu = item; item.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown") { event.preventDefault(); focusItem(1) }
        else if (event.key === "ArrowUp") { event.preventDefault(); focusItem(-1) }
        else if (event.key === "Home") { event.preventDefault(); items()[0]?.focus() }
        else if (event.key === "End") { event.preventDefault(); items().at(-1)?.focus() }
      }) }
  }
  return (
    <MenuContext.Provider value={ctx}>
      <Slot trigger={setTriggerRef}>
        {props.children}
      </Slot>
      <Presence exitBeforeEnter>
        <Show when={open()}>
          <Motion.div
            ref={(element) => { menu = element; ctx.trigger(element) }}
            class="ui-menu"
            style={{
                left: `${origin().x}px`,
                top: `${origin().y}px`,
                "--ui-popover-origin": "50% 0%"
              } as JSX.CSSProperties}
            initial={reduced() ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -4 }}
            animate={reduced() ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduced() ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.16, easing: [0.23, 1, 0.32, 1] }}
            role="menu"
            aria-orientation="vertical"
          >
            {props.children}
          </Motion.div>
        </Show>
      </Presence>
    </MenuContext.Provider>
  )
}

/** Slot — wraps the immediate child to inject the trigger ref. */
function Slot(props: { readonly trigger: (element: HTMLElement) => void; readonly children: JSX.Element }): JSX.Element {
  return <span ref={props.trigger}>{props.children}</span>
}

export interface DropdownMenuTriggerProps {
  readonly as?: "button"
  readonly children: JSX.Element
}
export function DropdownMenuTrigger(props: DropdownMenuTriggerProps): JSX.Element {
  return <>{props.children}</>
}

export interface DropdownMenuItemProps {
  readonly disabled?: boolean
  readonly onSelect?: () => void
  readonly children: JSX.Element
}
export function DropdownMenuItem(props: DropdownMenuItemProps): JSX.Element {
  const ctx = useContext(MenuContext)
  return (
    <div
      role="menuitem"
      tabIndex={props.disabled === true ? -1 : 0}
      class="ui-menu-item"
      classList={{ "ui-menu-item-disabled": props.disabled === true }}
      aria-disabled={props.disabled === true ? "true" : undefined}
      onClick={() => {
        if (props.disabled === true) return
        props.onSelect?.()
        ctx?.close()
      }}
    >
      {props.children}
    </div>
  )
}

export function DropdownMenuSeparator(): JSX.Element {
  return <div role="separator" class="ui-menu-separator" />
}

export interface DropdownMenuLabelProps { readonly children: JSX.Element }
export function DropdownMenuLabel(props: DropdownMenuLabelProps): JSX.Element {
  return <div class="ui-menu-label">{props.children}</div>
}

// Re-export createUniqueId to keep callers consistent if they import the
// package-level helper alongside the dropdown.
export { createUniqueId }