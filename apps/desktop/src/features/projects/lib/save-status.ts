import { t } from "../../../i18n/index.ts"
import type { SaveSummary } from "./project-session.ts"

export type SaveTone = "green" | "amber" | "blue" | "red" | "muted"

/** The status line's wording for a save summary: text, tone and tooltip; undefined when there is nothing to report. */
export const describeSave = (summary: SaveSummary, formatTime: (time: number) => string = defaultTime): { readonly text: string; readonly tone: SaveTone; readonly title: string; readonly saveable: boolean } | undefined => {
  if (!summary.active) return undefined
  switch (summary.state) {
    case "saving": return { text: t("save.status.saving"), tone: "blue", title: t("save.status.saving"), saveable: false }
    case "error": return { text: t("save.status.error"), tone: "red", title: summary.error ?? t("save.status.error"), saveable: true }
    case "dirty":
      return summary.scratch
        ? { text: t("save.status.scratch"), tone: "amber", title: t("settings.autosave.hint"), saveable: false }
        : { text: t("save.status.dirty"), tone: "amber", title: t("save.status.hint"), saveable: true }
    default:
      return { text: summary.savedAt === undefined ? t("save.status.savedNow") : t("save.status.saved", { time: formatTime(summary.savedAt) }), tone: "green", title: t("save.status.label"), saveable: false }
  }
}

const defaultTime = (time: number): string => new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
