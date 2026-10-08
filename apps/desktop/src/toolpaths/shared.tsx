/**
 * Pieces shared by the toolpaths list and the toolpath detail page: the modal shell (same markup as the project
 * page's modals), the legacy display labels, and the CAM hand-off.
 */
import { Show, createEffect, onCleanup, type JSX } from "solid-js"
import { X } from "lucide-solid"
import type { ToolpathRow } from "@cadcamfun/api"

export type { ToolpathRow }

export const TYPE_LABEL: Readonly<Record<string, string>> = { mill: "Mill", lathe: "Lathe", "3dprinter": "3D Printer" }

export const OPERATION_LABEL: Readonly<Record<string, string>> = {
  contour: "Contour", pocket: "Pocket", drill: "Drill", engrave: "Engrave", profile: "3D Profile", threading: "Threading",
  turning: "Turning", facing: "Facing", boring: "Boring", grooving: "Grooving", parting: "Parting",
  standard: "Standard Print", vase: "Vase Mode", support: "Support", infill: "Infill", raft: "Raft", brim: "Brim"
}

/** Operations offered for each machine type (legacy form: the list follows the machine type). */
export const OPERATIONS_BY_TYPE: Readonly<Record<string, ReadonlyArray<string>>> = {
  mill: ["contour", "pocket", "drill", "engrave", "profile", "threading"],
  lathe: ["turning", "facing", "boring", "threading", "grooving", "parting"],
  "3dprinter": ["standard", "vase", "support", "infill", "raft", "brim"]
}

export const formatDate = (iso: string | undefined): string => (iso === undefined || iso === "" ? "" : new Date(iso).toLocaleDateString())

/** Modal in the app's markup: a scrim, a card with a title and a close button; Escape and the scrim close it. */
export function Modal(props: { readonly open: boolean; readonly title: string; readonly onClose: () => void; readonly wide?: boolean; readonly children: JSX.Element }): JSX.Element {
  createEffect(() => {
    if (!props.open) return
    const onKey = (event: KeyboardEvent): void => { if (event.key === "Escape") props.onClose() }
    window.addEventListener("keydown", onKey)
    onCleanup(() => window.removeEventListener("keydown", onKey))
  })
  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-gray-600/50 dark:bg-black/60" onClick={() => props.onClose()}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={props.title}
          class={`w-full ${props.wide === true ? "max-w-2xl" : "max-w-md"} rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800`}
          onClick={(event) => event.stopPropagation()}
        >
          <div class="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">{props.title}</h3>
            <button type="button" class="text-gray-400 transition-colors duration-150 hover:text-gray-500" aria-label="Close" onClick={() => props.onClose()}><X size={20} aria-hidden="true" /></button>
          </div>
          <div class="space-y-3 px-6 py-4">{props.children}</div>
        </div>
      </div>
    </Show>
  )
}

/** Hands a toolpath to the CAM page: the program goes through local storage, the page reads `?loadToolpath=`. */
export function handOffToCam(row: Pick<ToolpathRow, "id" | "name" | "data" | "gcode">, navigate: (to: string) => void): void {
  try {
    localStorage.setItem("toolpathToLoadInCAM", JSON.stringify({ id: row.id, name: row.name, data: row.data, gcode: row.gcode }))
  } catch { /* storage blocked: CAM opens without the program */ }
  navigate(`/cam?loadToolpath=${row.id}`)
}
