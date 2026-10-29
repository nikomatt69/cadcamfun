import { createMemo, createSignal, type JSX } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { useApp } from "../../../shared/state/context.ts"
import { saveCADAsProject, drawingPayload } from "../lib/saveCADAsProject.ts"

import { WorkspaceProjectDialog } from "../../../shared/components/workspace-save-dialog.tsx"
import { t } from "../../../i18n/index.ts"
import { useElementsStore } from "../store/elementsStore.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { useCADStore } from "../store/cadStore.ts"

interface Props { readonly isOpen: boolean; onClose(): void; readonly organizations?: ReadonlyArray<{ id: string; name: string }> }

/** "Save as Project": names the project, picks an organization, and stores the drawing in it. */
export default function SaveCADAsProjectModal(props: Props): JSX.Element {
  const app = useApp()
  const navigate = useNavigate()
  const [name, setName] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [organizationId, setOrganizationId] = createSignal("")
  const [isPublic, setIsPublic] = createSignal(false)
  const [submitting, setSubmitting] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    if (!name().trim()) { setError("Project name is required"); setSubmitting(false); return }
    try {
      const result = await saveCADAsProject(app, { name: name(), description: description(), organizationId: organizationId() || undefined, isPublic: isPublic() })
      setSubmitting(false)
      props.onClose()
      navigate(`/projects/${result.projectId}`)
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : t("cad.saveProject.failed"))
      setSubmitting(false)
    }
  }

  const elements = useElementsStore(), layers = useLayerStore(), cad = useCADStore()
  const summary = createMemo(() => [
    { label: t("save.contentType"), value: t("save.cadDrawing") },
    { label: t("save.elements"), value: elements.elements.length },
    { label: t("save.layers"), value: layers.layers.length },
    { label: t("save.selection"), value: elements.selectedElement?.name ?? elements.selectedElement?.id ?? t("save.none") },
    { label: t("save.units"), value: app.settings.settings().units },
    { label: t("save.tolerance"), value: `${cad.tolerance} mm` },
    { label: t("save.stock"), value: `${cad.workpiece.width} × ${cad.workpiece.height} × ${cad.workpiece.depth} mm` },
    { label: t("save.material"), value: cad.workpiece.material || t("save.notSet") },
    { label: t("save.dataSize"), value: `${new TextEncoder().encode(JSON.stringify(drawingPayload(app))).length.toLocaleString()} B` }
  ])
  return (
    <WorkspaceProjectDialog open={props.isOpen} name={name()} onName={setName} description={description()} onDescription={setDescription}
      organizationId={organizationId()} onOrganization={setOrganizationId} isPublic={isPublic()} onPublic={setIsPublic}
      organizations={props.organizations ?? []} summary={summary()} busy={submitting()} canSave={!!name().trim() && elements.elements.length > 0}
      error={error()} onSubmit={() => void submit()} onClose={() => { if (!submitting()) props.onClose() }} />
  )
}
