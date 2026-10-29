/**
 * The explorer's bottom "Tool Assignment" panel (legacy `CAMElementExplorer`, shown for a single selected element):
 * the element, its current tool, the tool list, and "Generate Toolpath" for it.
 */
import { For, Show, type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import { Code, X } from "lucide-solid"
import { EXPLORER_TOOLS, toolLabel, toolTypeLabel } from "../../lib/explorer.ts"
import { t } from "../../../../i18n/index.ts"
import { assignTool, clearTool, toolOf } from "./assignments.ts"

export interface ToolAssignmentPanelProps {
  readonly elementId: string
  readonly elementName: string
  readonly elementType: string
  readonly onClose: () => void
  readonly onGenerate: (elementId: string) => void
}

export default function ToolAssignmentPanel(props: ToolAssignmentPanelProps): JSX.Element {
  const assigned = () => EXPLORER_TOOLS[toolOf(props.elementId)]
  return (
    <Motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      class="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
      data-testid="cam-tool-assignment"
    >
      <div class="p-3">
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-sm font-semibold text-gray-900 dark:text-gray-100">{t("cam.explorer.assignmentTitle")}</h4>
          <button onClick={props.onClose} title={t("cam.explorer.close")} aria-label={t("cam.explorer.close")} class="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
            <X size={14} />
          </button>
        </div>

        <div class="space-y-3">
          <div class="p-2 bg-gray-50 dark:bg-gray-700 rounded-md">
            <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">{t("cam.explorer.selectedElement")}</div>
            <div class="font-medium text-gray-900 dark:text-gray-100">{props.elementName || t("cam.explorer.unknownElement")}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">{t("cam.explorer.elementType", { type: props.elementType || t("cam.explorer.unknown") })}</div>
          </div>

          <div>
            <div class="text-xs text-gray-600 dark:text-gray-400 mb-2">{t("cam.explorer.currentTool")}</div>
            <Show
              when={assigned()}
              fallback={
                <div class="p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                  <div class="text-yellow-700 dark:text-yellow-300 text-sm">{t("cam.explorer.noToolAssigned")}</div>
                </div>
              }
            >
              {tool => (
                <div class="p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                  <div class="font-medium text-green-700 dark:text-green-300">{toolLabel(toolOf(props.elementId))}</div>
                  <div class="text-xs text-green-600 dark:text-green-400 mt-1">{t("cam.explorer.toolSummary", { type: toolTypeLabel(tool().type), diameter: tool().diameter })}</div>
                </div>
              )}
            </Show>
          </div>

          <div>
            <div class="text-xs text-gray-600 dark:text-gray-400 mb-2">{t("cam.explorer.availableTools")}</div>
            <div class="max-h-32 overflow-y-auto space-y-1">
              <For each={Object.entries(EXPLORER_TOOLS)}>
                {([toolId, tool]) => (
                  <button
                    onClick={() => assignTool(props.elementId, toolId)}
                    class={`w-full p-2 text-left rounded-md border transition-colors ${toolOf(props.elementId) === toolId
                      ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
                      : "bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"}`}
                  >
                    <div class="font-medium text-sm">{toolLabel(toolId)}</div>
                    <div class="text-xs opacity-75">{toolTypeLabel(tool.type)} | ⌀{tool.diameter}{t("cad.millimeters")}</div>
                  </button>
                )}
              </For>
            </div>
          </div>

          <div class="flex space-x-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => props.onGenerate(props.elementId)}
              disabled={!assigned()}
              class="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium transition-colors"
            >
              <Code size={14} class="inline mr-1" />
              {t("cam.explorer.generateToolpath")}
            </button>
            <button
              onClick={() => clearTool(props.elementId)}
              title={t("cam.explorer.clearTool")}
              aria-label={t("cam.explorer.clearTool")}
              disabled={!assigned()}
              class="px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md text-sm transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    </Motion.div>
  )
}
