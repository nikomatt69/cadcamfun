/**
 * Pieces shared by the toolpaths list and the toolpath detail page: the modal shell (same markup as the project
 * page's modals), the legacy display labels, and the CAM hand-off.
 */
import { type JSX } from "solid-js"
import type { ToolpathRow } from "@cadcamfun/api"
import { Modal as UiModal } from "../components/ui/modal.tsx"

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
  return (
    <UiModal open={props.open} title={props.title} onClose={props.onClose} size={props.wide === true ? "lg" : "md"}>
      <div class="space-y-3">{props.children}</div>
    </UiModal>
  )
}

/** Hands a toolpath to the CAM page: the program goes through local storage, the page reads `?loadToolpath=`. */
export function handOffToCam(row: Pick<ToolpathRow, "id" | "name" | "data" | "gcode">, navigate: (to: string) => void): void {
  try {
    localStorage.setItem("toolpathToLoadInCAM", JSON.stringify({ id: row.id, name: row.name, data: row.data, gcode: row.gcode }))
  } catch { /* storage blocked: CAM opens without the program */ }
  navigate(`/cam?loadToolpath=${row.id}`)
}
