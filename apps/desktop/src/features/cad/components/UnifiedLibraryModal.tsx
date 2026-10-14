import { Show, type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import { Portal } from "solid-js/web"
import { X } from "lucide-solid"

interface UnifiedLibraryModalProps {
  readonly isOpen: boolean
  onClose(): void
  /** The library manager (components / materials / tools) shown inside the frame. */
  readonly children?: JSX.Element
}

/** The "Unified Library" dialog frame: holographic panel over a blurred backdrop. */
export default function UnifiedLibraryModal(props: UnifiedLibraryModalProps): JSX.Element {
  return (
    <Show when={props.isOpen}>
      <Portal>
        <Motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => props.onClose()} class="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm" />
        <div class="fixed inset-0 z-[1001] flex items-center justify-center p-4 pointer-events-none" role="dialog" aria-modal="true" aria-label="Unified Library" onKeyDown={(event) => { if (event.key === "Escape") props.onClose() }}>
          <Motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={{ duration: 0.5 }} class="w-full max-w-6xl h-[85vh] flex flex-col pointer-events-auto" style={{ "font-family": '"CADCAM Rounded", sans-serif', "font-size": "12px", "line-height": "1.4" }}>
            <div class="relative w-full h-full">
              <div class="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-50/90 via-white/95 to-purple-50/90 dark:from-gray-900/95 dark:via-gray-800/95 dark:to-blue-900/90 backdrop-blur-xl shadow-2xl border border-white/20 dark:border-gray-700/30">
                <div class="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-400/10 via-purple-400/10 to-pink-400/10 animate-pulse" />
                <div class="absolute inset-0 rounded-2xl overflow-hidden">
                  <div class="absolute -inset-10 opacity-30">
                    <div class="absolute inset-0 translate-x-[-100%] animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-45deg]" />
                  </div>
                </div>
              </div>
              <div class="relative z-10 w-full h-full flex flex-col">
                <Motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} class="p-6 border-b border-white/20 dark:border-gray-700/30 flex justify-between items-center">
                  <div class="flex items-center space-x-3">
                    <div class="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <h2 class="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">Unified Library</h2>
                    <div class="px-3 py-1 rounded-full bg-blue-100/80 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-medium">Advanced</div>
                  </div>
                  <Motion.button hover={{ scale: 1.05, backgroundColor: "rgba(239, 68, 68, 0.1)" }} press={{ scale: 0.95 }} onClick={() => props.onClose()} class="p-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors duration-200 backdrop-blur-sm border border-transparent hover:border-red-200 dark:hover:border-red-800" aria-label="Close library">
                    <X size={20} />
                  </Motion.button>
                </Motion.div>
                <Motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} class="flex-1 min-h-0 overflow-hidden">{props.children}</Motion.div>
              </div>
              <div class="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-blue-400/30 rounded-tl-lg" />
              <div class="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-purple-400/30 rounded-tr-lg" />
              <div class="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-green-400/30 rounded-bl-lg" />
              <div class="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-pink-400/30 rounded-br-lg" />
            </div>
          </Motion.div>
        </div>
      </Portal>
    </Show>
  )
}
