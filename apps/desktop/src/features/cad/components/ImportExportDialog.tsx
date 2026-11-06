import { toast } from "../../../shared/ui/toast.tsx"
import { saveFile } from "../../../shared/lib/save-file.ts"
import { For, Show, createEffect, createSignal, onCleanup, type JSX } from "solid-js"
import { Upload } from "lucide-solid"
import { useApp } from "../../../shared/state/context.ts"
import { useElementsStore } from "../store/elementsStore.ts"
import type { CADCanvasApi } from "./CADCanvas.tsx"
import SaveCADAsProjectModal from "./SaveCADAsProjectModal.tsx"
import { WorkspaceExportDialog } from "../../../shared/components/workspace-save-dialog.tsx"
import { Modal } from "../../../shared/ui/modal.tsx"
import { t } from "../../../i18n/index.ts"
import { sceneToIges, sceneToStep } from "@cadcamfun/core"
import { readCadFile } from "../lib/cad-file-import.ts"
import { captureEditorOwner } from "../../ai/lib/editor-sync.ts"

interface Props {
  readonly isOpen: boolean
  onClose(): void
  readonly mode: "import" | "export"
  /** Lets STL / OBJ exports use the live scene. */
  readonly canvas?: CADCanvasApi | undefined
}

type ImportReport = { readonly path: string; readonly count: number; readonly warnings: ReadonlyArray<string>; readonly error?: string }

