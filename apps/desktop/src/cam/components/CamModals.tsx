/**
 * The two dialogs the CAM toolbar opens: the Unified Library (the CAD dialog frame around the Library Manager)
 * and the production costs manager.
 */
import { Show, type JSX } from "solid-js"
import { X } from "lucide-solid"
import { CostsScreen } from "../../screens/costs.tsx"
import UnifiedLibraryModal from "../../cad/components/UnifiedLibraryModal.tsx"
import { toast } from "../../components/ui/toast.tsx"
import LibraryManager from "../library/LibraryManager.tsx"
import type { MaterialLibraryItem, ToolLibraryItem } from "../library/useUnifiedLibrary.ts"
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
    toast.success(`Tool '${tool.name}' selected`)
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
  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 z-50 dark:bg flex items-center justify-center bg-black bg-opacity-75 p-4" role="dialog" aria-label="Production Costs Manager">
        <div class="w-full max-w-7xl max-h-[70vh] flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-xl">
          <div class="p-4 border-b dark:border-gray-700 flex justify-between items-center">
            <h2 class="text-xl dark:text-blue-400 font-bold ">Production Costs Manager</h2>
            <button type="button" onClick={() => props.onClose()} class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Close"><X size={20} class="dark:text-gray-300" /></button>
          </div>
          <div class="flex-1 rounded-xl overflow-y-auto"><CostsScreen /></div>
        </div>
      </div>
    </Show>
  )
}
