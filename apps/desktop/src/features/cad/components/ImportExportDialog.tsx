import { Show, createEffect, createSignal, type JSX } from "solid-js"
import { FolderPlus, Save, Upload, X } from "lucide-solid"
import { useApp } from "../../../shared/state/context.ts"
import { useElementsStore } from "../store/elementsStore.ts"
import type { CADCanvasApi } from "./CADCanvas.tsx"
import SaveCADAsProjectModal from "./SaveCADAsProjectModal.tsx"
import { t } from "../../../i18n/index.ts"
import { sceneToStep, stepToElements } from "@cadcamfun/core"

interface Props {
  readonly isOpen: boolean
  onClose(): void
  readonly mode: "import" | "export"
  /** Lets STL / OBJ exports use the live scene. */
  readonly canvas?: CADCanvasApi | undefined
}

const FIELD = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400"
const LABEL = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"

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
    app.runtime.run(app.client.organizations.list()).then(
      (list) => setOrganizations(list.map((org) => ({ id: org.id, name: org.name }))),
      (cause) => console.error("Failed to fetch organizations:", cause)
    )
  })

  const download = (body: string, type: string, name: string) => {
    const url = URL.createObjectURL(new Blob([body], { type }))
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = name
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  const exportFile = () => {
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
      download(result.step, "application/step", `${fileName()}.step`)
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
      download(JSON.stringify(data, null, 2), "application/json", `${fileName()}.${format}`)
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

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 bg-gray-600/50 dark:bg-black/60 flex items-center justify-center z-50">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full border border-gray-200 dark:border-gray-700">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">{props.mode === "export" ? "Export Drawing" : "Import Drawing"}</h3>
            <button onClick={props.onClose} class="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 transition-colors" aria-label="Close"><X size={20} /></button>
          </div>

          <div class="px-6 py-4">
            <Show when={props.mode === "export"} fallback={
              <>
                <div class="mb-4">
                  <label class={LABEL}>{t("cad.importExport.selectFile")}</label>
                  <div class="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-md bg-gray-50 dark:bg-gray-700/50">
                    <div class="space-y-1 text-center">
                      <Upload class="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
                      <div class="flex text-sm text-gray-600 dark:text-gray-400">
                        <label for="file-upload" class="relative cursor-pointer bg-white dark:bg-gray-700 rounded-md font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500 dark:focus-within:ring-blue-400 dark:ring-offset-gray-800 transition-colors">
                          <span>{t("cad.importExport.upload")}</span>
                          <input id="file-upload" name="file-upload" type="file" accept=".json,.cad,.stl,.obj,.step,.stp" class="sr-only" onChange={importFile} />
                        </label>
                        <p class="pl-1">{t("cad.importExport.orDrag")}</p>
                      </div>
                      <p class="text-xs text-gray-500 dark:text-gray-400">{t("cad.importExport.formats")}</p>
                    </div>
                  </div>
                </div>
                <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/50 rounded-md p-4">
                  <div class="flex">
                    <div class="flex-shrink-0">
                      <svg class="h-5 w-5 text-yellow-400 dark:text-yellow-300" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                      </svg>
                    </div>
                    <div class="ml-3">
                      <h3 class="text-sm font-medium text-yellow-800 dark:text-yellow-200">{t("cad.importExport.attention")}</h3>
                      <div class="mt-2 text-sm text-yellow-700 dark:text-yellow-300"><p>{t("cad.importExport.importWarning")}</p></div>
                    </div>
                  </div>
                </div>
              </>
            }>
              <div class="mb-4">
                <label for="fileName" class={LABEL}>{t("cad.importExport.fileName")}</label>
                <input type="text" id="fileName" value={fileName()} onInput={(e) => setFileName(e.currentTarget.value)} class={FIELD} />
              </div>
              <div class="mb-4">
                <label for="fileFormat" class={LABEL}>{t("cad.importExport.fileFormat")}</label>
                <select id="fileFormat" value={fileFormat()} onChange={(e) => setFileFormat(e.currentTarget.value)} class={FIELD}>
                  <option value="json">{t("cad.importExport.formatJson")}</option>
                  <option value="stl">{t("cad.importExport.formatStl")}</option>
                  <option value="obj">{t("cad.importExport.formatObj")}</option>
                  <option value="step">{t("cad.importExport.formatStep")}</option>
                  <option value="cad">{t("cad.importExport.formatCad")}</option>
                </select>
              </div>
              <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-md p-4 flex items-start mb-4">
                <div class="flex-shrink-0"><FolderPlus class="h-5 w-5 text-blue-400 dark:text-blue-300" /></div>
                <div class="ml-3">
                  <h3 class="text-sm font-medium text-blue-800 dark:text-blue-200">{t("cad.importExport.saveAsProject")}</h3>
                  <div class="mt-2 text-sm text-blue-700 dark:text-blue-300">
                    <p>{t("cad.importExport.saveAsProjectBody")}</p>
                    <button type="button" onClick={() => setShowProject(true)} class="mt-1 text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors">{t("cad.importExport.saveAsProject")}</button>
                  </div>
                </div>
              </div>
            </Show>
          </div>

          <div class="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-600 flex justify-end space-x-3 rounded-b-lg">
            <button type="button" class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors" onClick={props.onClose}>{t("common.cancel")}</button>
            <Show when={props.mode === "export"}>
              <button type="button" onClick={exportFile} class="px-4 py-2 bg-blue-600 dark:bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors">
                <span class="flex items-center"><Save size={18} class="mr-1.5" />{t("cad.importExport.exportFile")}</span>
              </button>
            </Show>
          </div>
        </div>
      </div>
      <SaveCADAsProjectModal isOpen={showProject()} onClose={() => setShowProject(false)} organizations={organizations()} />
    </Show>
  )
}
