/**
 * Saved toolpaths list (spec 06-desktop-ui.md §3 sidebar tab "Operations").
 *
 * Compact list: each row shows the toolpath name, the tool id and the number
 * of moves. Selecting a row is the only way to populate the right-hand preview
 * panel; the delete button stops the user losing data on accidental clicks.
 */
import { For, Show, type JSX } from "solid-js"
import { Motion } from "solid-motionone"
import { Trash2 } from "lucide-solid"
import { Card } from "../../../shared/ui/card.tsx"
import { toast } from "../../../shared/ui/toast.tsx"
import { t } from "../../../i18n/index.ts"

const rise = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } }
const hover = { scale: 1.02, backgroundColor: "rgba(59, 130, 246, 0.1)" }
const press = { scale: 0.98 }

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
    <Motion.div class="w-full" {...rise} transition={{ duration: 0.4 }}>
      <Card variant="default" delay={0.05} class="w-full p-4">
        <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">{t("cam.operations")}</h3>
        <Show
          when={props.toolpaths.length > 0}
          fallback={<p class="text-xs text-gray-500 dark:text-gray-400">{t("cam.emptyOperations")}</p>}
        >
          <div class="space-y-2" role="listbox" aria-label={t("cam.operations")}>
            <For each={props.toolpaths}>
              {(row) => (
                <Motion.div
                  class={`flex items-center justify-between px-3 py-2 rounded-xl border cursor-pointer transition-all duration-200 ${
                    props.selectedId === row.id
                      ? "bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700"
                      : "bg-white/60 dark:bg-gray-800/60 border-white/40 dark:border-gray-600/40 hover:bg-white/80 dark:hover:bg-gray-700/80"
                  }`}
                  role="option"
                  aria-selected={props.selectedId === row.id}
                  tabIndex={0}
                  onClick={() => props.onSelect(row.id)}
                  onKeyDown={(event: KeyboardEvent) => {
                    if (event.target !== event.currentTarget) return
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      props.onSelect(row.id)
                    }
                  }}
                  hover={hover}
                  press={press}
                >
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium truncate">{row.name}</div>
                    <div class="text-xs text-gray-500 dark:text-gray-400 truncate flex items-center gap-1.5">
                      <Show when={row.color}>{(color) => <span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ "background-color": color() }} aria-hidden="true" />}</Show>
                      <span class="truncate">{row.toolId} · {t("cam.downloads", { count: row.moves })}</span>
                    </div>
                  </div>
                  <Motion.button
                    class="ml-2 p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400"
                    title={t("cam.deleteToolpath")}
                    aria-label={t("cam.deleteToolpath")}
                    hover={{ scale: 1.1 }}
                    press={{ scale: 0.92 }}
                    onClick={(event: MouseEvent) => {
                      event.stopPropagation()
                      if (window.confirm(t("cam.confirmDelete"))) {
                        props.onDelete(row.id)
                        toast.success(t("cam.operationDeleted"))
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </Motion.button>
                </Motion.div>
              )}
            </For>
          </div>
        </Show>
      </Card>
    </Motion.div>
  )
}