import { toast } from "../../../shared/ui/toast.tsx"
import { saveFile } from "../../../shared/lib/save-file.ts"
import { Show, createEffect, createSignal, onCleanup, type JSX } from "solid-js"
import { Upload } from "lucide-solid"
import { useApp } from "../../../shared/state/context.ts"
import { useElementsStore } from "../store/elementsStore.ts"
import type { CADCanvasApi } from "./CADCanvas.tsx"
import SaveCADAsProjectModal from "./SaveCADAsProjectModal.tsx"
import { WorkspaceExportDialog, SAVE_FIELD } from "../../../shared/components/workspace-save-dialog.tsx"
import { Modal } from "../../../shared/ui/modal.tsx"
import { t } from "../../../i18n/index.ts"
import { sceneToStep, stepToElements } from "@cadcamfun/core"

interface Props {
  readonly isOpen: boolean
  onClose(): void
  readonly mode: "import" | "export"
  /** Lets STL / OBJ exports use the live scene. */
  readonly canvas?: CADCanvasApi | undefined
}

/** Export the drawing (JSON, STL, OBJ, ...) or import a JSON drawing; also the entry to "Save as Project". */
export default function ImportExportDialog(props: Props): JSX.Element {
  const app = useApp()
  const elements = useElementsStore()
  const [fileName, setFileName] = createSignal("cad-drawing")
  const [fileFormat, setFileFormat] = createSignal("json")
  const [showProject, setShowProject] = createSignal(false)
  const [organizations, setOrganizations] = createSignal<ReadonlyArray<{ id: string; name: string }>>([])

  createEffect(() => {
    if (!props.isOpen || props.mode !== "export") return
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    app.runtime.run(app.client.organizations.list(), { signal: controller.signal }).then(
      (list) => { if (!controller.signal.aborted) setOrganizations(list.map((org) => ({ id: org.id, name: org.name }))) },
      (cause) => console.error("Failed to fetch organizations:", cause)
    )
  })

  const download = async (body: string, type: string, name: string): Promise<boolean> => {
    try { return await saveFile({ name, data: body, mime: type }) }
    catch (cause) { toast.error(t("shell.export.failed", { name, reason: cause instanceof Error ? cause.message : String(cause) })); return false }
  }

  const exportFile = async () => {
    const format = fileFormat()
    if (format === "stl" && props.canvas) props.canvas.exportSTL()
    else if (format === "obj" && props.canvas) props.canvas.exportOBJ()
    else if (format === "step") {
      // A real ISO 10303-21 (AP214) file: exact solids from the kernel, faceted ones only where an element has no exact model.
      const result = sceneToStep(elements.elements as ReadonlyArray<Record<string, unknown>>, { author: "CAD/CAM FUN" })
      if (result.step === undefined) {
        alert(`Nothing to write as STEP: no solid in the drawing.${result.skipped.length > 0 ? `\n\n${result.skipped.map((s) => `${s.name}: ${s.reason}`).join("\n")}` : ""}`)
        return
      }
      if (!await download(result.step, "application/step", `${fileName()}.step`)) return
      const faceted = result.parts.filter((p) => !p.exact)
      if (faceted.length > 0 || result.skipped.length > 0) {
        alert([
          `STEP written: ${result.parts.length - faceted.length} exact solid(s), ${faceted.length} faceted.`,
          ...faceted.map((p) => `${p.name}: ${p.note ?? "faceted"}`),
          ...result.skipped.map((s) => `${s.name}: skipped, ${s.reason}`)
        ].join("\n"))
      }
    } else {
      const data = { elements: elements.elements, selectedElementId: elements.selectedElement?.id, metadata: { created: new Date().toISOString(), version: "1.0", application: "CAD/CAM FUN" } }
      if (!await download(JSON.stringify(data, null, 2), "application/json", `${fileName()}.${format}`)) return
    }
    props.onClose()
  }

  const importFile = (event: Event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0]
    if (!file) return
    const reader = new FileReader()
    const isStep = /\.(step|stp)$/i.test(file.name)
    reader.onload = (loaded) => {
      if (isStep) {
        // Exact import: every solid of the file (assembly placements and units included) as a `brep` element.
        try {
          const imported = stepToElements(String(loaded.target?.result))
          if (imported.elements.length === 0) {
            alert(`No solid found in ${file.name}.${imported.warnings.length > 0 ? `\n\n${imported.warnings.slice(0, 8).join("\n")}` : ""}`)
            return
          }
          useElementsStore.getState().addElements(imported.elements.map((e) => ({ ...e })))
          const invalid = imported.report.filter((r) => !r.valid)
          if (imported.warnings.length > 0 || invalid.length > 0) {
            alert([
              `Imported ${imported.elements.length} solid(s) from ${file.name}.`,
              ...invalid.map((r) => `${r.name}: ${r.issues.join("; ")}`),
              ...imported.warnings.slice(0, 8)
            ].join("\n"))
          }
          props.onClose()
        } catch (cause) {
          console.error("Error reading STEP file:", cause)
          alert(`Failed to read ${file.name} as STEP: ${cause instanceof Error ? cause.message : String(cause)}`)
        }
        return
      }
      try {
        const json = JSON.parse(String(loaded.target?.result))
        if (json.elements && Array.isArray(json.elements)) {
          useElementsStore.getState().addElements(json.elements)
          if (json.selectedElementId) useElementsStore.getState().selectElement(json.selectedElementId)
          props.onClose()
        } else alert("Invalid file format. Could not find elements array.")
      } catch (cause) {
        console.error("Error parsing file:", cause)
        alert("Failed to parse file. Make sure it is a valid JSON file.")
      }
    }
    reader.readAsText(file)
  }

  return <Show when={props.isOpen}>
    <WorkspaceExportDialog open={props.mode === "export" && !showProject()} title="Export Drawing" name={fileName()} onName={setFileName}
      format={fileFormat()} onFormat={setFileFormat} formats={[
        { id: "json", label: t("cad.importExport.formatJson") }, { id: "stl", label: t("cad.importExport.formatStl") },
        { id: "obj", label: t("cad.importExport.formatObj") }, { id: "step", label: t("cad.importExport.formatStep") }, { id: "cad", label: t("cad.importExport.formatCad") }
      ]} projectBody={t("cad.importExport.saveAsProjectBody")} onProject={() => setShowProject(true)} onExport={exportFile} onClose={props.onClose} />
    <Modal open={props.mode === "import"} variant="workspace" title="Import Drawing" onClose={props.onClose}>
      <div class="px-6 py-4">
        <label for="file-upload" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("cad.importExport.selectFile")}</label>
        <div class="mb-4 flex flex-col items-center gap-3 rounded-md border-2 border-dashed border-gray-300 bg-gray-50 p-6 dark:border-gray-600 dark:bg-gray-700/50">
          <Upload class="h-12 w-12 text-gray-400" /><label for="file-upload" class="cursor-pointer text-blue-600 dark:text-blue-400">{t("cad.importExport.upload")}</label>
          <input id="file-upload" name="file-upload" type="file" accept=".json,.cad,.stl,.obj,.step,.stp" class={SAVE_FIELD} onChange={importFile} />
          <p class="text-xs text-gray-500 dark:text-gray-400">{t("cad.importExport.formats")}</p>
        </div>
        <p class="rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-800/50 dark:bg-yellow-900/20 dark:text-yellow-200">{t("cad.importExport.importWarning")}</p>
      </div>
      <div class="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-600 flex justify-end rounded-b-lg"><button type="button" class="px-4 py-2 rounded-md text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600" onClick={props.onClose}>{t("common.cancel")}</button></div>
    </Modal>
    <SaveCADAsProjectModal isOpen={showProject()} onClose={() => setShowProject(false)} organizations={organizations()} />
  </Show>
}
