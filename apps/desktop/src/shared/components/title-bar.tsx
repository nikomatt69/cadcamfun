/**
 * The in-window title bar (spec 06-desktop-ui.md §1).
 *
 * On macOS the shell provides real native menus, so the bar is a thin drag region with
 * the app name. On Windows and Linux there are no native menus, so the same bar carries
 * the menu items and forwards them to the shell as the ids `src-tauri/src/menu.rs`
 * defines (`file.new`, `view.zoom_in`, …). The item list comes from that file's
 * contract, so the fallback can never invent an id the shell does not know.
 */
import { createEffect, createSignal, For, onCleanup, Show, type JSX } from "solid-js"
import ChevronDown from "lucide-solid/icons/chevron-down"
import Search from "lucide-solid/icons/search"
import { t, type Key } from "../../i18n/index.ts"
import { isTauri } from "../../app/sidecar.ts"

export type MenuId = "file" | "edit" | "view" | "window" | "help"

interface MenuItem {
  /** Stable id forwarded to the shell; must exist in `menu.rs`. */
  readonly id: string
  readonly labelKey: Key
  readonly accelerator: string | undefined
}

interface Menu {
  readonly id: MenuId
  readonly labelKey: Key
  readonly items: ReadonlyArray<MenuItem>
}

/** Mirrors `FILE_ITEMS`, `VIEW_ITEMS` and `HELP_ITEMS` in `src-tauri/src/menu.rs`. */
export const MENUS: ReadonlyArray<Menu> = [
  {
    id: "file",
    labelKey: "titlebar.file",
    items: [
      { id: "file.new", labelKey: "titlebar.item.new", accelerator: "Cmd/Ctrl+N" },
      { id: "file.open", labelKey: "titlebar.item.open", accelerator: "Cmd/Ctrl+O" },
      { id: "file.save", labelKey: "titlebar.item.save", accelerator: "Cmd/Ctrl+S" },
      { id: "file.export_gcode", labelKey: "titlebar.item.exportGcode", accelerator: "Cmd/Ctrl+Shift+E" }
    ]
  },
  {
    id: "edit",
    labelKey: "titlebar.edit",
    items: [
      { id: "edit.undo", labelKey: "titlebar.item.undo", accelerator: undefined },
      { id: "edit.redo", labelKey: "titlebar.item.redo", accelerator: undefined },
      { id: "edit.cut", labelKey: "titlebar.item.cut", accelerator: undefined },
      { id: "edit.copy", labelKey: "titlebar.item.copy", accelerator: undefined },
      { id: "edit.paste", labelKey: "titlebar.item.paste", accelerator: undefined },
      { id: "edit.select_all", labelKey: "titlebar.item.selectAll", accelerator: undefined }
    ]
  },
  {
    id: "view",
    labelKey: "titlebar.view",
    items: [
      { id: "view.zoom_in", labelKey: "titlebar.item.zoomIn", accelerator: "Cmd/Ctrl+=" },
      { id: "view.zoom_out", labelKey: "titlebar.item.zoomOut", accelerator: "Cmd/Ctrl+-" },
      { id: "view.zoom_fit", labelKey: "titlebar.item.zoomFit", accelerator: "Cmd/Ctrl+0" },
      { id: "view.preset_top", labelKey: "titlebar.item.presetTop", accelerator: "Cmd/Ctrl+1" },
      { id: "view.preset_front", labelKey: "titlebar.item.presetFront", accelerator: "Cmd/Ctrl+2" },
      { id: "view.preset_right", labelKey: "titlebar.item.presetRight", accelerator: "Cmd/Ctrl+3" },
      { id: "view.preset_iso", labelKey: "titlebar.item.presetIso", accelerator: "Cmd/Ctrl+4" },
      { id: "view.toggle_left_panel", labelKey: "titlebar.item.toggleLeftPanel", accelerator: "Cmd/Ctrl+B" },
      { id: "view.toggle_right_panel", labelKey: "titlebar.item.toggleRightPanel", accelerator: "Cmd/Ctrl+Alt+B" },
      { id: "view.toggle_console", labelKey: "titlebar.item.toggleConsole", accelerator: "Cmd/Ctrl+J" }
    ]
  },
  { id: "window", labelKey: "titlebar.window", items: [] },
  {
    id: "help",
    labelKey: "titlebar.help",
    items: [
      { id: "help.documentation", labelKey: "titlebar.item.documentation", accelerator: undefined },
      { id: "help.open_logs", labelKey: "titlebar.item.openLogs", accelerator: undefined }
    ]
  }
]

export interface TitleBarProps {
  /** Receives the menu item id; the shell maps it to a command. */
  readonly onMenu: (id: string) => void
  readonly onOpenPalette: () => void
  /** Forces the fallback menus on (used in browser dev and by the component test). */
  readonly forceMenus?: boolean
}

