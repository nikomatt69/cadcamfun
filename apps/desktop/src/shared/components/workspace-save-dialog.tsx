import { For, Show, type JSX } from "solid-js"
import { FolderPlus, Save, Users } from "lucide-solid"
import { Modal } from "../ui/modal.tsx"
import { t } from "../../i18n/index.ts"

export const SAVE_FIELD = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400"
const LABEL = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
const SECONDARY = "px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:opacity-50"
const PRIMARY = "px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
const FOOTER = "sticky bottom-0 px-6 py-4 bg-gray-50 dark:bg-gray-700/50 backdrop-blur-sm border-t border-gray-200 dark:border-gray-600 flex justify-end space-x-3 rounded-b-lg"

export interface SaveSummaryRow { readonly label: string; readonly value: string | number }

export function SaveContentsSummary(props: { readonly rows: ReadonlyArray<SaveSummaryRow> }): JSX.Element {
  return <details open class="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-900/40" data-testid="save-contents-summary">
    <summary class="cursor-pointer font-medium text-gray-900 dark:text-gray-100">{t("save.contents")}</summary>
    <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
      <For each={props.rows}>{(row) => <><dt class="text-gray-500 dark:text-gray-400">{row.label}</dt><dd class="break-words text-right text-gray-800 dark:text-gray-200">{row.value}</dd></>}</For>
    </dl>
  </details>
}

/** CAD and CAM share the exact export layout shown by the owner. */
export function WorkspaceExportDialog(props: {
  readonly open: boolean; readonly title: string; readonly name: string; readonly onName: (value: string) => void;
  readonly format: string; readonly onFormat: (value: string) => void; readonly formats: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  readonly projectBody: string; readonly onProject: () => void; readonly onExport: () => void; readonly onClose: () => void;
  readonly busy?: boolean; readonly error?: string | undefined
}): JSX.Element {
  return <Modal open={props.open} variant="workspace" title={props.title} onClose={props.onClose}>
    <div class="px-6 py-4" data-testid="workspace-export-dialog">
      <div class="mb-4"><label for="fileName" class={LABEL}>{t("cad.importExport.fileName")}</label><input id="fileName" name="fileName" class={SAVE_FIELD} value={props.name} disabled={props.busy} onInput={(event) => props.onName(event.currentTarget.value)} /></div>
      <div class="mb-4"><label for="fileFormat" class={LABEL}>{t("cad.importExport.fileFormat")}</label><select id="fileFormat" name="fileFormat" class={SAVE_FIELD} value={props.format} disabled={props.busy} onChange={(event) => props.onFormat(event.currentTarget.value)}><For each={props.formats}>{(format) => <option value={format.id}>{format.label}</option>}</For></select></div>
      <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-md p-4 flex items-start mb-4">
        <div class="flex-shrink-0"><FolderPlus class="h-5 w-5 text-blue-400 dark:text-blue-300" /></div>
        <div class="ml-3"><h3 class="text-sm font-medium text-blue-800 dark:text-blue-200">{t("cad.importExport.saveAsProject")}</h3><div class="mt-2 text-sm text-blue-700 dark:text-blue-300"><p>{props.projectBody}</p><button type="button" data-testid="workspace-save-as-project" onClick={props.onProject} disabled={props.busy} class="mt-1 text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors">{t("cad.importExport.saveAsProject")}</button></div></div>
      </div>
      <Show when={props.error}><p role="alert" class="text-sm text-red-600 dark:text-red-400">{props.error}</p></Show>
    </div>
    <div class={FOOTER}><button type="button" class={SECONDARY} onClick={props.onClose} disabled={props.busy}>{t("common.cancel")}</button><button type="button" data-testid="workspace-export-file" onClick={props.onExport} class={PRIMARY} disabled={props.busy || !props.name.trim()}><span class="flex items-center"><Save size={18} class="mr-1.5" />{t(props.busy ? "save.exporting" : "cad.importExport.exportFile")}</span></button></div>
  </Modal>
}

/** One form owns the common project fields, visual structure and contents summary for both editors. */
export function WorkspaceProjectDialog(props: {
  readonly open: boolean; readonly name: string; readonly onName: (value: string) => void; readonly nameReadOnly?: boolean;
  readonly description: string; readonly onDescription: (value: string) => void;
  readonly organizationId: string; readonly onOrganization: (value: string) => void;
  readonly isPublic: boolean; readonly onPublic: (value: boolean) => void;
  readonly organizations: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly summary: ReadonlyArray<SaveSummaryRow>; readonly controls?: JSX.Element; readonly afterFields?: JSX.Element;
  readonly busy: boolean; readonly canSave: boolean; readonly error?: string | null | undefined;
  readonly onSubmit: () => void; readonly onClose: () => void
}): JSX.Element {
  return <Modal open={props.open} variant="workspace" title={t("cad.importExport.saveAsProject")} onClose={props.onClose}>
    <form onSubmit={(event) => { event.preventDefault(); props.onSubmit() }} data-testid="workspace-project-dialog">
      <div class="px-6 py-4">
        <Show when={props.error}><div role="alert" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-md p-3 mb-4 text-sm text-red-700 dark:text-red-300">{props.error}</div></Show>
        {props.controls}
        <div class="mb-4"><label for="projectName" class={LABEL}>{t("save.projectName")} <span class="text-red-500">*</span></label><input id="projectName" name="projectName" type="text" class={SAVE_FIELD} value={props.name} disabled={props.busy} readOnly={props.nameReadOnly} onInput={(event) => props.onName(event.currentTarget.value)} required placeholder={t("save.projectNamePlaceholder")} /></div>
        <div class="mb-4"><label for="description" class={LABEL}>{t("save.description")}</label><textarea id="description" name="description" rows={3} class={SAVE_FIELD} value={props.description} disabled={props.busy} onInput={(event) => props.onDescription(event.currentTarget.value)} placeholder={t("save.descriptionPlaceholder")} /></div>
        <div class="mb-4"><label for="organization" class={LABEL}>{t("save.organization")}</label><div class="relative"><Users size={18} class="absolute left-3 top-3 text-gray-400" /><select id="organization" name="organization" class={`${SAVE_FIELD} pl-10`} value={props.organizationId} disabled={props.busy || props.nameReadOnly} onChange={(event) => props.onOrganization(event.currentTarget.value)}><option value="">{t("save.personalProject")}</option><For each={props.organizations}>{(org) => <option value={org.id}>{org.name}</option>}</For></select></div></div>
        <label class="mb-4 flex items-start gap-3 text-sm"><input id="public" name="public" type="checkbox" checked={props.isPublic} disabled={props.busy} onChange={(event) => props.onPublic(event.currentTarget.checked)} class="mt-0.5 h-4 w-4 rounded border-gray-300 bg-white text-blue-600 dark:border-gray-600 dark:bg-gray-700" /><span><span class="font-medium text-gray-700 dark:text-gray-300">{t("save.publicProject")}</span><span class="block text-gray-500 dark:text-gray-400">{t("save.publicHint")}</span></span></label>
        <SaveContentsSummary rows={props.summary} />
        {props.afterFields}
      </div>
      <div class={FOOTER}><button type="button" class={SECONDARY} onClick={props.onClose} disabled={props.busy}>{t("common.cancel")}</button><button type="submit" data-testid="workspace-save-project" class={PRIMARY} disabled={props.busy || !props.canSave}><span class="flex items-center"><Save size={18} class="mr-1.5" />{t(props.busy ? "cam.save.saving" : "cad.importExport.saveAsProject")}</span></button></div>
    </form>
  </Modal>
}
