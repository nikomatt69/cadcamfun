import { cam } from "@cadcamfun/core"
import { t } from "../../../i18n/index.ts"

type Status = ReturnType<typeof cam.kernel.programStatus>

/** The sentence for a model change (spec 59 A2), or nothing when the model is the same. */
export const modelChangeText = (change: Status): string | undefined => {
  if (change.status !== "stale") return undefined
  const count = change.added.length + change.removed.length + change.changed.length
  const round = (n: number): string => String(Math.round(n * 1000) / 1000)
  switch (change.class) {
    case "geometry": return t("cam.kernel.model.geometry", { count })
    case "topology": return t("cam.kernel.model.topology", { count })
    case "rigid": return t("cam.kernel.model.rigid", { x: round(change.move?.x ?? 0), y: round(change.move?.y ?? 0), z: round(change.move?.z ?? 0) })
    case "inputs": return t("cam.kernel.model.inputs", { settings: change.inputs.join(", ") })
  }
}

/** A stored program against the drawing it belongs to: what to say and how serious it is (`unknown` is never shown as current). */
export const programStatusText = (status: Status): { readonly tone: "ok" | "warn" | "muted"; readonly text: string; readonly detail?: string } => {
  if (status.status === "current") return { tone: "ok", text: t("cam.kernel.model.current") }
  if (status.status === "unknown") return { tone: "muted", text: t("cam.kernel.model.unknown"), detail: status.reason }
  return { tone: "warn", text: modelChangeText(status) ?? "", detail: status.reasons.join("; ") }
}