/**
 * True when the in-window menus are needed: outside Tauri (browser dev and tests) or on
 * the platforms the shell cannot give native menus.
 */
export const needsMenuFallback = (force?: boolean): boolean =>
  force === true || !isTauri() || typeof navigator === "undefined" || !navigator.userAgent.includes("Mac")

export function TitleBar(props: TitleBarProps): JSX.Element {
  const [open, setOpen] = createSignal<MenuId | undefined>(undefined)
  const withMenus = (): boolean => needsMenuFallback(props.forceMenus)
  let nav: HTMLElement | undefined
  let openTrigger: HTMLButtonElement | undefined

  // One dismissal contract for the open menu: Escape closes it and returns
  // focus to its button; a pointer-down outside the menu bar closes it too
  // (a dropdown that only closes on its own button is a classic dead end).
  createEffect(() => {
    if (open() === undefined) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return
      event.preventDefault()
      setOpen(undefined)
      openTrigger?.focus()
      openTrigger = undefined
    }
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Node && nav !== undefined && !nav.contains(target)) {
        setOpen(undefined)
        openTrigger = undefined
      }
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("pointerdown", onPointerDown)
    onCleanup(() => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("pointerdown", onPointerDown)
    })
  })

  return (
    <header
      class="reference-native-titlebar flex h-11 shrink-0 items-center gap-1 border-b border-gray-200 bg-white pl-20 pr-2 dark:border-gray-700 dark:bg-gray-800"
      data-tauri-drag-region
    >
      <Show when={withMenus()} fallback={
        <span class="px-2 text-sm font-semibold" data-tauri-drag-region>
          {t("app.name")}
        </span>
      }>
        <nav ref={(element) => { nav = element }} aria-label={t("titlebar.menu")} class="flex items-center gap-1">
          <For each={MENUS.filter((menu) => menu.items.length > 0)}>
            {(menu) => {
              let trigger: HTMLButtonElement | undefined
              return (
                <div class="relative">
                  <button
                    type="button"
                    ref={(element) => { trigger = element }}
                    class="flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-gray-700"
                    aria-haspopup="menu"
                    aria-expanded={open() === menu.id}
                    onClick={() => {
                      if (open() === menu.id) {
                        setOpen(undefined)
                        openTrigger = undefined
                      } else {
                        openTrigger = trigger
                        setOpen(menu.id)
                      }
                    }}
                  >
                    {t(menu.labelKey)}
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                  <Show when={open() === menu.id}>
                    <ul
                      // Opening moves focus to the first item so the arrow keys
                      // work immediately, whichever way the menu was opened.
                      ref={(element) => queueMicrotask(() => element.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus())}
                      class="absolute left-0 top-full z-50 mt-1 min-w-56 rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800"
                      role="menu"
                      aria-label={t(menu.labelKey)}
                      onKeyDown={(event) => {
                        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
                        const current = items.findIndex((element) => element === document.activeElement)
                        if (event.key === "ArrowDown") {
                          event.preventDefault()
                          items[(current + 1 + items.length) % items.length]?.focus()
                        } else if (event.key === "ArrowUp") {
                          event.preventDefault()
                          items[(current - 1 + items.length) % items.length]?.focus()
                        } else if (event.key === "Home") {
                          event.preventDefault()
                          items[0]?.focus()
                        } else if (event.key === "End") {
                          event.preventDefault()
                          items.at(-1)?.focus()
                        }
                      }}
                    >
                      <For each={menu.items}>
                        {(item) => (
                          <li role="none">
                            <button
                              type="button"
                              role="menuitem"
                              class="flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-sm hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 dark:hover:bg-gray-700"
                              onClick={() => {
                                setOpen(undefined)
                                openTrigger = undefined
                                // The menu is gone; keep focus where it was.
                                trigger?.focus()
                                props.onMenu(item.id)
                              }}
                            >
                              <span>{t(item.labelKey)}</span>
                              <Show when={item.accelerator !== undefined}>
                                <kbd class="text-xs text-gray-500">{item.accelerator}</kbd>
                              </Show>
                            </button>
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                </div>
              )
            }}
          </For>
        </nav>
      </Show>

      <Show when={withMenus()}><span class="ml-2 text-sm font-semibold" data-tauri-drag-region>
        {t("app.name")}
      </span></Show>

      <button
        type="button"
        class="ml-auto flex items-center gap-2 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-600 dark:hover:bg-gray-700"
        aria-label={t("settings.shortcut.palette")}
        aria-keyshortcuts="Meta+K Control+K"
        onClick={() => props.onOpenPalette()}
      >
        <Search size={14} aria-hidden="true" />
        <kbd>Cmd/Ctrl+K</kbd>
      </button>
    </header>
  )
}
