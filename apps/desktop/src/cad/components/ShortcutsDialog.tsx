import { For, Show, createSignal, onMount, type JSX } from "solid-js"
import { X } from "lucide-solid"

export interface Shortcut { keys: string[]; description: string }
export interface ShortcutCategory { title: string; shortcuts: Shortcut[] }
interface ShortcutsDialogProps { readonly isOpen: boolean; onClose(): void; readonly shortcuts: ShortcutCategory[] }

const KBD = "px-2 py-1.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg dark:bg-gray-800 dark:text-gray-100 dark:border-gray-500"
const ARROWS: Record<string, string> = { arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→", escape: "Esc" }
const capitalise = (key: string) => (key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1))

/** Modal listing the editor's keyboard shortcuts by category, with platform-specific key names. */
export default function ShortcutsDialog(props: ShortcutsDialogProps): JSX.Element {
  const [isMac, setIsMac] = createSignal(false)
  const [active, setActive] = createSignal(0)
  onMount(() => setIsMac(navigator.platform.toLowerCase().includes("mac") || navigator.userAgent.toLowerCase().includes("mac")))

  const formatKey = (key: string): string => {
    const k = key.trim().toLowerCase()
    if (ARROWS[k]) return ARROWS[k]!
    if (isMac()) {
      switch (k) {
        case "ctrl": case "meta": return "⌘"
        case "alt": return "⌥"
        case "shift": return "⇧"
        case "backspace": return "⌫"
        case "delete": return "⌦"
      }
    } else if (k === "meta") return "Win"
    return capitalise(k)
  }
  const formatted = (shortcut: Shortcut) => shortcut.keys.map((combo) => combo.includes("+") ? combo.split("+").map(formatKey).join(" + ") : formatKey(combo))

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
          <div class="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Keyboard Shortcuts {isMac() ? "(Mac)" : "(Windows/Linux)"}</h2>
            <button onClick={props.onClose} class="text-gray-400 hover:text-gray-500 focus:outline-none"><X class="h-5 w-5" /></button>
          </div>
          <div class="flex flex-col md:flex-row flex-1 overflow-hidden">
            <div class="w-full md:w-1/4 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
              <ul class="py-2 flex flex-row md:flex-col overflow-x-auto md:overflow-x-visible">
                <For each={props.shortcuts}>{(category, index) =>
                  <li class="flex-shrink-0 md:flex-shrink">
                    <button class={`w-full text-left px-4 py-2 text-sm whitespace-nowrap md:whitespace-normal ${active() === index() ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium" : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"}`}
                      onClick={() => setActive(index())}>{category.title}</button>
                  </li>}</For>
              </ul>
            </div>
            <div class="w-full md:w-3/4 overflow-y-auto p-4 md:p-6">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">{props.shortcuts[active()]?.title}</h3>
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <For each={props.shortcuts[active()]?.shortcuts ?? []}>{(shortcut) =>
                  <div class="flex justify-between border-b border-gray-200 dark:border-gray-700 pb-2 mb-2">
                    <div class="pr-4 text-gray-700 dark:text-gray-300">{shortcut.description}</div>
                    <div class="flex flex-wrap justify-end gap-2"><For each={formatted(shortcut)}>{(key) => <kbd class={KBD}>{key}</kbd>}</For></div>
                  </div>}</For>
              </div>
            </div>
          </div>
          <div class="border-t border-gray-200 dark:border-gray-700 px-6 py-3 text-right">
            <span class="text-sm text-gray-500 dark:text-gray-400">
              Press <kbd class={KBD}>{isMac() ? "?" : "Shift + ?"}</kbd> or <kbd class={KBD}>F2</kbd> to open this dialog
            </span>
          </div>
        </div>
      </div>
    </Show>
  )
}
