/**
 * The two dialogs the CAM toolbar opens: the Unified Library (the CAD dialog frame around the Library Manager)
 * and the production costs manager.
 */
import { Show, createEffect, onCleanup, type JSX } from "solid-js"
import { X } from "lucide-solid"
import { CostsScreen } from "../../costs/screens/costs.tsx"
import UnifiedLibraryModal from "../../cad/components/UnifiedLibraryModal.tsx"
import { toast } from "../../../shared/ui/toast.tsx"
import { t } from "../../../i18n/index.ts"
import LibraryManager from "../../library/components/LibraryManager.tsx"
import type { MaterialLibraryItem, ToolLibraryItem } from "../../library/hooks/useUnifiedLibrary.ts"
import { useGeneratorStore, type LibraryTool } from "../store/generatorStore.ts"

/**
 * Tool library: the legacy "Unified Library" dialog with its Library Manager (components / materials / tools,
 * on the Tools tab by default). Picking a tool fills the generator's tool settings (`selectLibraryTool`).
 */
export function ToolLibraryModal(props: {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly onSelectTool?: (tool: ToolLibraryItem) => void
  readonly onSelectMaterial?: (material: MaterialLibraryItem) => void
}): JSX.Element {
  const gen = useGeneratorStore()
  const pickTool = (tool: ToolLibraryItem): void => {
    gen.selectLibraryTool({ ...tool, numberOfFlutes: tool.numberOfFlutes ?? undefined, maxRPM: tool.maxRPM ?? undefined } as unknown as LibraryTool)
    props.onSelectTool?.(tool)
    toast.success(t("cam.library.toolSelected", { name: tool.name }))
    props.onClose()
  }
  const pickMaterial = (material: MaterialLibraryItem): void => {
    // The legacy page only logged the material and closed the dialog.
    console.log("Selected material:", material)
    props.onSelectMaterial?.(material)
    props.onClose()
  }
  return (
    <UnifiedLibraryModal isOpen={props.isOpen} onClose={props.onClose}>
      <div class="h-full" data-testid="cam-tool-library">
        <LibraryManager defaultTab="tools" onSelectTool={pickTool} onSelectMaterial={pickMaterial} showCloseButton={false} />
      </div>
    </UnifiedLibraryModal>
  )
}

export function CostsModal(props: { readonly isOpen: boolean; readonly onClose: () => void }): JSX.Element {
  let dialog: HTMLDivElement | undefined
  let previousFocus: HTMLElement | undefined

  // Same dismissal/focus contract as `components/ui/modal.tsx`: focus enters the
  // dialog, Escape and the backdrop close it, focus returns to the trigger.
  const onDialogRef = (element: HTMLDivElement): void => {
    dialog = element
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    queueMicrotask(() => {
      const target = dialog?.querySelector<HTMLButtonElement>("button") ?? dialog
      target?.focus()
    })
  }

  createEffect(() => {
    if (!props.isOpen) return
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
      const restore = previousFocus
      previousFocus = undefined
      if (restore !== undefined && restore.isConnected) restore.focus()
    })
  })

  return (
    <Show when={props.isOpen}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4"
        role="dialog"
        aria-modal="true"
        aria-label={t("costs.manager")}
        onClick={(event) => { if (event.target === event.currentTarget) props.onClose() }}
      >
        <div
          ref={onDialogRef}
          class="w-full max-w-7xl max-h-[70vh] flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-xl"
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
        >
          <div class="p-4 border-b dark:border-gray-700 flex justify-between items-center">
            <h2 class="text-xl dark:text-blue-400 font-bold">{t("costs.manager")}</h2>
            <button type="button" onClick={() => props.onClose()} class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" aria-label={t("common.close")}><X size={20} class="dark:text-gray-300" /></button>
          </div>
          <div class="flex-1 rounded-xl overflow-y-auto"><CostsScreen /></div>
        </div>
      </div>
    </Show>
  )
}
