import { onCleanup, onMount } from "solid-js"

export interface KeyboardShortcutHandlers {
  onDelete?: () => void
  onEscape?: () => void
  onSelectAll?: () => void
  onDeselectAll?: () => void
  onCopy?: () => void
  onPaste?: () => void
  onDuplicate?: () => void
  onUndo?: () => void
  onRedo?: () => void
  onTransform?: (mode: "translate" | "rotate" | "scale") => void
  onZoomIn?: () => void
  onZoomOut?: () => void
  onZoomToFit?: () => void
  onViewModeToggle?: (mode: "3d" | "2d") => void
  onToggleGrid?: () => void
  onToggleAxis?: () => void
  onToggleFullscreen?: () => void
  onToggleSnap?: () => void
  onShowShortcuts?: () => void
  onSave?: () => void
}

const isTyping = (event: KeyboardEvent) => {
  const target = event.target
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
}

/**
 * The editor's global keyboard shortcuts (documented in `ALL_SHORTCUTS`). Handlers are read at event time, so they can
 * close over reactive state. Never fires while the user types in a field. Port of the legacy `useCADKeyboardShortcuts`.
 */
export function createCadKeyboardShortcuts(handlers: KeyboardShortcutHandlers): void {
  const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform)
  onMount(() => {
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      const mod = isMac ? e.metaKey : e.ctrlKey
      const key = e.key.toLowerCase()
      const run = (fn: (() => void) | undefined): boolean => { if (!fn) return false; e.preventDefault(); fn(); return true }

      if (e.key === "Delete" || e.key === "Backspace") return void run(handlers.onDelete)
      if (e.key === "Escape") return void run(handlers.onEscape)
      if (e.key === "?" || (e.key === "/" && e.shiftKey) || e.key === "F2") return void run(handlers.onShowShortcuts)
      if (e.key === "F11" || (e.altKey && key === "f")) return void run(handlers.onToggleFullscreen)
      if (mod) {
        if (!e.shiftKey && key === "z") return void run(handlers.onUndo)
        if ((e.shiftKey && key === "z") || (!isMac && key === "y")) return void run(handlers.onRedo)
        if (key === "a") return void run(e.shiftKey ? handlers.onDeselectAll : handlers.onSelectAll)
        if (key === "c") return void run(handlers.onCopy)
        if (key === "v") return void run(handlers.onPaste)
        if (key === "d") return void run(handlers.onDuplicate)
        if (key === "s") return void run(handlers.onSave)
        if (key === "x") return void run(handlers.onToggleSnap)
        if (key === "g") return void run(handlers.onToggleGrid)
        if (key === "1") return void run(handlers.onViewModeToggle && (() => handlers.onViewModeToggle!("3d")))
        if (key === "2") return void run(handlers.onViewModeToggle && (() => handlers.onViewModeToggle!("2d")))
        return
      }
      if (e.altKey) return
      if (key === "g") return void run(handlers.onTransform && (() => handlers.onTransform!("translate")))
      if (key === "r") return void run(handlers.onTransform && (() => handlers.onTransform!("rotate")))
      if (key === "s") return void run(handlers.onTransform && (() => handlers.onTransform!("scale")))
      if (e.key === "+" || e.key === "=") return void run(handlers.onZoomIn)
      if (e.key === "-" || e.key === "_") return void run(handlers.onZoomOut)
      if (e.key === "Home" || key === "f") return void run(handlers.onZoomToFit)
    }
    window.addEventListener("keydown", down)
    onCleanup(() => window.removeEventListener("keydown", down))
  })
}