/** Export a drawing or add CAD files to it; also the entry to "Save as Project". */
export default function ImportExportDialog(props: Props): JSX.Element {
  const app = useApp()
  const elements = useElementsStore()
  const [fileName, setFileName] = createSignal("cad-drawing")
  const [fileFormat, setFileFormat] = createSignal("json")
  const [showProject, setShowProject] = createSignal(false)
  const [organizations, setOrganizations] = createSignal<ReadonlyArray<{ id: string; name: string }>>([])
  const [importBusy, setImportBusy] = createSignal(false)
  const [progress, setProgress] = createSignal({ current: 0, total: 0 })
  const [report, setReport] = createSignal<ReadonlyArray<ImportReport>>([])
  let importGeneration = 0
  createEffect(() => {
    if (props.isOpen && props.mode === "import") return
    importGeneration++
    setImportBusy(false)
    setReport([])
  })
  onCleanup(() => { importGeneration++ })

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
    else if (format === "glb" && props.canvas) await props.canvas.exportGLTF()
    else if (format === "iges") {
      // The same exact solids (and the same skips) the STEP export reports, written as IGES 5.3.
      const result = sceneToIges(elements.elements as ReadonlyArray<Record<string, unknown>>)
      if (result.iges === undefined) {
        alert(`${t("cad.io.nothingIges")}${result.skipped.length > 0 ? `\n\n${result.skipped.map((s) => `${s.name}: ${s.reason}`).join("\n")}` : ""}`)
        return
      }
      if (!await download(result.iges, "model/iges", `${fileName()}.iges`)) return
      const faceted = result.parts.filter((p) => !p.exact)
      if (faceted.length > 0 || result.skipped.length > 0) {
        alert([
          `IGES written: ${result.parts.length - faceted.length} exact solid(s), ${faceted.length} faceted.`,
          ...faceted.map((p) => `${p.name}: ${p.note ?? "faceted"}`),
          ...result.skipped.map((s) => `${s.name}: skipped, ${s.reason}`)
        ].join("\n"))
      }
    }
    else if (format === "step") {
      // A real ISO 10303-21 (AP214) file: exact solids from the kernel, faceted ones only where an element has no exact model.
      const result = sceneToStep(elements.elements as ReadonlyArray<Record<string, unknown>>, { author: "CAD/CAM FUN" })
      if (result.step === undefined) {
        alert(`${t("cad.io.nothingStep")}${result.skipped.length > 0 ? `\n\n${result.skipped.map((s) => `${s.name}: ${s.reason}`).join("\n")}` : ""}`)
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

  const importFiles = async (event: Event): Promise<void> => {
    const input = event.currentTarget as HTMLInputElement
    const files = Array.from(input.files ?? [])
    input.value = ""
    if (files.length === 0 || importBusy()) return
    const generation = ++importGeneration
    const owner = captureEditorOwner()
    setImportBusy(true)
    setReport([])
    setProgress({ current: 0, total: files.length })
    const results: ImportReport[] = []
    const decoded: Array<Record<string, unknown>> = []
    for (const [index, file] of files.entries()) {
      if (generation !== importGeneration || !props.isOpen || props.mode !== "import") return
      setProgress({ current: index + 1, total: files.length })
      const path = file.webkitRelativePath || file.name
      try {
        const imported = await readCadFile(file)
        if (generation !== importGeneration || !props.isOpen || props.mode !== "import") return
        decoded.push(...imported.elements)
        results.push({ path, count: imported.elements.length, warnings: imported.warnings })
      } catch (cause) {
        if (generation !== importGeneration || !props.isOpen || props.mode !== "import") return
        results.push({ path, count: 0, warnings: [], error: cause instanceof Error ? cause.message : String(cause) })
      }
    }
    if (generation !== importGeneration || !props.isOpen || props.mode !== "import") return
    if (!owner.current()) { setImportBusy(false); return }
    if (decoded.length > 0) {
      let reason: string | undefined
      try {
        const added = useElementsStore.getState().addElements(decoded)
        if (added.length !== decoded.length) reason = t("cad.importExport.importNoLayer")
      } catch (cause) { reason = cause instanceof Error ? cause.message : String(cause) }
      if (reason !== undefined) {
        for (let i = 0; i < results.length; i++) {
          const entry = results[i]!
          if (!entry.error) results[i] = { ...entry, count: 0, error: reason }
        }
      }
    }
    setReport(results)
    setImportBusy(false)
  }
  const closeImport = (): void => { if (!importBusy()) props.onClose() }
  const importedFiles = () => report().filter((entry) => !entry.error).length
  const importedElements = () => report().reduce((sum, entry) => sum + entry.count, 0)
  const failedFiles = () => report().filter((entry) => entry.error !== undefined).length

  return <Show when={props.isOpen}>
    <WorkspaceExportDialog open={props.mode === "export" && !showProject()} title={t("cad.io.exportDrawing")} name={fileName()} onName={setFileName}
      format={fileFormat()} onFormat={setFileFormat} formats={[
        { id: "json", label: t("cad.importExport.formatJson") }, { id: "stl", label: t("cad.importExport.formatStl") },
        { id: "obj", label: t("cad.importExport.formatObj") }, { id: "glb", label: t("cad.importExport.formatGlb") }, { id: "step", label: t("cad.importExport.formatStep") },
        { id: "iges", label: t("cad.importExport.formatIges") }, { id: "cad", label: t("cad.importExport.formatCad") }
      ]} projectBody={t("cad.importExport.saveAsProjectBody")} onProject={() => setShowProject(true)} onExport={exportFile} onClose={props.onClose} />
    <Modal open={props.mode === "import"} variant="workspace" title={t("cad.io.importDrawing")} onClose={closeImport} closable={!importBusy()}>
      <div class="space-y-4 px-6 py-4">
        <p class="text-sm font-medium text-[color:var(--ent-text)]">{t("cad.importExport.selectFiles")}</p>
        <div class="flex flex-col items-center gap-3 rounded-md border-2 border-dashed border-[color:var(--ent-line-strong)] bg-[color:var(--ent-surface-subtle)] p-6">
          <Upload class="h-8 w-8 text-[color:var(--ent-text-faint)]" aria-hidden="true" />
          <div class="flex flex-wrap justify-center gap-2">
            <label class="cursor-pointer rounded-md border border-[color:var(--ent-line-strong)] bg-[color:var(--ent-surface)] px-3 py-2 text-xs focus-within:outline focus-within:outline-2 focus-within:outline-[color:var(--ent-accent)]">
              {t("cad.importExport.chooseFiles")}
              <input data-testid="cad-import-files" aria-label={t("cad.importExport.chooseFiles")} type="file" multiple accept=".json,.cad,.cadcam,.dxf,.svg,.stl,.obj,.ply,.3mf,.glb,.step,.stp,.iges,.igs" class="sr-only" disabled={importBusy()} onChange={(event) => void importFiles(event)} />
            </label>
            <label class="cursor-pointer rounded-md border border-[color:var(--ent-line-strong)] bg-[color:var(--ent-surface)] px-3 py-2 text-xs focus-within:outline focus-within:outline-2 focus-within:outline-[color:var(--ent-accent)]">
              {t("cad.importExport.chooseFolder")}
              <input data-testid="cad-import-folder" aria-label={t("cad.importExport.chooseFolder")} type="file" multiple ref={(node) => { node.setAttribute("webkitdirectory", ""); node.setAttribute("directory", "") }} class="sr-only" disabled={importBusy()} onChange={(event) => void importFiles(event)} />
            </label>
          </div>
          <p class="text-xs text-[color:var(--ent-text-muted)]">{t("cad.importExport.formats")}</p>
        </div>
        <p class="text-xs text-[color:var(--ent-text-muted)]">{t("cad.importExport.importAdditive")}</p>
        <Show when={importBusy()}><p data-testid="cad-import-progress" role="status" class="text-sm text-[color:var(--ent-text)]">{t("cad.importExport.importing", progress())}</p></Show>
        <Show when={report().length > 0}>
          <div data-testid="cad-import-report" role="status" class="space-y-2 rounded-md border border-[color:var(--ent-line)] bg-[color:var(--ent-surface-subtle)] p-3 text-xs">
            <p class="font-semibold">{t("cad.importExport.importSummary", { files: importedFiles(), elements: importedElements(), failed: failedFiles() })}</p>
            <ul class="max-h-48 space-y-2 overflow-y-auto">
              <For each={report()}>{(entry) => <li class="break-words">
                <span class="font-medium">{entry.path}</span>{" — "}
                <Show when={entry.error} fallback={t("cad.importExport.importSuccess", { count: entry.count })}>{(error) => <span class="text-[color:var(--ent-warn)]">{t("cad.importExport.importFailed")}: {error()}</span>}</Show>
                <Show when={entry.warnings.length > 0}><div>{t("cad.importExport.importWarnings")}: {entry.warnings.join("; ")}</div></Show>
              </li>}</For>
            </ul>
          </div>
        </Show>
      </div>
      <div class="flex justify-end rounded-b-lg border-t border-[color:var(--ent-line)] bg-[color:var(--ent-surface-subtle)] px-6 py-4"><button type="button" class="h-8 rounded-md border border-[color:var(--ent-line-strong)] bg-[color:var(--ent-surface)] px-4 text-xs disabled:opacity-50" disabled={importBusy()} onClick={closeImport}>{report().length > 0 ? t("cad.importExport.importDone") : t("common.cancel")}</button></div>
    </Modal>
    <SaveCADAsProjectModal isOpen={showProject()} onClose={() => setShowProject(false)} organizations={organizations()} />
  </Show>
}
