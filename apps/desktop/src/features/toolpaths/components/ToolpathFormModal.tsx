/**
 * Create / edit form for a toolpath (legacy "Create New Toolpath" / "Edit Toolpath" modal). The operation list
 * follows the machine type, as the legacy selects did; the project is required on create.
 */
import { For, Show, createEffect, createSignal, on, type JSX } from "solid-js"
import { Modal, OPERATIONS_BY_TYPE, OPERATION_LABEL, TYPE_LABEL, type ToolpathRow } from "./shared.tsx"
import { t } from "../../../i18n/index.ts"

export interface ToolpathFormValue {
  readonly name: string
  readonly description: string | null
  readonly type: string
  readonly operationType: string
  readonly projectId: string
  readonly isPublic: boolean
  readonly gcode: string
}

export interface ToolpathFormModalProps {
  readonly open: boolean
  /** The toolpath being edited; `undefined` means create. */
  readonly row: ToolpathRow | undefined
  readonly projects: ReadonlyArray<{ readonly id: string; readonly name: string }>
  readonly defaultProjectId: string
  readonly busy: boolean
  readonly onClose: () => void
  readonly onSubmit: (value: ToolpathFormValue) => void | Promise<void>
}

const INPUT = "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
const LABEL = "mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"

export function ToolpathFormModal(props: ToolpathFormModalProps): JSX.Element {
  const [name, setName] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [type, setType] = createSignal("mill")
  const [operationType, setOperationType] = createSignal("contour")
  const [projectId, setProjectId] = createSignal("")
  const [isPublic, setIsPublic] = createSignal(false)

  // Reset the form whenever the dialog opens (or switches between create and edit).
  createEffect(on(() => [props.open, props.row?.id] as const, ([open]) => {
    if (!open) return
    const row = props.row
    setName(row?.name ?? "")
    setDescription(row?.description ?? "")
    setType(row?.type ?? t("pages.mill"))
    setOperationType(row?.operationType ?? t("cam.strategy.contour"))
    setProjectId(row?.projectId ?? props.defaultProjectId)
    setIsPublic(row?.isPublic ?? false)
  }, { defer: true }))

  // Keep the operation valid for the chosen machine type.
  createEffect(on(type, (next) => {
    const allowed = OPERATIONS_BY_TYPE[next] ?? []
    if (!allowed.includes(operationType()) && operationType() !== "multi-operation" && operationType() !== "kernel") setOperationType(allowed[0] ?? t("cam.strategy.contour"))
  }, { defer: true }))

  const submit = (event: Event): void => {
    event.preventDefault()
    if (projectId() === "") return
    void props.onSubmit({
      name: name().trim(),
      description: description() === "" ? null : description(),
      type: type(),
      operationType: operationType(),
      projectId: projectId(),
      isPublic: isPublic(),
      gcode: props.row?.gcode ?? ""
    })
  }

  return (
    <Modal open={props.open} title={props.row ? t("pages.edit.toolpath") : t("pages.create.new.toolpath")} onClose={props.onClose}>
      <form onSubmit={submit} class="space-y-4">
        <div>
          <label for="toolpath-name" class={LABEL}>{t("pages.toolpath.name")}</label>
          <input id="toolpath-name" name="name" type="text" class={INPUT} required value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        </div>
        <div>
          <label for="toolpath-description" class={LABEL}>{t("org.modal.descriptionLabel")}</label>
          <textarea id="toolpath-description" name="description" rows={3} class={INPUT} value={description()} onInput={(e) => setDescription(e.currentTarget.value)} />
        </div>
        <div>
          <label for="toolpath-type" class={LABEL}>{t("pages.machine.type")}</label>
          <select id="toolpath-type" name="type" class={INPUT} value={type()} onChange={(e) => setType(e.currentTarget.value)}>
            <For each={Object.keys(TYPE_LABEL)}>{(value) => <option value={value}>{TYPE_LABEL[value]}</option>}</For>
          </select>
        </div>
        <div>
          <label for="toolpath-operation" class={LABEL}>{t("pages.operation.type")}</label>
          <select id="toolpath-operation" name="operationType" class={INPUT} value={operationType()} onChange={(e) => setOperationType(e.currentTarget.value)}>
            <Show when={props.row?.operationType === "multi-operation" || props.row?.operationType === "kernel"}><option value={props.row!.operationType!}>{OPERATION_LABEL[props.row!.operationType!]}</option></Show>
            <For each={OPERATIONS_BY_TYPE[type()] ?? []}>{(value) => <option value={value}>{OPERATION_LABEL[value]}</option>}</For>
          </select>
        </div>
        <div>
          <label for="toolpath-project" class={LABEL}>{t("cam.save.project")}</label>
          <select id="toolpath-project" name="projectId" class={INPUT} required value={projectId()} onChange={(e) => setProjectId(e.currentTarget.value)}>
            <option value="" disabled>{t("legacy.selectProject")}</option>
            <For each={props.projects}>{(project) => <option value={project.id}>{project.name}</option>}</For>
          </select>
        </div>
        <div class="flex items-center">
          <input id="toolpath-public" name="isPublic" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-700" checked={isPublic()} onChange={(e) => setIsPublic(e.currentTarget.checked)} />
          <label for="toolpath-public" class="ml-2 block text-sm text-gray-900 dark:text-gray-300">{t("pages.make.toolpath.public.visible.to.all.users")}</label>
        </div>
        <Show when={!props.row}>
          <p class="text-xs text-gray-500 dark:text-gray-400">{t("pages.the.g.code.is.generated.in.the.cam.page.and.saved.to.the.toolpath.from.there")}</p>
        </Show>
        <div class="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
          <button type="button" class="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800" onClick={() => props.onClose()}>{t("common.cancel")}</button>
          <button type="submit" class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50" disabled={props.busy || projectId() === ""}>
            {props.busy ? t("mcp.form.saving") : props.row ? "Update" : t("keys.group.create")}
          </button>
        </div>
      </form>
    </Modal>
  )
}
