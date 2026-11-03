/**
 * Saved toolpaths list (spec 06-desktop-ui.md §3 sidebar tab "Operations").
 *
 * Compact list: each row shows the toolpath name, the tool id and the number
 * of moves. Selecting a row is the only way to populate the right-hand preview
 * panel; the delete button stops the user losing data on accidental clicks.
 */
import { For, Show, type JSX } from "solid-js"
import { List, Trash2 } from "lucide-solid"
import { SidebarSection } from "../../../shared/components/panel/sidebar.tsx"
import { toast } from "../../../shared/ui/toast.tsx"
import { t } from "../../../i18n/index.ts"
import { OperationScene } from "../../../shared/ui/stageshow/scenes-workshop.tsx"

export interface OperationRow {
  readonly id: string
  readonly name: string
  readonly toolId: string
  readonly moves: number
  /** The tool's colour in the preview (`#rrggbb`). */
  readonly color?: string
}

export interface OperationsListProps {
  readonly toolpaths: ReadonlyArray<OperationRow>
  readonly selectedId: string | undefined
  readonly onSelect: (id: string | undefined) => void
  readonly onDelete: (id: string) => void
}

export default function OperationsList(props: OperationsListProps): JSX.Element {
  return (
    <SidebarSection id="cam-operations" title={t("cam.operations")} icon={List} summary={String(props.toolpaths.length)}>
        <Show
          when={props.toolpaths.length > 0}
          fallback={<div class="panel-scene panel-scene--empty"><OperationScene /></div>}
        >
          <div class="space-y-2" role="list" aria-label={t("cam.operations")}>
            <For each={props.toolpaths}>
              {(row) => (
                <div
                  class={`sidebar-choice ${props.selectedId === row.id ? "sidebar-choice--selected" : ""}`}
                  role="listitem"
                >
                  <button type="button" class="min-w-0 flex-1 rounded-sm text-left" aria-pressed={props.selectedId === row.id} onClick={() => props.onSelect(row.id)}>
                    <div class="text-xs font-medium truncate">{row.name}</div>
                    <div class="text-[11px] text-[color:var(--panel-text-muted)] truncate flex items-center gap-1.5">
                      <Show when={row.color}>{(color) => <span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ "background-color": color() }} aria-hidden="true" />}</Show>
                      <span class="truncate">{row.toolId} · {t("cam.downloads", { count: row.moves })}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    class="panel-icon-btn text-[color:var(--panel-bad)]"
                    title={t("cam.deleteToolpath")}
                    aria-label={`${t("cam.deleteToolpath")}: ${row.name}`}
                    onClick={(event: MouseEvent) => {
                      event.stopPropagation()
                      if (window.confirm(t("cam.confirmDelete"))) {
                        props.onDelete(row.id)
                        toast.success(t("cam.operationDeleted"))
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </SidebarSection>
  )
}
