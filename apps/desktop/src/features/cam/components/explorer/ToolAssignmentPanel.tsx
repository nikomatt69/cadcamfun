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
import { ToolScene } from "../../../../shared/ui/stageshow/scenes-workshop.tsx"

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
      class="border-t border-[color:var(--panel-border)] bg-[color:var(--panel-bg)]"
      data-testid="cam-tool-assignment"
    >
      <div class="p-3">
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-xs font-semibold text-[color:var(--panel-text)]">{t("cam.explorer.assignmentTitle")}</h4>
          <button type="button" onClick={props.onClose} title={t("cam.explorer.close")} aria-label={t("cam.explorer.close")} class="panel-icon-btn h-6 w-6">
            <X size={14} />
          </button>
        </div>

        <div class="space-y-3">
          <div class="rounded-[5px] border border-[color:var(--panel-border)] bg-[color:var(--panel-bg-subtle)] p-3">
            <div class="text-[11px] text-[color:var(--panel-text-muted)] mb-1">{t("cam.explorer.selectedElement")}</div>
            <div class="text-xs font-medium text-[color:var(--panel-text)]">{props.elementName || t("cam.explorer.unknownElement")}</div>
            <div class="text-[11px] text-[color:var(--panel-text-muted)]">{t("cam.explorer.elementType", { type: props.elementType || t("cam.explorer.unknown") })}</div>
          </div>

          <div>
            <div class="text-[11px] text-[color:var(--panel-text-muted)] mb-2">{t("cam.explorer.currentTool")}</div>
            <Show
              when={assigned()}
              fallback={
                <div class="rounded-[5px] border border-[color:var(--panel-border)] bg-[color:var(--panel-bg-subtle)] p-3">
                  <div class="text-xs text-[color:var(--panel-warn)]">{t("cam.explorer.noToolAssigned")}</div>
                  <div class="panel-scene panel-scene--empty"><ToolScene /></div>
                </div>
              }
            >
              {tool => (
                <div class="rounded-[5px] border border-[color:var(--panel-border)] bg-[color:var(--panel-bg-subtle)] p-3">
                  <div class="text-xs font-medium text-[color:var(--panel-text)]">{toolLabel(toolOf(props.elementId))}</div>
                  <div class="text-[11px] text-[color:var(--panel-text-muted)] mt-1">{t("cam.explorer.toolSummary", { type: toolTypeLabel(tool().type), diameter: tool().diameter })}</div>
                </div>
              )}
            </Show>
          </div>

          <div>
            <div class="text-[11px] text-[color:var(--panel-text-muted)] mb-2">{t("cam.explorer.availableTools")}</div>
            <div class="max-h-32 overflow-y-auto space-y-1">
              <For each={Object.entries(EXPLORER_TOOLS)}>
                {([toolId, tool]) => (
                  <button type="button"
                    onClick={() => assignTool(props.elementId, toolId)}
                    class={`w-full p-2 text-left rounded-[5px] border transition-colors ${toolOf(props.elementId) === toolId
                      ? "bg-[color:var(--panel-accent-soft)] border-[color:var(--panel-accent)] text-[color:var(--panel-accent)]"
                      : "bg-[color:var(--panel-bg)] border-[color:var(--panel-border)] hover:bg-[color:var(--panel-bg-subtle)] text-[color:var(--panel-text)]"}`}
                  >
                    <div class="text-xs font-medium">{toolLabel(toolId)}</div>
                    <div class="text-[11px] opacity-75">{toolTypeLabel(tool.type)} | ⌀{tool.diameter}{t("cad.millimeters")}</div>
                  </button>
                )}
              </For>
            </div>
          </div>

          <div class="flex gap-2 border-t border-[color:var(--panel-border)] pt-3">
            <button type="button"
              onClick={() => props.onGenerate(props.elementId)}
              disabled={!assigned()}
              class="panel-btn panel-btn--primary flex-1"
            >
              <Code size={14} />
              {t("cam.explorer.generateToolpath")}
            </button>
            <button type="button"
              onClick={() => clearTool(props.elementId)}
              title={t("cam.explorer.clearTool")}
              aria-label={t("cam.explorer.clearTool")}
              disabled={!assigned()}
              class="panel-btn flex-none px-2"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    </Motion.div>
  )
}
