import { For, createSignal, type JSX } from "solid-js"
import { Check, X } from "lucide-solid"

type Kind = "success" | "error" | "info"
interface Toast { readonly id: number; readonly kind: Kind; readonly message: string }

const [toasts, setToasts] = createSignal<readonly Toast[]>([])
let next = 0

const push = (kind: Kind, message: string, duration = 4000): number => {
  const id = ++next
  setToasts((all) => [...all, { id, kind, message }])
  setTimeout(() => dismiss(id), duration)
  return id
}
const dismiss = (id: number) => setToasts((all) => all.filter((entry) => entry.id !== id))

/** `react-hot-toast` look-alike: `toast("...")`, `toast.success`, `toast.error`, rendered by `<Toaster />`. */
export const toast = Object.assign((message: string) => push("info", message), {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message, 5000),
  dismiss
})

/** Mount once near the app root. */
export function Toaster(): JSX.Element {
  return (
    <div class="fixed top-4 left-1/2 -translate-x-1/2 z-[10000] flex flex-col items-center gap-2 pointer-events-none" role="status" aria-live="polite">
      <For each={toasts()}>{(entry) =>
        <div class="pointer-events-auto flex items-center gap-2 max-w-sm px-4 py-2 rounded-lg shadow-lg bg-white text-gray-900 dark:bg-gray-800 dark:text-white border border-gray-200 dark:border-gray-700 text-sm">
          {entry.kind === "success" && <Check size={16} class="text-green-500 shrink-0" />}
          {entry.kind === "error" && <X size={16} class="text-red-500 shrink-0" />}
          <span>{entry.message}</span>
        </div>}
      </For>
    </div>
  )
}
