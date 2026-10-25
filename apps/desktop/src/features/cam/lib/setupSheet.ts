import { downloadFile } from "../../../shared/lib/save-file.ts"
import { cam } from "@cadcamfun/core"
import type { CamKernelArtifact } from "@cadcamfun/api"
import { currentTitleBlock } from "../../cad/lib/document-setup.ts"

/** The setup sheet page of a kernel program as a file, or why there is none (a printer program has a print report instead). */
export const setupSheetFile = (artifact: CamKernelArtifact, title: string): { readonly file: string; readonly html: string } | { readonly reason: string } => {
  const data = cam.kernel.setupSheetData(artifact, { title, titleBlock: currentTitleBlock() })
  if (typeof data === "string") return { reason: data }
  const safe = title.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "program"
  return { file: `${safe}-setup-sheet.html`, html: cam.kernel.setupSheetHtml(data) }
}

/** Hands a text file to the browser (or the Tauri webview) as a download. */
export const downloadText = (file: string, text: string, type: string): void => {
  downloadFile({ name: file, data: text, mime: type })
}
