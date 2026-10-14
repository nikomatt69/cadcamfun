import { For, Show, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { A } from "@solidjs/router"
import { useApp } from "../../../shared/state/context.ts"
import { WorkspaceExportDialog, WorkspaceProjectDialog, SAVE_FIELD } from "../../../shared/components/workspace-save-dialog.tsx"
import { toast } from "../../../shared/ui/toast.tsx"
import { invalidatePrefix } from "../../../shared/state/query-cache.ts"
import { t } from "../../../i18n/index.ts"
import { captureEditorOwner } from "../../ai/lib/editor-sync.ts"
import { useDocumentStore } from "../../cad/store/documentStore.ts"
import { combineOperationResults, useCamStore } from "../store/camStore.ts"
import { downloadCamFile, savedProgramData, snapshotCamProgram, SavedCamProgram } from "../lib/saved-program.ts"
import { Schema } from "effect"
import { useElementsStore } from "../../cad/store/elementsStore.ts"
import { useCADStore } from "../../cad/store/cadStore.ts"

const FIELD = SAVE_FIELD

/** One save surface for the toolbar, ribbon and generator, backed by the existing project/library API. */
export default function SaveCamModal(props: { readonly code: string; readonly extension: string; readonly projectOnly?: boolean; readonly onClose: () => void }): JSX.Element {
  const app = useApp(), store = useCamStore()
  const saved = store.savedProgram
  const owner = captureEditorOwner()
  const [name, setName] = createSignal(saved?.name ?? `toolpath-${new Date().toISOString().slice(0, 10)}`)
  const [mode, setMode] = createSignal<"existing" | "new" | "update">(saved ? "update" : owner.projectId ? "existing" : "new")
  const [projectId, setProjectId] = createSignal(owner.projectId ?? "")
  const [projectName, setProjectName] = createSignal(useDocumentStore.getState().name ?? "")
  const [showProject, setShowProject] = createSignal(props.projectOnly ?? false)
  const [format, setFormat] = createSignal("gcode")
  const [description, setDescription] = createSignal(saved?.description ?? "")
  const [organizationId, setOrganizationId] = createSignal("")
  const [isPublic, setIsPublic] = createSignal(saved?.isPublic ?? false)
  const [organizations, setOrganizations] = createSignal<ReadonlyArray<{ readonly id: string; readonly name: string }>>([])
  const [projects, setProjects] = createSignal<ReadonlyArray<{ readonly id: string; readonly name: string }>>([])
  const [loading, setLoading] = createSignal(true)
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string>()
  const controller = new AbortController()
  let disposed = false
  // Retain the created destination on failure: a retry must not create duplicate projects.
  let createdTarget: { readonly projectId: string; readonly drawingId: string } | undefined
  onCleanup(() => { disposed = true; controller.abort() })
  onMount(() => {
    void app.runtime.run(app.client.projects.list(), { signal: controller.signal }).then(
      (rows) => { if (!disposed) setProjects(rows.map(({ id, name }) => ({ id, name }))) },
      (cause) => { if (!disposed) setError(cause instanceof Error ? cause.message : String(cause)) }
    ).finally(() => { if (!disposed) setLoading(false) })
    void app.runtime.run(app.client.organizations.list(), { signal: controller.signal }).then(
      (rows) => { if (!disposed) setOrganizations(rows.map(({ id, name }) => ({ id, name }))) },
      (cause) => { if (!disposed) setError(cause instanceof Error ? cause.message : String(cause)) }
    )
  })
  const close = (): void => { if (!busy()) props.onClose() }
  const filename = (): string => name().trim().replace(/[\\/:*?"<>|]/g, "-") || "toolpath"

  const exportToolpath = async (): Promise<void> => {
    setBusy(true); setError(undefined)
    try {
      const snapshot = await snapshotCamProgram(app, props.code)
      if (!disposed) { downloadCamFile(JSON.stringify(Schema.encodeSync(SavedCamProgram)(snapshot), null, 2), `${filename()}.cam.json`, "application/json"); props.onClose() }
    } catch (cause) { if (!disposed) setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { if (!disposed) setBusy(false) }
  }

  const save = async (): Promise<void> => {
    if (busy() || !props.code.trim() || !name().trim()) return
    const selectedMode = mode(), selectedProject = projectId(), title = name().trim(), newName = projectName().trim()
    if (selectedMode === "existing" && !selectedProject || selectedMode === "new" && !newName) return
    setBusy(true); setError(undefined)
    try {
      const snapshot = await snapshotCamProgram(app, props.code)
      const settings = snapshot.settings
      let targetProject = selectedProject, targetDrawing: string | null = null
      if (selectedMode === "new") {
        if (!createdTarget) {
          const project = await app.runtime.run(app.client.projects.create({ payload: { name: newName, description: description().trim() || null, organizationId: organizationId() || null, isPublic: isPublic() } }))
          // Remember the project immediately, including when drawing creation fails.
          createdTarget = { projectId: project.id, drawingId: "" }
        }
        if (!createdTarget.drawingId) {
          const drawing = await app.runtime.run(app.client.drawings.createForProject({ params: { id: createdTarget.projectId }, payload: { name: newName, data: snapshot.drawing } }))
          createdTarget = { ...createdTarget, drawingId: drawing.id }
        }
        targetProject = createdTarget.projectId; targetDrawing = createdTarget.drawingId
      } else if (selectedMode === "existing" && selectedProject === owner.projectId) {
        targetDrawing = owner.drawingId
      }
      const base = { name: title, description: description().trim() || null, isPublic: isPublic(), gcode: snapshot.gcode, type: settings.machineType, operationType: snapshot.kernelArtifact ? "kernel" : (snapshot.operations?.length ?? 0) > 1 ? "multi-operation" : settings.operationType }
      let row
      if (selectedMode === "update" && saved) {
        const previous = await app.runtime.run(app.client.toolpaths.get({ params: { id: saved.id } }))
        // Preserve the previous complete program before replacing it; the detail screen can restore this version.
        await app.runtime.run(app.client.toolpathExtras.createVersion({ params: { id: saved.id }, payload: { data: previous.data, gcode: previous.gcode ?? "", changeMessage: t("cam.save.previousVersion") } }))
        row = await app.runtime.run(app.client.toolpaths.update({ params: { id: saved.id }, payload: { ...base, data: savedProgramData(previous.data, snapshot) } }))
      } else {
        const payload = { ...base, projectId: targetProject, data: savedProgramData(undefined, snapshot) }
        row = targetDrawing
          ? await app.runtime.run(app.client.toolpaths.createForDrawing({ params: { id: targetDrawing }, payload }))
          : await app.runtime.run(app.client.toolpaths.create({ payload }))
      }
      invalidatePrefix(app.cache, "toolpaths")
      invalidatePrefix(app.cache, "projects")
      if (!disposed && owner.current() && store.gcode === snapshot.gcode) {
        if (selectedMode === "new" && createdTarget) useDocumentStore.getState().setDocument({ ...createdTarget, name: newName })
        store.setSavedProgram({ id: row.id, name: row.name, projectId: row.projectId, drawingId: row.drawingId, description: row.description, isPublic: row.isPublic })
      }
      if (!disposed) { toast.success(t("cam.save.saved")); props.onClose() }
    } catch (cause) {
      if (!disposed) setError(`${cause instanceof Error ? cause.message : String(cause)}${createdTarget ? ` (${t("cam.save.createdProject", { id: createdTarget.projectId })})` : ""}`)
    } finally { if (!disposed) setBusy(false) }
  }

  const elements = useElementsStore(), cad = useCADStore()
  const summary = createMemo(() => {
    const artifact = store.kernelArtifact?.nc === props.code ? store.kernelArtifact : undefined
    const operations = store.operationResults.length && combineOperationResults(store.operationResults).gcode === props.code ? store.operationResults : []
    const program = artifact?.program ?? store.program
    return [
      { label: t("save.contentType"), value: t("save.camProgram") },
      { label: t("save.elements"), value: elements.elements.length },
      { label: t("save.ncLines"), value: props.code.split("\n").length },
      { label: t("save.dataSize"), value: `${new TextEncoder().encode(props.code).length.toLocaleString()} B` },
      { label: t("save.toolpaths"), value: program.toolpaths.length },
      { label: t("save.moves"), value: program.toolpaths.reduce((sum, path) => sum + path.moves.length, 0) },
      { label: t("save.tools"), value: artifact ? artifact.tools.map((tool) => `T${tool.number} ${tool.name}`).join(", ") : [...new Set(program.toolpaths.map((path) => path.toolId))].join(", ") || t("save.none") },
      { label: t("save.operations"), value: artifact?.operations.map((operation) => operation.name).join(", ") || operations.map((operation) => operation.name).join(", ") || t("save.notSet") },
      { label: t("save.material"), value: artifact?.material.name ?? cad.workpiece.material ?? t("save.notSet") },
      { label: t("save.machine"), value: artifact?.machine.name ?? t("save.notSet") },
      { label: t("save.stock"), value: artifact ? `${artifact.stockBounds.max.x - artifact.stockBounds.min.x} × ${artifact.stockBounds.max.y - artifact.stockBounds.min.y} × ${artifact.stockBounds.max.z - artifact.stockBounds.min.z} mm` : `${cad.workpiece.width} × ${cad.workpiece.height} × ${cad.workpiece.depth} mm` },
      { label: t("save.units"), value: program.units },
      { label: t("save.workOffset"), value: program.workOffset },
      { label: t("save.verification"), value: artifact?.release ?? (store.kernelArtifact ? t("save.staleNc") : t("save.unverified")) },
      ...(artifact ? [
        { label: t("save.cycleTime"), value: `${artifact.cycleTimeSeconds} s` },
        { label: t("save.claims"), value: artifact.claims.map((claim) => `${claim.id}: ${claim.status}`).join(", ") },
        { label: t("save.issues"), value: artifact.issues.map((issue) => issue.message).join("; ") || t("save.none") },
        { label: t("save.ncIdentity"), value: artifact.identity.nc }
      ] : []),
      ...(saved ? [{ label: t("save.savedProgram"), value: saved.id }] : [])
    ]
  })
  const projectTitle = () => mode() === "new" ? projectName() : mode() === "update" ? projects().find((project) => project.id === saved?.projectId)?.name ?? saved?.projectId ?? "" : projects().find((project) => project.id === projectId())?.name ?? ""
  return <>
    <WorkspaceExportDialog open={!showProject()} title={t("cam.save.exportTitle")} name={name()} onName={setName} format={format()} onFormat={setFormat}
      formats={[{ id: "gcode", label: `G-code (${props.extension})` }, { id: "toolpath", label: t("cam.save.formatToolpath") }]}
      projectBody={t("cam.save.projectBody")} onProject={() => setShowProject(true)} onClose={close} busy={busy()} error={error()}
      onExport={() => { if (format() === "toolpath") void exportToolpath(); else { downloadCamFile(props.code, `${filename()}${props.extension}`, "text/plain"); props.onClose() } }} />
    <WorkspaceProjectDialog open={showProject()} name={projectTitle()} onName={setProjectName} nameReadOnly={mode() !== "new" || !!createdTarget}
      description={description()} onDescription={setDescription} organizationId={organizationId()} onOrganization={setOrganizationId} isPublic={isPublic()} onPublic={setIsPublic}
      organizations={organizations()} summary={summary()} busy={busy()} error={error()} onSubmit={() => void save()}
      canSave={!!name().trim() && (mode() === "existing" ? !!projectId() && !loading() : mode() === "new" ? !!projectName().trim() : !!saved)}
      onClose={() => { if (!busy()) { if (props.projectOnly) props.onClose(); else setShowProject(false) } }}
      controls={<>
        <label class="mb-4 block space-y-1 text-sm text-gray-700 dark:text-gray-300"><span>{t("cam.save.destination")}</span><select class={FIELD} name="camSaveDestination" disabled={busy()} value={mode()} onChange={(event) => setMode(event.currentTarget.value as "existing" | "new" | "update")}>
          <Show when={saved}><option value="update">{t("cam.save.update")}</option></Show><option value="existing">{t("cam.save.existing")}</option><option value="new">{t("cam.save.new")}</option>
        </select></label>
        <Show when={mode() === "existing"}><label class="mb-4 block space-y-1 text-sm text-gray-700 dark:text-gray-300"><span>{t("cam.save.project")}</span><select class={FIELD} name="camSaveProject" value={loading() ? "" : projectId()} disabled={busy() || loading()} onChange={(event) => setProjectId(event.currentTarget.value)}>
          <option value="">{t(loading() ? "cam.save.loading" : "cam.save.chooseProject")}</option><For each={projects()}>{(project) => <option value={project.id}>{project.name}</option>}</For>
        </select></label></Show>
        <label class="mb-4 block space-y-1 text-sm text-gray-700 dark:text-gray-300"><span>{t("cam.save.name")}</span><input class={FIELD} name="camProgramName" value={name()} disabled={busy()} onInput={(event) => setName(event.currentTarget.value)} /></label>
      </>}
      afterFields={<div class="space-y-2 text-sm">
        <Show when={mode() === "new"}><p class="text-xs text-gray-500 dark:text-gray-400">{t("cam.save.newHint")}</p></Show>
        <Show when={mode() === "update"}><p class="text-xs text-gray-500 dark:text-gray-400">{t("cam.save.versionHint")}</p></Show>
        <Show when={saved}>{(value) => <A href={`/toolpaths/${value().id}`} class="text-blue-600 dark:text-blue-400" onClick={(event) => { if (busy()) event.preventDefault() }}>{t("cam.save.manage")}</A>}</Show>
      </div>} />
  </>
}
