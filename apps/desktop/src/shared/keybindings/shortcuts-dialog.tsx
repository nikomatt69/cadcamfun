import { For, Show, createMemo, createSignal, type JSX } from "solid-js"
import { t, type Key } from "../../i18n/index.ts"
import { Modal } from "../ui/modal.tsx"
import { useApp } from "../state/context.ts"
import { COMMANDS, GROUPS, groupKeyOf, labelKeyOf, type Scope } from "./catalog.ts"
import { displayChord } from "./chord.ts"
import { ChordKeys } from "./chips.tsx"

const SCOPE_TABS: ReadonlyArray<Scope> = ["global", "cad", "cam"]

/** The mouse gestures of the 3D views; they are not commands, so they are not rebindable. */
const MOUSE: ReadonlyArray<readonly [Key, string]> = [
  ["keys.mouse.orbit", "Left drag"], ["keys.mouse.pan", "Middle / Right drag"], ["keys.mouse.zoom", "Wheel"],
  ["keys.mouse.add", "Shift / Ctrl + Click"], ["keys.mouse.fit", "Double click"]
]

/**
 * The shortcuts dialog (`?` / `F1`). Built from the keymap, so it shows the chords the user actually has - rebinding
 * a command changes this dialog, the palette and the tooltips at once.
 */
export function ShortcutsDialog(): JSX.Element {
  const app = useApp()
  const keys = app.keys
  const initial = (): Scope => (app.activity() === "cam" ? "cam" : "cad")
  const [picked, setPicked] = createSignal<Scope | undefined>(undefined)
  const scope = (): Scope => picked() ?? initial()
  const [query, setQuery] = createSignal("")

  const sections = createMemo(() => {
    const needle = query().trim().toLowerCase()
    const keymap = keys.keymap()
    return GROUPS.flatMap((group) => {
      const rows = COMMANDS
        .filter((command) => command.group === group && command.scope === scope())
        .map((command) => ({ command, label: t(labelKeyOf(command.id) as Key), chords: keymap.entry(command.id)?.chords ?? [] }))
        .filter((row) => needle.length === 0 || row.label.toLowerCase().includes(needle) || row.chords.some((chord) => displayChord(chord, keys.platform).toLowerCase().includes(needle)))
      return rows.length === 0 ? [] : [{ group, rows }]
    })
  })

  return (
    <Modal open={keys.helpOpen()} onClose={() => keys.setHelpOpen(false)} title={t("keys.title")} size="xl">
      <div class="flex flex-col gap-3" data-testid="shortcuts-dialog">
        <div class="flex flex-wrap items-center gap-2">
          <div role="tablist" class="flex gap-1">
            <For each={SCOPE_TABS}>{(tab) =>
              <button type="button" role="tab" aria-selected={scope() === tab} onClick={() => setPicked(tab)}
                class="rounded-md px-3 py-1 text-sm" classList={{ "bg-blue-600 text-white": scope() === tab, "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200": scope() !== tab }}>
                {t(`keys.scope.${tab}` as Key)}
              </button>}
            </For>
          </div>
          <input type="search" value={query()} onInput={(event) => setQuery(event.currentTarget.value)} placeholder={t("keys.search")} aria-label={t("keys.search")}
            class="ml-auto min-w-[12rem] rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800" />
        </div>
        <Show when={sections().length > 0} fallback={<p class="py-6 text-center text-sm text-gray-500">{t("keys.help.empty")}</p>}>
          <div class="grid max-h-[60vh] grid-cols-1 gap-x-8 gap-y-4 overflow-y-auto pr-1 lg:grid-cols-2">
            <For each={sections()}>{(section) =>
              <section>
                <h4 class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{t(groupKeyOf(section.group) as Key)}</h4>
                <ul>
                  <For each={section.rows}>{(row) =>
                    <li class="flex items-center justify-between gap-3 border-b border-gray-200 py-1.5 text-sm dark:border-gray-700" data-command={row.command.id}>
                      <span class="text-gray-700 dark:text-gray-300">{row.label}</span>
                      <span class="flex flex-wrap justify-end gap-2">
                        <For each={row.chords} fallback={<span class="text-xs text-gray-400">{t("keys.unbound")}</span>}>{(chord) => <ChordKeys chord={chord} platform={keys.platform} />}</For>
                      </span>
                    </li>}
                  </For>
                </ul>
              </section>}
            </For>
          </div>
        </Show>
        <Show when={scope() !== "cam"}>
          <section>
            <h4 class="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{t("keys.mouse.title")}</h4>
            <ul class="grid grid-cols-1 gap-x-8 lg:grid-cols-2">
              <For each={MOUSE}>{([label, gesture]) =>
                <li class="flex items-center justify-between border-b border-gray-200 py-1.5 text-sm dark:border-gray-700"><span>{t(label)}</span><kbd class="text-xs text-gray-600 dark:text-gray-300">{gesture}</kbd></li>}
              </For>
            </ul>
          </section>
        </Show>
        <p class="text-xs text-gray-500">{t("keys.help.hint", { keys: keys.keymap().entry("app.shortcuts")?.chords.map((chord) => displayChord(chord, keys.platform)).join(" / ") ?? "" })}</p>
      </div>
    </Modal>
  )
}
