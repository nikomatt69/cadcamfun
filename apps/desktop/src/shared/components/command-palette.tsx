/**
 * The command palette (spec 06-desktop-ui.md §1: `Cmd/Ctrl+K`).
 *
 * Pure presentation: the commands come in as a list, filtering is `filterCommands` from
 * `app/shortcuts.ts`, and the shell decides what running one means. Keyboard-first:
 * arrow keys move, Enter runs, Escape closes, and the input is auto-focused.
 */
import { createEffect, createSignal, For, onCleanup, Show, type JSX } from "solid-js"
import { createUniqueId } from "solid-js"
import Search from "lucide-solid/icons/search"
import X from "lucide-solid/icons/x"
import { t } from "../../i18n/index.ts"
import { filterCommands } from "../../app/shortcuts.ts"

export interface PaletteCommand {
  readonly id: string
  readonly label: string
  /** Group heading, already translated. */
  readonly group: string
  readonly keys?: string
  readonly run: () => void
}

export interface CommandPaletteProps {
  readonly commands: ReadonlyArray<PaletteCommand>
  readonly onClose: () => void
}

/** Modal overlay. Renders nothing when there are no commands to show. */
export function CommandPalette(props: CommandPaletteProps): JSX.Element {
  const inputId = createUniqueId()
  const [query, setQuery] = createSignal("")
  const [highlight, setHighlight] = createSignal(0)

  // The palette mounts when it opens, so the element focused right here is the
  // trigger; return focus to it when it unmounts (same contract as Modal).
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
  let dialog: HTMLDivElement | undefined
  onCleanup(() => {
    if (previousFocus !== undefined && previousFocus.isConnected) previousFocus.focus()
  })

  const results = (): ReadonlyArray<PaletteCommand> => filterCommands(props.commands, query())

  // Combobox pattern: the input announces which option is active.
  const activeId = (): string | undefined =>
    results().length > 0 ? `${inputId}-opt-${highlight()}` : undefined

  // Keep the highlight inside the filtered list as the query narrows it.
  createEffect(() => {
    const count = results().length
    if (highlight() >= count) setHighlight(Math.max(0, count - 1))
  })

  // Keep the highlighted option visible while arrowing through a scrolling list.
  createEffect(() => {
    highlight()
    queueMicrotask(() => {
      const option = dialog?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')
      if (option != null && typeof option.scrollIntoView === "function") {
        option.scrollIntoView({ block: "nearest" })
      }
    })
  })

  const move = (delta: number): void => {
    const count = results().length
    if (count === 0) return
    setHighlight((current) => (current + delta + count) % count)
  }

  const runAt = (index: number): void => {
    const command = results()[index]
    if (command === undefined) return
    props.onClose()
    command.run()
  }

  // Dialog-level keys: Escape closes and Tab stays inside the palette, no matter
  // which control (input or close button) has focus.
  const onDialogKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault()
      props.onClose()
      return
    }
    if (event.key === "Tab" && dialog !== undefined) {
      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>('input, button:not(:disabled), a[href], [tabindex="0"]')
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

  const onKeyDown = (event: KeyboardEvent): void => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault()
        move(1)
        return
      case "ArrowUp":
        event.preventDefault()
        move(-1)
        return
      case "Home":
        event.preventDefault()
        setHighlight(0)
        return
      case "End":
        event.preventDefault()
        setHighlight(Math.max(0, results().length - 1))
        return
      case "Enter":
        event.preventDefault()
        runAt(highlight())
        return
      default:
        return
    }
  }

  return (
    <div
      class="ui-palette-scrim fixed inset-0 z-[1060] flex items-start justify-center bg-black/40 pt-24"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose()
      }}
    >
      <div
        ref={(element) => { dialog = element }}
        class="ui-palette-panel card w-full max-w-xl"
        role="dialog"
        aria-modal="true"
        aria-label={t("palette.title")}
        tabIndex={-1}
        onKeyDown={onDialogKeyDown}
      >
        <div class="flex items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-gray-700">
          <Search size={16} aria-hidden="true" class="text-gray-500" />
          <input
            id={inputId}
            class="w-full bg-transparent text-sm outline-none"
            type="text"
            role="combobox"
            aria-expanded={results().length > 0}
            aria-controls={results().length > 0 ? `${inputId}-list` : undefined}
            aria-autocomplete="list"
            aria-activedescendant={activeId()}
            placeholder={t("palette.placeholder")}
            // eslint-disable-next-line solid/refs -- autofocus is the point of a palette
            ref={(element) => queueMicrotask(() => element.focus())}
            value={query()}
            onInput={(event) => {
              setQuery(event.currentTarget.value)
              setHighlight(0)
            }}
            onKeyDown={onKeyDown}
          />
          <button
            type="button"
            class="rounded p-1 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-gray-700"
            aria-label={t("common.close")}
            onClick={() => props.onClose()}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <Show
          when={results().length > 0}
          fallback={<p class="px-3 py-6 text-center text-sm text-gray-500">{t("palette.empty")}</p>}
        >
          <ul id={`${inputId}-list`} role="listbox" aria-label={t("palette.title")} class="max-h-80 overflow-y-auto py-1">
            <For each={results()}>
              {(command, index) => (
                <li role="none">
                  <button
                    type="button"
                    id={`${inputId}-opt-${index()}`}
                    role="option"
                    aria-selected={index() === highlight()}
                    class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm"
                    classList={{
                      "bg-blue-50 dark:bg-blue-900/40": index() === highlight(),
                      "hover:bg-gray-100 dark:hover:bg-gray-700": index() !== highlight()
                    }}
                    onMouseEnter={() => setHighlight(index())}
                    onClick={() => runAt(index())}
                  >
                    <span>
                      <span class="mr-2 text-xs uppercase text-gray-500">{command.group}</span>
                      {command.label}
                    </span>
                    <Show when={command.keys !== undefined}>
                      <kbd class="text-xs text-gray-500">{command.keys}</kbd>
                    </Show>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>

        <p class="border-t border-gray-200 px-3 py-2 text-xs text-gray-500 dark:border-gray-700">
          {t("palette.hint")}
        </p>
      </div>
    </div>
  )
}
