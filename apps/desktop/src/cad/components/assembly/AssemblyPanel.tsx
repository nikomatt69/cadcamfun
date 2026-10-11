/**
 * The assembly workspace of the CAD editor: the node tree, the joints between nodes and the
 * constraints that pin relationships (legacy `components/cad/assembly/`).
 *
 * All three panels read the same store, so the node picked in the tree is the node the joint and
 * constraint forms offer; the underlying `AssemblyManager`/`JointSystem` (including undo/redo)
 * stay as they were.
 */
import type { JSX } from "solid-js"
import { t } from "../../../i18n/index.ts"
import AssemblyBrowser from "./AssemblyBrowser.tsx"
import AssemblyConstraints from "./AssemblyConstraints.tsx"
import JointCreator from "./JointCreator.tsx"
import { useAssemblyStore } from "../../store/assemblyStore.ts"

export default function AssemblyPanel(): JSX.Element {
  const store = useAssemblyStore()

  return (
    <div class="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">{t("cad.assembly.title")}</h2>
        <div class="flex items-center gap-1">
          <button type="button" class="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700" onClick={() => store.undo()}>
            {t("cad.assembly.undo")}
          </button>
          <button type="button" class="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700" onClick={() => store.redo()}>
            {t("cad.assembly.redo")}
          </button>
          <label class="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300 ml-2">
            <input type="checkbox" class="rounded border-gray-300 dark:border-gray-600 text-blue-600" checked={store.showJoints} onChange={(event) => store.setJointsVisibility(event.currentTarget.checked)} />
            {t("cad.assembly.showJoints")}
          </label>
        </div>
      </div>

      <AssemblyBrowser />
      <JointCreator />
      <AssemblyConstraints />
    </div>
  )
}
